import { describe, expect, it } from 'vitest';
import {
  CHAR_TO_COTERIE,
  firstImage,
  inferSpcType,
  mapDomain,
  messagesToMarkdown,
  sanitizeDiscordMarkdown,
  wikiSlug,
} from '../scripts/notionSync/wikiSyncHelpers';

describe('wikiSyncHelpers', () => {
  it('builds category-prefixed slugs', () => {
    expect(wikiSlug('characters', 'Alice No. 1')).toBe('char-alice-no-1');
    expect(wikiSlug('locations', 'North Nashville')).toBe('loc-north-nashville');
    expect(wikiSlug('factions', 'Camarilla')).toBe('factions-camarilla');
  });

  it('sanitizes discord-only markdown extensions', () => {
    const raw = '||secret|| <:smile:123> ping <@123> at <t:1720000000:F> **oops';
    expect(sanitizeDiscordMarkdown(raw)).toBe('secret  ping  at  **oops**');
  });

  it('renders messages to markdown with sanitized content', () => {
    const out = messagesToMarkdown([
      {
        content: 'Hello <#12345>',
        author: { username: 'st', global_name: 'Storyteller' },
        timestamp: '2026-04-18T10:00:00.000Z',
      },
      {
        content: '   ',
        author: { username: 'ignored' },
        timestamp: '2026-04-18T11:00:00.000Z',
      },
    ]);
    expect(out).toContain('### Storyteller · 2026-04-18');
    expect(out).toContain('\n\nHello');
    expect(out).not.toContain('<#12345>');
    expect(out).not.toContain('ignored');
  });

  it('infers spc type from text keywords', () => {
    expect(inferSpcType('Trusted Mawla and ally')).toBe('Mawla');
    expect(inferSpcType('Unknown category')).toBeNull();
  });

  it('maps canonical domain names from freeform location strings', () => {
    expect(mapDomain('North Nashville - Riverview')).toBe('North Nashville');
    expect(mapDomain('Somewhere Else')).toBeNull();
  });

  it('includes reverse coterie membership lookups', () => {
    expect(CHAR_TO_COTERIE.get('alice')).toBe('Pillars of Community');
    expect(CHAR_TO_COTERIE.get('not-a-member')).toBeUndefined();
  });

  it('finds a portrait from an uploaded file attachment', () => {
    const image = firstImage([
      {
        content: 'here she is',
        author: { username: 'player1' },
        timestamp: '2026-04-18T10:00:00.000Z',
        attachments: [{ url: 'https://cdn.discord.com/portrait.png', filename: 'portrait.png' }],
      },
    ]);
    expect(image).toBe('https://cdn.discord.com/portrait.png');
  });

  it('finds a portrait from a pasted image link (Discord embed, no attachment)', () => {
    const image = firstImage([
      {
        content: 'https://imgur.com/big-joey.jpg',
        author: { username: 'player2' },
        timestamp: '2026-04-18T10:00:00.000Z',
        embeds: [{ type: 'image', url: 'https://imgur.com/big-joey.jpg' }],
      },
    ]);
    expect(image).toBe('https://imgur.com/big-joey.jpg');
  });

  it('returns null when no message has an image', () => {
    const image = firstImage([
      {
        content: 'no portrait here',
        author: { username: 'player3' },
        timestamp: '2026-04-18T10:00:00.000Z',
      },
    ]);
    expect(image).toBeNull();
  });
});
