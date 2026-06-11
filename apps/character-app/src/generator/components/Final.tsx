import { IconAlertCircle, IconCheck, IconSend, IconTrash } from "@tabler/icons-react"
import { Alert } from "@mantine/core"
import { useDisclosure } from "@mantine/hooks"
import { useState } from "react"
import { RAW_RED, RAW_GOLD, RAW_GREY, rgba } from "~/theme/colors"
import ErrorDetails from "~/components/ErrorDetails"
import ResetModal from "../../components/ResetModal"
import { Character, InMemoriamEra } from "../../data/Character"
import { cc } from "../../utils/api"
import { GeneratorStepId } from "../steps"

// Returns manual (non-XP) benefit strings for an IM era that require ST allocation
function imEraManualBenefits(era: InMemoriamEra): string[] {
    const items: string[] = []
    switch (era.type) {
        case "adversity":
            items.push("2 Background Flaw dots (assign to an existing Background)")
            items.push("1 Archaic specialty (any skill)")
            break
        case "calm":
            items.push("1 Archaic specialty (any skill)")
            if (era.gambit_taken && era.gambit_roll != null && era.gambit_roll <= 5)
                items.push("1 dot of Antiquated Flaws (gambit failed)")
            break
        case "intrigue": {
            const bgDots = 2 + (era.gambit_taken && era.gambit_roll != null && era.gambit_roll > 5 ? 2 : 0)
            items.push(`${bgDots} Background Advantage dot${bgDots !== 1 ? "s" : ""} (assign to backgrounds)`)
            items.push("1 Archaic specialty (any skill)")
            break
        }
        case "excess":
            items.push("3 Advantage dots (Bonding or Feeding Merits — assign in Freebies)")
            break
        case "violence":
            if (era.gambit_roll != null && era.gambit_roll <= 5)
                items.push("Dark Secret Flaw (••) gained — ensure it's in your flaws list")
            break
        case "torpor": {
            const removeDots = 1 + (era.gambit_taken && era.gambit_roll != null && era.gambit_roll > 5 ? 2 : 0)
            items.push(`Remove ${removeDots} Flaw dot${removeDots !== 1 ? "s" : ""} (coordinate with ST)`)
            break
        }
    }
    return items
}

type FinalProps = {
    character: Character
    setCharacter: (character: Character) => void
    setSelectedStep: (step: GeneratorStepId) => void
    draftId?: string
    onReset?: () => void
}

const NOTES_PLACEHOLDER = "Optional: anything the Storytellers should know about your character concept, background, or choices."

const FONT_DISPLAY = "Cinzel, Georgia, serif"
const FONT_BODY = "Crimson Text, Georgia, serif"
const FONT_UI = "Inter, Segoe UI, sans-serif"
const C_FG = "rgba(244, 236, 232, 0.95)"
const C_MUTED = rgba(RAW_GREY, 0.6)
const C_BORDER = "rgba(125, 91, 72, 0.4)"
const C_CARD = "rgba(26, 20, 24, 0.88)"
const C_RED = rgba(RAW_RED, 1)
const C_RED_SOFT = rgba(RAW_RED, 0.5)
const C_RED_DIM = rgba(RAW_RED, 0.15)
const C_GOLD = rgba(RAW_GOLD, 0.85)
const C_GOLD_DIM = rgba(RAW_GOLD, 0.15)
const C_RED_GLOW = `0 0 24px ${rgba(RAW_RED, 0.2)}`

const CATEGORY_LABELS: Record<string, string> = {
    mortal: "Mortal",
    fledgling: "Fledgling",
    ghoul: "Ghoul",
    neonate: "Neonate",
    ancilla: "Ancilla",
}

