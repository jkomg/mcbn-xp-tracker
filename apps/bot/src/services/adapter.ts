import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { errorToMessage, logEvent } from '../logger';
import type {
  AdapterHealthReport,
  BackgroundBlankResult,
  BackgroundReleaseEvent,
  BackgroundStatusResponse,
  ClaimContext,
  ClaimReminderSnapshot,
  ClaimPayload,
  ReviewEvent,
  SubmissionEvent,
  RequesterContext,
  SpendPayload,
  XpSummary,
} from '../types';

export interface BotConfigResponse {
  reviewNotifierEnabled: boolean | null;
  submissionNotifierEnabled: boolean | null;
  autoPeriodCreatorEnabled: boolean | null;
  autoPeriodCloserEnabled: boolean | null;
  claimReminderEnabled: boolean | null;
  passageOfTimeEnabled: boolean | null;
  huntConsequenceEnabled: boolean | null;
  restartRequested: boolean | null;
  wikiSyncRequested: boolean | null;
  ccTicketMonitorEnabled: boolean | null;
  passageOfTimeIntervalMs: number | null;
  reviewNotifierIntervalMs: number | null;
  submissionNotifierIntervalMs: number | null;
  claimReminderIntervalMs: number | null;
  announcementsChannelId: string | null;
  ccTicketCategoryIds: string | null;
}

export interface TrackerAdapter {
  getSummary(characterName: string, requester: RequesterContext, opts?: { includeHistory?: boolean }): Promise<XpSummary | null>;
  getClaimContext(requester: RequesterContext, opts?: { forceRefresh?: boolean }): Promise<ClaimContext>;
  getActiveRoster(): Promise<{ characters: string[] }>;
  getActiveRosterWithIds(): Promise<{ characters: Array<{ name: string; discordId: string | null }> }>;
  getActiveRosterWithChannelIds(): Promise<{ characters: Array<{ name: string; ticketChannelId: string | null }> }>;
  setCharacterStatus(name: string, status: string, requesterName: string): Promise<{ ok: boolean; message: string }>;
  updateCharacterChannelId(name: string, ticketChannelId: string | null, requesterName: string): Promise<{ ok: boolean; message: string }>;
  getBackgroundStatus(characterName: string, requester: RequesterContext): Promise<BackgroundStatusResponse | null>;
  blankBackground(
    requester: RequesterContext,
    payload: { characterName: string; backgroundName: string; dots: number },
  ): Promise<{ ok: boolean; message: string; result?: BackgroundBlankResult; currentNight?: string }>;
  releaseDueBackgroundBlanks(): Promise<{ ok: boolean; currentNight: string | null; released: BackgroundReleaseEvent[] }>;
  getClaimReminderTargets(): Promise<ClaimReminderSnapshot>;
  getReviewEvents(opts?: {
    sinceEpoch?: number;
    sinceEventKey?: string;
    limit?: number;
  }): Promise<{ events: ReviewEvent[]; hasMore: boolean }>;
  autoCreatePeriod(): Promise<{ ok: boolean; created: boolean; reason?: string; periodLabel?: string }>;
  autoClosePeriod(): Promise<{
    ok: boolean;
    closed: boolean;
    reason?: string;
    periodLabel?: string;
    nightNumber?: number;
    reminderTargets?: Array<{ discordId: string; characterName: string }>;
  }>;
  getSubmissionEvents(opts?: {
    sinceEpoch?: number;
    sinceEventKey?: string;
    limit?: number;
  }): Promise<{ events: SubmissionEvent[]; hasMore: boolean }>;
  getCcSubmittedDrafts(opts?: {
    sinceEpoch?: number;
    limit?: number;
  }): Promise<{ events: CcSubmittedDraft[]; hasMore: boolean }>;
  submitClaim(payload: ClaimPayload): Promise<{ ok: boolean; message: string }>;
  submitSpend(payload: SpendPayload): Promise<{ ok: boolean; message: string }>;
  getHealthReport(requester: RequesterContext): Promise<AdapterHealthReport>;
  getBotConfig(): Promise<BotConfigResponse>;
  ackBotRestart(): Promise<void>;
  ackWikiSync(
    status: 'running' | 'success' | 'error',
    error?: string,
    source?: 'manual' | 'scheduled',
    runId?: string,
  ): Promise<void>;
  postBotLog(entries: Array<Record<string, unknown>>): Promise<void>;
  postHeartbeat(liveState?: Record<string, boolean>): Promise<void>;
  getAllReminderPrefs(): Promise<Record<string, { optOut: boolean; snoozeUntilEpoch: number }>>;
  setReminderPref(discordId: string, prefs: { optOut: boolean; snoozeUntilEpoch: number }): Promise<void>;
  triggerSheetsReconcile(): Promise<SheetsReconcileSummary>;
  createCharacter(payload: {
    characterName: string;
    playerDiscord: string;
    playerDiscordName: string;
    clan: string;
    ageCategory: string;
    sect: string;
    requesterDiscordId: string;
    requesterDiscordName: string;
  }): Promise<{ ok: boolean; message: string; characterName?: string }>;
  getCharacterDetails(name: string): Promise<CharacterDetails | null>;
  updateCharacter(
    name: string,
    updates: { clan?: string; ageCategory?: string; sect?: string },
    requester: { requesterDiscordId: string; requesterDiscordName: string },
  ): Promise<{ ok: boolean; message: string }>;
  renameCharacter(
    name: string,
    newName: string,
    requester: { requesterDiscordId: string; requesterDiscordName: string },
  ): Promise<{ ok: boolean; message: string; newName?: string }>;
  deleteCharacter(
    name: string,
    requester: { requesterDiscordId: string; requesterDiscordName: string },
  ): Promise<{ ok: boolean; message: string; hasHistory?: boolean }>;
  recordDiscordActivity(
    entries: Array<{ discord_id: string; date: string; category: 'ic' | 'ooc' | 'rolls' | 'cubby'; count: number }>,
  ): Promise<void>;
}

