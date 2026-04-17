/**
 * Nightly wiki sync scheduler.
 *
 * Fires once per day at a configured local time, running the full
 * Discord→Wiki sync (same as the manual "Rebuild Wiki" trigger).
 * Uses the same sliding tick-window approach as sheetsReconcileService
 * so the scheduled time is hit reliably regardless of bot start offset.
 */

import { errorToMessage, logEvent } from '../logger';
import { config } from '../config';
import { randomUUID } from 'node:crypto';
import type { TrackerAdapter } from './adapter';
import { runNotionSync } from '../scripts/discord-notion-sync';
import { currentWikiSyncOwner, tryAcquireWikiSync } from './wikiSyncLock';

type WikiSyncConfig = {
  enabled: boolean;
  hourLocal: number;
  minuteLocal: number;
  timezone: string;
  intervalMs: number;
};

function localParts(now: Date, timezone: string): { dateKey: string; hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const pick = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const dateKey = `${pick('year')}-${pick('month')}-${pick('day')}`;
  const hour = Number.parseInt(pick('hour'), 10);
  const minute = Number.parseInt(pick('minute'), 10);
  return {
    dateKey,
    hour: Number.isFinite(hour) ? hour : 0,
    minute: Number.isFinite(minute) ? minute : 0,
  };
}

export class WikiSyncScheduler {
  private readonly adapter: TrackerAdapter;
  private readonly cfg: WikiSyncConfig;
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private lastTickTime: Date;
  /** Track which date keys we've already synced to prevent double-runs. */
  private syncedDates = new Set<string>();

  constructor(adapter: TrackerAdapter, cfg: WikiSyncConfig) {
    this.adapter = adapter;
    this.cfg = cfg;
    this.lastTickTime = new Date(Date.now() - cfg.intervalMs);
  }

  start() {
    if (this.timer) {
      return;
    }
    this.timer = setInterval(() => {
      void this.tick();
    }, this.cfg.intervalMs);
    this.timer.unref();
    void this.tick();
    logEvent('info', 'wiki_sync_scheduler_started', {
      intervalMs: this.cfg.intervalMs,
      hourLocal: this.cfg.hourLocal,
      minuteLocal: this.cfg.minuteLocal,
      timezone: this.cfg.timezone,
    });
  }

  stop() {
    if (!this.timer) {
      return;
    }
    clearInterval(this.timer);
    this.timer = null;
  }

  private async tick() {
    if (!this.cfg.enabled) return;
    if (this.running) return;
    this.running = true;
    let lease: ReturnType<typeof tryAcquireWikiSync> | null = null;
    try {
      const now = new Date();
      const parts = localParts(now, this.cfg.timezone);
      const prevParts = localParts(this.lastTickTime, this.cfg.timezone);
      this.lastTickTime = now;

      const targetMin = this.cfg.hourLocal * 60 + this.cfg.minuteLocal;
      const nowMin = parts.hour * 60 + parts.minute;
      const prevMin = prevParts.hour * 60 + prevParts.minute;

      // Fire if target time falls in (prevTick, now] — handles tick alignment drift
      if (nowMin < targetMin || prevMin >= targetMin) {
        return;
      }

      // Skip if already synced today
      if (this.syncedDates.has(parts.dateKey)) {
        return;
      }
      this.syncedDates.add(parts.dateKey);

      // Prune old date keys (keep last 7 days)
      if (this.syncedDates.size > 7) {
        const sorted = Array.from(this.syncedDates).sort();
        for (const key of sorted.slice(0, sorted.length - 7)) {
          this.syncedDates.delete(key);
        }
      }

      logEvent('info', 'wiki_sync_scheduled_triggered', { dateKey: parts.dateKey });
      const runId = randomUUID();
      lease = tryAcquireWikiSync('scheduled');
      if (!lease) {
        logEvent('info', 'wiki_sync_scheduled_skipped_lock_busy', {
          dateKey: parts.dateKey,
          activeOwner: currentWikiSyncOwner(),
        });
        return;
      }
      try {
        await this.adapter.ackNotionSync('running', undefined, 'scheduled', runId);
      } catch (ackErr) {
        logEvent('warn', 'wiki_sync_ack_running_failed', { error: errorToMessage(ackErr) });
      }

      const result = await runNotionSync({
        botToken: config.botToken,
        guildId: config.discordGuildId,
        // Nightly scheduler defaults to wiki-only refresh to avoid repeated
        // Notion archival imports; manual runs keep full Notion+Wiki behavior.
        notionToken: '',
        webBase: config.webAppBaseUrl,
        webReadToken: config.webAppApiReadToken ?? config.webAppApiToken,
        webWriteToken: config.webAppApiWriteToken ?? config.webAppApiToken,
        msgLimit: config.notionSyncMsgLimit,
      });

      if (result.success) {
        logEvent('info', 'wiki_sync_scheduled_complete', { dateKey: parts.dateKey });
        try { await this.adapter.ackNotionSync('success', undefined, 'scheduled', runId); } catch { /* ignore */ }
      } else {
        logEvent('warn', 'wiki_sync_scheduled_failed', { dateKey: parts.dateKey, error: result.error });
        try { await this.adapter.ackNotionSync('error', result.error, 'scheduled', runId); } catch { /* ignore */ }
      }
    } catch (error) {
      logEvent('warn', 'wiki_sync_scheduler_error', { error: errorToMessage(error) });
      try { await this.adapter.ackNotionSync('error', String(error), 'scheduled'); } catch { /* ignore */ }
    } finally {
      lease?.release();
      this.running = false;
    }
  }
}