const Final = ({ character, setCharacter, setSelectedStep, draftId, onReset }: FinalProps) => {
    const [submitError, setSubmitError] = useState<Error | undefined>()
    const [submitStatus, setSubmitStatus] = useState<"idle" | "submitting" | "submitted">("idle")
    const [resetModalOpened, { open: openResetModal, close: closeResetModal }] = useDisclosure(false)

    const charName = character.name?.trim() || ""
    const clanName = character.clan || ""
    const ageLabel = CATEGORY_LABELS[character.age_category ?? ""] ?? ""
    const xpBudget = character.cc_xp_budget ?? 0
    const hasXpBudget = xpBudget > 0

    const isImAncilla =
        character.age_category === "ancilla" &&
        !!character.in_memoriam &&
        !character.in_memoriam.use_standard
    const imEras = isImAncilla ? (character.in_memoriam?.eras ?? []) : []
    const imManualItems: { eraLabel: string; benefits: string[] }[] = imEras.flatMap((era) => {
        const ERA_LABELS: Record<string, string> = {
            adversity: "A Time of Adversity",
            calm: "A Time of Calm",
            intrigue: "A Time of Intrigue",
            excess: "A Time of Excess",
            violence: "A Time of Violence",
            sorcery: "A Time of Sorcery",
            torpor: "Torpor",
        }
        const benefits = imEraManualBenefits(era)
        return benefits.length > 0 ? [{ eraLabel: ERA_LABELS[era.type] ?? era.type, benefits }] : []
    })
    const hasImManualItems = imManualItems.length > 0

    const handleSubmit = async () => {
        if (!draftId) {
            setSubmitError(new Error("No draft found. Try making a change to trigger an auto-save, then submit again."))
            return
        }
        setSubmitStatus("submitting")
        setSubmitError(undefined)
        try {
            await cc.submitDraft(draftId)
            setSubmitStatus("submitted")
        } catch (e) {
            setSubmitError(e as Error)
            setSubmitStatus("idle")
        }
    }

    const handleReset = () => {
        closeResetModal()
        onReset?.()
    }

    return (
        <div
            style={{
                height: "100%",
                width: "100%",
                overflowY: "auto",
                paddingTop: 72,
                paddingBottom: 48,
                paddingLeft: 16,
                paddingRight: 16,
                boxSizing: "border-box",
            }}
        >
            <div
                style={{
                    maxWidth: 600,
                    margin: "0 auto",
                    display: "flex",
                    flexDirection: "column",
                    gap: 32,
                }}
            >
                {/* Header */}
                <div style={{ textAlign: "center", display: "flex", flexDirection: "column", gap: 10 }}>
                    <h2
                        style={{
                            fontFamily: FONT_DISPLAY,
                            fontSize: "1.75rem",
                            letterSpacing: "0.05em",
                            color: C_FG,
                            margin: 0,
                            fontWeight: 600,
                            textShadow: C_RED_GLOW,
                        }}
                    >
                        {charName || "Unnamed Character"}
                    </h2>

                    {/* Clan / Age row */}
                    <div
                        style={{
                            display: "flex",
                            justifyContent: "center",
                            gap: 12,
                            flexWrap: "wrap",
                        }}
                    >
                        {clanName && (
                            <span
                                style={{
                                    fontFamily: FONT_BODY,
                                    fontSize: "1rem",
                                    color: C_GOLD,
                                    letterSpacing: "0.04em",
                                }}
                            >
                                {clanName}
                            </span>
                        )}
                        {clanName && ageLabel && (
                            <span style={{ color: rgba(RAW_GREY, 0.3) }}>·</span>
                        )}
                        {ageLabel && (
                            <span
                                style={{
                                    fontFamily: FONT_BODY,
                                    fontSize: "1rem",
                                    color: C_MUTED,
                                    letterSpacing: "0.04em",
                                }}
                            >
                                {ageLabel}
                            </span>
                        )}
                    </div>

                    {/* XP budget summary */}
                    {hasXpBudget && (
                        <div
                            style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 8,
                                margin: "4px auto 0",
                                padding: "6px 16px",
                                borderRadius: 20,
                                border: `1px solid ${rgba(RAW_RED, 0.25)}`,
                                background: C_RED_DIM,
                            }}
                        >
                            <span
                                style={{
                                    fontFamily: FONT_DISPLAY,
                                    fontSize: "1.1rem",
                                    fontWeight: 700,
                                    color: C_RED,
                                    lineHeight: 1,
                                }}
                            >
                                {xpBudget} XP
                            </span>
                            <span
                                style={{
                                    fontFamily: FONT_UI,
                                    fontSize: 11,
                                    color: rgba(RAW_RED, 0.55),
                                }}
                            >
                                budget
                            </span>
                        </div>
                    )}
                </div>

                {/* Divider */}
                <div
                    style={{
                        width: "100%",
                        height: 1,
                        background:
                            "linear-gradient(90deg, transparent 0%, rgba(125, 91, 72, 0.4) 50%, transparent 100%)",
                    }}
                />

                {/* Auto-save note */}
                <div
                    style={{
                        padding: "14px 18px",
                        borderRadius: 10,
                        border: `1px solid ${rgba(RAW_GOLD, 0.18)}`,
                        background: C_GOLD_DIM,
                        display: "flex",
                        flexDirection: "column",
                        gap: 6,
                    }}
                >
                    <p
                        style={{
                            margin: 0,
                            fontFamily: FONT_DISPLAY,
                            fontSize: "0.85rem",
                            letterSpacing: "0.06em",
                            color: C_GOLD,
                        }}
                    >
                        Draft auto-saved
                    </p>
                    <p
                        style={{
                            margin: 0,
                            fontFamily: FONT_BODY,
                            fontSize: "0.95rem",
                            color: rgba(RAW_GREY, 0.7),
                            lineHeight: 1.5,
                        }}
                    >
                        Your character is saved automatically as you work. You can close the tab
                        and return anytime to continue editing.
                    </p>
                </div>

                {/* Oceans of Time — manual allocation checklist */}
                {hasImManualItems && (
                    <div
                        style={{
                            padding: "16px 20px",
                            borderRadius: 10,
                            border: `1px solid ${rgba(RAW_RED, 0.35)}`,
                            background: rgba(RAW_RED, 0.06),
                            display: "flex",
                            flexDirection: "column",
                            gap: 10,
                        }}
                    >
                        <p
                            style={{
                                margin: 0,
                                fontFamily: FONT_DISPLAY,
                                fontSize: "0.85rem",
                                letterSpacing: "0.06em",
                                color: C_RED,
                            }}
                        >
                            Oceans of Time — Items for ST Review
                        </p>
                        <p
                            style={{
                                margin: 0,
                                fontFamily: FONT_BODY,
                                fontSize: "0.88rem",
                                color: C_MUTED,
                                lineHeight: 1.5,
                            }}
                        >
                            The following non-XP benefits from your eras cannot be applied automatically.
                            Your ST will confirm these during review.
                        </p>
                        {imManualItems.map(({ eraLabel, benefits }) => (
                            <div key={eraLabel} style={{ marginTop: 4 }}>
                                <p
                                    style={{
                                        margin: "0 0 4px 0",
                                        fontFamily: FONT_DISPLAY,
                                        fontSize: "0.78rem",
                                        letterSpacing: "0.08em",
                                        color: rgba(RAW_RED, 0.7),
                                    }}
                                >
                                    {eraLabel}
                                </p>
                                <ul style={{ margin: 0, paddingLeft: 18 }}>
                                    {benefits.map((b) => (
                                        <li
                                            key={b}
                                            style={{
                                                fontFamily: FONT_UI,
                                                fontSize: "0.82rem",
                                                color: C_MUTED,
                                                lineHeight: 1.6,
                                            }}
                                        >
                                            {b}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ))}
                    </div>
                )}

                {/* Submission notes */}
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <label
                        htmlFor="submission-notes"
                        style={{
                            fontFamily: FONT_DISPLAY,
                            fontSize: "0.85rem",
                            letterSpacing: "0.06em",
                            color: C_GOLD,
                        }}
                    >
                        Notes to Storytellers
                        <span
                            style={{
                                fontFamily: FONT_UI,
                                fontSize: 11,
                                color: C_MUTED,
                                marginLeft: 8,
                                letterSpacing: 0,
                                textTransform: "none",
                            }}
                        >
                            (optional)
                        </span>
                    </label>
                    <textarea
                        id="submission-notes"
                        value={character.submission_notes ?? ""}
                        onChange={(e) =>
                            setCharacter({ ...character, submission_notes: e.target.value })
                        }
                        placeholder={NOTES_PLACEHOLDER}
                        rows={4}
                        style={{
                            width: "100%",
                            boxSizing: "border-box",
                            padding: "10px 14px",
                            borderRadius: 8,
                            border: `1px solid ${rgba(RAW_GOLD, 0.2)}`,
                            background: "rgba(26, 20, 24, 0.7)",
                            color: C_FG,
                            fontFamily: FONT_BODY,
                            fontSize: "0.92rem",
                            lineHeight: 1.5,
                            resize: "vertical",
                            outline: "none",
                        }}
                        onFocus={(e) => {
                            e.currentTarget.style.borderColor = rgba(RAW_GOLD, 0.45)
                        }}
                        onBlur={(e) => {
                            e.currentTarget.style.borderColor = rgba(RAW_GOLD, 0.2)
                        }}
                    />
                </div>

                {/* Submit section */}
                {submitStatus === "submitted" ? (
                    <div
                        style={{
                            padding: "20px 24px",
                            borderRadius: 10,
                            border: `1px solid ${rgba(RAW_RED, 0.3)}`,
                            background: rgba(RAW_RED, 0.06),
                            display: "flex",
                            alignItems: "flex-start",
                            gap: 14,
                        }}
                    >
                        <div
                            style={{
                                flexShrink: 0,
                                width: 36,
                                height: 36,
                                borderRadius: 8,
                                background: rgba(RAW_RED, 0.15),
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                color: C_RED,
                            }}
                        >
                            <IconCheck size={20} />
                        </div>
                        <div>
                            <p
                                style={{
                                    margin: 0,
                                    fontFamily: FONT_DISPLAY,
                                    fontSize: "0.95rem",
                                    letterSpacing: "0.05em",
                                    color: C_FG,
                                }}
                            >
                                Submitted for Review
                            </p>
                            <p
                                style={{
                                    margin: "6px 0 0 0",
                                    fontFamily: FONT_BODY,
                                    fontSize: "0.92rem",
                                    color: C_MUTED,
                                    lineHeight: 1.5,
                                }}
                            >
                                An ST will review your character and respond in your Discord ticket
                                channel. You can still edit your draft until it's approved.
                            </p>
                        </div>
                    </div>
                ) : (
                    <div
                        style={{
                            padding: "20px 24px",
                            borderRadius: 10,
                            border: `1px solid ${C_BORDER}`,
                            background: C_CARD,
                            display: "flex",
                            flexDirection: "column",
                            gap: 14,
                        }}
                    >
                        <div>
                            <p
                                style={{
                                    margin: 0,
                                    fontFamily: FONT_DISPLAY,
                                    fontSize: "0.9rem",
                                    letterSpacing: "0.06em",
                                    color: C_FG,
                                }}
                            >
                                Ready to submit?
                            </p>
                            <p
                                style={{
                                    margin: "6px 0 0 0",
                                    fontFamily: FONT_BODY,
                                    fontSize: "0.92rem",
                                    color: C_MUTED,
                                    lineHeight: 1.5,
                                }}
                            >
                                When you submit, an ST will review your character in your Discord
                                ticket. You can still make edits after submission until it's
                                approved.
                            </p>
                        </div>

                        <button
                            onClick={handleSubmit}
                            disabled={submitStatus === "submitting"}
                            style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                gap: 10,
                                padding: "12px 24px",
                                borderRadius: 8,
                                border: `1px solid ${rgba(RAW_RED, 0.5)}`,
                                background:
                                    submitStatus === "submitting"
                                        ? rgba(RAW_RED, 0.1)
                                        : rgba(RAW_RED, 0.18),
                                color: submitStatus === "submitting" ? C_RED_SOFT : C_RED,
                                fontFamily: FONT_DISPLAY,
                                fontSize: "0.88rem",
                                letterSpacing: "0.1em",
                                textTransform: "uppercase",
                                cursor:
                                    submitStatus === "submitting" ? "not-allowed" : "pointer",
                                transition: "background 200ms ease, border-color 200ms ease",
                                width: "100%",
                            }}
                            onMouseEnter={(e) => {
                                if (submitStatus === "submitting") return
                                e.currentTarget.style.background = rgba(RAW_RED, 0.26)
                                e.currentTarget.style.borderColor = rgba(RAW_RED, 0.7)
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.background = rgba(RAW_RED, 0.18)
                                e.currentTarget.style.borderColor = rgba(RAW_RED, 0.5)
                            }}
                        >
                            <IconSend size={16} />
                            {submitStatus === "submitting"
                                ? "Submitting…"
                                : "Submit for Review"}
                        </button>
                    </div>
                )}

                {submitError && (
                    <Alert
                        icon={<IconAlertCircle size="1rem" />}
                        color="red"
                        variant="outline"
                        bg="rgba(0, 0, 0, 0.6)"
                    >
                        <ErrorDetails error={submitError} />
                    </Alert>
                )}

                {/* Reset */}
                <div style={{ display: "flex", justifyContent: "center" }}>
                    <button
                        onClick={openResetModal}
                        style={{
                            background: "none",
                            border: `1px solid ${rgba(RAW_RED, 0.3)}`,
                            borderRadius: 8,
                            color: rgba(RAW_RED, 0.6),
                            cursor: "pointer",
                            fontFamily: FONT_UI,
                            fontSize: 12,
                            padding: "7px 14px",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 8,
                            transition: "color 200ms, border-color 200ms, background 200ms",
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.color = C_RED
                            e.currentTarget.style.borderColor = rgba(RAW_RED, 0.55)
                            e.currentTarget.style.background = rgba(RAW_RED, 0.07)
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.color = rgba(RAW_RED, 0.6)
                            e.currentTarget.style.borderColor = rgba(RAW_RED, 0.3)
                            e.currentTarget.style.background = "none"
                        }}
                    >
                        <IconTrash size={14} />
                        Start over
                    </button>
                </div>
            </div>

            <ResetModal
                setCharacter={setCharacter}
                setSelectedStep={setSelectedStep}
                resetModalOpened={resetModalOpened}
                closeResetModal={handleReset}
            />
        </div>
    )
}

export default Final
