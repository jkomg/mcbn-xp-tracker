import type { Client } from 'discord.js';
import { errorToMessage, logEvent } from '../logger';
import { buildCubbyChannelMap, normalizeChannelName } from './cubbyChannels';
import type { TrackerAdapter } from './adapter';
import type { BackgroundReleaseEvent } from '../types';

/**
 * The web side only releases a blank once its releasing night has started on
 * the game calendar, so by the time this is sent the dots are usable. Say so
 * plainly. This used to append "Current night: <period label>", but the label
 * embeds the period's date range, and staff open periods days before they
 * begin — so a player read a future date range as the day the dots came back.
 */
export function buildBlankReleaseMessage(release: BackgroundReleaseEvent): string {
  const mention = /^\d{17,20}$/.test(release.player_discord) ? `<@${release.player_discord}>` : release.character_name;
  const one = release.dots_released === 1;
  const dots = one ? '1 dot' : `${release.dots_released} dots`;
  return `${mention} your **${dots}** of **${release.background_name}** ${one ? 'is' : 'are'} back and can be used now.`;
}

export class BackgroundBlankReleaseService {
  private readonly client: Client;
  private readonly adapter: TrackerAdapter;
  private readonly guildId?: string;
  private readonly intervalMs: number;

  constructor(client: Client, adapter: TrackerAdapter, guildId?: string, intervalMs = 120_000) {
    this.client = client;
    this.adapter = adapter;
    this.guildId = guildId;
    this.intervalMs = intervalMs;
  }

  async tick(): Promise<void> {
    if (!this.guildId) {
      return;
    }

    try {
      const releaseBatch = await this.adapter.releaseDueBackgroundBlanks();
      if (!releaseBatch.ok || releaseBatch.released.length === 0) {
        return;
      }

      const guild = await this.client.guilds.fetch(this.guildId).catch(() => null);
      if (!guild) {
        logEvent('warn', 'background_release_guild_not_found', { guildId: this.guildId });
        return;
      }

      const channelMap = await buildCubbyChannelMap(guild);
      let sent = 0;
      let failed = 0;
      for (const release of releaseBatch.released) {
        try {
          const channel = channelMap.get(normalizeChannelName(release.character_name));
          if (!channel) {
            failed += 1;
            logEvent('warn', 'background_release_cubby_missing', { characterName: release.character_name });
            continue;
          }

          await channel.send({ content: buildBlankReleaseMessage(release) });
          sent += 1;
        } catch (error) {
          failed += 1;
          logEvent('warn', 'background_release_notify_failed', {
            characterName: release.character_name,
            backgroundName: release.background_name,
            error: errorToMessage(error),
          });
        }
      }

      logEvent('info', 'background_release_notified', {
        currentNight: releaseBatch.currentNight,
        released: releaseBatch.released.length,
        sent,
        failed,
      });
    } catch (error) {
      logEvent('warn', 'background_release_tick_failed', { error: errorToMessage(error) });
    }
  }

  start(): void {
    void this.tick();
    setInterval(() => void this.tick(), this.intervalMs).unref();
  }
}
