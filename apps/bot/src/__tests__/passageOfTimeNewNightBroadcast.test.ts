import { ChannelType } from 'discord.js';
import { describe, expect, it } from 'vitest';
import { filterNewNightTargets } from '../services/passageOfTimeService';

const CATEGORY_A = 'category-a';
const CATEGORY_B = 'category-b';
const OTHER_CATEGORY = 'category-other';

function textChannel(id: string, parentId: string | null) {
  return { id, type: ChannelType.GuildText, parentId };
}

describe('filterNewNightTargets', () => {
  it('includes text channels in a configured category', () => {
    const channels = [textChannel('c1', CATEGORY_A)];
    expect(filterNewNightTargets(channels, [CATEGORY_A])).toEqual(channels);
  });

  it('excludes channels in a category not in the configured list', () => {
    const channels = [textChannel('c1', OTHER_CATEGORY)];
    expect(filterNewNightTargets(channels, [CATEGORY_A])).toEqual([]);
  });

  it('excludes channels with no parent category', () => {
    const channels = [textChannel('c1', null)];
    expect(filterNewNightTargets(channels, [CATEGORY_A])).toEqual([]);
  });

  it('excludes non-sendable channel types (e.g. voice, category)', () => {
    const voice = { id: 'v1', type: ChannelType.GuildVoice, parentId: CATEGORY_A };
    const category = { id: 'cat1', type: ChannelType.GuildCategory, parentId: null };
    expect(filterNewNightTargets([voice, category], [CATEGORY_A])).toEqual([]);
  });

  it('includes announcement channels and threads alongside plain text channels', () => {
    const announcement = { id: 'a1', type: ChannelType.GuildAnnouncement, parentId: CATEGORY_A };
    const thread = { id: 't1', type: ChannelType.PublicThread, parentId: CATEGORY_A };
    const result = filterNewNightTargets([announcement, thread], [CATEGORY_A]);
    expect(result).toHaveLength(2);
  });

  it('matches across multiple configured categories', () => {
    const channels = [textChannel('c1', CATEGORY_A), textChannel('c2', CATEGORY_B), textChannel('c3', OTHER_CATEGORY)];
    const result = filterNewNightTargets(channels, [CATEGORY_A, CATEGORY_B]);
    expect(result.map((c) => c.id)).toEqual(['c1', 'c2']);
  });

  it('returns nothing when no categories are configured', () => {
    const channels = [textChannel('c1', CATEGORY_A)];
    expect(filterNewNightTargets(channels, [])).toEqual([]);
  });
});
