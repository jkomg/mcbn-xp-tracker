import { ScrollArea, Stack, Text, Title } from "@mantine/core"
import { useState } from "react"
import { RAW_RED, rgba } from "~/theme/colors"
import { Character } from "~/data/Character"
import {
    generatorScrollableAreaStyle,
    generatorScrollableContentStyle,
    generatorScrollableShellStyle,
} from "./sharedGeneratorScrollableLayout"
import { nightfallScrollAreaStyles, nightfallScrollbarSize } from "./sharedScrollAreaStyles"

type GenerationPickerIMProps = {
    character: Character
    setCharacter: (character: Character) => void
    nextStep: (characterOverride?: Character) => void
}

const FONT_DISPLAY = "Cinzel, Georgia, serif"
const FONT_BODY = "Crimson Text, Georgia, serif"
const FONT_UI = "Inter, Segoe UI, sans-serif"
const C_FG = "rgba(244, 236, 232, 0.95)"
const C_MUTED = "rgba(220, 210, 205, 0.6)"
const C_DIM = "rgba(180, 170, 165, 0.4)"
const C_CARD = "rgba(26, 20, 24, 0.88)"
const C_CARD_HOVER = "rgba(38, 28, 34, 0.96)"
const C_BORDER = "rgba(125, 91, 72, 0.35)"
const C_BORDER_HOVER = rgba(RAW_RED, 0.5)
const C_BORDER_SELECTED = rgba(RAW_RED, 0.85)
const C_RED = rgba(RAW_RED, 1)
const C_RED_GLOW = `0 0 18px ${rgba(RAW_RED, 0.28)}`

type GenerationOption = {
    id: "12" | "11-10" | "9-8"
    label: string
    bloodPotency: number
    advantages: string
    flaws: string
    note: string
}

const GENERATION_OPTIONS: GenerationOption[] = [
    {
        id: "12",
        label: "12th Generation",
        bloodPotency: 1,
        advantages: "8 Advantage dots · 12 XP to spend on Skills",
        flaws: "None required",
        note: "Weaker Blood, but strong mortal connections and acumen.",
    },
    {
        id: "11-10",
        label: "11th or 10th Generation",
        bloodPotency: 2,
        advantages: "8 Advantage dots",
        flaws: "3 Starting Flaw dots",
        note: "The typical ancilla — a cut above neonates, but years of unlife have left their mark.",
    },
    {
        id: "9-8",
        label: "9th or 8th Generation",
        bloodPotency: 3,
        advantages: "None (or 2 dots by sacrificing 1 Humanity)",
        flaws: "5 Starting Flaw dots",
        note: "Near-elder potency. Power doesn't come cheap — your history is haunted by tragedy.",
    },
]

