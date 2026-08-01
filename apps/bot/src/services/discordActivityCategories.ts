/**
 * Discord category IDs that the activity tracker monitors for post counts.
 * Cubbies are identified by category name (see cubbyChannels.ts) rather than
 * hardcoded IDs so they don't need updating if categories are renamed/recreated.
 *
 * IC/OOC/Rolls category IDs are DB-editable via the web Settings page and
 * live-synced into `liveConfig` by ConfigSyncWorker (no restart needed) — see
 * `liveConfig.activityIcCategoryIds` / `activityOocCategoryIds` / `activityRollsCategoryIds`.
 * When no DB override exists, ConfigSyncWorker falls back to the .env-derived
 * `config.activityIcCategoryIds` etc. (see config.ts), which themselves default
 * to the historical hardcoded ID set below.
 */

import { liveConfig } from '../liveConfig';

export type ActivityCategory = 'ic' | 'ooc' | 'rolls' | 'cubby';

/** Historical hardcoded defaults — now the fallback default for the ACTIVITY_*_CATEGORY_IDS env vars (see config.ts). */
export const DEFAULT_IC_CATEGORY_IDS = new Set([
  '1170106727966986381',
  '1168840134347726849',
  '1170109891747270746',
  '1170109944494825692',
  '1169723188264046612',
  '1170109341051916432',
]);

export const DEFAULT_OOC_CATEGORY_IDS = new Set([
  '1168638982540759132',
  '1168643826693460089',
  '1168655400787255416',
  '1170104059286523904',
  '1168643282843222086',
]);

export const DEFAULT_ROLLS_CATEGORY_IDS = new Set([
  '1170103481479213141',
]);

/** Returns the activity category for a given parent category ID, or null. */
export function categoryFromId(categoryId: string): ActivityCategory | null {
  if (liveConfig.activityIcCategoryIds.has(categoryId)) return 'ic';
  if (liveConfig.activityOocCategoryIds.has(categoryId)) return 'ooc';
  if (liveConfig.activityRollsCategoryIds.has(categoryId)) return 'rolls';
  return null;
}
