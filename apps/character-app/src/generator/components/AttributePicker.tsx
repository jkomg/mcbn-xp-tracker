import { Text, Tooltip } from "@mantine/core"
import { RAW_GOLD, RAW_RED, RAW_GREY, rgba } from "~/theme/colors"
import { useEffect, useState } from "react"
import ReactGA from "react-ga4"
import { trackEvent } from "../../utils/analytics"
import { AttributesKey, attributeDescriptions, attributesKeySchema } from "../../data/Attributes"
import { Character } from "../../data/Character"
import { globals } from "../../globals"
import { upcase, updateHealthAndWillpowerAndBloodPotencyAndHumanity } from "../utils"
import { GeneratorPhasePrompt, GeneratorSectionDivider } from "./sharedGeneratorUi"

type AttributePickerProps = {
    character: Character
    setCharacter: (character: Character) => void
    nextStep: () => void
}

type AttributeSetting = {
    strongest: AttributesKey | null
    weakest: AttributesKey | null
    medium: AttributesKey[]
}

const ATTRIBUTE_COLUMNS: { label: string; attrs: string[] }[] = [
    { label: "Physical", attrs: ["strength", "dexterity", "stamina"] },
    { label: "Social", attrs: ["charisma", "manipulation", "composure"] },
    { label: "Mental", attrs: ["intelligence", "wits", "resolve"] }
]

