/**
 * Discord category IDs that the activity tracker monitors for post counts.
 * Cubbies are identified by category name (see cubbyChannels.ts) rather than
 * hardcoded IDs so they don't need updating if categories are renamed/recreated.
 */

export type ActivityCategory = 'ic' | 'ooc' | 'rolls' | 'cubby';

export const IC_CATEGORY_IDS = new Set([
  '1170106727966986381',
  '1168840134347726849',
  '1170109891747270746',
  '1170109944494825692',
  '1169723188264046612',
  '1170109341051916432',
]);

export const OOC_CATEGORY_IDS = new Set([
  '1168638982540759132',
  '1168643826693460089',
  '1168655400787255416',
  '1170104059286523904',
  '1168643282843222086',
]);

export const ROLLS_CATEGORY_IDS = new Set([
  '1170103481479213141',
]);

/** Returns the activity category for a given parent category ID, or null. */
export function categoryFromId(categoryId: string): ActivityCategory | null {
  if (IC_CATEGORY_IDS.has(categoryId)) return 'ic';
  if (OOC_CATEGORY_IDS.has(categoryId)) return 'ooc';
  if (ROLLS_CATEGORY_IDS.has(categoryId)) return 'rolls';
  return null;
}
