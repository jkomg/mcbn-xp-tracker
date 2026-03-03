import fs from 'node:fs';
import path from 'node:path';

function repoRoot(): string {
  // Works from both src/* (dev/test) and dist/* (built runtime).
  return path.resolve(__dirname, '..', '..', '..');
}

function loadJson<T>(relativePath: string): T {
  const fullPath = path.join(repoRoot(), relativePath);
  const raw = fs.readFileSync(fullPath, 'utf8');
  return JSON.parse(raw) as T;
}

type CostRule = {
  description: string;
  min_dots: number;
  max_dots: number;
  multiplier?: number;
  flat_cost?: number;
  flat_per_dot?: number;
  level_multiplier?: number;
};

export const SPEND_CATEGORIES = loadJson<string[]>('packages/api-contract/spend_categories.json');
export const XP_COSTS = loadJson<Record<string, CostRule>>('packages/rules/xp_costs.json');

export const SPEND_CATEGORY_CHOICES = SPEND_CATEGORIES.map((category) => ({
  name: category,
  value: category,
}));
