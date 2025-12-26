import cron from 'node-cron';
import { DateTime } from 'luxon';
import type { Client } from 'discord.js';
import type { PrismaClient } from '@prisma/client';

const DEFAULT_TIMEZONE = 'America/Chicago';
const DEFAULT_NIGHT_START_WEEKDAY = 2; // 1 = Monday, 7 = Sunday (Tuesday)
const DEFAULT_NIGHT_START_HOUR = 12;
const DEFAULT_PLAY_END_WEEKDAY = 7; // Sunday
const DEFAULT_PLAY_END_HOUR = 12;

export type GuildConfig = {
  timezone?: string;
  nightStartWeekday?: number;
  nightStartHour?: number;
  playEndWeekday?: number;
  playEndHour?: number;
};

function parseGuildConfig(config: unknown): GuildConfig {
  if (!config || typeof config !== 'object') return {};
  return config as GuildConfig;
}

export type SubmissionWindowType = 'Night' | 'Daytime';

export type WindowDefinition = {
  type: SubmissionWindowType;
  startAt: DateTime;
  endAt: DateTime;
  label: string;
};

function computeNextBoundary(localized: DateTime, weekday: number, hour: number): DateTime {
  const anchorThisWeek = localized.set({ weekday, hour, minute: 0, second: 0, millisecond: 0 });
  if (localized <= anchorThisWeek) {
    return anchorThisWeek;
  }
  return anchorThisWeek.plus({ weeks: 1 });
}

function computeMostRecentBoundary(localized: DateTime, weekday: number, hour: number): DateTime {
  const anchorThisWeek = localized.set({ weekday, hour, minute: 0, second: 0, millisecond: 0 });
  if (localized >= anchorThisWeek) {
    return anchorThisWeek;
  }
  return anchorThisWeek.minus({ weeks: 1 });
}

export function computeWindowSchedule(now: DateTime, config: GuildConfig): { current: WindowDefinition; next: WindowDefinition } {
  const timezone = config.timezone ?? DEFAULT_TIMEZONE;
  const nightStartWeekday = config.nightStartWeekday ?? DEFAULT_NIGHT_START_WEEKDAY;
  const nightStartHour = config.nightStartHour ?? DEFAULT_NIGHT_START_HOUR;
  const playEndWeekday = config.playEndWeekday ?? DEFAULT_PLAY_END_WEEKDAY;
  const playEndHour = config.playEndHour ?? DEFAULT_PLAY_END_HOUR;

  const localized = now.setZone(timezone);

  const nextNightStart = computeNextBoundary(localized, nightStartWeekday, nightStartHour);
  const nextPlayEnd = computeNextBoundary(localized, playEndWeekday, playEndHour);
  const lastNightStart = computeMostRecentBoundary(localized, nightStartWeekday, nightStartHour);
  const lastPlayEnd = computeMostRecentBoundary(localized, playEndWeekday, playEndHour);

  const isNight = lastNightStart > lastPlayEnd;
  const current: WindowDefinition = isNight
    ? {
        type: 'Night',
        startAt: lastNightStart,
        endAt: nextPlayEnd,
        label: 'Night',
      }
    : {
        type: 'Daytime',
        startAt: lastPlayEnd,
        endAt: nextNightStart,
        label: 'Daytime',
      };

  const next: WindowDefinition = current.type === 'Night'
    ? {
        type: 'Daytime',
        startAt: current.endAt,
        endAt: nextNightStart,
        label: 'Daytime',
      }
    : {
        type: 'Night',
        startAt: current.endAt,
        endAt: nextPlayEnd,
        label: 'Night',
      };

  return { current, next };
}

async function ensureWindowForGuild(prisma: PrismaClient, guildId: string) {
  const guild = await prisma.guild.findUnique({ where: { id: guildId } });
  const config = parseGuildConfig(guild?.config);
  const timezone = config.timezone ?? DEFAULT_TIMEZONE;
  const now = DateTime.now().setZone(timezone);
  const { current, next } = computeWindowSchedule(now, config);

  const ensureWindow = async (window: WindowDefinition) => {
    const existing = await prisma.submissionWindow.findFirst({
      where: {
        guildId,
        startAt: window.startAt.toJSDate(),
      },
    });

    if (existing) {
      return;
    }

    await prisma.submissionWindow.create({
      data: {
        guildId,
        startAt: window.startAt.toJSDate(),
        endAt: window.endAt.toJSDate(),
        label: window.label,
      },
    });
  };

  await ensureWindow(current);
  await ensureWindow(next);
}

export function scheduleWindowsJob(client: Client, prisma: PrismaClient) {
  const run = async () => {
    const guilds = await prisma.guild.findMany({ select: { id: true } });
    if (guilds.length === 0) return;
    for (const guild of guilds) {
      await ensureWindowForGuild(prisma, guild.id);
    }
  };

  run().catch((err) => {
    console.error('Scheduler init failed:', err);
  });

  cron.schedule('*/10 * * * *', () => {
    run().catch((err) => {
      console.error('Scheduler run failed:', err);
    });
  });
}
