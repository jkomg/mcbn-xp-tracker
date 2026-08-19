import { ChannelType, type Guild, type GuildBasedChannel } from 'discord.js';

export const CUBBY_CATEGORY_NAMES = [
  'ancilla character cubbies',
  'neonate character cubbies',
  'fledgeling character cubbies',
  'mortal character cubbies',
] as const;

/**
 * Staff decorate category names with trailing emoji/symbols from time to
 * time (e.g. "Ancilla Character Cubbies 📁"), which breaks an exact-string
 * match against CUBBY_CATEGORY_NAMES — a mismatch here reads as "every
 * character's cubby is gone" to cubbySyncWorker, which auto-retires the
 * whole roster. Match by substring instead, so decoration doesn't matter.
 */
export function isCubbyCategoryName(name: string): boolean {
  const normalized = name.toLowerCase().trim();
  return CUBBY_CATEGORY_NAMES.some((n) => normalized.includes(n));
}

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
      if (isCubbyCategoryName(channel.name)) {
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
      if (isCubbyCategoryName(channel.name)) {
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
      if (isCubbyCategoryName(channel.name)) {
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

/**
 * Discord refuses a channel move once its target category holds 50 channels
 * ("CHANNEL_PARENT_MAX_CHANNELS"). Retirement automation hit this: every
 * retirement moves one more cubby into the retired category, so the category
 * fills over time and then every subsequent retirement fails and retries
 * forever on a condition no retry can clear.
 */
export const CATEGORY_CHANNEL_LIMIT = 50;

type ChannelLike = { id: string; name: string; type: ChannelType; parentId: string | null } | null;
type ChannelCollection = Iterable<ChannelLike> | { values: () => Iterable<ChannelLike> };

function channelValues(channels: ChannelCollection): Iterable<ChannelLike> {
    return typeof (channels as { values?: unknown }).values === 'function'
        ? (channels as { values: () => Iterable<ChannelLike> }).values()
        : (channels as Iterable<ChannelLike>);
}

export function countCategoryChildren(channels: ChannelCollection, categoryId: string): number {
    let count = 0;
    for (const channel of channelValues(channels)) {
        if (!channel || channel.type === ChannelType.GuildCategory) continue;
        if (channel.parentId === categoryId) count++;
    }
    return count;
}

/**
 * Every category a retired cubby may legitimately live in, most-preferred first.
 *
 * Overflow categories are discovered by name rather than configured, so staff
 * can add one in Discord — "Retired Characters 2" beside "Retired Characters" —
 * and have it picked up with no redeploy and no settings change. The prefix is
 * taken from the configured category's own name rather than a hardcoded guess,
 * so it keeps working whatever that category is called, including the trailing
 * emoji staff like to add.
 *
 * Both the retirement mover and cubbySyncWorker's classification read this, so
 * they cannot disagree about whether a cubby counts as retired.
 */
export function resolveRetiredCubbyCategoryIds(
    channels: ChannelCollection,
    configuredIds: string[],
): string[] {
    const categories = new Map<string, ChannelLike>();
    for (const channel of channelValues(channels)) {
        if (channel && channel.type === ChannelType.GuildCategory) {
            categories.set(channel.id, channel);
        }
    }

    const ordered: string[] = [];
    const seen = new Set<string>();
    const add = (id: string) => {
        if (id && !seen.has(id)) {
            seen.add(id);
            ordered.push(id);
        }
    };

    // Configured ids are kept whether or not they turn up in this channel list.
    // A partial or failed fetch should degrade to the previous behaviour —
    // attempt the configured category — rather than become a new hard failure
    // on a path whose whole purpose is unblocking stuck retirements.
    for (const id of configuredIds) add(id);

    const primary = ordered.map((id) => categories.get(id)).find((c) => !!c) ?? null;
    if (primary) {
        const prefix = primary.name.toLowerCase().trim();
        const siblings = [...categories.values()].filter(
            (c): c is NonNullable<ChannelLike> =>
                !!c && !seen.has(c.id) && c.name.toLowerCase().trim().startsWith(prefix),
        );
        siblings.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
        for (const sibling of siblings) add(sibling.id);
    }

    return ordered;
}

/** The first retired category with room, or null when they are all full. */
export function pickRetiredCubbyCategoryWithSpace(
    channels: ChannelCollection,
    categoryIds: string[],
): string | null {
    for (const id of categoryIds) {
        if (countCategoryChildren(channels, id) < CATEGORY_CHANNEL_LIMIT) return id;
    }
    return null;
}
