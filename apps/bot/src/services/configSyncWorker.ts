import { liveConfig } from '../liveConfig';
import { logEvent } from '../logger';
import type { TrackerAdapter } from './adapter';

export class ConfigSyncWorker {
  private readonly adapter: TrackerAdapter;
  private readonly intervalMs: number;

  constructor(adapter: TrackerAdapter, intervalMs = 60_000) {
    this.adapter = adapter;
    this.intervalMs = intervalMs;
  }

  async sync(): Promise<void> {
    try {
      const cfg = await this.adapter.getBotConfig();
      if (cfg.reviewNotifierEnabled !== null) liveConfig.reviewNotifierEnabled = cfg.reviewNotifierEnabled;
      if (cfg.submissionNotifierEnabled !== null) liveConfig.submissionNotifierEnabled = cfg.submissionNotifierEnabled;
      if (cfg.autoPeriodCreatorEnabled !== null) liveConfig.autoPeriodCreatorEnabled = cfg.autoPeriodCreatorEnabled;
      if (cfg.autoPeriodCloserEnabled !== null) liveConfig.autoPeriodCloserEnabled = cfg.autoPeriodCloserEnabled;
      if (cfg.claimReminderEnabled !== null) liveConfig.claimReminderEnabled = cfg.claimReminderEnabled;
      if (cfg.passageOfTimeEnabled !== null) liveConfig.passageOfTimeEnabled = cfg.passageOfTimeEnabled;
      if (cfg.huntConsequenceEnabled !== null) liveConfig.huntConsequenceEnabled = cfg.huntConsequenceEnabled;
      logEvent('debug', 'config_sync_done', { liveConfig });
    } catch (err) {
      logEvent('warn', 'config_sync_failed', { error: String(err) });
    }
  }

  start(): void {
    void this.sync();
    setInterval(() => void this.sync(), this.intervalMs).unref();
  }
}
