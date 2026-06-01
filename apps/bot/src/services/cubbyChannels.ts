import { ChannelType, type Guild, type GuildBasedChannel } from 'discord.js';

export const CUBBY_CATEGORY_NAMES = [
  'ancilla character cubbies',
  'neonate character cubbies',
  'fledgeling character cubbies',
  'mortal character cubbies',
] as const;

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

  // Restrict to cubby categories (same logic as buildCubbyChannelMap).
  const cubbyParentIds = new Set<string>();
  for (const channel of channels.values()) {
    if (channel && channel.type === ChannelType.GuildCategory) {
      if ((CUBBY_CATEGORY_NAMES as readonly string[]).includes(channel.name.toLowerCase().trim())) {
        cubbyParentIds.add(channel.id);
      }
    }
  }

  for (const channel of channels.values()) {
    if (!isNotificationChannel(channel)) continue;
    if (!channel.parentId || !cubbyParentIds.has(channel.parentId)) continue;
    if (normalizeChannelName(channel.name) === target) {
      return channel;
    }
  }

  const activeThreads = await guild.channels.fetchActiveThreads().catch(() => null);
  if (!activeThreads) {
    return null;
  }
  for (const thread of activeThreads.threads.values()) {
    if (!isNotificationChannel(thread)) continue;
    const parent = channels.get(thread.parentId ?? '');
    if (!parent?.parentId || !cubbyParentIds.has(parent.parentId)) continue;
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

  // Restrict to channels inside a cubby category so we don't accidentally
  // match same-named channels in other sections (e.g. Children of the Night).
  const cubbyParentIds = new Set<string>();
  for (const channel of channels.values()) {
    if (channel && channel.type === ChannelType.GuildCategory) {
      if ((CUBBY_CATEGORY_NAMES as readonly string[]).includes(channel.name.toLowerCase().trim())) {
        cubbyParentIds.add(channel.id);
      }
    }
  }

  for (const channel of channels.values()) {
    if (isNotificationChannel(channel) && channel.parentId && cubbyParentIds.has(channel.parentId)) {
      map.set(normalizeChannelName(channel.name), channel);
    }
  }

  const activeThreads = await guild.channels.fetchActiveThreads().catch(() => null);
  if (activeThreads) {
    for (const thread of activeThreads.threads.values()) {
      if (!isNotificationChannel(thread)) continue;
      // A thread's parent is a text channel; check that channel's category.
      const parent = channels.get(thread.parentId ?? '');
      if (parent && parent.parentId && cubbyParentIds.has(parent.parentId)) {
        map.set(normalizeChannelName(thread.name), thread);
      }
    }
  }

  return map;
}

/**
 * Returns all text channels whose parent category is one of the four cubby
 * category sections, suitable for use in autocomplete.
 */
export async function getChannelsInCubbyCategories(guild: Guild): Promise<Array<{ id: string; name: string }>> {
  const channels = await guild.channels.fetch();

  const cubbyParentIds = new Set<string>();
  for (const channel of channels.values()) {
    if (channel && channel.type === ChannelType.GuildCategory) {
      if ((CUBBY_CATEGORY_NAMES as readonly string[]).includes(channel.name.toLowerCase().trim())) {
        cubbyParentIds.add(channel.id);
      }
    }
  }

  const result: Array<{ id: string; name: string }> = [];
  for (const channel of channels.values()) {
    if (!channel || channel.type !== ChannelType.GuildText) continue;
    if (channel.parentId && cubbyParentIds.has(channel.parentId)) {
      result.push({ id: channel.id, name: channel.name });
    }
  }
  result.sort((a, b) => a.name.localeCompare(b.name));
  return result;
}
