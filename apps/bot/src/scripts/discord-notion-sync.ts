/**
 * discord-notion-sync.ts
 *
 * One-time script: reads Discord channels → populates the Nashville by Night Notion page.
 *
 * Usage (from apps/bot/):
 *   npx tsx src/scripts/discord-notion-sync.ts
 *   npx tsx src/scripts/discord-notion-sync.ts --dry-run
 *
 * Required env vars (in apps/bot/.env):
 *   BOT_TOKEN          Discord bot token
 *   DISCORD_GUILD_ID   Target server ID (falls back to TEST_GUILD_ID)
 *   NOTION_TOKEN       Notion integration token (create at notion.so/profile/integrations)
 *
 * Optional env vars:
 *   WEB_APP_BASE_URL          Web app URL for active-roster API (default: http://127.0.0.1:5001)
 *   WEB_APP_API_READ_TOKEN    Read token for web API (falls back to WEB_APP_API_TOKEN)
 *   WEB_APP_API_TOKEN         Legacy all-in-one token
 *   NOTION_SYNC_MSG_LIMIT     Max messages per text channel / posts per forum (default: 200)
 *
 * What gets populated:
 *   PC Tracker       — one entry per active character (name + player Discord handle)
 *   SPC Tracker      — one entry per post/message in #spc-profiles
 *                      (forum: thread name = SPC name; text: first line = SPC name)
 *   Location DB      — one entry per City of Nashville channel
 *   Hunting Sites    — one entry per pinned message in City of Nashville channels
 *   Session & Post Log
 *     text channels  — one archive entry per channel, all messages as page body
 *     forum channels — one entry per thread/post (title = thread name)
 *
 * Note: #backgrounds and #children-of-the-night are forum channels — each forum
 * post becomes its own Session & Post Log entry.
 *
 * The Notion integration must be invited to the Nashville by Night workspace page:
 *   https://www.notion.so/3013a3e5cab1802fb607d565362b9502
 */

import path from 'node:path';
import * as dotenv from 'dotenv';
import { REST, Routes } from 'discord.js';
import { Client as NotionClient } from '@notionhq/client';

// ---------------------------------------------------------------------------
// Public API — call this from the bot process or from the CLI
// ---------------------------------------------------------------------------

export interface NotionSyncOptions {
  botToken: string;
  guildId: string;
  /** Notion integration token. If omitted, all Notion writes are skipped. */
  notionToken?: string;
  webBase?: string;
  webReadToken?: string;
  /** Write token for Chronicle Wiki upsert API (WEB_APP_API_WRITE_TOKEN). */
  webWriteToken?: string;
  msgLimit?: number;
  dryRun?: boolean;
  /** If true, archive all Notion pages that were NOT created by this sync before importing. */
  cleanup?: boolean;
}

export async function runNotionSync(opts: NotionSyncOptions): Promise<{ success: boolean; error?: string }> {
  if (!opts.botToken) return { success: false, error: 'botToken is required' };
  if (!opts.guildId) return { success: false, error: 'guildId is required' };
  try {
    await main(opts);
    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// Notion database IDs from Nashville by Night page (3013a3e5cab1802fb607d565362b9502)
const NOTION_DB = {
  PC_TRACKER:    '251eff53bb584672b99b7a4bea041835',
  SPC_TRACKER:   '0eeff60c0c624f6d8a2d9f0729f938ce',
  LOCATION_DB:   'af645074f95d484f991613986753aac1',
  HUNTING_SITES: 'dafacdfdc5354d8bb468dc8f8ccf4c17',
  SESSION_LOG:   'a85037ea366349469b230573fa19c5d5',
};

// Lore channels whose content goes into Session & Post Log.
// Text channels → one archive entry.  Forum channels → one entry per post/thread.
const LORE_CHANNEL_NAMES = [
  'music-city-histories',
  'state-of-address',
  'news-feed',
  'camarilla-decrees',
  'anarch-mandates',
  'hecata-notices',
  'backgrounds',          // forum
  'children-of-the-night', // forum
  'spc-profiles',
];

const CITY_CATEGORY_NAME = 'city of nashville';

// Discord channel type constants
const CH_TEXT  = 0;
const CH_CATEGORY = 4;
const CH_FORUM = 15;

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

if (require.main === module) {
  dotenv.config({ path: path.resolve(__dirname, '../../.env') });
  const cliOpts: NotionSyncOptions = {
    botToken: process.env.BOT_TOKEN ?? '',
    guildId: process.env.DISCORD_GUILD_ID ?? process.env.TEST_GUILD_ID ?? '',
    notionToken: process.env.NOTION_TOKEN ?? '',
    webBase: process.env.WEB_APP_BASE_URL,
    webReadToken: process.env.WEB_APP_API_READ_TOKEN ?? process.env.WEB_APP_API_TOKEN,
    webWriteToken: process.env.WEB_APP_API_WRITE_TOKEN,
    msgLimit: Number.parseInt(process.env.NOTION_SYNC_MSG_LIMIT ?? '200', 10),
    dryRun: process.argv.includes('--dry-run'),
    cleanup: process.argv.includes('--cleanup'),
  };
  if (!cliOpts.botToken) { console.error('BOT_TOKEN is required'); process.exit(1); }
  if (!cliOpts.guildId) { console.error('DISCORD_GUILD_ID (or TEST_GUILD_ID) is required'); process.exit(1); }
  if (!cliOpts.notionToken) { console.log('NOTION_TOKEN not set — Notion sync disabled.'); }
  runNotionSync(cliOpts).then((result) => {
    if (!result.success) { console.error('Sync failed:', result.error); process.exit(1); }
  }).catch((err) => { console.error('Fatal:', err); process.exit(1); });
}

// ---------------------------------------------------------------------------
// Discord types
// ---------------------------------------------------------------------------

interface DiscordChannel {
  id: string;
  name: string;
  type: number;
  parent_id?: string;
  topic?: string;
}

interface DiscordThread {
  id: string;
  name: string;
  parent_id: string;
  type: number;
  thread_metadata?: { archive_timestamp?: string };
}

interface DiscordAttachment {
  url: string;
  content_type?: string;
  filename: string;
}

interface DiscordMessage {
  id: string;
  content: string;
  author: { id: string; username: string; global_name?: string };
  timestamp: string;
  attachments?: DiscordAttachment[];
}

interface DiscordGuildMember {
  user?: { id: string; username: string; global_name?: string };
  nick?: string;
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function notionCall<T>(fn: () => Promise<T>): Promise<T> {
  await sleep(350);
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === 'notionhq_client_request_timeout' || code === 'notionhq_client_response_error') {
        if (attempt < 2) {
          console.log(`  [retry] Notion timeout/error, waiting ${(attempt + 1) * 2}s…`);
          await sleep((attempt + 1) * 2000);
          continue;
        }
      }
      throw err;
    }
  }
  throw new Error('unreachable');
}

