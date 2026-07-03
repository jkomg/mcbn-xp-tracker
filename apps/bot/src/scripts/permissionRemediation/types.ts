/** discord.js OverwriteType values: Role=0, Member=1. */
export type OverwriteTargetType = 0 | 1;

export type OverwriteSnapshotEntry = {
  id: string;
  type: OverwriteTargetType;
  /** Decimal bitfield string — safe input to PermissionResolvable on restore. */
  allow: string;
  deny: string;
};

export type ChannelSnapshotEntry = {
  id: string;
  name: string;
  /** ChannelType numeric value, for display only. */
  type: number;
  parentId: string | null;
  permissionOverwrites: OverwriteSnapshotEntry[];
};

export type RoleSnapshotEntry = {
  id: string;
  name: string;
  /** Captured for operator visibility only — never restored (position mutations cascade). */
  position: number;
  mentionable: boolean;
  /** Full decimal bitfield string, not a diff. */
  permissions: string;
  managed: boolean;
};

export type SnapshotTrigger = {
  discordUserId: string | null;
  discordTag: string | null;
  source: 'cli' | 'discord';
};

export type PermissionSnapshot = {
  schemaVersion: 1;
  guildId: string;
  guildName: string;
  createdAt: string; // ISO 8601
  triggeredBy: SnapshotTrigger;
  modulesRun: Array<'mention' | 'overwrite'>;
  summary: { rolesCaptured: number; channelsCaptured: number; overwritesCaptured: number };
  roles: RoleSnapshotEntry[];
  channels: ChannelSnapshotEntry[];
};

export type SnapshotFileMeta = {
  path: string;
  fileName: string;
  createdAt: string;
  triggeredBy: SnapshotTrigger;
  modulesRun: PermissionSnapshot['modulesRun'];
  summary: PermissionSnapshot['summary'];
};

export type RestoreResult = {
  rolesRestored: string[];
  rolesSkipped: Array<{ roleId: string; roleName: string; reason: string }>;
  channelsRestored: string[];
  channelsSkipped: Array<{ channelId: string; channelName: string; reason: string }>;
};

// ── Mention audit/apply ──────────────────────────────────────────────────────

export type MentionFinding =
  | { kind: 'role_mentionable'; roleId: string; roleName: string; editable: boolean }
  | {
      kind: 'role_mention_everyone';
      roleId: string;
      roleName: string;
      isEveryoneRole: boolean;
      editable: boolean;
    }
  | { kind: 'overwrite_mention_everyone'; channelId: string; channelName: string; targetId: string; targetName: string };

export type MentionAuditReport = {
  /** Reported for awareness only — never mutated, since Administrator implies MentionEveryone. */
  adminRoleIds: Array<{ roleId: string; roleName: string }>;
  findings: MentionFinding[];
};

export type MentionAuditOptions = {
  keepMentionableRoleIds: Set<string>;
  keepMentionEveryoneIds: Set<string>;
};

export type MentionApplyResult = {
  fixedMentionableRoleIds: string[];
  fixedMentionEveryoneRoleIds: string[];
  fixedOverwrites: Array<{ channelId: string; targetId: string }>;
  skipped: Array<{ id: string; scope: 'role' | 'overwrite'; reason: string }>;
};

// ── Overwrite audit/apply ────────────────────────────────────────────────────

export type OverwriteFinding =
  | {
      kind: 'redundant_vs_category';
      channelId: string;
      channelName: string;
      parentId: string;
      targetId: string;
      targetType: OverwriteTargetType;
      allow: string;
      deny: string;
      reason: 'matches_category' | 'no_op';
    }
  | {
      kind: 'orphaned_target';
      channelId: string;
      channelName: string;
      targetId: string;
      targetType: OverwriteTargetType;
      allow: string;
      deny: string;
      reason: 'role_not_found' | 'member_not_found';
    };

export type OverwriteAuditOptions = { includeMembers: boolean; includeZero: boolean };
export type OverwriteAuditReport = { findings: OverwriteFinding[]; totalOverwritesScanned: number };

export type OverwriteApplyOptions = { keepTargetIds: Set<string> };
export type OverwriteApplyResult = {
  removedByChannel: Array<{ channelId: string; channelName: string; removedTargetIds: string[] }>;
  errors: Array<{ channelId: string; error: string }>;
};

// ── Visibility audit (report-only) ───────────────────────────────────────────

export type ChannelVisibilityRow = {
  channelId: string;
  channelName: string;
  parentId: string | null;
  categoryName: string | null;
  visibleRoleIds: string[];
  visibleToEveryone: boolean;
  /** Roles that resolve to Send Messages true — a subset of visibleRoleIds in the common case. */
  sendableRoleIds: string[];
  sendableToEveryone: boolean;
};

export type VisibilityAssertion = { label: string; channelId: string; ok: boolean; detail: string };

export type VisibilityAuditReport = {
  rows: ChannelVisibilityRow[];
  assertions: VisibilityAssertion[];
  /** roleId -> role name, for rendering visibleRoleIds without a second lookup. */
  roleNames: Record<string, string>;
};

export type VisibilityAuditOptions = {
  verifiedMemberRoleId?: string;
  honeypotChannelId?: string;
  modLogChannelIds: string[];
};

// ── Combined ──────────────────────────────────────────────────────────────────

export type CombinedAuditReport = {
  mention: MentionAuditReport;
  overwrite: OverwriteAuditReport;
  visibility: VisibilityAuditReport;
};

export type CombinedAuditOptions = {
  mention: MentionAuditOptions;
  overwriteAudit: OverwriteAuditOptions;
  visibility: VisibilityAuditOptions;
};

export type CombinedApplyOptions = CombinedAuditOptions & {
  overwrite: OverwriteApplyOptions;
  triggeredBy: SnapshotTrigger;
  snapshotDir?: string;
};

export type CombinedApplyResult = {
  snapshotPath: string;
  mention: MentionApplyResult;
  overwrite: OverwriteApplyResult;
};
