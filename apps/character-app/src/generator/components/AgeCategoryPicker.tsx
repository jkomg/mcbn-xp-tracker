import { ScrollArea, Stack, Text, Title, Tooltip } from "@mantine/core"
import { useEffect, useState } from "react"
import { RAW_RED, rgba } from "~/theme/colors"
import { Character } from "~/data/Character"
import { cc, type EligibilityResult } from "~/utils/api"
import {
    generatorScrollableAreaStyle,
    generatorScrollableContentStyle,
    generatorScrollableShellStyle,
} from "./sharedGeneratorScrollableLayout"
import { nightfallScrollAreaStyles, nightfallScrollbarSize } from "./sharedScrollAreaStyles"

type AgeCategoryPickerProps = {
    character: Character
    setCharacter: (character: Character) => void
    nextStep: () => void
}

type AgeCategory = {
    id: "mortal" | "fledgling" | "ghoul" | "neonate" | "ancilla"
    label: string
    description: string
    xpBudget: number
    xpLabel: string
    requiresEligibility: boolean
}

const AGE_CATEGORIES: AgeCategory[] = [
    {
        id: "mortal",
        label: "Mortal",
        description:
            "Not yet embraced. You are still human, learning the edges of the night before your transformation.",
        xpBudget: 0,
        xpLabel: "Standard creation",
        requiresEligibility: false,
    },
    {
        id: "fledgling",
        label: "Fledgling",
        description:
            "Newly embraced and still under your sire's wing. The Requiem is terrifyingly new.",
        xpBudget: 0,
        xpLabel: "Standard creation",
        requiresEligibility: false,
    },
    {
        id: "ghoul",
        label: "Ghoul",
        description:
            "Bound to a Kindred through blood — gifted with vitae, denied the Embrace. Neither mortal nor vampire.",
        xpBudget: 0,
        xpLabel: "Standard creation",
        requiresEligibility: false,
    },
    {
        id: "neonate",
        label: "Neonate",
        description:
            "Acknowledged and released from your sire. You have footing in Kindred society, and the XP to prove it.",
        xpBudget: 15,
        xpLabel: "15 XP to spend",
        requiresEligibility: false,
    },
    {
        id: "ancilla",
        label: "Ancilla",
        description:
            "A decade or more of Requiem behind you. Established, capable — and marked by the weight of years. Requires 2+ months on-server.",
        xpBudget: 35,
        xpLabel: "35 XP to spend",
        requiresEligibility: true,
    },
]

