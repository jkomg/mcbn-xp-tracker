/**
 * Forwards buffered warn/error log entries to the web app's /api/bot-log
 * endpoint every 30 seconds so they appear in the Error Alerts page.
 */

import { drainLogBuffer } from '../logger';
import type { TrackerAdapter } from './adapter';

export class BotLogForwarder {
  private readonly adapter: TrackerAdapter;
  private timer: NodeJS.Timeout | null = null;

  constructor(adapter: TrackerAdapter) {
    this.adapter = adapter;
  }

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => void this.flush(), 30_000);
    this.timer.unref();
  }

  stop() {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  async flush(): Promise<void> {
    const entries = drainLogBuffer();
    if (!entries.length) return;
    try {
      await this.adapter.postBotLog(entries);
    } catch {
      // Silently drop on failure — we don't want logging to recurse into logging
    }
  }
}
