import type { XpSpendCategory } from './types';

type CostRule = {
  description: string;
  minDots: number;
  maxDots: number;
  multiplier?: number;
  flatCost?: number;
  levelMultiplier?: number;
};

export const XP_COSTS: Record<XpSpendCategory, CostRule> = {
  Attribute: {
    multiplier: 5,
    description: 'New rating × 5 per dot',
    minDots: 1,
    maxDots: 5,
  },
  Skill: {
    multiplier: 3,
    description: 'New rating × 3 per dot',
    minDots: 1,
    maxDots: 5,
  },
  'New Skill': {
    flatCost: 3,
    description: '3 XP (0 -> 1)',
    minDots: 0,
    maxDots: 1,
  },
  'Discipline (In-Clan)': {
    multiplier: 5,
    description: 'New rating × 5 per dot',
    minDots: 0,
    maxDots: 5,
  },
  'Discipline (Out-of-Clan)': {
    multiplier: 7,
    description: 'New rating × 7 per dot',
    minDots: 0,
    maxDots: 5,
  },
  'Caitiff Discipline': {
    multiplier: 6,
    description: 'New rating × 6 per dot',
    minDots: 0,
    maxDots: 5,
  },
  'Blood Sorcery Ritual': {
    levelMultiplier: 3,
    description: 'Ritual level × 3',
    minDots: 0,
    maxDots: 5,
  },
  'Thin-Blood Alchemy Formula': {
    levelMultiplier: 3,
    description: 'Formula level × 3',
    minDots: 0,
    maxDots: 5,
  },
  'Advantage (Merit/Background)': {
    multiplier: 3,
    description: 'New rating × 3 per dot',
    minDots: 0,
    maxDots: 5,
  },
};

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

export function calculateXpCost(category: XpSpendCategory, currentDots: number, newDots: number): number {
  const rules = XP_COSTS[category];

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
    return newDots * rules.levelMultiplier;
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
      description: XP_COSTS[category].description,
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
