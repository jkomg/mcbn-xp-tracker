import { config } from '../config';
import type { SunsetSchedule } from './icNightTracker';

/**
 * The live sunset schedule, read from config. Matches PassageOfTimeService's
 * cadence (2-week IC nights) — shared by every caller that keys something
 * off "which IC night is it right now" (weather cache, ephemeral rumors).
 *
 * Deliberately kept out of icNightTracker.ts: that module is a pure
 * function with no config dependency, which keeps its unit tests free of
 * env-var setup. Importing config here instead of there avoids coupling
 * that purity to config.ts's top-level env parsing.
 */
export function activeSunsetSchedule(): SunsetSchedule {
  return {
    timezone: config.passageOfTimeTimezone,
    weekdayLocal: config.passageSunsetWeekdayLocal,
    hourLocal: config.passageSunsetHourLocal,
    minuteLocal: config.passageSunsetMinuteLocal,
    anchorDate: config.passageSunsetAnchorDate,
    cadenceWeeks: 2,
  };
}
