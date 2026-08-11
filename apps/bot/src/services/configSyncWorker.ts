import { liveConfig } from '../liveConfig';
import { errorToMessage, logEvent } from '../logger';
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
      if (cfg.newNightBroadcastEnabled !== null) liveConfig.newNightBroadcastEnabled = cfg.newNightBroadcastEnabled;
      liveConfig.newNightBroadcastMessage = cfg.newNightBroadcastMessage ?? config.passageNewNightBroadcastMessage;
      if (cfg.huntConsequenceEnabled !== null) liveConfig.huntConsequenceEnabled = cfg.huntConsequenceEnabled;
      liveConfig.passageOfTimeIntervalMs = cfg.passageOfTimeIntervalMs ?? null;
      liveConfig.reviewNotifierIntervalMs = cfg.reviewNotifierIntervalMs ?? null;
      liveConfig.submissionNotifierIntervalMs = cfg.submissionNotifierIntervalMs ?? null;
      liveConfig.claimReminderIntervalMs = cfg.claimReminderIntervalMs ?? null;
      liveConfig.announcementsChannelId = cfg.announcementsChannelId ?? null;
      liveConfig.ccTicketMonitorEnabled = cfg.ccTicketMonitorEnabled ?? config.ccTicketMonitorEnabled;
      liveConfig.ccTicketCategoryIds = cfg.ccTicketCategoryIds !== null
        ? new Set(cfg.ccTicketCategoryIds.split(',').map(s => s.trim()).filter(Boolean))
        : new Set(config.ccTicketCategoryIds);
      // A blank override (an admin clearing the Settings field to restore the
      // built-in default, per that field's own help text) must fall back to
      // the .env/default set, not resolve to an empty Set that silently
      // stops counting that category.
      liveConfig.activityIcCategoryIds = cfg.activityIcCategoryIds && cfg.activityIcCategoryIds.trim()
        ? new Set(cfg.activityIcCategoryIds.split(',').map(s => s.trim()).filter(Boolean))
        : new Set(config.activityIcCategoryIds);
      liveConfig.activityOocCategoryIds = cfg.activityOocCategoryIds && cfg.activityOocCategoryIds.trim()
        ? new Set(cfg.activityOocCategoryIds.split(',').map(s => s.trim()).filter(Boolean))
        : new Set(config.activityOocCategoryIds);
      liveConfig.activityRollsCategoryIds = cfg.activityRollsCategoryIds && cfg.activityRollsCategoryIds.trim()
        ? new Set(cfg.activityRollsCategoryIds.split(',').map(s => s.trim()).filter(Boolean))
        : new Set(config.activityRollsCategoryIds);
      if (cfg.honeypotEnabled !== null) liveConfig.honeypotEnabled = cfg.honeypotEnabled;
      if (cfg.honeypotRequireYoungAccount !== null) liveConfig.honeypotRequireYoungAccount = cfg.honeypotRequireYoungAccount;
      if (cfg.mentionBreakerEnabled !== null) liveConfig.mentionBreakerEnabled = cfg.mentionBreakerEnabled;
      liveConfig.honeypotMaxAccountAgeDays = cfg.honeypotMaxAccountAgeDays ?? config.honeypotMaxAccountAgeDays;
      liveConfig.honeypotChannelId = cfg.honeypotChannelId ?? config.honeypotChannelId;
      liveConfig.honeypotModLogChannelId = cfg.honeypotModLogChannelId ?? config.honeypotModLogChannelId;
      liveConfig.honeypotWhitelistedRoleIds = cfg.honeypotWhitelistedRoleIds != null
        ? new Set(cfg.honeypotWhitelistedRoleIds.split(',').map(s => s.trim()).filter(Boolean))
        : new Set(config.honeypotWhitelistedRoleIds);
      liveConfig.mentionBreakerMaxMentions = cfg.mentionBreakerMaxMentions ?? config.mentionBreakerMaxMentions;
      liveConfig.mentionBreakerTimeoutMinutes = cfg.mentionBreakerTimeoutMinutes ?? config.mentionBreakerTimeoutMinutes;
      liveConfig.mentionBreakerExemptRoleIds = cfg.mentionBreakerExemptRoleIds != null
        ? new Set(cfg.mentionBreakerExemptRoleIds.split(',').map(s => s.trim()).filter(Boolean))
        : new Set(config.mentionBreakerExemptRoleIds);
      liveConfig.mentionBreakerModLogChannelId = cfg.mentionBreakerModLogChannelId ?? config.mentionBreakerModLogChannelId;
      liveConfig.verifiedMemberRoleId = cfg.verifiedMemberRoleId ?? config.verifiedMemberRoleId ?? '';
      if (cfg.newMemberGateEnabled !== null) liveConfig.newMemberGateEnabled = cfg.newMemberGateEnabled;
      liveConfig.newMemberGateWelcomeChannelId = cfg.newMemberGateWelcomeChannelId ?? config.newMemberGateWelcomeChannelId;
      liveConfig.newMemberGateSheetInProgressRoleId = cfg.newMemberGateSheetInProgressRoleId ?? config.newMemberGateSheetInProgressRoleId;
      liveConfig.newMemberGateLurkerRoleId = cfg.newMemberGateLurkerRoleId ?? config.newMemberGateLurkerRoleId;
      liveConfig.disabledCommands = cfg.disabledCommands != null
        ? new Set(cfg.disabledCommands.split(',').map(s => s.trim()).filter(Boolean))
        : new Set();
      liveConfig.correspondenceDeliveryChannelId = cfg.correspondenceDeliveryChannelId ?? config.correspondenceDeliveryChannelId;
      liveConfig.correspondenceContactChannelId = cfg.correspondenceContactChannelId ?? config.correspondenceContactChannelId;
      liveConfig.correspondencePrestationChannelId = cfg.correspondencePrestationChannelId ?? config.correspondencePrestationChannelId;
      liveConfig.correspondenceSocialChannelId = cfg.correspondenceSocialChannelId ?? config.correspondenceSocialChannelId;
      liveConfig.correspondenceCobwebChannelId = cfg.correspondenceCobwebChannelId ?? config.correspondenceCobwebChannelId;
      liveConfig.correspondenceRumorChannelId = cfg.correspondenceRumorChannelId ?? config.correspondenceRumorChannelId;
      liveConfig.correspondenceSceneRequestChannelId = cfg.correspondenceSceneRequestChannelId ?? config.correspondenceSceneRequestChannelId;
      // Rebuild testerDiscordIds each sync so removals are respected:
      // start from the env-seeded snapshot, then union in current DB staff.
      config.testerDiscordIds = new Set(config.envTesterDiscordIds);
      if (config.testRequesterDiscordId) config.testerDiscordIds.add(config.testRequesterDiscordId);
      if (Array.isArray(cfg.staffDiscordIds)) {
        for (const id of cfg.staffDiscordIds) {
          if (id) config.testerDiscordIds.add(id);
        }
      }
      logEvent('debug', 'config_sync_done', { liveConfig });

      if (cfg.restartRequested) {
        logEvent('info', 'config_sync_restart_requested', {});
        try {
          await this.adapter.ackBotRestart();
          process.exit(0);
        } catch (ackErr) {
          logEvent('warn', 'config_sync_restart_ack_failed_skipping_exit', { error: errorToMessage(ackErr) });
        }
      }

      if (cfg.wikiSyncRequested) {
        void this.runWikiSyncBackground();
      }
    } catch (err) {
      logEvent('warn', 'config_sync_failed', { error: errorToMessage(err) });
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
      logEvent('warn', 'wiki_sync_ack_running_failed', { error: errorToMessage(err) });
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
        logEvent('info', 'wiki_sync_completed', { warningCount: result.warnings?.length ?? 0 });
        await this.adapter.ackWikiSync('success', undefined, 'manual', runId, result.warnings);
      } else {
        logEvent('warn', 'wiki_sync_failed', { error: result.error });
        await this.adapter.ackWikiSync('error', result.error, 'manual', runId);
      }
    } catch (err) {
      logEvent('warn', 'wiki_sync_error', { error: errorToMessage(err) });
      try { await this.adapter.ackWikiSync('error', errorToMessage(err), 'manual', runId); } catch { /* ignore */ }
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
