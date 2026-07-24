import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

const mockConfig = vi.hoisted(() => ({
  passageOfTimeTimezone: 'America/Chicago',
  passageSunsetWeekdayLocal: 2, // Tuesday
  passageSunsetHourLocal: 12,
  passageSunsetMinuteLocal: 0,
  passageSunsetAnchorDate: '2026-01-06', // a Tuesday
}));

vi.mock('../config', () => ({ config: mockConfig }));

import {
  __resetWeatherCacheForTests,
  describeWeatherCode,
  execute,
  fetchCurrentWeather,
  formatWeatherLine,
} from '../commands/weather';

function makeInteraction() {
  return {
    deferReply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
  };
}

function mockFetchSequence(...currents: Record<string, number>[]) {
  const fn = vi.fn();
  for (const current of currents) {
    fn.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ current }) });
  }
  vi.stubGlobal('fetch', fn);
  return fn;
}

const NIGHT_1 = new Date('2026-01-06T18:00:00Z'); // sunset hour on the anchor date
const NIGHT_1_LATER = new Date('2026-01-16T12:00:00Z'); // still inside the same 2-week night
const NIGHT_2 = new Date('2026-01-20T18:00:00Z'); // next cadence sunset
const BEFORE_FIRST_NIGHT = new Date('2026-01-01T18:00:00Z'); // no IC night has started yet

beforeEach(() => {
  __resetWeatherCacheForTests();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('describeWeatherCode', () => {
  it('maps a known WMO code to a label and emoji', () => {
    expect(describeWeatherCode(0)).toEqual({ label: 'Clear sky', emoji: '☀️' });
    expect(describeWeatherCode(95)).toEqual({ label: 'Thunderstorm', emoji: '⛈️' });
  });

  it('maps the freezing-precipitation and snow-shower codes real winter weather can return', () => {
    expect(describeWeatherCode(56)).toEqual({ label: 'Light freezing drizzle', emoji: '🌧️' });
    expect(describeWeatherCode(67)).toEqual({ label: 'Heavy freezing rain', emoji: '🌧️' });
    expect(describeWeatherCode(77)).toEqual({ label: 'Snow grains', emoji: '🌨️' });
    expect(describeWeatherCode(86)).toEqual({ label: 'Heavy snow showers', emoji: '🌨️' });
  });

  it('falls back to an unknown-conditions placeholder for an unrecognized code', () => {
    expect(describeWeatherCode(-1)).toEqual({ label: 'Unknown conditions', emoji: '❓' });
  });
});

describe('formatWeatherLine', () => {
  it('formats a short flavor-text line for the sunset announcement', () => {
    const line = formatWeatherLine({
      temperature_2m: 58.6,
      weather_code: 61,
      relative_humidity_2m: 70,
      wind_speed_10m: 8,
    });
    expect(line).toBe("🌧️ Tonight's weather in Nashville: Slight rain, 59°F");
  });
});

describe('fetchCurrentWeather — locked to the current IC night', () => {
  it('fetches once and reuses the cached snapshot for a later call within the same IC night', async () => {
    const fetchMock = mockFetchSequence({ temperature_2m: 70, weather_code: 0, relative_humidity_2m: 40, wind_speed_10m: 5 });

    const first = await fetchCurrentWeather(NIGHT_1);
    const second = await fetchCurrentWeather(NIGHT_1_LATER);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);
  });

  it('refetches once the next IC night starts', async () => {
    const fetchMock = mockFetchSequence(
      { temperature_2m: 70, weather_code: 0, relative_humidity_2m: 40, wind_speed_10m: 5 },
      { temperature_2m: 45, weather_code: 61, relative_humidity_2m: 80, wind_speed_10m: 12 },
    );

    const night1 = await fetchCurrentWeather(NIGHT_1);
    const night2 = await fetchCurrentWeather(NIGHT_2);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(night2).not.toEqual(night1);
  });

  it('fetches live every call when no IC night has started yet (nothing to lock to)', async () => {
    const fetchMock = mockFetchSequence(
      { temperature_2m: 70, weather_code: 0, relative_humidity_2m: 40, wind_speed_10m: 5 },
      { temperature_2m: 71, weather_code: 0, relative_humidity_2m: 41, wind_speed_10m: 5 },
    );

    await fetchCurrentWeather(BEFORE_FIRST_NIGHT);
    await fetchCurrentWeather(BEFORE_FIRST_NIGHT);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('/weather execute', () => {
  it('defers, fetches current conditions, and edits the reply with an embed', async () => {
    mockFetchSequence({ temperature_2m: 78.4, weather_code: 1, relative_humidity_2m: 55.2, wind_speed_10m: 6.8 });

    const interaction = makeInteraction();
    await execute(interaction as never);

    expect(interaction.deferReply).toHaveBeenCalled();
    expect(interaction.editReply).toHaveBeenCalledWith(
      expect.objectContaining({ embeds: expect.any(Array) }),
    );
  });

  it('reports a friendly error when the weather service is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

    const interaction = makeInteraction();
    await execute(interaction as never);

    expect(interaction.editReply).toHaveBeenCalledWith(
      expect.stringContaining('Could not reach the weather service'),
    );
  });
});
