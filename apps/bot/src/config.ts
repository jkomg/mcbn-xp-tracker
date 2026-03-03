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
  WEB_APP_BASE_URL: z.string().default('http://127.0.0.1:5001').transform(validateBaseUrl),
  WEB_APP_API_TOKEN: z.string().min(1).optional(),
  REQUEST_TIMEOUT_MS: z.string().optional(),
  CLAIM_CONTEXT_CACHE_TTL_MS: z.string().optional(),
  CLAIM_CONTEXT_STALE_IF_ERROR_MS: z.string().optional(),
  CLAIM_CONTEXT_MAX_RETRIES: z.string().optional(),
  CLAIM_CONTEXT_RETRY_BASE_MS: z.string().optional(),
});

const env = envSchema.parse(process.env);

export const config = {
  botToken: env.BOT_TOKEN,
  clientId: env.CLIENT_ID,
  testGuildId: env.TEST_GUILD_ID,
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
};
