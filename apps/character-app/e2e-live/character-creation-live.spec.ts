import { expect, test, type Page } from "@playwright/test"
import { dismissCookieBanner, walkNeonateToStartingXp } from "../e2e/wizard"

/**
 * Drives a real deployment: real Discord session, real Flask, real database.
 *
 * The hermetic spec (e2e/character-creation.spec.ts) stubs every /api/cc/*
 * call, so it proves the wizard's own logic and nothing else. These cover what
 * it structurally cannot, from the wizard through to the roster row:
 *
 *   - autosave reaches the database, and a reload cannot refund creation XP
 *   - submit, staff review, approval and revision against the real routes
 *   - the figures staff sign off on are the figures that land on the roster
 *   - the server ignores tampered budgets, clans and age categories
 *
 * The signed-in account must be staff, and the creator must be enabled for it.
 * Approved characters are left behind as ZZLive_<timestamp>; see README.md.
 */

const NAME_PREFIX = "ZZLive_"
let nameCounter = 0

function uniqueCharacterName() {
    nameCounter += 1
    return `${NAME_PREFIX}${Date.now()}_${nameCounter}`
}

test.beforeEach(async ({ page }) => {
    page.on("dialog", (dialog) => dialog.accept())
    await requireStaffWithCreatorEnabled(page)
})

test.describe("drafts", () => {
    test("a draft autosaves to the database and survives a reload", async ({ page }) => {
        await startFreshCharacter(page)
        await page.getByTestId("age-category-neonate-card").click()
        await page.getByTestId("clan-brujah-card").click()

        const draftId = await waitForDraftId(page)
        await expect
            .poll(async () => (await fetchDraft(page, draftId)).character_data?.clan)
            .toBe("Brujah")
        const draft = await fetchDraft(page, draftId)
        expect(draft.status).toBe("draft")
        expect(draft.character_data?.age_category).toBe("neonate")
        expect(draft.character_data?.cc_xp_budget).toBe(15)

        await page.reload()
        await expect(page.getByTestId("attribute-strength-button")).toBeVisible()
        expect(await waitForDraftId(page)).toBe(draftId)

        // Nothing later needs this one, and it has no name to clean up by.
        const deleted = await page.request.delete(`/api/cc/characters/${draftId}`)
        expect(deleted.status()).toBe(204)
    })
})

test.describe("neonate through to the roster", () => {
    test("spent XP survives a reload, and the remainder is what banks", async ({ page }) => {
        const name = uniqueCharacterName()
        await startFreshCharacter(page)
        await walkNeonateToStartingXp(page, name)

        await page.getByTestId("starting-xp-attributes-tab").click()
        await expect(page.getByTestId("starting-xp-remaining")).toHaveText("+15 XP")
        await page.getByTitle("+10 XP to reach 2").first().click()
        await expect(page.getByTestId("starting-xp-remaining")).toHaveText("+5 XP")

        // The budget-reset exploit: the baseline used to live in component
        // state, so a reload handed the player their whole budget back.
        const draftId = await waitForDraftId(page)
        await expect
            .poll(async () => (await fetchDraft(page, draftId)).character_data?.cc_base_attributes)
            .toBeTruthy()
        await page.reload()
        await expect(page.getByTestId("starting-xp-remaining")).toHaveText("+5 XP")
        await expect(page.getByTestId("starting-xp-spent")).toHaveText("-10 XP")

        await submitFromStartingXp(page, name, draftId)

        await openReview(page, draftId)
        await expectReviewFigures(page, { budget: 15, spent: 10, banked: 5 })
        await approveOpenDraft(page, draftId)

        expect(await readRosterRow(page, name)).toEqual({
            clan: "Brujah",
            ageCategory: "Neonate",
            sect: "Anarch",
            creationXp: 5,
        })
    })

    test("unspent XP above the cap is forfeit, and staff are told so", async ({ page }) => {
        const name = uniqueCharacterName()
        await startFreshCharacter(page)
        await walkNeonateToStartingXp(page, name)
        const draftId = await waitForDraftId(page)
        await submitFromStartingXp(page, name, draftId)

        await openReview(page, draftId)
        await expectReviewFigures(page, { budget: 15, spent: 0, banked: 5 })
        await expect(page.getByText("the rest is forfeit")).toBeVisible()
        await approveOpenDraft(page, draftId)

        expect((await readRosterRow(page, name)).creationXp).toBe(5)
    })
})

