import type { XpSpendCategory } from './types';
import { XP_COSTS } from './sharedContract';

type CostRule = {
  description: string;
  minDots: number;
  maxDots: number;
  multiplier?: number;
  flatCost?: number;
  flatPerDot?: number;
  levelMultiplier?: number;
};

const XP_COSTS_BY_CATEGORY: Record<string, CostRule> = Object.fromEntries(
  Object.entries(XP_COSTS).map(([category, rules]) => [
    category,
    {
      description: rules.description,
      minDots: rules.min_dots,
      maxDots: rules.max_dots,
      multiplier: rules.multiplier,
      flatCost: rules.flat_cost,
      flatPerDot: rules.flat_per_dot,
      levelMultiplier: rules.level_multiplier,
    },
  ]),
);

function costPerDot(multiplier: number, current: number, next: number): number {
  if (next <= current) {
    throw new Error(`New dots (${next}) must be greater than current (${current})`);
  }
  if (current < 0 || next > 10) {
    throw new Error('Dot values must be between 0 and 10');
  }

  let total = 0;
  for (let dot = current + 1; dot <= next; dot += 1) {
    total += dot * multiplier;
  }
  return total;
}

function costFlatPerDot(perDot: number, current: number, next: number): number {
  if (next <= current) {
    throw new Error(`New dots (${next}) must be greater than current (${current})`);
  }
  if (current < 0 || next > 10) {
    throw new Error('Dot values must be between 0 and 10');
  }
  return (next - current) * perDot;
}

export function calculateXpCost(category: XpSpendCategory, currentDots: number, newDots: number): number {
  const rules = XP_COSTS_BY_CATEGORY[category];
  if (!rules) {
    throw new Error(`Unknown spend category: ${category}`);
  }

  if (currentDots < rules.minDots) {
    throw new Error(`${category}: current dots (${currentDots}) below minimum (${rules.minDots})`);
  }
  if (newDots > rules.maxDots) {
    throw new Error(`${category}: new dots (${newDots}) above maximum (${rules.maxDots})`);
  }

  if (rules.flatCost !== undefined) {
    if (currentDots !== 0 || newDots !== 1) {
      throw new Error(`${category}: must be 0 -> 1 (got ${currentDots} -> ${newDots})`);
    }
    return rules.flatCost;
  }

  if (rules.levelMultiplier !== undefined) {
    if (newDots < 1) {
      throw new Error(`${category}: new dots must be at least 1`);
    }
    return newDots * rules.levelMultiplier;
  }

  if (rules.flatPerDot !== undefined) {
    return costFlatPerDot(rules.flatPerDot, currentDots, newDots);
  }

  return costPerDot(rules.multiplier as number, currentDots, newDots);
}

export function validateSpendRequest(
  category: XpSpendCategory,
  currentDots: number,
  newDots: number,
  playerCost: number,
): {
  valid: boolean;
  correctCost: number;
  matches: boolean;
  message: string;
  description: string;
} {
  try {
    const correctCost = calculateXpCost(category, currentDots, newDots);
    const matches = correctCost === playerCost;
    return {
      valid: true,
      correctCost,
      matches,
      message: matches
        ? `Cost verified: ${correctCost} XP`
        : `Cost mismatch: player submitted ${playerCost} XP, correct cost is ${correctCost} XP`,
      description: XP_COSTS_BY_CATEGORY[category].description,
    };
  } catch (error) {
    return {
      valid: false,
      correctCost: 0,
      matches: false,
      message: error instanceof Error ? error.message : 'Invalid spend request',
      description: '',
    };
  }
}
