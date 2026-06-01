import { Badge, Box, Button, Group, ScrollArea, Text } from "@mantine/core"
import { RAW_GOLD, RAW_GREY, RAW_RED, rgba } from "~/theme/colors"
import { useEffect, useState } from "react"
import ReactGA from "react-ga4"
import { trackEvent } from "../../utils/analytics"
import { Character, containsBloodSorcery } from "../../data/Character"
import { Ritual } from "../../data/Disciplines"
import { Rituals } from "../../data/Rituals"
import { upcase } from "../utils"
import {
    generatorScrollableAreaStyle,
    generatorScrollableContentStyle,
    generatorScrollableShellStyle
} from "./sharedGeneratorScrollableLayout"
import { nightfallScrollAreaStyles, nightfallScrollbarSize } from "./sharedScrollAreaStyles"
import { globals } from "../../globals"
import { GeneratorSectionDivider, GeneratorStepHero } from "./sharedGeneratorUi"

type RitualsPickerProps = {
    character: Character
    setCharacter: (character: Character) => void
    nextStep: () => void
}

const GOLD_LABEL_COLOR = rgba(RAW_GOLD, 1)

const RitualRow = ({ ritual, onTake }: { ritual: Ritual; onTake: () => void }) => {
    const [expanded, setExpanded] = useState(false)

    return (
        <div style={{ borderBottom: "1px solid rgba(125, 91, 72, 0.15)" }}>
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
                    lv {ritual.level}
                </Badge>
                <Text
                    style={{
                        flex: 1,
                        fontFamily: "Cinzel, Georgia, serif",
                        fontSize: "0.88rem",
                        fontWeight: 700,
                        color: "rgba(244, 236, 232, 0.95)",
                        letterSpacing: "0.04em",
                    }}
                >
                    {ritual.name}
                </Text>
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
                            color: rgba(RAW_GREY, 0.7),
                            lineHeight: 1.45,
                            marginBottom: 10,
                        }}
                    >
                        {upcase(ritual.summary)}
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
                        <DetailRow label="Dice Pool" value={ritual.dicePool} />
                        <DetailRow label="Time" value={ritual.requiredTime} />
                        <DetailRow label="Ingredients" value={ritual.ingredients} />
                        <DetailRow label="Rouse Checks" value={String(ritual.rouseChecks)} />
                    </div>

                    <Group justify="flex-end">
                        <Button
                            size="xs"
                            variant="outline"
                            color="red"
                            styles={{
                                root: {
                                    borderColor: rgba(RAW_RED, 0.5),
                                    background: rgba(RAW_RED, 0.08),
                                    letterSpacing: "0.12em",
                                    textTransform: "uppercase",
                                    fontFamily: "Cinzel, Georgia, serif",
                                    fontSize: "0.72rem",
                                },
                            }}
                            onClick={onTake}
                        >
                            Take {ritual.name}
                        </Button>
                    </Group>
                </Box>
            )}
        </div>
    )
}

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

const RitualsPicker = ({ character, setCharacter, nextStep }: RitualsPickerProps) => {
    useEffect(() => {
        ReactGA.send({ hitType: "pageview", title: "Rituals Picker" })
    }, [])

    if (!containsBloodSorcery(character.disciplines)) {
        return <></>
    }

    const phoneScreen = globals.isPhoneScreen

    const handleTake = (ritual: Ritual) => {
        trackEvent({ action: "ritual clicked", category: "rituals", label: ritual.name })
        setCharacter({ ...character, rituals: [ritual] })
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
                        accentText="Ritual"
                        description="Blood Sorcerers begin with one free Level 1 ritual"
                        marginBottom={phoneScreen ? 18 : 26}
                    />

                    <Box maw={640} mx="auto" px={phoneScreen ? 4 : 0} pb="xl" w="100%">
                        <GeneratorSectionDivider
                            label="Level 1 Rituals"
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
                            {Rituals.map((ritual) => (
                                <RitualRow
                                    key={ritual.name}
                                    ritual={ritual}
                                    onTake={() => handleTake(ritual)}
                                />
                            ))}
                        </div>
                    </Box>
                </div>
            </ScrollArea>
        </div>
    )
}

export default RitualsPicker
