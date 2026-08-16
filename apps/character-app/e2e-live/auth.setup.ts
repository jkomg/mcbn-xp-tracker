import { expect, test } from "@playwright/test"
import { mkdirSync } from "node:fs"
import { dirname } from "node:path"

/**
 * One-time interactive login. Opens a real browser, waits for you to sign in
 * with Discord, then saves the session for the live specs to reuse.
 *
 * Discord OAuth cannot be driven headlessly — consent screen, possibly 2FA —
 * so this is deliberately manual. Written as a Playwright test rather than a
 * standalone script so it runs through the same TypeScript pipeline as
 * everything else, with no extra dependency.
 *
 *   npm run e2e:live:login
 */

export const STATE_PATH = "e2e-live/.auth/dev.json"

test("capture a signed-in session", async ({ page, context, baseURL }) => {
    test.setTimeout(5 * 60 * 1000)

    console.log(`\nOpening ${baseURL}`)
    console.log("Sign in with Discord in the browser window that just opened.")
    console.log("This waits until the session is live, then saves it.\n")

    await page.goto("/")

    // Poll the auth endpoint rather than waiting on a URL: the OAuth round trip
    // leaves the site entirely and comes back, so URL matching is unreliable.
    await expect
        .poll(
            async () => {
                try {
                    const response = await page.request.get("/api/auth/me")
                    return response.ok()
                } catch {
                    return false
                }
            },
            {
                timeout: 5 * 60 * 1000,
                intervals: [2000],
                message: "Timed out waiting for a signed-in session. Nothing was saved.",
            }
        )
        .toBe(true)

    const user = await (await page.request.get("/api/auth/me")).json()
    console.log(`Signed in as ${user.display_name || user.username}.`)

    mkdirSync(dirname(STATE_PATH), { recursive: true })
    await context.storageState({ path: STATE_PATH })
    console.log(`Session saved to ${STATE_PATH} (gitignored). Now run: npm run e2e:live\n`)
})
