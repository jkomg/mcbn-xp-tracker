import { faPlay } from "@fortawesome/free-solid-svg-icons"
import { COLOR_RED, RAW_GREY, RAW_RED, RAW_GRAPE, rgba } from "~/theme/colors"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import {
    Box,
    Button,
    Divider,
    Grid,
    Group,
    ScrollArea,
    Stack,
    Tabs,
    Text,
    Tooltip,
    useMantineTheme
} from "@mantine/core"
import React, { Dispatch, memo, SetStateAction, useEffect, useMemo, useState } from "react"
import ReactGA from "react-ga4"
import { trackEvent } from "../../utils/analytics"
import { Character, MeritFlaw } from "../../data/Character"
import { clans } from "../../data/Clans"
import {
    advancedMeritsAndFlaws,
    essentialMeritsAndFlaws,
    essentialThinbloodMeritsAndFlaws,
    isThinbloodFlaw,
    isThinbloodMerit,
    MeritOrFlaw
} from "../../data/MeritsAndFlaws"
import { PredatorTypes } from "../../data/PredatorType"
import { globals } from "../../globals"
import { LORESHEETS, LoresheetDot } from "~/data/Loresheets"
import { IconCheck } from "@tabler/icons-react"
import { updateHealthAndWillpowerAndBloodPotencyAndHumanity } from "../utils"
import {
    generatorScrollableContentStyle,
    generatorScrollableShellStyle
} from "./sharedGeneratorScrollableLayout"
import { generatorConfirmButtonStyles } from "./sharedGeneratorConfirmButtonStyles"
import { nightfallScrollAreaStyles, nightfallScrollbarSize } from "./sharedScrollAreaStyles"
import ConfirmActionModal from "~/components/ConfirmActionModal"
import { GeneratorSectionDivider, GeneratorStepHero } from "./sharedGeneratorUi"

type MeritsAndFlawsPickerProps = {
    character: Character
    setCharacter: (character: Character) => void
    nextStep: () => void
}

type ResetTarget = "merit" | "flaw" | null

const flawIcon = () => {
    return <FontAwesomeIcon icon={faPlay} rotation={90} style={{ color: COLOR_RED }} />
}
const meritIcon = () => {
    return <FontAwesomeIcon icon={faPlay} rotation={270} style={{ color: "rgb(47, 158, 68)" }} />
}


const SOURCE_LABELS: Record<string, string> = {
    core: "Core",
    camarilla: "Camarilla",
    anarch: "Anarch",
    chicago: "Chicago by Night",
    "players-guide": "Player's Guide",
    "gehenna-war": "Gehenna War",
    "in-memoriam": "In Memoriam",
    "tattered-facade": "Tattered Facade",
    "blood-sigils": "Blood Sigils",
    "cults-of-the-blood-gods": "Cults of the Blood Gods",
    "chicago-folios": "Chicago Folios",
    "children-of-the-blood": "Children of the Blood",
    "book-of-nod-apocrypha": "Book of Nod Apocrypha",
    "let-the-streets-run-red": "Let the Streets Run Red",
    "fall-of-london": "The Fall of London",
    "forbidden-religions": "Forbidden Religions",
    "trails-of-ash-and-bone": "Trails of Ash and Bone",
    download: "Download",
    "winters-teeth": "Winter's Teeth",
    custom: "Nashville",
}

type MeritOrFlawCardProps = {
    meritOrFlaw: MeritOrFlaw
    type: "flaw" | "merit"
    pickedByName: Map<string, MeritFlaw>
    exclusionMap: Map<string, string[]>
    predatorTypeMeritsByName: Map<string, MeritFlaw>
    remainingMerits: number
    remainingFlaws: number
    remainingThinbloodMeritPoints: number
    phoneScreen: boolean
    setPickedMeritsAndFlaws: Dispatch<SetStateAction<MeritFlaw[]>>
    setRemainingMerits: Dispatch<SetStateAction<number>>
    setRemainingFlaws: Dispatch<SetStateAction<number>>
    setRemainingThinbloodMeritPoints: Dispatch<SetStateAction<number>>
}

