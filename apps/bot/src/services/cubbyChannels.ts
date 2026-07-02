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

function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[] = new Array(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const temp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = temp;
    }
  }
  return dp[n];
}

/**
 * Find the closest-matching existing channel name for a target, to help
 * staff spot typos (e.g. "emmit-brown" cubby vs a character named "Emmet
 * Brown"). Returns null if nothing is close enough to be a plausible match —
 * a genuinely unmapped character shouldn't "match" an unrelated channel.
 */
export function findClosestChannelName(target: string, candidates: Iterable<string>): string | null {
  let best: string | null = null;
  let bestDistance = Infinity;
  for (const candidate of candidates) {
    const distance = levenshteinDistance(target, candidate);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }
  if (best === null) return null;
  const threshold = Math.max(2, Math.ceil(target.length * 0.25));
  return bestDistance <= threshold ? best : null;
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
