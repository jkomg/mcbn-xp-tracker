import { errorToMessage, logEvent } from '../logger';
import { liveConfig } from '../liveConfig';
import type { TrackerAdapter } from './adapter';

export class BotHeartbeatService {
  private readonly adapter: TrackerAdapter;
  private readonly intervalMs: number;
  private readonly staticState: Record<string, boolean>;

  constructor(adapter: TrackerAdapter, intervalMs = 60_000, staticState: Record<string, boolean> = {}) {
    this.adapter = adapter;
    this.intervalMs = intervalMs;
    this.staticState = staticState;
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
        ccTicketMonitorEnabled: liveConfig.ccTicketMonitorEnabled,
        ...this.staticState,
      });
    } catch (err) {
      logEvent('warn', 'heartbeat_failed', { error: errorToMessage(err) });
    }
  }

  start(): void {
    void this.beat();
    setInterval(() => void this.beat(), this.intervalMs).unref();
  }
}
