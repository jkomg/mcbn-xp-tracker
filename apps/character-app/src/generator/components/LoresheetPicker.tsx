import { Button, ScrollArea, Stack, Text, Title } from "@mantine/core"
import { IconCheck } from "@tabler/icons-react"
import { Character } from "~/data/Character"
import { Loresheet, LoresheetDot, LORESHEETS, loresheetDotCost } from "~/data/Loresheets"
import { RAW_RED, rgba } from "~/theme/colors"
import {
    generatorScrollableAreaStyle,
    generatorScrollableContentStyle,
    generatorScrollableShellStyle,
} from "./sharedGeneratorScrollableLayout"
import { nightfallScrollAreaStyles, nightfallScrollbarSize } from "./sharedScrollAreaStyles"

type LoresheetPickerProps = {
    character: Character
    setCharacter: (character: Character) => void
    nextStep: () => void
}

const FONT_DISPLAY = "Cinzel, Georgia, serif"
const FONT_BODY = "Crimson Text, Georgia, serif"
const FONT_UI = "Inter, Segoe UI, sans-serif"
const C_FG = "rgba(244, 236, 232, 0.95)"
const C_MUTED = "rgba(220, 210, 205, 0.6)"
const C_CARD = "rgba(26, 20, 24, 0.88)"
const C_BORDER = "rgba(125, 91, 72, 0.35)"
const C_RED = rgba(RAW_RED, 1)
const C_RED_DIM = rgba(RAW_RED, 0.45)
const C_RED_GLOW = `0 0 18px ${rgba(RAW_RED, 0.28)}`
const C_GOLD = "rgba(195, 155, 90, 0.85)"
const C_GOLD_DIM = "rgba(195, 155, 90, 0.4)"

const SOURCE_LABELS: Record<string, string> = {
    core: "Core",
    camarilla: "Camarilla",
    anarch: "Anarch",
    chicago: "Chicago by Night",
    custom: "Nashville",
}

function sourceLabel(source: string): string {
    return SOURCE_LABELS[source] ?? source
}

function isLoresheetAvailable(loresheet: Loresheet, clan: string): boolean {
    if (!loresheet.clanRestriction || loresheet.clanRestriction.length === 0) return true
    return loresheet.clanRestriction.includes(clan)
}

function isDotAvailable(dot: LoresheetDot, clan: string): boolean {
    if (!dot.clanRestriction || dot.clanRestriction.length === 0) return true
    return dot.clanRestriction.includes(clan)
}

function isPurchased(character: Character, loresheetId: string, dot: number): boolean {
    return (character.loresheet_purchases ?? []).some(
        (p) => p.loresheet_id === loresheetId && p.dot === dot,
    )
}

function togglePurchase(character: Character, loresheetId: string, dot: number): Character {
    const current = character.loresheet_purchases ?? []
    const exists = current.some((p) => p.loresheet_id === loresheetId && p.dot === dot)
    const updated = exists
        ? current.filter((p) => !(p.loresheet_id === loresheetId && p.dot === dot))
        : [...current, { loresheet_id: loresheetId, dot }]
    return { ...character, loresheet_purchases: updated }
}

function totalXpSpent(character: Character): number {
    return (character.loresheet_purchases ?? []).reduce(
        (sum, p) => sum + loresheetDotCost(p.dot),
        0,
    )
}

