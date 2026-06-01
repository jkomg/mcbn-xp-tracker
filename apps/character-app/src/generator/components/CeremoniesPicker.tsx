import { Badge, Box, Button, Group, ScrollArea, Text } from "@mantine/core"
import { RAW_GOLD, RAW_GREY, RAW_RED, rgba } from "~/theme/colors"
import { useEffect, useState } from "react"
import ReactGA from "react-ga4"
import { trackEvent } from "../../utils/analytics"
import { Character, containsOblivion } from "../../data/Character"
import {
    Ceremony,
    Ceremonies,
    characterHasCeremonyPrerequisite,
    getCeremonyPrerequisiteLabel
} from "../../data/Ceremonies"
import { upcase } from "../utils"
import {
    generatorScrollableAreaStyle,
    generatorScrollableContentStyle,
    generatorScrollableShellStyle
} from "./sharedGeneratorScrollableLayout"
import { nightfallScrollAreaStyles, nightfallScrollbarSize } from "./sharedScrollAreaStyles"
import { globals } from "../../globals"
import { GeneratorSectionDivider, GeneratorStepHero } from "./sharedGeneratorUi"

type CeremoniesPickerProps = {
    character: Character
    setCharacter: (character: Character) => void
    nextStep: () => void
}

const GOLD_LABEL_COLOR = rgba(RAW_GOLD, 1)

const DetailRow = ({ label, value }: { label: string; value: string }) => (
    <div style={{ minWidth: 0 }}>
        <Text
            style={{
                fontFamily: "Cinzel, Georgia, serif",
                fontSize: "0.76rem",
                color: GOLD_LABEL_COLOR,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                marginBottom: 2
            }}
        >
            {label}
        </Text>
        <Text
            style={{
                fontFamily: "Inter, sans-serif",
                fontSize: "0.78rem",
                color: rgba(RAW_GREY, 0.6)
            }}
        >
            {value}
        </Text>
    </div>
)

const CeremonyRow = ({
    ceremony,
    canTake,
    onTake,
}: {
    ceremony: Ceremony
    canTake: boolean
    onTake: () => void
}) => {
    const [expanded, setExpanded] = useState(false)
    const prerequisiteLabel = getCeremonyPrerequisiteLabel(ceremony)

    return (
        <div style={{ borderBottom: "1px solid rgba(125, 91, 72, 0.15)", opacity: canTake ? 1 : 0.55 }}>
            {/* Collapsed header */}
            <button
                onClick={() => setExpanded((e) => !e)}
                style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    width: "100%",
                    padding: "10px 14px",
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    textAlign: "left" as const,
                }}
            >
                <Badge variant="light" color="pink" radius="sm" size="xs" style={{ flexShrink: 0 }}>
                    lv {ceremony.level}
                </Badge>
                <Text
                    style={{
                        flex: 1,
                        fontFamily: "Cinzel, Georgia, serif",
                        fontSize: "0.88rem",
                        fontWeight: 700,
                        color: canTake ? "rgba(244, 236, 232, 0.95)" : rgba(RAW_GREY, 0.54),
                        letterSpacing: "0.04em",
                    }}
                >
                    {ceremony.name}
                </Text>
                {!canTake && (
                    <Text
                        style={{
                            flexShrink: 0,
                            fontFamily: "Inter, sans-serif",
                            fontSize: "0.72rem",
                            color: "rgb(255, 112, 112)",
                        }}
                    >
                        needs {prerequisiteLabel}
                    </Text>
                )}
                <span style={{ color: "rgba(220, 210, 205, 0.45)", fontSize: "0.8rem", flexShrink: 0 }}>
                    {expanded ? "▲" : "▼"}
                </span>
            </button>

            {/* Expanded body */}
            {expanded && (
                <Box px={14} pb={14}>
                    <Text
                        style={{
                            fontFamily: "Crimson Text, Georgia, serif",
                            fontSize: "0.95rem",
                            color: canTake ? rgba(RAW_GREY, 0.7) : rgba(RAW_GREY, 0.46),
                            lineHeight: 1.45,
                            marginBottom: 10,
                        }}
                    >
                        {upcase(ceremony.summary)}
                    </Text>

                    <div
                        style={{
                            display: "grid",
                            gridTemplateColumns: "1fr 1fr",
                            gap: "4px 16px",
                            marginBottom: 12,
                            padding: "8px 10px",
                            borderRadius: 6,
                            background: "rgba(255, 255, 255, 0.03)",
                            border: "1px solid rgba(255, 255, 255, 0.05)",
                        }}
                    >
                        <DetailRow label="Dice Pool" value={ceremony.dicePool} />
                        <DetailRow label="Time" value={ceremony.requiredTime} />
                        <DetailRow label="Requires" value={prerequisiteLabel} />
                        <DetailRow label="Rouse Checks" value={String(ceremony.rouseChecks)} />
                    </div>

                    <Group justify="flex-end">
                        <Button
                            size="xs"
                            variant="outline"
                            color="red"
                            disabled={!canTake}
                            styles={{
                                root: {
                                    borderColor: rgba(RAW_RED, 0.5),
                                    background: rgba(RAW_RED, 0.08),
                                    letterSpacing: "0.12em",
                                    textTransform: "uppercase",
                                    fontFamily: "Cinzel, Georgia, serif",
                                    fontSize: "0.72rem",
                                    cursor: canTake ? "pointer" : "not-allowed",
                                },
                            }}
                            onClick={onTake}
                        >
                            Take {ceremony.name}
                        </Button>
                    </Group>
                </Box>
            )}
        </div>
    )
}

