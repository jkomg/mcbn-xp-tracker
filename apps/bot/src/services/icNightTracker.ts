import { daysBetweenUtc, localParts, toDateOnly } from './passageOfTimeService';

export type SunsetSchedule = {
  timezone: string;
  weekdayLocal: number;
  hourLocal: number;
  minuteLocal: number;
  anchorDate: string;
  cadenceWeeks: number;
};

/**
 * The local calendar date (YYYY-MM-DD) of the most recent sunset event at or
 * before `now`, or null if the first sunset hasn't happened yet (fresh
 * install, or `now` predates anchorDate). Sunset starts an IC night that
 * runs for `cadenceWeeks` weeks (see PASSAGE_SUNSET_MESSAGE) -- this key
 * changes exactly when a new IC night begins, so anything that should stay
 * stable for the length of a night (e.g. cached weather) can key off it
 * instead of a wall-clock TTL.
 */
export function currentIcNightKey(now: Date, schedule: SunsetSchedule): string | null {
  const local = localParts(now, schedule.timezone);
  const today = toDateOnly(local.dateKey);
  const anchor = toDateOnly(schedule.anchorDate);
  if (!today || !anchor || schedule.cadenceWeeks < 1) {
    return null;
  }

  // Mirrors PassageOfTimeService's tick guard (parts.weekday !== event.weekdayLocal):
  // every cadence-cycle date shares anchor's weekday (cycles are multiples of
  // 7 days), so if anchor itself doesn't land on weekdayLocal, the real
  // sunset event never fires and there's no night to key off.
  if (anchor.getUTCDay() !== schedule.weekdayLocal) {
    return null;
  }

  const delta = daysBetweenUtc(today, anchor);
  if (delta < 0) {
    return null;
  }

  const cycleDays = schedule.cadenceWeeks * 7;
  let daysIntoCycle = delta % cycleDays;

  const beforeSunsetTimeToday =
    daysIntoCycle === 0 &&
    (local.hour < schedule.hourLocal || (local.hour === schedule.hourLocal && local.minute < schedule.minuteLocal));

  if (beforeSunsetTimeToday) {
    // Today is a cadence day, but the sunset hour hasn't happened yet --
    // the current night (if any) is still the previous cycle.
    if (delta - cycleDays < 0) {
      return null;
    }
    daysIntoCycle += cycleDays;
  }

  const nightStart = new Date(today.getTime() - daysIntoCycle * 24 * 60 * 60 * 1000);
  return nightStart.toISOString().slice(0, 10);
}
