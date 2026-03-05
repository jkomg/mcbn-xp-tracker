import fs from 'node:fs';
import path from 'node:path';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, type Client } from 'discord.js';
import { errorToMessage, logEvent } from '../logger';
import type { TrackerAdapter } from './adapter';

export const CLAIM_REMINDER_BUTTON_PREFIX = 'xp:claim-reminder:';
export const CLAIM_REMINDER_ACTION_START = `${CLAIM_REMINDER_BUTTON_PREFIX}start`;
export const CLAIM_REMINDER_ACTION_NOT_NOW = `${CLAIM_REMINDER_BUTTON_PREFIX}not-now`;
export const CLAIM_REMINDER_ACTION_OPT_OUT = `${CLAIM_REMINDER_BUTTON_PREFIX}opt-out`;

type ReminderPrefs = {
  optOut?: boolean;
  snoozeUntilEpoch?: number;
};

type PrefStore = Record<string, ReminderPrefs>;

type ClaimReminderServiceConfig = {
  enabled: boolean;
  intervalMs: number;
  hourLocal: number;
  timezone: string;
};

const PREFS_PATH = path.resolve(process.cwd(), 'data', 'claim-reminder-preferences.json');

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

function dayAndHourInZone(now: Date, timeZone: string): { dayKey: string; hour: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
  }).formatToParts(now);

  const pick = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const dayKey = `${pick('year')}-${pick('month')}-${pick('day')}`;
  const hour = Number.parseInt(pick('hour'), 10);
  return { dayKey, hour: Number.isFinite(hour) ? hour : 0 };
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
    this.timer = setInterval(() => {
      void this.tick();
    }, this.config.intervalMs);
    this.timer.unref();
    void this.tick();
    logEvent('info', 'claim_reminder_service_started', {
      intervalMs: this.config.intervalMs,
      hourLocal: this.config.hourLocal,
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
      const { dayKey, hour } = dayAndHourInZone(now, this.config.timezone);
      if (hour !== this.config.hourLocal) {
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

      const nowEpoch = Math.floor(Date.now() / 1000);
      const prefs = readPrefs();
      let sent = 0;
      let skippedOptOut = 0;
      let skippedSnooze = 0;

      for (const target of snapshot.targets) {
        const pref = prefs[target.discordId] ?? {};
        if (pref.optOut) {
          skippedOptOut += 1;
          continue;
        }
        if ((pref.snoozeUntilEpoch ?? 0) > nowEpoch) {
          skippedSnooze += 1;
          continue;
        }

        const user = await this.client.users.fetch(target.discordId).catch(() => null);
        if (!user) {
          continue;
        }

        const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId(CLAIM_REMINDER_ACTION_START).setStyle(ButtonStyle.Success).setLabel('Start Claim'),
          new ButtonBuilder().setCustomId(CLAIM_REMINDER_ACTION_NOT_NOW).setStyle(ButtonStyle.Secondary).setLabel('Not Now'),
          new ButtonBuilder().setCustomId(CLAIM_REMINDER_ACTION_OPT_OUT).setStyle(ButtonStyle.Danger).setLabel('Stop Reminders'),
        );

        const characterList = target.characterNames.map((c) => `- ${c}`).join('\n');
        await user
          .send({
            content: [
              `Sunrise reminder for **${snapshot.currentNight}**.`,
              '',
              'Characters with no submitted claim yet:',
              characterList || '- none',
              '',
              'Use `/xp submit` (wizard) or `/xp claim` when ready.',
            ].join('\n'),
            components: [actionRow],
          })
          .catch(() => null);
        sent += 1;
      }

      this.lastRunDayKey = dayKey;
      logEvent('info', 'claim_reminder_service_run', {
        dayKey,
        currentNight: snapshot.currentNight,
        targets: snapshot.targets.length,
        sent,
        skippedOptOut,
        skippedSnooze,
      });
    } catch (error) {
      logEvent('warn', 'claim_reminder_service_error', { error: errorToMessage(error) });
    } finally {
      this.running = false;
    }
  }
}
