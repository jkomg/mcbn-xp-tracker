import { z } from 'zod';

function parsePositiveInt(input: string | undefined, fallback: number, key: string): number {
  const raw = input ?? String(fallback);
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${key} must be a positive integer (received "${raw}").`);
  }
  return parsed;
}

function parseNonNegativeInt(input: string | undefined, fallback: number, key: string): number {
  const raw = input ?? String(fallback);
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${key} must be a non-negative integer (received "${raw}").`);
  }
  return parsed;
}

function parseHour(input: string | undefined, fallback: number, key: string): number {
  const value = parseNonNegativeInt(input, fallback, key);
  if (value > 23) {
    throw new Error(`${key} must be between 0 and 23 (received "${value}").`);
  }
  return value;
}

function parseMinute(input: string | undefined, fallback: number, key: string): number {
  const value = parseNonNegativeInt(input, fallback, key);
  if (value > 59) {
    throw new Error(`${key} must be between 0 and 59 (received "${value}").`);
  }
  return value;
}

function parseWeekday(input: string | undefined, fallback: number, key: string): number {
  const value = parseNonNegativeInt(input, fallback, key);
  if (value > 6) {
    throw new Error(`${key} must be between 0 (Sunday) and 6 (Saturday) (received "${value}").`);
  }
  return value;
}

function validateBaseUrl(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`WEB_APP_BASE_URL must be a valid URL (received "${value}").`);
  }

  const host = parsed.hostname.toLowerCase();
  const isLocalhost =
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '::1' ||
    host.endsWith('.local');

  if (parsed.protocol !== 'https:' && !isLocalhost) {
    throw new Error('WEB_APP_BASE_URL must use https unless it targets localhost.');
  }

  return value.replace(/\/+$/, '');
}

