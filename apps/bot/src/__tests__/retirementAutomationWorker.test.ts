import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChannelType } from 'discord.js';
import type { TrackerAdapter } from '../services/adapter';
import { RetirementAutomationWorker } from '../services/retirementAutomationWorker';

vi.mock('../config', () => ({
  config: {
    wikiSyncEnabled: false,
  },
}));

vi.mock('../logger', () => ({
  logEvent: vi.fn(),
  errorToMessage: (err: unknown) => String(err),
}));

function makeWorker(adapter: TrackerAdapter, client: unknown) {
  return new RetirementAutomationWorker(adapter, client as never, {
    enabled: true,
    intervalMs: 60_000,
    guildId: 'guild-1',
    retiredCubbyCategoryId: 'retired-cubby',
    childrenForumId: 'children-forum',
    retiredForumId: 'retired-forum',
    wikiBatchEnabled: true,
    wikiBatchHourLocal: 4,
    wikiBatchMinuteLocal: 0,
    wikiBatchTimezone: 'UTC',
  });
}

describe('RetirementAutomationWorker', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('moves cubby and completes discord job when retired thread already exists', async () => {
    const setParent = vi.fn(async () => {});
    const cubbyChannel = { id: 'cubby-1', parentId: 'active-cubby', setParent };
    const retiredThread = { id: 'retired-thread-1', name: 'Alice Voss' };

    const forumWithRetiredThread = {
      type: ChannelType.GuildForum,
      threads: {
        fetchActive: vi.fn(async () => ({ threads: new Map([['retired-thread-1', retiredThread]]) })),
        fetchArchived: vi.fn(async () => ({ threads: new Map() })),
      },
    };
    const emptyForum = {
      type: ChannelType.GuildForum,
      threads: {
        fetchActive: vi.fn(async () => ({ threads: new Map() })),
        fetchArchived: vi.fn(async () => ({ threads: new Map() })),
      },
    };

    const guild = {
      channels: {
        fetch: vi.fn(async (id?: string) => {
          if (!id) return new Map();
          if (id === 'cubby-1') return cubbyChannel;
          if (id === 'children-forum') return emptyForum;
          if (id === 'retired-forum') return forumWithRetiredThread;
          return null;
        }),
      },
    };
    const client = {
      guilds: {
        fetch: vi.fn(async () => guild),
      },
    };
    const adapter = {
      getPendingRetirementJobs: vi.fn(async () => ({
        jobs: [{ id: 7, characterName: 'Alice Voss', cubbyChannelId: 'cubby-1', requestedAt: '2026-06-25T00:00:00+00:00' }],
      })),
      completeRetirementJobDiscordWork: vi.fn(async () => {}),
      requestRetirementWikiBatch: vi.fn(async () => ({ ok: true, requested: false, pendingCount: 0, reason: 'no_pending_jobs' })),
    } as unknown as TrackerAdapter;

    const worker = makeWorker(adapter, client);
    await (worker as unknown as { tick: () => Promise<void> }).tick();

    expect(setParent).toHaveBeenCalledWith('retired-cubby', expect.objectContaining({
      reason: 'Character retired: Alice Voss',
    }));
    expect(adapter.completeRetirementJobDiscordWork).toHaveBeenCalledWith(7, {
      cubbyChannelId: 'cubby-1',
      childrenSourceThreadId: null,
      childrenRetiredThreadId: 'retired-thread-1',
    });
  });

  it('requests daily wiki batch once when scheduler-based wiki sync is disabled', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-25T04:01:00.000Z'));
    const adapter = {
      getPendingRetirementJobs: vi.fn(async () => ({ jobs: [] })),
      completeRetirementJobDiscordWork: vi.fn(async () => {}),
      requestRetirementWikiBatch: vi.fn(async () => ({ ok: true, requested: true, pendingCount: 2 })),
    } as unknown as TrackerAdapter;
    const client = {
      guilds: {
        fetch: vi.fn(async () => ({ channels: { fetch: vi.fn(async () => null) } })),
      },
    };

    const worker = makeWorker(adapter, client);
    (worker as unknown as { lastTickTime: Date }).lastTickTime = new Date('2026-06-25T03:59:00.000Z');
    await (worker as unknown as { tick: () => Promise<void> }).tick();
    await (worker as unknown as { tick: () => Promise<void> }).tick();

    expect(adapter.requestRetirementWikiBatch).toHaveBeenCalledTimes(1);
  });
});