export default function LoresheetPicker({ character, setCharacter, nextStep }: LoresheetPickerProps) {
    const budget = character.cc_xp_budget ?? 0
    const spent = totalXpSpent(character)
    const remaining = budget - spent
    const overBudget = remaining < 0
    const clan = character.clan ?? ""

    const visibleLoresheets = LORESHEETS.filter((ls) => isLoresheetAvailable(ls, clan))

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
                    {/* Header */}
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
                                Loresheets
                            </Text>
                        </Title>
                        <Text
                            ta="center"
                            maw={560}
                            style={{ fontFamily: FONT_BODY, fontSize: "1.1rem", color: C_MUTED }}
                        >
                            Purchase dots from loresheets using your XP budget.
                            All loresheets require Storyteller approval.
                        </Text>
                    </Stack>

                    {/* XP tracker bar */}
                    <div
                        style={{
                            maxWidth: 700,
                            margin: "0 auto 24px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 16,
                            padding: "10px 16px",
                            borderRadius: 8,
                            border: `1px solid ${overBudget ? rgba(RAW_RED, 0.5) : "rgba(125, 91, 72, 0.3)"}`,
                            background: overBudget ? rgba(RAW_RED, 0.06) : "rgba(26, 20, 24, 0.7)",
                        }}
                    >
                        <span
                            style={{
                                fontFamily: FONT_UI,
                                fontSize: "0.75rem",
                                letterSpacing: "0.12em",
                                textTransform: "uppercase",
                                color: C_GOLD,
                            }}
                        >
                            XP Budget
                        </span>
                        <div style={{ display: "flex", gap: 24 }}>
                            {[
                                { label: "Budget", value: budget, color: C_FG },
                                { label: "Spent", value: -spent, color: spent === 0 ? C_MUTED : C_RED_DIM },
                                {
                                    label: "Remaining",
                                    value: remaining,
                                    color: overBudget ? C_RED : C_GOLD,
                                },
                            ].map(({ label, value, color }) => (
                                <div key={label} style={{ textAlign: "center" }}>
                                    <div
                                        style={{
                                            fontFamily: FONT_DISPLAY,
                                            fontSize: "1rem",
                                            fontWeight: 700,
                                            color,
                                        }}
                                    >
                                        {value > 0 ? `+${value}` : value === 0 ? "0" : String(value)} XP
                                    </div>
                                    <div
                                        style={{
                                            fontFamily: FONT_UI,
                                            fontSize: "0.65rem",
                                            letterSpacing: "0.1em",
                                            textTransform: "uppercase",
                                            color: C_MUTED,
                                        }}
                                    >
                                        {label}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Loresheet cards */}
                    <div
                        style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 20,
                            maxWidth: 700,
                            margin: "0 auto",
                        }}
                    >
                        {visibleLoresheets.map((loresheet) => (
                            <div
                                key={loresheet.id}
                                style={{
                                    borderRadius: 10,
                                    border: `1px solid ${C_BORDER}`,
                                    background: C_CARD,
                                    overflow: "hidden",
                                }}
                            >
                                {/* Loresheet header */}
                                <div
                                    style={{
                                        padding: "14px 18px 12px",
                                        borderBottom: `1px solid rgba(125, 91, 72, 0.2)`,
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "space-between",
                                        gap: 12,
                                    }}
                                >
                                    <div>
                                        <p
                                            style={{
                                                margin: 0,
                                                fontFamily: FONT_DISPLAY,
                                                fontSize: "0.95rem",
                                                fontWeight: 600,
                                                letterSpacing: "0.06em",
                                                color: C_FG,
                                            }}
                                        >
                                            {loresheet.name}
                                        </p>
                                        {loresheet.requiresStPermission && (
                                            <p
                                                style={{
                                                    margin: "3px 0 0",
                                                    fontFamily: FONT_UI,
                                                    fontSize: "0.68rem",
                                                    letterSpacing: "0.08em",
                                                    textTransform: "uppercase",
                                                    color: C_GOLD_DIM,
                                                }}
                                            >
                                                Requires ST approval
                                            </p>
                                        )}
                                    </div>
                                    {/* Source badge */}
                                    <span
                                        style={{
                                            flexShrink: 0,
                                            padding: "3px 8px",
                                            borderRadius: 4,
                                            border: `1px solid rgba(125, 91, 72, 0.3)`,
                                            fontFamily: FONT_UI,
                                            fontSize: "0.62rem",
                                            letterSpacing: "0.1em",
                                            textTransform: "uppercase",
                                            color: C_MUTED,
                                        }}
                                    >
                                        {sourceLabel(loresheet.source)}
                                    </span>
                                </div>

                                {/* Dots */}
                                <div style={{ padding: "8px 0" }}>
                                    {loresheet.dots.map((dotEntry) => {
                                        const purchased = isPurchased(character, loresheet.id, dotEntry.dot)
                                        const dotAvailable = isDotAvailable(dotEntry, clan)
                                        const cost = loresheetDotCost(dotEntry.dot)

                                        return (
                                            <button
                                                key={dotEntry.dot}
                                                onClick={() => {
                                                    if (!dotAvailable) return
                                                    setCharacter(togglePurchase(character, loresheet.id, dotEntry.dot))
                                                }}
                                                disabled={!dotAvailable}
                                                style={{
                                                    display: "flex",
                                                    alignItems: "flex-start",
                                                    gap: 14,
                                                    width: "100%",
                                                    padding: "10px 18px",
                                                    background: purchased
                                                        ? rgba(RAW_RED, 0.07)
                                                        : "transparent",
                                                    border: "none",
                                                    borderBottom: `1px solid rgba(125, 91, 72, 0.12)`,
                                                    cursor: dotAvailable ? "pointer" : "not-allowed",
                                                    textAlign: "left",
                                                    fontFamily: "inherit",
                                                    transition: "background 150ms ease",
                                                    opacity: dotAvailable ? 1 : 0.38,
                                                }}
                                                onMouseEnter={(e) => {
                                                    if (!dotAvailable || purchased) return
                                                    e.currentTarget.style.background = "rgba(255, 255, 255, 0.04)"
                                                }}
                                                onMouseLeave={(e) => {
                                                    e.currentTarget.style.background = purchased
                                                        ? rgba(RAW_RED, 0.07)
                                                        : "transparent"
                                                }}
                                            >
                                                {/* Checkbox */}
                                                <div
                                                    style={{
                                                        flexShrink: 0,
                                                        width: 20,
                                                        height: 20,
                                                        marginTop: 1,
                                                        borderRadius: 4,
                                                        border: `1.5px solid ${purchased ? C_RED : "rgba(125, 91, 72, 0.5)"}`,
                                                        background: purchased ? rgba(RAW_RED, 0.15) : "transparent",
                                                        display: "flex",
                                                        alignItems: "center",
                                                        justifyContent: "center",
                                                        transition: "all 150ms ease",
                                                    }}
                                                >
                                                    {purchased && <IconCheck size={12} color={C_RED} strokeWidth={2.5} />}
                                                </div>

                                                {/* Dot label + description */}
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                                                        <span
                                                            style={{
                                                                fontFamily: FONT_UI,
                                                                fontSize: "0.65rem",
                                                                letterSpacing: "0.1em",
                                                                color: purchased ? C_RED_DIM : C_MUTED,
                                                                flexShrink: 0,
                                                            }}
                                                        >
                                                            {"●".repeat(dotEntry.dot)}{"○".repeat(5 - dotEntry.dot)}
                                                        </span>
                                                        <span
                                                            style={{
                                                                fontFamily: FONT_BODY,
                                                                fontSize: "0.92rem",
                                                                fontWeight: 600,
                                                                color: C_FG,
                                                            }}
                                                        >
                                                            {dotEntry.name}
                                                        </span>
                                                        {!dotAvailable && dotEntry.clanRestriction && (
                                                            <span
                                                                style={{
                                                                    fontFamily: FONT_UI,
                                                                    fontSize: "0.62rem",
                                                                    letterSpacing: "0.08em",
                                                                    textTransform: "uppercase",
                                                                    color: C_GOLD_DIM,
                                                                }}
                                                            >
                                                                {dotEntry.clanRestriction.join(" / ")} only
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p
                                                        style={{
                                                            margin: "3px 0 0",
                                                            fontFamily: FONT_BODY,
                                                            fontSize: "0.85rem",
                                                            color: C_MUTED,
                                                            lineHeight: 1.4,
                                                        }}
                                                    >
                                                        {dotEntry.description}
                                                    </p>
                                                </div>

                                                {/* Cost badge */}
                                                <div
                                                    style={{
                                                        flexShrink: 0,
                                                        padding: "4px 10px",
                                                        borderRadius: 6,
                                                        border: `1px solid ${purchased ? rgba(RAW_RED, 0.4) : "rgba(125, 91, 72, 0.25)"}`,
                                                        background: purchased
                                                            ? rgba(RAW_RED, 0.1)
                                                            : "rgba(255, 255, 255, 0.03)",
                                                        textAlign: "center",
                                                    }}
                                                >
                                                    <div
                                                        style={{
                                                            fontFamily: FONT_DISPLAY,
                                                            fontSize: "0.85rem",
                                                            fontWeight: 700,
                                                            color: purchased ? C_RED : C_MUTED,
                                                        }}
                                                    >
                                                        {cost} XP
                                                    </div>
                                                </div>
                                            </button>
                                        )
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Continue button */}
                    <div style={{ maxWidth: 700, margin: "24px auto 0", textAlign: "right" }}>
                        <Button
                            onClick={nextStep}
                            variant="filled"
                            color="red.8"
                            style={{ fontFamily: FONT_UI, letterSpacing: "0.06em" }}
                        >
                            Continue
                        </Button>
                    </div>
                </div>
            </ScrollArea>
        </div>
    )
}
