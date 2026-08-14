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

function inMemoriam(totalXp: number, spends: { xp_cost: number }[] = []) {
    return {
        use_standard: false,
        embrace_age: "" as const,
        eras: [],
        total_xp: totalXp,
        total_humanity_loss: 0,
        humanity_sacrifice: false,
        starting_touchstones: [],
        era_xp_spends: spends as never[],
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
    it("derives the budget from the age category, not the stored field", () => {
        // cc_xp_budget is client-authored; the budget comes from the shared
        // rules table keyed by age so a tampered field cannot inflate it.
        const c = character({ age_category: "ancilla", cc_xp_budget: 999 })
        expect(computeCcXpBudget(c)).toBe(35)
    })

    it("gives zero-budget ages nothing regardless of the stored field", () => {
        for (const age of ["mortal", "fledgling", "ghoul"] as const) {
            const c = character({ age_category: age, cc_xp_budget: 50 })
            expect(computeCcXpBudget(c)).toBe(0)
        }
    })

    it("ignores inherited_xp, which nothing in the creator ever writes", () => {
        const c = character({ age_category: "ancilla", cc_xp_budget: 35, inherited_xp: 10 })
        expect(computeCcXpBudget(c)).toBe(35)
    })

    it("caps an In-Memoriam budget at what the era step banked", () => {
        // The era step forfeits anything above the cap, so the Starting XP
        // step gets the capped remainder rather than the whole era pool.
        const c = character({
            age_category: "ancilla",
            cc_xp_budget: 0,
            in_memoriam: inMemoriam(42),
        })
        expect(computeCcXpBudget(c)).toBe(CC_MAX_BANKED_XP)
    })

    it("keeps a small era remainder intact rather than inflating it", () => {
        const c = character({
            age_category: "ancilla",
            in_memoriam: inMemoriam(60, [{ xp_cost: 58 }]),
        })
        expect(computeCcXpBudget(c)).toBe(2)
    })

    it("subtracts era spends from an In-Memoriam budget", () => {
        const c = character({
            age_category: "ancilla",
            cc_xp_budget: 0,
            in_memoriam: inMemoriam(60, [{ xp_cost: 40 }, { xp_cost: 20 }]),
        })
        // EraXpPicker already applied those purchases to the sheet, and they
        // land before the XP step captures its baseline — so they must come
        // off the budget here or the character banks XP it already spent.
        expect(computeCcXpBudget(c)).toBe(0)
        expect(computeCcXpBanked(c)).toBe(0)
    })

    it("never returns a negative budget", () => {
        const c = character({
            age_category: "ancilla",
            in_memoriam: inMemoriam(10, [{ xp_cost: 40 }]),
        })
        expect(computeCcXpBudget(c)).toBe(0)
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
