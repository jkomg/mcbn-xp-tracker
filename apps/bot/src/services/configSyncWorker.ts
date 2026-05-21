import { liveConfig } from '../liveConfig';
import { logEvent } from '../logger';
import { config } from '../config';
import { randomUUID } from 'node:crypto';
import type { TrackerAdapter } from './adapter';
import { runNotionSync } from '../scripts/discord-notion-sync';
import { currentWikiSyncOwner, tryAcquireWikiSync } from './wikiSyncLock';

export class ConfigSyncWorker {
  private readonly adapter: TrackerAdapter;
  private readonly intervalMs: number;
  private notionSyncRunning = false;

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

      if (cfg.notionSyncRequested) {
        void this.runNotionSyncBackground();
      }
    } catch (err) {
      logEvent('warn', 'config_sync_failed', { error: String(err) });
    }
  }

  private async runNotionSyncBackground(): Promise<void> {
    if (this.notionSyncRunning) {
      return;
    }
    const lease = tryAcquireWikiSync('manual');
    if (!lease) {
      logEvent('info', 'notion_sync_skipped_lock_busy', {
        activeOwner: currentWikiSyncOwner(),
      });
      return;
    }
    this.notionSyncRunning = true;
    const runId = randomUUID();
    logEvent('info', 'notion_sync_starting', {});
    try {
      await this.adapter.ackNotionSync('running', undefined, 'manual', runId);
    } catch (err) {
      logEvent('warn', 'notion_sync_ack_running_failed', { error: String(err) });
      lease.release();
      this.notionSyncRunning = false;
      return;
    }
    try {
      const result = await runNotionSync({
        botToken: config.botToken,
        guildId: config.discordGuildId,
        notionToken: config.notionToken,
        webBase: config.webAppBaseUrl,
        webReadToken: config.webAppApiReadToken ?? config.webAppApiToken,
        webWriteToken: config.webAppApiWriteToken ?? config.webAppApiToken,
        msgLimit: config.notionSyncMsgLimit,
      });
      if (result.success) {
        logEvent('info', 'notion_sync_completed', {});
        await this.adapter.ackNotionSync('success', undefined, 'manual', runId);
      } else {
        logEvent('warn', 'notion_sync_failed', { error: result.error });
        await this.adapter.ackNotionSync('error', result.error, 'manual', runId);
      }
    } catch (err) {
      logEvent('warn', 'notion_sync_error', { error: String(err) });
      try { await this.adapter.ackNotionSync('error', String(err), 'manual', runId); } catch { /* ignore */ }
    } finally {
      lease.release();
      this.notionSyncRunning = false;
    }
  }

  start(): void {
    void this.sync();
    setInterval(() => void this.sync(), this.intervalMs).unref();
  }
}
