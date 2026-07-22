import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';

// Nashville, TN — the only location this command supports for now.
const LATITUDE = 36.1627;
const LONGITUDE = -86.7816;

const CACHE_TTL_MS = 10 * 60 * 1000;
let cache: { fetchedAt: number; data: OpenMeteoCurrent } | null = null;

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
  61: { label: 'Slight rain', emoji: '🌧️' },
  63: { label: 'Moderate rain', emoji: '🌧️' },
  65: { label: 'Heavy rain', emoji: '🌧️' },
  71: { label: 'Slight snow', emoji: '🌨️' },
  73: { label: 'Moderate snow', emoji: '🌨️' },
  75: { label: 'Heavy snow', emoji: '🌨️' },
  80: { label: 'Slight rain showers', emoji: '🌦️' },
  81: { label: 'Moderate rain showers', emoji: '🌦️' },
  82: { label: 'Violent rain showers', emoji: '⛈️' },
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

/** Test-only: the module-level cache otherwise leaks across test cases. */
export function __resetWeatherCacheForTests() {
  cache = null;
}

async function fetchCurrentWeather(): Promise<OpenMeteoCurrent> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.data;
  }

  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${LATITUDE}&longitude=${LONGITUDE}` +
    '&current=temperature_2m,weather_code,relative_humidity_2m,wind_speed_10m' +
    '&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=America%2FChicago';

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Open-Meteo request failed: ${res.status}`);
  }
  const body = (await res.json()) as { current: OpenMeteoCurrent };
  cache = { fetchedAt: Date.now(), data: body.current };
  return body.current;
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
    .setFooter({ text: 'via Open-Meteo' });

  await interaction.editReply({ embeds: [embed] });
}
