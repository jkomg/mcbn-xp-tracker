/**
 * Character-creation XP budget maths.
 *
 * Single source of truth for "how much of the creation budget has been spent".
 * This used to be computed in two places that disagreed: LoresheetPicker
 * counted attributes + skills + loresheets, while the sidebar counted
 * loresheets only — so a player who raised an attribute saw two different
 * "Remaining" figures depending on where they looked.
 *
 * Costs mirror packages/rules/xp_costs.json, the same table the web app and
 * bot price post-creation spends from (Attribute = new rating x5, Skill = new
 * rating x3, Loresheet = purchased dot x3). Keep them in step.
 */
import { Character } from "~/data/Character"
import { loresheetDotCost } from "~/data/Loresheets"

/** Starting XP budget by age category. Mirrors XP_BUDGETS in AgeCategoryPicker. */
export const CC_XP_BUDGETS: Record<string, number> = {
    mortal: 0,
    fledgling: 0,
    ghoul: 0,
    neonate: 15,
    ancilla: 35,
}

/**
 * Most unspent creation XP a character may carry into play. Chronicle rule:
 * spend as much as possible at creation and bank only what you must.
 */
export const CC_MAX_BANKED_XP = 5

export const attrLevelCost = (newLevel: number): number => newLevel * 5
export const skillLevelCost = (newLevel: number): number => newLevel * 3

/** Total cost of raising a trait from `from` to `to` (0 if not an increase). */
export function cumulativeCost(
    from: number,
    to: number,
    costFn: (level: number) => number,
): number {
    let total = 0
    for (let level = (from ?? 0) + 1; level <= (to ?? 0); level += 1) {
        total += costFn(level)
    }
    return total
}

function spentOnTraits(
    base: Record<string, number> | undefined,
    current: Record<string, number> | undefined,
    costFn: (level: number) => number,
): number {
    if (!base || !current) return 0
    return Object.keys(base).reduce(
        (sum, key) => sum + cumulativeCost(base[key], current[key], costFn),
        0,
    )
}

export function ccLoresheetSpent(character: Character): number {
    return (character.loresheet_purchases ?? []).reduce(
        (sum, p) => sum + loresheetDotCost(p.dot),
        0,
    )
}

/**
 * Creation XP spent so far: attribute raises + skill raises + loresheet dots.
 *
 * Attribute/skill spend is measured against `cc_base_attributes` /
 * `cc_base_skills`, captured and PERSISTED when the XP step is first entered.
 * Before those were persisted the baseline lived in component state, so a
 * page reload reset it to the already-raised values and handed the player
 * their whole budget back. Drafts created before that fix have no baseline;
 * they fall back to loresheet-only spend rather than silently reporting 0.
 */
export function computeCcXpSpent(character: Character): number {
    return (
        ccLoresheetSpent(character) +
        spentOnTraits(character.cc_base_attributes, character.attributes, attrLevelCost) +
        spentOnTraits(character.cc_base_skills, character.skills, skillLevelCost)
    )
}

/** Total budget available: age-category budget plus any inherited XP. */
export function computeCcXpBudget(character: Character): number {
    const isImAncilla =
        character.age_category === "ancilla" &&
        !!character.in_memoriam &&
        !character.in_memoriam.use_standard
    const base = isImAncilla
        ? (character.in_memoriam?.total_xp ?? 0)
        : (character.cc_xp_budget ?? 0)
    return base + (character.inherited_xp ?? 0)
}

/** Unspent budget, which may go negative while the player is over budget. */
export function computeCcXpRemaining(character: Character): number {
    return computeCcXpBudget(character) - computeCcXpSpent(character)
}

/**
 * XP actually carried into play, which is what the roster character is
 * granted on approval. Clamped to 0..CC_MAX_BANKED_XP: over-budget characters
 * bank nothing, and anything above the cap is forfeit rather than banked.
 */
export function computeCcXpBanked(character: Character): number {
    return Math.max(0, Math.min(computeCcXpRemaining(character), CC_MAX_BANKED_XP))
}
