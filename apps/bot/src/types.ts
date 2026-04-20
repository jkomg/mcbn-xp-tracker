export type XpSpendCategory = string;

export type XpClaimCategory =
  | 'posted_once'
  | 'hunting_awakening'
  | 'scene_with_another'
  | 'conflict'
  | 'combat'
  | 'unmitigated_stain';

export type XpSummary = {
  characterName: string;
  earnedXp: number;
  totalXp: number;
  totalSpends: number;
  availableXp: number;
  recentClaims?: Array<{ playPeriod: string; approvedXp: number; reviewDate?: string | null }>;
  recentSpends?: Array<{ traitName: string; category: string; dots: string; verifiedCost: number; reviewDate?: string | null }>;
};

export type ClaimContext = {
  activeCharacters: string[];
  openPeriods: string[];
  currentNight: string | null;
};

export type RequesterContext = {
  requesterDiscordId: string;
  requesterDiscordName?: string;
  testMode?: boolean;
  testAsDiscordId?: string;
};

export type ClaimPayload = {
  characterName: string;
  playPeriod: string;
  categories: Partial<Record<XpClaimCategory, string>>;
} & RequesterContext;

export type SpendPayload = {
  characterName: string;
  spendCategory: XpSpendCategory;
  traitName: string;
  currentDots: number;
  newDots: number;
  isInClan: boolean;
  justification: string;
} & RequesterContext;

export type ApiProbe = {
  ok: boolean;
  status?: number;
  latencyMs: number;
  error?: string;
};

export type ClaimContextProbe = ApiProbe & {
  source?: 'cache' | 'network' | 'stale-cache';
  retries?: number;
  cacheAgeMs?: number;
  activeCharacters?: number;
  openPeriods?: number;
  currentNight?: string | null;
};

export type AdapterHealthReport = {
  timestamp: string;
  webApi: ApiProbe;
  claimContext: ClaimContextProbe;
};

export type ClaimReminderTarget = {
  discordId: string;
  characterName: string;
};

export type ClaimReminderSnapshot = {
  currentNight: string | null;
  targets: ClaimReminderTarget[];
};

export type ReviewEventBase = {
  eventKey: string;
  kind: 'claim' | 'spend';
  rowIndex: number;
  characterName: string;
  playerDiscordId?: string;
  status: 'approved' | 'denied';
  reviewedBy: string;
  reviewDate: string;
  reviewedAtEpoch: number;
  staffNotes: string;
};

export type ClaimReviewEvent = ReviewEventBase & {
  kind: 'claim';
  playPeriod: string;
  requestedXp: number;
  approvedXp: number;
};

export type SpendReviewEvent = ReviewEventBase & {
  kind: 'spend';
  spendCategory: string;
  traitName: string;
  currentDots: number;
  newDots: number;
  requestedCost: number;
  verifiedCost: number;
};

export type ReviewEvent = ClaimReviewEvent | SpendReviewEvent;

export type SubmissionEventBase = {
  eventKey: string;
  kind: 'claim' | 'spend';
  rowIndex: number;
  characterName: string;
  playerDiscordId?: string;
  submittedAt: string;
  submittedAtEpoch: number;
};

export type ClaimSubmissionEvent = SubmissionEventBase & {
  kind: 'claim';
  playPeriod: string;
  requestedXp: number;
};

export type SpendSubmissionEvent = SubmissionEventBase & {
  kind: 'spend';
  spendCategory: string;
  traitName: string;
  currentDots: number;
  newDots: number;
  requestedCost: number;
};

export type SubmissionEvent = ClaimSubmissionEvent | SpendSubmissionEvent;

export type CharacterBackgroundStatus = {
  background_name: string;
  dots_total: number;
  dots_blanked: number;
  dots_available: number;
  blanked: boolean;
  blanked_at_night_number: number | null;
  release_night_number: number | null;
  updated_at: string;
  updated_by: string;
};

export type BackgroundStatusResponse = {
  characterName: string;
  currentNight: string | null;
  currentNightNumber: number | null;
  backgrounds: CharacterBackgroundStatus[];
};

export type BackgroundBlankResult = {
  character_name: string;
  background_name: string;
  dots_blanked_now: number;
  dots_total: number;
  dots_blanked_total: number;
  dots_available: number;
  release_night_number: number;
};

export type BackgroundReleaseEvent = {
  character_name: string;
  background_name: string;
  dots_released: number;
  player_discord: string;
};
