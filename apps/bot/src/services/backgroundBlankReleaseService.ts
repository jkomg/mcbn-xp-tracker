import type { Client } from 'discord.js';
import { errorToMessage, logEvent } from '../logger';
import { buildCubbyChannelMap, normalizeChannelName } from './cubbyChannels';
import type { TrackerAdapter } from './adapter';

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

          const mention = /^\d{17,20}$/.test(release.player_discord)
            ? `<@${release.player_discord}>`
            : release.character_name;

          await channel.send({
            content: [
              `${mention} your background refresh is ready.`,
              `Released **${release.dots_released}** dot(s) of **${release.background_name}**.`,
              releaseBatch.currentNight ? `Current night: **${releaseBatch.currentNight}**.` : '',
            ].filter(Boolean).join('\n'),
          });
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
