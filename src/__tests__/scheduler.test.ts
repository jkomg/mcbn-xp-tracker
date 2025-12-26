import { describe, expect, it } from 'vitest';
import { DateTime } from 'luxon';
import { computeWindowSchedule, GuildConfig } from '../scheduler';

describe('scheduler helpers', () => {
  it('keeps noon boundaries across DST transitions', () => {
    const config: GuildConfig = { timezone: 'America/Chicago' };
    const now = DateTime.fromISO('2024-03-10T10:00:00', { zone: 'America/Chicago' });
    const { current, next } = computeWindowSchedule(now, config);

    expect(current.type).toBe('Night');
    expect(current.startAt.toISO()).toBe('2024-03-05T12:00:00.000-06:00');
    expect(current.endAt.toISO()).toBe('2024-03-10T12:00:00.000-05:00');
    expect(next.startAt.toISO()).toBe('2024-03-10T12:00:00.000-05:00');
    expect(next.endAt.toISO()).toBe('2024-03-12T12:00:00.000-05:00');
  });

  it('uses the daytime buffer during Sunday-to-Tuesday gap', () => {
    const config: GuildConfig = { timezone: 'America/Chicago' };
    const now = DateTime.fromISO('2024-03-11T15:00:00', { zone: 'America/Chicago' });
    const { current } = computeWindowSchedule(now, config);

    expect(current.type).toBe('Daytime');
    expect(current.startAt.toISO()).toBe('2024-03-10T12:00:00.000-05:00');
    expect(current.endAt.toISO()).toBe('2024-03-12T12:00:00.000-05:00');
  });

  it('flips to a new night window at Tuesday noon', () => {
    const config: GuildConfig = { timezone: 'America/Chicago' };
    const now = DateTime.fromISO('2024-03-12T12:00:00', { zone: 'America/Chicago' });
    const { current } = computeWindowSchedule(now, config);

    expect(current.type).toBe('Night');
    expect(current.startAt.toISO()).toBe('2024-03-12T12:00:00.000-05:00');
    expect(current.endAt.toISO()).toBe('2024-03-17T12:00:00.000-05:00');
  });
});
