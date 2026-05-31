/**
 * One-shot scanner that walks Discord channel history for a given date range
 * and records post counts to the web API. Intended to be run once via
 * `/lasombra scan-activity` to backfill historical data.
 *
 * Covers: IC/OOC/Rolls category channels + cubby category channels.
 * Active threads in those channels are also scanned.
 * Archived threads are not scanned (would require per-channel archive pagination).
 */

import { ChannelType, type Collection, type Guild, type Message, type Snowflake, type TextChannel, type AnyThreadChannel } from 'discord.js';
import { errorToMessage, logEvent } from '../logger';
import type { TrackerAdapter } from './adapter';
import { IC_CATEGORY_IDS, OOC_CATEGORY_IDS, ROLLS_CATEGORY_IDS, type ActivityCategory } from './discordActivityCategories';
import { CUBBY_CATEGORY_NAMES } from './cubbyChannels';

const MESSAGES_PER_FETCH = 100;
// Flush to API every this many accumulated entries
const FLUSH_THRESHOLD = 500;
// Pause between channels to avoid Discord request timeouts
const CHANNEL_DELAY_MS = 500;
// Pause between paginated batches within a single channel
const BATCH_DELAY_MS = 300;
// Retry delays (ms) for channels that abort — 3 attempts after the main pass
const RETRY_DELAYS_MS = [3_000, 8_000, 15_000];

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

type ActivityEntry = { discord_id: string; date: string; category: ActivityCategory; count: number };

