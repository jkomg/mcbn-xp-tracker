// No-op posthog-js/react stub
import type { ReactNode } from "react"

export const PostHogProvider = ({ children }: { children: ReactNode; apiKey?: string; options?: unknown }) =>
    children as React.ReactElement
