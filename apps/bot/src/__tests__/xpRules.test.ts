import { describe, expect, it } from 'vitest';
import { calculateXpCost, validateSpendRequest } from '../xpRules';

describe('xpRules', () => {
  it('calculates multi-dot progressive costs', () => {
    expect(calculateXpCost('Skill', 1, 3)).toBe(15);
    expect(calculateXpCost('Attribute', 3, 4)).toBe(20);
  });

  it('supports flat cost categories', () => {
    expect(calculateXpCost('New Skill', 0, 1)).toBe(3);
    expect(calculateXpCost('Advantage (Merit/Background)', 3, 4)).toBe(3);
    expect(calculateXpCost('Loresheet', 0, 3)).toBe(9);
  });

  it('validates player submitted costs', () => {
    const result = validateSpendRequest('Attribute', 2, 3, 15);
    expect(result.valid).toBe(true);
    expect(result.matches).toBe(true);
    expect(result.correctCost).toBe(15);
  });
});
