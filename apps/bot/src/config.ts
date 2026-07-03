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
    host === 'host.docker.internal' ||
    host.endsWith('.local') ||
    !host.includes('.'); // Docker service name (e.g. "web")

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
  WEB_APP_API_READ_TOKEN: z.string().min(1).optional(),
  WEB_APP_API_WRITE_TOKEN: z.string().min(1).optional(),
  CONFIG_SYNC_INTERVAL_MS: z.string().optional(),
  BOT_HEARTBEAT_INTERVAL_MS: z.string().optional(),
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
  AUTO_PERIOD_CLOSER_ENABLED: z.string().optional(),
  AUTO_PERIOD_CLOSER_GUILD_ID: z.string().optional(),
  AUTO_PERIOD_CLOSER_INTERVAL_MS: z.string().optional(),
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
  SUBMISSION_NOTIFIER_ENABLED: z.string().optional(),
  SUBMISSION_NOTIFIER_CHANNEL_ID: z.string().optional(),
  SUBMISSION_NOTIFIER_INTERVAL_MS: z.string().optional(),
  SUBMISSION_NOTIFIER_LOOKBACK_SECONDS: z.string().optional(),
  SHEET_IMPORT_NOTIFIER_ENABLED: z.string().optional(),
  SHEET_IMPORT_REVIEW_CHANNEL_ID: z.string().optional(),
  SHEET_IMPORT_NOTIFIER_INTERVAL_MS: z.string().optional(),
  SHEET_IMPORT_NOTIFIER_LOOKBACK_SECONDS: z.string().optional(),
  HUNT_CONSEQUENCE_ENABLED: z.string().optional(),
  HUNT_CONSEQUENCE_ELDEST_BOT_ID: z.string().optional(),
  HUNT_CONSEQUENCE_CHANNEL_IDS: z.string().optional(),
  HUNT_CONSEQUENCE_STAFF_CHANNEL_ID: z.string().optional(),
  HUNT_CONSEQUENCE_STAFF_ROLE_ID: z.string().optional(),
  HUNT_CONSEQUENCE_TEST_MODE: z.string().optional(),
  HUNT_CONSEQUENCE_TEST_CHANNEL_ID: z.string().optional(),
  COMBAT_SYSTEM_HELPER_ROLE_ID: z.string().optional(),
  ANNOUNCEMENTS_CHANNEL_ID: z.string().optional(),
  SHEETS_RECONCILE_ENABLED: z.string().optional(),
  SHEETS_RECONCILE_HOUR_LOCAL: z.string().optional(),
  SHEETS_RECONCILE_MINUTE_LOCAL: z.string().optional(),
  SHEETS_RECONCILE_TIMEZONE: z.string().optional(),
  SHEETS_RECONCILE_INTERVAL_MS: z.string().optional(),
  WIKI_SYNC_ENABLED: z.string().optional(),
  WIKI_SYNC_HOUR_LOCAL: z.string().optional(),
  WIKI_SYNC_MINUTE_LOCAL: z.string().optional(),
  WIKI_SYNC_TIMEZONE: z.string().optional(),
  WIKI_SYNC_INTERVAL_MS: z.string().optional(),
  DISCORD_GUILD_ID: z.string().optional(),
  APPROVE_PLAYER_SHEETS_CHANNEL_ID: z.string().optional(),
  APPROVE_SHEET_IN_PROGRESS_ROLE_ID: z.string().optional(),
  CC_CREATION_RULES_URL: z.string().transform(v => v || undefined).pipe(z.string().url().optional()),
  CC_TICKET_CATEGORY_IDS: z.string().optional(),
  CC_TICKET_MONITOR_ENABLED: z.string().optional(),
  CC_SUBMISSION_NOTIFIER_ENABLED: z.string().optional(),
  CC_SUBMISSION_NOTIFIER_INTERVAL_MS: z.string().optional(),
  CC_SUBMISSION_NOTIFIER_LOOKBACK_SECONDS: z.string().optional(),
  CC_APPROVAL_NOTIFIER_ENABLED: z.string().optional(),
  CC_APPROVAL_NOTIFIER_INTERVAL_MS: z.string().optional(),
  CC_APPROVAL_NOTIFIER_LOOKBACK_SECONDS: z.string().optional(),
  CUBBY_SYNC_ENABLED: z.string().optional(),
  CUBBY_SYNC_INTERVAL_MS: z.string().optional(),
  CUBBY_SYNC_GUILD_ID: z.string().optional(),
  CUBBY_SYNC_STAFF_CHANNEL_ID: z.string().optional(),
  CUBBY_RETIRED_CATEGORY_ID: z.string().optional(),
  RETIREMENT_AUTOMATION_ENABLED: z.string().optional(),
  RETIREMENT_AUTOMATION_INTERVAL_MS: z.string().optional(),
  RETIREMENT_AUTOMATION_GUILD_ID: z.string().optional(),
  RETIREMENT_CHILDREN_FORUM_ID: z.string().optional(),
  RETIREMENT_RETIRED_FORUM_ID: z.string().optional(),
  RETIREMENT_WIKI_BATCH_ENABLED: z.string().optional(),
  RETIREMENT_WIKI_BATCH_HOUR_LOCAL: z.string().optional(),
  RETIREMENT_WIKI_BATCH_MINUTE_LOCAL: z.string().optional(),
  RETIREMENT_WIKI_BATCH_TIMEZONE: z.string().optional(),
  RETIREMENT_NOTIFY_CHANNEL_ID: z.string().optional(),
  LASOMBRA_COMMAND_NAME: z.string().regex(/^[-_a-z0-9]{1,32}$/, 'LASOMBRA_COMMAND_NAME must be 1-32 chars, lowercase letters/numbers/hyphens/underscores only').optional(),
  STAFF_ROLE_SYNC_ENABLED: z.string().optional(),
  STAFF_ROLE_SYSTEM_HELPER_ID: z.string().optional(),
  STAFF_ROLE_STORYTELLER_ID: z.string().optional(),
  STAFF_ROLE_MODERATOR_ID: z.string().optional(),
  STAFF_ROLE_ADMINISTRATOR_ID: z.string().optional(),
  HONEYPOT_ENABLED: z.string().optional(),
  HONEYPOT_CHANNEL_ID: z.string().optional(),
  HONEYPOT_MOD_LOG_CHANNEL_ID: z.string().optional(),
  HONEYPOT_WHITELISTED_ROLE_IDS: z.string().optional(),
  HONEYPOT_REQUIRE_YOUNG_ACCOUNT: z.string().optional(),
  HONEYPOT_MAX_ACCOUNT_AGE_DAYS: z.string().optional(),
  MENTION_BREAKER_ENABLED: z.string().optional(),
  MENTION_BREAKER_MAX_MENTIONS: z.string().optional(),
  MENTION_BREAKER_TIMEOUT_MINUTES: z.string().optional(),
  MENTION_BREAKER_EXEMPT_ROLE_IDS: z.string().optional(),
  MENTION_BREAKER_MOD_LOG_CHANNEL_ID: z.string().optional(),
  VERIFIED_MEMBER_ROLE_ID: z.string().optional(),
  PERMISSION_SNAPSHOT_DIR: z.string().optional(),
});

