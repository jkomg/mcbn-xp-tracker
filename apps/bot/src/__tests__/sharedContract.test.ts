import { describe, expect, it } from 'vitest';
import { SPEND_CATEGORIES, XP_COSTS } from '../sharedContract';

describe('shared contract', () => {
  it('keeps spend categories and rule keys aligned', () => {
    expect(new Set(SPEND_CATEGORIES)).toEqual(new Set(Object.keys(XP_COSTS)));
  });
});
