import { config } from './config';

/** Mutable runtime config — updated by ConfigSyncWorker from /api/bot-config. */
export const liveConfig = {
  reviewNotifierEnabled: config.reviewNotifierEnabled,
  submissionNotifierEnabled: config.submissionNotifierEnabled,
  autoPeriodCreatorEnabled: config.autoPeriodCreatorEnabled,
  autoPeriodCloserEnabled: config.autoPeriodCloserEnabled,
  claimReminderEnabled: config.claimReminderEnabled,
  passageOfTimeEnabled: config.passageOfTimeEnabled,
  huntConsequenceEnabled: config.huntConsequenceEnabled,
};