export type CharacterDetails = {
  character_name: string;
  player_discord: string;
  player_discord_name: string;
  clan: string;
  age_category: string;
  sect: string;
  active: boolean;
};

export interface SheetsReconcileSummary {
  started_at: string;
  finished_at?: string;
  claims_appended: number;
  claims_status_updated: number;
  spends_appended: number;
  spends_status_updated: number;
  ledger_appended: number;
  characters_appended: number;
  errors: string[];
}

const summarySchema = z.object({
  characterName: z.string(),
  earnedXp: z.number(),
  totalXp: z.number(),
  totalSpends: z.number(),
  availableXp: z.number(),
  recentClaims: z
    .array(
      z.object({
        playPeriod: z.string(),
        approvedXp: z.number(),
        reviewDate: z.string().nullable().optional(),
      }),
    )
    .optional(),
  recentSpends: z
    .array(
      z.object({
        traitName: z.string(),
        category: z.string(),
        dots: z.string(),
        verifiedCost: z.number(),
        reviewDate: z.string().nullable().optional(),
      }),
    )
    .optional(),
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

const activeRosterSchema = z.object({
  characters: z.array(z.string()),
});

const activeRosterWithIdsSchema = z.object({
  characters: z.array(z.object({ name: z.string(), discordId: z.string().nullable() })),
});

const activeRosterWithChannelIdsSchema = z.object({
  characters: z.array(z.object({ name: z.string(), ticketChannelId: z.string().nullable() })),
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

const backgroundStatusSchema = z.object({
  characterName: z.string(),
  currentNight: z.string().nullable(),
  currentNightNumber: z.number().nullable(),
  backgrounds: z.array(z.object({
    background_name: z.string(),
    dots_total: z.number(),
    dots_blanked: z.number(),
    dots_available: z.number(),
    blanked: z.boolean(),
    blanked_at_night_number: z.number().nullable(),
    release_night_number: z.number().nullable(),
    updated_at: z.string(),
    updated_by: z.string(),
  })),
});

const blankBackgroundResponseSchema = z.object({
  ok: z.boolean(),
  currentNight: z.string(),
  result: z.object({
    character_name: z.string(),
    background_name: z.string(),
    dots_blanked_now: z.number(),
    dots_total: z.number(),
    dots_blanked_total: z.number(),
    dots_available: z.number(),
    release_night_number: z.number(),
  }),
});

const releaseDueBackgroundsSchema = z.object({
  ok: z.boolean(),
  currentNight: z.string().nullable(),
  released: z.array(z.object({
    character_name: z.string(),
    background_name: z.string(),
    dots_released: z.number(),
    player_discord: z.string(),
  })),
});

const autoCreatePeriodSchema = z.object({
  created: z.boolean(),
  reason: z.string().optional(),
  periodLabel: z.string().optional(),
});

const autoClosePeriodSchema = z.object({
  closed: z.boolean(),
  reason: z.string().optional(),
  periodLabel: z.string().optional(),
  nightNumber: z.number().optional(),
  reminderTargets: z
    .array(z.object({ discordId: z.string(), characterName: z.string() }))
    .optional(),
});

const submissionEventBase = {
  eventKey: z.string(),
  rowIndex: z.number(),
  characterName: z.string(),
  playerDiscordId: z.string().optional(),
  submittedAt: z.string(),
  submittedAtEpoch: z.number(),
};

const submissionEventSchema = z.discriminatedUnion('kind', [
  z.object({
    ...submissionEventBase,
    kind: z.literal('claim'),
    playPeriod: z.string(),
    requestedXp: z.number(),
  }),
  z.object({
    ...submissionEventBase,
    kind: z.literal('spend'),
    spendCategory: z.string(),
    traitName: z.string(),
    currentDots: z.number(),
    newDots: z.number(),
    requestedCost: z.number(),
  }),
]);

const submissionEventsSchema = z.object({
  events: z.array(submissionEventSchema),
  hasMore: z.boolean().optional(),
});

const ccSubmittedDraftSchema = z.object({
  id: z.string(),
  character_name: z.string(),
  player_discord_id: z.string(),
  ticket_channel_id: z.string().nullable(),
  submitted_at_epoch: z.number(),
  age_category: z.string(),
  clan: z.string(),
  submission_notes: z.string(),
});

export type CcSubmittedDraft = z.infer<typeof ccSubmittedDraftSchema>;

const ccSubmittedDraftsSchema = z.object({
  events: z.array(ccSubmittedDraftSchema),
  has_more: z.boolean().optional(),
});

type AdapterOptions = {
  readToken?: string;
  writeToken?: string;
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
  private readonly legacyToken?: string;
  private readonly readToken?: string;
  private readonly writeToken?: string;
  private readonly requestTimeoutMs: number;
  private readonly claimContextCacheTtlMs: number;
  private readonly claimContextStaleIfErrorMs: number;
  private readonly claimContextMaxRetries: number;
  private readonly claimContextRetryBaseMs: number;

  constructor(baseUrl: string, apiToken?: string, opts: AdapterOptions = {}) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.legacyToken = apiToken;
    this.readToken = opts.readToken;
    this.writeToken = opts.writeToken;
    this.requestTimeoutMs = opts.requestTimeoutMs ?? 10_000;
    this.claimContextCacheTtlMs = opts.claimContextCacheTtlMs ?? 30_000;
    this.claimContextStaleIfErrorMs = opts.claimContextStaleIfErrorMs ?? 300_000;
    this.claimContextMaxRetries = opts.claimContextMaxRetries ?? 2;
    this.claimContextRetryBaseMs = opts.claimContextRetryBaseMs ?? 250;
  }

  async getSummary(characterName: string, requester: RequesterContext, opts: { includeHistory?: boolean } = {}): Promise<XpSummary | null> {
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
    if (opts.includeHistory) {
      params.set('include_history', '1');
    }
    const url = `${this.baseUrl}/api/characters/${encodeURIComponent(characterName)}/summary?${params.toString()}`;
    const resp = await this.fetchWithTimeout(url, {
      headers: this.readAuthHeaders(),
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

  async getActiveRoster(): Promise<{ characters: string[] }> {
    const resp = await this.fetchWithTimeout(`${this.baseUrl}/api/meta/active-roster`, {
      headers: this.readAuthHeaders(),
    }).catch(() => null);
    if (!resp) {
      throw new Error('Unable to reach web app active-roster API.');
    }
    if (!resp.ok) {
      throw new Error(`Web app active-roster API failed (${resp.status})`);
    }
    const raw = await resp.json();
    return activeRosterSchema.parse(raw);
  }

  async getActiveRosterWithIds(): Promise<{ characters: Array<{ name: string; discordId: string | null }> }> {
    const resp = await this.fetchWithTimeout(`${this.baseUrl}/api/meta/active-roster?includeDiscordIds=1`, {
      headers: this.readAuthHeaders(),
    }).catch(() => null);
    if (!resp) {
      throw new Error('Unable to reach web app active-roster API.');
    }
    if (!resp.ok) {
      throw new Error(`Web app active-roster API failed (${resp.status})`);
    }
    const raw = await resp.json();
    return activeRosterWithIdsSchema.parse(raw);
  }

  async getActiveRosterWithChannelIds(): Promise<{ characters: Array<{ name: string; ticketChannelId: string | null }> }> {
    const resp = await this.fetchWithTimeout(`${this.baseUrl}/api/meta/active-roster?includeChannelIds=1`, {
      headers: this.readAuthHeaders(),
    }).catch(() => null);
    if (!resp) throw new Error('Unable to reach web app active-roster API.');
    if (!resp.ok) throw new Error(`Web app active-roster API failed (${resp.status})`);
    const raw = await resp.json();
    return activeRosterWithChannelIdsSchema.parse(raw);
  }

  async setCharacterStatus(name: string, status: string, requesterName: string): Promise<{ ok: boolean; message: string }> {
    const resp = await this.fetchWithTimeout(
      `${this.baseUrl}/api/character/${encodeURIComponent(name)}/status`,
      {
        method: 'PUT',
        headers: { ...this.writeAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, requesterDiscordName: requesterName }),
      },
    ).catch(() => null);
    if (!resp) return { ok: false, message: 'Unable to reach web app API.' };
    if (resp.status === 404) return { ok: false, message: `Character "${name}" not found.` };
    if (!resp.ok) {
      const preview = await resp.text().then((v) => v.slice(0, 160)).catch(() => '');
      return { ok: false, message: preview || `API rejected request (status ${resp.status}).` };
    }
    return { ok: true, message: `Character "${name}" status set to "${status}".` };
  }

  async updateCharacterChannelId(name: string, ticketChannelId: string | null, requesterName: string): Promise<{ ok: boolean; message: string }> {
    const resp = await this.fetchWithTimeout(
      `${this.baseUrl}/api/roster/character/${encodeURIComponent(name)}`,
      {
        method: 'PATCH',
        headers: { ...this.writeAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticket_channel_id: ticketChannelId, requesterDiscordName: requesterName }),
      },
    ).catch(() => null);
    if (!resp) return { ok: false, message: 'Unable to reach web app API.' };
    if (!resp.ok) {
      const preview = await resp.text().then((v) => v.slice(0, 160)).catch(() => '');
      return { ok: false, message: preview || `API rejected request (status ${resp.status}).` };
    }
    return { ok: true, message: `Channel ID updated for "${name}".` };
  }

  async getBackgroundStatus(characterName: string, requester: RequesterContext): Promise<BackgroundStatusResponse | null> {
    const params = new URLSearchParams({
      requesterDiscordId: requester.requesterDiscordId,
      characterName,
    });
    if (requester.requesterDiscordName) {
      params.set('requesterDiscordName', requester.requesterDiscordName);
    }
    if (requester.testMode) {
      params.set('testMode', 'true');
    }
    if (requester.testAsDiscordId) {
      params.set('testAsDiscordId', requester.testAsDiscordId);
    }

    const resp = await this.fetchWithTimeout(`${this.baseUrl}/api/backgrounds/status?${params.toString()}`, {
      headers: this.readAuthHeaders(),
    }).catch(() => null);
    if (!resp || resp.status === 404) {
      return null;
    }
    if (!resp.ok) {
      throw new Error(`Web app backgrounds/status API failed (${resp.status})`);
    }
    const raw = await resp.json();
    return backgroundStatusSchema.parse(raw);
  }

  async blankBackground(
    requester: RequesterContext,
    payload: { characterName: string; backgroundName: string; dots: number },
  ): Promise<{ ok: boolean; message: string; result?: BackgroundBlankResult; currentNight?: string }> {
    const requestTimestamp = Math.floor(Date.now() / 1000).toString();
    const requestNonce = randomUUID();
    const resp = await this.fetchWithTimeout(`${this.baseUrl}/api/backgrounds/blank`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Request-Timestamp': requestTimestamp,
        'X-Request-Nonce': requestNonce,
        ...this.writeAuthHeaders(),
      },
      body: JSON.stringify({
        requesterDiscordId: requester.requesterDiscordId,
        requesterDiscordName: requester.requesterDiscordName,
        testMode: requester.testMode ?? false,
        testAsDiscordId: requester.testAsDiscordId,
        ...payload,
      }),
    }).catch(() => null);

    if (!resp) {
      return { ok: false, message: 'Unable to reach web app API.' };
    }
    if (!resp.ok) {
      const bodyPreview = await resp.text().then((v) => v.slice(0, 160)).catch(() => '');
      const userMessage = bodyPreview || `Request was rejected by the web API (status ${resp.status}).`;
      return { ok: false, message: userMessage };
    }
    const parsed = blankBackgroundResponseSchema.parse(await resp.json());
    return {
      ok: true,
      message: 'Background blanked.',
      result: parsed.result,
      currentNight: parsed.currentNight,
    };
  }

  async releaseDueBackgroundBlanks(): Promise<{ ok: boolean; currentNight: string | null; released: BackgroundReleaseEvent[] }> {
    const requestTimestamp = Math.floor(Date.now() / 1000).toString();
    const requestNonce = randomUUID();
    const resp = await this.fetchWithTimeout(`${this.baseUrl}/api/backgrounds/release-due`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Request-Timestamp': requestTimestamp,
        'X-Request-Nonce': requestNonce,
        ...this.writeAuthHeaders(),
      },
      body: JSON.stringify({}),
    }).catch(() => null);
    if (!resp || !resp.ok) {
      return { ok: false, currentNight: null, released: [] };
    }
    const parsed = releaseDueBackgroundsSchema.parse(await resp.json());
    return { ok: parsed.ok, currentNight: parsed.currentNight, released: parsed.released };
  }

  async getClaimReminderTargets(): Promise<ClaimReminderSnapshot> {
    const resp = await this.fetchWithTimeout(`${this.baseUrl}/api/meta/claim-reminder-targets`, {
      headers: this.readAuthHeaders(),
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

  async getSubmissionEvents(opts: {
    sinceEpoch?: number;
    sinceEventKey?: string;
    limit?: number;
  } = {}): Promise<{ events: SubmissionEvent[]; hasMore: boolean }> {
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
    const url = `${this.baseUrl}/api/submission-events${query ? `?${query}` : ''}`;
    const resp = await this.fetchWithTimeout(url, {
      headers: this.readAuthHeaders(),
    }).catch(() => null);

    if (!resp) {
      throw new Error('Unable to reach web app submission-events API.');
    }
    if (!resp.ok) {
      throw new Error(`Web app submission-events API failed (${resp.status})`);
    }

    const raw = await resp.json();
    const parsed = submissionEventsSchema.parse(raw);
    return { events: parsed.events as SubmissionEvent[], hasMore: parsed.hasMore ?? false };
  }

  async getCcSubmittedDrafts(opts: {
    sinceEpoch?: number;
    limit?: number;
  } = {}): Promise<{ events: CcSubmittedDraft[]; hasMore: boolean }> {
    const params = new URLSearchParams();
    if (typeof opts.sinceEpoch === 'number' && Number.isFinite(opts.sinceEpoch) && opts.sinceEpoch > 0) {
      params.set('sinceEpoch', String(Math.floor(opts.sinceEpoch)));
    }
    if (typeof opts.limit === 'number' && Number.isFinite(opts.limit) && opts.limit > 0) {
      params.set('limit', String(Math.floor(opts.limit)));
    }
    const query = params.toString();
    const url = `${this.baseUrl}/api/cc/submitted-drafts${query ? `?${query}` : ''}`;
    const resp = await this.fetchWithTimeout(url, {
      headers: this.readAuthHeaders(),
    }).catch(() => null);

    if (!resp) {
      throw new Error('Unable to reach web app cc/submitted-drafts API.');
    }
    if (!resp.ok) {
      throw new Error(`Web app cc/submitted-drafts API failed (${resp.status})`);
    }
    const raw = await resp.json();
    const parsed = ccSubmittedDraftsSchema.parse(raw);
    return { events: parsed.events, hasMore: parsed.has_more === true };
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
      headers: this.readAuthHeaders(),
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
        ...this.writeAuthHeaders(),
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

  async autoClosePeriod(): Promise<{
    ok: boolean;
    closed: boolean;
    reason?: string;
    periodLabel?: string;
    nightNumber?: number;
    reminderTargets?: Array<{ discordId: string; characterName: string }>;
  }> {
    const requestTimestamp = Math.floor(Date.now() / 1000).toString();
    const requestNonce = randomUUID();
    const resp = await this.fetchWithTimeout(`${this.baseUrl}/api/periods/auto-close`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Request-Timestamp': requestTimestamp,
        'X-Request-Nonce': requestNonce,
        ...this.writeAuthHeaders(),
      },
      body: JSON.stringify({}),
    }).catch(() => null);

    if (!resp) {
      return { ok: false, closed: false, reason: 'unreachable' };
    }
    if (!resp.ok) {
      return { ok: false, closed: false, reason: `http_${resp.status}` };
    }
    const raw = await resp.json();
    const parsed = autoClosePeriodSchema.parse(raw);
    return {
      ok: true,
      closed: parsed.closed,
      reason: parsed.reason,
      periodLabel: parsed.periodLabel,
      nightNumber: parsed.nightNumber,
      reminderTargets: parsed.reminderTargets,
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
        headers: this.readAuthHeaders(),
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

  async getBotConfig(): Promise<BotConfigResponse> {
    const url = `${this.baseUrl}/api/bot-config`;
    const res = await this.fetchWithTimeout(url, { headers: this.readAuthHeaders() });
    if (!res.ok) throw new Error(`bot-config fetch failed: ${res.status}`);
    return res.json() as Promise<BotConfigResponse>;
  }

  async ackBotRestart(): Promise<void> {
    const url = `${this.baseUrl}/api/bot-restart-ack`;
    const res = await this.fetchWithTimeout(url, {
      method: 'POST',
      headers: this.writeAuthHeaders(),
    });
    if (!res.ok) throw new Error(`bot-restart-ack POST failed: ${res.status}`);
  }

  async ackWikiSync(
    status: 'running' | 'success' | 'error',
    error?: string,
    source: 'manual' | 'scheduled' = 'manual',
    runId?: string,
  ): Promise<void> {
    const url = `${this.baseUrl}/api/wiki-sync-ack`;
    const res = await this.fetchWithTimeout(url, {
      method: 'POST',
      headers: { ...this.writeAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, source, ...(runId ? { runId } : {}), ...(error ? { error } : {}) }),
    });
    if (!res.ok) throw new Error(`wiki-sync-ack POST failed: ${res.status}`);
  }

  async postBotLog(entries: Array<Record<string, unknown>>): Promise<void> {
    const url = `${this.baseUrl}/api/bot-log`;
    const res = await this.fetchWithTimeout(url, {
      method: 'POST',
      headers: { ...this.writeAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(entries),
    });
    if (!res.ok) throw new Error(`bot-log POST failed: ${res.status}`);
  }

  async postHeartbeat(liveState?: Record<string, boolean>): Promise<void> {
    const url = `${this.baseUrl}/api/bot-heartbeat`;
    const res = await this.fetchWithTimeout(url, {
      method: 'POST',
      headers: { ...this.writeAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(liveState ?? {}),
    });
    if (!res.ok) throw new Error(`heartbeat POST failed: ${res.status}`);
  }

  async getAllReminderPrefs(): Promise<Record<string, { optOut: boolean; snoozeUntilEpoch: number }>> {
    const schema = z.object({
      preferences: z.record(
        z.string(),
        z.object({ optOut: z.boolean(), snoozeUntilEpoch: z.number() }),
      ),
    });
    try {
      const res = await this.fetchWithTimeout(`${this.baseUrl}/api/reminder-prefs`, {
        headers: this.readAuthHeaders(),
      });
      if (!res.ok) return {};
      const parsed = schema.safeParse(await res.json());
      return parsed.success ? parsed.data.preferences : {};
    } catch {
      return {};
    }
  }

  async setReminderPref(discordId: string, prefs: { optOut: boolean; snoozeUntilEpoch: number }): Promise<void> {
    try {
      await this.fetchWithTimeout(`${this.baseUrl}/api/reminder-prefs/${discordId}`, {
        method: 'PUT',
        headers: { ...this.writeAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ optOut: prefs.optOut, snoozeUntilEpoch: prefs.snoozeUntilEpoch }),
      });
    } catch {
      // best-effort
    }
  }

  async triggerSheetsReconcile(): Promise<SheetsReconcileSummary> {
    const url = `${this.baseUrl}/api/sheets/reconcile`;
    const res = await this.fetchWithTimeout(url, {
      method: 'POST',
      headers: this.writeAuthHeaders(),
    });
    if (!res.ok) throw new Error(`sheets/reconcile POST failed: ${res.status}`);
    return res.json() as Promise<SheetsReconcileSummary>;
  }

  async createCharacter(payload: {
    characterName: string;
    playerDiscord: string;
    playerDiscordName: string;
    clan: string;
    ageCategory: string;
    sect: string;
    requesterDiscordId: string;
    requesterDiscordName: string;
  }): Promise<{ ok: boolean; message: string; characterName?: string }> {
    const resp = await this.fetchWithTimeout(`${this.baseUrl}/api/roster/character`, {
      method: 'POST',
      headers: { ...this.writeAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        character_name: payload.characterName,
        player_discord: payload.playerDiscord,
        player_discord_name: payload.playerDiscordName,
        clan: payload.clan,
        age_category: payload.ageCategory,
        sect: payload.sect,
        requesterDiscordId: payload.requesterDiscordId,
        requesterDiscordName: payload.requesterDiscordName,
      }),
    }).catch(() => null);

    if (!resp) {
      return { ok: false, message: 'Unable to reach web app API.' };
    }
    if (resp.status === 409) {
      return { ok: false, message: `Character "${payload.characterName}" already exists on the roster.` };
    }
    if (!resp.ok) {
      const bodyPreview = await resp.text().then((v) => v.slice(0, 160)).catch(() => '');
      return { ok: false, message: bodyPreview || `API rejected request (status ${resp.status}).` };
    }
    const raw = (await resp.json()) as { character_name?: string };
    return { ok: true, message: 'Character created.', characterName: raw.character_name };
  }

  async getCharacterDetails(name: string): Promise<CharacterDetails | null> {
    const resp = await this.fetchWithTimeout(
      `${this.baseUrl}/api/roster/character/${encodeURIComponent(name)}`,
      { headers: this.readAuthHeaders() },
    ).catch(() => null);
    if (!resp || resp.status === 404) return null;
    if (!resp.ok) throw new Error(`get character details failed (${resp.status})`);
    return resp.json() as Promise<CharacterDetails>;
  }

  async updateCharacter(
    name: string,
    updates: { clan?: string; ageCategory?: string; sect?: string },
    requester: { requesterDiscordId: string; requesterDiscordName: string },
  ): Promise<{ ok: boolean; message: string }> {
    const body: Record<string, string> = {
      requesterDiscordId: requester.requesterDiscordId,
      requesterDiscordName: requester.requesterDiscordName,
    };
    if (updates.clan !== undefined) body.clan = updates.clan;
    if (updates.ageCategory !== undefined) body.age_category = updates.ageCategory;
    if (updates.sect !== undefined) body.sect = updates.sect;

    const resp = await this.fetchWithTimeout(
      `${this.baseUrl}/api/roster/character/${encodeURIComponent(name)}`,
      {
        method: 'PATCH',
        headers: { ...this.writeAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
    ).catch(() => null);
    if (!resp) return { ok: false, message: 'Unable to reach web app API.' };
    if (!resp.ok) {
      const preview = await resp.text().then((v) => v.slice(0, 160)).catch(() => '');
      return { ok: false, message: preview || `API rejected request (status ${resp.status}).` };
    }
    return { ok: true, message: 'Character updated.' };
  }

  async renameCharacter(
    name: string,
    newName: string,
    requester: { requesterDiscordId: string; requesterDiscordName: string },
  ): Promise<{ ok: boolean; message: string; newName?: string }> {
    const resp = await this.fetchWithTimeout(
      `${this.baseUrl}/api/roster/character/${encodeURIComponent(name)}/rename`,
      {
        method: 'POST',
        headers: { ...this.writeAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          new_name: newName,
          requesterDiscordId: requester.requesterDiscordId,
          requesterDiscordName: requester.requesterDiscordName,
        }),
      },
    ).catch(() => null);
    if (!resp) return { ok: false, message: 'Unable to reach web app API.' };
    if (resp.status === 409) return { ok: false, message: `Character "${newName}" already exists.` };
    if (!resp.ok) {
      const preview = await resp.text().then((v) => v.slice(0, 160)).catch(() => '');
      return { ok: false, message: preview || `API rejected request (status ${resp.status}).` };
    }
    const raw = (await resp.json()) as { new_name?: string };
    return { ok: true, message: 'Character renamed.', newName: raw.new_name };
  }

  async deleteCharacter(
    name: string,
    requester: { requesterDiscordId: string; requesterDiscordName: string },
  ): Promise<{ ok: boolean; message: string; hasHistory?: boolean }> {
    const resp = await this.fetchWithTimeout(
      `${this.baseUrl}/api/roster/character/${encodeURIComponent(name)}`,
      {
        method: 'DELETE',
        headers: { ...this.writeAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ requesterDiscordName: requester.requesterDiscordName }),
      },
    ).catch(() => null);
    if (!resp) return { ok: false, message: 'Unable to reach web app API.' };
    if (resp.status === 409) return { ok: false, hasHistory: true, message: 'Character has existing history — use retired or deceased status instead.' };
    if (resp.status === 404) return { ok: false, message: 'Character not found.' };
    if (!resp.ok) {
      const preview = await resp.text().then((v) => v.slice(0, 160)).catch(() => '');
      return { ok: false, message: preview || `API rejected request (status ${resp.status}).` };
    }
    return { ok: true, message: 'Character deleted.' };
  }

  async recordDiscordActivity(
    entries: Array<{ discord_id: string; date: string; category: 'ic' | 'ooc' | 'rolls' | 'cubby'; count: number }>,
  ): Promise<void> {
    const res = await this.fetchWithTimeout(`${this.baseUrl}/api/discord-activity/record`, {
      method: 'POST',
      headers: { ...this.writeAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ entries }),
    });
    if (!res.ok) throw new Error(`discord-activity/record POST failed: ${res.status}`);
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
        ...this.writeAuthHeaders(),
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
          headers: this.readAuthHeaders(),
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

  private readAuthHeaders(): Record<string, string> {
    const token = this.readToken ?? this.legacyToken ?? this.writeToken;
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  private writeAuthHeaders(): Record<string, string> {
    const token = this.writeToken ?? this.legacyToken;
    return token ? { Authorization: `Bearer ${token}` } : {};
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
