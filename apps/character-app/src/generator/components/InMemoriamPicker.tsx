import { Button, Divider, NumberInput, ScrollArea, Stack, Text, Title } from "@mantine/core"
import { RAW_RED, rgba } from "~/theme/colors"
import { useState } from "react"
import { Character, InMemoriamEra, InMemoriamEraType } from "~/data/Character"
import {
    generatorScrollableAreaStyle,
    generatorScrollableContentStyle,
    generatorScrollableShellStyle,
} from "./sharedGeneratorScrollableLayout"
import { nightfallScrollAreaStyles, nightfallScrollbarSize } from "./sharedScrollAreaStyles"

type InMemoriamPickerProps = {
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
const C_BORDER = "rgba(125, 91, 72, 0.35)"
const C_RED = rgba(RAW_RED, 1)
const C_RED_DIM = rgba(RAW_RED, 0.45)
const C_RED_GLOW = `0 0 18px ${rgba(RAW_RED, 0.28)}`
const C_GOLD = "rgba(195, 155, 90, 0.85)"
const C_WARN = "rgba(220, 160, 60, 0.9)"

// ── Era definitions ────────────────────────────────────────────────────────────

type EraDef = {
    type: InMemoriamEraType
    label: string
    flavor: string
    baseXp: number
    baseOther: string | null // non-XP benefits
    baseHumanityLoss: number
    hasGambit: boolean
    gambitXp: number
    gambitOther: string | null
    gambitRisk: string
    gambitHumanityOnFail: number // humanity lost if roll 1-5
}

const ERA_DEFS: EraDef[] = [
    {
        type: "adversity",
        label: "A Time of Adversity",
        flavor:
            "You spent more nights than you would've preferred huddled up in damp cellars, licking your wounds and eyeing the rats.",
        baseXp: 12,
        baseOther: "2 Background Flaw dots · 1 Archaic specialty",
        baseHumanityLoss: 0,
        hasGambit: true,
        gambitXp: 10,
        gambitOther: null,
        gambitRisk: "On 1–5: −1 Humanity",
        gambitHumanityOnFail: 1,
    },
    {
        type: "calm",
        label: "A Time of Calm",
        flavor:
            "It went by much too quickly, but for a while, your nights were mostly free of dangers. You immersed yourself in your passions and grew your abilities.",
        baseXp: 6,
        baseOther: "1 Archaic specialty",
        baseHumanityLoss: 0,
        hasGambit: true,
        gambitXp: 3,
        gambitOther: null,
        gambitRisk: "On 1–5: gain 1 dot of Antiquated Flaws",
        gambitHumanityOnFail: 0,
    },
    {
        type: "intrigue",
        label: "A Time of Intrigue",
        flavor:
            "As others jealously reached for your assets, you had to be clever to protect yourself.",
        baseXp: 0,
        baseOther: "2 Background Advantage dots · 1 Archaic specialty",
        baseHumanityLoss: 0,
        hasGambit: true,
        gambitXp: 0,
        gambitOther: "+2 Background Advantage dots",
        gambitRisk: "On 1–5: −1 Humanity",
        gambitHumanityOnFail: 1,
    },
    {
        type: "excess",
        label: "A Time of Excess",
        flavor:
            "The consummate leech, you indulged in every vice and even managed to overcome some of them.",
        baseXp: 0,
        baseOther: "3 Advantage dots (Bonding or Feeding Merits)",
        baseHumanityLoss: 0,
        hasGambit: true,
        gambitXp: 10,
        gambitOther: null,
        gambitRisk: "On 1–5: 3 dots of Supernatural/Substance Use Flaws, or −1 Humanity",
        gambitHumanityOnFail: 0, // player choice: flaws or Humanity
    },
    {
        type: "violence",
        label: "A Time of Violence",
        flavor:
            "You indulged your Beast, letting it loose upon your enemies and any others who were in the way.",
        baseXp: 15,
        baseOther: null,
        baseHumanityLoss: 1,
        hasGambit: false,
        gambitXp: 0,
        gambitOther: null,
        gambitRisk: "Roll each time chosen: on 1–5, gain Dark Secret Flaw (••) and cannot choose again.",
        gambitHumanityOnFail: 0,
    },
    {
        type: "sorcery",
        label: "A Time of Sorcery",
        flavor:
            "You turned your mind to the sorcerous side of undead existence, finding secrets in the Blood.",
        baseXp: 15,
        baseOther: "Spend on Mental Attributes, Occult, or Blood Sorcery/Oblivion (Rituals/Ceremonies only)",
        baseHumanityLoss: 1,
        hasGambit: true,
        gambitXp: 3,
        gambitOther: null,
        gambitRisk: "On 1–5: gain a Cursed Object (•)",
        gambitHumanityOnFail: 0,
    },
    {
        type: "torpor",
        label: "Torpor",
        flavor:
            "You spent an era in torpor, hoping time would erase some of your mistakes.",
        baseXp: 0,
        baseOther: "Remove 1 dot of Flaws",
        baseHumanityLoss: 0,
        hasGambit: true,
        gambitXp: 0,
        gambitOther: "Remove 2 additional Flaw dots",
        gambitRisk: "On 1–5: lose 1 dot from your lowest-rated Discipline",
        gambitHumanityOnFail: 0,
    },
]

const ERA_MAP = Object.fromEntries(ERA_DEFS.map((e) => [e.type, e])) as Record<
    InMemoriamEraType,
    EraDef
>

// ── Violence tracking (can only be taken once after a failed gambit roll) ──────
function hasViolenceDarkSecret(eras: InMemoriamEra[]): boolean {
    return eras.some(
        (e) => e.type === "violence" && e.gambit_taken && e.gambit_roll != null && e.gambit_roll <= 5
    )
}

// ── XP and Humanity calculation ───────────────────────────────────────────────
function computeEraXp(era: InMemoriamEra): number {
    const def = ERA_MAP[era.type]
    let xp = def.baseXp
    if (era.gambit_taken) xp += def.gambitXp
    return xp
}

function computeEraHumanityLoss(era: InMemoriamEra): number {
    const def = ERA_MAP[era.type]
    let loss = def.baseHumanityLoss
    if (era.gambit_taken && era.gambit_roll != null) {
        if (era.gambit_roll <= 5) {
            loss += def.gambitHumanityOnFail
        }
    }
    return loss
}

function computeTotals(eras: InMemoriamEra[], ageHumanityLoss: number) {
    const totalXp = eras.reduce((sum, e) => sum + computeEraXp(e), 0)
    const eraHumanityLoss = eras.reduce((sum, e) => sum + computeEraHumanityLoss(e), 0)
    return { totalXp, totalHumanityLoss: ageHumanityLoss + eraHumanityLoss }
}

// ── Embrace age options ────────────────────────────────────────────────────────
type EmbraceAge = "up_to_100" | "up_to_150" | "over_150"

const EMBRACE_AGES = [
    {
        id: "up_to_100" as EmbraceAge,
        label: "Up to 100 years ago",
        eraCount: 3,
        humanityLoss: 0,
        detail: "Choose 3 eras",
    },
    {
        id: "up_to_150" as EmbraceAge,
        label: "Up to 150 years ago",
        eraCount: 4,
        humanityLoss: 1,
        detail: "Choose 4 eras · −1 Humanity",
    },
    {
        id: "over_150" as EmbraceAge,
        label: "151 years or more ago",
        eraCount: 5,
        humanityLoss: 2,
        detail: "Choose 5 eras · −2 Humanity",
    },
]

// ── Era card ──────────────────────────────────────────────────────────────────
function EraCard({
    slotIndex,
    era,
    onChange,
    violenceBlocked,
    eraCount,
}: {
    slotIndex: number
    era: InMemoriamEra | null
    onChange: (era: InMemoriamEra | null) => void
    violenceBlocked: boolean
    eraCount: number
}) {
    const selected = era?.type ?? null
    const def = selected ? ERA_MAP[selected] : null

    const eraXp = era ? computeEraXp(era) : 0
    const eraHumanity = era ? computeEraHumanityLoss(era) : 0

    const gamblerRollDone =
        era?.gambit_taken && era.gambit_roll != null && era.gambit_roll >= 1

    const gamblerSucceeded = gamblerRollDone && era!.gambit_roll! > 5
    const gamblerFailed = gamblerRollDone && era!.gambit_roll! <= 5

    return (
        <div
            style={{
                borderRadius: 12,
                border: `1px solid ${selected ? rgba(RAW_RED, 0.4) : C_BORDER}`,
                background: C_CARD,
                padding: "18px 20px",
            }}
        >
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                <span
                    style={{
                        fontFamily: FONT_DISPLAY,
                        fontSize: "0.7rem",
                        letterSpacing: "0.15em",
                        textTransform: "uppercase",
                        color: C_RED_DIM,
                    }}
                >
                    Era {slotIndex + 1} of {eraCount}
                </span>
                {selected && eraXp > 0 && (
                    <span
                        style={{
                            fontFamily: FONT_DISPLAY,
                            fontSize: "0.7rem",
                            letterSpacing: "0.1em",
                            color: C_GOLD,
                        }}
                    >
                        +{eraXp} XP
                    </span>
                )}
                {selected && eraHumanity > 0 && (
                    <span
                        style={{
                            fontFamily: FONT_UI,
                            fontSize: "0.7rem",
                            color: C_WARN,
                        }}
                    >
                        −{eraHumanity} Humanity
                    </span>
                )}
            </div>

            {/* Era type picker */}
            <div
                style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
                    gap: 8,
                    marginBottom: selected ? 16 : 0,
                }}
            >
                {ERA_DEFS.map((e) => {
                    const isSelected = selected === e.type
                    const isBlocked = e.type === "violence" && violenceBlocked && !isSelected
                    return (
                        <button
                            key={e.type}
                            disabled={isBlocked}
                            onClick={() => {
                                if (isSelected) {
                                    onChange(null)
                                } else {
                                    onChange({
                                        type: e.type,
                                        gambit_taken: false,
                                        gambit_roll: undefined,
                                        xp_gained: e.baseXp,
                                        humanity_loss: e.baseHumanityLoss,
                                    })
                                }
                            }}
                            style={{
                                padding: "10px 12px",
                                borderRadius: 8,
                                border: `1px solid ${isSelected ? rgba(RAW_RED, 0.7) : "rgba(125, 91, 72, 0.28)"}`,
                                background: isSelected
                                    ? "rgba(45, 18, 22, 0.9)"
                                    : "rgba(20, 15, 18, 0.6)",
                                cursor: isBlocked ? "not-allowed" : "pointer",
                                textAlign: "left",
                                opacity: isBlocked ? 0.4 : 1,
                                fontFamily: "inherit",
                                boxShadow: isSelected ? C_RED_GLOW : "none",
                            }}
                        >
                            <p
                                style={{
                                    margin: 0,
                                    fontFamily: FONT_DISPLAY,
                                    fontSize: "0.72rem",
                                    fontWeight: 600,
                                    letterSpacing: "0.04em",
                                    color: isSelected ? C_RED : C_FG,
                                    lineHeight: 1.3,
                                }}
                            >
                                {e.label}
                            </p>
                            {e.baseXp > 0 && (
                                <p
                                    style={{
                                        margin: "3px 0 0 0",
                                        fontFamily: FONT_UI,
                                        fontSize: "0.68rem",
                                        color: C_GOLD,
                                    }}
                                >
                                    {e.baseXp} XP
                                </p>
                            )}
                            {e.baseHumanityLoss > 0 && (
                                <p
                                    style={{
                                        margin: "2px 0 0 0",
                                        fontFamily: FONT_UI,
                                        fontSize: "0.68rem",
                                        color: C_WARN,
                                    }}
                                >
                                    −{e.baseHumanityLoss} Humanity
                                </p>
                            )}
                        </button>
                    )
                })}
            </div>

            {/* Era details + gambit */}
            {def && era && (
                <div>
                    <Divider color="rgba(125, 91, 72, 0.2)" mb={14} />

                    <p
                        style={{
                            margin: "0 0 12px 0",
                            fontFamily: FONT_BODY,
                            fontSize: "0.92rem",
                            color: C_MUTED,
                            lineHeight: 1.5,
                            fontStyle: "italic",
                        }}
                    >
                        "{def.flavor}"
                    </p>

                    {/* Base benefits */}
                    <div style={{ marginBottom: 14 }}>
                        <p
                            style={{
                                margin: "0 0 4px 0",
                                fontFamily: FONT_UI,
                                fontSize: "0.75rem",
                                letterSpacing: "0.1em",
                                textTransform: "uppercase",
                                color: C_RED_DIM,
                            }}
                        >
                            Base benefits
                        </p>
                        {def.baseXp > 0 && (
                            <p style={{ margin: "0 0 2px 0", fontFamily: FONT_UI, fontSize: "0.82rem", color: C_GOLD }}>
                                +{def.baseXp} XP
                                {def.type === "sorcery" && (
                                    <span style={{ color: C_DIM }}> — Mental Attributes, Occult, or Blood Sorcery/Oblivion</span>
                                )}
                            </p>
                        )}
                        {def.baseOther && (
                            <p style={{ margin: "0 0 2px 0", fontFamily: FONT_UI, fontSize: "0.82rem", color: C_MUTED }}>
                                {def.baseOther}
                            </p>
                        )}
                        {def.baseHumanityLoss > 0 && (
                            <p style={{ margin: "0 0 2px 0", fontFamily: FONT_UI, fontSize: "0.82rem", color: C_WARN }}>
                                −{def.baseHumanityLoss} Humanity
                            </p>
                        )}
                    </div>

                    {/* Violence auto-roll note */}
                    {def.type === "violence" && (
                        <div
                            style={{
                                padding: "10px 12px",
                                borderRadius: 8,
                                border: `1px solid ${rgba(RAW_RED, 0.25)}`,
                                background: rgba(RAW_RED, 0.06),
                                marginBottom: 8,
                            }}
                        >
                            <p
                                style={{
                                    margin: 0,
                                    fontFamily: FONT_UI,
                                    fontSize: "0.8rem",
                                    color: rgba(RAW_RED, 0.7),
                                }}
                            >
                                Each time this era is chosen, roll a die — on 1–5 you gain the
                                Dark Secret Flaw (••) and cannot choose Violence again.
                            </p>
                            <div style={{ marginTop: 10 }}>
                                <p style={{ margin: "0 0 6px 0", fontFamily: FONT_UI, fontSize: "0.78rem", color: C_DIM }}>
                                    Enter your roll result (1–10):
                                </p>
                                <NumberInput
                                    min={1}
                                    max={10}
                                    value={era.gambit_roll ?? ""}
                                    onChange={(v) => {
                                        const roll = typeof v === "number" ? v : undefined
                                        onChange({
                                            ...era,
                                            gambit_taken: true,
                                            gambit_roll: roll,
                                            xp_gained: computeEraXp({ ...era, gambit_taken: true, gambit_roll: roll }),
                                            humanity_loss: computeEraHumanityLoss({ ...era, gambit_taken: true, gambit_roll: roll }),
                                        })
                                    }}
                                    placeholder="1–10"
                                    style={{ maxWidth: 100 }}
                                    styles={{
                                        input: {
                                            background: "rgba(18, 13, 16, 0.8)",
                                            border: "1px solid rgba(125, 91, 72, 0.35)",
                                            color: C_FG,
                                            fontFamily: FONT_DISPLAY,
                                            textAlign: "center",
                                        },
                                    }}
                                />
                                {era.gambit_roll != null && (
                                    <p
                                        style={{
                                            margin: "6px 0 0 0",
                                            fontFamily: FONT_UI,
                                            fontSize: "0.78rem",
                                            color: era.gambit_roll <= 5 ? C_WARN : "rgba(100, 200, 130, 0.8)",
                                        }}
                                    >
                                        {era.gambit_roll <= 5
                                            ? "Dark Secret Flaw (••) gained. Cannot choose Violence again."
                                            : "No consequence."}
                                    </p>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Optional gambit (non-Violence) */}
                    {def.hasGambit && def.type !== "violence" && (
                        <div
                            style={{
                                padding: "12px 14px",
                                borderRadius: 8,
                                border: `1px solid ${era.gambit_taken ? rgba(RAW_RED, 0.3) : "rgba(125, 91, 72, 0.22)"}`,
                                background: era.gambit_taken
                                    ? rgba(RAW_RED, 0.05)
                                    : "rgba(255, 255, 255, 0.02)",
                            }}
                        >
                            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: era.gambit_taken ? 12 : 0 }}>
                                <input
                                    type="checkbox"
                                    id={`gambit-${slotIndex}`}
                                    checked={era.gambit_taken}
                                    onChange={(e) => {
                                        const taken = e.target.checked
                                        onChange({
                                            ...era,
                                            gambit_taken: taken,
                                            gambit_roll: taken ? era.gambit_roll : undefined,
                                            xp_gained: computeEraXp({ ...era, gambit_taken: taken }),
                                            humanity_loss: computeEraHumanityLoss({
                                                ...era,
                                                gambit_taken: taken,
                                                gambit_roll: taken ? era.gambit_roll : undefined,
                                            }),
                                        })
                                    }}
                                    style={{ width: 16, height: 16, cursor: "pointer", accentColor: C_RED }}
                                />
                                <label
                                    htmlFor={`gambit-${slotIndex}`}
                                    style={{ cursor: "pointer" }}
                                >
                                    <span
                                        style={{
                                            fontFamily: FONT_UI,
                                            fontSize: "0.78rem",
                                            letterSpacing: "0.06em",
                                            textTransform: "uppercase",
                                            color: era.gambit_taken ? C_RED : C_DIM,
                                        }}
                                    >
                                        Take the gambit
                                    </span>
                                    {def.gambitXp > 0 && (
                                        <span
                                            style={{
                                                marginLeft: 8,
                                                fontFamily: FONT_UI,
                                                fontSize: "0.75rem",
                                                color: C_GOLD,
                                            }}
                                        >
                                            +{def.gambitXp} XP
                                        </span>
                                    )}
                                    {def.gambitOther && (
                                        <span
                                            style={{
                                                marginLeft: 8,
                                                fontFamily: FONT_UI,
                                                fontSize: "0.75rem",
                                                color: C_MUTED,
                                            }}
                                        >
                                            {def.gambitOther}
                                        </span>
                                    )}
                                </label>
                            </div>

                            {era.gambit_taken && (
                                <div>
                                    <p
                                        style={{
                                            margin: "0 0 6px 0",
                                            fontFamily: FONT_UI,
                                            fontSize: "0.75rem",
                                            color: rgba(RAW_RED, 0.6),
                                        }}
                                    >
                                        Risk: {def.gambitRisk}
                                    </p>
                                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                        <p
                                            style={{
                                                margin: 0,
                                                fontFamily: FONT_UI,
                                                fontSize: "0.78rem",
                                                color: C_DIM,
                                                whiteSpace: "nowrap",
                                            }}
                                        >
                                            Roll result (1–10):
                                        </p>
                                        <NumberInput
                                            min={1}
                                            max={10}
                                            value={era.gambit_roll ?? ""}
                                            onChange={(v) => {
                                                const roll = typeof v === "number" ? v : undefined
                                                onChange({
                                                    ...era,
                                                    gambit_roll: roll,
                                                    humanity_loss: computeEraHumanityLoss({
                                                        ...era,
                                                        gambit_taken: true,
                                                        gambit_roll: roll,
                                                    }),
                                                })
                                            }}
                                            placeholder="1–10"
                                            style={{ maxWidth: 90 }}
                                            styles={{
                                                input: {
                                                    background: "rgba(18, 13, 16, 0.8)",
                                                    border: "1px solid rgba(125, 91, 72, 0.35)",
                                                    color: C_FG,
                                                    fontFamily: FONT_DISPLAY,
                                                    textAlign: "center",
                                                },
                                            }}
                                        />
                                        {era.gambit_roll != null && (
                                            <p
                                                style={{
                                                    margin: 0,
                                                    fontFamily: FONT_UI,
                                                    fontSize: "0.78rem",
                                                    color:
                                                        era.gambit_roll <= 5
                                                            ? C_WARN
                                                            : "rgba(100, 200, 130, 0.8)",
                                                }}
                                            >
                                                {era.gambit_roll <= 5 ? "Consequence triggered." : "No consequence."}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function InMemoriamPicker({
    character,
    setCharacter,
    nextStep,
}: InMemoriamPickerProps) {
    const im = character.in_memoriam!
    const [embraceAge, setEmbraceAge] = useState<EmbraceAge | null>(
        im.embrace_age && im.embrace_age !== "" ? (im.embrace_age as EmbraceAge) : null
    )
    const [eras, setEras] = useState<(InMemoriamEra | null)[]>(
        im.eras?.length ? im.eras : []
    )

    const ageConfig = embraceAge ? EMBRACE_AGES.find((a) => a.id === embraceAge) ?? null : null
    const eraCount = ageConfig?.eraCount ?? 0
    const ageHumanityLoss = ageConfig?.humanityLoss ?? 0

    // Ensure eras array matches eraCount
    const paddedEras: (InMemoriamEra | null)[] = Array.from({ length: eraCount }, (_, i) => eras[i] ?? null)

    const violenceBlocked = hasViolenceDarkSecret(paddedEras.filter(Boolean) as InMemoriamEra[])

    const updateEra = (i: number, era: InMemoriamEra | null) => {
        const newEras = [...paddedEras]
        newEras[i] = era
        setEras(newEras)
    }

    const completedEras = paddedEras.filter(Boolean) as InMemoriamEra[]
    const { totalXp, totalHumanityLoss } = computeTotals(completedEras, ageHumanityLoss)
    const allErasDone = embraceAge !== null && paddedEras.every(Boolean)
    const finalHumanity = Math.max(4, 7 - totalHumanityLoss)

    const handleConfirm = () => {
        const updated: Character = {
            ...character,
            in_memoriam: {
                ...im,
                embrace_age: embraceAge!,
                eras: completedEras,
                total_xp: totalXp,
                total_humanity_loss: totalHumanityLoss,
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
                    {/* Header */}
                    <Stack gap={4} align="center" mb={26}>
                        <Title
                            order={2}
                            ta="center"
                            style={{ fontFamily: FONT_DISPLAY, fontWeight: 600, letterSpacing: "0.05em", color: C_FG }}
                        >
                            <Text component="strong" inherit c="red.5" style={{ textShadow: C_RED_GLOW }}>
                                Oceans of Time
                            </Text>
                        </Title>
                        <Text
                            ta="center"
                            maw={560}
                            style={{ fontFamily: FONT_BODY, fontSize: "1.05rem", color: C_MUTED }}
                        >
                            Follow your Kindred through the centuries. Each era shaped who they are today.
                        </Text>
                    </Stack>

                    <div style={{ maxWidth: 720, margin: "0 auto", width: "100%" }}>
                        {/* Embrace age picker */}
                        <div style={{ marginBottom: 28 }}>
                            <p
                                style={{
                                    margin: "0 0 10px 0",
                                    fontFamily: FONT_DISPLAY,
                                    fontSize: "0.75rem",
                                    letterSpacing: "0.15em",
                                    textTransform: "uppercase",
                                    color: C_RED_DIM,
                                }}
                            >
                                When were you Embraced?
                            </p>
                            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                {EMBRACE_AGES.map((a) => {
                                    const selected = embraceAge === a.id
                                    return (
                                        <button
                                            key={a.id}
                                            onClick={() => {
                                                setEmbraceAge(a.id)
                                                setEras([])
                                            }}
                                            style={{
                                                display: "flex",
                                                justifyContent: "space-between",
                                                alignItems: "center",
                                                padding: "14px 18px",
                                                borderRadius: 8,
                                                border: `1px solid ${selected ? rgba(RAW_RED, 0.7) : C_BORDER}`,
                                                background: selected ? "rgba(40, 22, 28, 0.9)" : C_CARD,
                                                cursor: "pointer",
                                                fontFamily: "inherit",
                                                boxShadow: selected ? C_RED_GLOW : "none",
                                            }}
                                        >
                                            <span
                                                style={{
                                                    fontFamily: FONT_DISPLAY,
                                                    fontSize: "0.9rem",
                                                    fontWeight: 600,
                                                    color: selected ? C_RED : C_FG,
                                                }}
                                            >
                                                {a.label}
                                            </span>
                                            <span
                                                style={{
                                                    fontFamily: FONT_UI,
                                                    fontSize: "0.78rem",
                                                    color: a.humanityLoss > 0 ? C_WARN : C_GOLD,
                                                }}
                                            >
                                                {a.detail}
                                            </span>
                                        </button>
                                    )
                                })}
                            </div>
                        </div>

                        {/* XP / Humanity summary */}
                        {embraceAge && (
                            <div
                                style={{
                                    display: "flex",
                                    gap: 16,
                                    marginBottom: 24,
                                    padding: "12px 16px",
                                    borderRadius: 8,
                                    border: `1px solid ${rgba(RAW_RED, 0.2)}`,
                                    background: "rgba(26, 20, 24, 0.7)",
                                }}
                            >
                                <div style={{ textAlign: "center", flex: 1 }}>
                                    <p style={{ margin: 0, fontFamily: FONT_DISPLAY, fontSize: "1.4rem", fontWeight: 700, color: C_GOLD, lineHeight: 1 }}>
                                        {totalXp}
                                    </p>
                                    <p style={{ margin: "3px 0 0 0", fontFamily: FONT_UI, fontSize: "0.7rem", letterSpacing: "0.1em", textTransform: "uppercase", color: C_DIM }}>
                                        Era XP
                                    </p>
                                </div>
                                <div style={{ textAlign: "center", flex: 1 }}>
                                    <p style={{ margin: 0, fontFamily: FONT_DISPLAY, fontSize: "1.4rem", fontWeight: 700, color: totalHumanityLoss > 0 ? C_WARN : C_DIM, lineHeight: 1 }}>
                                        −{totalHumanityLoss}
                                    </p>
                                    <p style={{ margin: "3px 0 0 0", fontFamily: FONT_UI, fontSize: "0.7rem", letterSpacing: "0.1em", textTransform: "uppercase", color: C_DIM }}>
                                        Humanity
                                    </p>
                                </div>
                                <div style={{ textAlign: "center", flex: 1 }}>
                                    <p style={{ margin: 0, fontFamily: FONT_DISPLAY, fontSize: "1.4rem", fontWeight: 700, color: finalHumanity <= 4 ? C_WARN : C_FG, lineHeight: 1 }}>
                                        {finalHumanity}
                                    </p>
                                    <p style={{ margin: "3px 0 0 0", fontFamily: FONT_UI, fontSize: "0.7rem", letterSpacing: "0.1em", textTransform: "uppercase", color: C_DIM }}>
                                        Final Humanity
                                    </p>
                                </div>
                                <div style={{ textAlign: "center", flex: 1 }}>
                                    <p style={{ margin: 0, fontFamily: FONT_DISPLAY, fontSize: "1.4rem", fontWeight: 700, color: C_FG, lineHeight: 1 }}>
                                        {completedEras.length}/{eraCount}
                                    </p>
                                    <p style={{ margin: "3px 0 0 0", fontFamily: FONT_UI, fontSize: "0.7rem", letterSpacing: "0.1em", textTransform: "uppercase", color: C_DIM }}>
                                        Eras
                                    </p>
                                </div>
                            </div>
                        )}

                        {/* Humanity floor note */}
                        {totalHumanityLoss > 3 && (
                            <div
                                style={{
                                    marginBottom: 16,
                                    padding: "10px 14px",
                                    borderRadius: 8,
                                    border: `1px solid ${rgba(RAW_RED, 0.3)}`,
                                    background: rgba(RAW_RED, 0.06),
                                }}
                            >
                                <p style={{ margin: 0, fontFamily: FONT_UI, fontSize: "0.8rem", color: C_WARN }}>
                                    Humanity cannot drop below 4 before the first session. Excess losses beyond that remove a Conviction and its Touchstone instead.
                                </p>
                            </div>
                        )}

                        {/* Era slots */}
                        {eraCount > 0 && (
                            <Stack gap={16}>
                                {paddedEras.map((era, i) => (
                                    <EraCard
                                        key={i}
                                        slotIndex={i}
                                        era={era}
                                        onChange={(e) => updateEra(i, e)}
                                        violenceBlocked={
                                            violenceBlocked &&
                                            !(era?.type === "violence")
                                        }
                                        eraCount={eraCount}
                                    />
                                ))}
                            </Stack>
                        )}

                        {/* Confirm */}
                        {embraceAge && (
                            <div style={{ display: "flex", justifyContent: "center", marginTop: 28 }}>
                                <Button
                                    disabled={!allErasDone}
                                    color="grape"
                                    size="lg"
                                    styles={{
                                        root: {
                                            fontFamily: FONT_DISPLAY,
                                            letterSpacing: "0.12em",
                                            textTransform: "uppercase",
                                            background: allErasDone
                                                ? "linear-gradient(135deg, rgba(130, 40, 150, 0.9) 0%, rgba(100, 20, 120, 0.9) 100%)"
                                                : "rgba(60, 60, 60, 0.7)",
                                            cursor: allErasDone ? "pointer" : "not-allowed",
                                        },
                                    }}
                                    onClick={handleConfirm}
                                >
                                    Confirm Oceans of Time
                                </Button>
                            </div>
                        )}
                    </div>
                </div>
            </ScrollArea>
        </div>
    )
}
