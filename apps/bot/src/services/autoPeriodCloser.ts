import { ActionRowBuilder, ButtonBuilder, ButtonStyle, type Client } from 'discord.js';
import { errorToMessage, logEvent } from '../logger';
import type { TrackerAdapter } from './adapter';
import { findCubbyChannel } from './cubbyChannels';

type AutoPeriodCloserConfig = {
  enabled: boolean;
  guildId?: string;
  intervalMs: number;
};

function buildCloseReminderText(periodLabel: string, characterName: string, discordId: string): string {
  return [
    `Hey <@${discordId}>`,
    '',
    `**${periodLabel}** has just closed for XP submissions.`,
    '',
    `Your claim for **${characterName}** was not submitted. Please reach out to a Storyteller if you need an extension.`,
  ].join('\n');
}

export class AutoPeriodCloser {
  private readonly client: Client;
  private readonly adapter: TrackerAdapter;
  private readonly config: AutoPeriodCloserConfig;
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(client: Client, adapter: TrackerAdapter, config: AutoPeriodCloserConfig) {
    this.client = client;
    this.adapter = adapter;
    this.config = config;
  }

  start() {
    if (!this.config.enabled || this.timer) {
      return;
    }
    if (!this.config.guildId) {
      logEvent('warn', 'auto_period_closer_disabled_missing_guild');
      return;
    }
    this.timer = setInterval(() => {
      void this.tick();
    }, this.config.intervalMs);
    this.timer.unref();
    void this.tick();
    logEvent('info', 'auto_period_closer_started', { intervalMs: this.config.intervalMs });
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
      const result = await this.adapter.autoClosePeriod();
      if (!result.ok) {
        logEvent('warn', 'auto_period_closer_failed', { reason: result.reason });
        return;
      }
      if (!result.closed) {
        logEvent('debug', 'auto_period_closer_skipped', { reason: result.reason });
        return;
      }

      logEvent('info', 'auto_period_closer_closed', {
        periodLabel: result.periodLabel,
        reminderTargets: result.reminderTargets?.length ?? 0,
      });

      const targets = result.reminderTargets ?? [];
      if (targets.length === 0 || !this.config.guildId) {
        return;
      }

      const guild = await this.client.guilds.fetch(this.config.guildId).catch(() => null);
      if (!guild) {
        logEvent('warn', 'auto_period_closer_guild_not_found', { guildId: this.config.guildId });
        return;
      }

      let sent = 0;
      let failed = 0;
      for (const target of targets) {
        try {
          const channel = await findCubbyChannel(guild, target.characterName);
          if (!channel) {
            logEvent('warn', 'auto_period_closer_channel_missing', {
              characterName: target.characterName,
              discordId: target.discordId,
            });
            failed += 1;
            continue;
          }
          await channel.send({
            content: buildCloseReminderText(result.periodLabel ?? 'the period', target.characterName, target.discordId),
          });
          sent += 1;
        } catch (error) {
          logEvent('warn', 'auto_period_closer_dm_failed', {
            characterName: target.characterName,
            discordId: target.discordId,
            error: errorToMessage(error),
          });
          failed += 1;
        }
      }

      logEvent('info', 'auto_period_closer_reminders_sent', {
        periodLabel: result.periodLabel,
        sent,
        failed,
      });
    } catch (error) {
      logEvent('warn', 'auto_period_closer_error', { error: errorToMessage(error) });
    } finally {
      this.running = false;
    }
  }
}
