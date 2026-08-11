import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TrackerAdapter } from '../services/adapter';
import { WikiSyncScheduler } from '../services/wikiSyncScheduler';
import { currentWikiSyncOwner, tryAcquireWikiSync } from '../services/wikiSyncLock';
import { runWikiSync } from '../scripts/discord-wiki-sync';

vi.mock('../config', () => ({
  config: {
    botToken: 'bot-token',
    discordGuildId: 'guild-1',
    webAppBaseUrl: 'https://web.example',
    webAppApiToken: 'legacy-token',
    webAppApiReadToken: 'read-token',
    webAppApiWriteToken: 'write-token',
  },
}));

vi.mock('../logger', () => ({
  logEvent: vi.fn(),
  errorToMessage: (err: unknown) => String(err),
}));

vi.mock('../scripts/discord-wiki-sync', () => ({
  runWikiSync: vi.fn(),
}));

function makeAdapter(): TrackerAdapter {
  return {
    ackWikiSync: vi.fn(async () => {}),
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
    // resetAllMocks (not clearAllMocks) — clearAllMocks leaves queued
    // mockResolvedValueOnce values in place, so an unconsumed queued value
    // from a test that short-circuits before calling runWikiSync (e.g. the
    // lock-busy test) silently leaks into whichever test runs next.
    vi.resetAllMocks();
  });

  it('runs scheduled sync and acks running/success', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-02T04:01:00.000Z'));
    vi.mocked(runWikiSync).mockResolvedValueOnce({ success: true });
    const adapter = makeAdapter();
    const scheduler = makeScheduler(adapter);
    (scheduler as unknown as { lastTickTime: Date }).lastTickTime = new Date('2026-01-02T03:59:00.000Z');

    await (scheduler as unknown as { tick: () => Promise<void> }).tick();

    const firstRunId = vi.mocked(adapter.ackWikiSync).mock.calls[0][3];
    const secondRunId = vi.mocked(adapter.ackWikiSync).mock.calls[1][3];
    expect(firstRunId).toEqual(expect.any(String));
    expect(secondRunId).toBe(firstRunId);
    expect(adapter.ackWikiSync).toHaveBeenNthCalledWith(1, 'running', undefined, 'scheduled', firstRunId);
    expect(adapter.ackWikiSync).toHaveBeenNthCalledWith(2, 'success', undefined, 'scheduled', firstRunId, undefined);
    expect(runWikiSync).toHaveBeenCalledWith({
      botToken: 'bot-token',
      guildId: 'guild-1',
      webBase: 'https://web.example',
      webReadToken: 'read-token',
      webWriteToken: 'write-token',
    });
  });

  it('forwards non-fatal warnings from a successful run to ackWikiSync', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-02T04:01:00.000Z'));
    vi.mocked(runWikiSync).mockResolvedValueOnce({
      success: true,
      warnings: ['No #player-characters thread matched "Big Joey Puttanesca"'],
    });
    const adapter = makeAdapter();
    const scheduler = makeScheduler(adapter);
    (scheduler as unknown as { lastTickTime: Date }).lastTickTime = new Date('2026-01-02T03:59:00.000Z');

    await (scheduler as unknown as { tick: () => Promise<void> }).tick();

    const runId = vi.mocked(adapter.ackWikiSync).mock.calls[1][3];
    expect(adapter.ackWikiSync).toHaveBeenNthCalledWith(
      2, 'success', undefined, 'scheduled', runId,
      ['No #player-characters thread matched "Big Joey Puttanesca"'],
    );
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

    expect(adapter.ackWikiSync).not.toHaveBeenCalled();
    expect(runWikiSync).not.toHaveBeenCalled();
    lease?.release();
  });

  it('acks running/error when scheduled sync returns failure', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-02T04:01:00.000Z'));
    vi.mocked(runWikiSync).mockResolvedValueOnce({ success: false, error: 'boom' });
    const adapter = makeAdapter();
    const scheduler = makeScheduler(adapter);
    (scheduler as unknown as { lastTickTime: Date }).lastTickTime = new Date('2026-01-02T03:59:00.000Z');

    await (scheduler as unknown as { tick: () => Promise<void> }).tick();

    const firstRunId = vi.mocked(adapter.ackWikiSync).mock.calls[0][3];
    const secondRunId = vi.mocked(adapter.ackWikiSync).mock.calls[1][3];
    expect(firstRunId).toEqual(expect.any(String));
    expect(secondRunId).toBe(firstRunId);
    expect(adapter.ackWikiSync).toHaveBeenNthCalledWith(1, 'running', undefined, 'scheduled', firstRunId);
    expect(adapter.ackWikiSync).toHaveBeenNthCalledWith(2, 'error', 'boom', 'scheduled', firstRunId);
  });

  it('preserves runId on thrown scheduled sync errors', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-02T04:01:00.000Z'));
    vi.mocked(runWikiSync).mockRejectedValueOnce(new Error('kaboom'));
    const adapter = makeAdapter();
    const scheduler = makeScheduler(adapter);
    (scheduler as unknown as { lastTickTime: Date }).lastTickTime = new Date('2026-01-02T03:59:00.000Z');

    await (scheduler as unknown as { tick: () => Promise<void> }).tick();

    expect(adapter.ackWikiSync).toHaveBeenCalledTimes(2);
    const firstRunId = vi.mocked(adapter.ackWikiSync).mock.calls[0][3];
    const secondRunId = vi.mocked(adapter.ackWikiSync).mock.calls[1][3];
    expect(firstRunId).toEqual(expect.any(String));
    expect(secondRunId).toBe(firstRunId);
    expect(adapter.ackWikiSync).toHaveBeenNthCalledWith(1, 'running', undefined, 'scheduled', firstRunId);
    expect(adapter.ackWikiSync).toHaveBeenNthCalledWith(2, 'error', 'Error: kaboom', 'scheduled', firstRunId);
  });
});
