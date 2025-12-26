import { DateTime } from 'luxon';
import { computeNextAnchor, computeNextWindowStart, GuildConfig } from '../scheduler';

describe('scheduler helpers', () => {
  it('returns the same week anchor when now is before the anchor', () => {
    const config: GuildConfig = { timezone: 'UTC', anchorWeekday: 1, anchorHour: 12 };
    const now = DateTime.fromISO('2024-04-01T10:00:00Z');
    const anchor = computeNextAnchor(now, config);
    expect(anchor.toISO()).toBe('2024-04-01T12:00:00.000Z');
  });

  it('returns next week anchor when now is after the anchor', () => {
    const config: GuildConfig = { timezone: 'UTC', anchorWeekday: 1, anchorHour: 12 };
    const now = DateTime.fromISO('2024-04-01T13:00:00Z');
    const anchor = computeNextAnchor(now, config);
    expect(anchor.toISO()).toBe('2024-04-08T12:00:00.000Z');
  });

  it('advances window start by the configured length', () => {
    const config: GuildConfig = { timezone: 'UTC', windowLengthHours: 24 };
    const latestStart = DateTime.fromISO('2024-04-01T12:00:00Z');
    const now = DateTime.fromISO('2024-04-02T12:00:00Z');
    const nextStart = computeNextWindowStart(latestStart, now, config);
    expect(nextStart.toISO()).toBe('2024-04-02T12:00:00.000Z');
  });
});
