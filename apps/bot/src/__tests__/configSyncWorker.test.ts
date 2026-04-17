import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BotConfigResponse, TrackerAdapter } from '../services/adapter';
import { ConfigSyncWorker } from '../services/configSyncWorker';
import { currentWikiSyncOwner, tryAcquireWikiSync } from '../services/wikiSyncLock';
import { runNotionSync } from '../scripts/discord-notion-sync';

vi.mock('../config', () => ({
  config: {
    botToken: 'bot-token',
    discordGuildId: 'guild-1',
    notionToken: 'notion-token',
    webAppBaseUrl: 'https://web.example',
    webAppApiToken: 'legacy-token',
    webAppApiReadToken: 'read-token',
    webAppApiWriteToken: 'write-token',
    notionSyncMsgLimit: 123,
  },
}));

vi.mock('../logger', () => ({
  logEvent: vi.fn(),
}));

vi.mock('../scripts/discord-notion-sync', () => ({
  runNotionSync: vi.fn(),
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
    notionSyncRequested: null,
    passageOfTimeIntervalMs: null,
    reviewNotifierIntervalMs: null,
    submissionNotifierIntervalMs: null,
    claimReminderIntervalMs: null,
    announcementsChannelId: null,
    ...overrides,
  };
}

function makeAdapter(cfg: BotConfigResponse): TrackerAdapter {
  return {
    getBotConfig: vi.fn(async () => cfg),
    ackNotionSync: vi.fn(async () => {}),
    ackBotRestart: vi.fn(async () => {}),
  } as unknown as TrackerAdapter;
}

describe('ConfigSyncWorker sync orchestration', () => {
  afterEach(() => {
    expect(currentWikiSyncOwner()).toBeNull();
    vi.clearAllMocks();
  });

  it('skips manual sync when shared wiki lock is already held', async () => {
    const lease = tryAcquireWikiSync('scheduled');
    expect(lease).not.toBeNull();
    const adapter = makeAdapter(baseBotConfig({ notionSyncRequested: true }));
    vi.mocked(runNotionSync).mockResolvedValueOnce({ success: true });

    const worker = new ConfigSyncWorker(adapter);
    await worker.sync();

    expect(adapter.ackNotionSync).not.toHaveBeenCalled();
    expect(runNotionSync).not.toHaveBeenCalled();
    lease?.release();
  });

  it('acks running/success and executes notion sync for manual requests', async () => {
    const adapter = makeAdapter(baseBotConfig({ notionSyncRequested: true }));
    vi.mocked(runNotionSync).mockResolvedValueOnce({ success: true });

    const worker = new ConfigSyncWorker(adapter);
    await worker.sync();

    await vi.waitFor(() => {
      expect(runNotionSync).toHaveBeenCalledTimes(1);
      expect(adapter.ackNotionSync).toHaveBeenCalledTimes(2);
    });
    expect(runNotionSync).toHaveBeenCalledWith({
      botToken: 'bot-token',
      guildId: 'guild-1',
      notionToken: 'notion-token',
      webBase: 'https://web.example',
      webReadToken: 'read-token',
      webWriteToken: 'write-token',
      msgLimit: 123,
    });
    const firstRunId = vi.mocked(adapter.ackNotionSync).mock.calls[0][3];
    const secondRunId = vi.mocked(adapter.ackNotionSync).mock.calls[1][3];
    expect(firstRunId).toEqual(expect.any(String));
    expect(secondRunId).toBe(firstRunId);
    expect(adapter.ackNotionSync).toHaveBeenNthCalledWith(1, 'running', undefined, 'manual', firstRunId);
    expect(adapter.ackNotionSync).toHaveBeenNthCalledWith(2, 'success', undefined, 'manual', firstRunId);
  });

  it('does not start sync when running ack fails', async () => {
    const adapter = makeAdapter(baseBotConfig({ notionSyncRequested: true }));
    vi.mocked(adapter.ackNotionSync).mockRejectedValueOnce(new Error('ack failed'));

    const worker = new ConfigSyncWorker(adapter);
    await worker.sync();

    await vi.waitFor(() => {
      expect(adapter.ackNotionSync).toHaveBeenCalledTimes(1);
    });
    const firstRunId = vi.mocked(adapter.ackNotionSync).mock.calls[0][3];
    expect(firstRunId).toEqual(expect.any(String));
    expect(adapter.ackNotionSync).toHaveBeenCalledWith('running', undefined, 'manual', firstRunId);
    expect(runNotionSync).not.toHaveBeenCalled();
  });
});
