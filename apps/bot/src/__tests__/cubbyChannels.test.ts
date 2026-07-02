import { describe, expect, it } from 'vitest';
import { findClosestChannelName, normalizeChannelName } from '../services/cubbyChannels';

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