const XP_BUDGETS: Record<string, number> = {
    mortal: 0,
    fledgling: 0,
    ghoul: 0,
    neonate: 15,
    ancilla: 35,
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
const C_RED_DIM = rgba(RAW_RED, 0.45)
const C_RED_GLOW = `0 0 18px ${rgba(RAW_RED, 0.28)}`
const C_GOLD = "rgba(195, 155, 90, 0.85)"
const C_DISABLED = "rgba(180, 170, 165, 0.3)"
const C_DISABLED_BORDER = "rgba(125, 91, 72, 0.18)"

export default function AgeCategoryPicker({
    character,
    setCharacter,
    nextStep,
}: AgeCategoryPickerProps) {
    const [eligibility, setEligibility] = useState<EligibilityResult | null>(null)
    const [eligibilityLoading, setEligibilityLoading] = useState(true)

    useEffect(() => {
        cc.getEligibility()
            .then(setEligibility)
            .catch(() => setEligibility({ eligible: false, earliest_approved_at: null }))
            .finally(() => setEligibilityLoading(false))
    }, [])

    const handlePick = (cat: AgeCategory) => {
        if (cat.requiresEligibility && !eligibility?.eligible) return
        setCharacter({
            ...character,
            age_category: cat.id,
            cc_xp_budget: XP_BUDGETS[cat.id] ?? 0,
        })
        nextStep()
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
                                Age Category
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
                            Your age defines your starting resources, XP budget, and the shape of
                            your Requiem.
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
                        {AGE_CATEGORIES.map((cat) => {
                            const selected = character.age_category === cat.id
                            const ineligible =
                                cat.requiresEligibility &&
                                !eligibilityLoading &&
                                !eligibility?.eligible

                            const card = (
                                <button
                                    key={cat.id}
                                    onClick={() => handlePick(cat)}
                                    disabled={ineligible}
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 20,
                                        padding: "18px 22px",
                                        borderRadius: 10,
                                        border: `1px solid ${
                                            selected
                                                ? C_BORDER_SELECTED
                                                : ineligible
                                                  ? C_DISABLED_BORDER
                                                  : C_BORDER
                                        }`,
                                        background: ineligible
                                            ? "rgba(20, 16, 18, 0.55)"
                                            : selected
                                              ? "rgba(45, 28, 34, 0.92)"
                                              : C_CARD,
                                        cursor: ineligible ? "not-allowed" : "pointer",
                                        textAlign: "left",
                                        width: "100%",
                                        fontFamily: "inherit",
                                        boxShadow: selected ? C_RED_GLOW : "none",
                                        transition:
                                            "border-color 200ms ease, background 200ms ease, box-shadow 200ms ease",
                                        opacity: ineligible ? 0.55 : 1,
                                    }}
                                    onMouseEnter={(e) => {
                                        if (ineligible) return
                                        e.currentTarget.style.borderColor = C_BORDER_HOVER
                                        e.currentTarget.style.background = C_CARD_HOVER
                                    }}
                                    onMouseLeave={(e) => {
                                        if (ineligible) return
                                        e.currentTarget.style.borderColor = selected
                                            ? C_BORDER_SELECTED
                                            : C_BORDER
                                        e.currentTarget.style.background = selected
                                            ? "rgba(45, 28, 34, 0.92)"
                                            : C_CARD
                                    }}
                                >
                                    {/* Left: label + description */}
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <p
                                            style={{
                                                margin: 0,
                                                fontFamily: FONT_DISPLAY,
                                                fontSize: "1rem",
                                                fontWeight: 600,
                                                letterSpacing: "0.06em",
                                                color: ineligible ? C_DISABLED : C_FG,
                                            }}
                                        >
                                            {cat.label}
                                            {ineligible && (
                                                <span
                                                    style={{
                                                        marginLeft: 10,
                                                        fontFamily: FONT_UI,
                                                        fontSize: 10,
                                                        fontWeight: 400,
                                                        letterSpacing: "0.08em",
                                                        textTransform: "uppercase",
                                                        color: C_DISABLED,
                                                    }}
                                                >
                                                    Requires 2+ months on-server
                                                </span>
                                            )}
                                        </p>
                                        <p
                                            style={{
                                                margin: "5px 0 0 0",
                                                fontFamily: FONT_BODY,
                                                fontSize: "0.92rem",
                                                color: ineligible ? C_DISABLED : C_MUTED,
                                                lineHeight: 1.5,
                                            }}
                                        >
                                            {cat.description}
                                        </p>
                                    </div>

                                    {/* Right: XP badge */}
                                    <div
                                        style={{
                                            flexShrink: 0,
                                            textAlign: "center",
                                            padding: "8px 14px",
                                            borderRadius: 8,
                                            border: `1px solid ${
                                                cat.xpBudget > 0 && !ineligible
                                                    ? rgba(RAW_RED, 0.3)
                                                    : "rgba(125, 91, 72, 0.2)"
                                            }`,
                                            background:
                                                cat.xpBudget > 0 && !ineligible
                                                    ? rgba(RAW_RED, 0.08)
                                                    : "rgba(255, 255, 255, 0.03)",
                                        }}
                                    >
                                        {cat.xpBudget > 0 ? (
                                            <>
                                                <p
                                                    style={{
                                                        margin: 0,
                                                        fontFamily: FONT_DISPLAY,
                                                        fontSize: "1.4rem",
                                                        fontWeight: 700,
                                                        color: ineligible ? C_DISABLED : C_RED,
                                                        lineHeight: 1,
                                                    }}
                                                >
                                                    {cat.xpBudget}
                                                </p>
                                                <p
                                                    style={{
                                                        margin: "3px 0 0 0",
                                                        fontFamily: FONT_UI,
                                                        fontSize: 9,
                                                        letterSpacing: "0.1em",
                                                        textTransform: "uppercase",
                                                        color: ineligible ? C_DISABLED : C_RED_DIM,
                                                    }}
                                                >
                                                    XP
                                                </p>
                                            </>
                                        ) : (
                                            <p
                                                style={{
                                                    margin: 0,
                                                    fontFamily: FONT_UI,
                                                    fontSize: 10,
                                                    letterSpacing: "0.06em",
                                                    color: ineligible ? C_DISABLED : C_GOLD,
                                                    whiteSpace: "nowrap",
                                                }}
                                            >
                                                Standard
                                            </p>
                                        )}
                                    </div>
                                </button>
                            )

                            if (ineligible) {
                                return (
                                    <Tooltip
                                        key={cat.id}
                                        label="You need a character approved 2+ months ago to create an Ancilla."
                                        position="top"
                                        withArrow
                                    >
                                        <div>{card}</div>
                                    </Tooltip>
                                )
                            }

                            return card
                        })}
                    </div>
                </div>
            </ScrollArea>
        </div>
    )
}
