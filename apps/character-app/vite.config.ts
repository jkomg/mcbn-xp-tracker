import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"

import * as path from "path"

process.env.DOTENV_CONFIG_QUIET ??= "true"

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
        })
    ],
    base: "/static/character-app/",
    resolve: {
        alias: {
            "~": path.resolve(__dirname, "src"),
            "posthog-js/react": path.resolve(__dirname, "src/stubs/posthog-react-stub.tsx"),
            "posthog-js": path.resolve(__dirname, "src/stubs/posthog-stub.ts"),
            "react-ga4": path.resolve(__dirname, "src/stubs/react-ga4-stub.ts")
        }
    }
})
