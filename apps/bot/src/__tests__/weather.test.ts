import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { __resetWeatherCacheForTests, describeWeatherCode, execute } from '../commands/weather';

function makeInteraction() {
  return {
    deferReply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
  };
}

function mockFetchOnce(current: Record<string, number>) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ current }),
    }),
  );
}

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

  it('falls back to an unknown-conditions placeholder for an unrecognized code', () => {
    expect(describeWeatherCode(-1)).toEqual({ label: 'Unknown conditions', emoji: '❓' });
  });
});

describe('/weather execute', () => {
  it('defers, fetches current conditions, and edits the reply with an embed', async () => {
    mockFetchOnce({
      temperature_2m: 78.4,
      weather_code: 1,
      relative_humidity_2m: 55.2,
      wind_speed_10m: 6.8,
    });

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
