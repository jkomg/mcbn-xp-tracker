import { describe, expect, it } from 'vitest';
import { calculateXpCost, validateSpendRequest } from '../xpRules';

describe('xpRules', () => {
  it('calculates multi-dot progressive costs', () => {
    expect(calculateXpCost('Skill', 1, 3)).toBe(15);
  });

  it('supports flat cost categories', () => {
    expect(calculateXpCost('New Skill', 0, 1)).toBe(3);
  });

  it('validates player submitted costs', () => {
    const result = validateSpendRequest('Attribute', 2, 3, 15);
    expect(result.valid).toBe(true);
    expect(result.matches).toBe(true);
    expect(result.correctCost).toBe(15);
  });
});