const AttributePicker = ({ character, setCharacter, nextStep }: AttributePickerProps) => {
    const phoneScreen = globals.isPhoneScreen
    useEffect(() => {
        ReactGA.send({ hitType: "pageview", title: "Attribute Picker" })
    }, [])

    const [pickedAttributes, setPickedAttributes] = useState<AttributeSetting>({
        strongest: null,
        weakest: null,
        medium: []
    })

    const getAssignedLevel = (attribute: AttributesKey) => {
        if (attribute === pickedAttributes.strongest) return 4
        if (pickedAttributes.medium.includes(attribute)) return 3
        if (attribute === pickedAttributes.weakest) return 1
        return null
    }

    const alreadyPicked = (attribute: AttributesKey) =>
        [pickedAttributes.strongest, pickedAttributes.weakest, ...pickedAttributes.medium].includes(
            attribute
        )

    const handleClick = (attribute: AttributesKey) => {
        trackEvent({ action: "attribute clicked", category: "attributes", label: attribute })

        if (alreadyPicked(attribute)) {
            setPickedAttributes({
                strongest: pickedAttributes.strongest === attribute ? null : pickedAttributes.strongest,
                medium: pickedAttributes.medium.filter((it) => it !== attribute),
                weakest: pickedAttributes.weakest === attribute ? null : pickedAttributes.weakest
            })
            return
        }

        if (!pickedAttributes.strongest) {
            setPickedAttributes({ ...pickedAttributes, strongest: attribute })
        } else if (!pickedAttributes.weakest) {
            setPickedAttributes({ ...pickedAttributes, weakest: attribute })
        } else if (pickedAttributes.medium.length < 2) {
            setPickedAttributes({ ...pickedAttributes, medium: [...pickedAttributes.medium, attribute] })
        } else {
            const finalPick = { ...pickedAttributes, medium: [...pickedAttributes.medium, attribute] }
            const attributes = {
                strength: 2, charisma: 2, intelligence: 2,
                dexterity: 2, manipulation: 2, wits: 2,
                stamina: 2, composure: 2, resolve: 2
            }
            attributes[finalPick.strongest!] = 4
            attributes[finalPick.weakest!] = 1
            finalPick.medium.forEach((m) => (attributes[m] = 3))
            updateHealthAndWillpowerAndBloodPotencyAndHumanity(character)
            setCharacter({ ...character, attributes })
            nextStep()
        }
    }

    const createRow = (attribute: AttributesKey) => {
        const level = getAssignedLevel(attribute)
        const picked = alreadyPicked(attribute)

        const borderColor = level === 4
            ? rgba(RAW_RED, 0.85)
            : level === 3
              ? rgba(RAW_GOLD, 0.75)
              : level === 1
                ? "rgba(140, 130, 125, 0.5)"
                : "rgba(255,255,255,0.05)"

        const bg = level === 4
            ? rgba(RAW_RED, 0.1)
            : level === 3
              ? "rgba(204, 166, 51, 0.1)"
              : level === 1
                ? "rgba(50, 45, 42, 0.5)"
                : "transparent"

        const nameColor = level === 4
            ? rgba(RAW_RED, 1)
            : level === 3
              ? rgba(RAW_GOLD, 0.9)
              : level === 1
                ? rgba(RAW_GREY, 0.5)
                : rgba(RAW_GREY, 0.85)

        const dotColor = (dotIndex: number) => {
            if (dotIndex >= (level ?? 0)) return "rgba(255,255,255,0.1)"
            if (level === 4) return rgba(RAW_RED, 0.9)
            if (level === 3) return "rgba(232, 204, 92, 0.9)"
            return "rgba(160, 150, 145, 0.7)"
        }

        return (
            <Tooltip
                key={attribute}
                disabled={picked}
                label={attributeDescriptions[attribute]}
                transitionProps={{ transition: "slide-up", duration: 200 }}
                events={globals.tooltipTriggerEvents}
            >
                <div
                    data-testid={`attribute-${attribute}-button`}
                    onClick={() => handleClick(attribute)}
                    onMouseEnter={(e) => {
                        if (!picked) {
                            e.currentTarget.style.borderLeftColor = rgba(RAW_RED, 0.5)
                            e.currentTarget.style.background = rgba(RAW_RED, 0.05)
                        }
                    }}
                    onMouseLeave={(e) => {
                        if (!picked) {
                            e.currentTarget.style.borderLeftColor = "rgba(255,255,255,0.05)"
                            e.currentTarget.style.background = "transparent"
                        }
                    }}
                    style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: phoneScreen ? "7px 8px" : "8px 10px",
                        borderLeft: `3px solid ${borderColor}`,
                        borderBottom: "1px solid rgba(255,255,255,0.04)",
                        background: bg,
                        cursor: "pointer",
                        transition: "border-left-color 130ms ease, background 130ms ease"
                    }}
                >
                    <Text
                        style={{
                            fontFamily: "Cinzel, Georgia, serif",
                            fontSize: phoneScreen ? "0.78rem" : "0.86rem",
                            fontWeight: level ? 600 : 400,
                            letterSpacing: "0.06em",
                            color: nameColor
                        }}
                    >
                        {upcase(attribute)}
                    </Text>
                    {!phoneScreen && (
                        <div style={{ display: "flex", gap: 3, marginLeft: 6 }}>
                            {Array.from({ length: 5 }).map((_, i) => (
                                <div
                                    key={i}
                                    style={{
                                        width: 6,
                                        height: 6,
                                        borderRadius: "50%",
                                        background: dotColor(i),
                                        boxShadow: i < (level ?? 0) && level === 4 ? `0 0 5px ${rgba(RAW_RED, 0.4)}` : "none"
                                    }}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </Tooltip>
        )
    }

    const toPick = (() => {
        if (!pickedAttributes.strongest) return "strongest"
        if (!pickedAttributes.weakest) return "weakest"
        return "medium"
    })()

    const phases = [
        {
            key: "strongest",
            prompt: "Pick your",
            bold: "strongest",
            suffix: "attribute",
            level: 4,
            done: !!pickedAttributes.strongest
        },
        {
            key: "weakest",
            prompt: "Pick your",
            bold: "weakest",
            suffix: "attribute",
            level: 1,
            done: !!pickedAttributes.weakest
        },
        {
            key: "medium",
            prompt: `Pick ${3 - pickedAttributes.medium.length}`,
            bold: "medium",
            suffix: `attribute${pickedAttributes.medium.length < 2 ? "s" : ""}`,
            level: 3,
            done: pickedAttributes.medium.length === 2
        }
    ]

    return (
        <div>
            <GeneratorPhasePrompt
                lines={phases}
                activeKey={toPick}
                phoneScreen={phoneScreen}
                footerText="Remaining attributes will be lvl 2"
            />

            <GeneratorSectionDivider label="Attributes" />

            <div style={{ display: "flex", gap: phoneScreen ? 6 : 12 }}>
                {ATTRIBUTE_COLUMNS.map((col) => (
                    <div key={col.label} style={{ flex: 1, minWidth: 0 }}>
                        <Text
                            ta="center"
                            mb={6}
                            style={{
                                fontFamily: "Cinzel, Georgia, serif",
                                fontSize: "0.72rem",
                                letterSpacing: "0.18em",
                                textTransform: "uppercase",
                                color: rgba(RAW_GOLD, 0.6)
                            }}
                        >
                            {col.label}
                        </Text>
                        <div style={{ borderRadius: 6, overflow: "hidden", border: "1px solid rgba(255,255,255,0.05)" }}>
                            {col.attrs.map((a) => createRow(attributesKeySchema.parse(a)))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}

export default AttributePicker
