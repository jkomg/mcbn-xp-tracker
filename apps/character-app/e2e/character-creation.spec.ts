import { expect, test, type Locator, type Page } from "@playwright/test"

/**
 * End-to-end walk of the character-creation wizard, from the age-category step
 * through to Submit for Review.
 *
 * This replaces character-creation-pdf.spec.ts, which had gone stale: it
 * assumed clan was the first step (it is age-category now), and finished by
 * downloading a PDF (the Final step submits for ST review now — PDF export
 * moved to the post-approval character sheet). Nine of its twenty-two testids
 * no longer existed.
 *
 * The run is hermetic. Every /api/cc/* call is stubbed, so no Flask app is
 * needed and the assertions do not depend on chronicle data that changes.
 * The submit payload is captured and asserted at the end, which is the closest
 * thing to "the draft the ST would review".
 *
 * Things this would have caught, all reported by hand during testing:
 *   - Continue on the Starting XP step doing nothing (dead nextStep handler)
 *   - Freebies letting a character through with no flaws taken
 *   - Predator-type powers rendering TAKE buttons that could never work
 */

const CHARACTER_NAME = "Evelyn Cross"

type SubmitCapture = { submitted: boolean; draftBody: unknown }

async function stubCharacterCreatorApi(page: Page, capture: SubmitCapture) {
    // Signed in, so CreatorPage autosaves rather than sitting in a guest state.
    await page.route("**/api/auth/me", (route) =>
        route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
                id: "111111111111111111",
                username: "e2e-player",
                display_name: "e2e-player",
                is_staff: false,
            }),
        })
    )

    // Ancilla needs a 60-day-old roster character; this player has none, which
    // keeps the run on the neonate path deterministically.
    await page.route("**/api/cc/eligibility", (route) =>
        route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ eligible: false, earliest_approved_at: null }),
        })
    )

    // No banned loresheets, so the Starting XP step renders a stable catalogue.
    await page.route("**/api/cc/restrictions", (route) =>
        route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ loresheets: [] }),
        })
    )

    // Draft create, autosave and submit, all under one pattern.
    //
    // These were two routes, and the create/autosave one matched
    // "**/api/cc/characters*" — which does not match "/api/cc/characters/<id>",
    // because a glob "*" stops at a path separator. Every autosave PUT
    // therefore fell through to the dev server's proxy and a Flask that is not
    // running under this suite, so the only body ever captured was the initial
    // POST. Whether cc_base_attributes appeared in it depended on how far the
    // wizard had got when the 1.5 s debounce first fired: the flake.
    await page.route("**/api/cc/characters**", async (route) => {
        const request = route.request()
        const method = request.method()

        if (new URL(request.url()).pathname.endsWith("/submit")) {
            capture.submitted = true
            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({ id: "draft-1", status: "submitted" }),
            })
            return
        }

        if (method === "POST" || method === "PUT") {
            // The last body seen is the draft as the wizard would have persisted it.
            capture.draftBody = request.postDataJSON()
            await route.fulfill({
                status: method === "POST" ? 201 : 200,
                contentType: "application/json",
                body: JSON.stringify({
                    id: "draft-1",
                    character_name: CHARACTER_NAME,
                    status: "draft",
                    character_data: null,
                }),
            })
            return
        }

        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify([]),
        })
    })
}

test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
        localStorage.clear()
        sessionStorage.clear()
    })
})