test.describe("revision cycle", () => {
    test("a draft returned for revision can be edited and resubmitted", async ({ page }) => {
        const name = uniqueCharacterName()
        const note = `Tighten the backstory (${name})`
        await startFreshCharacter(page)
        await walkNeonateToStartingXp(page, name)
        const draftId = await waitForDraftId(page)
        await submitFromStartingXp(page, name, draftId)

        await openReview(page, draftId)
        await page.locator("#revision_notes").fill(note)
        await page.getByRole("button", { name: "Request Revision" }).click()
        await expect.poll(async () => (await fetchDraft(page, draftId)).status).toBe("revision_requested")

        await page.goto("/player/")
        const row = page.locator(`#draft-row-${draftId}`)
        await expect(row.getByText("Revision Requested")).toBeVisible()
        await expect(row.getByText(note)).toBeVisible()

        // A player can come back on another device, or after starting another
        // draft, so Edit has to open THIS draft without help from localStorage.
        await page.evaluate(() => localStorage.clear())
        await row.getByRole("link", { name: "Edit" }).click()
        await expect
            .poll(() => page.evaluate(() => localStorage.getItem("cc-draft-id")), {
                message: "Edit did not open the draft it was clicked on",
            })
            .toBe(draftId)
        await expect(page.getByTestId("age-category-neonate-card")).toBeVisible()

        await page.goto("/player/new#final")
        await expect(page.getByTestId("final-character-name")).toHaveText(name)
        await page.getByTestId("final-submit-button").click()
        await expect.poll(async () => (await fetchDraft(page, draftId)).status).toBe("submitted")

        // Kept deliberately: the note is the ST's context for the second review.
        await openReview(page, draftId)
        await expect(page.getByText(note)).toBeVisible()
        await approveOpenDraft(page, draftId)
        expect((await readRosterRow(page, name)).creationXp).toBe(5)
    })
})

test.describe("In-Memoriam ancilla", () => {
    test("Starting XP gets only the banked era XP, not the era pool", async ({ page }) => {
        const name = uniqueCharacterName()
        await startFreshCharacter(page)
        await walkNeonateToStartingXp(page, name)
        const draftId = await waitForDraftId(page)

        // Converted the way AncillaModePicker and GenerationPickerIM do it, so
        // this needs no account with a 60-day-old roster character. Those two
        // pickers and the In-Memoriam disciplines step stay on the manual plan.
        await page.evaluate(() => {
            const character = JSON.parse(localStorage.getItem("character") as string)
            localStorage.setItem(
                "character",
                JSON.stringify({
                    ...character,
                    age_category: "ancilla",
                    bloodPotency: 1,
                    generation: 12,
                    im_generation: "12",
                    in_memoriam: {
                        use_standard: false,
                        embrace_age: "",
                        eras: [],
                        total_xp: 0,
                        total_humanity_loss: 0,
                        humanity_sacrifice: false,
                        starting_touchstones: [],
                        era_xp_spends: [],
                    },
                })
            )
        })
        await page.reload()
        await page.getByRole("button", { name: "Oceans of Time" }).click()

        // Three eras of Calm at 6 XP each: an 18 XP pool.
        await page.getByText("Up to 100 years ago").click()
        for (let era = 0; era < 3; era++) {
            await page.getByRole("button", { name: /A Time of Calm/ }).nth(era).click()
        }
        await page.getByRole("button", { name: "Confirm Oceans of Time" }).click()

        // Era XP: nothing spent, so 5 banks and 13 is explicitly lost.
        await expect(page.getByText("13 XP will be lost")).toBeVisible()
        await page.getByRole("button", { name: "Confirm Era XP" }).click()

        await page.getByTestId("merits-confirm-button").click()

        // The ordering bug: this used to offer the whole era pool.
        await expect(page.getByTestId("starting-xp-remaining")).toHaveText("+5 XP")
        await page.getByTestId("starting-xp-skills-tab").click()
        await page.getByTitle("+3 XP to reach 1").first().click()
        await expect(page.getByTestId("starting-xp-remaining")).toHaveText("+2 XP")

        await submitFromStartingXp(page, name, draftId)

        await openReview(page, draftId)
        await expect(page.getByText("Banks into play:")).toBeVisible()
        await approveOpenDraft(page, draftId)

        expect(await readRosterRow(page, name)).toMatchObject({
            ageCategory: "Ancilla",
            creationXp: 2,
        })
    })
})

/**
 * Hand-built drafts, created through the same endpoint the creator autosaves
 * to. character_data is client-authored, so anything here is something a player
 * could send. Set 6 and Set 7 of docs/MANUAL_TEST_PLAN_CHARACTER_CREATION.md.
 */
