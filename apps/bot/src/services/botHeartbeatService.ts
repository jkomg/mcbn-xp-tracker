import { logEvent } from '../logger';
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
      await this.adapter.postHeartbeat();
    } catch (err) {
      logEvent('warn', 'heartbeat_failed', { error: String(err) });
    }
  }

  start(): void {
    void this.beat();
    setInterval(() => void this.beat(), this.intervalMs).unref();
  }
}
