export type DiscordMessageForWiki = {
  content: string;
  author: { username: string; global_name?: string };
  timestamp: string;
  attachments?: { url: string; content_type?: string; filename: string }[];
  embeds?: { type?: string; url?: string; image?: { url: string }; thumbnail?: { url: string } }[];
};

/**
 * Finds the first portrait image across a thread's messages, checking both
 * uploaded file attachments and pasted image links (which Discord turns
 * into embeds rather than attachments — a common way players post
 * portraits instead of uploading a file).
 */
export function firstImage(messages: DiscordMessageForWiki[]): string | null {
  for (const msg of messages) {
    for (const a of msg.attachments ?? []) {
      if (a.content_type?.startsWith('image/') || /\.(png|jpe?g|gif|webp)$/i.test(a.filename)) {
        return a.url;
      }
    }
    for (const e of msg.embeds ?? []) {
      if (e.image?.url) return e.image.url;
      if (e.type === 'image' && e.url) return e.url;
      if (e.thumbnail?.url) return e.thumbnail.url;
    }
  }
  return null;
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Prefix slug with category abbreviation to prevent cross-category collisions. */
export function wikiSlug(category: string, name: string): string {
  const prefixes: Record<string, string> = {
    locations: 'loc',
    characters: 'char',
    lore: 'lore',
    backgrounds: 'bg',
    spcs: 'spc',
    plotlines: 'plot',
  };
  const prefix = prefixes[category] ?? category;
  return `${prefix}-${slugify(name)}`;
}

/**
 * Strip Discord-specific markdown extensions so content renders cleanly
 * in standard Markdown (the wiki renderer).
 *
 * Handles:
 *  - Spoilers: ||text|| → text  (reveal hidden content)
 *  - Custom emoji: <:name:id> / <a:name:id> → removed
 *  - User/role/channel mentions: <@id> <@!id> <#id> <@&id> → removed
 *  - Timestamp tags: <t:123:F> → removed
 *  - Unbalanced ** bold markers: if count is odd, close at end of block
 *  - Single newlines → markdown line breaks (  \n) so Discord's line-per-field
 *    format renders as separate lines rather than one collapsed paragraph.
 *    Double newlines (paragraph breaks) are left unchanged.
 */
export function sanitizeDiscordMarkdown(text: string): string {
  let s = text
    .replace(/\|\|([^|]*)\|\|/g, '$1') // spoilers → plain text
    .replace(/<a?:\w+:\d+>/g, '') // custom emoji
    .replace(/<[@#!&]?!?\d+>/g, '') // mentions & channels
    .replace(/<t:\d+(?::[tTdDfFR])?>/g, ''); // timestamp tags

  // Convert lone newlines to markdown line breaks; leave blank lines alone.
  s = s.replace(/(?<!\n)\n(?!\n)/g, '  \n');

  if ((s.match(/\*\*/g) ?? []).length % 2 !== 0) s += '**';
  return s.trim();
}

export function messagesToMarkdown(messages: DiscordMessageForWiki[]): string {
  const parts: string[] = [];
  for (const m of messages) {
    const images = (m.attachments ?? []).filter(
      (a) => a.content_type?.startsWith('image/') || /\.(png|jpe?g|gif|webp)$/i.test(a.filename),
    );
    if (!m.content.trim() && !images.length) continue;
    const author = m.author.global_name ?? m.author.username;
    const date = m.timestamp.slice(0, 10);
    const textBody = m.content.trim() ? sanitizeDiscordMarkdown(m.content.trim()) : '';
    const imageBody = images.map((img) => `![](${img.url})`).join('\n\n');
    const body = [textBody, imageBody].filter(Boolean).join('\n\n');
    parts.push(`### ${author} · ${date}\n\n${body}`);
  }
  return parts.join('\n\n---\n\n');
}

// Coterie membership: display name → member character names (lowercase for matching)
export const COTERIE_MEMBERS: Record<string, string[]> = {
  'The Brood': ['ratcatcher', 'umaira', 'foxus', 'measly', 'viper'],
  'Obsidian Citadel': ['krayt', 'constance', 'patrick', 'nochtli'],
  'Pillars of Community': ['sonja', 'alice', 'gabriella', 'raize'],
  'Danse Macabre': ['ebba', 'alexander', 'kip'],
  'The Magnolia Court': ['cecilia', 'dahlia', 'david'],
  'Ars Ananke': ['argento', 'charmaine', 'marcus'],
  'Culebra': ['yamata', 'derrick', 'code red', 'percy'],
  'Phantom Troupe': ['jester', 'sikorsky', 'coral', 'jennifer jean'],
  'The Assets': ['big joey', 'lil joey', 'viktor'],
  'Earth, Wind and Fire': ['ashanti', 'aliyah', 'dolohov'],
  'Midnight Oil': ['rain', 'sierra', 'nightblazer'],
};

// Reverse map: character name (lowercase) → coterie display name
export const CHAR_TO_COTERIE = new Map<string, string>();
for (const [coterie, members] of Object.entries(COTERIE_MEMBERS)) {
  for (const m of members) CHAR_TO_COTERIE.set(m, coterie);
}

export interface FactionDef {
  name: string;
  sectAliases: string[]; // matches c.sect.toLowerCase()
  loreChannels: string[]; // channel names whose archive pages link under Lore
}

export const FACTIONS: FactionDef[] = [
  { name: 'Camarilla', sectAliases: ['camarilla'], loreChannels: ['camarilla-decrees'] },
  { name: 'Anarchs', sectAliases: ['anarch'], loreChannels: ['anarch-mandates'] },
  { name: 'Voivode', sectAliases: ['hecata'], loreChannels: ['hecata-notices'] },
  { name: 'Autark', sectAliases: ['autarkis'], loreChannels: [] },
];

const SPC_TYPE_KEYWORDS: { keyword: string; tag: string }[] = [
  { keyword: 'haven', tag: 'Haven' },
  { keyword: 'mawla', tag: 'Mawla' },
  { keyword: 'retainer', tag: 'Retainer' },
  { keyword: 'contact', tag: 'Contact' },
  { keyword: 'allies', tag: 'Allies' },
  { keyword: 'ally', tag: 'Allies' },
  { keyword: 'herd', tag: 'Herd' },
  { keyword: 'rolodex', tag: 'Rolodex' },
  { keyword: 'famulus', tag: 'Famulus' },
  { keyword: 'touchstone', tag: 'Touchstone' },
];

export function inferSpcType(text: string): string | null {
  const lower = text.toLowerCase();
  for (const { keyword, tag } of SPC_TYPE_KEYWORDS) {
    if (lower.includes(keyword)) return tag;
  }
  return null;
}

const DOMAIN_OPTIONS = [
  'Madison',
  'North Nashville',
  'West Nashville',
  'Bordeaux',
  'East Nashville',
  'Downtown',
  'Midtown',
  'South Nashville',
  'Donelson',
  'Sylvan Park',
  'Hillwood',
  'Green Hills',
  'Bellevue',
  'Hermitage',
  'Percy Priest Lake',
  'City Sewers',
  'Metro Area',
];

export function mapDomain(name: string): string | null {
  const lower = name.toLowerCase();
  for (const opt of DOMAIN_OPTIONS) {
    if (lower.includes(opt.toLowerCase())) return opt;
  }
  return null;
}
