import { createFileRoute } from "@tanstack/react-router"
import RenderProfiler from "~/components/RenderProfiler"
import CreatorPage from "~/pages/CreatorPage"

export const Route = createFileRoute("/player/new")({
    component: PlayerNew
})

function PlayerNew() {
    return (
        <RenderProfiler id="CreatorPage">
            <CreatorPage />
        </RenderProfiler>
    )
}
