/** Mutable runtime config — seeded from .env in index.ts, then updated by ConfigSyncWorker. */
export const liveConfig = {
  reviewNotifierEnabled: false,
  submissionNotifierEnabled: false,
  autoPeriodCreatorEnabled: false,
  autoPeriodCloserEnabled: false,
  claimReminderEnabled: false,
  passageOfTimeEnabled: false,
  /** Broadcasts a short message (default: a sunset gif link) to every channel in the new-night category list when the sunset event fires. */
  newNightBroadcastEnabled: false,
  newNightBroadcastMessage: '',
  huntConsequenceEnabled: false,
  /** DB-override intervals (null = use .env default). Applied on next bot restart. */
  passageOfTimeIntervalMs: null as number | null,
  reviewNotifierIntervalMs: null as number | null,
  submissionNotifierIntervalMs: null as number | null,
  claimReminderIntervalMs: null as number | null,
  /** DB-override channel IDs (null = use .env default). Applied on next bot restart. */
  announcementsChannelId: null as string | null,
  /** Set to true by configSyncWorker when the web UI requests a wiki sync run. */
  wikiSyncRequested: false,
  /** Whether the CC ticket welcome monitor is active. Seeded from .env in index.ts, then updated by ConfigSyncWorker. */
  ccTicketMonitorEnabled: true,
  /** Category IDs to restrict the CC ticket monitor to. Seeded from .env in index.ts, then updated by ConfigSyncWorker. */
  ccTicketCategoryIds: new Set<string>(),
  /** IC/OOC/Rolls activity-tracking category IDs. Seeded from .env in index.ts, then updated by ConfigSyncWorker. */
  activityIcCategoryIds: new Set<string>(),
  activityOocCategoryIds: new Set<string>(),
  activityRollsCategoryIds: new Set<string>(),
  /** Honeypot + mention-spam breaker — fully live (checked per-message, no restart needed). */
  honeypotEnabled: false,
  honeypotRequireYoungAccount: false,
  honeypotMaxAccountAgeDays: 30,
  honeypotChannelId: '',
  honeypotModLogChannelId: '',
  honeypotWhitelistedRoleIds: new Set<string>(),
  mentionBreakerEnabled: false,
  mentionBreakerMaxMentions: 5,
  mentionBreakerTimeoutMinutes: 10,
  mentionBreakerExemptRoleIds: new Set<string>(),
  mentionBreakerModLogChannelId: '',
  verifiedMemberRoleId: '',
  /** New-member gate — fully live (checked per-message/join, no restart needed). Reuses verifiedMemberRoleId above. */
  newMemberGateEnabled: false,
  newMemberGateWelcomeChannelId: '',
  newMemberGateSheetInProgressRoleId: '',
  newMemberGateLurkerRoleId: '',
  /** Postable pre-verification channels (besides welcome) where a raw link from an unverified member gets deleted. Env-only, not dashboard-editable. */
  newMemberGatePostableChannelIds: [] as string[],
  /** Per-command/subcommand kill switches, e.g. "xp.submit", "cobweb". Set-membership check, no restart needed. */
  disabledCommands: new Set<string>(),
  /** Correspondence command channel IDs — fully live (read per-invocation, no restart needed). */
  correspondenceDeliveryChannelId: '',
  correspondenceContactChannelId: '',
  correspondencePrestationChannelId: '',
  correspondenceSocialChannelId: '',
  correspondenceCobwebChannelId: '',
  correspondenceRumorChannelId: '',
  correspondenceSceneRequestChannelId: '',
};