test("builds a neonate through every step and submits for review", async ({ page }) => {
    const capture: SubmitCapture = { submitted: false, draftBody: null }
    await stubCharacterCreatorApi(page, capture)

    await page.goto("/create")
    await dismissCookieBanner(page)

    // ── Age category ────────────────────────────────────────────────────────
    // 15 XP budget. Ancilla is disabled by the eligibility stub above.
    await page.getByTestId("age-category-neonate-card").click()

    // ── Clan ────────────────────────────────────────────────────────────────
    await page.getByTestId("clan-brujah-card").click()

    // ── Attributes ──────────────────────────────────────────────────────────
    await pickAttributes(page, ["Strength", "Manipulation", "Dexterity", "Charisma", "Wits"])

    // ── Skills ──────────────────────────────────────────────────────────────
    await page.getByTestId("skill-distribution-balanced-button").click()
    await pickSkills(page, [
        "Athletics", "Brawl", "Intimidation", "Awareness", "Insight",
        "Drive", "Firearms", "Melee", "Stealth", "Persuasion",
        "Streetwise", "Subterfuge", "Investigation", "Occult", "Technology",
    ])
    await page.getByTestId("skill-specialty-confirm-button").click()

    // ── Predator type ───────────────────────────────────────────────────────
    await page.getByTestId("predator-type-sandman-card").click()
    await page.getByTestId("predator-type-confirm-button").click()

    // ── Basics ──────────────────────────────────────────────────────────────
    await page.getByTestId("basic-full-name-input").fill(CHARACTER_NAME)
    await page.getByTestId("basic-sire-input").fill("Mara Voss")
    await page.getByTestId("basic-ambition-input").fill("Break the baron's grip on the city")
    await page.getByTestId("basic-desire-input").fill("Protect tonight's informant")
    await page
        .getByTestId("basic-description-input")
        .fill("A sharp-eyed Brujah courier with a battered leather jacket.")
    await page.getByTestId("basics-confirm-button").click()

    // ── Disciplines ─────────────────────────────────────────────────────────
    // Two dots in Potence, one in Celerity, plus the predator-type dot.
    await takePower(page, "POTENCE", "Lethal Body")
    await takePower(page, "POTENCE", "Prowess")
    await takePower(page, "CELERITY", "Cat's Grace")
    await takePower(page, "AUSPEX", "Heightened Senses")
    await page.getByTestId("disciplines-confirm-button").click()

    // ── Touchstones ─────────────────────────────────────────────────────────
    await page.getByTestId("touchstone-0-name-input").fill("Jonah Reyes")
    await page.getByTestId("touchstone-0-conviction-input").fill("Never abandon the vulnerable")
    await page
        .getByTestId("touchstone-0-description-input")
        .fill("A street medic who still believes Evelyn can help.")
    await page.getByTestId("touchstones-confirm-button").click()

    // ── Freebies ────────────────────────────────────────────────────────────
    // A neonate owes 2 flaw dots. Continue stays disabled until they are taken;
    // this used to be enforced only on the In-Memoriam path.
    const meritsConfirm = page.getByTestId("merits-confirm-button")
    await expect(meritsConfirm).toBeDisabled()
    await takeFlaw(page, "Adversary", 1)
    await takeFlaw(page, "Creepy", 1)
    await expect(meritsConfirm).toBeEnabled()
    await meritsConfirm.click()

    // ── Starting XP ─────────────────────────────────────────────────────────
    const continueButton = page.getByTestId("starting-xp-continue-button")
    await expect(continueButton).toBeVisible()
    await expect(page.getByTestId("starting-xp-loresheets-tab")).toBeVisible()
    // Advancing must actually leave the step. It previously re-selected the
    // step the player was already on, silently.
    await continueButton.click()

    // ── Review & submit ─────────────────────────────────────────────────────
    await expect(page.getByTestId("final-character-name")).toHaveText(CHARACTER_NAME)

    // CreatorPage autosaves on a 1.5s debounce that restarts on every change,
    // so clicking through quickly means no draft exists yet. Final refuses to
    // submit without a draft id ("No draft found..."), which is correct — wait
    // for the autosave the same way a real player implicitly does.
    await expect
        .poll(() => capture.draftBody !== null, { timeout: 15_000 })
        .toBe(true)

    await page.getByTestId("final-submit-button").click()

    await expect.poll(() => capture.submitted, { timeout: 10_000 }).toBe(true)

    const draft = capture.draftBody as { character_data?: Record<string, unknown> } | null
    expect(draft?.character_data).toBeTruthy()
    const data = draft!.character_data as Record<string, unknown>
    expect(data.age_category).toBe("neonate")
    expect(data.clan).toBe("Brujah")
    expect(data.cc_xp_budget).toBe(15)
    // v8 persists the creation-XP baseline so spend survives a reload.
    expect(data.cc_base_attributes).toBeTruthy()
    expect(data.cc_base_skills).toBeTruthy()
})

