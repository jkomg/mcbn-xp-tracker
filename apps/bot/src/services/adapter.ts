import { z } from 'zod';
import { errorToMessage, logEvent } from '../logger';
import type { AdapterHealthReport, ClaimContext, ClaimPayload, SpendPayload, XpSummary } from '../types';

export interface TrackerAdapter {
  getSummary(characterName: string): Promise<XpSummary | null>;
  getClaimContext(opts?: { forceRefresh?: boolean }): Promise<ClaimContext>;
  submitClaim(payload: ClaimPayload): Promise<{ ok: boolean; message: string }>;
  submitSpend(payload: SpendPayload): Promise<{ ok: boolean; message: string }>;
  getHealthReport(): Promise<AdapterHealthReport>;
}

const summarySchema = z.object({
  characterName: z.string(),
  earnedXp: z.number(),
  totalXp: z.number(),
  totalSpends: z.number(),
  availableXp: z.number(),
});

const claimContextSchema = z.object({
  activeCharacters: z.array(z.string()),
  openPeriods: z.array(z.string()),
  currentNight: z.string().nullable(),
});

type AdapterOptions = {
  requestTimeoutMs?: number;
  claimContextCacheTtlMs?: number;
  claimContextStaleIfErrorMs?: number;
  claimContextMaxRetries?: number;
  claimContextRetryBaseMs?: number;
};

type ClaimContextResult = {
  context: ClaimContext;
  source: 'cache' | 'network' | 'stale-cache';
  retries: number;
  latencyMs: number;
  cacheAgeMs: number;
};

export class WebAppAdapter implements TrackerAdapter {
  private claimContextCache?: { value: ClaimContext; fetchedAt: number };
  private claimContextInFlight?: Promise<ClaimContextResult>;
  private readonly baseUrl: string;
  private readonly apiToken?: string;
  private readonly requestTimeoutMs: number;
  private readonly claimContextCacheTtlMs: number;
  private readonly claimContextStaleIfErrorMs: number;
  private readonly claimContextMaxRetries: number;
  private readonly claimContextRetryBaseMs: number;

