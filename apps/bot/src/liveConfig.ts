/** Mutable runtime config — seeded from .env in index.ts, then updated by ConfigSyncWorker. */
export const liveConfig = {
  reviewNotifierEnabled: false,
  submissionNotifierEnabled: false,
  autoPeriodCreatorEnabled: false,
  autoPeriodCloserEnabled: false,
  claimReminderEnabled: false,
  passageOfTimeEnabled: false,
  huntConsequenceEnabled: false,
};
