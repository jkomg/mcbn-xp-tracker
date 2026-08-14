import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { schemaVersion } from "../data/Character"

/**
 * The creator owns the character_data schema and its migration chain; the web
 * app reads the stamped version to tell current drafts from older ones. Both
 * sides read packages/api-contract/cc_schema.json, so bumping schemaVersion
 * without updating that file (or vice versa) would leave the web app silently
 * mis-labelling every new draft as outdated.
 *
 * Mirrors apps/web/tests/test_cc_schema.py and the existing sharedContract
 * tests in apps/bot.
 */
const ccSchema = JSON.parse(
    readFileSync(
        resolve(__dirname, "../../../../packages/api-contract/cc_schema.json"),
        "utf-8",
    ),
) as { current_version: number; minimum_supported_version: number; history: Record<string, string> }

describe("cc schema version contract", () => {
    it("matches the shared contract's current_version", () => {
        expect(schemaVersion).toBe(ccSchema.current_version)
    })

    it("records a history entry for the current version", () => {
        expect(Object.keys(ccSchema.history)).toContain(String(schemaVersion))
    })

    it("has a minimum supported version below the current one", () => {
        expect(ccSchema.minimum_supported_version).toBeLessThan(ccSchema.current_version)
    })
})
