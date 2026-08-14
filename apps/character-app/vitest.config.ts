import { configDefaults, defineConfig } from "vitest/config"
import react from "@vitejs/plugin-react"
import { resolve } from "path"

export default defineConfig({
    plugins: [
        react({
            jsxImportSource: "@emotion/react",
            babel: {
                plugins: ["@emotion/babel-plugin"]
            }
        })
    ],
    test: {
        environment: "jsdom",
        exclude: [...configDefaults.exclude, "e2e/**"],
        globals: true,
        pool: "threads",
        poolOptions: {
            threads: {
                singleThread: false,
                minThreads: 1,
                maxThreads: 2
            }
        },
        // Was false. Several test files assign shared globals at module scope
        // (pdfCreator.test.ts and downloadConversion.test.ts both set
        // global.fetch — one to a working mock, one to a bare vi.fn() that
        // resolves undefined). Without isolation they share an environment and
        // clobber each other, so pdfCreator failed roughly one run in eight
        // with "Cannot read properties of undefined (reading 'getForm')" —
        // initPDFDocument swallows the real error in its try/catch blocks and
        // returns undefined, surfacing the failure far from its cause. That
        // was the intermittent failure seen before this suite gated CI.
        isolate: true,
        sequence: {
            shuffle: false
        },
        setupFiles: ["./src/setupTests.ts"],
        testTimeout: 10000,
        hookTimeout: 10000
    },
    resolve: {
        alias: {
            "~": resolve(__dirname, "./src"),
            // Keep in step with vite.config.ts — shared rule tables live in
            // packages/ and are consumed by the web app and bot as well.
            "~rules": resolve(__dirname, "../../packages/rules"),
            "~contract": resolve(__dirname, "../../packages/api-contract"),
            // Analytics stubs. vite.config.ts aliases these away at build time
            // ("analytics removed for MCbN integration"), but this config did
            // not — so importing ANY component that pulls in react-ga4 or
            // posthog-js failed to resolve under vitest. That is a large part
            // of why there are no component tests in this app: the test runner
            // could not load a component at all.
            "posthog-js/react": resolve(__dirname, "./src/stubs/posthog-react-stub.tsx"),
            "posthog-js": resolve(__dirname, "./src/stubs/posthog-stub.ts"),
            "react-ga4": resolve(__dirname, "./src/stubs/react-ga4-stub.ts")
        }
    }
})
