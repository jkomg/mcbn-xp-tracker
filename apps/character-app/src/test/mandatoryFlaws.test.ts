import { describe, expect, it } from "vitest"

/**
 * Flaw dots are owed on every creation path, not just In-Memoriam.
 *
 * MeritsAndFlawsPicker gated its "must spend all flaw points" check on
 * isImAncilla, so a standard neonate (2 flaw dots) or standard ancilla (4)
 * could press Continue having taken none — while the sidebar still showed the
 * flaw budget, and the advantage dots those flaws pay for were granted anyway.
 *
 * These mirror the flawPoints / hasMandatoryFlaws logic in the component. The
 * budget itself is unchanged; only whether it is enforced.
 */
function flawPoints(opts: {
    ageCategory: string
    isImAncilla?: boolean
    imGeneration?: string
    eraFlawBonus?: number
}): number {
    if (opts.isImAncilla) {
        const gen = opts.imGeneration ?? ""
        const base = gen === "12" ? 0 : gen === "9-8" ? 5 : 3
        return base + (opts.eraFlawBonus ?? 0)
    }
    return opts.ageCategory === "ancilla" ? 4 : 2
}

const hasMandatoryFlaws = (points: number) => points > 0

const confirmDisabled = (points: number, remaining: number) =>
    hasMandatoryFlaws(points) && remaining > 0

describe("flaw budgets by path", () => {
    it("gives a standard neonate 2 flaw dots", () => {
        expect(flawPoints({ ageCategory: "neonate" })).toBe(2)
    })

    it("gives a standard ancilla 4 flaw dots", () => {
        expect(flawPoints({ ageCategory: "ancilla" })).toBe(4)
    })

    it("derives In-Memoriam flaw dots from generation", () => {
        expect(flawPoints({ ageCategory: "ancilla", isImAncilla: true, imGeneration: "12" })).toBe(0)
        expect(flawPoints({ ageCategory: "ancilla", isImAncilla: true, imGeneration: "11-10" })).toBe(3)
        expect(flawPoints({ ageCategory: "ancilla", isImAncilla: true, imGeneration: "9-8" })).toBe(5)
    })
})

describe("flaws are mandatory on every path", () => {
    it("blocks a standard neonate who took no flaws", () => {
        const points = flawPoints({ ageCategory: "neonate" })
        expect(confirmDisabled(points, points)).toBe(true)
    })

    it("blocks a standard neonate who took only one of two dots", () => {
        expect(confirmDisabled(2, 1)).toBe(true)
    })

    it("allows continuing once the full budget is spent", () => {
        expect(confirmDisabled(2, 0)).toBe(false)
    })

    it("blocks a standard ancilla who took no flaws", () => {
        const points = flawPoints({ ageCategory: "ancilla" })
        expect(confirmDisabled(points, points)).toBe(true)
    })

    it("still blocks an In-Memoriam ancilla, as before", () => {
        const points = flawPoints({ ageCategory: "ancilla", isImAncilla: true, imGeneration: "11-10" })
        expect(confirmDisabled(points, points)).toBe(true)
    })

    it("does not block a path with a zero flaw budget", () => {
        // IM 12th generation owes nothing, so there is nothing to enforce.
        const points = flawPoints({ ageCategory: "ancilla", isImAncilla: true, imGeneration: "12" })
        expect(points).toBe(0)
        expect(confirmDisabled(points, 0)).toBe(false)
    })
})
