import { liveConfig } from '../liveConfig';
import { logEvent } from '../logger';
import { config } from '../config';
import type { TrackerAdapter } from './adapter';
import { runNotionSync } from '../scripts/discord-notion-sync';

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
        } catch (ackErr) {
          logEvent('warn', 'config_sync_restart_ack_failed', { error: String(ackErr) });
        }
        process.exit(0);
      }

      if (cfg.notionSyncRequested && !this.notionSyncRunning) {
        void this.runNotionSyncBackground();
      }
    } catch (err) {
      logEvent('warn', 'config_sync_failed', { error: String(err) });
    }
  }

  private async runNotionSyncBackground(): Promise<void> {
    this.notionSyncRunning = true;
    logEvent('info', 'notion_sync_starting', {});
    try {
      await this.adapter.ackNotionSync('running');
    } catch (err) {
      logEvent('warn', 'notion_sync_ack_running_failed', { error: String(err) });
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
        msgLimit: config.notionSyncMsgLimit,
      });
      if (result.success) {
        logEvent('info', 'notion_sync_completed', {});
        await this.adapter.ackNotionSync('success');
      } else {
        logEvent('warn', 'notion_sync_failed', { error: result.error });
        await this.adapter.ackNotionSync('error', result.error);
      }
    } catch (err) {
      logEvent('warn', 'notion_sync_error', { error: String(err) });
      try { await this.adapter.ackNotionSync('error', String(err)); } catch { /* ignore */ }
    } finally {
      this.notionSyncRunning = false;
    }
  }

  start(): void {
    void this.sync();
    setInterval(() => void this.sync(), this.intervalMs).unref();
  }
}