// Strip empty strings so optional fields behave as if absent.
const rawEnv = Object.fromEntries(
  Object.entries(process.env).filter(([, v]) => v !== ''),
);
const env = envSchema.parse(rawEnv);

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
  /** Snapshot of IDs from BOT_TESTER_IDS env var; used to recompute testerDiscordIds on each config sync. */
  envTesterDiscordIds: parseCsvIds(env.BOT_TESTER_IDS),
  webAppBaseUrl: env.WEB_APP_BASE_URL,
  webAppApiToken: env.WEB_APP_API_TOKEN,
  webAppApiReadToken: env.WEB_APP_API_READ_TOKEN,
  webAppApiWriteToken: env.WEB_APP_API_WRITE_TOKEN,
  configSyncIntervalMs: parsePositiveInt(
    env.CONFIG_SYNC_INTERVAL_MS,
    60_000,
    'CONFIG_SYNC_INTERVAL_MS',
  ),
  botHeartbeatIntervalMs: parsePositiveInt(
    env.BOT_HEARTBEAT_INTERVAL_MS,
    60_000,
    'BOT_HEARTBEAT_INTERVAL_MS',
  ),
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
    120_000,
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
  autoPeriodCloserEnabled: (env.AUTO_PERIOD_CLOSER_ENABLED ?? 'false').toLowerCase() === 'true',
  autoPeriodCloserGuildId: env.AUTO_PERIOD_CLOSER_GUILD_ID ?? env.REVIEW_NOTIFIER_GUILD_ID ?? env.TEST_GUILD_ID,
  autoPeriodCloserIntervalMs: parsePositiveInt(
    env.AUTO_PERIOD_CLOSER_INTERVAL_MS,
    3_600_000,
    'AUTO_PERIOD_CLOSER_INTERVAL_MS',
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
    300_000,
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
  submissionNotifierEnabled: (env.SUBMISSION_NOTIFIER_ENABLED ?? 'false').toLowerCase() === 'true',
  submissionNotifierChannelId: env.SUBMISSION_NOTIFIER_CHANNEL_ID,
  submissionNotifierIntervalMs: parsePositiveInt(
    env.SUBMISSION_NOTIFIER_INTERVAL_MS,
    120_000,
    'SUBMISSION_NOTIFIER_INTERVAL_MS',
  ),
  submissionNotifierLookbackSeconds: parsePositiveInt(
    env.SUBMISSION_NOTIFIER_LOOKBACK_SECONDS,
    86_400,
    'SUBMISSION_NOTIFIER_LOOKBACK_SECONDS',
  ),
  sheetImportNotifierEnabled: (env.SHEET_IMPORT_NOTIFIER_ENABLED ?? 'false').toLowerCase() === 'true',
  sheetImportReviewChannelId: env.SHEET_IMPORT_REVIEW_CHANNEL_ID ?? '',
  sheetImportNotifierIntervalMs: parsePositiveInt(
    env.SHEET_IMPORT_NOTIFIER_INTERVAL_MS,
    120_000,
    'SHEET_IMPORT_NOTIFIER_INTERVAL_MS',
  ),
  sheetImportNotifierLookbackSeconds: parsePositiveInt(
    env.SHEET_IMPORT_NOTIFIER_LOOKBACK_SECONDS,
    86_400,
    'SHEET_IMPORT_NOTIFIER_LOOKBACK_SECONDS',
  ),
  huntConsequenceEnabled: (env.HUNT_CONSEQUENCE_ENABLED ?? 'false').toLowerCase() === 'true',
  huntConsequenceEldestBotId: env.HUNT_CONSEQUENCE_ELDEST_BOT_ID ?? '814857851406647309',
  huntConsequenceChannelIds: (env.HUNT_CONSEQUENCE_CHANNEL_IDS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
  huntConsequenceStaffChannelId: env.HUNT_CONSEQUENCE_STAFF_CHANNEL_ID ?? '',
  huntConsequenceStaffRoleId: env.HUNT_CONSEQUENCE_STAFF_ROLE_ID ?? '',
  huntConsequenceTestMode: (env.HUNT_CONSEQUENCE_TEST_MODE ?? 'false').toLowerCase() === 'true',
  huntConsequenceTestChannelId: env.HUNT_CONSEQUENCE_TEST_CHANNEL_ID ?? '',
  combatSystemHelperRoleId: env.COMBAT_SYSTEM_HELPER_ROLE_ID,
  announcementsChannelId: env.ANNOUNCEMENTS_CHANNEL_ID ?? '',
  sheetsReconcileEnabled: (env.SHEETS_RECONCILE_ENABLED ?? 'false').toLowerCase() === 'true',
  sheetsReconcileHourLocal: parseHour(env.SHEETS_RECONCILE_HOUR_LOCAL, 3, 'SHEETS_RECONCILE_HOUR_LOCAL'),
  sheetsReconcileMinuteLocal: parseMinute(env.SHEETS_RECONCILE_MINUTE_LOCAL, 0, 'SHEETS_RECONCILE_MINUTE_LOCAL'),
  sheetsReconcileTimezone: env.SHEETS_RECONCILE_TIMEZONE ?? 'America/Chicago',
  sheetsReconcileIntervalMs: parsePositiveInt(
    env.SHEETS_RECONCILE_INTERVAL_MS,
    300_000,
    'SHEETS_RECONCILE_INTERVAL_MS',
  ),
  wikiSyncEnabled: (env.WIKI_SYNC_ENABLED ?? 'false').toLowerCase() === 'true',
  wikiSyncHourLocal: parseHour(env.WIKI_SYNC_HOUR_LOCAL, 4, 'WIKI_SYNC_HOUR_LOCAL'),
  wikiSyncMinuteLocal: parseMinute(env.WIKI_SYNC_MINUTE_LOCAL, 0, 'WIKI_SYNC_MINUTE_LOCAL'),
  wikiSyncTimezone: env.WIKI_SYNC_TIMEZONE ?? 'America/Chicago',
  wikiSyncIntervalMs: parsePositiveInt(
    env.WIKI_SYNC_INTERVAL_MS,
    300_000,
    'WIKI_SYNC_INTERVAL_MS',
  ),
  discordGuildId: env.DISCORD_GUILD_ID ?? env.TEST_GUILD_ID ?? '',
  approvePlayerSheetsChannelId: env.APPROVE_PLAYER_SHEETS_CHANNEL_ID ?? '',
  approveSheetInProgressRoleId: env.APPROVE_SHEET_IN_PROGRESS_ROLE_ID ?? '',
  ccCreationRulesUrl: env.CC_CREATION_RULES_URL,
  ccTicketCategoryIds: parseCsvIds(env.CC_TICKET_CATEGORY_IDS),
  ccTicketMonitorEnabled: (env.CC_TICKET_MONITOR_ENABLED ?? 'true').toLowerCase() === 'true',
  ccSubmissionNotifierEnabled: (env.CC_SUBMISSION_NOTIFIER_ENABLED ?? 'true').toLowerCase() === 'true',
  ccSubmissionNotifierIntervalMs: parsePositiveInt(
    env.CC_SUBMISSION_NOTIFIER_INTERVAL_MS,
    60_000,
    'CC_SUBMISSION_NOTIFIER_INTERVAL_MS',
  ),
  ccSubmissionNotifierLookbackSeconds: parsePositiveInt(
    env.CC_SUBMISSION_NOTIFIER_LOOKBACK_SECONDS,
    86_400,
    'CC_SUBMISSION_NOTIFIER_LOOKBACK_SECONDS',
  ),
  ccApprovalNotifierEnabled: (env.CC_APPROVAL_NOTIFIER_ENABLED ?? 'true').toLowerCase() === 'true',
  ccApprovalNotifierIntervalMs: parsePositiveInt(
    env.CC_APPROVAL_NOTIFIER_INTERVAL_MS,
    60_000,
    'CC_APPROVAL_NOTIFIER_INTERVAL_MS',
  ),
  ccApprovalNotifierLookbackSeconds: parsePositiveInt(
    env.CC_APPROVAL_NOTIFIER_LOOKBACK_SECONDS,
    86_400,
    'CC_APPROVAL_NOTIFIER_LOOKBACK_SECONDS',
  ),
  cubbySyncEnabled: (env.CUBBY_SYNC_ENABLED ?? 'false').toLowerCase() === 'true',
  cubbySyncIntervalMs: parsePositiveInt(env.CUBBY_SYNC_INTERVAL_MS, 3_600_000, 'CUBBY_SYNC_INTERVAL_MS'),
  cubbySyncGuildId: env.CUBBY_SYNC_GUILD_ID ?? env.DISCORD_GUILD_ID ?? env.TEST_GUILD_ID ?? '',
  cubbySyncStaffChannelId: env.CUBBY_SYNC_STAFF_CHANNEL_ID ?? '',
  cubbyRetiredCategoryId: env.CUBBY_RETIRED_CATEGORY_ID ?? '1225070632799043685',
  retirementAutomationEnabled: (env.RETIREMENT_AUTOMATION_ENABLED ?? 'true').toLowerCase() === 'true',
  retirementAutomationIntervalMs: parsePositiveInt(
    env.RETIREMENT_AUTOMATION_INTERVAL_MS,
    60_000,
    'RETIREMENT_AUTOMATION_INTERVAL_MS',
  ),
  retirementAutomationGuildId: env.RETIREMENT_AUTOMATION_GUILD_ID ?? env.DISCORD_GUILD_ID ?? env.TEST_GUILD_ID ?? '',
  retirementChildrenForumId: env.RETIREMENT_CHILDREN_FORUM_ID ?? '1168655581486252042',
  retirementRetiredForumId: env.RETIREMENT_RETIRED_FORUM_ID ?? '1168669113871257682',
  retirementWikiBatchEnabled: (env.RETIREMENT_WIKI_BATCH_ENABLED ?? 'true').toLowerCase() === 'true',
  retirementWikiBatchHourLocal: parseHour(
    env.RETIREMENT_WIKI_BATCH_HOUR_LOCAL ?? env.WIKI_SYNC_HOUR_LOCAL,
    4,
    'RETIREMENT_WIKI_BATCH_HOUR_LOCAL',
  ),
  retirementWikiBatchMinuteLocal: parseMinute(
    env.RETIREMENT_WIKI_BATCH_MINUTE_LOCAL ?? env.WIKI_SYNC_MINUTE_LOCAL,
    0,
    'RETIREMENT_WIKI_BATCH_MINUTE_LOCAL',
  ),
  retirementWikiBatchTimezone: env.RETIREMENT_WIKI_BATCH_TIMEZONE ?? env.WIKI_SYNC_TIMEZONE ?? 'America/Chicago',
  retirementNotifyChannelId: env.RETIREMENT_NOTIFY_CHANNEL_ID ?? '',
  lasombraCommandName: env.LASOMBRA_COMMAND_NAME ?? 'lasombra',
  staffRoleSyncEnabled: (env.STAFF_ROLE_SYNC_ENABLED ?? 'false').toLowerCase() === 'true',
  staffRoleSystemHelperId: env.STAFF_ROLE_SYSTEM_HELPER_ID ?? '1168649906324520992',
  staffRoleStorytellerId: env.STAFF_ROLE_STORYTELLER_ID ?? '1168649373731790948',
  staffRoleModeratorId: env.STAFF_ROLE_MODERATOR_ID ?? '1168650352132890794',
  staffRoleAdministratorId: env.STAFF_ROLE_ADMINISTRATOR_ID ?? '1168648955731648554',
  honeypotEnabled: (env.HONEYPOT_ENABLED ?? 'false').toLowerCase() === 'true',
  honeypotChannelId: env.HONEYPOT_CHANNEL_ID ?? '',
  honeypotModLogChannelId: env.HONEYPOT_MOD_LOG_CHANNEL_ID ?? '',
  honeypotWhitelistedRoleIds: parseCsvIds(env.HONEYPOT_WHITELISTED_ROLE_IDS),
  honeypotRequireYoungAccount: (env.HONEYPOT_REQUIRE_YOUNG_ACCOUNT ?? 'false').toLowerCase() === 'true',
  honeypotMaxAccountAgeDays: parsePositiveInt(
    env.HONEYPOT_MAX_ACCOUNT_AGE_DAYS,
    30,
    'HONEYPOT_MAX_ACCOUNT_AGE_DAYS',
  ),
  mentionBreakerEnabled: (env.MENTION_BREAKER_ENABLED ?? 'false').toLowerCase() === 'true',
  mentionBreakerMaxMentions: parsePositiveInt(
    env.MENTION_BREAKER_MAX_MENTIONS,
    5,
    'MENTION_BREAKER_MAX_MENTIONS',
  ),
  mentionBreakerTimeoutMinutes: parsePositiveInt(
    env.MENTION_BREAKER_TIMEOUT_MINUTES,
    10,
    'MENTION_BREAKER_TIMEOUT_MINUTES',
  ),
  mentionBreakerExemptRoleIds: parseCsvIds(env.MENTION_BREAKER_EXEMPT_ROLE_IDS),
  mentionBreakerModLogChannelId:
    env.MENTION_BREAKER_MOD_LOG_CHANNEL_ID ?? env.HONEYPOT_MOD_LOG_CHANNEL_ID ?? '',
  verifiedMemberRoleId: env.VERIFIED_MEMBER_ROLE_ID,
  permissionSnapshotDir: env.PERMISSION_SNAPSHOT_DIR ?? '',
};

if (config.testRequesterDiscordId) {
  config.testerDiscordIds.add(config.testRequesterDiscordId);
}