const CeremoniesPicker = ({ character, setCharacter, nextStep }: CeremoniesPickerProps) => {
    useEffect(() => {
        ReactGA.send({ hitType: "pageview", title: "Ceremonies Picker" })
    }, [])

    if (!containsOblivion(character.disciplines)) {
        return <></>
    }

    const phoneScreen = globals.isPhoneScreen
    const levelOneCeremonies = Ceremonies.filter((ceremony) => ceremony.level === 1)
    const canTakeAnyCeremony = levelOneCeremonies.some((ceremony) =>
        characterHasCeremonyPrerequisite(character, ceremony)
    )

    const handleTake = (ceremony: Ceremony) => {
        trackEvent({
            action: "ceremony clicked",
            category: "ceremonies",
            label: ceremony.name
        })
        setCharacter({ ...character, ceremonies: [ceremony] })
        nextStep()
    }

    const handleContinueWithoutCeremony = () => {
        trackEvent({
            action: "ceremony skipped",
            category: "ceremonies",
            label: "no valid prerequisite"
        })
        setCharacter({ ...character, ceremonies: [] })
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
                type="always"
                scrollbarSize={nightfallScrollbarSize}
                styles={nightfallScrollAreaStyles}
            >
                <div style={generatorScrollableContentStyle}>
                    <GeneratorStepHero
                        leadText="Pick your free"
                        accentText="Ceremony"
                        description="You begin with one free Level 1 ceremony when you know its prerequisite Oblivion power"
                        marginBottom={phoneScreen ? 18 : 26}
                    />

                    <Box maw={640} mx="auto" px={phoneScreen ? 4 : 0} pb="xl" w="100%">
                        <GeneratorSectionDivider
                            label="Level 1 Ceremonies"
                            lineHeight={1}
                            accentAlpha={0.38}
                            titleSize="0.88rem"
                            marginY="sm"
                        />

                        <div
                            style={{
                                borderRadius: 8,
                                border: "1px solid rgba(125, 91, 72, 0.2)",
                                background: "rgba(18, 13, 16, 0.55)",
                                overflow: "hidden",
                            }}
                        >
                            {levelOneCeremonies.map((ceremony) => {
                                const canTake = characterHasCeremonyPrerequisite(
                                    character,
                                    ceremony
                                )
                                return (
                                    <CeremonyRow
                                        key={ceremony.name}
                                        ceremony={ceremony}
                                        canTake={canTake}
                                        onTake={() => handleTake(ceremony)}
                                    />
                                )
                            })}
                        </div>

                        {!canTakeAnyCeremony ? (
                            <Box
                                mt="md"
                                p="md"
                                style={{
                                    borderRadius: 8,
                                    border: "1px solid rgba(125, 91, 72, 0.25)",
                                    background:
                                        "linear-gradient(180deg, rgba(18, 13, 16, 0.55) 0%, rgba(8, 6, 8, 1) 100%)"
                                }}
                            >
                                <Text
                                    mb="sm"
                                    style={{
                                        fontFamily: "Inter, sans-serif",
                                        fontSize: "0.86rem",
                                        color: rgba(RAW_GREY, 0.7),
                                        lineHeight: 1.45,
                                        textAlign: "center"
                                    }}
                                >
                                    None of these ceremonies match your chosen Oblivion powers.
                                </Text>
                                <Group justify="center">
                                    <Button
                                        color="red"
                                        variant="outline"
                                        onClick={handleContinueWithoutCeremony}
                                        styles={{
                                            root: {
                                                borderColor: rgba(RAW_RED, 0.4),
                                                background: rgba(RAW_RED, 0.08),
                                                letterSpacing: "0.12em",
                                                textTransform: "uppercase",
                                                fontFamily: "Cinzel, Georgia, serif",
                                                fontSize: "0.74rem"
                                            }
                                        }}
                                    >
                                        Continue without a ceremony
                                    </Button>
                                </Group>
                            </Box>
                        ) : null}
                    </Box>
                </div>
            </ScrollArea>
        </div>
    )
}

export default CeremoniesPicker
