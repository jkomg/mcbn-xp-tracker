import { Box, Divider, ScrollArea, Stack, Text, UnstyledButton } from "@mantine/core"
import { IconCheck } from "@tabler/icons-react"
import { Character } from "../data/Character"
import {
    GeneratorStepId,
    getGeneratorStepIndex,
    getVisibleGeneratorSteps
} from "../generator/steps"
import { isDefault } from "../generator/utils"
import { globals } from "../globals"
import { RAW_RED, rgba } from "../theme/colors"

/** XP spent during character creation (disciplines purchased above free picks, loresheets, etc.)
 *  Returns 0 until spending steps (loresheets, etc.) are wired in. */
function computeCcXpSpent(_character: Character): number {
    return 0
}

const XP_ONLY_CATEGORIES = new Set(["neonate", "ancilla"])

function XpRow({
    label,
    value,
    bold,
    dim,
    warn,
}: {
    label: string
    value: number
    bold?: boolean
    dim?: boolean
    warn?: boolean
}) {
    const color = warn
        ? rgba(RAW_RED, 0.9)
        : dim
          ? "rgba(180, 170, 165, 0.35)"
          : "rgba(220, 210, 205, 0.75)"
    const displayValue = value > 0 ? `+${value}` : value === 0 ? "0" : String(value)
    return (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <Text
                size="xs"
                style={{
                    fontFamily: "Inter, Segoe UI, sans-serif",
                    color,
                    fontWeight: bold ? 600 : 400,
                }}
            >
                {label}
            </Text>
            <Text
                size="xs"
                style={{
                    fontFamily: "Cinzel, Georgia, serif",
                    color,
                    fontWeight: bold ? 700 : 500,
                }}
            >
                {displayValue} XP
            </Text>
        </div>
    )
}

export type AsideBarProps = {
    selectedStep: GeneratorStepId
    setSelectedStep: (step: GeneratorStepId) => void
    character: Character
}

