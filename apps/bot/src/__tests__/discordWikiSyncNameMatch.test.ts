import { describe, expect, it, vi } from 'vitest';
import { lookupPcProfile, type PcProfile } from '../scripts/discord-wiki-sync';

vi.mock('../config', () => ({
  config: {
    botToken: 'bot-token',
    discordGuildId: 'guild-1',
    webAppBaseUrl: 'https://web.example',
    webAppApiToken: 'legacy-token',
    webAppApiReadToken: 'read-token',
    webAppApiWriteToken: 'write-token',
  },
}));

function profileMap(entries: Record<string, PcProfile>): Map<string, PcProfile> {
  return new Map(Object.entries(entries));
}

describe('lookupPcProfile', () => {
  it('matches exactly on a normalized key', () => {
    const map = profileMap({ 'alice smith': { image: 'https://cdn/alice.png', markdown: '' } });
    expect(lookupPcProfile(map, 'Alice Smith')?.image).toBe('https://cdn/alice.png');
  });

  it('matches when the thread title wraps a nickname in double quotes', () => {
    // real case: DB name "Big Joey Puttanesca" vs thread title `"Big" Joey Puttanesca`
    const map = profileMap({ '"big" joey puttanesca': { image: 'https://cdn/joey.png', markdown: '' } });
    expect(lookupPcProfile(map, 'Big Joey Puttanesca')?.image).toBe('https://cdn/joey.png');
  });

  it('matches when the thread title wraps a nickname in single quotes alongside the full first name', () => {
    // real case: DB name "Maggie Carter" vs thread title `Margaret 'Maggie' Carter`
    const map = profileMap({ "margaret 'maggie' carter": { image: 'https://cdn/maggie.png', markdown: '' } });
    expect(lookupPcProfile(map, 'Maggie Carter')?.image).toBe('https://cdn/maggie.png');
  });

  it('returns null when no thread name overlaps at all', () => {
    const map = profileMap({ frankie: { image: 'https://cdn/frankie.png', markdown: '' } });
    expect(lookupPcProfile(map, 'Francis Lombardi')).toBeNull();
  });
});
