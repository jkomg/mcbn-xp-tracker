import { expect, type Locator, type Page } from "@playwright/test"

/**
 * Steps through the character-creation wizard. Shared by the hermetic spec
 * (e2e/) and the live spec (e2e-live/) so a changed testid breaks both at once
 * rather than letting the unexercised one rot.
 */

export const NEONATE_ATTRIBUTES = ["Strength", "Manipulation", "Dexterity", "Charisma", "Wits"]

export const NEONATE_SKILLS = [
    "Athletics", "Brawl", "Intimidation", "Awareness", "Insight",
    "Drive", "Firearms", "Melee", "Stealth", "Persuasion",
    "Streetwise", "Subterfuge", "Investigation", "Occult", "Technology",
]

/** A complete neonate Brujah, from the age-category step to Starting XP. */
export async function walkNeonateToStartingXp(page: Page, characterName: string) {
    await page.getByTestId("age-category-neonate-card").click()
    await page.getByTestId("clan-brujah-card").click()
    await pickAttributes(page, NEONATE_ATTRIBUTES)
    await page.getByTestId("skill-distribution-balanced-button").click()
    await pickSkills(page, NEONATE_SKILLS)
    await page.getByTestId("skill-specialty-confirm-button").click()
    await page.getByTestId("predator-type-sandman-card").click()
    await page.getByTestId("predator-type-confirm-button").click()
    await page.getByTestId("basic-full-name-input").fill(characterName)
    await page.getByTestId("basic-sire-input").fill("Mara Voss")
    await page.getByTestId("basic-ambition-input").fill("Break the baron's grip on the city")
    await page.getByTestId("basic-desire-input").fill("Protect tonight's informant")
    await page
        .getByTestId("basic-description-input")
        .fill("A sharp-eyed Brujah courier with a battered leather jacket.")
    await page.getByTestId("basics-confirm-button").click()
    await takePower(page, "POTENCE", "Lethal Body")
    await takePower(page, "POTENCE", "Prowess")
    await takePower(page, "CELERITY", "Cat's Grace")
    await takePower(page, "AUSPEX", "Heightened Senses")
    await page.getByTestId("disciplines-confirm-button").click()
    await page.getByTestId("touchstone-0-name-input").fill("Jonah Reyes")
    await page.getByTestId("touchstone-0-conviction-input").fill("Never abandon the vulnerable")
    await page
        .getByTestId("touchstone-0-description-input")
        .fill("A street medic who still believes in the character.")
    await page.getByTestId("touchstones-confirm-button").click()
    await takeFlaw(page, "Adversary", 1)
    await takeFlaw(page, "Creepy", 1)
    await page.getByTestId("merits-confirm-button").click()
    await expect(page.getByTestId("starting-xp-continue-button")).toBeVisible()
}

export async function dismissCookieBanner(page: Page) {
    const banner = page.getByTestId("cookie-banner-close")
    if (await banner.isVisible().catch(() => false)) {
        await banner.click()
    }
}

export async function pickAttributes(page: Page, names: string[]) {
    for (const name of names) {
        await page.getByTestId(`attribute-${slug(name)}-button`).click()
    }
}

export async function pickSkills(page: Page, names: string[]) {
    for (const name of names) {
        await page.getByTestId(`skill-${slug(name)}-button`).click()
    }
}

export async function takePower(page: Page, disciplineName: string, powerName: string) {
    const card = powerCard(page, powerName)
    if (!(await card.isVisible().catch(() => false))) {
        await page.getByTestId(`discipline-${slug(disciplineName)}-accordion`).click()
    }
    await card.getByTestId(`take-power-${slug(powerName)}-button`).click()
}

export async function takeFlaw(page: Page, flawName: string, level: number) {
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