test.describe("approval normalises and distrusts the draft", () => {
    const cases: {
        title: string
        data: Record<string, unknown>
        expected: { clan?: string; ageCategory?: string; creationXp?: number }
    }[] = [
        {
            title: "Ministry maps to the roster's spelling",
            data: { clan: "Ministry", age_category: "neonate" },
            expected: { clan: "The Ministry" },
        },
        {
            title: "Thin-blood maps to the roster's spelling",
            data: { clan: "Thin-blood", age_category: "neonate" },
            expected: { clan: "Thin-Blood" },
        },
        {
            title: "a ghoul stays a ghoul and banks nothing",
            data: { clan: "Brujah", age_category: "ghoul" },
            expected: { ageCategory: "Ghoul", creationXp: 0 },
        },
        {
            title: "an inflated neonate budget still banks at most the cap",
            data: { clan: "Brujah", age_category: "neonate", cc_xp_budget: 500 },
            expected: { creationXp: 5 },
        },
        {
            title: "a budget on a ghoul is ignored",
            data: { clan: "Brujah", age_category: "ghoul", cc_xp_budget: 50 },
            expected: { creationXp: 0 },
        },
        {
            title: "inherited_xp is ignored",
            data: { clan: "Brujah", age_category: "mortal", inherited_xp: 20 },
            expected: { creationXp: 0 },
        },
        {
            title: "an unknown clan is stored blank",
            data: { clan: "Definitely Not A Clan", age_category: "neonate" },
            expected: { clan: "" },
        },
        {
            title: "an unknown age category falls back to Neonate",
            data: { clan: "Brujah", age_category: "methuselah" },
            expected: { ageCategory: "Neonate" },
        },
    ]

    for (const { title, data, expected } of cases) {
        test(title, async ({ page }) => {
            const name = uniqueCharacterName()
            const created = await page.request.post("/api/cc/characters", {
                data: { character_name: name, character_data: data },
            })
            expect(created.status()).toBe(201)
            const { id } = (await created.json()) as Draft
            const submitted = await page.request.post(`/api/cc/characters/${id}/submit`)
            expect(submitted.ok()).toBe(true)

            await openReview(page, id)
            await approveOpenDraft(page, id)

            expect(await readRosterRow(page, name)).toMatchObject(expected)
        })
    }
})

// ── helpers ─────────────────────────────────────────────────────────────────

type Draft = {
    id: string
    character_name: string | null
    status: string
    revision_notes: string
    character_data: Record<string, unknown> | null
}

/** Fails with a useful message rather than a confusing redirect mid-test. */
async function requireStaffWithCreatorEnabled(page: Page) {
    const me = await page.request.get("/api/auth/me")
    expect(me.ok(), "Not signed in. Run `npm run e2e:live:login` to capture a session.").toBe(true)

    const admin = await page.request.get("/cc-admin/drafts", { maxRedirects: 0 })
    expect(
        admin.status(),
        "This session cannot open CC Admin. These specs approve drafts, so sign in with a staff account."
    ).toBe(200)

    const creator = await page.request.get("/player/new", { maxRedirects: 0 })
    expect(
        creator.status(),
        "The creator is gated off. Set Settings → Character Creation to `staff` on this environment."
    ).toBe(200)
}

async function startFreshCharacter(page: Page) {
    await page.goto("/player/new?new=1")
    await dismissCookieBanner(page)
    await expect(page.getByTestId("age-category-neonate-card")).toBeVisible()
}

/**
 * The id of the draft THIS browser is writing to.
 *
 * Read from the creator rather than searched for in the draft list: a shared
 * environment holds older drafts that match any content search, and acting on
 * one of those would rename or approve somebody's real draft.
 */
async function waitForDraftId(page: Page): Promise<string> {
    await expect
        .poll(() => page.evaluate(() => localStorage.getItem("cc-draft-id")), {
            timeout: 30_000,
            message: "No draft id appeared. Autosave is debounced 1.5s; longer means it is not reaching Flask.",
        })
        .toBeTruthy()
    return (await page.evaluate(() => localStorage.getItem("cc-draft-id"))) as string
}

async function fetchDraft(page: Page, id: string): Promise<Draft> {
    const response = await page.request.get(`/api/cc/characters/${id}`)
    expect(response.ok(), `GET /api/cc/characters/${id} failed`).toBe(true)
    return response.json()
}

async function submitFromStartingXp(page: Page, name: string, draftId: string) {
    await page.getByTestId("starting-xp-continue-button").click()
    await expect(page.getByTestId("final-character-name")).toHaveText(name)
    await page.getByTestId("final-submit-button").click()
    await expect.poll(async () => (await fetchDraft(page, draftId)).status).toBe("submitted")
    expect((await fetchDraft(page, draftId)).character_name).toBe(name)
}

async function openReview(page: Page, draftId: string) {
    await page.goto(`/cc-admin/drafts/${draftId}`)
    await expect(page.getByRole("button", { name: "Approve Character" })).toBeVisible()
}

async function expectReviewFigures(
    page: Page,
    figures: { budget: number; spent: number; banked: number }
) {
    const badgeAfter = (label: string) => page.locator(`span:text-is("${label}") + span.badge`)
    await expect(badgeAfter("Creation XP budget:")).toHaveText(String(figures.budget))
    await expect(badgeAfter("Spent:")).toHaveText(String(figures.spent))
    await expect(badgeAfter("Banks into play:")).toHaveText(String(figures.banked))
}

async function approveOpenDraft(page: Page, draftId: string) {
    await page.getByRole("button", { name: "Approve Character" }).click()
    await expect.poll(async () => (await fetchDraft(page, draftId)).status).toBe("approved")
}

/** Reads the staff edit form: the one page showing every field approval sets. */
async function readRosterRow(page: Page, name: string) {
    await page.goto(`/roster/${encodeURIComponent(name)}/edit`)
    return {
        clan: await page.locator("#clan").inputValue(),
        ageCategory: await page.locator("#age_category").inputValue(),
        sect: await page.locator("#sect").inputValue(),
        creationXp: Number(await page.locator("#creation_xp").inputValue()),
    }
}
