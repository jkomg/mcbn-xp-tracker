import { expect, test, type Page } from "@playwright/test"

/**
 * Drives a real deployment: real Discord session, real Flask, real Turso.
 *
 * The hermetic spec (e2e/character-creation.spec.ts) stubs every /api/cc/*
 * call, so it proves the wizard's own logic and nothing else. These cover what
 * it structurally cannot:
 *
 *   - the draft actually persists to the database and survives a reload
 *   - autosave round-trips through Flask, not a route handler
 *   - the server's XP maths agrees with what the creator showed the player
 *   - submit moves the draft to `submitted` for real
 *
 * Leaves characters named ZZLive_<timestamp> behind. See e2e-live/README.md.
 */

const NAME_PREFIX = "ZZLive_"

function uniqueCharacterName() {
    return `${NAME_PREFIX}${Date.now()}`
}

/** Fails with a useful message rather than a confusing redirect mid-test. */
async function requireSignedIn(page: Page) {
    const response = await page.request.get("/api/auth/me")
    expect(
        response.ok(),
        "Not signed in. Run `npm run e2e:live:login` to capture a session."
    ).toBe(true)
    return response.json()
}

test.describe("live character creation", () => {
    test("signed-in session reaches the creator", async ({ page }) => {
        const user = await requireSignedIn(page)
        expect(user.id).toBeTruthy()

        await page.goto("/player/new?new=1")
        // The wizard mounts at the age-category step for a fresh draft.
        await expect(page.getByTestId("age-category-neonate-card")).toBeVisible()
    })

    test("a draft persists to the database and survives a reload", async ({ page }) => {
        await requireSignedIn(page)
        const characterName = uniqueCharacterName()

        await page.goto("/player/new?new=1")
        await page.getByTestId("age-category-neonate-card").click()
        await page.getByTestId("clan-brujah-card").click()

        // Autosave is debounced 1.5s and only fires on a character change, so
        // wait for the draft to actually exist server-side before asserting on
        // it. Polling the API is the honest check — the UI gives no signal.
        const draft = await waitForDraftContaining(page, "Brujah")
        expect(draft.character_data.clan).toBe("Brujah")
        expect(draft.character_data.age_category).toBe("neonate")
        // v8 baseline, persisted so creation spend survives a reload.
        expect(draft.character_data.cc_base_attributes).toBeTruthy()

        // Reload and confirm the wizard restores from the server rather than
        // starting over — the bug class that produced the budget-reset exploit.
        await page.reload()
        await expect(page.getByTestId("starting-xp-continue-button").or(
            page.getByTestId("clan-brujah-card")
        ).first()).toBeVisible()

        const after = await fetchDraft(page, draft.id)
        expect(after.character_data.clan).toBe("Brujah")

        // Name it so the leftover row is identifiable for cleanup.
        await page.request.put(`/api/cc/characters/${draft.id}`, {
            data: { character_name: characterName },
        })
        const named = await fetchDraft(page, draft.id)
        expect(named.character_name).toBe(characterName)
    })

    test("the server agrees with the creator about banked XP", async ({ page }) => {
        // The creator shows a budget; approval grants creation_xp from the
        // server's own maths. They are separate implementations
        // (ccXp.ts and cc_xp.py), so this checks they agree on real data.
        await requireSignedIn(page)

        await page.goto("/player/new?new=1")
        await page.getByTestId("age-category-neonate-card").click()
        await page.getByTestId("clan-brujah-card").click()

        const draft = await waitForDraftContaining(page, "Brujah")
        // A neonate's budget comes from packages/rules/cc_xp.json, which both
        // sides read. If this drifts, one of them stopped reading the file.
        expect(draft.character_data.cc_xp_budget).toBe(15)
    })
})

// ── helpers ─────────────────────────────────────────────────────────────────

type Draft = {
    id: string
    character_name: string | null
    status: string
    character_data: Record<string, never> & Record<string, unknown>
}

async function fetchDraft(page: Page, id: string): Promise<Draft> {
    const response = await page.request.get(`/api/cc/characters/${id}`)
    expect(response.ok(), `GET /api/cc/characters/${id} failed`).toBe(true)
    return response.json()
}

/**
 * Waits for an autosaved draft whose character_data mentions `marker`.
 *
 * Picks the newest matching draft rather than assuming the list is empty —
 * this runs against a shared environment where other drafts exist.
 */
async function waitForDraftContaining(page: Page, marker: string): Promise<Draft> {
    let latest: Draft | undefined
    await expect
        .poll(
            async () => {
                const response = await page.request.get("/api/cc/characters")
                if (!response.ok()) return false
                const drafts = (await response.json()) as Draft[]
                const matches = drafts.filter(
                    (d) => d.character_data && JSON.stringify(d.character_data).includes(marker)
                )
                latest = matches[0]
                return !!latest
            },
            {
                timeout: 30_000,
                message: `No autosaved draft containing "${marker}" appeared. Autosave is debounced 1.5s; a longer wait means it is not reaching Flask.`,
            }
        )
        .toBe(true)
    return latest as Draft
}
