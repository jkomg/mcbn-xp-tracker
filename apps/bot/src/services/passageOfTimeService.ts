import fs from 'node:fs';
import path from 'node:path';
import { AttachmentBuilder, ChannelType, type Client, type GuildTextBasedChannel, type TextChannel, type NewsChannel } from 'discord.js';
import { errorToMessage, logEvent } from '../logger';

type ScheduledEventConfig = {
  name: 'sunrise' | 'sunset' | 'downtime';
  weekdayLocal: number;
  hourLocal: number;
  minuteLocal: number;
  anchorDate: string;
  cadenceWeeks: number;
  body: string;
  imageFile?: string;
};

export const PASSAGE_SUNSET_MESSAGE = `The kindred of Nashville once again rule the night. Now the predatory denizens of Music City continue their attempts to rebuild, while thralls bound to their masters serve their every whim, and unknowing mortals expose themselves to danger by roaming in the dark.

Those of you who have not completed your experience submissions, please do so when you get the chance! This night shall end in two weeks!`;

export const PASSAGE_SUNRISE_MESSAGE = `The sun rises over Music City as creatures of the night retreat into their havens. Post your experience submissions through the player portal (https://mcbn.jkomg.us/player/) and begin wrapping up active scenes! You may continue roleplaying in your current scene until the next night begins, and if you wish to still continue a scene, then please move it into to-be-continued!

The next night begins on Tuesday at noon CT, and will last until two Sundays from now!`;

export const PASSAGE_DOWNTIME_MESSAGE = `It's that time again! Time for server downtime! Happening every 8 weeks (4 IC nights), it's time to spend your character's XP in your Character Story ticket and also to roll on Projects (8 rolls, remember). We'll see you in your tickets!`;

export function getPassageMessage(name: 'sunrise' | 'sunset' | 'downtime'): string {
  if (name === 'sunset') {
    return PASSAGE_SUNSET_MESSAGE;
  }
  if (name === 'downtime') {
    return PASSAGE_DOWNTIME_MESSAGE;
  }
  return PASSAGE_SUNRISE_MESSAGE;
}

type PassageOfTimeConfig = {
  enabled: boolean;
  guildId?: string;
  channelId?: string;
  testMode: boolean;
  testChannelId?: string;
  intervalMs: number;
  timezone: string;
  mentionRoleIds: string[];
  events: ScheduledEventConfig[];
};

type ServiceState = {
  postedKeys: string[];
};

const BOT_ROOT = path.resolve(__dirname, '..', '..');
const STATE_PATH = path.join(BOT_ROOT, 'data', 'passage-of-time-state.json');
const CYCLE_DAYS = 7;

function ensureStateDir() {
  fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
}

function readState(): ServiceState {
  try {
    const raw = fs.readFileSync(STATE_PATH, 'utf8');
    const parsed = JSON.parse(raw) as ServiceState;
    if (parsed && Array.isArray(parsed.postedKeys)) {
      return parsed;
    }
  } catch {
    // ignore
  }
  return { postedKeys: [] };
}

