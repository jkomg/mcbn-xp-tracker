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
        isolate: false,
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
            "~contract": resolve(__dirname, "../../packages/api-contract")
        }
    }
})
