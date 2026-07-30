import { afterEach, describe, expect, it } from 'vitest';
import { liveConfig } from '../liveConfig';
import {
  categoryFromId,
  DEFAULT_IC_CATEGORY_IDS,
  DEFAULT_OOC_CATEGORY_IDS,
  DEFAULT_ROLLS_CATEGORY_IDS,
} from '../services/discordActivityCategories';

describe('categoryFromId', () => {
  afterEach(() => {
    liveConfig.activityIcCategoryIds = new Set();
    liveConfig.activityOocCategoryIds = new Set();
    liveConfig.activityRollsCategoryIds = new Set();
  });

  it('reads from liveConfig rather than any hardcoded set', () => {
    liveConfig.activityIcCategoryIds = new Set(['ic-cat']);
    liveConfig.activityOocCategoryIds = new Set(['ooc-cat']);
    liveConfig.activityRollsCategoryIds = new Set(['rolls-cat']);

    expect(categoryFromId('ic-cat')).toBe('ic');
    expect(categoryFromId('ooc-cat')).toBe('ooc');
    expect(categoryFromId('rolls-cat')).toBe('rolls');
    expect(categoryFromId('unknown-cat')).toBeNull();
  });

  it('returns null for all categories when liveConfig sets are empty', () => {
    expect(categoryFromId('anything')).toBeNull();
  });

  it('reflects live updates without re-import (no restart needed)', () => {
    expect(categoryFromId('late-cat')).toBeNull();
    liveConfig.activityIcCategoryIds = new Set(['late-cat']);
    expect(categoryFromId('late-cat')).toBe('ic');
  });

  // Regression safety net: prove the migration from hardcoded module constants
  // to DB-editable/liveConfig-backed values didn't drop or alter any of the
  // previously-hardcoded IDs. config.ts defaults ACTIVITY_*_CATEGORY_IDS to
  // these exact sets when no env var / DB override is present, and
  // configSyncWorker seeds liveConfig from config.ts on first sync.
  it('classifies every historically-hardcoded ID exactly as before, once liveConfig is seeded from defaults', () => {
    liveConfig.activityIcCategoryIds = new Set(DEFAULT_IC_CATEGORY_IDS);
    liveConfig.activityOocCategoryIds = new Set(DEFAULT_OOC_CATEGORY_IDS);
    liveConfig.activityRollsCategoryIds = new Set(DEFAULT_ROLLS_CATEGORY_IDS);

    for (const id of DEFAULT_IC_CATEGORY_IDS) {
      expect(categoryFromId(id)).toBe('ic');
    }
    for (const id of DEFAULT_OOC_CATEGORY_IDS) {
      expect(categoryFromId(id)).toBe('ooc');
    }
    for (const id of DEFAULT_ROLLS_CATEGORY_IDS) {
      expect(categoryFromId(id)).toBe('rolls');
    }
  });
});
