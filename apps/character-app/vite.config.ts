import { defineConfig, Plugin } from "vite"
import react from "@vitejs/plugin-react"
import * as fs from "fs"
import * as path from "path"

process.env.DOTENV_CONFIG_QUIET ??= "true"

// Emits loresheet-catalog.json to the build output so Flask's CC admin
// can read it without needing access to the TypeScript source.
function loresheetCatalogPlugin(): Plugin {
    return {
        name: "loresheet-catalog",
        closeBundle() {
            const tsPath = path.resolve(__dirname, "src/data/Loresheets.ts")
            const outPath = path.resolve(__dirname, "../web/app/static/character-app/loresheet-catalog.json")
            try {
                const src = fs.readFileSync(tsPath, "utf8")
                const pattern = /\{\s*\n\s+id:\s*"([^"]+)",\s*\n\s+name:\s*"([^"]+)",\s*\n\s+source:\s*"([^"]+)"/g
                const entries: { id: string; name: string; source: string }[] = []
                let m: RegExpExecArray | null
                while ((m = pattern.exec(src)) !== null) {
                    entries.push({ id: m[1], name: m[2], source: m[3] })
                }
                fs.mkdirSync(path.dirname(outPath), { recursive: true })
                fs.writeFileSync(outPath, JSON.stringify(entries, null, 2))
                console.log(`[loresheet-catalog] Wrote ${entries.length} entries to loresheet-catalog.json`)
            } catch (e) {
                console.warn("[loresheet-catalog] Failed to generate catalog:", e)
            }
        }
    }
}

export default defineConfig({
    build: {
        outDir: "../web/app/static/character-app",
        sourcemap: true,
        rollupOptions: {
            external: []
        }
    },
    server: {
        port: 3000,
        strictPort: true,
        proxy: {
            "/api": {
                target: "http://127.0.0.1:5001",
                changeOrigin: true,
                ws: true,
                configure: (proxy, _options) => {
                    proxy.on("proxyReq", (proxyReq, req, _res) => {
                        // Forward cookies from the original request
                        if (req.headers.cookie) {
                            proxyReq.setHeader("Cookie", req.headers.cookie)
                        }
                    })
                }
            },
            "/login": { target: "http://127.0.0.1:5001", changeOrigin: true },
            "/logout": { target: "http://127.0.0.1:5001", changeOrigin: true },
            "/auth": { target: "http://127.0.0.1:5001", changeOrigin: true },
        }
    },
    plugins: [
        react({
            jsxImportSource: "@emotion/react",
            babel: {
                plugins: ["@emotion/babel-plugin"]
            }
        }),
        loresheetCatalogPlugin(),
    ],
    base: "/static/character-app/",
    resolve: {
        alias: {
            "~": path.resolve(__dirname, "src"),
            // Shared rule tables, read by the web app and bot too. Aliased so
            // the creator consumes the same file rather than keeping its own
            // copy of chronicle rules that can drift out of sync.
            "~rules": path.resolve(__dirname, "../../packages/rules"),
            "~contract": path.resolve(__dirname, "../../packages/api-contract"),
            "posthog-js/react": path.resolve(__dirname, "src/stubs/posthog-react-stub.tsx"),
            "posthog-js": path.resolve(__dirname, "src/stubs/posthog-stub.ts"),
            "react-ga4": path.resolve(__dirname, "src/stubs/react-ga4-stub.ts")
        }
    }
})
