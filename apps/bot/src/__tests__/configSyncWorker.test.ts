import { describe, expect, it, vi } from 'vitest';
import type { BotConfigResponse, TrackerAdapter } from '../services/adapter';
import { ConfigSyncWorker } from '../services/configSyncWorker';

vi.mock('../logger', () => ({
  logEvent: vi.fn(),
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
    ackBotRestart: vi.fn(async () => {}),
  } as unknown as TrackerAdapter;
}

describe('ConfigSyncWorker', () => {
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

    vi.restoreAllMocks();
  });
});
