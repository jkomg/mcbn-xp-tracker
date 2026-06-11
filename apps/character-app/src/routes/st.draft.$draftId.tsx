import { createFileRoute } from "@tanstack/react-router"
import StDraftEditPage from "~/pages/StDraftEditPage"

export const Route = createFileRoute("/st/draft/$draftId")({
    component: StDraftEdit,
})

function StDraftEdit() {
    const { draftId } = Route.useParams()
    return <StDraftEditPage draftId={draftId} />
}