const envSchema = z.object({
  BOT_TOKEN: z.string().min(1, 'BOT_TOKEN is required.'),
  CLIENT_ID: z.string().min(1).optional(),
  TEST_GUILD_ID: z.string().min(1).optional(),
  TEST_REQUESTER_DISCORD_ID: z.string().min(1).optional(),
  BOT_TESTER_IDS: z.string().optional(),
  WEB_APP_BASE_URL: z.string().default('http://127.0.0.1:5001').transform(validateBaseUrl),
  WEB_APP_API_TOKEN: z.string().min(1).optional(),
  REQUEST_TIMEOUT_MS: z.string().optional(),
  CLAIM_CONTEXT_CACHE_TTL_MS: z.string().optional(),
  CLAIM_CONTEXT_STALE_IF_ERROR_MS: z.string().optional(),
  CLAIM_CONTEXT_MAX_RETRIES: z.string().optional(),
  CLAIM_CONTEXT_RETRY_BASE_MS: z.string().optional(),
  REVIEW_NOTIFIER_ENABLED: z.string().optional(),
  REVIEW_NOTIFIER_GUILD_ID: z.string().min(1).optional(),
  REVIEW_NOTIFIER_INTERVAL_MS: z.string().optional(),
  REVIEW_NOTIFIER_LOOKBACK_SECONDS: z.string().optional(),
  AUTO_PERIOD_CREATOR_ENABLED: z.string().optional(),
  AUTO_PERIOD_CREATOR_INTERVAL_MS: z.string().optional(),
  CLAIM_REMINDER_ENABLED: z.string().optional(),
  CLAIM_REMINDER_GUILD_ID: z.string().optional(),
  CLAIM_REMINDER_INTERVAL_MS: z.string().optional(),
  CLAIM_REMINDER_HOUR_LOCAL: z.string().optional(),
  CLAIM_REMINDER_MINUTE_LOCAL: z.string().optional(),
  CLAIM_REMINDER_WEEKDAY_LOCAL: z.string().optional(),
  CLAIM_REMINDER_TIMEZONE: z.string().optional(),
  CLAIM_REMINDER_SNOOZE_HOURS: z.string().optional(),
  PASSAGE_OF_TIME_ENABLED: z.string().optional(),
  PASSAGE_OF_TIME_GUILD_ID: z.string().optional(),
  PASSAGE_OF_TIME_CHANNEL_ID: z.string().optional(),
  PASSAGE_OF_TIME_TEST_MODE: z.string().optional(),
  PASSAGE_OF_TIME_TEST_CHANNEL_ID: z.string().optional(),
  PASSAGE_OF_TIME_INTERVAL_MS: z.string().optional(),
  PASSAGE_OF_TIME_TIMEZONE: z.string().optional(),
  PASSAGE_OF_TIME_KINDRED_ROLE_ID: z.string().optional(),
  PASSAGE_OF_TIME_GHOUL_ROLE_ID: z.string().optional(),
  PASSAGE_OF_TIME_MORTAL_ROLE_ID: z.string().optional(),
  PASSAGE_SUNRISE_HOUR_LOCAL: z.string().optional(),
  PASSAGE_SUNRISE_MINUTE_LOCAL: z.string().optional(),
  PASSAGE_SUNRISE_WEEKDAY_LOCAL: z.string().optional(),
  PASSAGE_SUNRISE_ANCHOR_DATE: z.string().optional(),
  PASSAGE_SUNSET_HOUR_LOCAL: z.string().optional(),
  PASSAGE_SUNSET_MINUTE_LOCAL: z.string().optional(),
  PASSAGE_SUNSET_WEEKDAY_LOCAL: z.string().optional(),
  PASSAGE_SUNSET_ANCHOR_DATE: z.string().optional(),
  PASSAGE_DOWNTIME_HOUR_LOCAL: z.string().optional(),
  PASSAGE_DOWNTIME_MINUTE_LOCAL: z.string().optional(),
  PASSAGE_DOWNTIME_WEEKDAY_LOCAL: z.string().optional(),
  PASSAGE_DOWNTIME_ANCHOR_DATE: z.string().optional(),
  PLAYER_GUIDE_URL: z.string().url().optional(),
  PLAYER_WEB_URL: z.string().url().optional(),
  HUNT_CONSEQUENCE_ENABLED: z.string().optional(),
  HUNT_CONSEQUENCE_ELDEST_BOT_ID: z.string().optional(),
  HUNT_CONSEQUENCE_CHANNEL_IDS: z.string().optional(),
  HUNT_CONSEQUENCE_STAFF_CHANNEL_ID: z.string().optional(),
  HUNT_CONSEQUENCE_STAFF_ROLE_ID: z.string().optional(),
  HUNT_CONSEQUENCE_TEST_MODE: z.string().optional(),
  HUNT_CONSEQUENCE_TEST_CHANNEL_ID: z.string().optional(),
});

const env = envSchema.parse(process.env);

function parseCsvIds(input: string | undefined): Set<string> {
  if (!input) {
    return new Set<string>();
  }
  return new Set(
    input
      .split(',')
      .map((v) => v.trim())
      .filter((v) => v.length > 0),
  );
}

