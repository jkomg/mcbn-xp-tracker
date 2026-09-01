/**
 * Forwards buffered warn/error log entries to the web app's /api/bot-log
 * endpoint every 30 seconds so they appear in the Error Alerts page.
 */

import { drainLogBuffer, requeueLogEntries } from '../logger';
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
      // Keep the payload, not the complaint. Staying silent here is right --
      // logging a failed flush would recurse into the buffer we are trying to
      // empty -- but silence was being used to discard the entries as well, and
      // those are the only copy the web app will ever see. postBotLog throws on
      // any non-2xx, so this covers the app being down (500) and the flush being
      // rate-limited (429) alike; both are retried on the next tick.
      requeueLogEntries(entries);
    }
  }
}
