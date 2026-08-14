import { describe, expect, it } from "vitest"
import {
    CC_MAX_BANKED_XP,
    computeCcXpBanked,
    computeCcXpBudget,
    computeCcXpRemaining,
    computeCcXpSpent,
    cumulativeCost,
    attrLevelCost,
    skillLevelCost,
} from "../generator/ccXp"
import { Character } from "../data/Character"
import { getBasicTestCharacter } from "./testUtils"

const base = () => getBasicTestCharacter()

function character(overrides: Partial<Character>): Character {
    return { ...base(), ...overrides } as Character
}

function inMemoriam(totalXp: number) {
    return {
        use_standard: false,
        embrace_age: "" as const,
        eras: [],
        total_xp: totalXp,
        total_humanity_loss: 0,
        humanity_sacrifice: false,
        starting_touchstones: [],
        era_xp_spends: [],
    }
}

describe("cumulativeCost", () => {
    it("sums each step, not just the final level", () => {
        // 2->4 attributes = (3x5) + (4x5) = 35
        expect(cumulativeCost(2, 4, attrLevelCost)).toBe(35)
        // 1->3 skills = (2x3) + (3x3) = 15
        expect(cumulativeCost(1, 3, skillLevelCost)).toBe(15)
    })

    it("is zero when the rating did not increase", () => {
        expect(cumulativeCost(3, 3, attrLevelCost)).toBe(0)
        expect(cumulativeCost(4, 2, attrLevelCost)).toBe(0)
    })
})

describe("computeCcXpSpent", () => {
    it("counts loresheet dots", () => {
        const c = character({
            loresheet_purchases: [
                { loresheet_id: "a", dot: 1 },
                { loresheet_id: "b", dot: 3 },
            ],
        })
        expect(computeCcXpSpent(c)).toBe(3 + 9)
    })

    it("counts attribute and skill raises against the persisted baseline", () => {
        const c = character({
            cc_base_attributes: { ...base().attributes, strength: 2 },
            cc_base_skills: { ...base().skills, brawl: 1 },
            attributes: { ...base().attributes, strength: 3 },
            skills: { ...base().skills, brawl: 2 },
        })
        // strength 2->3 = 15, brawl 1->2 = 6
        expect(computeCcXpSpent(c)).toBe(21)
    })

    it("falls back to loresheet-only spend when no baseline exists (pre-v8 drafts)", () => {
        const c = character({
            attributes: { ...base().attributes, strength: 4 },
            loresheet_purchases: [{ loresheet_id: "a", dot: 2 }],
        })
        // No cc_base_attributes: the raise is not counted, only the loresheet.
        expect(computeCcXpSpent(c)).toBe(6)
    })

    it("does not credit XP back for lowering a rating below baseline", () => {
        const c = character({
            cc_base_attributes: { ...base().attributes, strength: 3 },
            attributes: { ...base().attributes, strength: 1 },
        })
        expect(computeCcXpSpent(c)).toBe(0)
    })
})

describe("computeCcXpBudget", () => {
    it("adds inherited XP to the age-category budget", () => {
        const c = character({ age_category: "ancilla", cc_xp_budget: 35, inherited_xp: 10 })
        expect(computeCcXpBudget(c)).toBe(45)
    })

    it("uses era XP for an In-Memoriam ancilla", () => {
        const c = character({
            age_category: "ancilla",
            cc_xp_budget: 0,
            in_memoriam: inMemoriam(42),
        })
        expect(computeCcXpBudget(c)).toBe(42)
    })
})

describe("computeCcXpBanked", () => {
    it("banks the unspent remainder when under the cap", () => {
        const c = character({
            age_category: "neonate",
            cc_xp_budget: 15,
            loresheet_purchases: [{ loresheet_id: "a", dot: 4 }], // 12 spent
        })
        expect(computeCcXpRemaining(c)).toBe(3)
        expect(computeCcXpBanked(c)).toBe(3)
    })

    it("caps banked XP at the chronicle maximum", () => {
        const c = character({ age_category: "ancilla", cc_xp_budget: 35 })
        expect(computeCcXpRemaining(c)).toBe(35)
        expect(computeCcXpBanked(c)).toBe(CC_MAX_BANKED_XP)
    })

    it("banks nothing for a zero-budget age category", () => {
        const c = character({ age_category: "fledgling", cc_xp_budget: 0 })
        expect(computeCcXpBanked(c)).toBe(0)
    })

    it("banks nothing when over budget", () => {
        const c = character({
            age_category: "neonate",
            cc_xp_budget: 15,
            loresheet_purchases: [{ loresheet_id: "a", dot: 5 }, { loresheet_id: "b", dot: 5 }],
        })
        expect(computeCcXpRemaining(c)).toBeLessThan(0)
        expect(computeCcXpBanked(c)).toBe(0)
    })

    it("applies the cap to In-Memoriam ancilla too", () => {
        const c = character({
            age_category: "ancilla",
            cc_xp_budget: 0,
            in_memoriam: inMemoriam(60),
        })
        expect(computeCcXpBanked(c)).toBe(CC_MAX_BANKED_XP)
    })
})
