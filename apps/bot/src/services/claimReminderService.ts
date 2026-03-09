import fs from 'node:fs';
import path from 'node:path';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, type Client } from 'discord.js';
import { errorToMessage, logEvent } from '../logger';
import type { TrackerAdapter } from './adapter';
import { findCubbyChannel } from './cubbyChannels';

export const CLAIM_REMINDER_BUTTON_PREFIX = 'xp:claim-reminder:';
export const CLAIM_REMINDER_ACTION_START = 'start';
export const CLAIM_REMINDER_ACTION_NOT_NOW = 'not-now';
export const CLAIM_REMINDER_ACTION_OPT_OUT = 'opt-out';

type ReminderPrefs = {
  optOut?: boolean;
  snoozeUntilEpoch?: number;
};

type PrefStore = Record<string, ReminderPrefs>;

type ClaimReminderServiceConfig = {
  enabled: boolean;
  guildId?: string;
  intervalMs: number;
  weekdayLocal: number;
  hourLocal: number;
  minuteLocal: number;
  timezone: string;
};

const BOT_ROOT = path.resolve(__dirname, '..', '..');
const PREFS_PATH = path.join(BOT_ROOT, 'data', 'claim-reminder-preferences.json');

export function buildClaimReminderText(currentNight: string, characterName: string, discordId: string): string {
  return [
    `Hey <@${discordId}>`,
    '',
    `Sunrise reminder for **${currentNight}**.`,
    '',
    `Please submit your XP claim for **${characterName}**.`,
    '',
    'Use `/xp submit` (wizard) or `/xp claim` when ready.',
  ].join('\n');
}

function actionCustomId(action: string, targetDiscordId: string): string {
  return `${CLAIM_REMINDER_BUTTON_PREFIX}${action}:${targetDiscordId}`;
}

export function buildClaimReminderActionRow(targetDiscordId: string) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(actionCustomId(CLAIM_REMINDER_ACTION_START, targetDiscordId))
      .setStyle(ButtonStyle.Success)
      .setLabel('Start Claim'),
    new ButtonBuilder()
      .setCustomId(actionCustomId(CLAIM_REMINDER_ACTION_NOT_NOW, targetDiscordId))
      .setStyle(ButtonStyle.Secondary)
      .setLabel('Not Now'),
    new ButtonBuilder()
      .setCustomId(actionCustomId(CLAIM_REMINDER_ACTION_OPT_OUT, targetDiscordId))
      .setStyle(ButtonStyle.Danger)
      .setLabel('Stop Reminders'),
  );
}

function ensurePrefsDir() {
  fs.mkdirSync(path.dirname(PREFS_PATH), { recursive: true });
}

