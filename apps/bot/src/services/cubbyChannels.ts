import { ChannelType, type Guild, type GuildBasedChannel } from 'discord.js';

export type NotificationChannel = GuildBasedChannel & {
  send: (payload: { content: string; components?: unknown[]; allowedMentions?: { parse?: string[] } }) => Promise<unknown>;
};

export function normalizeChannelName(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-');
}

function isNotificationChannel(channel: GuildBasedChannel | null | undefined): channel is NotificationChannel {
  if (!channel) {
    return false;
  }
  if (
    channel.type !== ChannelType.GuildText &&
    channel.type !== ChannelType.PublicThread &&
    channel.type !== ChannelType.PrivateThread
  ) {
    return false;
  }
  return typeof (channel as { send?: unknown }).send === 'function';
}

export async function findCubbyChannel(guild: Guild, characterName: string): Promise<NotificationChannel | null> {
  const target = normalizeChannelName(characterName);
  const channels = await guild.channels.fetch();
  for (const channel of channels.values()) {
    if (!isNotificationChannel(channel)) {
      continue;
    }
    if (normalizeChannelName(channel.name) === target) {
      return channel;
    }
  }

  const activeThreads = await guild.channels.fetchActiveThreads().catch(() => null);
  if (!activeThreads) {
    return null;
  }
  for (const thread of activeThreads.threads.values()) {
    if (!isNotificationChannel(thread)) {
      continue;
    }
    if (normalizeChannelName(thread.name) === target) {
      return thread;
    }
  }

  return null;
}

/**
 * Fetch all channels and active threads once, returning a map of
 * normalized-name → NotificationChannel.  Use this instead of calling
 * findCubbyChannel in a loop to avoid one API round-trip per character.
 */
export async function buildCubbyChannelMap(guild: Guild): Promise<Map<string, NotificationChannel>> {
  const map = new Map<string, NotificationChannel>();

  const channels = await guild.channels.fetch();
  for (const channel of channels.values()) {
    if (isNotificationChannel(channel)) {
      map.set(normalizeChannelName(channel.name), channel);
    }
  }

  const activeThreads = await guild.channels.fetchActiveThreads().catch(() => null);
  if (activeThreads) {
    for (const thread of activeThreads.threads.values()) {
      if (isNotificationChannel(thread)) {
        map.set(normalizeChannelName(thread.name), thread);
      }
    }
  }

  return map;
}