export default function GenerationPickerIM({
    character,
    setCharacter,
    nextStep,
}: GenerationPickerIMProps) {
    const currentId = character.im_generation ?? ""
    const [humanitySacrifice, setHumanitySacrifice] = useState<boolean>(
        character.in_memoriam?.humanity_sacrifice ?? false
    )

    const handleSacrificeToggle = (checked: boolean) => {
        setHumanitySacrifice(checked)
        if (character.in_memoriam) {
            setCharacter({
                ...character,
                in_memoriam: { ...character.in_memoriam, humanity_sacrifice: checked },
            })
        }
    }

    const handlePick = (option: GenerationOption) => {
        const updated: Character = {
            ...character,
            bloodPotency: option.bloodPotency,
            generation: parseInt(option.id.split("-")[0], 10),
            im_generation: option.id,
            // Only clear sacrifice when switching away from 9-8
            in_memoriam: character.in_memoriam
                ? {
                      ...character.in_memoriam,
                      humanity_sacrifice:
                          option.id === "9-8"
                              ? character.in_memoriam.humanity_sacrifice
                              : false,
                  }
                : character.in_memoriam,
        }
        setCharacter(updated)
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
                                Generation
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
                            How many steps removed from Caine is your Blood? Age and generation are
                            not equal — choose based on your character's history and your
                            Storyteller's guidance.
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
                        {GENERATION_OPTIONS.map((option) => {
                            const selected = currentId === option.id
                            return (
                                <button
                                    key={option.id}
                                    onClick={() => handlePick(option)}
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
                                    {/* Left: labels */}
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <p
                                            style={{
                                                margin: "0 0 8px 0",
                                                fontFamily: FONT_DISPLAY,
                                                fontSize: "1rem",
                                                fontWeight: 600,
                                                letterSpacing: "0.06em",
                                                color: C_FG,
                                            }}
                                        >
                                            {option.label}
                                        </p>
                                        <div
                                            style={{
                                                display: "flex",
                                                flexDirection: "column",
                                                gap: 3,
                                                marginBottom: 8,
                                            }}
                                        >
                                            <p
                                                style={{
                                                    margin: 0,
                                                    fontFamily: FONT_UI,
                                                    fontSize: "0.8rem",
                                                    color: "rgba(100, 200, 130, 0.75)",
                                                }}
                                            >
                                                ↑ {option.advantages}
                                            </p>
                                            <p
                                                style={{
                                                    margin: 0,
                                                    fontFamily: FONT_UI,
                                                    fontSize: "0.8rem",
                                                    color:
                                                        option.flaws === "None required"
                                                            ? C_DIM
                                                            : rgba(RAW_RED, 0.65),
                                                }}
                                            >
                                                {option.flaws === "None required" ? "—" : "↓"}{" "}
                                                {option.flaws}
                                            </p>
                                        </div>
                                        <p
                                            style={{
                                                margin: 0,
                                                fontFamily: FONT_BODY,
                                                fontSize: "0.88rem",
                                                color: C_DIM,
                                                lineHeight: 1.5,
                                                fontStyle: "italic",
                                            }}
                                        >
                                            {option.note}
                                        </p>
                                    </div>

                                    {/* Right: BP badge */}
                                    <div
                                        style={{
                                            flexShrink: 0,
                                            textAlign: "center",
                                            padding: "10px 16px",
                                            borderRadius: 8,
                                            border: `1px solid ${rgba(RAW_RED, 0.3)}`,
                                            background: rgba(RAW_RED, 0.08),
                                        }}
                                    >
                                        <p
                                            style={{
                                                margin: 0,
                                                fontFamily: FONT_DISPLAY,
                                                fontSize: "1.5rem",
                                                fontWeight: 700,
                                                color: C_RED,
                                                lineHeight: 1,
                                            }}
                                        >
                                            {option.bloodPotency}
                                        </p>
                                        <p
                                            style={{
                                                margin: "4px 0 0 0",
                                                fontFamily: FONT_UI,
                                                fontSize: 8,
                                                letterSpacing: "0.12em",
                                                textTransform: "uppercase",
                                                color: rgba(RAW_RED, 0.5),
                                                whiteSpace: "nowrap",
                                            }}
                                        >
                                            Blood Potency
                                        </p>
                                    </div>
                                </button>
                            )
                        })}
                    </div>
                    {/* Humanity sacrifice — 9th/8th only */}
                    {currentId === "9-8" && (
                        <div
                            style={{
                                marginTop: 20,
                                maxWidth: 680,
                                margin: "20px auto 0",
                                padding: "16px 20px",
                                borderRadius: 10,
                                border: `1px solid ${humanitySacrifice ? rgba(RAW_RED, 0.5) : C_BORDER}`,
                                background: humanitySacrifice ? "rgba(45, 18, 22, 0.7)" : C_CARD,
                            }}
                        >
                            <label
                                style={{ display: "flex", alignItems: "flex-start", gap: 14, cursor: "pointer" }}
                            >
                                <input
                                    type="checkbox"
                                    checked={humanitySacrifice}
                                    onChange={(e) => handleSacrificeToggle(e.target.checked)}
                                    style={{ width: 18, height: 18, marginTop: 2, cursor: "pointer", accentColor: rgba(RAW_RED, 0.9), flexShrink: 0 }}
                                />
                                <div>
                                    <p style={{ margin: "0 0 4px 0", fontFamily: FONT_DISPLAY, fontSize: "0.9rem", fontWeight: 600, color: humanitySacrifice ? rgba(RAW_RED, 0.9) : C_FG }}>
                                        Sacrifice 1 Humanity for 2 Background Advantage dots
                                    </p>
                                    <p style={{ margin: 0, fontFamily: FONT_UI, fontSize: "0.8rem", color: C_MUTED, lineHeight: 1.5 }}>
                                        Voluntarily reduce your starting Humanity by 1 in exchange for 2 additional Background Advantage dots in the Freebies step.
                                        {humanitySacrifice && (
                                            <span style={{ color: rgba(RAW_RED, 0.7), display: "block", marginTop: 4 }}>
                                                −1 Humanity · +2 Background dots added to your Freebies budget
                                            </span>
                                        )}
                                    </p>
                                </div>
                            </label>
                        </div>
                    )}

                    {/* Continue button — only shown once a generation is picked */}
                    {currentId && (
                        <div
                            style={{
                                display: "flex",
                                justifyContent: "flex-end",
                                maxWidth: 680,
                                margin: "20px auto 0",
                            }}
                        >
                            <button
                                onClick={() => nextStep()}
                                style={{
                                    padding: "11px 30px",
                                    borderRadius: 8,
                                    border: `1px solid ${C_BORDER_SELECTED}`,
                                    background: rgba(RAW_RED, 0.15),
                                    color: C_FG,
                                    fontFamily: FONT_UI,
                                    fontSize: "0.95rem",
                                    fontWeight: 600,
                                    cursor: "pointer",
                                    letterSpacing: "0.04em",
                                    transition: "background 150ms ease, border-color 150ms ease",
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.background = rgba(RAW_RED, 0.28)
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.background = rgba(RAW_RED, 0.15)
                                }}
                            >
                                Continue →
                            </button>
                        </div>
                    )}
                </div>
            </ScrollArea>
        </div>
    )
}