const MeritOrFlawCard = memo(
    ({
        meritOrFlaw,
        type,
        pickedByName,
        exclusionMap,
        predatorTypeMeritsByName,
        remainingMerits,
        remainingFlaws,
        remainingThinbloodMeritPoints,
        phoneScreen,
        setPickedMeritsAndFlaws,
        setRemainingMerits,
        setRemainingFlaws,
        setRemainingThinbloodMeritPoints
    }: MeritOrFlawCardProps) => {
        const buttonColor = type === "flaw" ? "red" : "teal"
        const icon = type === "flaw" ? flawIcon() : meritIcon()
        const lineKey = `${type}-${meritOrFlaw.name}`
        const accentColor = type === "flaw" ? rgba(RAW_RED, 0.92) : "rgba(63, 192, 120, 0.92)"
        const selectedBg = type === "flaw" ? rgba(RAW_RED, 0.18) : "rgba(46, 160, 67, 0.16)"
        const selectedBorder = type === "flaw" ? rgba(RAW_RED, 0.38) : "rgba(63, 192, 120, 0.32)"
        const baseBg = "rgba(255, 255, 255, 0.03)"
        const baseBorder = "rgba(255, 255, 255, 0.06)"

        const alreadyPickedItem = pickedByName.get(meritOrFlaw.name)
        const wasPickedLevel = alreadyPickedItem?.level ?? 0
        const excludingItems = exclusionMap.get(meritOrFlaw.name) ?? []
        const isExcluded = excludingItems.length > 0

        const meritInPredatorType = predatorTypeMeritsByName.get(meritOrFlaw.name)
        const meritInPredatorTypeLevel = meritInPredatorType?.level ?? 0

        const createButton = (level: number) => {
            const cost = level - meritInPredatorTypeLevel
            return (
                <Button
                    key={meritOrFlaw.name + level}
                    disabled={
                        isExcluded ||
                        (meritInPredatorType && meritInPredatorType.level >= level) ||
                        wasPickedLevel === level
                    }
                    onClick={() => {
                        if (isThinbloodFlaw(meritOrFlaw.name)) {
                            setRemainingThinbloodMeritPoints((prev) => prev + 1)
                        } else if (isThinbloodMerit(meritOrFlaw.name)) {
                            if (remainingThinbloodMeritPoints < cost) return
                            setRemainingThinbloodMeritPoints((prev) => prev - 1)
                        } else if (type === "flaw") {
                            if (remainingFlaws + wasPickedLevel < cost) return
                            setRemainingFlaws((prev) => prev + wasPickedLevel - cost)
                        } else {
                            if (remainingMerits + wasPickedLevel < cost) return
                            setRemainingMerits((prev) => prev + wasPickedLevel - cost)
                        }
                        setPickedMeritsAndFlaws((prev) => [
                            ...prev.filter((m) => m.name !== meritOrFlaw.name),
                            {
                                name: meritOrFlaw.name,
                                level,
                                type,
                                summary: meritOrFlaw.summary,
                                excludes: meritOrFlaw.excludes
                            }
                        ])
                    }}
                    style={{ marginRight: "5px" }}
                    size="xs"
                    variant={alreadyPickedItem?.level === level ? "filled" : "outline"}
                    color={buttonColor}
                    styles={{
                        root: {
                            minWidth: 36,
                            borderColor:
                                type === "flaw" ? rgba(RAW_RED, 0.45) : "rgba(63, 192, 120, 0.4)",
                            background:
                                alreadyPickedItem?.level === level ? accentColor : "transparent",
                            color: "rgba(244, 236, 232, 0.92)"
                        }
                    }}
                >
                    {level}
                </Button>
            )
        }

        const cost = wasPickedLevel - meritInPredatorTypeLevel
        const summaryText = meritInPredatorType
            ? "Already picked in Predator Type"
            : isExcluded
              ? `Excluded by: ${excludingItems.join(", ")}`
              : meritOrFlaw.summary

        const textContent = (
            <Box
                key={lineKey}
                style={{
                    padding: phoneScreen ? "8px 10px" : "9px 12px",
                    borderRadius: 5,
                    borderLeft: alreadyPickedItem ? `3px solid ${accentColor}` : "3px solid transparent",
                    borderBottom: `1px solid ${alreadyPickedItem ? selectedBorder : baseBorder}`,
                    background: alreadyPickedItem ? selectedBg : "transparent",
                    opacity: isExcluded ? 0.5 : 1,
                    transition: "background 180ms ease",
                }}
            >
                <Group justify="space-between" align="center" gap="xs" wrap="nowrap">
                    <Text
                        style={{
                            fontFamily: "Cinzel, Georgia, serif",
                            fontSize: phoneScreen ? "0.84rem" : "0.88rem",
                            fontWeight: 600,
                            lineHeight: 1.3,
                            color: alreadyPickedItem ? accentColor : "rgba(244, 236, 232, 0.94)",
                            flex: 1,
                            minWidth: 0,
                        }}
                    >
                        {icon} &nbsp;<span>{meritOrFlaw.name}</span>
                    </Text>
                    <Group gap={4} style={{ flexShrink: 0 }}>
                        {meritOrFlaw.cost.map((i) => createButton(i))}
                        {alreadyPickedItem ? (
                            <Button
                                onClick={() => {
                                    setPickedMeritsAndFlaws((prev) =>
                                        prev.filter((m) => m.name !== meritOrFlaw.name)
                                    )
                                    if (isThinbloodFlaw(meritOrFlaw.name)) {
                                        setRemainingThinbloodMeritPoints((prev) => prev - 1)
                                    } else if (isThinbloodMerit(meritOrFlaw.name)) {
                                        setRemainingThinbloodMeritPoints((prev) => prev + 1)
                                    } else if (type === "flaw") {
                                        setRemainingFlaws((prev) => prev + cost)
                                    } else {
                                        setRemainingMerits((prev) => prev + cost)
                                    }
                                }}
                                size="xs"
                                variant="subtle"
                                color="yellow"
                                styles={{ root: { paddingLeft: 6, paddingRight: 6 } }}
                            >
                                ×
                            </Button>
                        ) : null}
                    </Group>
                </Group>

                <Text
                    style={{
                        fontFamily: "Crimson Text, Georgia, serif",
                        fontSize: phoneScreen ? "0.88rem" : "0.92rem",
                        lineHeight: 1.4,
                        color: meritInPredatorType
                            ? "rgba(212, 176, 105, 0.88)"
                            : isExcluded
                              ? rgba(RAW_GREY, 0.6)
                              : rgba(RAW_GREY, 0.72),
                        marginTop: 2,
                    }}
                >
                    {summaryText}
                </Text>
            </Box>
        )

        if (isExcluded) {
            return (
                <Tooltip
                    key={lineKey}
                    label={`This ${type} is excluded because you already have: ${excludingItems.join(", ")}`}
                    withArrow
                >
                    {textContent}
                </Tooltip>
            )
        }

        return textContent
    }
)

