import { Button, ScrollArea, Space, Text, Tooltip } from "@mantine/core"
import { RAW_GOLD, RAW_GREY, RAW_RED, rgba } from "~/theme/colors"
import { useDisclosure } from "@mantine/hooks"
import { useEffect, useState } from "react"
import ReactGA from "react-ga4"
import { trackEvent } from "../../utils/analytics"
import { Character } from "../../data/Character"
import {
    Skills,
    SkillsKey,
    emptySkills,
    skillsDescriptions,
    skillsKeySchema
} from "../../data/Skills"
import { globals } from "../../globals"
import { upcase } from "../utils"
import { SpecialtyModal } from "./SkillSpecialtyModal"
import {
    GeneratorPhasePrompt,
    GeneratorSectionDivider,
    GeneratorStepHero
} from "./sharedGeneratorUi"

type SkillsPickerProps = {
    character: Character
    setCharacter: (character: Character) => void
    nextStep: () => void
}

type SkillsSetting = {
    special: SkillsKey[]
    strongest: SkillsKey[]
    decent: SkillsKey[]
    acceptable: SkillsKey[]
}

type DistributionKey = "Jack of All Trades" | "Balanced" | "Specialist"

type SkillDistribution = { strongest: number; decent: number; acceptable: number; special: number }

const distributionDescriptions: Record<DistributionKey, string> = {
    "Jack of All Trades": "Decent at many things, good at none (1/8/10)",
    Balanced: "Best default choice (3/5/7)",
    Specialist: "Uniquely great at one thing, bad at most (1/3/3/3)"
}

const distributionByType: Record<DistributionKey, SkillDistribution> = {
    "Jack of All Trades": {
        special: 0,
        strongest: 1,
        decent: 8,
        acceptable: 10
    },
    Balanced: {
        special: 0,
        strongest: 3,
        decent: 5,
        acceptable: 7
    },
    Specialist: {
        special: 1,
        strongest: 3,
        decent: 3,
        acceptable: 3
    }
}

const getAll = (skillSetting: SkillsSetting): SkillsKey[] => {
    return Object.values(skillSetting).reduce((acc, s) => [...acc, ...s], [])
}

