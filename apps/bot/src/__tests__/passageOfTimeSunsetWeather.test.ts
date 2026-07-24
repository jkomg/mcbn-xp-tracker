import { describe, expect, it, vi, beforeEach } from 'vitest';

const mockWeather = vi.hoisted(() => ({
  fetchCurrentWeather: vi.fn(),
  formatWeatherLine: vi.fn(),
}));

vi.mock('../commands/weather', () => mockWeather);

import { appendSunsetWeather } from '../services/passageOfTimeService';

beforeEach(() => {
  mockWeather.fetchCurrentWeather.mockReset();
  mockWeather.formatWeatherLine.mockReset();
});

describe('appendSunsetWeather', () => {
  it('fetches weather for the given moment and appends the formatted line', async () => {
    const now = new Date('2026-07-24T18:00:00Z');
    const current = { temperature_2m: 80, weather_code: 0, relative_humidity_2m: 40, wind_speed_10m: 5 };
    mockWeather.fetchCurrentWeather.mockResolvedValue(current);
    mockWeather.formatWeatherLine.mockReturnValue("☀️ Tonight's weather in Nashville: Clear sky, 80°F");

    const result = await appendSunsetWeather('The night begins.', now);

    expect(mockWeather.fetchCurrentWeather).toHaveBeenCalledWith(now);
    expect(mockWeather.formatWeatherLine).toHaveBeenCalledWith(current);
    expect(result).toBe("The night begins.\n\n☀️ Tonight's weather in Nashville: Clear sky, 80°F");
  });

  it('returns the original content unchanged if the weather fetch fails, without throwing', async () => {
    mockWeather.fetchCurrentWeather.mockRejectedValue(new Error('Open-Meteo request failed: 500'));

    const result = await appendSunsetWeather('The night begins.', new Date());

    expect(result).toBe('The night begins.');
  });
});