const MeritsAndFlawsPicker = ({ character, setCharacter, nextStep }: MeritsAndFlawsPickerProps) => {
    useEffect(() => {
        ReactGA.send({ hitType: "pageview", title: "Merits-and-flaws Picker" })
    }, [])
    const theme = useMantineTheme()
    const phoneScreen = globals.isPhoneScreen

    const [activeTab, setActiveTab] = useState<string | null>("backgrounds")
    const [resetTarget, setResetTarget] = useState<ResetTarget>(null)

    const [pickedMeritsAndFlaws, setPickedMeritsAndFlaws] = useState<MeritFlaw[]>([
        ...character.merits,
        ...character.flaws
    ])

    const predatorTypeProvidedNames = useMemo(() => {
        const autoPredatorTypeNames =
            PredatorTypes[character.predatorType.name]?.meritsAndFlaws.map((item) => item.name) ??
            []
        const pickedPredatorTypeNames = character.predatorType.pickedMeritsAndFlaws.map(
            (item) => item.name
        )

        return new Set([...autoPredatorTypeNames, ...pickedPredatorTypeNames])
    }, [character.predatorType.name, character.predatorType.pickedMeritsAndFlaws])

    const usedMeritsLevel = character.merits
        .filter((m) => !isThinbloodMerit(m.name) && !predatorTypeProvidedNames.has(m.name))
        .reduce((acc, { level }) => acc + level, 0)
    const usedFLawsLevel = character.flaws
        .filter((f) => !isThinbloodFlaw(f.name) && !predatorTypeProvidedNames.has(f.name))
        .reduce((acc, { level }) => acc + level, 0)

    const isImAncilla =
        character.age_category === "ancilla" &&
        !!character.in_memoriam &&
        !character.in_memoriam.use_standard
    const imGen = character.im_generation ?? ""
    const meritPoints = isImAncilla
        ? imGen === "9-8" ? 0 : 8
        : character.age_category === "ancilla" ? 9 : 7
    const flawPoints = isImAncilla
        ? imGen === "12" ? 0 : imGen === "9-8" ? 5 : 3
        : character.age_category === "ancilla" ? 4 : 2

    const [remainingMerits, setRemainingMerits] = useState(meritPoints - usedMeritsLevel)
    const [remainingFlaws, setRemainingFlaws] = useState(flawPoints - usedFLawsLevel)

    const isThinBlood = character.clan === "Thin-blood"
    const tbMeritCount = character.merits.filter((m) => isThinbloodMerit(m.name)).length
    const tbFlawCount = character.flaws.filter((f) => isThinbloodFlaw(f.name)).length
    const [remainingThinbloodMeritPoints, setRemainingThinbloodMeritPoints] = useState(
        tbFlawCount - tbMeritCount
    )

    // Categories treated as Backgrounds (shown in alphabetical flat list)
    const ESSENTIAL_BG_TITLES = new Set(["🏠 Haven", "💰 Resources", "🧛 Kindred", "👱 Mortals"])
    const ADVANCED_BG_TITLES = new Set(["Haven", "Resources", "Fame", "Influence"])

    type MeritFlawEntry = { item: MeritOrFlaw; entryType: "merit" | "flaw" }
    // Essential entries first, then advanced — advanced wins on duplicate names
    const _bgEntryMap = new Map<string, MeritFlawEntry>()
    for (const cat of essentialMeritsAndFlaws.filter((cat) => ESSENTIAL_BG_TITLES.has(cat.title))) {
        for (const m of cat.merits) _bgEntryMap.set(m.name, { item: m, entryType: "merit" })
        for (const f of cat.flaws)  _bgEntryMap.set(f.name, { item: f, entryType: "flaw" })
    }
    for (const cat of advancedMeritsAndFlaws.filter((cat) => ADVANCED_BG_TITLES.has(cat.title))) {
        for (const m of cat.merits) _bgEntryMap.set(m.name, { item: m, entryType: "merit" })
        for (const f of cat.flaws)  _bgEntryMap.set(f.name, { item: f, entryType: "flaw" })
    }
    const allBackgroundEntries = [..._bgEntryMap.values()].sort((a, b) =>
        a.item.name.localeCompare(b.item.name)
    )

    // M&F categories: essentials (non-background) + advanced (non-background)
    const essentialMFCategories = essentialMeritsAndFlaws.filter((cat) => !ESSENTIAL_BG_TITLES.has(cat.title))
    const advancedMFCategories = advancedMeritsAndFlaws.filter((cat) => !ADVANCED_BG_TITLES.has(cat.title))
    const allMFCategories = [...essentialMFCategories, ...advancedMFCategories].filter((cat) => {
        if (cat.restriction === "caitiff") return character.clan === "Caitiff"
        if (cat.restriction === "ghoul") return character.age_category === "ghoul"
        return true
    })

    const [expandedLoresheetIds, setExpandedLoresheetIds] = useState<Set<string>>(new Set())
    const toggleLoresheetExpanded = (id: string) => {
        setExpandedLoresheetIds(prev => {
            const next = new Set(prev)
            if (next.has(id)) { next.delete(id) } else { next.add(id) }
            return next
        })
    }
    const loresheetDotKey = (lsName: string, dotName: string) => `${lsName}: ${dotName}`
    const isLoresheetDotSelected = (lsName: string, dotName: string) =>
        pickedMeritsAndFlaws.some(m => m.name === loresheetDotKey(lsName, dotName) && m.type === "merit")
    const toggleLoresheetDot = (lsName: string, dot: LoresheetDot) => {
        const key = loresheetDotKey(lsName, dot.name)
        const selected = isLoresheetDotSelected(lsName, dot.name)
        const cost = dot.dot
        if (selected) {
            setPickedMeritsAndFlaws(prev => prev.filter(m => m.name !== key))
            setRemainingMerits(prev => prev + cost)
        } else {
            if (remainingMerits < cost) return
            setPickedMeritsAndFlaws(prev => [...prev, {
                name: key,
                level: cost,
                summary: dot.description,
                excludes: [] as string[],
                type: "merit" as const
            }])
            setRemainingMerits(prev => prev - cost)
        }
    }

    const predatorTypePickedNames = useMemo(
        () => new Set(character.predatorType.pickedMeritsAndFlaws.map((item) => item.name)),
        [character.predatorType.pickedMeritsAndFlaws]
    )

    const pickedByName = useMemo(
        () => new Map(pickedMeritsAndFlaws.map((item) => [item.name, item])),
        [pickedMeritsAndFlaws]
    )

    const predatorTypeMeritsFlaws = useMemo(
        () => PredatorTypes[character.predatorType.name].meritsAndFlaws,
        [character.predatorType.name]
    )

    const predatorTypeMeritsByName = useMemo(
        () => new Map(predatorTypeMeritsFlaws.map((m) => [m.name, m])),
        [predatorTypeMeritsFlaws]
    )

    const exclusionMap = useMemo(() => {
        const map = new Map<string, string[]>()
        pickedMeritsAndFlaws.forEach((meritFlaw) => {
            meritFlaw.excludes.forEach((excludedName) => {
                if (!map.has(excludedName)) {
                    map.set(excludedName, [])
                }
                map.get(excludedName)?.push(meritFlaw.name)
            })
        })
        const predatorType = PredatorTypes[character.predatorType.name]
        if (predatorType) {
            predatorType.meritsAndFlaws.forEach((meritFlaw) => {
                meritFlaw.excludes.forEach((excludedName) => {
                    if (!map.has(excludedName)) {
                        map.set(excludedName, [])
                    }
                    map.get(excludedName)?.push(meritFlaw.name)
                })
            })
        }
        const clan = clans[character.clan]
        if (clan?.excludedMeritsAndFlaws) {
            clan.excludedMeritsAndFlaws.forEach((excludedName) => {
                if (!map.has(excludedName)) {
                    map.set(excludedName, [])
                }
                map.get(excludedName)?.push(`${character.clan} clan`)
            })
        }
        return map
    }, [pickedMeritsAndFlaws, character.predatorType.name, character.clan])

    const cardProps: Omit<MeritOrFlawCardProps, "meritOrFlaw" | "type"> = {
        pickedByName,
        exclusionMap,
        predatorTypeMeritsByName,
        remainingMerits,
        remainingFlaws,
        remainingThinbloodMeritPoints,
        phoneScreen,
        setPickedMeritsAndFlaws,
        setRemainingMerits,
        setRemainingFlaws,
        setRemainingThinbloodMeritPoints
    }

    const getMeritOrFlawLine = (meritOrFlaw: MeritOrFlaw, type: "flaw" | "merit"): JSX.Element => (
        <MeritOrFlawCard
            key={`${type}-${meritOrFlaw.name}`}
            meritOrFlaw={meritOrFlaw}
            type={type}
            {...cardProps}
        />
    )

    const isConfirmDisabled = isThinBlood && remainingThinbloodMeritPoints < 0
    const handleReset = () => {
        if (resetTarget === "merit") {
            const nextPickedMeritsAndFlaws = pickedMeritsAndFlaws.filter(
                (item) => item.type !== "merit"
            )
            setPickedMeritsAndFlaws(nextPickedMeritsAndFlaws)
            setRemainingMerits(meritPoints)
            setRemainingThinbloodMeritPoints(tbFlawCount)
            setCharacter({
                ...character,
                merits: [],
                flaws: nextPickedMeritsAndFlaws.filter((item) => item.type === "flaw")
            })
        }

        if (resetTarget === "flaw") {
            const nextPickedMeritsAndFlaws = pickedMeritsAndFlaws.filter(
                (item) => item.type !== "flaw"
            )
            setPickedMeritsAndFlaws(nextPickedMeritsAndFlaws)
            setRemainingFlaws(flawPoints)
            setRemainingThinbloodMeritPoints(-tbMeritCount)
            setCharacter({
                ...character,
                merits: nextPickedMeritsAndFlaws.filter((item) => item.type === "merit"),
                flaws: []
            })
        }

        setResetTarget(null)
    }

    const activeTabStyle = {
        background: `linear-gradient(135deg, ${rgba(RAW_GRAPE, 0.4)}, ${rgba(RAW_RED, 0.35)})`,
        border: `1px solid ${rgba(RAW_RED, 0.6)}`,
        color: "rgba(248, 240, 235, 0.96)",
        boxShadow: "0 4px 20px rgba(180, 60, 60, 0.28), inset 0 1px 0 rgba(255, 255, 255, 0.1)",
        transform: "translateY(-1px)"
    }

    const columnScrollProps = {
        style: { flex: 1 } as React.CSSProperties,
        pb: 8,
        type: "always" as const,
        scrollbarSize: nightfallScrollbarSize,
        styles: nightfallScrollAreaStyles
    }

    return (
        <div style={generatorScrollableShellStyle}>
            {/* ── Sticky header: hero + point counters ── */}
            <div style={{ flexShrink: 0, padding: "0 20px" }}>
                <div style={generatorScrollableContentStyle}>
                    <GeneratorStepHero
                        leadText="Shape your"
                        accentText="Advantages"
                        description="Spend your points on Backgrounds, Merits & Flaws, and Loresheets."
                        maxWidth={720}
                        marginBottom={8}
                    />
                    <Grid m={0} gutter="sm" mb="sm">
                        <Grid.Col span={isThinBlood ? (phoneScreen ? 6 : 4) : 6}>
                            <PointCard
                                label="Advantage Points"
                                value={`${remainingMerits}/${meritPoints}`}
                                tone="merit"
                                onReset={() => setResetTarget("merit")}
                            />
                        </Grid.Col>
                        <Grid.Col span={isThinBlood ? (phoneScreen ? 6 : 4) : 6}>
                            <PointCard
                                label="Flaw Points"
                                value={`${remainingFlaws}/${flawPoints}`}
                                tone="flaw"
                                onReset={() => setResetTarget("flaw")}
                            />
                        </Grid.Col>
                        {isThinBlood ? (
                            <Grid.Col span={phoneScreen ? 12 : 4}>
                                <PointCard
                                    label="Thin-blood Balance"
                                    value={remainingThinbloodMeritPoints}
                                    tone={remainingThinbloodMeritPoints < 0 ? "warning" : "neutral"}
                                    helper="Gain merit points by taking thin-blood flaws."
                                />
                            </Grid.Col>
                        ) : null}
                    </Grid>
                </div>
            </div>

            {/* ── Tabs: fill remaining height ── */}
            <Tabs
                color="red"
                value={activeTab}
                onChange={setActiveTab}
                style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}
                styles={{
                    list: {
                        gap: 10,
                        borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
                        paddingBottom: 10
                    },
                    tab: {
                        borderRadius: 999,
                        border: "1px solid rgba(255, 255, 255, 0.08)",
                        background: "rgba(255, 255, 255, 0.03)",
                        color: rgba(RAW_GREY, 0.72),
                        fontFamily: "Cinzel, Georgia, serif",
                        letterSpacing: "0.08em",
                        textTransform: "uppercase" as const,
                        fontSize: "0.78rem",
                        fontWeight: 600,
                        transition: "background 180ms ease, border-color 180ms ease, color 180ms ease, box-shadow 180ms ease, transform 180ms ease"
                    },
                    panel: {
                        flex: 1,
                        minHeight: 0,
                        overflow: "hidden",
                        display: "flex",
                        flexDirection: "column" as const,
                        paddingTop: 12
                    }
                }}
            >
                {/* Sticky tab switcher */}
                <div style={{ flexShrink: 0, padding: "0 20px" }}>
                    <div style={generatorScrollableContentStyle}>
                        <Tabs.List>
                            <Tabs.Tab value="backgrounds" style={activeTab === "backgrounds" ? activeTabStyle : undefined}>
                                Backgrounds
                            </Tabs.Tab>
                            <Tabs.Tab value="merits" style={activeTab === "merits" ? activeTabStyle : undefined}>
                                Merits & Flaws
                            </Tabs.Tab>
                            <Tabs.Tab value="loresheets" style={activeTab === "loresheets" ? activeTabStyle : undefined}>
                                Loresheets
                            </Tabs.Tab>
                        </Tabs.List>
                    </div>
                </div>

                {/* Backgrounds panel */}
                <Tabs.Panel value="backgrounds">
                    <div
                        style={{
                            ...generatorScrollableContentStyle,
                            height: "100%",
                            display: "flex",
                            flexDirection: "column",
                            padding: "0 20px"
                        }}
                    >
                        <ScrollArea {...columnScrollProps}>
                            <Stack gap="sm" pb="xl">
                                {allBackgroundEntries.map((entry) =>
                                    getMeritOrFlawLine(entry.item, entry.entryType)
                                )}
                            </Stack>
                        </ScrollArea>
                    </div>
                </Tabs.Panel>

                {/* Merits & Flaws panel */}
                <Tabs.Panel value="merits">
                    <div
                        style={{
                            ...generatorScrollableContentStyle,
                            height: "100%",
                            display: "flex",
                            flexDirection: "column",
                            padding: "0 20px"
                        }}
                    >
                        {isThinBlood && phoneScreen ? (
                            <Text
                                ta="center"
                                style={{
                                    flexShrink: 0,
                                    fontFamily: "Crimson Text, Georgia, serif",
                                    fontSize: "1.05rem",
                                    color: theme.colors.grape[3],
                                    padding: "4px 0 8px"
                                }}
                            >
                                Pick Thin-blood flaws to gain Thin-blood merit points
                            </Text>
                        ) : null}
                        {phoneScreen ? (
                            <ScrollArea {...columnScrollProps}>
                                <Stack gap="sm" pb="xl">
                                    {isThinBlood ? (
                                        <>
                                            <Stack gap="sm">
                                                <GeneratorSectionDivider label="Thin-blood merits" accentAlpha={0.32} titleSize="0.96rem" lineHeight={1} marginY="xs" />
                                                {essentialThinbloodMeritsAndFlaws.merits.map((m) => getMeritOrFlawLine(m, "merit"))}
                                            </Stack>
                                            <Stack gap="sm">
                                                <GeneratorSectionDivider label="Thin-blood flaws" accentAlpha={0.32} titleSize="0.96rem" lineHeight={1} marginY="xs" />
                                                {essentialThinbloodMeritsAndFlaws.flaws.map((f) => getMeritOrFlawLine(f, "flaw"))}
                                            </Stack>
                                            <Divider w="100%" my="sm" color="rgba(255, 255, 255, 0.1)" />
                                        </>
                                    ) : null}
                                    {allMFCategories.map((cat) => (
                                        <Stack gap="sm" key={cat.title}>
                                            <GeneratorSectionDivider label={cat.title} accentAlpha={0.32} titleSize="0.96rem" lineHeight={1} marginY="xs" />
                                            {cat.merits.map((m) => getMeritOrFlawLine(m, "merit"))}
                                            {cat.flaws.map((f) => getMeritOrFlawLine(f, "flaw"))}
                                        </Stack>
                                    ))}
                                </Stack>
                            </ScrollArea>
                        ) : (
                            <div style={{ display: "flex", flex: 1, minHeight: 0, gap: 16, overflow: "hidden", paddingTop: 4 }}>
                                <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
                                    <ScrollArea {...columnScrollProps}>
                                        <Stack gap="sm" pb="xl">
                                            {isThinBlood ? (
                                                <Stack gap="sm">
                                                    <GeneratorSectionDivider label="Thin-blood merits" accentAlpha={0.32} titleSize="0.96rem" lineHeight={1} marginY="xs" />
                                                    {essentialThinbloodMeritsAndFlaws.merits.map((m) => getMeritOrFlawLine(m, "merit"))}
                                                </Stack>
                                            ) : null}
                                            {allMFCategories
                                                .filter((_, i) => i % 2 === 0)
                                                .map((cat) => (
                                                    <Stack gap="sm" key={cat.title}>
                                                        <GeneratorSectionDivider label={cat.title} accentAlpha={0.32} titleSize="0.96rem" lineHeight={1} marginY="xs" />
                                                        {cat.merits.map((m) => getMeritOrFlawLine(m, "merit"))}
                                                        {cat.flaws.map((f) => getMeritOrFlawLine(f, "flaw"))}
                                                    </Stack>
                                                ))}
                                        </Stack>
                                    </ScrollArea>
                                </div>
                                <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
                                    <ScrollArea {...columnScrollProps}>
                                        <Stack gap="sm" pb="xl">
                                            {isThinBlood ? (
                                                <>
                                                    <Stack gap="sm">
                                                        <GeneratorSectionDivider label="Thin-blood flaws" accentAlpha={0.32} titleSize="0.96rem" lineHeight={1} marginY="xs" />
                                                        {essentialThinbloodMeritsAndFlaws.flaws.map((f) => getMeritOrFlawLine(f, "flaw"))}
                                                    </Stack>
                                                    <Divider w="100%" my="sm" color="rgba(255, 255, 255, 0.1)" />
                                                </>
                                            ) : null}
                                            {allMFCategories
                                                .filter((_, i) => i % 2 !== 0)
                                                .map((cat) => (
                                                    <Stack gap="sm" key={cat.title}>
                                                        <GeneratorSectionDivider label={cat.title} accentAlpha={0.32} titleSize="0.96rem" lineHeight={1} marginY="xs" />
                                                        {cat.merits.map((m) => getMeritOrFlawLine(m, "merit"))}
                                                        {cat.flaws.map((f) => getMeritOrFlawLine(f, "flaw"))}
                                                    </Stack>
                                                ))}
                                        </Stack>
                                    </ScrollArea>
                                </div>
                            </div>
                        )}
                    </div>
                </Tabs.Panel>

                {/* Loresheets panel (collapsible) */}
                <Tabs.Panel value="loresheets">
                    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", padding: "0 20px" }}>
                        <div style={{ ...generatorScrollableContentStyle, height: "100%", display: "flex", flexDirection: "column" }}>
                            <ScrollArea style={{ flex: 1, minHeight: 0 }} pb={8} type="always" scrollbarSize={nightfallScrollbarSize} styles={nightfallScrollAreaStyles}>
                                <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 700, margin: "0 auto", paddingTop: 8, paddingBottom: 40 }}>
                                    {LORESHEETS
                                        .filter(ls => !ls.clanRestriction?.length || ls.clanRestriction.includes(character.clan))
                                        .map(ls => {
                                            const isExpanded = expandedLoresheetIds.has(ls.id)
                                            const purchasedCount = ls.dots.filter(d => isLoresheetDotSelected(ls.name, d.name)).length
                                            return (
                                                <div
                                                    key={ls.id}
                                                    style={{
                                                        borderRadius: 10,
                                                        border: `1px solid ${purchasedCount > 0 ? rgba(RAW_RED, 0.35) : "rgba(125, 91, 72, 0.35)"}`,
                                                        background: "rgba(26, 20, 24, 0.88)",
                                                        overflow: "hidden",
                                                    }}
                                                >
                                                    <button
                                                        onClick={() => toggleLoresheetExpanded(ls.id)}
                                                        style={{
                                                            display: "flex",
                                                            alignItems: "center",
                                                            justifyContent: "space-between",
                                                            gap: 12,
                                                            width: "100%",
                                                            padding: "14px 18px 12px",
                                                            background: "transparent",
                                                            border: "none",
                                                            borderBottom: isExpanded ? "1px solid rgba(125, 91, 72, 0.2)" : "none",
                                                            cursor: "pointer",
                                                            textAlign: "left",
                                                            fontFamily: "inherit",
                                                        }}
                                                    >
                                                        <div style={{ flex: 1, minWidth: 0 }}>
                                                            <p style={{
                                                                margin: 0,
                                                                fontFamily: "Cinzel, Georgia, serif",
                                                                fontSize: "0.95rem",
                                                                fontWeight: 600,
                                                                letterSpacing: "0.06em",
                                                                color: "rgba(244, 236, 232, 0.95)",
                                                            }}>
                                                                {ls.name}
                                                            </p>
                                                            {ls.requiresStPermission && (
                                                                <p style={{
                                                                    margin: "3px 0 0",
                                                                    fontFamily: "Inter, Segoe UI, sans-serif",
                                                                    fontSize: "0.68rem",
                                                                    letterSpacing: "0.08em",
                                                                    textTransform: "uppercase" as const,
                                                                    color: "rgba(195, 155, 90, 0.4)",
                                                                }}>
                                                                    Requires ST approval
                                                                </p>
                                                            )}
                                                        </div>
                                                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                                                            {purchasedCount > 0 && (
                                                                <span style={{
                                                                    padding: "2px 8px",
                                                                    borderRadius: 4,
                                                                    border: `1px solid ${rgba(RAW_RED, 0.45)}`,
                                                                    background: rgba(RAW_RED, 0.12),
                                                                    fontFamily: "Inter, Segoe UI, sans-serif",
                                                                    fontSize: "0.62rem",
                                                                    letterSpacing: "0.1em",
                                                                    textTransform: "uppercase" as const,
                                                                    color: rgba(RAW_RED, 0.7),
                                                                }}>
                                                                    {purchasedCount} dot{purchasedCount !== 1 ? "s" : ""}
                                                                </span>
                                                            )}
                                                            <span style={{
                                                                padding: "3px 8px",
                                                                borderRadius: 4,
                                                                border: "1px solid rgba(125, 91, 72, 0.3)",
                                                                fontFamily: "Inter, Segoe UI, sans-serif",
                                                                fontSize: "0.62rem",
                                                                letterSpacing: "0.1em",
                                                                textTransform: "uppercase" as const,
                                                                color: "rgba(220, 210, 205, 0.6)",
                                                            }}>
                                                                {SOURCE_LABELS[ls.source] ?? ls.source}
                                                            </span>
                                                            <span style={{ color: "rgba(220, 210, 205, 0.45)", fontSize: "0.8rem" }}>
                                                                {isExpanded ? "▲" : "▼"}
                                                            </span>
                                                        </div>
                                                    </button>

                                                    {isExpanded && (
                                                        <div style={{ padding: "8px 0" }}>
                                                            {ls.dots.map(dot => {
                                                                const dotAvailable = !dot.clanRestriction?.length || dot.clanRestriction.includes(character.clan)
                                                                const selected = isLoresheetDotSelected(ls.name, dot.name)
                                                                const cost = dot.dot
                                                                const clickable = dotAvailable && (selected || remainingMerits >= cost)
                                                                return (
                                                                    <button
                                                                        key={dot.dot}
                                                                        onClick={() => { if (clickable) toggleLoresheetDot(ls.name, dot) }}
                                                                        style={{
                                                                            display: "flex",
                                                                            alignItems: "flex-start",
                                                                            gap: 14,
                                                                            width: "100%",
                                                                            padding: "10px 18px",
                                                                            background: selected ? rgba(RAW_RED, 0.07) : "transparent",
                                                                            border: "none",
                                                                            borderBottom: "1px solid rgba(125, 91, 72, 0.12)",
                                                                            cursor: clickable ? "pointer" : "not-allowed",
                                                                            textAlign: "left",
                                                                            fontFamily: "inherit",
                                                                            transition: "background 150ms ease",
                                                                            opacity: clickable ? 1 : 0.38,
                                                                        }}
                                                                    >
                                                                        <div style={{
                                                                            flexShrink: 0,
                                                                            width: 20,
                                                                            height: 20,
                                                                            marginTop: 1,
                                                                            borderRadius: 4,
                                                                            border: `1.5px solid ${selected ? rgba(RAW_RED, 1) : "rgba(125, 91, 72, 0.5)"}`,
                                                                            background: selected ? rgba(RAW_RED, 0.15) : "transparent",
                                                                            display: "flex",
                                                                            alignItems: "center",
                                                                            justifyContent: "center",
                                                                            transition: "all 150ms ease",
                                                                        }}>
                                                                            {selected && <IconCheck size={12} color={rgba(RAW_RED, 1)} strokeWidth={2.5} />}
                                                                        </div>
                                                                        <div style={{ flex: 1, minWidth: 0 }}>
                                                                            <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                                                                                <span style={{
                                                                                    fontFamily: "Inter, Segoe UI, sans-serif",
                                                                                    fontSize: "0.65rem",
                                                                                    letterSpacing: "0.1em",
                                                                                    color: selected ? rgba(RAW_RED, 0.45) : "rgba(220, 210, 205, 0.6)",
                                                                                    flexShrink: 0,
                                                                                }}>
                                                                                    {"●".repeat(dot.dot)}{"○".repeat(5 - dot.dot)}
                                                                                </span>
                                                                                <span style={{
                                                                                    fontFamily: "Crimson Text, Georgia, serif",
                                                                                    fontSize: "0.92rem",
                                                                                    fontWeight: 600,
                                                                                    color: "rgba(244, 236, 232, 0.95)",
                                                                                }}>
                                                                                    {dot.name}
                                                                                </span>
                                                                                {!dotAvailable && dot.clanRestriction && (
                                                                                    <span style={{
                                                                                        fontFamily: "Inter, Segoe UI, sans-serif",
                                                                                        fontSize: "0.62rem",
                                                                                        letterSpacing: "0.08em",
                                                                                        textTransform: "uppercase" as const,
                                                                                        color: "rgba(195, 155, 90, 0.4)",
                                                                                    }}>
                                                                                        {dot.clanRestriction.join(" / ")} only
                                                                                    </span>
                                                                                )}
                                                                            </div>
                                                                            <p style={{
                                                                                margin: "3px 0 0",
                                                                                fontFamily: "Crimson Text, Georgia, serif",
                                                                                fontSize: "0.85rem",
                                                                                color: "rgba(220, 210, 205, 0.6)",
                                                                                lineHeight: 1.4,
                                                                            }}>
                                                                                {dot.description}
                                                                            </p>
                                                                        </div>
                                                                        <div style={{
                                                                            flexShrink: 0,
                                                                            padding: "4px 10px",
                                                                            borderRadius: 6,
                                                                            border: `1px solid ${selected ? rgba(RAW_RED, 0.4) : "rgba(125, 91, 72, 0.25)"}`,
                                                                            background: selected ? rgba(RAW_RED, 0.1) : "rgba(255, 255, 255, 0.03)",
                                                                            textAlign: "center",
                                                                        }}>
                                                                            <div style={{
                                                                                fontFamily: "Cinzel, Georgia, serif",
                                                                                fontSize: "0.85rem",
                                                                                fontWeight: 700,
                                                                                color: selected ? rgba(RAW_RED, 1) : "rgba(220, 210, 205, 0.6)",
                                                                            }}>
                                                                                {cost} pt{cost !== 1 ? "s" : ""}
                                                                            </div>
                                                                        </div>
                                                                    </button>
                                                                )
                                                            })}
                                                        </div>
                                                    )}
                                                </div>
                                            )
                                        })
                                    }
                                </div>
                            </ScrollArea>
                        </div>
                    </div>
                </Tabs.Panel>

            </Tabs>

            {/* ── Confirm button ── */}
            <Stack gap="xs" align="center" py="xs">
                {isConfirmDisabled ? (
                    <Text c={theme.colors.red[5]} ta="center">
                        Need to balance Thin-blood merit points
                    </Text>
                ) : null}
                <Button
                    data-testid="merits-confirm-button"
                    color="grape"
                    disabled={isConfirmDisabled}
                    onClick={() => {
                        updateHealthAndWillpowerAndBloodPotencyAndHumanity(character)
                        setCharacter({
                            ...character,
                            merits: pickedMeritsAndFlaws.filter((l) => l.type === "merit"),
                            flaws: pickedMeritsAndFlaws.filter((l) => l.type === "flaw")
                        })
                        trackEvent({
                            action: "merits confirm clicked",
                            category: "merits",
                            label: pickedMeritsAndFlaws.map((m) => `${m.name}: ${m.level}`).join(", ")
                        })
                        nextStep()
                    }}
                    styles={generatorConfirmButtonStyles}
                >
                    Confirm
                </Button>
            </Stack>

            <ConfirmActionModal
                opened={resetTarget !== null}
                onClose={() => setResetTarget(null)}
                onConfirm={handleReset}
                title={`Reset ${resetTarget === "merit" ? "Advantages" : "Flaws"}?`}
                body={`This will remove your picked ${resetTarget === "merit" ? "advantages" : "flaws"} from this step. Predator type picks are kept.`}
                confirmLabel="Reset"
            />
        </div>
    )
}

