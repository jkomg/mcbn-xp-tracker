import { ScrollArea, Stack, Text, Title } from "@mantine/core"
import { RAW_RED, rgba } from "~/theme/colors"
import { Character } from "~/data/Character"
import {
    generatorScrollableAreaStyle,
    generatorScrollableContentStyle,
    generatorScrollableShellStyle,
} from "./sharedGeneratorScrollableLayout"
import { nightfallScrollAreaStyles, nightfallScrollbarSize } from "./sharedScrollAreaStyles"

type AncillaModePickerProps = {
    character: Character
    setCharacter: (character: Character) => void
    nextStep: (characterOverride?: Character) => void
}

const FONT_DISPLAY = "Cinzel, Georgia, serif"
const FONT_BODY = "Crimson Text, Georgia, serif"
const FONT_UI = "Inter, Segoe UI, sans-serif"
const C_FG = "rgba(244, 236, 232, 0.95)"
const C_MUTED = "rgba(220, 210, 205, 0.6)"
const C_CARD = "rgba(26, 20, 24, 0.88)"
const C_CARD_HOVER = "rgba(38, 28, 34, 0.96)"
const C_BORDER = "rgba(125, 91, 72, 0.35)"
const C_BORDER_HOVER = rgba(RAW_RED, 0.5)
const C_BORDER_SELECTED = rgba(RAW_RED, 0.85)
const C_RED = rgba(RAW_RED, 1)
const C_RED_GLOW = `0 0 18px ${rgba(RAW_RED, 0.28)}`
const C_GOLD = "rgba(195, 155, 90, 0.85)"

type Mode = {
    id: "standard" | "in_memoriam"
    label: string
    badge: string
    description: string
    detail: string
}

const MODES: Mode[] = [
    {
        id: "standard",
        label: "Standard Ancilla",
        badge: "35 XP",
        description:
            "Use the default V5 ancilla creation rules: 35 bonus XP, −1 Humanity, +2 Advantages, +2 Flaws, Blood Potency 2.",
        detail: "Faster creation. Disciplines follow standard rules (2+1).",
    },
    {
        id: "in_memoriam",
        label: "In Memoriam",
        badge: "Oceans of Time",
        description:
            "Follow your Kindred through the centuries using the In Memoriam sourcebook rules. Your XP comes from the eras you survived.",
        detail:
            "More detailed creation. Expanded Discipline spreads. Choose 3–5 eras from the Oceans of Time table.",
    },
]

