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

const CLAIM_CONTEXT_CACHE_TTL_MS = Number(process.env.CLAIM_CONTEXT_CACHE_TTL_MS ?? 30_000);
const CLAIM_CONTEXT_STALE_IF_ERROR_MS = Number(process.env.CLAIM_CONTEXT_STALE_IF_ERROR_MS ?? 300_000);
const CLAIM_CONTEXT_MAX_RETRIES = Number(process.env.CLAIM_CONTEXT_MAX_RETRIES ?? 2);
const CLAIM_CONTEXT_RETRY_BASE_MS = Number(process.env.CLAIM_CONTEXT_RETRY_BASE_MS ?? 250);

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

  constructor(private readonly baseUrl: string, private readonly apiToken?: string) {}

  async getSummary(characterName: string): Promise<XpSummary | null> {
    const url = `${this.baseUrl}/api/characters/${encodeURIComponent(characterName)}/summary`;
    const resp = await fetch(url, {
      headers: this.apiToken ? { Authorization: `Bearer ${this.apiToken}` } : {},
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
      const resp = await fetch(`${this.baseUrl}/api/health`, {
        headers: this.apiToken ? { Authorization: `Bearer ${this.apiToken}` } : {},
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
    const resp = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.apiToken ? { Authorization: `Bearer ${this.apiToken}` } : {}),
      },
      body: JSON.stringify(body),
    }).catch(() => null);

    if (!resp) {
      return { ok: false, message: 'Unable to reach web app API.' };
    }

    if (!resp.ok) {
      const text = await resp.text().catch(() => 'Unknown API error.');
      return { ok: false, message: `API error ${resp.status}: ${text}` };
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
    if (!forceRefresh && cached && this.getCacheAgeMs() <= CLAIM_CONTEXT_CACHE_TTL_MS) {
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
        if (stale && this.getCacheAgeMs() <= CLAIM_CONTEXT_STALE_IF_ERROR_MS) {
          logEvent('warn', 'claim_context_stale_cache_fallback', {
            error: errorToMessage(error),
            cacheAgeMs: this.getCacheAgeMs(),
          });
          return {
            context: stale.value,
            source: 'stale-cache' as const,
            retries: CLAIM_CONTEXT_MAX_RETRIES,
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

    for (let attempt = 0; attempt <= CLAIM_CONTEXT_MAX_RETRIES; attempt += 1) {
      try {
        const resp = await fetch(`${this.baseUrl}/api/meta/claim-context`, {
          headers: this.apiToken ? { Authorization: `Bearer ${this.apiToken}` } : {},
        });

        if (!resp.ok) {
          const statusError = `Claim context API failed (${resp.status})`;
          if (resp.status >= 500 && attempt < CLAIM_CONTEXT_MAX_RETRIES) {
            retries += 1;
            lastError = statusError;
            logEvent('warn', 'claim_context_retry', {
              attempt: attempt + 1,
              status: resp.status,
              waitMs: CLAIM_CONTEXT_RETRY_BASE_MS * 2 ** attempt,
            });
            await sleep(CLAIM_CONTEXT_RETRY_BASE_MS * 2 ** attempt);
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
        if (attempt >= CLAIM_CONTEXT_MAX_RETRIES) {
          break;
        }
        retries += 1;
        logEvent('warn', 'claim_context_retry', {
          attempt: attempt + 1,
          error: lastError,
          waitMs: CLAIM_CONTEXT_RETRY_BASE_MS * 2 ** attempt,
        });
        await sleep(CLAIM_CONTEXT_RETRY_BASE_MS * 2 ** attempt);
      }
    }

    throw new Error(lastError || 'Unable to reach web app API.');
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
