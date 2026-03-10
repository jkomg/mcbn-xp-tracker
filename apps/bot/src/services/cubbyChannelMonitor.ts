import { ChannelType, type Client, type NonThreadGuildBasedChannel } from 'discord.js';
import { errorToMessage, logEvent } from '../logger';

const CUBBY_CATEGORY_KEYWORD = 'character cubbies';

const CUBBY_PERMISSION_PATCH = {
  ViewChannel: true,
  SendMessages: true,
  ReadMessageHistory: true,
  UseApplicationCommands: true,
  SendMessagesInThreads: true,
} as const;

/**
 * Listens for channelCreate events. When a new text channel appears under
 * a category whose name contains "character cubbies" (case-insensitive),
 * the bot immediately adds its own permission overwrite so it can post
 * claim reminders and review notifications without needing a manual
 * /xp sync-cubby-access run.
 */
export function startCubbyChannelMonitor(client: Client): void {
  client.on('channelCreate', async (channel: NonThreadGuildBasedChannel) => {
    if (channel.type !== ChannelType.GuildText) {
      return;
    }

    const parent = channel.parent;
    if (!parent || !parent.name.toLowerCase().includes(CUBBY_CATEGORY_KEYWORD)) {
      return;
    }

    const guild = channel.guild;
    const me = await guild.members.fetchMe().catch(() => null);
    if (!me) {
      logEvent('warn', 'cubby_monitor_no_self_member', { guildId: guild.id, channelId: channel.id });
      return;
    }

    try {
      await channel.permissionOverwrites.edit(me.id, CUBBY_PERMISSION_PATCH);
      logEvent('info', 'cubby_monitor_access_granted', {
        guildId: guild.id,
        channelId: channel.id,
        channelName: channel.name,
        categoryName: parent.name,
      });
    } catch (error) {
      logEvent('warn', 'cubby_monitor_access_failed', {
        guildId: guild.id,
        channelId: channel.id,
        channelName: channel.name,
        error: errorToMessage(error),
      });
    }
  });
}
