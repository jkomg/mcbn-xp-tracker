import type {
  Collection,
  Guild,
  GuildBasedChannel,
  NonThreadGuildBasedChannel,
  PermissionOverwriteManager,
  PermissionOverwrites,
  Role,
} from 'discord.js';
import type { OverwriteSnapshotEntry } from './types';

/** True if the bot's own highest role can edit this role (not managed, not above the bot). */
export function canEditRole(guild: Guild, role: Role): boolean {
  const me = guild.members.me;
  if (!me) return false;
  if (role.managed) return false; // bot/integration roles can't be reassigned this way
  return me.roles.highest.comparePositionTo(role) > 0;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Runs fn sequentially over items with a delay between calls — matches the
 * 500ms-between-mutating-calls convention used by every overwrite-touching
 * script in this repo (scripts/fix-discord-overwrites.py, promote-*.py, the
 * apps/bot/scripts/*.mjs generation).
 */
export async function forEachRateLimited<T>(
  items: T[],
  fn: (item: T) => Promise<void>,
  delayMs = 500,
): Promise<void> {
  for (const item of items) {
    await fn(item);
    await sleep(delayMs);
  }
}

export async function fetchAllNonThreadChannels(
  guild: Guild,
): Promise<Collection<string, NonThreadGuildBasedChannel | null>> {
  return guild.channels.fetch();
}

export function overwriteToSnapshotEntry(ow: PermissionOverwrites): OverwriteSnapshotEntry {
  return {
    id: ow.id,
    type: ow.type as 0 | 1,
    allow: ow.allow.bitfield.toString(),
    deny: ow.deny.bitfield.toString(),
  };
}

/**
 * Narrow a fetched channel down to one that actually has overwrites
 * (categories included; threads never do — they inherit their parent's).
 * Generic over the input so it preserves subtype-specific properties (like
 * .parentId) when used with Array#filter, while still working for both bulk
 * fetches (NonThreadGuildBasedChannel) and single-ID fetches (the broader
 * GuildBasedChannel, which could in principle be a thread).
 */
export function hasOverwrites<T extends GuildBasedChannel | null>(
  channel: T,
): channel is Exclude<T, null> & { permissionOverwrites: PermissionOverwriteManager } {
  return channel != null && 'permissionOverwrites' in channel;
}