export const config = {
  botToken: env.BOT_TOKEN,
  clientId: env.CLIENT_ID,
  testGuildId: env.TEST_GUILD_ID,
  testRequesterDiscordId: env.TEST_REQUESTER_DISCORD_ID,
  testerDiscordIds: parseCsvIds(env.BOT_TESTER_IDS),
  webAppBaseUrl: env.WEB_APP_BASE_URL,
  webAppApiToken: env.WEB_APP_API_TOKEN,
  requestTimeoutMs: parsePositiveInt(env.REQUEST_TIMEOUT_MS, 10_000, 'REQUEST_TIMEOUT_MS'),
  claimContextCacheTtlMs: parsePositiveInt(
    env.CLAIM_CONTEXT_CACHE_TTL_MS,
    30_000,
    'CLAIM_CONTEXT_CACHE_TTL_MS',
  ),
  claimContextStaleIfErrorMs: parsePositiveInt(
    env.CLAIM_CONTEXT_STALE_IF_ERROR_MS,
    300_000,
    'CLAIM_CONTEXT_STALE_IF_ERROR_MS',
  ),
  claimContextMaxRetries: parseNonNegativeInt(
    env.CLAIM_CONTEXT_MAX_RETRIES,
    2,
    'CLAIM_CONTEXT_MAX_RETRIES',
  ),
  claimContextRetryBaseMs: parsePositiveInt(
    env.CLAIM_CONTEXT_RETRY_BASE_MS,
    250,
    'CLAIM_CONTEXT_RETRY_BASE_MS',
  ),
  reviewNotifierEnabled: (env.REVIEW_NOTIFIER_ENABLED ?? 'false').toLowerCase() === 'true',
  reviewNotifierGuildId: env.REVIEW_NOTIFIER_GUILD_ID,
  reviewNotifierIntervalMs: parsePositiveInt(
    env.REVIEW_NOTIFIER_INTERVAL_MS,
    60_000,
    'REVIEW_NOTIFIER_INTERVAL_MS',
  ),
  reviewNotifierLookbackSeconds: parsePositiveInt(
    env.REVIEW_NOTIFIER_LOOKBACK_SECONDS,
    86_400,
    'REVIEW_NOTIFIER_LOOKBACK_SECONDS',
  ),
  autoPeriodCreatorEnabled: (env.AUTO_PERIOD_CREATOR_ENABLED ?? 'false').toLowerCase() === 'true',
  autoPeriodCreatorIntervalMs: parsePositiveInt(
    env.AUTO_PERIOD_CREATOR_INTERVAL_MS,
    3_600_000,
    'AUTO_PERIOD_CREATOR_INTERVAL_MS',
  ),
  claimReminderEnabled: (env.CLAIM_REMINDER_ENABLED ?? 'false').toLowerCase() === 'true',
  claimReminderGuildId: env.CLAIM_REMINDER_GUILD_ID ?? env.REVIEW_NOTIFIER_GUILD_ID ?? env.TEST_GUILD_ID,
  claimReminderIntervalMs: parsePositiveInt(
    env.CLAIM_REMINDER_INTERVAL_MS,
    900_000,
    'CLAIM_REMINDER_INTERVAL_MS',
  ),
  claimReminderHourLocal: parseHour(env.CLAIM_REMINDER_HOUR_LOCAL, 8, 'CLAIM_REMINDER_HOUR_LOCAL'),
  claimReminderMinuteLocal: parseMinute(env.CLAIM_REMINDER_MINUTE_LOCAL, 0, 'CLAIM_REMINDER_MINUTE_LOCAL'),
  claimReminderWeekdayLocal: parseWeekday(
    env.CLAIM_REMINDER_WEEKDAY_LOCAL,
    0,
    'CLAIM_REMINDER_WEEKDAY_LOCAL',
  ),
  claimReminderTimezone: env.CLAIM_REMINDER_TIMEZONE ?? 'America/Chicago',
  claimReminderSnoozeHours: parsePositiveInt(
    env.CLAIM_REMINDER_SNOOZE_HOURS,
    24,
    'CLAIM_REMINDER_SNOOZE_HOURS',
  ),
  passageOfTimeEnabled: (env.PASSAGE_OF_TIME_ENABLED ?? 'false').toLowerCase() === 'true',
  passageOfTimeGuildId: env.PASSAGE_OF_TIME_GUILD_ID ?? env.TEST_GUILD_ID,
  passageOfTimeChannelId: env.PASSAGE_OF_TIME_CHANNEL_ID,
  passageOfTimeTestMode: (env.PASSAGE_OF_TIME_TEST_MODE ?? 'true').toLowerCase() === 'true',
  passageOfTimeTestChannelId: env.PASSAGE_OF_TIME_TEST_CHANNEL_ID,
  passageOfTimeIntervalMs: parsePositiveInt(
    env.PASSAGE_OF_TIME_INTERVAL_MS,
    900_000,
    'PASSAGE_OF_TIME_INTERVAL_MS',
  ),
  passageOfTimeTimezone: env.PASSAGE_OF_TIME_TIMEZONE ?? 'America/Chicago',
  passageOfTimeKindredRoleId: env.PASSAGE_OF_TIME_KINDRED_ROLE_ID,
  passageOfTimeGhoulRoleId: env.PASSAGE_OF_TIME_GHOUL_ROLE_ID,
  passageOfTimeMortalRoleId: env.PASSAGE_OF_TIME_MORTAL_ROLE_ID,
  passageSunriseHourLocal: parseHour(env.PASSAGE_SUNRISE_HOUR_LOCAL, 12, 'PASSAGE_SUNRISE_HOUR_LOCAL'),
  passageSunriseMinuteLocal: parseMinute(
    env.PASSAGE_SUNRISE_MINUTE_LOCAL,
    0,
    'PASSAGE_SUNRISE_MINUTE_LOCAL',
  ),
  passageSunriseWeekdayLocal: parseWeekday(
    env.PASSAGE_SUNRISE_WEEKDAY_LOCAL,
    0,
    'PASSAGE_SUNRISE_WEEKDAY_LOCAL',
  ),
  passageSunriseAnchorDate: env.PASSAGE_SUNRISE_ANCHOR_DATE ?? '',
  passageSunsetHourLocal: parseHour(env.PASSAGE_SUNSET_HOUR_LOCAL, 12, 'PASSAGE_SUNSET_HOUR_LOCAL'),
  passageSunsetMinuteLocal: parseMinute(env.PASSAGE_SUNSET_MINUTE_LOCAL, 0, 'PASSAGE_SUNSET_MINUTE_LOCAL'),
  passageSunsetWeekdayLocal: parseWeekday(
    env.PASSAGE_SUNSET_WEEKDAY_LOCAL,
    2,
    'PASSAGE_SUNSET_WEEKDAY_LOCAL',
  ),
  passageSunsetAnchorDate: env.PASSAGE_SUNSET_ANCHOR_DATE ?? '',
  passageDowntimeHourLocal: parseHour(
    env.PASSAGE_DOWNTIME_HOUR_LOCAL,
    12,
    'PASSAGE_DOWNTIME_HOUR_LOCAL',
  ),
  passageDowntimeMinuteLocal: parseMinute(
    env.PASSAGE_DOWNTIME_MINUTE_LOCAL,
    0,
    'PASSAGE_DOWNTIME_MINUTE_LOCAL',
  ),
  passageDowntimeWeekdayLocal: parseWeekday(
    env.PASSAGE_DOWNTIME_WEEKDAY_LOCAL,
    0,
    'PASSAGE_DOWNTIME_WEEKDAY_LOCAL',
  ),
  passageDowntimeAnchorDate: env.PASSAGE_DOWNTIME_ANCHOR_DATE ?? '',
  playerGuideUrl: env.PLAYER_GUIDE_URL,
  playerWebUrl: env.PLAYER_WEB_URL ?? `${env.WEB_APP_BASE_URL}/player/`,
  huntConsequenceEnabled: (env.HUNT_CONSEQUENCE_ENABLED ?? 'false').toLowerCase() === 'true',
  huntConsequenceEldestBotId: env.HUNT_CONSEQUENCE_ELDEST_BOT_ID ?? '814857851406647309',
  huntConsequenceChannelIds: (env.HUNT_CONSEQUENCE_CHANNEL_IDS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
  huntConsequenceStaffChannelId: env.HUNT_CONSEQUENCE_STAFF_CHANNEL_ID ?? '',
  huntConsequenceStaffRoleId: env.HUNT_CONSEQUENCE_STAFF_ROLE_ID ?? '',
  huntConsequenceTestMode: (env.HUNT_CONSEQUENCE_TEST_MODE ?? 'false').toLowerCase() === 'true',
  huntConsequenceTestChannelId: env.HUNT_CONSEQUENCE_TEST_CHANNEL_ID ?? '',
};

if (config.testRequesterDiscordId) {
  config.testerDiscordIds.add(config.testRequesterDiscordId);
}