function toTitleCase(str: string): string {
  return str.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function chunks<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) result.push(arr.slice(i, i + size));
  return result;
}

function textToBlocks(text: string): object[] {
  const blocks: object[] = [];
  let current = '';
  for (const line of text.split('\n')) {
    const candidate = current ? `${current}\n${line}` : line;
    if (candidate.length > 1800) {
      if (current) {
        blocks.push(paragraphBlock(current));
        current = line.slice(0, 1800);
      } else {
        blocks.push(paragraphBlock(line.slice(0, 1800)));
        current = '';
      }
    } else {
      current = candidate;
    }
  }
  if (current) blocks.push(paragraphBlock(current));
  return blocks;
}

function paragraphBlock(content: string): object {
  return {
    object: 'block',
    type: 'paragraph',
    paragraph: { rich_text: [{ type: 'text', text: { content } }] },
  };
}

function heading3Block(content: string): object {
  return {
    object: 'block',
    type: 'heading_3',
    heading_3: { rich_text: [{ type: 'text', text: { content } }] },
  };
}

// ---------------------------------------------------------------------------
// Chronicle Wiki helpers
// ---------------------------------------------------------------------------

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

interface PcProfile { image: string | null; markdown: string; }

/**
 * Build a map of normalised character name → { image, markdown } by scanning
 * forum threads in the PC background channel (children-of-the-night).
 * Each thread is one PC's profile post.
 */
async function buildPcProfileMap(
  rest: REST,
  guildId: string,
  channelByName: Map<string, DiscordChannel>,
): Promise<Map<string, PcProfile>> {
  const map = new Map<string, PcProfile>();
  const ch = channelByName.get('children-of-the-night');
  if (!ch || ch.type !== CH_FORUM) return map;
  let threads: DiscordThread[] = [];
  try { threads = await fetchForumThreads(rest, guildId, ch.id); }
  catch { return map; }
  for (const thread of threads) {
    const msgs = await fetchAllMessages(rest, thread.id, 50);
    await sleep(150);
    map.set(thread.name.toLowerCase().trim(), {
      image: firstImage(msgs),
      markdown: messagesToMarkdown(msgs),
    });
  }
  return map;
}

/** Best-effort profile lookup: exact match, then substring. */
function lookupPcProfile(map: Map<string, PcProfile>, charName: string): PcProfile | null {
  const key = charName.toLowerCase().trim();
  if (map.has(key)) return map.get(key)!;
  for (const [threadName, profile] of map) {
    if (threadName.includes(key) || key.includes(threadName)) return profile;
  }
  return null;
}

/** Prefix slug with category abbreviation to prevent cross-category collisions. */
function wikiSlug(category: string, name: string): string {
  const prefixes: Record<string, string> = {
    locations: 'loc',
    characters: 'char',
    lore: 'lore',
  };
  const prefix = prefixes[category] ?? category;
  return `${prefix}-${slugify(name)}`;
}

function messagesToMarkdown(messages: DiscordMessage[]): string {
  return messages
    .filter((m) => m.content.trim())
    .map((m) => {
      const author = m.author.global_name ?? m.author.username;
      const date = m.timestamp.slice(0, 10);
      return `### ${author} · ${date}\n\n${m.content.trim()}`;
    })
    .join('\n\n---\n\n');
}

interface WikiPageData {
  slug: string;
  title: string;
  body_markdown?: string;
  category?: string;
  cover_image_url?: string;
  published?: boolean;
}

