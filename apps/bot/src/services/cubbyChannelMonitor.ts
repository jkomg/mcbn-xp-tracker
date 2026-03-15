import { ChannelType, type AnyThreadChannel, type Client, type NonThreadGuildBasedChannel } from 'discord.js';
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
 * Returns true if the given channel or thread lives under a category whose
 * name contains "character cubbies" (case-insensitive).
 */
function isInCubbyCategory(channel: NonThreadGuildBasedChannel | AnyThreadChannel): boolean {
  // Direct text/forum channel: check its parent category.
  if ('parent' in channel && channel.parent) {
    if (channel.parent.name.toLowerCase().includes(CUBBY_CATEGORY_KEYWORD)) {
      return true;
    }
    // Thread inside a channel: check the channel's parent category.
    if ('parent' in channel.parent && channel.parent.parent) {
      return channel.parent.parent.name.toLowerCase().includes(CUBBY_CATEGORY_KEYWORD);
    }
  }
  return false;
}

/**
 * Listens for channelCreate (new text channels) and threadCreate (tickets /
 * forum posts) events. When a new channel or thread appears under a category
 * whose name contains "character cubbies", the bot grants itself access or
 * joins the thread so it can post claim reminders and review notifications.
 */
export function startCubbyChannelMonitor(client: Client): void {
  // New text channel created directly under the cubbies category.
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

  // New thread (ticket or forum post) created under the cubbies category.
  client.on('threadCreate', async (thread: AnyThreadChannel) => {
    if (!isInCubbyCategory(thread)) {
      return;
    }

    try {
      await thread.join();
      logEvent('info', 'cubby_monitor_thread_joined', {
        guildId: thread.guildId,
        threadId: thread.id,
        threadName: thread.name,
        parentId: thread.parentId,
      });
    } catch (error) {
      logEvent('warn', 'cubby_monitor_thread_join_failed', {
        guildId: thread.guildId,
        threadId: thread.id,
        threadName: thread.name,
        error: errorToMessage(error),
      });
    }
  });
}
