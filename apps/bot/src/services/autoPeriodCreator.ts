import { errorToMessage, logEvent } from '../logger';
import type { TrackerAdapter } from './adapter';

type AutoPeriodCreatorConfig = {
  enabled: boolean;
  intervalMs: number;
};

export class AutoPeriodCreator {
  private readonly adapter: TrackerAdapter;
  private readonly config: AutoPeriodCreatorConfig;
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(adapter: TrackerAdapter, config: AutoPeriodCreatorConfig) {
    this.adapter = adapter;
    this.config = config;
  }

  start() {
    if (!this.config.enabled || this.timer) {
      return;
    }
    this.timer = setInterval(() => {
      void this.tick();
    }, this.config.intervalMs);
    this.timer.unref();
    void this.tick();
    logEvent('info', 'auto_period_creator_started', { intervalMs: this.config.intervalMs });
  }

  stop() {
    if (!this.timer) {
      return;
    }
    clearInterval(this.timer);
    this.timer = null;
  }

  private async tick() {
    if (this.running) {
      return;
    }
    this.running = true;
    try {
      const result = await this.adapter.autoCreatePeriod();
      if (!result.ok) {
        logEvent('warn', 'auto_period_creator_failed', { reason: result.reason });
        return;
      }
      if (result.created) {
        logEvent('info', 'auto_period_creator_created', { periodLabel: result.periodLabel });
        return;
      }
      logEvent('debug', 'auto_period_creator_skipped', { reason: result.reason });
    } catch (error) {
      logEvent('warn', 'auto_period_creator_error', { error: errorToMessage(error) });
    } finally {
      this.running = false;
    }
  }
}
