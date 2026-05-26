import { liveConfig } from '../liveConfig';
import { logEvent } from '../logger';
import { config } from '../config';
import { randomUUID } from 'node:crypto';
import type { TrackerAdapter } from './adapter';
import { runWikiSync } from '../scripts/discord-wiki-sync';
import { currentWikiSyncOwner, tryAcquireWikiSync } from './wikiSyncLock';

export class ConfigSyncWorker {
  private readonly adapter: TrackerAdapter;
  private readonly intervalMs: number;
  private wikiSyncRunning = false;

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
      liveConfig.passageOfTimeIntervalMs = cfg.passageOfTimeIntervalMs ?? null;
      liveConfig.reviewNotifierIntervalMs = cfg.reviewNotifierIntervalMs ?? null;
      liveConfig.submissionNotifierIntervalMs = cfg.submissionNotifierIntervalMs ?? null;
      liveConfig.claimReminderIntervalMs = cfg.claimReminderIntervalMs ?? null;
      liveConfig.announcementsChannelId = cfg.announcementsChannelId ?? null;
      logEvent('debug', 'config_sync_done', { liveConfig });

      if (cfg.restartRequested) {
        logEvent('info', 'config_sync_restart_requested', {});
        try {
          await this.adapter.ackBotRestart();
          process.exit(0);
        } catch (ackErr) {
          logEvent('warn', 'config_sync_restart_ack_failed_skipping_exit', { error: String(ackErr) });
        }
      }

      if (cfg.wikiSyncRequested) {
        void this.runWikiSyncBackground();
      }
    } catch (err) {
      logEvent('warn', 'config_sync_failed', { error: String(err) });
    }
  }

  private async runWikiSyncBackground(): Promise<void> {
    if (this.wikiSyncRunning) {
      return;
    }
    const lease = tryAcquireWikiSync('manual');
    if (!lease) {
      logEvent('info', 'wiki_sync_skipped_lock_busy', {
        activeOwner: currentWikiSyncOwner(),
      });
      return;
    }
    this.wikiSyncRunning = true;
    const runId = randomUUID();
    logEvent('info', 'wiki_sync_starting', {});
    try {
      await this.adapter.ackWikiSync('running', undefined, 'manual', runId);
    } catch (err) {
      logEvent('warn', 'wiki_sync_ack_running_failed', { error: String(err) });
      lease.release();
      this.wikiSyncRunning = false;
      return;
    }
    try {
      const result = await runWikiSync({
        botToken: config.botToken,
        guildId: config.discordGuildId,
        webBase: config.webAppBaseUrl,
        webReadToken: config.webAppApiReadToken ?? config.webAppApiToken,
        webWriteToken: config.webAppApiWriteToken ?? config.webAppApiToken,
      });
      if (result.success) {
        logEvent('info', 'wiki_sync_completed', {});
        await this.adapter.ackWikiSync('success', undefined, 'manual', runId);
      } else {
        logEvent('warn', 'wiki_sync_failed', { error: result.error });
        await this.adapter.ackWikiSync('error', result.error, 'manual', runId);
      }
    } catch (err) {
      logEvent('warn', 'wiki_sync_error', { error: String(err) });
      try { await this.adapter.ackWikiSync('error', String(err), 'manual', runId); } catch { /* ignore */ }
    } finally {
      lease.release();
      this.wikiSyncRunning = false;
    }
  }

  start(): void {
    void this.sync();
    setInterval(() => void this.sync(), this.intervalMs).unref();
  }
}
