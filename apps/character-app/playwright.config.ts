import { defineConfig, devices } from "@playwright/test"

export default defineConfig({
    testDir: "./e2e",
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: process.env.CI ? 1 : undefined,
    reporter: process.env.CI ? "github" : "list",
    use: {
        baseURL: "http://127.0.0.1:3000",
        trace: "on-first-retry",
        screenshot: "only-on-failure",
        video: "retain-on-failure"
    },
    webServer: {
        // --base=/ overrides vite.config.ts's "/static/character-app/", which
        // exists so the built bundle can be served from Flask's static mount.
        // The router is created without a basepath (routes are absolute, e.g.
        // "/create"), and in production Flask serves index.html at a matching
        // URL. Under the dev server's base the router matches nothing and
        // renders Not Found — which is what the previous spec silently hit.
        command: "node ./node_modules/vite/bin/vite.js --host 127.0.0.1 --base=/",
        url: "http://127.0.0.1:3000",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000
    },
    projects: [
        {
            name: "chromium",
            use: { ...devices["Desktop Chrome"] }
        }
    ]
})