async function wikiUpsert(webBase: string, writeToken: string, data: WikiPageData, dryRun: boolean): Promise<void> {
  if (dryRun || !writeToken) return;
  try {
    const res = await fetch(`${webBase}/api/wiki/page`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${writeToken}` },
      body: JSON.stringify(data),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) console.log(`  [wiki warn] upsert "${data.slug}" → HTTP ${res.status}`);
  } catch (err) {
    console.log(`  [wiki warn] upsert "${data.slug}" failed: ${err}`);
  }
}

// ---------------------------------------------------------------------------
// Discord REST helpers
// ---------------------------------------------------------------------------

async function fetchAllMessages(rest: REST, channelId: string, limit: number): Promise<DiscordMessage[]> {
  const all: DiscordMessage[] = [];
  let before: string | undefined;
  while (all.length < limit) {
    const batch = Math.min(100, limit - all.length);
    const params = new URLSearchParams({ limit: String(batch) });
    if (before) params.set('before', before);
    const msgs = await rest.get(`${Routes.channelMessages(channelId)}?${params}`) as DiscordMessage[];
    if (!msgs.length) break;
    all.push(...msgs);
    before = msgs[msgs.length - 1].id;
    if (msgs.length < 100) break;
    await sleep(250);
  }
  return all.reverse(); // oldest first
}

async function fetchPins(rest: REST, channelId: string): Promise<DiscordMessage[]> {
  return rest.get(Routes.channelPins(channelId)) as Promise<DiscordMessage[]>;
}

async function fetchGuildMember(rest: REST, guildId: string, userId: string): Promise<DiscordGuildMember | null> {
  try {
    return await rest.get(Routes.guildMember(guildId, userId)) as DiscordGuildMember;
  } catch {
    return null;
  }
}

/**
 * Fetch all threads for a forum channel (active + archived).
 * Active threads come from the guild-wide endpoint; archived are paginated per-channel.
 */
async function fetchForumThreads(rest: REST, guildId: string, forumChannelId: string): Promise<DiscordThread[]> {
  const threads: DiscordThread[] = [];

  // Active threads (guild-wide, filter to this forum)
  const active = await rest.get(Routes.guildActiveThreads(guildId)) as { threads: DiscordThread[] };
  for (const t of active.threads) {
    if (t.parent_id === forumChannelId) threads.push(t);
  }
  await sleep(200);

  // Archived threads (paginated, forum-specific)
  let before: string | undefined;
  for (;;) {
    const params = new URLSearchParams({ limit: '100' });
    if (before) params.set('before', before);
    const archived = await rest.get(
      `/channels/${forumChannelId}/threads/archived/public?${params}`,
    ) as { threads: DiscordThread[]; has_more: boolean };
    threads.push(...archived.threads);
    if (!archived.has_more || !archived.threads.length) break;
    before = archived.threads[archived.threads.length - 1].id;
    await sleep(250);
  }

  return threads;
}

// ---------------------------------------------------------------------------
// Web API: active character roster
// ---------------------------------------------------------------------------

interface ActiveRosterEntry {
  name: string;
  discordId: string | null;
  clan: string | null;
  sect: string | null;
}

async function fetchActiveRoster(webBase: string, webReadToken: string): Promise<ActiveRosterEntry[]> {
  if (!webReadToken) {
    console.log('  [warn] No WEB_APP_API_READ_TOKEN — PC Tracker will have no player names');
    return [];
  }
  try {
    const res = await fetch(`${webBase}/api/meta/active-roster?includeDiscordIds=1`, {
      headers: { Authorization: `Bearer ${webReadToken}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) { console.log(`  [warn] Active roster API returned ${res.status}`); return []; }
    const body = await res.json() as { characters: (ActiveRosterEntry | string)[] };
    return (body.characters ?? []).map((c): ActiveRosterEntry =>
      typeof c === 'string' ? { name: c, discordId: null, clan: null, sect: null } : c,
    );
  } catch (err) {
    console.log(`  [warn] Could not reach web API: ${err}`);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Notion helpers
// ---------------------------------------------------------------------------

async function appendBodyBlocks(notion: NotionClient, pageId: string, blocks: object[]) {
  for (const chunk of chunks(blocks, 100)) {
    await notionCall(() =>
      notion.blocks.children.append({
        block_id: pageId,
        children: chunk as Parameters<typeof notion.blocks.children.append>[0]['children'],
      }),
    );
  }
}

function firstImage(messages: DiscordMessage[]): string | null {
  for (const msg of messages) {
    for (const a of msg.attachments ?? []) {
      if (a.content_type?.startsWith('image/') || /\.(png|jpe?g|gif|webp)$/i.test(a.filename)) {
        return a.url;
      }
    }
  }
  return null;
}

function coverProp(url: string): { type: 'external'; external: { url: string } } {
  return { type: 'external', external: { url } };
}

function imageBlock(url: string): object {
  return {
    object: 'block',
    type: 'image',
    image: { type: 'external', external: { url } },
  };
}

/** Build body blocks for a list of messages with author/date headers. */
function messagesToBlocks(messages: DiscordMessage[]): object[] {
  const blocks: object[] = [];
  for (const msg of messages) {
    const images = (msg.attachments ?? []).filter(
      (a) => a.content_type?.startsWith('image/') || /\.(png|jpe?g|gif|webp)$/i.test(a.filename),
    );
    if (!msg.content.trim() && !images.length) continue;
    const author = msg.author.global_name ?? msg.author.username;
    blocks.push(heading3Block(`${author} · ${msg.timestamp.slice(0, 10)}`));
    if (msg.content.trim()) blocks.push(...textToBlocks(msg.content));
    for (const img of images) blocks.push(imageBlock(img.url));
    blocks.push({ object: 'block', type: 'divider', divider: {} });
  }
  return blocks;
}

// ---------------------------------------------------------------------------
// Pre-import cleanup
// ---------------------------------------------------------------------------

const SOURCE_TAG = 'discord-sync';

// Coterie membership: display name → member character names (lowercase for matching)
const COTERIE_MEMBERS: Record<string, string[]> = {
  'The Brood':              ['ratcatcher', 'umaira', 'foxus', 'measly', 'viper'],
  'Obsidian Citadel':       ['krayt', 'constance', 'patrick', 'nochtli'],
  'Pillars of Community':   ['sonja', 'alice', 'gabriella', 'raize'],
  'Danse Macabre':          ['ebba', 'alexander', 'kip'],
  'The Magnolia Court':     ['cecilia', 'dahlia', 'david'],
  'Ars Ananke':             ['argento', 'charmaine', 'marcus'],
  'Culebra':                ['yamata', 'derrick', 'code red', 'percy'],
  'Phantom Troupe':         ['jester', 'sikorsky', 'coral', 'jennifer jean'],
  'The Assets':             ['big joey', 'lil joey', 'viktor'],
  'Earth, Wind and Fire':   ['ashanti', 'aliyah', 'dolohov'],
  'Midnight Oil':           ['rain', 'sierra', 'nightblazer'],
};

// Build reverse map: character name (lowercase) → coterie display name
const CHAR_TO_COTERIE = new Map<string, string>();
for (const [coterie, members] of Object.entries(COTERIE_MEMBERS)) {
  for (const m of members) CHAR_TO_COTERIE.set(m, coterie);
}

// Factions: sect aliases for roster matching + associated lore channels
interface FactionDef {
  name: string;
  /** Lowercase sect values from the active roster that map to this faction. */
  sectAliases: string[];
  /** Lore channel names whose archives are associated with this faction. */
  loreChannels: string[];
}
const FACTIONS: FactionDef[] = [
  {
    name: 'Camarilla',
    sectAliases: ['camarilla'],
    loreChannels: ['camarilla-decrees'],
  },
  {
    name: 'Anarchs',
    sectAliases: ['anarch', 'anarchs'],
    loreChannels: ['anarch-mandates'],
  },
  {
    name: 'Voivode',
    sectAliases: ['voivode', 'hecata', 'sabbat'],
    loreChannels: ['hecata-notices'],
  },
  {
    name: 'Autark',
    sectAliases: ['autark', 'independent', 'unaligned'],
    loreChannels: [],
  },
];

// SPC type keywords: if thread/message name contains keyword → Type tag
const SPC_TYPE_KEYWORDS: { keyword: string; tag: string }[] = [
  { keyword: 'haven',      tag: 'Haven' },
  { keyword: 'mawla',      tag: 'Mawla' },
  { keyword: 'retainer',   tag: 'Retainer' },
  { keyword: 'contact',    tag: 'Contact' },
  { keyword: 'allies',     tag: 'Allies' },
  { keyword: 'ally',       tag: 'Allies' },
  { keyword: 'herd',       tag: 'Herd' },
  { keyword: 'rolodex',    tag: 'Rolodex' },
  { keyword: 'famulus',    tag: 'Famulus' },
  { keyword: 'touchstone', tag: 'Touchstone' },
];

function inferSpcType(text: string): string | null {
  const lower = text.toLowerCase();
  for (const { keyword, tag } of SPC_TYPE_KEYWORDS) {
    if (lower.includes(keyword)) return tag;
  }
  return null;
}

function getPageTitle(page: { properties: Record<string, unknown> }): string {
  for (const val of Object.values(page.properties)) {
    const v = val as { id?: string; type?: string; title?: { plain_text: string }[] };
    if (v.type === 'title' && Array.isArray(v.title)) {
      return v.title.map((t) => t.plain_text).join('') || '(untitled)';
    }
  }
  return '(untitled)';
}

async function cleanupPreImportEntries(notion: NotionClient, dryRun: boolean): Promise<void> {
  console.log('\n[cleanup] Archiving pre-import entries from all databases…');
  for (const [dbName, dbId] of Object.entries(NOTION_DB)) {
    let cursor: string | undefined;
    let removed = 0;
    let kept = 0;
    for (;;) {
      const result = await notionCall(() =>
        notion.databases.query({
          database_id: dbId,
          page_size: 100,
          ...(cursor ? { start_cursor: cursor } : {}),
        }),
      );
      for (const page of result.results) {
        if (page.object !== 'page' || !('properties' in page)) continue;
        const props = page.properties as Record<string, unknown>;
        const source = (props['Source'] as { select?: { name: string } } | undefined)?.select?.name;
        if (source === SOURCE_TAG) {
          kept++;
        } else {
          const title = getPageTitle({ properties: props });
          console.log(`  [${dbName}] archive: "${title}"`);
          if (!dryRun) {
            await notionCall(() => notion.pages.update({ page_id: page.id, archived: true }));
          }
          removed++;
        }
      }
      if (!result.has_more) break;
      cursor = result.next_cursor ?? undefined;
    }
    console.log(`  [${dbName}] kept: ${kept}, archived: ${removed}${dryRun ? ' (dry-run)' : ''}`);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(opts: NotionSyncOptions) {
  const GUILD_ID = opts.guildId;
  const MSG_LIMIT = opts.msgLimit ?? 200;
  const DRY_RUN = opts.dryRun ?? false;
  const CLEANUP = opts.cleanup ?? false;
  const WEB_BASE = (opts.webBase ?? 'http://127.0.0.1:5001').replace(/\/+$/, '');
  const WEB_READ_TOKEN = opts.webReadToken ?? '';
  const WEB_WRITE_TOKEN = opts.webWriteToken ?? '';
  if (WEB_WRITE_TOKEN) {
    console.log('  Wiki sync enabled — pages will be upserted to Chronicle Wiki.');
  } else {
    console.log('  Wiki sync disabled — set WEB_APP_API_WRITE_TOKEN to enable.');
  }

  const flags = [DRY_RUN && 'DRY RUN', CLEANUP && 'CLEANUP'].filter(Boolean).join(' + ');
  console.log(`discord-notion-sync${flags ? ` [${flags}]` : ''}`);
  console.log(`Guild: ${GUILD_ID} | Limit: ${MSG_LIMIT} messages/posts per source`);

  const NOTION_ENABLED = !!opts.notionToken;
  const rest = new REST({ version: '10' }).setToken(opts.botToken);
  const notion = NOTION_ENABLED ? new NotionClient({ auth: opts.notionToken!, timeoutMs: 120_000 }) : null;
  if (!NOTION_ENABLED) console.log('  Notion sync disabled — set NOTION_TOKEN to enable.');

  // ------------------------------------------------------------------
  // 0. Ensure Source property exists on all databases
  // ------------------------------------------------------------------
  if (!DRY_RUN && NOTION_ENABLED) {
    console.log('\n[0/7] Ensuring Source property exists on all databases…');
    for (const [dbName, dbId] of Object.entries(NOTION_DB)) {
      await notionCall(() =>
        notion!.databases.update({
          database_id: dbId,
          properties: {
            'Source': { select: {} },
          },
        }),
      );
      console.log(`  ✓ ${dbName}`);
    }
  }

  if (CLEANUP && NOTION_ENABLED) {
    await cleanupPreImportEntries(notion!, DRY_RUN);
  }

  // ------------------------------------------------------------------
  // 1. Fetch guild channel list
  // ------------------------------------------------------------------
  console.log('\n[1/7] Fetching guild channels…');
  const allChannels = await rest.get(Routes.guildChannels(GUILD_ID)) as DiscordChannel[];
  const channelByName = new Map(allChannels.map((ch) => [ch.name.toLowerCase(), ch]));

  const cityCategory = allChannels.find(
    (ch) => ch.type === CH_CATEGORY && ch.name.toLowerCase().includes(CITY_CATEGORY_NAME),
  );
  const cityChannels = cityCategory
    ? allChannels.filter((ch) => ch.parent_id === cityCategory.id && ch.type === CH_TEXT)
    : [];

  console.log(`  Total channels: ${allChannels.length}`);
  console.log(`  City of Nashville: ${cityCategory?.name ?? 'NOT FOUND'}`);
  console.log(`  Location channels: ${cityChannels.map((c) => c.name).join(', ') || 'none'}`);

  // Log detected types for lore channels
  for (const name of LORE_CHANNEL_NAMES) {
    const ch = channelByName.get(name);
    const kind = ch ? (ch.type === CH_FORUM ? 'forum' : 'text') : 'NOT FOUND';
    console.log(`  #${name}: ${kind}`);
  }

  // ------------------------------------------------------------------
  // 2. Active PC roster
  // ------------------------------------------------------------------
  console.log('\n[2/7] Fetching active roster from web API…');
  const activeRoster = await fetchActiveRoster(WEB_BASE, WEB_READ_TOKEN);
  console.log(`  Active characters: ${activeRoster.length}`);

  // ------------------------------------------------------------------
  // 3. Location Database
  // ------------------------------------------------------------------
  console.log('\n[3/7] Populating Location Database…');
  if (!cityChannels.length) {
    console.log('  No city channels found — skipping.');
  } else {
    for (const ch of cityChannels) {
      const locationName = toTitleCase(ch.name);
      console.log(`  → ${locationName}`);
      if (!DRY_RUN) {
        if (NOTION_ENABLED) {
          await notionCall(() =>
            notion!.pages.create({
              parent: { database_id: NOTION_DB.LOCATION_DB },
              properties: {
                'Location': { title: [{ text: { content: locationName } }] },
                'Source': { select: { name: SOURCE_TAG } },
                ...(ch.topic ? { 'Atmosphere Notes': { rich_text: [{ text: { content: truncate(ch.topic, 2000) } }] } } : {}),
              },
            }),
          );
        }
        // Wiki upsert deferred to step 4 so hunting site pins can be included.
      }
    }
    console.log(`  Created ${cityChannels.length} location entries.`);
  }

  // ------------------------------------------------------------------
  // 4. Hunting Sites (pins from City of Nashville channels)
  // ------------------------------------------------------------------
  console.log('\n[4/7] Populating Hunting Sites from City of Nashville pins…');
  let huntingTotal = 0;
  for (const ch of cityChannels) {
    const locationName = toTitleCase(ch.name);
    let pins: DiscordMessage[] = [];
    try { pins = await fetchPins(rest, ch.id); await sleep(200); }
    catch (err) { console.log(`  [warn] Pins fetch failed for #${ch.name}: ${err}`); continue; }

    if (!pins.length) { console.log(`  #${ch.name}: no pins`); }
    else { console.log(`  #${ch.name}: ${pins.length} pin(s)`); }

    const pinSections: string[] = [];
    for (const pin of pins) {
      if (!pin.content.trim()) continue;
      const firstLine = pin.content.trim().split('\n')[0]
        .replace(/^\*+|\*+$/g, '').replace(/^#+\s*/, '').trim();
      const siteName = truncate(firstLine || `Pin by ${pin.author.username}`, 200);
      const domain = mapDomain(locationName);
      console.log(`    → ${siteName}`);
      if (!DRY_RUN && NOTION_ENABLED) {
        await notionCall(() =>
          notion!.pages.create({
            parent: { database_id: NOTION_DB.HUNTING_SITES },
            properties: {
              'Site Name': { title: [{ text: { content: siteName } }] },
              'Description': { rich_text: [{ text: { content: truncate(pin.content, 2000) } }] },
              'Source': { select: { name: SOURCE_TAG } },
              ...(domain ? { 'Domain': { select: { name: domain } } } : {}),
            },
          }),
        );
      }
      pinSections.push(`### ${siteName}\n\n${pin.content.trim()}`);
      huntingTotal++;
    }

    // Wiki upsert: topic as intro, pins as Hunting Sites section
    const bodyParts = [
      ch.topic ?? '',
      pinSections.length ? `## Hunting Sites\n\n${pinSections.join('\n\n---\n\n')}` : '',
    ].filter(Boolean);
    await wikiUpsert(WEB_BASE, WEB_WRITE_TOKEN, {
      slug: wikiSlug('locations', locationName),
      title: locationName,
      category: 'locations',
      body_markdown: bodyParts.join('\n\n---\n\n'),
      published: true,
    }, DRY_RUN);
  }
  console.log(`  Created ${huntingTotal} hunting site entries.`);

  // ------------------------------------------------------------------
  // 5. SPC Tracker (#spc-profiles — text or forum)
  // ------------------------------------------------------------------
  console.log('\n[5/7] Populating SPC Tracker from #spc-profiles…');
  const spcChannel = channelByName.get('spc-profiles');
  if (!spcChannel) {
    console.log('  #spc-profiles not found — skipping.');
  } else if (spcChannel.type === CH_FORUM) {
    // Forum: each thread = one SPC (thread name = SPC name)
    console.log('  Detected as forum channel — reading threads.');
    const threads = await fetchForumThreads(rest, GUILD_ID, spcChannel.id);
    console.log(`  Threads found: ${threads.length}`);
    let count = 0;
    for (const thread of threads.slice(0, MSG_LIMIT)) {
      const name = truncate(thread.name, 200);
      console.log(`  → ${name}`);
      if (!DRY_RUN) {
        const messages = await fetchAllMessages(rest, thread.id, 50);
        await sleep(200);
        const bodyContent = messages.map((m) => m.content).filter(Boolean).join('\n\n');
        const spcType = inferSpcType(thread.name);
        const cover = firstImage(messages);
        if (NOTION_ENABLED) {
          const page = await notionCall(() =>
            notion!.pages.create({
              parent: { database_id: NOTION_DB.SPC_TRACKER },
              ...(cover ? { cover: coverProp(cover) } : {}),
              properties: {
                'Name': { title: [{ text: { content: name } }] },
                'Status': { select: { name: 'Active' } },
                'Source': { select: { name: SOURCE_TAG } },
                ...(spcType ? { 'Type': { select: { name: spcType } } } : {}),
                'Relationship Notes': { rich_text: [{ text: { content: truncate(bodyContent, 2000) } }] },
              },
            }),
          );
          await appendBodyBlocks(notion!, page.id, messagesToBlocks(messages));
        }
        await wikiUpsert(WEB_BASE, WEB_WRITE_TOKEN, {
          slug: wikiSlug('characters', name),
          title: name,
          category: 'characters',
          body_markdown: messagesToMarkdown(messages),
          cover_image_url: cover ?? undefined,
          published: true,
        }, DRY_RUN);
      }
      count++;
    }
    console.log(`  Created ${count} SPC entries.`);
  } else {
    // Text channel: each message = one SPC (first line = name)
    const messages = await fetchAllMessages(rest, spcChannel.id, MSG_LIMIT);
    console.log(`  Messages: ${messages.length}`);
    let count = 0;
    for (const msg of messages) {
      if (!msg.content.trim()) continue;
      const firstLine = msg.content.trim().split('\n')[0]
        .replace(/^\*+|\*+$/g, '').replace(/^#+\s*/, '').trim();
      const name = truncate(firstLine || `SPC by ${msg.author.username}`, 200);
      const spcType = inferSpcType(msg.content.split('\n')[0]);
      console.log(`  → ${name}`);
      if (!DRY_RUN) {
        if (NOTION_ENABLED) {
          const page = await notionCall(() =>
            notion!.pages.create({
              parent: { database_id: NOTION_DB.SPC_TRACKER },
              properties: {
                'Name': { title: [{ text: { content: name } }] },
                'Status': { select: { name: 'Active' } },
                'Source': { select: { name: SOURCE_TAG } },
                ...(spcType ? { 'Type': { select: { name: spcType } } } : {}),
                'Relationship Notes': { rich_text: [{ text: { content: truncate(msg.content, 2000) } }] },
              },
            }),
          );
          await appendBodyBlocks(notion!, page.id, textToBlocks(msg.content));
        }
        await wikiUpsert(WEB_BASE, WEB_WRITE_TOKEN, {
          slug: wikiSlug('characters', name),
          title: name,
          category: 'characters',
          body_markdown: msg.content.trim(),
          published: true,
        }, DRY_RUN);
      }
      count++;
    }
    console.log(`  Created ${count} SPC entries.`);
  }

  // ------------------------------------------------------------------
  // 5.5 Build PC profile map from #children-of-the-night forum
  // ------------------------------------------------------------------
  console.log('\n[5.5/7] Building PC profile map from #children-of-the-night…');
  const pcProfileMap = await buildPcProfileMap(rest, GUILD_ID, channelByName);
  console.log(`  Found profiles for ${pcProfileMap.size} character(s).`);

  // ------------------------------------------------------------------
  // 6. PC Tracker (active roster + player names)
  // ------------------------------------------------------------------
  console.log('\n[6/7] Populating PC Tracker…');
  if (!activeRoster.length) {
    console.log('  No active characters found — skipping.');
  } else {
    const playerNameCache = new Map<string, string>();
    for (const { name, discordId, clan, sect } of activeRoster) {
      let playerName = '';
      if (discordId) {
        if (!playerNameCache.has(discordId)) {
          const member = await fetchGuildMember(rest, GUILD_ID, discordId);
          await sleep(100);
          playerName = member?.nick ?? member?.user?.global_name ?? member?.user?.username ?? '';
          playerNameCache.set(discordId, playerName);
        } else {
          playerName = playerNameCache.get(discordId) ?? '';
        }
      }
      const coterie = CHAR_TO_COTERIE.get(name.toLowerCase()) ?? null;
      console.log(`  → ${name}${playerName ? ` (${playerName})` : ''}${coterie ? ` [${coterie}]` : ''}`);
      if (!DRY_RUN) {
        if (NOTION_ENABLED) {
          await notionCall(() =>
            notion!.pages.create({
              parent: { database_id: NOTION_DB.PC_TRACKER },
              properties: {
                'Character Name': { title: [{ text: { content: name } }] },
                'Source': { select: { name: SOURCE_TAG } },
                ...(playerName ? { 'Player': { rich_text: [{ text: { content: playerName } }] } } : {}),
                ...(clan ? { 'Clan': { select: { name: clan } } } : {}),
                ...(sect ? { 'Sect': { select: { name: sect } } } : {}),
                ...(coterie ? { 'Coterie': { rich_text: [{ text: { content: coterie } }] } } : {}),
              },
            }),
          );
        }
        const pcProfile = lookupPcProfile(pcProfileMap, name);
        const metaParts = [
          clan && `**Clan:** ${clan}`,
          sect && `**Sect:** ${sect}`,
          coterie && `**Coterie:** ${coterie}`,
          playerName && `**Player:** ${playerName}`,
        ].filter(Boolean) as string[];
        const bodyMarkdown = [
          metaParts.join('\n\n'),
          pcProfile?.markdown,
        ].filter(Boolean).join('\n\n---\n\n');
        await wikiUpsert(WEB_BASE, WEB_WRITE_TOKEN, {
          slug: wikiSlug('characters', name),
          title: name,
          category: 'characters',
          body_markdown: bodyMarkdown,
          cover_image_url: pcProfile?.image ?? undefined,
          published: true,
        }, DRY_RUN);
      }
    }
    console.log(`  Created ${activeRoster.length} PC entries.`);
  }

  // ------------------------------------------------------------------
  // 6.5 Coteries wiki pages (built from static COTERIE_MEMBERS map)
  // ------------------------------------------------------------------
  console.log('\n[6.5/7] Populating Coteries wiki pages…');
  for (const [coterieName, members] of Object.entries(COTERIE_MEMBERS)) {
    const memberList = members.map((m) => `- ${toTitleCase(m)}`).join('\n');
    const body = `## Members\n\n${memberList}`;
    console.log(`  → ${coterieName} (${members.length} members)`);
    await wikiUpsert(WEB_BASE, WEB_WRITE_TOKEN, {
      slug: wikiSlug('coteries', coterieName),
      title: coterieName,
      category: 'coteries',
      body_markdown: body,
      published: true,
    }, DRY_RUN);
  }
  console.log(`  Created ${Object.keys(COTERIE_MEMBERS).length} coterie pages.`);

  // ------------------------------------------------------------------
  // 6.6 Factions wiki pages (Camarilla, Anarchs, Voivode, Autark)
  // ------------------------------------------------------------------
  console.log('\n[6.6/7] Populating Factions wiki pages…');
  for (const faction of FACTIONS) {
    // Members: active roster entries whose sect matches this faction's aliases
    const factionMembers = activeRoster.filter(
      (c) => c.sect && faction.sectAliases.includes(c.sect.toLowerCase()),
    );

    const memberLines = factionMembers.map((c) => {
      const coterie = CHAR_TO_COTERIE.get(c.name.toLowerCase());
      return `- **${c.name}**${c.clan ? ` — ${c.clan}` : ''}${coterie ? ` *(${coterie})*` : ''}`;
    });

    const loreLinks = faction.loreChannels.map(
      (ch) => `- [#${ch} archive](/wiki/${wikiSlug('lore', `${ch} archive`)})`,
    );

    const bodyParts = [
      memberLines.length
        ? `## Members\n\n${memberLines.join('\n')}`
        : '## Members\n\n*No active members.*',
      loreLinks.length
        ? `## Faction Lore\n\n${loreLinks.join('\n')}`
        : '',
    ].filter(Boolean);

    console.log(`  → ${faction.name} (${factionMembers.length} members)`);
    await wikiUpsert(WEB_BASE, WEB_WRITE_TOKEN, {
      slug: wikiSlug('factions', faction.name),
      title: faction.name,
      category: 'factions',
      body_markdown: bodyParts.join('\n\n'),
      published: true,
    }, DRY_RUN);
  }
  console.log(`  Created ${FACTIONS.length} faction pages.`);

  // ------------------------------------------------------------------
  // 7. Session & Post Log (lore channels)
  //    Text channels → one archive entry, all messages as body
  //    Forum channels → one entry per thread/post
  // ------------------------------------------------------------------
  console.log('\n[7/7] Populating Session & Post Log…');

  for (const chanName of LORE_CHANNEL_NAMES) {
    const ch = channelByName.get(chanName);
    if (!ch) { console.log(`  [warn] #${chanName} not found — skipping.`); continue; }

    if (ch.type === CH_FORUM) {
      // ---- Forum: one Notion entry per thread ----
      let threads: DiscordThread[] = [];
      try {
        threads = await fetchForumThreads(rest, GUILD_ID, ch.id);
      } catch (err) {
        console.log(`  [warn] Could not fetch threads from #${chanName}: ${err}`);
        continue;
      }
      console.log(`  #${chanName} (forum): ${threads.length} post(s)`);

      for (const thread of threads.slice(0, MSG_LIMIT)) {
        const title = truncate(thread.name, 200);
        const postDate = thread.thread_metadata?.archive_timestamp?.slice(0, 10) ?? new Date().toISOString().slice(0, 10);
        console.log(`    → ${title}`);

        if (!DRY_RUN) {
          const messages = await fetchAllMessages(rest, thread.id, 100);
          await sleep(200);
          const preview = truncate(messages[0]?.content ?? '', 500);
          const cover = firstImage(messages);
          if (NOTION_ENABLED) {
            const sessionProps = {
              'Session/Post Title': { title: [{ text: { content: title } }] },
              'Status': { select: { name: 'Complete' } },
              'Source': { select: { name: SOURCE_TAG } },
              'Summary': { rich_text: [{ text: { content: preview } }] },
              'Date': { date: { start: postDate } },
            };
            const page = await notionCall(() =>
              notion!.pages.create({
                parent: { database_id: NOTION_DB.SESSION_LOG },
                ...(cover ? { cover: coverProp(cover) } : {}),
                properties: sessionProps,
              }),
            );
            await appendBodyBlocks(notion!, page.id, messagesToBlocks(messages));
          }
          // children-of-the-night threads are PC profiles — merged into character
          // pages in step 6, not duplicated as lore wiki pages.
          if (chanName !== 'children-of-the-night') {
            await wikiUpsert(WEB_BASE, WEB_WRITE_TOKEN, {
              slug: wikiSlug('lore', title),
              title,
              category: 'lore',
              body_markdown: messagesToMarkdown(messages),
              cover_image_url: cover ?? undefined,
              published: true,
            }, DRY_RUN);
          }
        }
      }
    } else {
      // ---- Text channel: one archive entry ----
      let messages: DiscordMessage[] = [];
      try {
        messages = await fetchAllMessages(rest, ch.id, MSG_LIMIT);
      } catch (err) {
        console.log(`  [warn] Could not read #${chanName}: ${err}`);
        continue;
      }
      if (!messages.length) { console.log(`  #${chanName}: no messages`); continue; }

      const mostRecentDate = messages[messages.length - 1].timestamp.slice(0, 10);
      const preview = truncate(messages[messages.length - 1].content, 500);
      const title = `#${chanName} archive`;
      console.log(`  → ${title} (${messages.length} messages, most recent: ${mostRecentDate})`);

      if (!DRY_RUN) {
        if (NOTION_ENABLED) {
          const sessionProps = {
            'Session/Post Title': { title: [{ text: { content: title } }] },
            'Status': { select: { name: 'Complete' } },
            'Source': { select: { name: SOURCE_TAG } },
            'Summary': { rich_text: [{ text: { content: preview } }] },
            'Date': { date: { start: mostRecentDate } },
          };
          const page = await notionCall(() =>
            notion!.pages.create({ parent: { database_id: NOTION_DB.SESSION_LOG }, properties: sessionProps }),
          );
          await appendBodyBlocks(notion!, page.id, messagesToBlocks(messages));
        }
        await wikiUpsert(WEB_BASE, WEB_WRITE_TOKEN, {
          slug: wikiSlug('lore', `${chanName} archive`),
          title,
          category: 'lore',
          body_markdown: messagesToMarkdown(messages),
          published: true,
        }, DRY_RUN);
      }
    }
  }

  console.log(`\nDone!${DRY_RUN ? ' (dry-run: nothing written to Notion)' : ''}`);
}

// ---------------------------------------------------------------------------
// Domain name normalisation
// ---------------------------------------------------------------------------

const DOMAIN_OPTIONS = [
  'Madison', 'North Nashville', 'West Nashville', 'Bordeaux', 'East Nashville',
  'Downtown', 'Midtown', 'South Nashville', 'Donelson', 'Sylvan Park',
  'Hillwood', 'Green Hills', 'Bellevue', 'Hermitage', 'Percy Priest Lake',
  'City Sewers', 'Metro Area',
];

function mapDomain(name: string): string | null {
  const lower = name.toLowerCase();
  for (const opt of DOMAIN_OPTIONS) {
    if (lower.includes(opt.toLowerCase())) return opt;
  }
  return null;
}

