import { describe, expect, it } from "vitest"
import {
    applyCharacterCompatibilityPatches,
    getEmptyCharacter,
    parseStoredDraft,
    schemaVersion,
} from "~/data/Character"

describe("parseStoredDraft", () => {
    it("moves a v6 draft's backgrounds out of merits, though it already parses", () => {
        // backgrounds has a schema default, so a v6 draft validates as it stands.
        // Parsing before patching would stamp it current with no backgrounds,
        // and approval would then have nothing to sync onto the roster.
        const { backgrounds: _omitted, ...rest } = getEmptyCharacter()
        const haven = { name: "Haven", level: 2, summary: "", excludes: [], type: "merit" }
        const flaw = { name: "Bond Junkie", level: 1, summary: "", excludes: [], type: "flaw" }

        const character = parseStoredDraft({ ...rest, version: 6, merits: [haven, flaw] })

        expect(character.backgrounds.map((b) => b.name)).toEqual(["Haven"])
        expect(character.merits.map((m) => m.name)).toEqual(["Bond Junkie"])
        expect(character.version).toBe(schemaVersion)
    })

    it("rejects data that no patch can make valid", () => {
        expect(() => parseStoredDraft({ ...getEmptyCharacter(), attributes: "nonsense" })).toThrow()
    })
})

describe("character compatibility patches", () => {
    it("adds ceremonies to pre-v6 characters", () => {
        const parsed: Record<string, unknown> = {
            version: 5,
            rituals: [],
            availableDisciplineNames: [],
            predatorType: {
                pickedMeritsAndFlaws: []
            }
        }

        applyCharacterCompatibilityPatches(parsed)

        expect(parsed.ceremonies).toEqual([])
        expect(parsed.version).toBe(schemaVersion)
    })
})

describe("v7 -> v8: persisted creation-XP baselines", () => {
    const v7Character = (): Record<string, unknown> => ({
        version: 7,
        rituals: [],
        ceremonies: [],
        availableDisciplineNames: [],
        predatorType: { pickedMeritsAndFlaws: [] },
        attributes: { strength: 4, dexterity: 2 },
        skills: { brawl: 3 },
        loresheet_purchases: [{ loresheet_id: "a", dot: 2 }],
    })

    it("stamps the current version", () => {
        const parsed = v7Character()
        applyCharacterCompatibilityPatches(parsed)
        expect(parsed.version).toBe(schemaVersion)
    })

    it("does NOT backfill baselines from current ratings", () => {
        // Deliberate: a v7 draft may already have spent XP on attributes or
        // skills. Seeding the baseline from the raised values would record
        // that spend as zero and silently refund the player. Leaving the
        // fields absent makes computeCcXpSpent fall back to loresheet-only
        // spend, which is exactly what these drafts were already shown.
        const parsed = v7Character()
        applyCharacterCompatibilityPatches(parsed)
        expect(parsed.cc_base_attributes).toBeUndefined()
        expect(parsed.cc_base_skills).toBeUndefined()
    })

    it("leaves an existing baseline untouched", () => {
        const parsed = v7Character()
        parsed.cc_base_attributes = { strength: 1 }
        parsed.cc_base_skills = { brawl: 1 }
        applyCharacterCompatibilityPatches(parsed)
        expect(parsed.cc_base_attributes).toEqual({ strength: 1 })
        expect(parsed.cc_base_skills).toEqual({ brawl: 1 })
    })

    it("keeps the character parseable end to end", () => {
        const parsed = v7Character()
        applyCharacterCompatibilityPatches(parsed)
        expect(parsed.cc_xp_budget).toBe(0)
        expect(parsed.loresheet_purchases).toEqual([{ loresheet_id: "a", dot: 2 }])
    })
})
