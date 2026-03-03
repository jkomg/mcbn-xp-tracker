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
