import { describe, expect, it, vi } from 'vitest';
import { flushEntries, type ActivityEntry } from '../services/activityBackfillScanner';
import type { TrackerAdapter } from '../services/adapter';

function fakeAdapter() {
  return { recordDiscordActivity: vi.fn().mockResolvedValue(undefined) } as unknown as TrackerAdapter & {
    recordDiscordActivity: ReturnType<typeof vi.fn>;
  };
}

function entry(overrides: Partial<ActivityEntry> = {}): ActivityEntry {
  return { discord_id: 'u1', date: '2026-06-01', category: 'ic', count: 5, ...overrides };
}

describe('flushEntries', () => {
  it('sends a first-time flush with mode=replace', async () => {
    const adapter = fakeAdapter();
    const seen = new Set<string>();
    await flushEntries(adapter, [entry()], {}, seen);

    expect(adapter.recordDiscordActivity).toHaveBeenCalledTimes(1);
    expect(adapter.recordDiscordActivity).toHaveBeenCalledWith([entry()], {}, 'replace');
  });

  it('marks the key as seen after a replace flush', async () => {
    const adapter = fakeAdapter();
    const seen = new Set<string>();
    await flushEntries(adapter, [entry()], {}, seen);

    expect(seen.has('u1|2026-06-01|ic')).toBe(true);
  });

  it('sends a second flush of the same key within one run as mode=increment', async () => {
    const adapter = fakeAdapter();
    const seen = new Set<string>();
    await flushEntries(adapter, [entry({ count: 5 })], {}, seen);
    await flushEntries(adapter, [entry({ count: 3 })], {}, seen);

    expect(adapter.recordDiscordActivity).toHaveBeenNthCalledWith(1, [entry({ count: 5 })], {}, 'replace');
    expect(adapter.recordDiscordActivity).toHaveBeenNthCalledWith(2, [entry({ count: 3 })], {}, 'increment');
  });

  it('splits a mixed batch: new keys go via replace, already-seen keys via increment', async () => {
    const adapter = fakeAdapter();
    const seen = new Set<string>(['u1|2026-06-01|ic']);
    const newEntry = entry({ discord_id: 'u2', count: 7 });
    const seenEntry = entry({ discord_id: 'u1', count: 2 });

    await flushEntries(adapter, [newEntry, seenEntry], {}, seen);

    expect(adapter.recordDiscordActivity).toHaveBeenCalledTimes(2);
    expect(adapter.recordDiscordActivity).toHaveBeenCalledWith([newEntry], {}, 'replace');
    expect(adapter.recordDiscordActivity).toHaveBeenCalledWith([seenEntry], {}, 'increment');
  });

  it('does not call the adapter at all for an empty entries list', async () => {
    const adapter = fakeAdapter();
    await flushEntries(adapter, [], {}, new Set());
    expect(adapter.recordDiscordActivity).not.toHaveBeenCalled();
  });

  it('treats different categories on the same day as distinct keys', async () => {
    const adapter = fakeAdapter();
    const seen = new Set<string>();
    await flushEntries(adapter, [entry({ category: 'ic' })], {}, seen);
    await flushEntries(adapter, [entry({ category: 'ooc' })], {}, seen);

    expect(adapter.recordDiscordActivity).toHaveBeenNthCalledWith(1, [entry({ category: 'ic' })], {}, 'replace');
    expect(adapter.recordDiscordActivity).toHaveBeenNthCalledWith(2, [entry({ category: 'ooc' })], {}, 'replace');
  });
});
