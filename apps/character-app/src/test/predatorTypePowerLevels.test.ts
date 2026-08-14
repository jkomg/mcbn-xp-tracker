import { describe, expect, it } from "vitest"
import { maxReachableLevel } from "~/generator/components/DisciplinesPicker"

/**
 * The predator-type slot is ONE dot in the PT discipline, stacked on whatever
 * clan dots went into that same discipline. A level N power needs N-1 powers
 * already taken in that discipline, so the highest level worth rendering under
 * Predator Type is (clan picks in that discipline) + 1.
 *
 * DisciplinesPicker used to decide this statically — it showed level 3 cards
 * whenever the PT discipline happened to also be a clan discipline, regardless
 * of whether any dots went there. A Toreador who put clan dots in Auspex and
 * Celerity still saw greyed-out level 2 and 3 Presence cards under Predator
 * Type, which reads as a broken TAKE button rather than "you have no Presence".
 *
 * This mirrors ptMaxLevel in DisciplinesPickerIM, which already filtered by
 * actual dots. Kept as a pure function so both call sites can be checked
 * without mounting the wizard.
 */
describe("predator-type power level ceiling", () => {
    it("allows only level 1 when no clan dots went into the PT discipline", () => {
        // The reported case: Auspex 2 + Celerity 1, predator type Presence.
        expect(maxReachableLevel(true, 0)).toBe(1)
    })

    it("opens level 2 with one clan dot in the PT discipline", () => {
        expect(maxReachableLevel(true, 1)).toBe(2)
    })

    it("opens level 3 with two clan dots in the PT discipline", () => {
        expect(maxReachableLevel(true, 2)).toBe(3)
    })

    it("never exceeds level 3 during creation", () => {
        expect(maxReachableLevel(true, 5)).toBe(3)
    })

    it("caps clan sections at level 2 regardless of the PT discipline", () => {
        // alreadyPickedTwoPowers stops a third pick in one discipline, so the
        // prerequisite for a level 3 clan power can never be met and satisfied
        // at the same time.
        expect(maxReachableLevel(false, 0)).toBe(2)
        expect(maxReachableLevel(false, 2)).toBe(2)
    })
})
