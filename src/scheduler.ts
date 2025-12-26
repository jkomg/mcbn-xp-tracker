import cron from 'node-cron';
import { DateTime } from 'luxon';
import type { Client } from 'discord.js';
import type { PrismaClient } from '@prisma/client';

const DEFAULT_TIMEZONE = 'America/Chicago';
const DEFAULT_WINDOW_LENGTH_HOURS = 7 * 24;
const DEFAULT_ANCHOR_WEEKDAY = 7; // 1 = Monday, 7 = Sunday
const DEFAULT_ANCHOR_HOUR = 12;

type GuildConfig = {
  timezone?: string;
  windowLengthHours?: number;
  anchorWeekday?: number;
  anchorHour?: number;
};

function parseGuildConfig(config: unknown): GuildConfig {
  if (!config || typeof config !== 'object') return {};
  return config as GuildConfig;
}

function computeNextAnchor(now: DateTime, config: GuildConfig): DateTime {
  const timezone = config.timezone ?? DEFAULT_TIMEZONE;
  const anchorWeekday = config.anchorWeekday ?? DEFAULT_ANCHOR_WEEKDAY;
  const anchorHour = config.anchorHour ?? DEFAULT_ANCHOR_HOUR;

  const localized = now.setZone(timezone);
  const anchorThisWeek = localized
    .set({ weekday: anchorWeekday, hour: anchorHour, minute: 0, second: 0, millisecond: 0 });

  if (localized <= anchorThisWeek) {
    return anchorThisWeek;
  }

  return anchorThisWeek.plus({ weeks: 1 });
}

function computeNextWindowStart(latestStart: DateTime | null, now: DateTime, config: GuildConfig): DateTime {
  const lengthHours = config.windowLengthHours ?? DEFAULT_WINDOW_LENGTH_HOURS;
  if (latestStart) {
    return latestStart.plus({ hours: lengthHours });
  }
  return computeNextAnchor(now, config);
}

async function ensureWindowForGuild(prisma: PrismaClient, guildId: string) {
  const guild = await prisma.guild.findUnique({ where: { id: guildId } });
  const config = parseGuildConfig(guild?.config);
  const timezone = config.timezone ?? DEFAULT_TIMEZONE;
  const windowLengthHours = config.windowLengthHours ?? DEFAULT_WINDOW_LENGTH_HOURS;
  const now = DateTime.now().setZone(timezone);

  const latestWindow = await prisma.submissionWindow.findFirst({
    where: { guildId },
    orderBy: { startAt: 'desc' },
  });

  const latestStart = latestWindow ? DateTime.fromJSDate(latestWindow.startAt).setZone(timezone) : null;
  const nextStart = computeNextWindowStart(latestStart, now, config);

  if (latestWindow && now < DateTime.fromJSDate(latestWindow.endAt).setZone(timezone)) {
    return;
  }

  const nextEnd = nextStart.plus({ hours: windowLengthHours });
  const label = `${nextStart.toFormat('yyyy-LL-dd')} → ${nextEnd.toFormat('yyyy-LL-dd')}`;

  await prisma.submissionWindow.create({
    data: {
      guildId,
      startAt: nextStart.toJSDate(),
      endAt: nextEnd.toJSDate(),
      label,
    },
  });
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
