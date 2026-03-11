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