test("blocks the Freebies step until the flaw budget is spent", async ({ page }) => {
    // Narrower guard on the rule itself, so a regression names the cause
    // instead of failing somewhere later in the long walk above.
    const capture: SubmitCapture = { submitted: false, draftBody: null }
    await stubCharacterCreatorApi(page, capture)

    await page.goto("/create")
    await dismissCookieBanner(page)
    await page.getByTestId("age-category-neonate-card").click()
    await page.getByTestId("clan-brujah-card").click()
    await pickAttributes(page, ["Strength", "Manipulation", "Dexterity", "Charisma", "Wits"])
    await page.getByTestId("skill-distribution-balanced-button").click()
    await pickSkills(page, [
        "Athletics", "Brawl", "Intimidation", "Awareness", "Insight",
        "Drive", "Firearms", "Melee", "Stealth", "Persuasion",
        "Streetwise", "Subterfuge", "Investigation", "Occult", "Technology",
    ])
    await page.getByTestId("skill-specialty-confirm-button").click()
    await page.getByTestId("predator-type-sandman-card").click()
    await page.getByTestId("predator-type-confirm-button").click()
    await page.getByTestId("basic-full-name-input").fill(CHARACTER_NAME)
    await page.getByTestId("basics-confirm-button").click()
    await takePower(page, "POTENCE", "Lethal Body")
    await takePower(page, "POTENCE", "Prowess")
    await takePower(page, "CELERITY", "Cat's Grace")
    await takePower(page, "AUSPEX", "Heightened Senses")
    await page.getByTestId("disciplines-confirm-button").click()
    await page.getByTestId("touchstones-confirm-button").click()

    const meritsConfirm = page.getByTestId("merits-confirm-button")
    await expect(meritsConfirm).toBeDisabled()
    await takeFlaw(page, "Adversary", 1)
    // One of two dots is still short.
    await expect(meritsConfirm).toBeDisabled()
    await takeFlaw(page, "Creepy", 1)
    await expect(meritsConfirm).toBeEnabled()
})

// ── helpers ─────────────────────────────────────────────────────────────────

async function dismissCookieBanner(page: Page) {
    const banner = page.getByTestId("cookie-banner-close")
    if (await banner.isVisible().catch(() => false)) {
        await banner.click()
    }
}

async function pickAttributes(page: Page, names: string[]) {
    for (const name of names) {
        await page.getByTestId(`attribute-${slug(name)}-button`).click()
    }
}

async function pickSkills(page: Page, names: string[]) {
    for (const name of names) {
        await page.getByTestId(`skill-${slug(name)}-button`).click()
    }
}

async function takePower(page: Page, disciplineName: string, powerName: string) {
    const card = powerCard(page, powerName)
    if (!(await card.isVisible().catch(() => false))) {
        await page.getByTestId(`discipline-${slug(disciplineName)}-accordion`).click()
    }
    await card.getByTestId(`take-power-${slug(powerName)}-button`).click()
}

async function takeFlaw(page: Page, flawName: string, level: number) {
    // The flaw catalogue is long and lives in a scroll container, so the
    // button is in the DOM but off-screen until scrolled to.
    const button = page.getByTestId(`flaw-${slug(flawName)}-level-${level}-button`)
    await button.scrollIntoViewIfNeeded()
    await button.click()
}

function powerCard(page: Page, powerName: string): Locator {
    return page.getByTestId(`power-card-${slug(powerName)}`)
}

function slug(name: string) {
    return name.toLowerCase().replace(/\s+/g, "-")
}
