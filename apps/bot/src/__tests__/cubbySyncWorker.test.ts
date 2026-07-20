import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Client } from 'discord.js';
import { CubbySyncWorker } from '../services/cubbySyncWorker';
import { logEvent } from '../logger';
import type { TrackerAdapter } from '../services/adapter';

vi.mock('../logger', () => ({
  logEvent: vi.fn(),
  errorToMessage: (err: unknown) => String(err),
}));

function makeClient(guildFetch = vi.fn().mockResolvedValue(null)) {
  return { guilds: { fetch: guildFetch } } as unknown as Client;
}

function makeAdapter(): TrackerAdapter {
  return {} as unknown as TrackerAdapter;
}

describe('CubbySyncWorker.start', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('logs a distinct warning and never runs a sync when disabled', async () => {
    vi.useFakeTimers();
    const guildFetch = vi.fn().mockResolvedValue(null);
    const client = makeClient(guildFetch);
    const worker = new CubbySyncWorker(makeAdapter(), client, {
      enabled: false,
      intervalMs: 1000,
      guildId: 'guild-1',
      staffChannelId: '',
      retiredCategoryId: '',
    });

    worker.start();
    await vi.advanceTimersByTimeAsync(5000);

    expect(logEvent).toHaveBeenCalledWith('warn', 'cubby_sync_worker_disabled', expect.anything());
    expect(logEvent).not.toHaveBeenCalledWith('info', 'cubby_sync_worker_started', expect.anything());
    expect(guildFetch).not.toHaveBeenCalled();
  });

  it('runs a sync immediately on start when enabled, without waiting a full interval', async () => {
    vi.useFakeTimers();
    const guildFetch = vi.fn().mockResolvedValue(null);
    const client = makeClient(guildFetch);
    const worker = new CubbySyncWorker(makeAdapter(), client, {
      enabled: true,
      intervalMs: 3_600_000,
      guildId: 'guild-1',
      staffChannelId: '',
      retiredCategoryId: '',
    });

    worker.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(logEvent).toHaveBeenCalledWith('info', 'cubby_sync_worker_started', expect.anything());
    expect(guildFetch).toHaveBeenCalledTimes(1);
  });

  it('still ticks again on the regular interval after the immediate run', async () => {
    vi.useFakeTimers();
    const guildFetch = vi.fn().mockResolvedValue(null);
    const client = makeClient(guildFetch);
    const worker = new CubbySyncWorker(makeAdapter(), client, {
      enabled: true,
      intervalMs: 1000,
      guildId: 'guild-1',
      staffChannelId: '',
      retiredCategoryId: '',
    });

    worker.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(guildFetch).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1000);
    expect(guildFetch).toHaveBeenCalledTimes(2);
  });
});
