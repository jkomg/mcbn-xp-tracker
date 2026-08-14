import { describe, expect, it } from "vitest"
import { getNextGeneratorStepId, getVisibleGeneratorSteps } from "~/generator/steps"
import { Character } from "~/data/Character"
import { getBasicTestCharacter } from "./testUtils"

/**
 * getNextGeneratorStepId decides the next step from the CHARACTER, because
 * several steps are conditional (loresheet is neonate/ancilla only, rituals
 * need Blood Sorcery, and so on). When the current step is not in the visible
 * list it returns the same step, which is the correct fallback but also a
 * silent one.
 *
 * That fallback is what a caller hit in practice: LoresheetPicker wired its
 * Continue button as `onClick={nextStep}`, so React passed a MouseEvent as the
 * optional characterOverride. Step availability was then evaluated against an
 * event object — age_category read as undefined, "loresheet" dropped out of
 * the visible list, findIndex returned -1, and the button re-selected the step
 * the player was already on. No error, no navigation.
 */

const neonate = (): Character =>
    ({ ...getBasicTestCharacter(), age_category: "neonate" }) as Character

describe("step advance for a neonate", () => {
    it("includes the Starting XP step", () => {
        const ids = getVisibleGeneratorSteps(neonate()).map((s) => s.id)
        expect(ids).toContain("loresheet")
    })

    it("advances off the Starting XP step", () => {
        expect(getNextGeneratorStepId(neonate(), "loresheet")).not.toBe("loresheet")
    })

    it("advances to Review & Submit, the last step", () => {
        expect(getNextGeneratorStepId(neonate(), "loresheet")).toBe("final")
    })

    it("stays put on the final step, having nowhere to go", () => {
        expect(getNextGeneratorStepId(neonate(), "final")).toBe("final")
    })
})

describe("the silent fallback that hid the bug", () => {
    it("omits the Starting XP step for a zero-budget age category", () => {
        const ghoul = { ...getBasicTestCharacter(), age_category: "ghoul" } as Character
        expect(getVisibleGeneratorSteps(ghoul).map((s) => s.id)).not.toContain("loresheet")
    })

    it("returns the same step when the current one is not visible", () => {
        // Asking to advance from a step this character never sees is how the
        // event-as-character bug manifested: same step back, no error.
        const ghoul = { ...getBasicTestCharacter(), age_category: "ghoul" } as Character
        expect(getNextGeneratorStepId(ghoul, "loresheet")).toBe("loresheet")
    })

    it("treats a character with no age category as having no Starting XP step", () => {
        // This is what an event object looked like to isStepAvailable.
        const blank = { ...getBasicTestCharacter(), age_category: "" } as Character
        expect(getVisibleGeneratorSteps(blank).map((s) => s.id)).not.toContain("loresheet")
        expect(getNextGeneratorStepId(blank, "loresheet")).toBe("loresheet")
    })
})