const PointCard = ({
    label,
    value,
    tone,
    helper,
    onReset
}: {
    label: string
    value: number | string
    tone: "merit" | "flaw" | "warning" | "neutral"
    helper?: string
    onReset?: () => void
}) => {
    const palette = {
        merit: {
            border: "rgba(63, 192, 120, 0.24)",
            bg: "rgba(46, 160, 67, 0.1)",
            value: "rgba(96, 230, 156, 0.95)"
        },
        flaw: {
            border: rgba(RAW_RED, 0.24),
            bg: rgba(RAW_RED, 0.1),
            value: "rgba(255, 135, 135, 0.95)"
        },
        warning: {
            border: "rgba(250, 176, 5, 0.28)",
            bg: "rgba(250, 176, 5, 0.08)",
            value: "rgba(255, 212, 117, 0.95)"
        },
        neutral: {
            border: rgba(RAW_GRAPE, 0.24),
            bg: rgba(RAW_GRAPE, 0.09),
            value: rgba(RAW_GREY, 0.94)
        }
    }[tone]

    return (
        <Box
            style={{
                height: "100%",
                padding: "14px 16px",
                borderRadius: 16,
                border: `1px solid ${palette.border}`,
                background: palette.bg
            }}
        >
            <Text
                style={{
                    fontFamily: "Inter, Segoe UI, sans-serif",
                    fontSize: "0.74rem",
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    color: rgba(RAW_GREY, 0.54),
                    marginBottom: 6
                }}
            >
                {label}
            </Text>
            <Text
                style={{
                    fontFamily: "Cinzel, Georgia, serif",
                    fontSize: "1.55rem",
                    lineHeight: 1,
                    color: palette.value
                }}
            >
                {value}
            </Text>
            {onReset ? (
                <Button
                    mt={10}
                    size="xs"
                    variant="subtle"
                    color={tone === "flaw" ? "red" : "teal"}
                    onClick={onReset}
                    styles={{
                        root: {
                            paddingLeft: 0,
                            paddingRight: 0,
                            height: "auto"
                        },
                        label: {
                            fontFamily: "Cinzel, Georgia, serif",
                            fontSize: "0.72rem",
                            letterSpacing: "0.1em",
                            textTransform: "uppercase"
                        }
                    }}
                >
                    Reset
                </Button>
            ) : null}
            {helper ? (
                <Text
                    mt={8}
                    style={{
                        fontFamily: "Crimson Text, Georgia, serif",
                        fontSize: "0.95rem",
                        color: rgba(RAW_GREY, 0.72)
                    }}
                >
                    {helper}
                </Text>
            ) : null}
        </Box>
    )
}

export default MeritsAndFlawsPicker
