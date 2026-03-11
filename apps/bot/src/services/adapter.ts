import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { errorToMessage, logEvent } from '../logger';
import type {
  AdapterHealthReport,
  ClaimContext,
  ClaimReminderSnapshot,
  ClaimPayload,
  ReviewEvent,
  RequesterContext,
  SpendPayload,
  XpSummary,
} from '../types';

export interface TrackerAdapter {
  getSummary(characterName: string, requester: RequesterContext): Promise<XpSummary | null>;
  getClaimContext(requester: RequesterContext, opts?: { forceRefresh?: boolean }): Promise<ClaimContext>;
  getClaimReminderTargets(): Promise<ClaimReminderSnapshot>;
  getReviewEvents(opts?: {
    sinceEpoch?: number;
    sinceEventKey?: string;
    limit?: number;
  }): Promise<{ events: ReviewEvent[]; hasMore: boolean }>;
  autoCreatePeriod(): Promise<{ ok: boolean; created: boolean; reason?: string; periodLabel?: string }>;
  submitClaim(payload: ClaimPayload): Promise<{ ok: boolean; message: string }>;
  submitSpend(payload: SpendPayload): Promise<{ ok: boolean; message: string }>;
  getHealthReport(requester: RequesterContext): Promise<AdapterHealthReport>;
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

const reviewEventSchema = z.discriminatedUnion('kind', [
  z.object({
    eventKey: z.string(),
    kind: z.literal('claim'),
    rowIndex: z.number(),
    characterName: z.string(),
    playerDiscordId: z.string().optional(),
    status: z.enum(['approved', 'denied']),
    reviewedBy: z.string(),
    reviewDate: z.string(),
    reviewedAtEpoch: z.number(),
    staffNotes: z.string(),
    playPeriod: z.string(),
    requestedXp: z.number(),
    approvedXp: z.number(),
  }),
  z.object({
    eventKey: z.string(),
    kind: z.literal('spend'),
    rowIndex: z.number(),
    characterName: z.string(),
    playerDiscordId: z.string().optional(),
    status: z.enum(['approved', 'denied']),
    reviewedBy: z.string(),
    reviewDate: z.string(),
    reviewedAtEpoch: z.number(),
    staffNotes: z.string(),
    spendCategory: z.string(),
    traitName: z.string(),
    currentDots: z.number(),
    newDots: z.number(),
    requestedCost: z.number(),
    verifiedCost: z.number(),
  }),
]);

const reviewEventsSchema = z.object({
  events: z.array(reviewEventSchema),
  hasMore: z.boolean().optional(),
});

const claimReminderTargetsSchema = z.object({
  currentNight: z.string().nullable(),
  targets: z.array(
    z.object({
      discordId: z.string(),
      characterName: z.string(),
    }),
  ),
});

const autoCreatePeriodSchema = z.object({
  created: z.boolean(),
  reason: z.string().optional(),
  periodLabel: z.string().optional(),
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
  private claimContextCache = new Map<string, { value: ClaimContext; fetchedAt: number }>();
  private claimContextInFlight = new Map<string, Promise<ClaimContextResult>>();
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

  async getSummary(characterName: string, requester: RequesterContext): Promise<XpSummary | null> {
    const params = new URLSearchParams({ requesterDiscordId: requester.requesterDiscordId });
    if (requester.requesterDiscordName) {
      params.set('requesterDiscordName', requester.requesterDiscordName);
    }
    if (requester.testMode) {
      params.set('testMode', 'true');
    }
    if (requester.testAsDiscordId) {
      params.set('testAsDiscordId', requester.testAsDiscordId);
    }
    const url = `${this.baseUrl}/api/characters/${encodeURIComponent(characterName)}/summary?${params.toString()}`;
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

  async getClaimContext(requester: RequesterContext, opts: { forceRefresh?: boolean } = {}): Promise<ClaimContext> {
    const result = await this.getClaimContextResult(requester, opts.forceRefresh === true);
    return result.context;
  }

  async getClaimReminderTargets(): Promise<ClaimReminderSnapshot> {
    const resp = await this.fetchWithTimeout(`${this.baseUrl}/api/meta/claim-reminder-targets`, {
      headers: this.authHeaders(),
    }).catch(() => null);
    if (!resp) {
      throw new Error('Unable to reach web app claim-reminder-targets API.');
    }
    if (!resp.ok) {
      throw new Error(`Web app claim-reminder-targets API failed (${resp.status})`);
    }
    const raw = await resp.json();
    return claimReminderTargetsSchema.parse(raw);
  }

  async getReviewEvents(opts: {
    sinceEpoch?: number;
    sinceEventKey?: string;
    limit?: number;
  } = {}): Promise<{ events: ReviewEvent[]; hasMore: boolean }> {
    const params = new URLSearchParams();
    if (typeof opts.sinceEpoch === 'number' && Number.isFinite(opts.sinceEpoch) && opts.sinceEpoch > 0) {
      params.set('sinceEpoch', String(Math.floor(opts.sinceEpoch)));
    }
    if (typeof opts.limit === 'number' && Number.isFinite(opts.limit) && opts.limit > 0) {
      params.set('limit', String(Math.floor(opts.limit)));
    }
    if (opts.sinceEventKey) {
      params.set('sinceEventKey', opts.sinceEventKey);
    }

    const query = params.toString();
    const url = `${this.baseUrl}/api/review-events${query ? `?${query}` : ''}`;
    const resp = await this.fetchWithTimeout(url, {
      headers: this.authHeaders(),
    }).catch(() => null);

    if (!resp) {
      throw new Error('Unable to reach web app review-events API.');
    }
    if (!resp.ok) {
      throw new Error(`Web app review-events API failed (${resp.status})`);
    }

    const raw = await resp.json();
    const parsed = reviewEventsSchema.parse(raw);
    return { events: parsed.events, hasMore: parsed.hasMore === true };
  }

  async autoCreatePeriod(): Promise<{ ok: boolean; created: boolean; reason?: string; periodLabel?: string }> {
    const requestTimestamp = Math.floor(Date.now() / 1000).toString();
    const requestNonce = randomUUID();
    const resp = await this.fetchWithTimeout(`${this.baseUrl}/api/periods/auto-create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Request-Timestamp': requestTimestamp,
        'X-Request-Nonce': requestNonce,
        ...this.authHeaders(),
      },
      body: JSON.stringify({}),
    }).catch(() => null);

    if (!resp) {
      return { ok: false, created: false, reason: 'unreachable' };
    }
    if (!resp.ok) {
      return { ok: false, created: false, reason: `http_${resp.status}` };
    }
    const raw = await resp.json();
    const parsed = autoCreatePeriodSchema.parse(raw);
    return {
      ok: true,
      created: parsed.created,
      reason: parsed.reason,
      periodLabel: parsed.periodLabel,
    };
  }

  async submitClaim(payload: ClaimPayload): Promise<{ ok: boolean; message: string }> {
    return this.post('/api/claims', payload, 'Claim submitted to web app API.');
  }

  async submitSpend(payload: SpendPayload): Promise<{ ok: boolean; message: string }> {
    return this.post('/api/spends', payload, 'Spend request submitted to web app API.');
  }

  async getHealthReport(requester: RequesterContext): Promise<AdapterHealthReport> {
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
      const result = await this.getClaimContextResult(requester, true);
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
    const requestTimestamp = Math.floor(Date.now() / 1000).toString();
    const requestNonce = randomUUID();
    const resp = await this.fetchWithTimeout(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Request-Timestamp': requestTimestamp,
        'X-Request-Nonce': requestNonce,
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

  private getCacheAgeMs(requesterDiscordId: string): number {
    const cacheEntry = this.claimContextCache.get(requesterDiscordId);
    if (!cacheEntry) {
      return 0;
    }
    return Date.now() - cacheEntry.fetchedAt;
  }

  private async getClaimContextResult(requester: RequesterContext, forceRefresh = false): Promise<ClaimContextResult> {
    const cacheKey = requester.requesterDiscordId;
    const cached = this.claimContextCache.get(cacheKey);
    if (!forceRefresh && cached && this.getCacheAgeMs(cacheKey) <= this.claimContextCacheTtlMs) {
      return {
        context: cached.value,
        source: 'cache',
        retries: 0,
        latencyMs: 0,
        cacheAgeMs: this.getCacheAgeMs(cacheKey),
      };
    }

    const inFlight = this.claimContextInFlight.get(cacheKey);
    if (inFlight) {
      return inFlight;
    }

    const request = this.fetchClaimContextWithRetry(requester)
      .then((fresh) => {
        this.claimContextCache.set(cacheKey, { value: fresh.context, fetchedAt: Date.now() });
        return fresh;
      })
      .catch((error) => {
        const stale = this.claimContextCache.get(cacheKey);
        if (stale && this.getCacheAgeMs(cacheKey) <= this.claimContextStaleIfErrorMs) {
          logEvent('warn', 'claim_context_stale_cache_fallback', {
            error: errorToMessage(error),
            cacheAgeMs: this.getCacheAgeMs(cacheKey),
          });
          return {
            context: stale.value,
            source: 'stale-cache' as const,
            retries: this.claimContextMaxRetries,
            latencyMs: 0,
            cacheAgeMs: this.getCacheAgeMs(cacheKey),
          };
        }
        throw error;
      })
      .finally(() => {
        this.claimContextInFlight.delete(cacheKey);
      });

    this.claimContextInFlight.set(cacheKey, request);
    return request;
  }

  private async fetchClaimContextWithRetry(requester: RequesterContext): Promise<ClaimContextResult> {
    const startedAt = Date.now();
    let retries = 0;
    let lastError = 'Unknown error';

    for (let attempt = 0; attempt <= this.claimContextMaxRetries; attempt += 1) {
      try {
        const params = new URLSearchParams({ requesterDiscordId: requester.requesterDiscordId });
        if (requester.requesterDiscordName) {
          params.set('requesterDiscordName', requester.requesterDiscordName);
        }
        if (requester.testMode) {
          params.set('testMode', 'true');
        }
        if (requester.testAsDiscordId) {
          params.set('testAsDiscordId', requester.testAsDiscordId);
        }
        const resp = await this.fetchWithTimeout(`${this.baseUrl}/api/meta/claim-context?${params.toString()}`, {
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
