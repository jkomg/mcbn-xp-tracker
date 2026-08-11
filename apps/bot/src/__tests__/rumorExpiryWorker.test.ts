import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

const mockConfig = vi.hoisted(() => ({
  passageOfTimeTimezone: 'America/Chicago',
  passageSunsetWeekdayLocal: 2, // Tuesday
  passageSunsetHourLocal: 12,
  passageSunsetMinuteLocal: 0,
  passageSunsetAnchorDate: '2026-01-06', // a Tuesday
}));

const mockLiveConfig = vi.hoisted(() => ({
  rumorApprovalEnabled: true,
}));

vi.mock('../config', () => ({ config: mockConfig }));
vi.mock('../liveConfig', () => ({ liveConfig: mockLiveConfig }));

import { RumorExpiryWorker } from '../services/rumorExpiryWorker';

function rumor(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    discovery: 'Kindred',
    rumor_text: 'x',
    location: '',
    point_of_contact: '',
    roll: '',
    kind: 'ephemeral',
    ic_night_key: '2026-01-06',
    status: 'approved',
    requester_discord_id: '',
    requester_character_name: 'Alice',
    cubby_channel_id: null,
    cubby_message_id: null,
    posted_channel_id: 'rumor-channel-1',
    posted_message_id: 'public-msg-1',
    approved_by_discord_id: '',
    approved_by_name: '',
    rejected_by_discord_id: '',
    rejected_by_name: '',
    rejected_reason: '',
    created_at: null,
    resolved_at: null,
    ...overrides,
  };
}

function makeAdapter(overrides: Record<string, unknown> = {}) {
  return {
    listActiveEphemeralRumors: vi.fn().mockResolvedValue([]),
    expireRumor: vi.fn().mockResolvedValue({ ok: true, message: 'Rumor expired.' }),
    ...overrides,
  };
}

function makeClient(channel: unknown = null) {
  return {
    user: { id: 'bot-1', username: 'lasombra-bot' },
    channels: { fetch: vi.fn().mockResolvedValue(channel) },
  };
}

beforeEach(() => {
  mockLiveConfig.rumorApprovalEnabled = true;
  // 2026-01-20 18:00 UTC = noon CT on a cadence Tuesday two weeks after the
  // anchor -- currentIcNightKey should resolve to '2026-01-20' at this instant.
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-20T18:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('RumorExpiryWorker', () => {
  it('does nothing when rumorApprovalEnabled is off', async () => {
    mockLiveConfig.rumorApprovalEnabled = false;
    const adapter = makeAdapter();
    const worker = new RumorExpiryWorker(makeClient() as never, adapter as never, { intervalMs: 60_000 });

    await (worker as unknown as { tick: () => Promise<void> }).tick();

    expect(adapter.listActiveEphemeralRumors).not.toHaveBeenCalled();
  });

  it('expires a rumor whose night key no longer matches the current night, deleting its message', async () => {
    const message = { delete: vi.fn().mockResolvedValue(undefined) };
    const channel = {
      isTextBased: () => true,
      messages: { delete: vi.fn().mockResolvedValue(undefined) },
    };
    const client = makeClient(channel);
    const stale = rumor({ id: 1, ic_night_key: '2026-01-06' });
    const adapter = makeAdapter({ listActiveEphemeralRumors: vi.fn().mockResolvedValue([stale]) });
    const worker = new RumorExpiryWorker(client as never, adapter as never, { intervalMs: 60_000 });

    await (worker as unknown as { tick: () => Promise<void> }).tick();

    expect(channel.messages.delete).toHaveBeenCalledWith('public-msg-1');
    expect(adapter.expireRumor).toHaveBeenCalledWith(1, { requesterDiscordId: 'bot-1', requesterDiscordName: 'lasombra-bot' });
    void message;
  });

  it('leaves a rumor from the current night alone', async () => {
    const channel = { isTextBased: () => true, messages: { delete: vi.fn().mockResolvedValue(undefined) } };
    const client = makeClient(channel);
    const current = rumor({ id: 2, ic_night_key: '2026-01-20' });
    const adapter = makeAdapter({ listActiveEphemeralRumors: vi.fn().mockResolvedValue([current]) });
    const worker = new RumorExpiryWorker(client as never, adapter as never, { intervalMs: 60_000 });

    await (worker as unknown as { tick: () => Promise<void> }).tick();

    expect(channel.messages.delete).not.toHaveBeenCalled();
    expect(adapter.expireRumor).not.toHaveBeenCalled();
  });

  it('still calls expireRumor when the posted message was already deleted or the channel is gone', async () => {
    const client = makeClient(null); // channels.fetch resolves null
    const stale = rumor({ id: 3, ic_night_key: '2026-01-06' });
    const adapter = makeAdapter({ listActiveEphemeralRumors: vi.fn().mockResolvedValue([stale]) });
    const worker = new RumorExpiryWorker(client as never, adapter as never, { intervalMs: 60_000 });

    await (worker as unknown as { tick: () => Promise<void> }).tick();

    expect(adapter.expireRumor).toHaveBeenCalledWith(3, { requesterDiscordId: 'bot-1', requesterDiscordName: 'lasombra-bot' });
  });

  it('does not re-enter while a tick is already running', async () => {
    let resolveList!: (v: unknown[]) => void;
    const pending = new Promise<unknown[]>((resolve) => { resolveList = resolve; });
    const adapter = makeAdapter({ listActiveEphemeralRumors: vi.fn().mockReturnValue(pending) });
    const worker = new RumorExpiryWorker(makeClient() as never, adapter as never, { intervalMs: 60_000 });

    const first = (worker as unknown as { tick: () => Promise<void> }).tick();
    const second = (worker as unknown as { tick: () => Promise<void> }).tick();
    resolveList([]);
    await Promise.all([first, second]);

    expect(adapter.listActiveEphemeralRumors).toHaveBeenCalledTimes(1);
  });
});
