import { createFileRoute, redirect } from "@tanstack/react-router"

// Flask handles the Discord OAuth callback and redirects back — this route is unused.
export const Route = createFileRoute("/auth/callback")({
    beforeLoad: () => {
        throw redirect({ to: "/" })
    },
    component: () => null
})
