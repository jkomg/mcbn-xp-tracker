import { ChannelType } from 'discord.js';
import { describe, expect, it } from 'vitest';

import {
  CATEGORY_CHANNEL_LIMIT,
  countCategoryChildren,
  pickRetiredCubbyCategoryWithSpace,
  resolveRetiredCubbyCategoryIds,
} from '../services/cubbyChannels';

type Chan = { id: string; name: string; type: ChannelType; parentId: string | null };

const category = (id: string, name: string): Chan => ({
  id,
  name,
  type: ChannelType.GuildCategory,
  parentId: null,
});

const text = (id: string, parentId: string): Chan => ({
  id,
  name: `cubby-${id}`,
  type: ChannelType.GuildText,
  parentId,
});

const fill = (parentId: string, count: number): Chan[] =>
  Array.from({ length: count }, (_, i) => text(`${parentId}-${i}`, parentId));

describe('retired cubby categories', () => {
  it('counts only child channels, not the category itself', () => {
    const channels = [category('primary', 'Retired Characters'), ...fill('primary', 3)];
    expect(countCategoryChildren(channels, 'primary')).toBe(3);
  });

  it('discovers overflow categories by name from the configured one', () => {
    const channels = [
      category('primary', 'Retired Characters'),
      category('overflow2', 'Retired Characters 2'),
      category('overflow3', 'Retired Characters 3'),
      category('unrelated', 'Staff Only'),
    ];
    expect(resolveRetiredCubbyCategoryIds(channels, ['primary'])).toEqual([
      'primary',
      'overflow2',
      'overflow3',
    ]);
  });

  it('orders overflow numerically, not lexically', () => {
    const channels = [
      category('primary', 'Retired Characters'),
      category('c10', 'Retired Characters 10'),
      category('c2', 'Retired Characters 2'),
    ];
    expect(resolveRetiredCubbyCategoryIds(channels, ['primary'])).toEqual(['primary', 'c2', 'c10']);
  });

  it('tolerates the trailing emoji staff add to category names', () => {
    const channels = [
      category('primary', 'Retired Characters'),
      category('overflow', 'Retired Characters 2 ⚰️'),
    ];
    expect(resolveRetiredCubbyCategoryIds(channels, ['primary'])).toEqual(['primary', 'overflow']);
  });

  it('keeps configured ids even when this channel list does not show them', () => {
    // A partial fetch must degrade to "try the configured category", which is
    // what happened before overflow existed — not to a hard failure on the very
    // path meant to unblock stuck retirements.
    const channels = [category('primary', 'Retired Characters')];
    expect(resolveRetiredCubbyCategoryIds(channels, ['configured-but-unseen', 'primary'])).toEqual([
      'configured-but-unseen',
      'primary',
    ]);
  });

  it('still discovers overflow when the first configured id is not visible', () => {
    const channels = [
      category('primary', 'Retired Characters'),
      category('overflow', 'Retired Characters 2'),
    ];
    expect(resolveRetiredCubbyCategoryIds(channels, ['unseen', 'primary'])).toEqual([
      'unseen',
      'primary',
      'overflow',
    ]);
  });

  it('keeps an explicit list in its configured order and de-duplicates', () => {
    const channels = [
      category('a', 'Retired A'),
      category('b', 'Retired B'),
    ];
    expect(resolveRetiredCubbyCategoryIds(channels, ['b', 'a', 'b'])).toEqual(['b', 'a']);
  });

  it('picks the primary category while it has room', () => {
    const channels = [
      category('primary', 'Retired Characters'),
      category('overflow', 'Retired Characters 2'),
      ...fill('primary', CATEGORY_CHANNEL_LIMIT - 1),
    ];
    expect(pickRetiredCubbyCategoryWithSpace(channels, ['primary', 'overflow'])).toBe('primary');
  });

  it('overflows once the primary hits Discord\'s 50-channel cap', () => {
    // The exact failure seen in production: CHANNEL_PARENT_MAX_CHANNELS.
    const channels = [
      category('primary', 'Retired Characters'),
      category('overflow', 'Retired Characters 2'),
      ...fill('primary', CATEGORY_CHANNEL_LIMIT),
    ];
    expect(pickRetiredCubbyCategoryWithSpace(channels, ['primary', 'overflow'])).toBe('overflow');
  });

  it('reports no room when every category is full, rather than picking one', () => {
    const channels = [
      category('primary', 'Retired Characters'),
      category('overflow', 'Retired Characters 2'),
      ...fill('primary', CATEGORY_CHANNEL_LIMIT),
      ...fill('overflow', CATEGORY_CHANNEL_LIMIT),
    ];
    expect(pickRetiredCubbyCategoryWithSpace(channels, ['primary', 'overflow'])).toBeNull();
  });

  it('accepts a discord.js-style collection as well as an array', () => {
    const channels = [category('primary', 'Retired Characters'), ...fill('primary', 2)];
    const collection = { values: () => channels[Symbol.iterator]() };
    expect(countCategoryChildren(collection, 'primary')).toBe(2);
    expect(resolveRetiredCubbyCategoryIds(collection, ['primary'])).toEqual(['primary']);
  });
});