export default function AncillaModePicker({
    character,
    setCharacter,
    nextStep,
}: AncillaModePickerProps) {
    const currentMode = character.in_memoriam
        ? character.in_memoriam.use_standard
            ? "standard"
            : "in_memoriam"
        : null

    const handlePick = (mode: Mode) => {
        const isStandard = mode.id === "standard"
        const updated: Character = {
            ...character,
            cc_xp_budget: isStandard ? 35 : 0,
            bloodPotency: isStandard ? 2 : 0,
            im_generation: isStandard ? "" : character.im_generation,
            im_discipline_spread: isStandard ? "" : character.im_discipline_spread,
            in_memoriam: {
                use_standard: isStandard,
                embrace_age: "",
                eras: [],
                total_xp: 0,
                total_humanity_loss: 0,
            },
        }
        setCharacter(updated)
        nextStep(updated)
    }

    return (
        <div style={generatorScrollableShellStyle}>
            <ScrollArea
                style={generatorScrollableAreaStyle}
                w="100%"
                px={20}
                pt={4}
                pb={8}
                scrollbarSize={nightfallScrollbarSize}
                type="always"
                styles={nightfallScrollAreaStyles}
            >
                <div style={generatorScrollableContentStyle}>
                    <Stack gap={4} align="center" mb={26}>
                        <Title
                            order={2}
                            ta="center"
                            style={{
                                fontFamily: FONT_DISPLAY,
                                fontWeight: 600,
                                letterSpacing: "0.05em",
                                color: C_FG,
                            }}
                        >
                            Choose your{" "}
                            <Text
                                component="strong"
                                inherit
                                c="red.5"
                                style={{ textShadow: C_RED_GLOW }}
                            >
                                Creation Path
                            </Text>
                        </Title>
                        <Text
                            ta="center"
                            maw={560}
                            style={{
                                fontFamily: FONT_BODY,
                                fontSize: "1.1rem",
                                color: C_MUTED,
                            }}
                        >
                            Ancilla can be created using the standard V5 rules or the detailed
                            In Memoriam sourcebook system.
                        </Text>
                    </Stack>

                    <div
                        style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 12,
                            maxWidth: 680,
                            margin: "0 auto",
                            width: "100%",
                        }}
                    >
                        {MODES.map((mode) => {
                            const selected = currentMode === mode.id
                            return (
                                <button
                                    key={mode.id}
                                    onClick={() => handlePick(mode)}
                                    style={{
                                        display: "flex",
                                        alignItems: "flex-start",
                                        gap: 20,
                                        padding: "20px 22px",
                                        borderRadius: 10,
                                        border: `1px solid ${selected ? C_BORDER_SELECTED : C_BORDER}`,
                                        background: selected ? "rgba(45, 28, 34, 0.92)" : C_CARD,
                                        cursor: "pointer",
                                        textAlign: "left",
                                        width: "100%",
                                        fontFamily: "inherit",
                                        boxShadow: selected ? C_RED_GLOW : "none",
                                        transition:
                                            "border-color 200ms ease, background 200ms ease, box-shadow 200ms ease",
                                    }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.borderColor = C_BORDER_HOVER
                                        e.currentTarget.style.background = C_CARD_HOVER
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.borderColor = selected
                                            ? C_BORDER_SELECTED
                                            : C_BORDER
                                        e.currentTarget.style.background = selected
                                            ? "rgba(45, 28, 34, 0.92)"
                                            : C_CARD
                                    }}
                                >
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div
                                            style={{
                                                display: "flex",
                                                alignItems: "center",
                                                gap: 10,
                                                marginBottom: 6,
                                            }}
                                        >
                                            <p
                                                style={{
                                                    margin: 0,
                                                    fontFamily: FONT_DISPLAY,
                                                    fontSize: "1rem",
                                                    fontWeight: 600,
                                                    letterSpacing: "0.06em",
                                                    color: C_FG,
                                                }}
                                            >
                                                {mode.label}
                                            </p>
                                            <span
                                                style={{
                                                    fontFamily: FONT_UI,
                                                    fontSize: 10,
                                                    fontWeight: 500,
                                                    letterSpacing: "0.1em",
                                                    textTransform: "uppercase",
                                                    color: mode.id === "in_memoriam" ? C_RED : C_GOLD,
                                                    border: `1px solid ${mode.id === "in_memoriam" ? rgba(RAW_RED, 0.4) : "rgba(195, 155, 90, 0.4)"}`,
                                                    borderRadius: 4,
                                                    padding: "2px 7px",
                                                }}
                                            >
                                                {mode.badge}
                                            </span>
                                        </div>
                                        <p
                                            style={{
                                                margin: "0 0 6px 0",
                                                fontFamily: FONT_BODY,
                                                fontSize: "0.95rem",
                                                color: C_MUTED,
                                                lineHeight: 1.5,
                                            }}
                                        >
                                            {mode.description}
                                        </p>
                                        <p
                                            style={{
                                                margin: 0,
                                                fontFamily: FONT_UI,
                                                fontSize: "0.78rem",
                                                color: "rgba(180, 165, 155, 0.5)",
                                                lineHeight: 1.4,
                                            }}
                                        >
                                            {mode.detail}
                                        </p>
                                    </div>
                                </button>
                            )
                        })}
                    </div>
                </div>
            </ScrollArea>
        </div>
    )
}
