import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BotConfigResponse, TrackerAdapter } from '../services/adapter';
import { ConfigSyncWorker } from '../services/configSyncWorker';
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
}));

vi.mock('../scripts/discord-wiki-sync', () => ({
  runWikiSync: vi.fn(),
}));

function baseBotConfig(overrides: Partial<BotConfigResponse> = {}): BotConfigResponse {
  return {
    reviewNotifierEnabled: null,
    submissionNotifierEnabled: null,
    autoPeriodCreatorEnabled: null,
    autoPeriodCloserEnabled: null,
    claimReminderEnabled: null,
    passageOfTimeEnabled: null,
    huntConsequenceEnabled: null,
    restartRequested: null,
    wikiSyncRequested: null,
    ccTicketMonitorEnabled: null,
    passageOfTimeIntervalMs: null,
    reviewNotifierIntervalMs: null,
    submissionNotifierIntervalMs: null,
    claimReminderIntervalMs: null,
    announcementsChannelId: null,
    ccTicketCategoryIds: null,
    ...overrides,
  };
}

function makeAdapter(cfg: BotConfigResponse): TrackerAdapter {
  return {
    getBotConfig: vi.fn(async () => cfg),
    ackWikiSync: vi.fn(async () => {}),
    ackBotRestart: vi.fn(async () => {}),
  } as unknown as TrackerAdapter;
}

describe('ConfigSyncWorker sync orchestration', () => {
  afterEach(() => {
    expect(currentWikiSyncOwner()).toBeNull();
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('skips manual sync when shared wiki lock is already held', async () => {
    const lease = tryAcquireWikiSync('scheduled');
    expect(lease).not.toBeNull();
    const adapter = makeAdapter(baseBotConfig({ wikiSyncRequested: true }));
    vi.mocked(runWikiSync).mockResolvedValueOnce({ success: true });

    const worker = new ConfigSyncWorker(adapter);
    await worker.sync();

    expect(adapter.ackWikiSync).not.toHaveBeenCalled();
    expect(runWikiSync).not.toHaveBeenCalled();
    lease?.release();
  });

  it('acks running/success and executes wiki sync for manual requests', async () => {
    const adapter = makeAdapter(baseBotConfig({ wikiSyncRequested: true }));
    vi.mocked(runWikiSync).mockResolvedValueOnce({ success: true });

    const worker = new ConfigSyncWorker(adapter);
    await worker.sync();

    await vi.waitFor(() => {
      expect(runWikiSync).toHaveBeenCalledTimes(1);
      expect(adapter.ackWikiSync).toHaveBeenCalledTimes(2);
    });
    expect(runWikiSync).toHaveBeenCalledWith({
      botToken: 'bot-token',
      guildId: 'guild-1',
      webBase: 'https://web.example',
      webReadToken: 'read-token',
      webWriteToken: 'write-token',
    });
    const firstRunId = vi.mocked(adapter.ackWikiSync).mock.calls[0][3];
    const secondRunId = vi.mocked(adapter.ackWikiSync).mock.calls[1][3];
    expect(firstRunId).toEqual(expect.any(String));
    expect(secondRunId).toBe(firstRunId);
    expect(adapter.ackWikiSync).toHaveBeenNthCalledWith(1, 'running', undefined, 'manual', firstRunId);
    expect(adapter.ackWikiSync).toHaveBeenNthCalledWith(2, 'success', undefined, 'manual', firstRunId);
  });

  it('does not start sync when running ack fails', async () => {
    const adapter = makeAdapter(baseBotConfig({ wikiSyncRequested: true }));
    vi.mocked(adapter.ackWikiSync).mockRejectedValueOnce(new Error('ack failed'));

    const worker = new ConfigSyncWorker(adapter);
    await worker.sync();

    await vi.waitFor(() => {
      expect(adapter.ackWikiSync).toHaveBeenCalledTimes(1);
    });
    const firstRunId = vi.mocked(adapter.ackWikiSync).mock.calls[0][3];
    expect(firstRunId).toEqual(expect.any(String));
    expect(adapter.ackWikiSync).toHaveBeenCalledWith('running', undefined, 'manual', firstRunId);
    expect(runWikiSync).not.toHaveBeenCalled();
  });

  it('start uses provided interval and unrefs timer', () => {
    const adapter = makeAdapter(baseBotConfig());
    const worker = new ConfigSyncWorker(adapter, 123_456);
    const syncSpy = vi.spyOn(worker, 'sync').mockResolvedValue(undefined);
    const unref = vi.fn();
    const intervalSpy = vi.spyOn(global, 'setInterval').mockReturnValue({ unref } as unknown as NodeJS.Timeout);

    worker.start();

    expect(syncSpy).toHaveBeenCalledTimes(1);
    expect(intervalSpy).toHaveBeenCalledTimes(1);
    expect(intervalSpy).toHaveBeenCalledWith(expect.any(Function), 123_456);
    expect(unref).toHaveBeenCalledTimes(1);
  });
});