function readPrefs(): PrefStore {
  try {
    const raw = fs.readFileSync(PREFS_PATH, 'utf8');
    const parsed = JSON.parse(raw) as PrefStore;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writePrefs(prefs: PrefStore) {
  ensurePrefsDir();
  fs.writeFileSync(PREFS_PATH, JSON.stringify(prefs, null, 2));
}

export function setClaimReminderSnooze(discordId: string, snoozeHours: number) {
  const prefs = readPrefs();
  const current = prefs[discordId] ?? {};
  current.snoozeUntilEpoch = Math.floor(Date.now() / 1000) + Math.max(1, Math.floor(snoozeHours)) * 3600;
  prefs[discordId] = current;
  writePrefs(prefs);
}

export function setClaimReminderOptOut(discordId: string, optOut: boolean) {
  const prefs = readPrefs();
  const current = prefs[discordId] ?? {};
  current.optOut = optOut;
  if (!optOut) {
    current.snoozeUntilEpoch = 0;
  }
  prefs[discordId] = current;
  writePrefs(prefs);
}

function dayHourMinuteInZone(
  now: Date,
  timeZone: string,
): { dayKey: string; weekday: number; hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);

  const pick = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const dayKey = `${pick('year')}-${pick('month')}-${pick('day')}`;
  const hour = Number.parseInt(pick('hour'), 10);
  const minute = Number.parseInt(pick('minute'), 10);
  const weekdayLabel = pick('weekday').toLowerCase();
  const weekdayMap: Record<string, number> = {
    sun: 0,
    mon: 1,
    tue: 2,
    wed: 3,
    thu: 4,
    fri: 5,
    sat: 6,
  };
  return {
    dayKey,
    weekday: weekdayMap[weekdayLabel] ?? -1,
    hour: Number.isFinite(hour) ? hour : 0,
    minute: Number.isFinite(minute) ? minute : 0,
  };
}

export class ClaimReminderService {
  private readonly client: Client;
  private readonly adapter: TrackerAdapter;
  private readonly config: ClaimReminderServiceConfig;
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private lastRunDayKey = '';

  constructor(client: Client, adapter: TrackerAdapter, config: ClaimReminderServiceConfig) {
    this.client = client;
    this.adapter = adapter;
    this.config = config;
  }

  start() {
    if (!this.config.enabled || this.timer) {
      return;
    }
    if (!this.config.guildId) {
      logEvent('warn', 'claim_reminder_service_disabled_missing_guild');
      return;
    }
    this.timer = setInterval(() => {
      void this.tick();
    }, this.config.intervalMs);
    this.timer.unref();
    void this.tick();
    logEvent('info', 'claim_reminder_service_started', {
      intervalMs: this.config.intervalMs,
      weekdayLocal: this.config.weekdayLocal,
      hourLocal: this.config.hourLocal,
      minuteLocal: this.config.minuteLocal,
      timezone: this.config.timezone,
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
    if (this.running) {
      return;
    }
    this.running = true;
    try {
      const now = new Date();
      const { dayKey, weekday, hour, minute } = dayHourMinuteInZone(now, this.config.timezone);
      if (weekday !== this.config.weekdayLocal) {
        return;
      }
      if (hour !== this.config.hourLocal) {
        return;
      }
      const windowMinutes = Math.max(1, Math.ceil(this.config.intervalMs / 60_000));
      if (minute < this.config.minuteLocal || minute >= this.config.minuteLocal + windowMinutes) {
        return;
      }
      if (dayKey === this.lastRunDayKey) {
        return;
      }

      const snapshot = await this.adapter.getClaimReminderTargets();
      if (!snapshot.currentNight || snapshot.targets.length === 0) {
        this.lastRunDayKey = dayKey;
        logEvent('info', 'claim_reminder_service_no_targets', { dayKey });
        return;
      }
      const guildId = this.config.guildId;
      if (!guildId) {
        logEvent('warn', 'claim_reminder_service_disabled_missing_guild');
        return;
      }
      const guild = await this.client.guilds.fetch(guildId).catch(() => null);
      if (!guild) {
        logEvent('warn', 'claim_reminder_service_guild_not_found', { guildId });
        return;
      }

      const nowEpoch = Math.floor(Date.now() / 1000);
      const prefs = readPrefs();
      let sent = 0;
      let skippedOptOut = 0;
      let skippedSnooze = 0;

      for (const target of snapshot.targets) {
        try {
          const pref = prefs[target.discordId] ?? {};
          if (pref.optOut) {
            skippedOptOut += 1;
            continue;
          }
          if ((pref.snoozeUntilEpoch ?? 0) > nowEpoch) {
            skippedSnooze += 1;
            continue;
          }

          const channel = await findCubbyChannel(guild, target.characterName);
          if (!channel) {
            logEvent('warn', 'claim_reminder_channel_missing', {
              characterName: target.characterName,
              discordId: target.discordId,
            });
            continue;
          }
          const actionRow = buildClaimReminderActionRow(target.discordId);
          await channel.send({
            content: buildClaimReminderText(snapshot.currentNight, target.characterName, target.discordId),
            components: [actionRow],
          });
          sent += 1;
        } catch (error) {
          logEvent('warn', 'claim_reminder_target_failed', {
            characterName: target.characterName,
            discordId: target.discordId,
            error: errorToMessage(error),
          });
          continue;
        }
      }

      const failed = Math.max(0, snapshot.targets.length - sent - skippedOptOut - skippedSnooze);
      if (!(sent === 0 && failed > 0)) {
        this.lastRunDayKey = dayKey;
      }
      logEvent('info', 'claim_reminder_service_run', {
        dayKey,
        currentNight: snapshot.currentNight,
        targets: snapshot.targets.length,
        sent,
        skippedOptOut,
        skippedSnooze,
        failed,
        willRetryWindow: sent === 0 && failed > 0,
      });
    } catch (error) {
      logEvent('warn', 'claim_reminder_service_error', { error: errorToMessage(error) });
    } finally {
      this.running = false;
    }
  }
}
