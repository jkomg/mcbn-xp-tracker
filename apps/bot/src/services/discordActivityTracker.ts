/**
 * Tracks Discord post counts per user per day across IC, OOC, Rolls, and cubby
 * categories. Buffers increments in memory and flushes to the web API every
 * FLUSH_INTERVAL_MS so we don't hammer the API on every message.
 *
 * Category resolution:
 *   - IC / OOC / Rolls: matched by hardcoded parent category ID sets
 *   - Cubby: parent category name contains "character cubbies" (same rule as
 *     cubbyChannelMonitor so they stay in sync)
 */

import type { Message } from 'discord.js';
import { ChannelType } from 'discord.js';
import { errorToMessage, logEvent } from '../logger';
import type { TrackerAdapter } from './adapter';
import { categoryFromId, type ActivityCategory } from './discordActivityCategories';

const FLUSH_INTERVAL_MS = 60_000;
const CUBBY_KEYWORD = 'character cubbies';

function isCubbyCategory(name: string): boolean {
  return name.toLowerCase().includes(CUBBY_KEYWORD);
}

/** Returns today's date in YYYY-MM-DD (UTC). */
function utcDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Buffer key: "discordId|date" */
function bufferKey(discordId: string, date: string): string {
  return `${discordId}|${date}`;
}

type CountsByCat = { ic: number; ooc: number; rolls: number; cubby: number };

function resolveCategory(message: Message): ActivityCategory | null {
  const channel = message.channel;
  if (!channel || !('parentId' in channel)) return null;

  if (
    channel.type === ChannelType.GuildText ||
    channel.type === ChannelType.GuildAnnouncement
  ) {
    const catId = channel.parentId;
    if (!catId) return null;
    const fromId = categoryFromId(catId);
    if (fromId) return fromId;
    // Check for cubby by category name
    const parent = channel.parent;
    if (parent && isCubbyCategory(parent.name)) return 'cubby';
    return null;
  }

  if (
    channel.type === ChannelType.PublicThread ||
    channel.type === ChannelType.PrivateThread
  ) {
    // parentId is the parent text channel; go up one more level for the category
    const parentChannel = channel.parent;
    if (!parentChannel) return null;
    const catId = parentChannel.parentId;
    if (!catId) return null;
    const fromId = categoryFromId(catId);
    if (fromId) return fromId;
    const grandparent = parentChannel.parent;
    if (grandparent && isCubbyCategory(grandparent.name)) return 'cubby';
    return null;
  }

  return null;
}

export class DiscordActivityTracker {
  private readonly adapter: TrackerAdapter;
  private readonly guildId: string;
  private readonly buffer = new Map<string, CountsByCat>();
  private flushTimer: NodeJS.Timeout | null = null;

  constructor(adapter: TrackerAdapter, guildId: string) {
    this.adapter = adapter;
    this.guildId = guildId;
  }

  start(): void {
    if (this.flushTimer) return;
    this.flushTimer = setInterval(() => {
      void this.flush();
    }, FLUSH_INTERVAL_MS);
    this.flushTimer.unref();
    logEvent('info', 'discord_activity_tracker_started', { guildId: this.guildId });
  }

  stop(): void {
    if (!this.flushTimer) return;
    clearInterval(this.flushTimer);
    this.flushTimer = null;
  }

  handleMessage(message: Message): void {
    if (message.author.bot) return;
    if (!message.guildId || message.guildId !== this.guildId) return;

    const category = resolveCategory(message);
    if (!category) return;

    const date = utcDateString();
    const key = bufferKey(message.author.id, date);
    const counts = this.buffer.get(key) ?? { ic: 0, ooc: 0, rolls: 0, cubby: 0 };
    counts[category] += 1;
    this.buffer.set(key, counts);
  }

  async flush(): Promise<void> {
    if (this.buffer.size === 0) return;

    const snapshot = new Map(this.buffer);
    this.buffer.clear();

    const entries: Array<{ discord_id: string; date: string; category: ActivityCategory; count: number }> = [];
    for (const [key, counts] of snapshot) {
      const [discordId, date] = key.split('|');
      for (const cat of ['ic', 'ooc', 'rolls', 'cubby'] as ActivityCategory[]) {
        if (counts[cat] > 0) {
          entries.push({ discord_id: discordId, date, category: cat, count: counts[cat] });
        }
      }
    }

    if (entries.length === 0) return;

    try {
      await this.adapter.recordDiscordActivity(entries);
      logEvent('info', 'discord_activity_flushed', { entries: entries.length });
    } catch (err) {
      logEvent('warn', 'discord_activity_flush_failed', { error: errorToMessage(err), entries: entries.length });
      // Re-buffer on failure so we don't lose the counts
      for (const entry of entries) {
        const key = bufferKey(entry.discord_id, entry.date);
        const counts = this.buffer.get(key) ?? { ic: 0, ooc: 0, rolls: 0, cubby: 0 };
        counts[entry.category] += entry.count;
        this.buffer.set(key, counts);
      }
    }
  }
}
