/**
 * Pure local-timezone date helpers shared by passageOfTimeService.ts and
 * icNightTracker.ts. Kept in a separate neutral module so neither of those
 * two needs to import from the other -- passageOfTimeService.ts also needs
 * to import from commands/weather.ts (to embed weather in the sunset
 * announcement), and weather.ts imports icNightTracker.ts, so
 * passageOfTimeService -> icNightTracker -> passageOfTimeService would be a
 * circular import if these lived in passageOfTimeService.ts.
 */

export function toDateOnly(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function daysBetweenUtc(a: Date, b: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.floor((a.getTime() - b.getTime()) / msPerDay);
}

export function localParts(now: Date, timezone: string): { dateKey: string; weekday: number; hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const pick = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const dateKey = `${pick('year')}-${pick('month')}-${pick('day')}`;
  const hour = Number.parseInt(pick('hour'), 10);
  const minute = Number.parseInt(pick('minute'), 10);
  const weekdayMap: Record<string, number> = {
    sun: 0,
    mon: 1,
    tue: 2,
    wed: 3,
    thu: 4,
    fri: 5,
    sat: 6,
  };
  const weekday = weekdayMap[pick('weekday').toLowerCase()] ?? -1;
  return {
    dateKey,
    weekday,
    hour: Number.isFinite(hour) ? hour : 0,
    minute: Number.isFinite(minute) ? minute : 0,
  };
}
