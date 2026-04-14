/** Mutable runtime config — seeded from .env in index.ts, then updated by ConfigSyncWorker. */
export const liveConfig = {
  reviewNotifierEnabled: false,
  submissionNotifierEnabled: false,
  autoPeriodCreatorEnabled: false,
  autoPeriodCloserEnabled: false,
  claimReminderEnabled: false,
  passageOfTimeEnabled: false,
  huntConsequenceEnabled: false,
  /** DB-override intervals (null = use .env default). Applied on next bot restart. */
  passageOfTimeIntervalMs: null as number | null,
  reviewNotifierIntervalMs: null as number | null,
  submissionNotifierIntervalMs: null as number | null,
  claimReminderIntervalMs: null as number | null,
  /** DB-override channel IDs (null = use .env default). Applied on next bot restart. */
  announcementsChannelId: null as string | null,
  /** Set to true by configSyncWorker when the web UI requests a Notion sync run. */
  notionSyncRequested: false,
};
