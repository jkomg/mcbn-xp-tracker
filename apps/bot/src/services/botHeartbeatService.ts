import { logEvent } from '../logger';
import { liveConfig } from '../liveConfig';
import type { TrackerAdapter } from './adapter';

export class BotHeartbeatService {
  private readonly adapter: TrackerAdapter;
  private readonly intervalMs: number;

  constructor(adapter: TrackerAdapter, intervalMs = 60_000) {
    this.adapter = adapter;
    this.intervalMs = intervalMs;
  }

  async beat(): Promise<void> {
    try {
      await this.adapter.postHeartbeat({
        reviewNotifierEnabled: liveConfig.reviewNotifierEnabled,
        submissionNotifierEnabled: liveConfig.submissionNotifierEnabled,
        autoPeriodCreatorEnabled: liveConfig.autoPeriodCreatorEnabled,
        autoPeriodCloserEnabled: liveConfig.autoPeriodCloserEnabled,
        claimReminderEnabled: liveConfig.claimReminderEnabled,
        passageOfTimeEnabled: liveConfig.passageOfTimeEnabled,
        huntConsequenceEnabled: liveConfig.huntConsequenceEnabled,
      });
    } catch (err) {
      logEvent('warn', 'heartbeat_failed', { error: String(err) });
    }
  }

  start(): void {
    void this.beat();
    setInterval(() => void this.beat(), this.intervalMs).unref();
  }
}
