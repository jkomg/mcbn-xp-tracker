import { defineConfig, devices } from "@playwright/test"
import { existsSync } from "node:fs"

/**
 * Playwright config for specs that drive a REAL deployment.
 *
 * Separate from playwright.config.ts on purpose: that one is hermetic, starts
 * its own Vite server, stubs every API call, and runs in CI. This one talks to
 * a running site with a real Discord session and a real database, needs
 * credentials, and mutates shared state — so it is never wired into CI.
 *
 * See e2e-live/README.md.
 */

const DEFAULT_BASE_URL = "https://dev.mcbn.jkomg.us"
const baseURL = process.env.LIVE_BASE_URL ?? DEFAULT_BASE_URL

// Fail closed. Production is not a test target, and these specs submit
// character drafts. An unrecognised host is refused rather than assumed safe,
// so a typo or a copied env var cannot quietly point this at prod.
const AUTH_STATE = "e2e-live/.auth/dev.json"

const ALLOWED_HOSTS = new Set(["dev.mcbn.jkomg.us", "127.0.0.1", "localhost"])
const host = new URL(baseURL).hostname
if (!ALLOWED_HOSTS.has(host)) {
    throw new Error(
        `Refusing to run live e2e against "${host}". These specs create characters and ` +
            `submit drafts. Allowed hosts: ${[...ALLOWED_HOSTS].join(", ")}. ` +
            `Set LIVE_BASE_URL to a dev or local address.`
    )
}

export default defineConfig({
    testDir: "./e2e-live",
    // Shared environment: parallel runs would race each other's drafts.
    fullyParallel: false,
    workers: 1,
    // A real deployment is slower than a local dev server, and dev on Cloud Run
    // scales to zero — the first request after an idle period pays a cold start.
    timeout: 120_000,
    expect: { timeout: 20_000 },
    retries: 0,
    reporter: "list",
    use: {
        baseURL,
        trace: "retain-on-failure",
        screenshot: "only-on-failure",
        video: "retain-on-failure",
    },
    projects: [
        {
            // Interactive: opens a browser and waits for a Discord sign-in.
            // Run explicitly via `npm run e2e:live:login`, not as a dependency
            // of the specs — otherwise every run would demand a login.
            name: "login",
            testMatch: /auth\.setup\.ts/,
        },
        {
            name: "chromium",
            testIgnore: /auth\.setup\.ts/,
            use: {
                ...devices["Desktop Chrome"],
                // Applied only when a session has been captured. Playwright
                // errors at context creation on a missing storageState file,
                // which would bury the actual problem ("you have not logged
                // in") under a file-not-found stack trace.
                ...(existsSync(AUTH_STATE) ? { storageState: AUTH_STATE } : {}),
            },
        },
    ],
})
