import { useCallback, useEffect, useState } from "react"
import { AppShell, Badge, Button, Group, Text } from "@mantine/core"
import { notifications } from "@mantine/notifications"
import { applyCharacterCompatibilityPatches, characterSchema, type Character } from "~/data/Character"
import CharacterSheet from "~/character_sheet/CharacterSheet"
import { cc } from "~/utils/api"
import { RAW_GOLD, rgba } from "~/theme/colors"

type Props = {
    draftId: string
}

export default function StDraftEditPage({ draftId }: Props) {
    const [character, setCharacterState] = useState<Character | null>(null)
    const [characterName, setCharacterName] = useState("")
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [saving, setSaving] = useState(false)
    const [dirty, setDirty] = useState(false)

    useEffect(() => {
        cc.getDraft(draftId)
            .then((draft) => {
                setCharacterName(draft.character_name || "")
                if (draft.character_data) {
                    const raw = draft.character_data as Record<string, unknown>
                    applyCharacterCompatibilityPatches(raw)
                    setCharacterState(characterSchema.parse(raw))
                }
            })
            .catch((e: Error) => setError(e.message))
            .finally(() => setLoading(false))
    }, [draftId])

    const handleSetCharacter = useCallback((c: Character) => {
        setCharacterState(c)
        setDirty(true)
    }, [])

    const handleSave = async () => {
        if (!character) return
        setSaving(true)
        try {
            await cc.saveDraft(draftId, {
                character_name: character.name || characterName,
                character_data: character,
            })
            setDirty(false)
            notifications.show({ message: "Character saved.", color: "green" })
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : "Save failed."
            notifications.show({ message: msg, color: "red" })
        } finally {
            setSaving(false)
        }
    }

    if (loading) {
        return (
            <div style={{ color: "rgba(244,236,232,0.8)", padding: 40, fontFamily: "Inter, sans-serif" }}>
                Loading draft…
            </div>
        )
    }
    if (error) {
        return (
            <div style={{ color: "#f55", padding: 40, fontFamily: "Inter, sans-serif" }}>
                Error: {error}
            </div>
        )
    }
    if (!character) {
        return (
            <div style={{ color: "rgba(244,236,232,0.8)", padding: 40, fontFamily: "Inter, sans-serif" }}>
                No character data found.
            </div>
        )
    }

    return (
        <AppShell
            padding="0"
            header={{ height: 52 }}
            styles={{
                root: { minHeight: "100vh" },
                header: {
                    background: "rgba(28, 8, 8, 0.95)",
                    backdropFilter: "blur(10px)",
                    WebkitBackdropFilter: "blur(10px)",
                    borderBottom: `1px solid ${rgba(RAW_GOLD, 0.2)}`,
                    zIndex: 200,
                },
                main: { height: "100%" },
            }}
        >
            <AppShell.Header>
                <Group h={52} px={16} justify="space-between" wrap="nowrap">
                    <Group gap={10} wrap="nowrap">
                        <Badge color="red" variant="filled" size="sm" style={{ flexShrink: 0 }}>
                            ST Edit
                        </Badge>
                        <Text
                            size="sm"
                            c="dimmed"
                            style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                        >
                            {characterName || character.name || "Unnamed"}
                        </Text>
                    </Group>
                    <Group gap={8} wrap="nowrap">
                        {dirty && (
                            <Text size="xs" c="yellow.4" style={{ flexShrink: 0 }}>
                                Unsaved changes
                            </Text>
                        )}
                        <Button
                            size="xs"
                            color="green"
                            loading={saving}
                            disabled={!dirty}
                            onClick={handleSave}
                        >
                            Save
                        </Button>
                        <Button
                            component="a"
                            href={`/cc-admin/drafts/${draftId}`}
                            size="xs"
                            variant="outline"
                            color="gray"
                        >
                            ← Review
                        </Button>
                    </Group>
                </Group>
            </AppShell.Header>
            <CharacterSheet character={character} setCharacter={handleSetCharacter} />
        </AppShell>
    )
}