const AsideBar = ({ selectedStep, setSelectedStep, character }: AsideBarProps) => {
    const steps = getVisibleGeneratorSteps(character)
    const activeIndex = getGeneratorStepIndex(character, selectedStep)

    const isHigherLevelAccessible = (character: Character, step: (typeof steps)[number]) => {
        if (step.id === "clan") {
            return true
        }

        if (!step.progressKey) {
            return true
        }

        const stepperKeys = steps
            .map((candidateStep) => candidateStep.progressKey)
            .filter((value): value is NonNullable<typeof value> => value !== undefined)
        const index = Math.max(0, stepperKeys.indexOf(step.progressKey) - 1)

        for (let i = index; i < stepperKeys.length; i++) {
            if (!isDefault(character, stepperKeys[i])) return true
        }
        return false
    }

    const getStagesList = () => {
        return (
            <Stack gap={0}>
                <Text
                    size="sm"
                    fw={600}
                    style={{
                        letterSpacing: "0.2em",
                        textTransform: "uppercase",
                        color: "var(--mantine-color-dimmed)",
                        marginBottom: "1rem"
                    }}
                >
                    Stages
                </Text>
                {steps.map((step, index) => {
                    const isCurrent = step.id === selectedStep
                    const isCompleted = index < activeIndex
                    const isAccessible = isHigherLevelAccessible(character, step)
                    const isLast = index === steps.length - 1

                    return (
                        <Box key={step.id}>
                            <UnstyledButton
                                onClick={() => {
                                    if (isAccessible) setSelectedStep(step.id)
                                }}
                                disabled={!isAccessible}
                                style={{
                                    width: "100%",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "0.75rem",
                                    padding: "0.5rem 0.625rem",
                                    borderRadius: "0.5rem",
                                    cursor: isAccessible ? "pointer" : "default",
                                    transition: "background-color 150ms ease",
                                    backgroundColor: isCurrent
                                        ? "rgba(190, 75, 219, 0.12)"
                                        : "transparent",
                                    border: isCurrent
                                        ? "1px solid rgba(190, 75, 219, 0.3)"
                                        : "1px solid transparent",
                                    opacity: !isAccessible && !isCurrent && !isCompleted ? 0.4 : 1
                                }}
                                onMouseEnter={(e) => {
                                    if (!isCurrent && isAccessible) {
                                        e.currentTarget.style.backgroundColor =
                                            "rgba(255, 255, 255, 0.05)"
                                    }
                                }}
                                onMouseLeave={(e) => {
                                    if (!isCurrent) {
                                        e.currentTarget.style.backgroundColor = "transparent"
                                    }
                                }}
                            >
                                <Box
                                    style={{
                                        width: "1.875rem",
                                        height: "1.875rem",
                                        borderRadius: "50%",
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        fontSize: "0.75rem",
                                        fontWeight: 600,
                                        flexShrink: 0,
                                        transition: "all 200ms ease",
                                        ...(isCurrent
                                            ? {
                                                  backgroundColor: "var(--mantine-color-grape-6)",
                                                  color: "white",
                                                  boxShadow: "0 0 10px rgba(190, 75, 219, 0.4)"
                                              }
                                            : isCompleted
                                              ? {
                                                    backgroundColor: "rgba(212, 175, 55, 0.2)",
                                                    color: "rgb(212, 175, 55)",
                                                    border: "1px solid rgba(212, 175, 55, 0.3)"
                                                }
                                              : {
                                                    backgroundColor: "rgba(255, 255, 255, 0.08)",
                                                    color: "var(--mantine-color-dimmed)",
                                                    border: "1px solid rgba(255, 255, 255, 0.15)"
                                                })
                                    }}
                                >
                                    {isCompleted && !isCurrent ? (
                                        <IconCheck size={12} />
                                    ) : (
                                        index + 1
                                    )}
                                </Box>

                                <Text
                                    size="sm"
                                    style={{
                                        color: isCurrent
                                            ? "var(--mantine-color-text)"
                                            : "var(--mantine-color-dimmed)",
                                        fontWeight: isCurrent ? 500 : 400,
                                        lineHeight: 1.2,
                                        transition: "color 150ms ease"
                                    }}
                                >
                                    {step.label}
                                </Text>
                            </UnstyledButton>

                            {!isLast && (
                                <Box style={{ marginLeft: "23px" }}>
                                    <Box
                                        style={{
                                            width: "1px",
                                            height: "1.375rem",
                                            backgroundColor: isCompleted
                                                ? "rgba(212, 175, 55, 0.3)"
                                                : "rgba(255, 255, 255, 0.1)"
                                        }}
                                    />
                                </Box>
                            )}
                        </Box>
                    )
                })}
            </Stack>
        )
    }

    const showXpBudget = XP_ONLY_CATEGORIES.has(character.age_category ?? "")
    const xpBudget = character.cc_xp_budget ?? 0
    const xpSpent = computeCcXpSpent(character)
    const xpRemaining = xpBudget - xpSpent

    const height = globals.viewportHeightPx
    const scrollerHeight = 940
    return (
        <Stack gap="md" style={{ padding: "1rem", zIndex: 0, height: "100%" }}>
            <div style={{ display: "flex", alignItems: "flex-start", flex: 1 }}>
                {height <= scrollerHeight ? (
                    <ScrollArea h={height - 100}>{getStagesList()}</ScrollArea>
                ) : (
                    <>{getStagesList()}</>
                )}
            </div>

            {showXpBudget && (
                <>
                    <Divider color="rgba(125, 91, 72, 0.25)" />
                    <div
                        style={{
                            borderRadius: 8,
                            border: `1px solid ${rgba(RAW_RED, 0.2)}`,
                            background: "rgba(26, 20, 24, 0.7)",
                            padding: "10px 12px",
                            display: "flex",
                            flexDirection: "column",
                            gap: 8,
                        }}
                    >
                        <Text
                            size="xs"
                            style={{
                                fontFamily: "Cinzel, Georgia, serif",
                                letterSpacing: "0.15em",
                                textTransform: "uppercase",
                                color: rgba(RAW_RED, 0.7),
                            }}
                        >
                            XP Budget
                        </Text>
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                            <XpRow label="Budget" value={xpBudget} />
                            <XpRow label="Spent" value={-xpSpent} dim={xpSpent === 0} />
                            <Divider color="rgba(125, 91, 72, 0.18)" my={2} />
                            <XpRow
                                label="Remaining"
                                value={xpRemaining}
                                bold
                                warn={xpRemaining < 0}
                            />
                        </div>
                    </div>
                </>
            )}
        </Stack>
    )
}

export default AsideBar