  constructor(baseUrl: string, apiToken?: string, opts: AdapterOptions = {}) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.apiToken = apiToken;
    this.requestTimeoutMs = opts.requestTimeoutMs ?? 10_000;
    this.claimContextCacheTtlMs = opts.claimContextCacheTtlMs ?? 30_000;
    this.claimContextStaleIfErrorMs = opts.claimContextStaleIfErrorMs ?? 300_000;
    this.claimContextMaxRetries = opts.claimContextMaxRetries ?? 2;
    this.claimContextRetryBaseMs = opts.claimContextRetryBaseMs ?? 250;
  }

  async getSummary(characterName: string): Promise<XpSummary | null> {
    const url = `${this.baseUrl}/api/characters/${encodeURIComponent(characterName)}/summary`;
    const resp = await this.fetchWithTimeout(url, {
      headers: this.authHeaders(),
    }).catch(() => null);

    if (!resp || resp.status === 404) {
      return null;
    }

    if (!resp.ok) {
      throw new Error(`Web app summary API failed (${resp.status})`);
    }

    const raw = await resp.json();
    return summarySchema.parse(raw);
  }

  async getClaimContext(opts: { forceRefresh?: boolean } = {}): Promise<ClaimContext> {
    const result = await this.getClaimContextResult(opts.forceRefresh === true);
    return result.context;
  }

  async submitClaim(payload: ClaimPayload): Promise<{ ok: boolean; message: string }> {
    return this.post('/api/claims', payload, 'Claim submitted to web app API.');
  }

  async submitSpend(payload: SpendPayload): Promise<{ ok: boolean; message: string }> {
    return this.post('/api/spends', payload, 'Spend request submitted to web app API.');
  }

  async getHealthReport(): Promise<AdapterHealthReport> {
    const now = new Date().toISOString();
    const healthStart = Date.now();
    let webApi: AdapterHealthReport['webApi'];

    try {
      const resp = await this.fetchWithTimeout(`${this.baseUrl}/api/health`, {
        headers: this.authHeaders(),
      });
      webApi = {
        ok: resp.ok,
        status: resp.status,
        latencyMs: Date.now() - healthStart,
      };
    } catch (error) {
      webApi = {
        ok: false,
        latencyMs: Date.now() - healthStart,
        error: errorToMessage(error),
      };
    }

    let claimContext: AdapterHealthReport['claimContext'];
    try {
      const result = await this.getClaimContextResult(true);
      claimContext = {
        ok: true,
        status: 200,
        latencyMs: result.latencyMs,
        source: result.source,
        retries: result.retries,
        cacheAgeMs: result.cacheAgeMs,
        activeCharacters: result.context.activeCharacters.length,
        openPeriods: result.context.openPeriods.length,
        currentNight: result.context.currentNight,
      };
    } catch (error) {
      claimContext = {
        ok: false,
        latencyMs: 0,
        error: errorToMessage(error),
      };
    }

    return {
      timestamp: now,
      webApi,
      claimContext,
    };
  }

  private async post(path: string, body: unknown, successMessage: string) {
    const resp = await this.fetchWithTimeout(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.authHeaders(),
      },
      body: JSON.stringify(body),
    }).catch(() => null);

    if (!resp) {
      return { ok: false, message: 'Unable to reach web app API.' };
    }

    if (!resp.ok) {
      const bodyPreview = await resp.text().then((v) => v.slice(0, 160)).catch(() => '');
      logEvent('warn', 'web_api_post_failed', { path, status: resp.status, bodyPreview });
      const message =
        resp.status >= 500
          ? 'Web API failed while processing the request. Please retry shortly.'
          : `Request was rejected by the web API (status ${resp.status}).`;
      return { ok: false, message };
    }

    return { ok: true, message: successMessage };
  }

  private getCacheAgeMs(): number {
    if (!this.claimContextCache) {
      return 0;
    }
    return Date.now() - this.claimContextCache.fetchedAt;
  }

  private async getClaimContextResult(forceRefresh = false): Promise<ClaimContextResult> {
    const cached = this.claimContextCache;
    if (!forceRefresh && cached && this.getCacheAgeMs() <= this.claimContextCacheTtlMs) {
      return {
        context: cached.value,
        source: 'cache',
        retries: 0,
        latencyMs: 0,
        cacheAgeMs: this.getCacheAgeMs(),
      };
    }

    if (this.claimContextInFlight) {
      return this.claimContextInFlight;
    }

    this.claimContextInFlight = this.fetchClaimContextWithRetry()
      .then((fresh) => {
        this.claimContextCache = { value: fresh.context, fetchedAt: Date.now() };
        return fresh;
      })
      .catch((error) => {
        const stale = this.claimContextCache;
        if (stale && this.getCacheAgeMs() <= this.claimContextStaleIfErrorMs) {
          logEvent('warn', 'claim_context_stale_cache_fallback', {
            error: errorToMessage(error),
            cacheAgeMs: this.getCacheAgeMs(),
          });
          return {
            context: stale.value,
            source: 'stale-cache' as const,
            retries: this.claimContextMaxRetries,
            latencyMs: 0,
            cacheAgeMs: this.getCacheAgeMs(),
          };
        }
        throw error;
      })
      .finally(() => {
        this.claimContextInFlight = undefined;
      });

    return this.claimContextInFlight;
  }

  private async fetchClaimContextWithRetry(): Promise<ClaimContextResult> {
    const startedAt = Date.now();
    let retries = 0;
    let lastError = 'Unknown error';

    for (let attempt = 0; attempt <= this.claimContextMaxRetries; attempt += 1) {
      try {
        const resp = await this.fetchWithTimeout(`${this.baseUrl}/api/meta/claim-context`, {
          headers: this.authHeaders(),
        });

        if (!resp.ok) {
          const statusError = `Claim context API failed (${resp.status})`;
          if (resp.status >= 500 && attempt < this.claimContextMaxRetries) {
            retries += 1;
            lastError = statusError;
            logEvent('warn', 'claim_context_retry', {
              attempt: attempt + 1,
              status: resp.status,
              waitMs: this.claimContextRetryBaseMs * 2 ** attempt,
            });
            await sleep(this.claimContextRetryBaseMs * 2 ** attempt);
            continue;
          }
          throw new Error(statusError);
        }

        const raw = await resp.json();
        const parsed = claimContextSchema.parse(raw);
        return {
          context: parsed,
          source: 'network',
          retries,
          latencyMs: Date.now() - startedAt,
          cacheAgeMs: 0,
        };
      } catch (error) {
        lastError = errorToMessage(error);
        if (attempt >= this.claimContextMaxRetries) {
          break;
        }
        retries += 1;
        logEvent('warn', 'claim_context_retry', {
          attempt: attempt + 1,
          error: lastError,
          waitMs: this.claimContextRetryBaseMs * 2 ** attempt,
        });
        await sleep(this.claimContextRetryBaseMs * 2 ** attempt);
      }
    }

    throw new Error(lastError || 'Unable to reach web app API.');
  }

  private authHeaders(): Record<string, string> {
    return this.apiToken ? { Authorization: `Bearer ${this.apiToken}` } : {};
  }

  private async fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.requestTimeoutMs);
    try {
      return await fetch(url, {
        ...init,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