function utcDateOf(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function categoryForChannel(channel: TextChannel): ActivityCategory | null {
  const catId = channel.parentId;
  if (!catId) return null;
  if (IC_CATEGORY_IDS.has(catId)) return 'ic';
  if (OOC_CATEGORY_IDS.has(catId)) return 'ooc';
  if (ROLLS_CATEGORY_IDS.has(catId)) return 'rolls';
  const parent = channel.parent;
  if (parent && (CUBBY_CATEGORY_NAMES as readonly string[]).some(n => parent.name.toLowerCase().includes(n))) {
    return 'cubby';
  }
  return null;
}

async function scanChannel(
  channel: TextChannel | AnyThreadChannel,
  category: ActivityCategory,
  sinceDate: string,
  untilDate: string,
  countMap: Map<string, Map<string, number>>,  // discord_id → date → count
  nameMap: Map<string, string>,
): Promise<number> {
  let scanned = 0;
  let before: string | undefined = undefined;

  while (true) {
    const batch: Collection<Snowflake, Message> = await channel.messages.fetch({ limit: MESSAGES_PER_FETCH, ...(before ? { before } : {}) });
    if (batch.size === 0) break;

    let hitFloor = false;
    for (const [, msg] of batch) {
      const msgDate = utcDateOf(msg.createdAt);
      if (msgDate < sinceDate) {
        hitFloor = true;
        continue;
      }
      if (msgDate > untilDate) continue;
      if (msg.author.bot) continue;

      // Accumulate
      const dateMap = countMap.get(msg.author.id) ?? new Map<string, number>();
      const key = `${category}|${msgDate}`;
      dateMap.set(key, (dateMap.get(key) ?? 0) + 1);
      countMap.set(msg.author.id, dateMap);

      // Track display name
      const displayName = (msg.member?.displayName ?? msg.author.username);
      if (displayName) nameMap.set(msg.author.id, displayName);

      scanned++;
    }

    if (hitFloor) break;

    const oldest: Message | undefined = batch.last();
    if (!oldest) break;
    before = oldest.id;

    if (BATCH_DELAY_MS > 0) await sleep(BATCH_DELAY_MS);
  }

  return scanned;
}

function countMapToEntries(countMap: Map<string, Map<string, number>>): ActivityEntry[] {
  const entries: ActivityEntry[] = [];
  for (const [discordId, dateMap] of countMap) {
    for (const [key, count] of dateMap) {
      const [category, date] = key.split('|') as [ActivityCategory, string];
      if (count > 0) entries.push({ discord_id: discordId, date, category, count });
    }
  }
  return entries;
}

export async function runActivityBackfill(
  guild: Guild,
  adapter: TrackerAdapter,
  sinceDate: string,
  untilDate: string,
  onProgress?: (msg: string) => void,
  categoryFilter?: ActivityCategory,
): Promise<{ channelsScanned: number; messagesScanned: number; usersFound: number }> {
  const log = (msg: string) => {
    logEvent('info', 'activity_backfill', { msg });
    onProgress?.(msg);
  };

  log(`Starting backfill scan: ${sinceDate} → ${untilDate}`);

  const channels = await guild.channels.fetch();

  // Build set of category IDs to scan
  const monitoredCatIds = new Set([...IC_CATEGORY_IDS, ...OOC_CATEGORY_IDS, ...ROLLS_CATEGORY_IDS]);
  const cubbyCatIds = new Set<string>();
  for (const ch of channels.values()) {
    if (ch?.type === ChannelType.GuildCategory) {
      if ((CUBBY_CATEGORY_NAMES as readonly string[]).some(n => ch.name.toLowerCase().includes(n))) {
        cubbyCatIds.add(ch.id);
      }
    }
  }

  // Collect text channels in monitored categories
  const toScan: Array<{ channel: TextChannel; category: ActivityCategory }> = [];
  for (const ch of channels.values()) {
    if (!ch || ch.type !== ChannelType.GuildText) continue;
    const catId = ch.parentId ?? '';
    let cat: ActivityCategory | null = null;
    if (IC_CATEGORY_IDS.has(catId)) cat = 'ic';
    else if (OOC_CATEGORY_IDS.has(catId)) cat = 'ooc';
    else if (ROLLS_CATEGORY_IDS.has(catId)) cat = 'rolls';
    else if (cubbyCatIds.has(catId)) cat = 'cubby';
    if (cat) toScan.push({ channel: ch as TextChannel, category: cat });
  }

  // Add active threads
  const activeThreads = await guild.channels.fetchActiveThreads().catch(() => null);
  if (activeThreads) {
    for (const thread of activeThreads.threads.values()) {
      if (!thread.parentId) continue;
      const parent = channels.get(thread.parentId);
      if (!parent) continue;
      const catId = parent.parentId ?? '';
      let cat: ActivityCategory | null = null;
      if (IC_CATEGORY_IDS.has(catId)) cat = 'ic';
      else if (OOC_CATEGORY_IDS.has(catId)) cat = 'ooc';
      else if (ROLLS_CATEGORY_IDS.has(catId)) cat = 'rolls';
      else if (cubbyCatIds.has(catId)) cat = 'cubby';
      if (cat) toScan.push({ channel: thread as unknown as TextChannel, category: cat });
    }
  }

  const filtered = categoryFilter ? toScan.filter(c => c.category === categoryFilter) : toScan;
  if (categoryFilter) log(`Category filter: ${categoryFilter} (${filtered.length}/${toScan.length} channels)`);
  const toProcess = categoryFilter ? filtered : toScan;

  log(`Found ${toProcess.length} channels/threads to scan`);

  const countMap = new Map<string, Map<string, number>>();
  const nameMap = new Map<string, string>();
  const allDiscordIds = new Set<string>();
  let totalMessages = 0;
  let channelsScanned = 0;

  type ScanItem = { channel: TextChannel; category: ActivityCategory };

  async function scanOne({ channel, category }: ScanItem): Promise<boolean> {
    // Use per-channel maps so an abort never leaves partial counts in the shared map.
    // On success we merge; on failure we discard — retries always start clean.
    const chanCountMap = new Map<string, Map<string, number>>();
    const chanNameMap = new Map<string, string>();
    try {
      const n = await scanChannel(channel as unknown as TextChannel | AnyThreadChannel, category, sinceDate, untilDate, chanCountMap, chanNameMap);

      // Merge into shared maps
      for (const [discordId, dateMap] of chanCountMap) {
        const existing = countMap.get(discordId) ?? new Map<string, number>();
        for (const [key, count] of dateMap) {
          existing.set(key, (existing.get(key) ?? 0) + count);
        }
        countMap.set(discordId, existing);
      }
      for (const [discordId, name] of chanNameMap) nameMap.set(discordId, name);

      totalMessages += n;
      channelsScanned++;
      if (n > 0) log(`  #${(channel as { name: string }).name}: ${n} messages`);

      // Flush periodically so we don't build up too much in memory
      const entries = countMapToEntries(countMap);
      if (entries.length >= FLUSH_THRESHOLD) {
        for (const e of entries) allDiscordIds.add(e.discord_id);
        await adapter.recordDiscordActivity(entries, Object.fromEntries(nameMap));
        countMap.clear();
        nameMap.clear();
        log(`  Flushed ${entries.length} entries`);
      }
      return true;
    } catch (err) {
      // chanCountMap is discarded — shared countMap is untouched
      logEvent('warn', 'activity_backfill_channel_failed', {
        channelId: channel.id,
        channelName: (channel as { name?: string }).name ?? '',
        error: errorToMessage(err),
      });
      return false;
    }
  }

  // Main pass
  let failed: ScanItem[] = [];
  for (const item of toProcess) {
    const ok = await scanOne(item);
    if (!ok) failed.push(item);
    if (CHANNEL_DELAY_MS > 0) await sleep(CHANNEL_DELAY_MS);
  }

  // Retry passes with backoff
  for (let attempt = 0; attempt < RETRY_DELAYS_MS.length && failed.length > 0; attempt++) {
    const delay = RETRY_DELAYS_MS[attempt];
    log(`Retrying ${failed.length} failed channel(s) (attempt ${attempt + 1}/${RETRY_DELAYS_MS.length}, waiting ${delay / 1000}s)…`);
    await sleep(delay);
    const stillFailed: ScanItem[] = [];
    for (const item of failed) {
      const ok = await scanOne(item);
      if (!ok) stillFailed.push(item);
      if (CHANNEL_DELAY_MS > 0) await sleep(CHANNEL_DELAY_MS);
    }
    failed = stillFailed;
  }

  if (failed.length > 0) {
    const names = failed.map(f => (f.channel as { name?: string }).name ?? f.channel.id).join(', ');
    log(`Warning: ${failed.length} channel(s) could not be scanned after all retries: ${names}`);
  }

  // Final flush
  const finalEntries = countMapToEntries(countMap);
  if (finalEntries.length > 0) {
    for (const e of finalEntries) allDiscordIds.add(e.discord_id);
    await adapter.recordDiscordActivity(finalEntries, Object.fromEntries(nameMap));
  }

  const skipped = failed.length;
  log(`Done: ${channelsScanned} channels, ${totalMessages} messages, ${allDiscordIds.size} users${skipped > 0 ? `, ${skipped} channel(s) skipped` : ''}`);
  return { channelsScanned, messagesScanned: totalMessages, usersFound: allDiscordIds.size };
}
