import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';
import { currentIcNightKey } from '../services/icNightTracker';
import { activeSunsetSchedule } from '../services/sunsetSchedule';

// Nashville, TN — the only location this command supports for now.
const LATITUDE = 36.1627;
const LONGITUDE = -86.7816;

// An IC night runs 2 weeks IRL (matches the sunset passage-of-time event —
// see PASSAGE_SUNSET_MESSAGE), so refetching weather on every call would let
// it swing wildly within a single "night," breaking the narrative. Instead
// the weather is locked in at the start of each IC night and held steady
// until the next one, keyed by currentIcNightKey rather than a wall-clock TTL.
let cache: { nightKey: string; data: OpenMeteoCurrent } | null = null;

// https://open-meteo.com/en/docs — WMO weather interpretation codes.
const WEATHER_CODES: Record<number, { label: string; emoji: string }> = {
  0: { label: 'Clear sky', emoji: '☀️' },
  1: { label: 'Mainly clear', emoji: '🌤️' },
  2: { label: 'Partly cloudy', emoji: '⛅' },
  3: { label: 'Overcast', emoji: '☁️' },
  45: { label: 'Fog', emoji: '🌫️' },
  48: { label: 'Depositing rime fog', emoji: '🌫️' },
  51: { label: 'Light drizzle', emoji: '🌦️' },
  53: { label: 'Moderate drizzle', emoji: '🌦️' },
  55: { label: 'Dense drizzle', emoji: '🌦️' },
  56: { label: 'Light freezing drizzle', emoji: '🌧️' },
  57: { label: 'Dense freezing drizzle', emoji: '🌧️' },
  61: { label: 'Slight rain', emoji: '🌧️' },
  63: { label: 'Moderate rain', emoji: '🌧️' },
  65: { label: 'Heavy rain', emoji: '🌧️' },
  66: { label: 'Light freezing rain', emoji: '🌧️' },
  67: { label: 'Heavy freezing rain', emoji: '🌧️' },
  71: { label: 'Slight snow', emoji: '🌨️' },
  73: { label: 'Moderate snow', emoji: '🌨️' },
  75: { label: 'Heavy snow', emoji: '🌨️' },
  77: { label: 'Snow grains', emoji: '🌨️' },
  80: { label: 'Slight rain showers', emoji: '🌦️' },
  81: { label: 'Moderate rain showers', emoji: '🌦️' },
  82: { label: 'Violent rain showers', emoji: '⛈️' },
  85: { label: 'Slight snow showers', emoji: '🌨️' },
  86: { label: 'Heavy snow showers', emoji: '🌨️' },
  95: { label: 'Thunderstorm', emoji: '⛈️' },
  96: { label: 'Thunderstorm with slight hail', emoji: '⛈️' },
  99: { label: 'Thunderstorm with heavy hail', emoji: '⛈️' },
};

interface OpenMeteoCurrent {
  temperature_2m: number;
  weather_code: number;
  relative_humidity_2m: number;
  wind_speed_10m: number;
}

export function describeWeatherCode(code: number): { label: string; emoji: string } {
  return WEATHER_CODES[code] ?? { label: 'Unknown conditions', emoji: '❓' };
}

/** Short flavor-text line for embedding in the sunset passage-of-time announcement. */
export function formatWeatherLine(current: OpenMeteoCurrent): string {
  const { label, emoji } = describeWeatherCode(current.weather_code);
  return `${emoji} Tonight's weather in Nashville: ${label}, ${Math.round(current.temperature_2m)}°F`;
}

/** Test-only: the module-level cache otherwise leaks across test cases. */
export function __resetWeatherCacheForTests() {
  cache = null;
}

async function fetchOpenMeteo(): Promise<OpenMeteoCurrent> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${LATITUDE}&longitude=${LONGITUDE}` +
    '&current=temperature_2m,weather_code,relative_humidity_2m,wind_speed_10m' +
    '&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=America%2FChicago';

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Open-Meteo request failed: ${res.status}`);
  }
  const body = (await res.json()) as { current: OpenMeteoCurrent };
  return body.current;
}

/**
 * Returns weather locked to the current IC night, refetching only when the
 * night key changes. If no IC night has started yet (fresh install, or
 * `now` predates the sunset anchor date), there's nothing to lock to, so
 * this falls back to fetching live every call.
 */
export async function fetchCurrentWeather(now: Date = new Date()): Promise<OpenMeteoCurrent> {
  const nightKey = currentIcNightKey(now, activeSunsetSchedule());

  if (nightKey && cache && cache.nightKey === nightKey) {
    return cache.data;
  }

  const data = await fetchOpenMeteo();
  if (nightKey) {
    cache = { nightKey, data };
  }
  return data;
}

export const data = new SlashCommandBuilder()
  .setName('weather')
  .setDescription("Current weather in Nashville");

export const name = 'weather';

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();

  let current: OpenMeteoCurrent;
  try {
    current = await fetchCurrentWeather();
  } catch {
    await interaction.editReply('Could not reach the weather service — try again in a bit.');
    return;
  }

  const { label, emoji } = describeWeatherCode(current.weather_code);
  const embed = new EmbedBuilder()
    .setTitle(`${emoji} Nashville Weather`)
    .setDescription(label)
    .addFields(
      { name: 'Temperature', value: `${Math.round(current.temperature_2m)}°F`, inline: true },
      { name: 'Humidity', value: `${Math.round(current.relative_humidity_2m)}%`, inline: true },
      { name: 'Wind', value: `${Math.round(current.wind_speed_10m)} mph`, inline: true },
    )
    .setColor(0x3987e5)
    .setFooter({ text: "Locked in for tonight's IC night • via Open-Meteo" });

  await interaction.editReply({ embeds: [embed] });
}