const SkillsPicker = ({ character, setCharacter, nextStep }: SkillsPickerProps) => {
    const phoneScreen = globals.isPhoneScreen

    useEffect(() => {
        ReactGA.send({ hitType: "pageview", title: "Skills Picker" })
    }, [])

    const [modalOpened, { open: openModal, close: closeModal }] = useDisclosure(false)
    const [skills, setSkills] = useState(emptySkills)
    const [pickedSkills, setPickedSkills] = useState<SkillsSetting>({
        special: [],
        strongest: [],
        decent: [],
        acceptable: []
    })
    const [pickedDistribution, setPickedDistribution] = useState<DistributionKey | null>(null)
    const distr = pickedDistribution
        ? distributionByType[pickedDistribution]
        : { special: 0, strongest: 0, decent: 0, acceptable: 0 }

    const getAssignedLevel = (skill: SkillsKey) => {
        if (pickedSkills.special.includes(skill)) return 4
        if (pickedSkills.strongest.includes(skill)) return 3
        if (pickedSkills.decent.includes(skill)) return 2
        if (pickedSkills.acceptable.includes(skill)) return 1
        return null
    }

    const isAlreadyPicked = (skill: SkillsKey) =>
        [...pickedSkills.special, ...pickedSkills.strongest, ...pickedSkills.decent, ...pickedSkills.acceptable].includes(skill)

    const handleSkillClick = (skill: SkillsKey) => {
        if (pickedDistribution === null) return
        trackEvent({ action: "skill clicked", category: "skills", label: skill })

        if (isAlreadyPicked(skill)) {
            setPickedSkills({
                special: pickedSkills.special.filter((it) => it !== skill),
                strongest: pickedSkills.strongest.filter((it) => it !== skill),
                decent: pickedSkills.decent.filter((it) => it !== skill),
                acceptable: pickedSkills.acceptable.filter((it) => it !== skill)
            })
            return
        }

        if (pickedSkills.special.length < distr.special) {
            setPickedSkills({ ...pickedSkills, special: [...pickedSkills.special, skill] })
        } else if (pickedSkills.strongest.length < distr.strongest) {
            setPickedSkills({ ...pickedSkills, strongest: [...pickedSkills.strongest, skill] })
        } else if (pickedSkills.decent.length < distr.decent) {
            setPickedSkills({ ...pickedSkills, decent: [...pickedSkills.decent, skill] })
        } else if (pickedSkills.acceptable.length < distr.acceptable - 1) {
            setPickedSkills({ ...pickedSkills, acceptable: [...pickedSkills.acceptable, skill] })
        } else {
            const finalPick = { ...pickedSkills, acceptable: [...pickedSkills.acceptable, skill] }
            const skills: Skills = {
                athletics: 0, brawl: 0, craft: 0, drive: 0, firearms: 0,
                melee: 0, larceny: 0, stealth: 0, survival: 0,
                "animal ken": 0, etiquette: 0, insight: 0, intimidation: 0,
                leadership: 0, performance: 0, persuasion: 0, streetwise: 0, subterfuge: 0,
                academics: 0, awareness: 0, finance: 0, investigation: 0,
                medicine: 0, occult: 0, politics: 0, science: 0, technology: 0
            }
            finalPick.special.forEach((s) => (skills[s] = 4))
            finalPick.strongest.forEach((s) => (skills[s] = 3))
            finalPick.decent.forEach((s) => (skills[s] = 2))
            finalPick.acceptable.forEach((s) => (skills[s] = 1))
            setPickedSkills(finalPick)
            setSkills(skills)
            openModal()
        }
    }

    const createSkillRow = (skill: SkillsKey) => {
        const level = getAssignedLevel(skill)
        const picked = isAlreadyPicked(skill)
        const disabled = pickedDistribution === null

        const borderColor = level === 4
            ? rgba(RAW_RED, 0.85)
            : level === 3
              ? rgba(RAW_RED, 0.6)
              : level === 2
                ? rgba(RAW_GOLD, 0.7)
                : level === 1
                  ? "rgba(140, 130, 125, 0.5)"
                  : "rgba(255,255,255,0.05)"

        const bg = level === 4
            ? rgba(RAW_RED, 0.12)
            : level === 3
              ? rgba(RAW_RED, 0.06)
              : level === 2
                ? "rgba(204, 166, 51, 0.09)"
                : level === 1
                  ? "rgba(50, 45, 42, 0.45)"
                  : "transparent"

        const nameColor = level === 4
            ? rgba(RAW_RED, 1)
            : level === 3
              ? rgba(RAW_RED, 0.85)
              : level === 2
                ? rgba(RAW_GOLD, 0.9)
                : level === 1
                  ? rgba(RAW_GREY, 0.55)
                  : disabled
                    ? rgba(RAW_GREY, 0.35)
                    : rgba(RAW_GREY, 0.82)

        const dotColor = (i: number) => {
            if (i >= (level ?? 0)) return "rgba(255,255,255,0.08)"
            if (level === 4 || level === 3) return rgba(RAW_RED, 0.85)
            if (level === 2) return "rgba(232, 204, 92, 0.85)"
            return "rgba(160, 150, 145, 0.65)"
        }

        return (
            <Tooltip
                key={skill}
                disabled={picked || disabled}
                label={skillsDescriptions[skill]}
                transitionProps={{ transition: "slide-up", duration: 200 }}
                events={globals.tooltipTriggerEvents}
            >
                <div
                    data-testid={`skill-${skill.replace(/\s+/g, "-")}-button`}
                    onClick={() => handleSkillClick(skill)}
                    onMouseEnter={(e) => {
                        if (!picked && !disabled) {
                            e.currentTarget.style.borderLeftColor = rgba(RAW_RED, 0.45)
                            e.currentTarget.style.background = rgba(RAW_RED, 0.04)
                        }
                    }}
                    onMouseLeave={(e) => {
                        if (!picked && !disabled) {
                            e.currentTarget.style.borderLeftColor = "rgba(255,255,255,0.05)"
                            e.currentTarget.style.background = "transparent"
                        }
                    }}
                    style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: phoneScreen ? "6px 7px" : "7px 9px",
                        borderLeft: `3px solid ${borderColor}`,
                        borderBottom: "1px solid rgba(255,255,255,0.04)",
                        background: bg,
                        cursor: disabled ? "default" : "pointer",
                        opacity: disabled ? 0.45 : 1,
                        transition: "border-left-color 130ms ease, background 130ms ease"
                    }}
                >
                    <Text
                        style={{
                            fontFamily: "Cinzel, Georgia, serif",
                            fontSize: phoneScreen ? "0.7rem" : "0.78rem",
                            fontWeight: level ? 600 : 400,
                            letterSpacing: "0.05em",
                            color: nameColor
                        }}
                    >
                        {upcase(skill)}
                    </Text>
                    {!phoneScreen && (
                        <div style={{ display: "flex", gap: 2, marginLeft: 4 }}>
                            {Array.from({ length: 5 }).map((_, i) => (
                                <div
                                    key={i}
                                    style={{
                                        width: 5,
                                        height: 5,
                                        borderRadius: "50%",
                                        background: dotColor(i)
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
        if (pickedSkills.special.length < distr.special) return "special"
        if (pickedSkills.strongest.length < distr.strongest) return "strongest"
        if (pickedSkills.decent.length < distr.decent) return "decent"
        return "acceptable"
    })()

    const closeModalAndUndoLastPick = () => {
        setPickedSkills({ ...pickedSkills, acceptable: pickedSkills.acceptable.slice(0, -1) })
        closeModal()
    }

    const SKILL_COLUMNS: { label: string; skills: string[] }[] = [
        { label: "Physical", skills: ["athletics", "brawl", "craft", "drive", "firearms", "melee", "larceny", "stealth", "survival"] },
        { label: "Social", skills: ["animal ken", "etiquette", "insight", "intimidation", "leadership", "performance", "persuasion", "streetwise", "subterfuge"] },
        { label: "Mental", skills: ["academics", "awareness", "finance", "investigation", "medicine", "occult", "politics", "science", "technology"] }
    ]

    const createSkillButtons = () => (
        <div style={{ display: "flex", gap: phoneScreen ? 4 : 10 }}>
            {SKILL_COLUMNS.map((col) => (
                <div key={col.label} style={{ flex: 1, minWidth: 0 }}>
                    <Text
                        ta="center"
                        mb={6}
                        style={{
                            fontFamily: "Cinzel, Georgia, serif",
                            fontSize: phoneScreen ? "0.62rem" : "0.7rem",
                            letterSpacing: "0.16em",
                            textTransform: "uppercase",
                            color: rgba(RAW_GOLD, 0.6)
                        }}
                    >
                        {col.label}
                    </Text>
                    <div style={{ borderRadius: 6, overflow: "hidden", border: "1px solid rgba(255,255,255,0.05)" }}>
                        {col.skills.map((s) => createSkillRow(skillsKeySchema.parse(s)))}
                    </div>
                </div>
            ))}
        </div>
    )

    const height = globals.viewportHeightPx
    const phases = [
        pickedDistribution === "Specialist"
            ? {
                  key: "special",
                  prompt: "Pick your",
                  bold: `${distr.special - pickedSkills.special.length}`,
                  suffix: "specialty skill",
                  level: 4,
                  done: pickedSkills.special.length === distr.special
              }
            : null,
        {
            key: "strongest",
            prompt: "Pick your",
            bold: `${distr.strongest - pickedSkills.strongest.length} strongest`,
            suffix: "skills",
            level: 3,
            done: pickedSkills.strongest.length === distr.strongest
        },
        {
            key: "decent",
            prompt: "Pick",
            bold: `${distr.decent - pickedSkills.decent.length}`,
            suffix: "skills you're decent in",
            level: 2,
            done: pickedSkills.decent.length === distr.decent
        },
        {
            key: "acceptable",
            prompt: "Pick",
            bold: `${distr.acceptable - pickedSkills.acceptable.length}`,
            suffix: "skills you're ok in",
            level: 1,
            done: pickedSkills.acceptable.length === distr.acceptable
        }
    ].filter(Boolean) as Array<{
        key: string
        prompt: string
        bold: string
        suffix: string
        level: number
        done: boolean
    }>

    return (
        <div style={{ marginTop: height < globals.heightBreakPoint ? "60px" : 0 }}>
            {!pickedDistribution ? (
                <>
                    <GeneratorStepHero
                        leadText="Pick your"
                        accentText="Skill Distribution"
                        description="Balanced is the default choice"
                        marginBottom={phoneScreen ? 20 : 28}
                    />
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 480, margin: "0 auto" }}>
                        {(["Jack of All Trades", "Balanced", "Specialist"] as DistributionKey[]).map((distribution) => (
                            <Tooltip
                                key={distribution}
                                label={distributionDescriptions[distribution]}
                                transitionProps={{ transition: "slide-up", duration: 200 }}
                                events={globals.tooltipTriggerEvents}
                            >
                                <div
                                    data-testid={`skill-distribution-${distribution.toLowerCase().replace(/\s+/g, "-")}-button`}
                                    onClick={() => setPickedDistribution(distribution)}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.borderColor = rgba(RAW_RED, 0.55)
                                        e.currentTarget.style.background = rgba(RAW_RED, 0.07)
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.borderColor = "rgba(125, 91, 72, 0.35)"
                                        e.currentTarget.style.background = "rgba(26, 20, 24, 0.78)"
                                    }}
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "space-between",
                                        padding: "14px 18px",
                                        borderRadius: 8,
                                        border: "1px solid rgba(125, 91, 72, 0.35)",
                                        background: "rgba(26, 20, 24, 0.78)",
                                        cursor: "pointer",
                                        transition: "border-color 140ms ease, background 140ms ease"
                                    }}
                                >
                                    <Text
                                        style={{
                                            fontFamily: "Cinzel, Georgia, serif",
                                            fontSize: phoneScreen ? "0.9rem" : "1rem",
                                            fontWeight: 600,
                                            letterSpacing: "0.05em",
                                            color: "rgba(244, 236, 232, 0.92)"
                                        }}
                                    >
                                        {distribution}
                                    </Text>
                                    <Text
                                        style={{
                                            fontFamily: "Inter, Segoe UI, sans-serif",
                                            fontSize: "0.78rem",
                                            color: rgba(RAW_GREY, 0.5),
                                            letterSpacing: "0.02em"
                                        }}
                                    >
                                        {distributionDescriptions[distribution]}
                                    </Text>
                                </div>
                            </Tooltip>
                        ))}
                    </div>
                    <Space h="xl" />
                    <Space h="xl" />
                </>
            ) : (
                <GeneratorPhasePrompt
                    lines={phases}
                    activeKey={toPick}
                    phoneScreen={phoneScreen}
                    caption={pickedDistribution}
                />
            )}

            <GeneratorSectionDivider label="Skills" />

            <Space h="sm" />

            {height < globals.heightBreakPoint ? (
                <ScrollArea h={height - 340}>{createSkillButtons()}</ScrollArea>
            ) : (
                createSkillButtons()
            )}

            <SpecialtyModal
                modalOpened={modalOpened}
                closeModal={closeModalAndUndoLastPick}
                setCharacter={setCharacter}
                nextStep={nextStep}
                character={character}
                pickedSkillNames={getAll(pickedSkills)}
                skills={skills}
            />
        </div>
    )
}

export default SkillsPicker