function writeState(state: ServiceState) {
  ensureStateDir();
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

function toDateOnly(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function daysBetweenUtc(a: Date, b: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.floor((a.getTime() - b.getTime()) / msPerDay);
}

function localParts(now: Date, timezone: string): { dateKey: string; weekday: number; hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const pick = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const dateKey = `${pick('year')}-${pick('month')}-${pick('day')}`;
  const hour = Number.parseInt(pick('hour'), 10);
  const minute = Number.parseInt(pick('minute'), 10);
  const weekdayMap: Record<string, number> = {
    sun: 0,
    mon: 1,
    tue: 2,
    wed: 3,
    thu: 4,
    fri: 5,
    sat: 6,
  };
  const weekday = weekdayMap[pick('weekday').toLowerCase()] ?? -1;
  return {
    dateKey,
    weekday,
    hour: Number.isFinite(hour) ? hour : 0,
    minute: Number.isFinite(minute) ? minute : 0,
  };
}

function isCadenceDate(localDateKey: string, anchorDate: string, cadenceWeeks: number): boolean {
  const localDate = toDateOnly(localDateKey);
  const anchor = toDateOnly(anchorDate);
  if (!localDate || !anchor || cadenceWeeks < 1) {
    return false;
  }
  const delta = daysBetweenUtc(localDate, anchor);
  if (delta < 0) {
    return false;
  }
  return delta % (cadenceWeeks * CYCLE_DAYS) === 0;
}

function roleMentions(roleIds: string[]): string {
  const ids = roleIds.map((v) => String(v).trim()).filter((v) => /^\d{17,20}$/.test(v));
  return ids.map((id) => `<@&${id}>`).join(' ');
}

function isSendableChannelType(type: ChannelType): boolean {
  return (
    type === ChannelType.GuildText ||
    type === ChannelType.GuildAnnouncement ||
    type === ChannelType.PublicThread ||
    type === ChannelType.PrivateThread
  );
}

async function resolveTargetChannel(
  client: Client,
  guildId: string,
  channelId?: string,
  fallbackName?: string,
): Promise<GuildTextBasedChannel | null> {
  const guild = await client.guilds.fetch(guildId).catch((err) => {
    logEvent('warn', 'passage_resolve_guild_failed', { guildId, error: errorToMessage(err) });
    return null;
  });
  if (!guild) {
    return null;
  }

  if (channelId) {
    const channel = await guild.channels.fetch(channelId).catch((err) => {
      logEvent('warn', 'passage_resolve_channel_fetch_failed', { channelId, error: errorToMessage(err) });
      return null;
    });
    if (channel && isSendableChannelType(channel.type)) {
      return channel as TextChannel | NewsChannel;
    }
    if (channel) {
      logEvent('warn', 'passage_resolve_channel_wrong_type', { channelId, type: channel.type });
    }
  }

  if (!fallbackName) {
    return null;
  }

  const channels = await guild.channels.fetch();
  for (const channel of channels.values()) {
    if (!channel) {
      continue;
    }
    if (!isSendableChannelType(channel.type)) {
      continue;
    }
    if (channel.name.toLowerCase() === fallbackName.toLowerCase()) {
      return channel as TextChannel | NewsChannel;
    }
  }
  return null;
}

export class PassageOfTimeService {
  private readonly client: Client;
  private readonly config: PassageOfTimeConfig;
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(client: Client, config: PassageOfTimeConfig) {
    this.client = client;
    this.config = config;
  }

  start() {
    if (!this.config.enabled || this.timer) {
      return;
    }
    if (!this.config.guildId) {
      logEvent('warn', 'passage_service_disabled_missing_guild');
      return;
    }
    this.timer = setInterval(() => {
      void this.tick();
    }, this.config.intervalMs);
    this.timer.unref();
    void this.tick();
    logEvent('info', 'passage_service_started', {
      intervalMs: this.config.intervalMs,
      timezone: this.config.timezone,
      testMode: this.config.testMode,
      events: this.config.events.map((e) => ({
        name: e.name,
        weekdayLocal: e.weekdayLocal,
        hourLocal: e.hourLocal,
        minuteLocal: e.minuteLocal,
        cadenceWeeks: e.cadenceWeeks,
        anchorDate: e.anchorDate,
      })),
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
      const guildId = this.config.guildId;
      if (!guildId) {
        return;
      }
      const targetChannelId = this.config.testMode ? this.config.testChannelId : this.config.channelId;
      const channel = await resolveTargetChannel(
        this.client,
        guildId,
        targetChannelId,
        this.config.testMode ? 'bot-testing' : 'passage-of-time',
      );
      if (!channel) {
        logEvent('warn', 'passage_service_channel_missing', {
          guildId,
          channelId: targetChannelId,
          testMode: this.config.testMode,
        });
        return;
      }

      const now = new Date();
      const parts = localParts(now, this.config.timezone);
      const state = readState();
      const posted = new Set(state.postedKeys);
      const minuteWindow = Math.max(1, Math.ceil(this.config.intervalMs / 60_000));
      let postedCount = 0;

      for (const event of this.config.events) {
        if (!event.anchorDate || !/^\d{4}-\d{2}-\d{2}$/.test(event.anchorDate)) {
          continue;
        }
        if (parts.weekday !== event.weekdayLocal) {
          continue;
        }
        if (parts.hour !== event.hourLocal) {
          continue;
        }
        if (parts.minute < event.minuteLocal || parts.minute >= event.minuteLocal + minuteWindow) {
          continue;
        }
        if (!isCadenceDate(parts.dateKey, event.anchorDate, event.cadenceWeeks)) {
          continue;
        }

        const eventKey = `${event.name}:${parts.dateKey}`;
        if (posted.has(eventKey)) {
          continue;
        }

        const mentionPrefix = this.config.testMode ? '' : roleMentions(this.config.mentionRoleIds);
        const content = mentionPrefix ? `${mentionPrefix}\n\n${event.body}` : event.body;

        if (event.imageFile && fs.existsSync(event.imageFile)) {
          const filename = path.basename(event.imageFile);
          const attachment = new AttachmentBuilder(event.imageFile, { name: filename });
          await channel.send({
            content,
            files: [attachment],
            embeds: [{ image: { url: `attachment://${filename}` } }],
          });
        } else {
          await channel.send({ content });
        }
        posted.add(eventKey);
        postedCount += 1;
        logEvent('info', 'passage_service_posted', {
          eventName: event.name,
          dateKey: parts.dateKey,
          channelId: channel.id,
          testMode: this.config.testMode,
        });
      }

      if (postedCount > 0) {
        writeState({ postedKeys: Array.from(posted).slice(-1000) });
      }
    } catch (error) {
      logEvent('warn', 'passage_service_error', { error: errorToMessage(error) });
    } finally {
      this.running = false;
    }
  }
}
