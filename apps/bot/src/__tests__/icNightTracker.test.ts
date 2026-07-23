import { describe, expect, it } from 'vitest';
import { currentIcNightKey } from '../services/icNightTracker';

// 2026-01-06 is a Tuesday.
const SCHEDULE = {
  timezone: 'America/Chicago',
  weekdayLocal: 2, // Tuesday
  hourLocal: 12,
  minuteLocal: 0,
  anchorDate: '2026-01-06',
  cadenceWeeks: 2,
};

describe('currentIcNightKey', () => {
  it('returns null before the first sunset has ever happened', () => {
    expect(currentIcNightKey(new Date('2026-01-01T18:00:00Z'), SCHEDULE)).toBeNull();
  });

  it('returns null on the anchor date before the sunset hour', () => {
    // 11:59 CT on the anchor date -- sunset (noon CT) hasn't happened yet.
    expect(currentIcNightKey(new Date('2026-01-06T17:59:00Z'), SCHEDULE)).toBeNull();
  });

  it('keys to the anchor date once the sunset hour arrives', () => {
    expect(currentIcNightKey(new Date('2026-01-06T18:00:00Z'), SCHEDULE)).toBe('2026-01-06');
  });

  it('stays on the same night key for the rest of the cadence window', () => {
    // 10 days later, well inside the 2-week night.
    expect(currentIcNightKey(new Date('2026-01-16T12:00:00Z'), SCHEDULE)).toBe('2026-01-06');
  });

  it('advances to the next night key exactly at the next cadence sunset', () => {
    expect(currentIcNightKey(new Date('2026-01-20T18:00:00Z'), SCHEDULE)).toBe('2026-01-20');
    // Just before that sunset hour, still the previous night.
    expect(currentIcNightKey(new Date('2026-01-20T17:59:00Z'), SCHEDULE)).toBe('2026-01-06');
  });

  it('returns null when anchorDate does not fall on weekdayLocal (mirrors the real event never firing)', () => {
    const misconfigured = { ...SCHEDULE, anchorDate: '2026-01-07' }; // a Wednesday
    expect(currentIcNightKey(new Date('2026-02-01T18:00:00Z'), misconfigured)).toBeNull();
  });
});
