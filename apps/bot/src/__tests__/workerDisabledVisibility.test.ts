import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Client } from 'discord.js';
import { SheetsReconcileService } from '../services/sheetsReconcileService';
import { WikiSyncScheduler } from '../services/wikiSyncScheduler';
import { RetirementAutomationWorker } from '../services/retirementAutomationWorker';
import { logEvent } from '../logger';
import type { TrackerAdapter } from '../services/adapter';

// Covers the same "disabled worker must log a distinct warning and never
// tick" contract as cubbySyncWorker.test.ts, for the three other workers
// found to share the identical silent-no-op footgun (no liveConfig mirror,
// so a wrong env var persists for the whole process lifetime with zero
// dashboard visibility) during the 2026-07-20 architecture crawl.

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

function makeAdapter(overrides: Partial<TrackerAdapter> = {}): TrackerAdapter {
  return { ...overrides } as unknown as TrackerAdapter;
}

function makeClient(guildFetch = vi.fn().mockResolvedValue(null)) {
  return { guilds: { fetch: guildFetch } } as unknown as Client;
}

describe('SheetsReconcileService.start', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('logs a distinct warning and never ticks when disabled', async () => {
    vi.useFakeTimers();
    const adapter = makeAdapter();
    const service = new SheetsReconcileService(adapter, {
      enabled: false,
      hourLocal: 3,
      minuteLocal: 0,
      timezone: 'UTC',
      intervalMs: 60_000,
    });

    service.start();
    await vi.advanceTimersByTimeAsync(5000);

    expect(logEvent).toHaveBeenCalledWith('warn', 'sheets_reconcile_service_disabled', expect.anything());
    expect(logEvent).not.toHaveBeenCalledWith('info', 'sheets_reconcile_service_started', expect.anything());
  });

  it('logs started and runs immediately when enabled', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T09:00:00.000Z'));
    const adapter = makeAdapter();
    const service = new SheetsReconcileService(adapter, {
      enabled: true,
      hourLocal: 3,
      minuteLocal: 0,
      timezone: 'UTC',
      intervalMs: 3_600_000,
    });

    service.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(logEvent).toHaveBeenCalledWith('info', 'sheets_reconcile_service_started', expect.anything());
  });
});

describe('WikiSyncScheduler.start', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('logs a distinct warning and never ticks when disabled', async () => {
    vi.useFakeTimers();
    const adapter = makeAdapter();
    const scheduler = new WikiSyncScheduler(adapter, {
      enabled: false,
      hourLocal: 4,
      minuteLocal: 0,
      timezone: 'UTC',
      intervalMs: 60_000,
    });

    scheduler.start();
    await vi.advanceTimersByTimeAsync(5000);

    expect(logEvent).toHaveBeenCalledWith('warn', 'wiki_sync_scheduler_disabled', expect.anything());
    expect(logEvent).not.toHaveBeenCalledWith('info', 'wiki_sync_scheduler_started', expect.anything());
  });

  it('logs started and runs immediately when enabled', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T09:00:00.000Z'));
    const adapter = makeAdapter();
    const scheduler = new WikiSyncScheduler(adapter, {
      enabled: true,
      hourLocal: 4,
      minuteLocal: 0,
      timezone: 'UTC',
      intervalMs: 3_600_000,
    });

    scheduler.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(logEvent).toHaveBeenCalledWith('info', 'wiki_sync_scheduler_started', expect.anything());
  });
});

describe('RetirementAutomationWorker.start', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('logs a distinct warning and never ticks when disabled', async () => {
    vi.useFakeTimers();
    const guildFetch = vi.fn().mockResolvedValue(null);
    const client = makeClient(guildFetch);
    const adapter = makeAdapter();
    const worker = new RetirementAutomationWorker(adapter, client, {
      enabled: false,
      intervalMs: 60_000,
      guildId: 'guild-1',
      retiredCubbyCategoryId: '',
      childrenForumId: '',
      retiredForumId: '',
      wikiBatchEnabled: false,
      wikiBatchHourLocal: 4,
      wikiBatchMinuteLocal: 0,
      wikiBatchTimezone: 'UTC',
      notifyChannelId: '',
    });

    worker.start();
    await vi.advanceTimersByTimeAsync(5000);

    expect(logEvent).toHaveBeenCalledWith('warn', 'retirement_automation_worker_disabled', expect.anything());
    expect(logEvent).not.toHaveBeenCalledWith('info', 'retirement_automation_worker_started', expect.anything());
    expect(guildFetch).not.toHaveBeenCalled();
  });

  it('logs started and runs immediately when enabled', async () => {
    vi.useFakeTimers();
    const guildFetch = vi.fn().mockResolvedValue(null);
    const client = makeClient(guildFetch);
    const adapter = makeAdapter();
    const worker = new RetirementAutomationWorker(adapter, client, {
      enabled: true,
      intervalMs: 3_600_000,
      guildId: 'guild-1',
      retiredCubbyCategoryId: '',
      childrenForumId: '',
      retiredForumId: '',
      wikiBatchEnabled: false,
      wikiBatchHourLocal: 4,
      wikiBatchMinuteLocal: 0,
      wikiBatchTimezone: 'UTC',
      notifyChannelId: '',
    });

    worker.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(logEvent).toHaveBeenCalledWith('info', 'retirement_automation_worker_started', expect.anything());
    expect(guildFetch).toHaveBeenCalledTimes(1);
  });
});
