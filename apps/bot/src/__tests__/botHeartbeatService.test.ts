import { afterEach, describe, expect, it, vi } from 'vitest';
import { liveConfig } from '../liveConfig';
import type { TrackerAdapter } from '../services/adapter';
import { BotHeartbeatService } from '../services/botHeartbeatService';

describe('BotHeartbeatService', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('start uses provided interval and unrefs timer', () => {
    const adapter = { postHeartbeat: vi.fn(async () => {}) } as unknown as TrackerAdapter;
    const service = new BotHeartbeatService(adapter, 234_000);
    const beatSpy = vi.spyOn(service, 'beat').mockResolvedValue(undefined);
    const unref = vi.fn();
    const intervalSpy = vi.spyOn(global, 'setInterval').mockReturnValue({ unref } as unknown as NodeJS.Timeout);

    service.start();

    expect(beatSpy).toHaveBeenCalledTimes(1);
    expect(intervalSpy).toHaveBeenCalledTimes(1);
    expect(intervalSpy).toHaveBeenCalledWith(expect.any(Function), 234_000);
    expect(unref).toHaveBeenCalledTimes(1);
  });

  it('beat posts current liveConfig service flags', async () => {
    liveConfig.reviewNotifierEnabled = true;
    liveConfig.submissionNotifierEnabled = false;
    liveConfig.autoPeriodCreatorEnabled = true;
    liveConfig.autoPeriodCloserEnabled = false;
    liveConfig.claimReminderEnabled = true;
    liveConfig.passageOfTimeEnabled = false;
    liveConfig.huntConsequenceEnabled = true;

    const adapter = { postHeartbeat: vi.fn(async () => {}) } as unknown as TrackerAdapter;
    const service = new BotHeartbeatService(adapter);

    await service.beat();

    expect(adapter.postHeartbeat).toHaveBeenCalledWith({
      reviewNotifierEnabled: true,
      submissionNotifierEnabled: false,
      autoPeriodCreatorEnabled: true,
      autoPeriodCloserEnabled: false,
      claimReminderEnabled: true,
      passageOfTimeEnabled: false,
      huntConsequenceEnabled: true,
    });
  });

  it('beat includes static capability state when provided', async () => {
    const adapter = { postHeartbeat: vi.fn(async () => {}) } as unknown as TrackerAdapter;
    const service = new BotHeartbeatService(adapter, 60_000, { wikiSyncCapable: true });

    await service.beat();

    expect(adapter.postHeartbeat).toHaveBeenCalledWith(
      expect.objectContaining({
        wikiSyncCapable: true,
      }),
    );
  });
});
