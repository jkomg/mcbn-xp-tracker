import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TrackerAdapter } from '../services/adapter';
import { WikiSyncScheduler } from '../services/wikiSyncScheduler';
import { currentWikiSyncOwner, tryAcquireWikiSync } from '../services/wikiSyncLock';
import { runNotionSync } from '../scripts/discord-notion-sync';

vi.mock('../config', () => ({
  config: {
    botToken: 'bot-token',
    discordGuildId: 'guild-1',
    notionToken: 'manual-notion-token',
    webAppBaseUrl: 'https://web.example',
    webAppApiToken: 'legacy-token',
    webAppApiReadToken: 'read-token',
    webAppApiWriteToken: 'write-token',
    notionSyncMsgLimit: 321,
  },
}));

vi.mock('../logger', () => ({
  logEvent: vi.fn(),
  errorToMessage: (err: unknown) => String(err),
}));

vi.mock('../scripts/discord-notion-sync', () => ({
  runNotionSync: vi.fn(),
}));

function makeAdapter(): TrackerAdapter {
  return {
    ackNotionSync: vi.fn(async () => {}),
  } as unknown as TrackerAdapter;
}

function makeScheduler(adapter: TrackerAdapter) {
  return new WikiSyncScheduler(adapter, {
    enabled: true,
    hourLocal: 4,
    minuteLocal: 0,
    timezone: 'UTC',
    intervalMs: 60_000,
  });
}

describe('WikiSyncScheduler orchestration', () => {
  afterEach(() => {
    vi.useRealTimers();
    expect(currentWikiSyncOwner()).toBeNull();
    vi.clearAllMocks();
  });

  it('runs scheduled sync with wiki-only notion token and acks running/success', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-02T04:01:00.000Z'));
    vi.mocked(runNotionSync).mockResolvedValueOnce({ success: true });
    const adapter = makeAdapter();
    const scheduler = makeScheduler(adapter);
    (scheduler as unknown as { lastTickTime: Date }).lastTickTime = new Date('2026-01-02T03:59:00.000Z');

    await (scheduler as unknown as { tick: () => Promise<void> }).tick();

    expect(adapter.ackNotionSync).toHaveBeenNthCalledWith(1, 'running', undefined, 'scheduled');
    expect(adapter.ackNotionSync).toHaveBeenNthCalledWith(2, 'success', undefined, 'scheduled');
    expect(runNotionSync).toHaveBeenCalledWith({
      botToken: 'bot-token',
      guildId: 'guild-1',
      notionToken: '',
      webBase: 'https://web.example',
      webReadToken: 'read-token',
      webWriteToken: 'write-token',
      msgLimit: 321,
    });
  });

  it('skips scheduled sync when shared wiki lock is already held', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-02T04:01:00.000Z'));
    const adapter = makeAdapter();
    const scheduler = makeScheduler(adapter);
    (scheduler as unknown as { lastTickTime: Date }).lastTickTime = new Date('2026-01-02T03:59:00.000Z');
    const lease = tryAcquireWikiSync('manual');
    expect(lease).not.toBeNull();

    await (scheduler as unknown as { tick: () => Promise<void> }).tick();

    expect(adapter.ackNotionSync).not.toHaveBeenCalled();
    expect(runNotionSync).not.toHaveBeenCalled();
    lease?.release();
  });

  it('acks running/error when scheduled sync returns failure', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-02T04:01:00.000Z'));
    vi.mocked(runNotionSync).mockResolvedValueOnce({ success: false, error: 'boom' });
    const adapter = makeAdapter();
    const scheduler = makeScheduler(adapter);
    (scheduler as unknown as { lastTickTime: Date }).lastTickTime = new Date('2026-01-02T03:59:00.000Z');

    await (scheduler as unknown as { tick: () => Promise<void> }).tick();

    expect(adapter.ackNotionSync).toHaveBeenNthCalledWith(1, 'running', undefined, 'scheduled');
    expect(adapter.ackNotionSync).toHaveBeenNthCalledWith(2, 'error', 'boom', 'scheduled');
  });
});
