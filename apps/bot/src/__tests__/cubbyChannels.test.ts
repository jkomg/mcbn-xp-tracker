import { describe, expect, it } from 'vitest';
import { findClosestChannelName, isCubbyCategoryName, normalizeChannelName } from '../services/cubbyChannels';

describe('isCubbyCategoryName', () => {
  it('matches the plain category names', () => {
    expect(isCubbyCategoryName('Ancilla Character Cubbies')).toBe(true);
    expect(isCubbyCategoryName('neonate character cubbies')).toBe(true);
  });

  it('matches even when staff add decorative emoji/symbols', () => {
    // Regression: staff added a trailing folder emoji to all four cubby
    // categories, which broke an exact-string match and caused
    // cubbySyncWorker to see zero active cubby categories and mass-retire
    // the entire roster (57 of 65 characters in one pass).
    expect(isCubbyCategoryName('Ancilla Character Cubbies 📁')).toBe(true);
    expect(isCubbyCategoryName('Fledgeling Character Cubbies 📁')).toBe(true);
    expect(isCubbyCategoryName('  Mortal Character Cubbies 📁  ')).toBe(true);
  });

  it('does not match unrelated categories', () => {
    expect(isCubbyCategoryName('Retired Characters')).toBe(false);
    expect(isCubbyCategoryName('Coterie Cubbies')).toBe(false);
  });
});

describe('normalizeChannelName', () => {
  it('lowercases, hyphenates, and trims', () => {
    expect(normalizeChannelName('Emmet Brown')).toBe('emmet-brown');
    expect(normalizeChannelName('  Sylvester   Glass  ')).toBe('sylvester-glass');
  });
});

describe('findClosestChannelName', () => {
  it('suggests a single-character typo of an existing channel', () => {
    const candidates = ['emmit-brown', 'aliyah', 'sylvester-glass'];
    expect(findClosestChannelName('emmet-brown', candidates)).toBe('emmit-brown');
  });

  it('returns null when nothing is close enough to be a plausible match', () => {
    const candidates = ['aliyah', 'sylvester-glass', 'the-owl'];
    expect(findClosestChannelName('emmet-brown', candidates)).toBeNull();
  });

  it('returns null for an empty candidate list', () => {
    expect(findClosestChannelName('emmet-brown', [])).toBeNull();
  });

  it('returns the exact match when one exists', () => {
    const candidates = ['emmet-brown', 'aliyah'];
    expect(findClosestChannelName('emmet-brown', candidates)).toBe('emmet-brown');
  });
});
