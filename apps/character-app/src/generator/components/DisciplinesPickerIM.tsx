import {
    Accordion,
    Badge,
    Box,
    Button,
    Group,
    Image,
    List,
    ScrollArea,
    Select,
    Stack,
    Text,
} from "@mantine/core"
import { RAW_GREY, RAW_RED, rgba } from "~/theme/colors"
import { useState } from "react"
import { Character, containsBloodSorcery, containsOblivion } from "../../data/Character"
import { Discipline, Power, disciplines, getAvailableDisciplines } from "../../data/Disciplines"
import { upcase, updateHealthAndWillpowerAndBloodPotencyAndHumanity } from "../utils"
import { DisciplineName } from "~/data/NameSchemas"
import { generatorConfirmButtonStyles } from "./sharedGeneratorConfirmButtonStyles"
import {
    generatorScrollableAreaStyle,
    generatorScrollableContentStyle,
    generatorScrollableShellStyle,
} from "./sharedGeneratorScrollableLayout"
import { nightfallScrollAreaStyles, nightfallScrollbarSize } from "./sharedScrollAreaStyles"
import { GeneratorSectionDivider } from "./sharedGeneratorUi"

type DisciplinesPickerIMProps = {
    character: Character
    setCharacter: (character: Character) => void
    nextStep: (characterOverride?: Character) => void
}

// ── Focused spread: 3 in primary, 1 in secondary (clan), 1 in any, + predator type
// ── Strategic spread: 2 in each of two clan disciplines, 1+1 in any disciplines, + predator type

type Spread = "focused" | "strategic"

const C_RED = rgba(RAW_RED, 1)
const C_RED_DIM = rgba(RAW_RED, 0.4)

const DisciplineDots = ({ count }: { count: number }) => {
    if (count <= 0) return null
    return (
        <Group gap={6} ml={10} wrap="nowrap">
            {Array.from({ length: count }, (_, i) => (
                <Box
                    key={i}
                    style={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        background: rgba(RAW_RED, 0.95),
                        boxShadow: `0 0 10px ${rgba(RAW_RED, 0.35)}`,
                        flexShrink: 0,
                    }}
                />
            ))}
        </Group>
    )
}

function PowerCard({
    power,
    picked,
    disabled,
    label,
    onTake,
    onUndo,
}: {
    power: Power
    picked: boolean
    disabled: boolean
    label?: string
    onTake: () => void
    onUndo: () => void
}) {
    return (
        <div
            style={{
                padding: "12px 14px",
                borderRadius: 10,
                border: `1px solid ${picked ? rgba(RAW_RED, 0.3) : "rgba(125, 91, 72, 0.25)"}`,
                background: picked
                    ? "linear-gradient(180deg, rgba(52, 18, 22, 0.75) 0%, rgba(34, 10, 13, 0.75) 100%)"
                    : "linear-gradient(180deg, rgba(18, 13, 16, 0.55) 0%, rgba(8, 6, 8, 1) 100%)",
                opacity: disabled && !picked ? 0.6 : 1,
                marginBottom: 8,
            }}
        >
            <Group justify="space-between" align="flex-start" mb={4}>
                <Text
                    style={{
                        fontFamily: "Cinzel, Georgia, serif",
                        fontSize: "0.82rem",
                        fontWeight: 600,
                        color: picked ? C_RED : "rgba(244, 236, 232, 0.92)",
                        flex: 1,
                    }}
                >
                    {power.name}
                </Text>
                <Badge variant="light" color="pink" radius="sm" size="xs">
                    lv {power.level}
                </Badge>
            </Group>
            <Text
                style={{
                    fontFamily: "Crimson Text, Georgia, serif",
                    fontSize: "0.9rem",
                    color: rgba(RAW_GREY, 0.65),
                    lineHeight: 1.4,
                    marginBottom: power.amalgamPrerequisites.length > 0 ? 6 : 0,
                }}
            >
                {upcase(power.summary)}
            </Text>
            {power.amalgamPrerequisites.length > 0 && (
                <List
                    size="xs"
                    styles={{ item: { color: rgba(RAW_GREY, 0.55), fontSize: "0.72rem" } }}
                >
                    {power.amalgamPrerequisites.map((req) => (
                        <List.Item key={req.discipline}>
                            {upcase(req.discipline)}: Lv {req.level}
                        </List.Item>
                    ))}
                </List>
            )}
            {picked ? (
                <Button
                    size="xs"
                    variant="subtle"
                    color="gray"
                    fullWidth
                    mt={4}
                    style={{ fontFamily: "Cinzel, Georgia, serif", fontSize: "0.72rem" }}
                    onClick={onUndo}
                >
                    {label ?? "Undo"}
                </Button>
            ) : (
                <Button
                    size="xs"
                    variant="outline"
                    color="red"
                    fullWidth
                    mt={4}
                    disabled={disabled}
                    styles={{
                        root: {
                            fontFamily: "Cinzel, Georgia, serif",
                            fontSize: "0.72rem",
                            letterSpacing: "0.14em",
                            textTransform: "uppercase",
                        },
                    }}
                    onClick={onTake}
                >
                    Take
                </Button>
            )}
        </div>
    )
}

function DisciplineAccordion({
    name,
    discipline,
    pickedPowers,
    onTake,
    onUndo,
    maxDots,
    allowedLevels,
    mustBeDistinct,
    usedDisciplines,
}: {
    name: string
    discipline: Discipline
    pickedPowers: Power[]
    onTake: (p: Power) => void
    onUndo: (p: Power) => void
    maxDots: number
    allowedLevels: number[]
    mustBeDistinct: string[] // discipline names already used that can't be reused here
    usedDisciplines: string[]
}) {
    const pickedHere = pickedPowers.filter((p) => p.discipline === name)
    const alreadyFull = pickedHere.length >= maxDots
    const disciplineUsedElsewhere =
        mustBeDistinct.includes(name) && !pickedHere.length

    const eligiblePowers = discipline.powers.filter(
        (p) => allowedLevels.includes(p.level) && p.amalgamPrerequisites.length === 0
    )

    return (
        <Accordion.Item key={name} value={name}>
            <Accordion.Control
                icon={<Image src={discipline.logo} w={20} h={20} fit="contain" />}
                styles={{
                    label: {
                        fontFamily: "Cinzel, Georgia, serif",
                        fontSize: "0.88rem",
                        fontWeight: 900,
                        letterSpacing: "0.1em",
                        color: "rgb(244, 236, 232)",
                    },
                }}
            >
                <Group gap={0} wrap="nowrap">
                    <Text
                        component="span"
                        style={{
                            fontFamily: "Cinzel, Georgia, serif",
                            fontSize: "0.88rem",
                            fontWeight: 900,
                            letterSpacing: "0.1em",
                            color: "rgb(244, 236, 232)",
                        }}
                    >
                        {upcase(name)}
                    </Text>
                    <DisciplineDots count={pickedHere.length} />
                    {disciplineUsedElsewhere && (
                        <Text
                            component="span"
                            style={{
                                marginLeft: 10,
                                fontFamily: "Inter, sans-serif",
                                fontSize: "0.7rem",
                                color: rgba(RAW_GREY, 0.4),
                            }}
                        >
                            (already used)
                        </Text>
                    )}
                </Group>
            </Accordion.Control>
            <Accordion.Panel>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                    {eligiblePowers.map((power) => {
                        const isPicked = pickedPowers.some((p) => p.name === power.name)
                        const prereqsMet =
                            pickedPowers.filter((p) => p.discipline === name).length >=
                            power.level - 1
                        const isDisabled =
                            !isPicked &&
                            (alreadyFull ||
                                disciplineUsedElsewhere ||
                                !prereqsMet ||
                                (usedDisciplines.includes(name) && pickedHere.length === 0))
                        return (
                            <div key={power.name} style={{ width: "100%" }}>
                                <PowerCard
                                    power={power}
                                    picked={isPicked}
                                    disabled={isDisabled}
                                    onTake={() => onTake(power)}
                                    onUndo={() => onUndo(power)}
                                />
                            </div>
                        )
                    })}
                </div>
            </Accordion.Panel>
        </Accordion.Item>
    )
}

const ALL_DISCIPLINE_NAMES = Object.keys(disciplines) as DisciplineName[]

export default function DisciplinesPickerIM({
    character,
    setCharacter,
    nextStep,
}: DisciplinesPickerIMProps) {
    const savedSpread = character.im_discipline_spread as Spread | ""
    const [spread, setSpread] = useState<Spread | null>(
        savedSpread === "focused" || savedSpread === "strategic" ? savedSpread : null
    )

    // All clan discipline powers picked during this step
    const [clanPowers, setClanPowers] = useState<Power[]>([])

    // For Focused: which clan discipline is primary (gets 3 dots)
    const [focusedPrimaryDisc, setFocusedPrimaryDisc] = useState<string | null>(null)

    // "Any" discipline picks (non-clan slots)
    const [anyDisc1, setAnyDisc1] = useState<string | null>(null)
    const [anyPower1, setAnyPower1] = useState<Power | null>(null)
    const [anyDisc2, setAnyDisc2] = useState<string | null>(null) // Strategic only
    const [anyPower2, setAnyPower2] = useState<Power | null>(null)

    // Predator type power (same as standard)
    const [predatorPower, setPredatorPower] = useState<Power | undefined>()

    const clanDisciplines = getAvailableDisciplines(character)
    const clanDiscNames = Object.keys(clanDisciplines)
    const predatorTypeDiscipline = disciplines[character.predatorType.pickedDiscipline]

    // ── Focused helpers ────────────────────────────────────────────────────────
    const focusedPrimaryCount = focusedPrimaryDisc
        ? clanPowers.filter((p) => p.discipline === focusedPrimaryDisc).length
        : 0
    const focusedSecondaryDisc = clanDiscNames.find(
        (n) => n !== focusedPrimaryDisc && clanPowers.some((p) => p.discipline === n)
    ) ?? null
    const focusedSecondaryCount = focusedSecondaryDisc
        ? clanPowers.filter((p) => p.discipline === focusedSecondaryDisc).length
        : 0

    const focusedDone =
        spread === "focused" &&
        focusedPrimaryCount === 3 &&
        focusedSecondaryCount === 1 &&
        !!anyPower1 &&
        !!predatorPower

    // ── Strategic helpers ──────────────────────────────────────────────────────
    const strategicDiscs = clanDiscNames.filter((n) => clanPowers.some((p) => p.discipline === n))
    const strategicDone =
        spread === "strategic" &&
        strategicDiscs.length === 2 &&
        strategicDiscs.every(
            (n) => clanPowers.filter((p) => p.discipline === n).length === 2
        ) &&
        !!anyPower1 &&
        !!anyPower2 &&
        !!predatorPower

    const confirmDisabled = spread === null || (!focusedDone && !strategicDone)

    // ── Clan power handlers ────────────────────────────────────────────────────
    const takeClanPower = (power: Power) => {
        // For Focused, auto-set primary if picking from a discipline that now has 3 dots
        const newPowers = [...clanPowers, power]
        if (spread === "focused") {
            const disc = power.discipline
            const countInDisc = newPowers.filter((p) => p.discipline === disc).length
            if (countInDisc >= 2 && focusedPrimaryDisc === null) {
                setFocusedPrimaryDisc(disc)
            }
        }
        setClanPowers(newPowers)
    }

    const undoClanPower = (power: Power) => {
        const newPowers = clanPowers.filter((p) => p.name !== power.name)
        // If primary discipline now has fewer than 2, clear primary
        if (
            spread === "focused" &&
            focusedPrimaryDisc === power.discipline &&
            newPowers.filter((p) => p.discipline === focusedPrimaryDisc).length < 2
        ) {
            setFocusedPrimaryDisc(null)
        }
        setClanPowers(newPowers)
    }

    const allPickedPowers = [
        ...clanPowers,
        ...(anyPower1 ? [anyPower1] : []),
        ...(anyPower2 ? [anyPower2] : []),
        ...(predatorPower ? [predatorPower] : []),
    ]

    // ── Clan section constraints by spread ────────────────────────────────────
    const getClanConstraints = (discName: string) => {
        if (spread === "focused") {
            const isPrimary = focusedPrimaryDisc === discName
            const isSecondary = focusedSecondaryDisc === discName
            const noPrimaryYet = focusedPrimaryDisc === null

            if (isPrimary) return { maxDots: 3, allowedLevels: [1, 2, 3] }
            if (isSecondary) return { maxDots: 1, allowedLevels: [1] }
            // Not yet designated — can start picking (up to 1 dot, becoming secondary unless we already have a secondary)
            if (noPrimaryYet || (!isSecondary && !focusedSecondaryDisc))
                return { maxDots: 3, allowedLevels: [1, 2, 3] }
            // Both primary and secondary are taken — this discipline is locked
            return { maxDots: 0, allowedLevels: [] }
        }
        // Strategic: 2 in each of 2 disciplines
        const alreadyTwo = strategicDiscs.length >= 2
        const inThis = clanPowers.filter((p) => p.discipline === discName).length
        if (alreadyTwo && inThis === 0) return { maxDots: 0, allowedLevels: [] }
        return { maxDots: 2, allowedLevels: [1, 2] }
    }

    const usedClanDiscs = clanDiscNames.filter((n) =>
        clanPowers.some((p) => p.discipline === n)
    )

    // ── Any-discipline section ─────────────────────────────────────────────────
    const anyDiscSelectData = ALL_DISCIPLINE_NAMES.map((n) => ({
        value: n,
        label: upcase(n),
    }))

    const renderAnyPicker = (
        slot: 1 | 2,
        anyDisc: string | null,
        setAnyDisc: (v: string | null) => void,
        anyPower: Power | null,
        setAnyPower: (p: Power | null) => void,
        otherAnyDisc: string | null
    ) => {
        const label = slot === 1 ? "Third Discipline" : "Fourth Discipline"
        const slotDiscipline = anyDisc ? disciplines[anyDisc as DisciplineName] : null
        const lv1Powers = slotDiscipline ? slotDiscipline.powers.filter((p) => p.level === 1) : []

        return (
            <div>
                <GeneratorSectionDivider
                    label={`${label} — 1 dot (any discipline)`}
                    lineHeight={1}
                    accentAlpha={0.28}
                    titleSize="0.88rem"
                    marginY="sm"
                />
                <Select
                    placeholder="Choose a discipline…"
                    value={anyDisc}
                    onChange={(v) => {
                        setAnyDisc(v)
                        setAnyPower(null)
                    }}
                    data={anyDiscSelectData.filter(
                        (d) => d.value !== otherAnyDisc
                    )}
                    searchable
                    mb={12}
                    styles={{
                        input: {
                            background: "rgba(18, 13, 16, 0.8)",
                            border: "1px solid rgba(125, 91, 72, 0.35)",
                            color: "rgba(244, 236, 232, 0.9)",
                            fontFamily: "Crimson Text, Georgia, serif",
                        },
                        dropdown: {
                            background: "rgba(24, 18, 21, 0.98)",
                            border: "1px solid rgba(125, 91, 72, 0.4)",
                        },
                    }}
                />
                {slotDiscipline && (
                    <Accordion
                        variant="separated"
                        defaultValue={anyDisc}
                        styles={{
                            item: {
                                background: "rgba(255, 255, 255, 0.03)",
                                border: "1px solid rgba(255, 255, 255, 0.07)",
                                borderRadius: 10,
                                marginBottom: 8,
                            },
                        }}
                    >
                        <Accordion.Item value={anyDisc!}>
                            <Accordion.Control
                                icon={<Image src={slotDiscipline.logo} w={20} h={20} fit="contain" />}
                                styles={{
                                    label: {
                                        fontFamily: "Cinzel, Georgia, serif",
                                        fontSize: "0.88rem",
                                        fontWeight: 900,
                                        letterSpacing: "0.1em",
                                        color: "rgb(244, 236, 232)",
                                    },
                                }}
                            >
                                <Group gap={0}>
                                    <Text
                                        component="span"
                                        style={{
                                            fontFamily: "Cinzel, Georgia, serif",
                                            fontSize: "0.88rem",
                                            fontWeight: 900,
                                            letterSpacing: "0.1em",
                                            color: "rgb(244, 236, 232)",
                                        }}
                                    >
                                        {upcase(anyDisc!)}
                                    </Text>
                                    <DisciplineDots count={anyPower ? 1 : 0} />
                                </Group>
                            </Accordion.Control>
                            <Accordion.Panel>
                                {lv1Powers.map((power) => (
                                    <PowerCard
                                        key={power.name}
                                        power={power}
                                        picked={anyPower?.name === power.name}
                                        disabled={!!anyPower && anyPower.name !== power.name}
                                        onTake={() => setAnyPower(power)}
                                        onUndo={() => setAnyPower(null)}
                                        label="Undo"
                                    />
                                ))}
                            </Accordion.Panel>
                        </Accordion.Item>
                    </Accordion>
                )}
            </div>
        )
    }

    // ── Spread picker ─────────────────────────────────────────────────────────
    if (spread === null) {
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
                            <Text
                                ta="center"
                                style={{
                                    fontFamily: "Crimson Text, Georgia, serif",
                                    fontSize: "2.2rem",
                                    color: "rgba(244, 236, 232, 0.95)",
                                    lineHeight: 1.1,
                                }}
                            >
                                Pick your{" "}
                                <span
                                    style={{
                                        fontFamily: "Cinzel, Georgia, serif",
                                        letterSpacing: "0.05em",
                                        color: C_RED,
                                    }}
                                >
                                    Discipline Spread
                                </span>
                            </Text>
                            <Text
                                ta="center"
                                maw={560}
                                style={{
                                    fontFamily: "Inter, sans-serif",
                                    fontSize: "0.9rem",
                                    color: rgba(RAW_GREY, 0.5),
                                }}
                            >
                                In Memoriam ancilla have expanded Discipline options reflecting
                                their centuries of experience.
                            </Text>
                        </Stack>

                        <div
                            style={{
                                display: "flex",
                                flexDirection: "column",
                                gap: 12,
                                maxWidth: 640,
                                margin: "0 auto",
                            }}
                        >
                            {(["focused", "strategic"] as Spread[]).map((s) => (
                                <button
                                    key={s}
                                    onClick={() => {
                                        setSpread(s)
                                        setCharacter({
                                            ...character,
                                            im_discipline_spread: s,
                                        })
                                    }}
                                    style={{
                                        padding: "20px 22px",
                                        borderRadius: 10,
                                        border: "1px solid rgba(125, 91, 72, 0.35)",
                                        background: "rgba(26, 20, 24, 0.88)",
                                        cursor: "pointer",
                                        textAlign: "left",
                                        width: "100%",
                                        fontFamily: "inherit",
                                    }}
                                >
                                    <p
                                        style={{
                                            margin: "0 0 6px 0",
                                            fontFamily: "Cinzel, Georgia, serif",
                                            fontSize: "1rem",
                                            fontWeight: 600,
                                            letterSpacing: "0.06em",
                                            color: "rgba(244, 236, 232, 0.95)",
                                            textTransform: "uppercase",
                                        }}
                                    >
                                        {s === "focused" ? "Focused" : "Strategic"}
                                    </p>
                                    <p
                                        style={{
                                            margin: 0,
                                            fontFamily: "Crimson Text, Georgia, serif",
                                            fontSize: "0.95rem",
                                            color: rgba(RAW_GREY, 0.55),
                                        }}
                                    >
                                        {s === "focused"
                                            ? "3 dots in one clan discipline · 1 in another · 1 in any discipline"
                                            : "2 dots in each of two clan disciplines · 1 each in two any disciplines"}
                                    </p>
                                </button>
                            ))}
                        </div>
                    </div>
                </ScrollArea>
            </div>
        )
    }

    // ── Main picker ───────────────────────────────────────────────────────────
    const clanLabel =
        spread === "focused"
            ? "Clan Disciplines — 3 dots (primary) · 1 dot (secondary)"
            : "Clan Disciplines — 2 dots each (two disciplines)"

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
                    <Stack gap={6} align="center" mb={20}>
                        <Text
                            ta="center"
                            style={{
                                fontFamily: "Crimson Text, Georgia, serif",
                                fontSize: "2.2rem",
                                color: "rgba(244, 236, 232, 0.95)",
                                lineHeight: 1.1,
                            }}
                        >
                            Pick your{" "}
                            <span
                                style={{
                                    fontFamily: "Cinzel, Georgia, serif",
                                    letterSpacing: "0.05em",
                                    color: C_RED,
                                }}
                            >
                                Disciplines
                            </span>
                        </Text>
                        <Text
                            ta="center"
                            style={{
                                fontFamily: "Inter, sans-serif",
                                fontSize: "0.88rem",
                                color: rgba(RAW_GREY, 0.5),
                            }}
                        >
                            {spread === "focused"
                                ? "Focused: 3 dots · 1 dot · 1 any · 1 predator type"
                                : "Strategic: 2 dots · 2 dots · 1 any · 1 any · 1 predator type"}
                        </Text>
                        <button
                            onClick={() => {
                                setSpread(null)
                                setClanPowers([])
                                setFocusedPrimaryDisc(null)
                                setAnyDisc1(null)
                                setAnyPower1(null)
                                setAnyDisc2(null)
                                setAnyPower2(null)
                                setPredatorPower(undefined)
                            }}
                            style={{
                                background: "none",
                                border: "none",
                                cursor: "pointer",
                                color: rgba(RAW_GREY, 0.4),
                                fontFamily: "Inter, sans-serif",
                                fontSize: "0.78rem",
                                padding: 0,
                                textDecoration: "underline",
                            }}
                        >
                            Change spread
                        </button>
                    </Stack>

                    <Box maw={640} mx="auto" pb="xl" w="100%">
                        {/* Clan disciplines */}
                        <GeneratorSectionDivider
                            label={clanLabel}
                            lineHeight={1}
                            accentAlpha={0.38}
                            titleSize="0.88rem"
                            marginY="sm"
                        />
                        <Accordion
                            variant="separated"
                            styles={{
                                item: {
                                    background: "rgba(255, 255, 255, 0.03)",
                                    border: "1px solid rgba(255, 255, 255, 0.07)",
                                    borderRadius: 10,
                                    marginBottom: 8,
                                },
                                panel: { paddingTop: 4 },
                            }}
                        >
                            {clanDiscNames.map((name) => {
                                const { maxDots, allowedLevels } = getClanConstraints(name)
                                return (
                                    <DisciplineAccordion
                                        key={name}
                                        name={name}
                                        discipline={clanDisciplines[name as DisciplineName]}
                                        pickedPowers={clanPowers}
                                        onTake={takeClanPower}
                                        onUndo={undoClanPower}
                                        maxDots={maxDots}
                                        allowedLevels={allowedLevels}
                                        mustBeDistinct={[]}
                                        usedDisciplines={usedClanDiscs}
                                    />
                                )
                            })}
                        </Accordion>

                        {/* Any-discipline slots */}
                        {renderAnyPicker(1, anyDisc1, setAnyDisc1, anyPower1, setAnyPower1, anyDisc2)}
                        {spread === "strategic" &&
                            renderAnyPicker(2, anyDisc2, setAnyDisc2, anyPower2, setAnyPower2, anyDisc1)}

                        {/* Predator type */}
                        <GeneratorSectionDivider
                            label={`Predator Type · ${upcase(character.predatorType.pickedDiscipline)}`}
                            lineHeight={1}
                            accentAlpha={0.38}
                            titleSize="0.88rem"
                            marginY="sm"
                        />
                        <Accordion
                            variant="separated"
                            styles={{
                                item: {
                                    background: rgba(RAW_RED, 0.04),
                                    border: `1px solid ${rgba(RAW_RED, 0.15)}`,
                                    borderRadius: 10,
                                },
                                panel: { paddingTop: 4 },
                            }}
                        >
                            <Accordion.Item value="predator">
                                <Accordion.Control
                                    icon={
                                        <Image
                                            src={predatorTypeDiscipline.logo}
                                            w={20}
                                            h={20}
                                            fit="contain"
                                        />
                                    }
                                    styles={{
                                        label: {
                                            fontFamily: "Cinzel, Georgia, serif",
                                            fontSize: "0.88rem",
                                            fontWeight: 900,
                                            letterSpacing: "0.1em",
                                            color: "rgb(244, 236, 232)",
                                        },
                                    }}
                                >
                                    <Group gap={0}>
                                        <Text
                                            component="span"
                                            style={{
                                                fontFamily: "Cinzel, Georgia, serif",
                                                fontSize: "0.88rem",
                                                fontWeight: 900,
                                                letterSpacing: "0.1em",
                                                color: "rgb(244, 236, 232)",
                                            }}
                                        >
                                            {upcase(character.predatorType.pickedDiscipline)}
                                        </Text>
                                        <DisciplineDots count={predatorPower ? 1 : 0} />
                                    </Group>
                                </Accordion.Control>
                                <Accordion.Panel>
                                    {predatorTypeDiscipline.powers
                                        .filter((p) => p.level === 1)
                                        .map((power) => (
                                            <PowerCard
                                                key={power.name}
                                                power={power}
                                                picked={predatorPower?.name === power.name}
                                                disabled={
                                                    !!predatorPower &&
                                                    predatorPower.name !== power.name
                                                }
                                                onTake={() => setPredatorPower(power)}
                                                onUndo={() => setPredatorPower(undefined)}
                                                label="Taken as predator"
                                            />
                                        ))}
                                </Accordion.Panel>
                            </Accordion.Item>
                        </Accordion>

                        <Group justify="center" mt="xl">
                            <Button
                                disabled={confirmDisabled}
                                color="grape"
                                styles={{
                                    ...generatorConfirmButtonStyles,
                                    root: {
                                        ...generatorConfirmButtonStyles.root,
                                        background: confirmDisabled
                                            ? "rgba(80, 80, 80, 0.75)"
                                            : generatorConfirmButtonStyles.root.background,
                                        boxShadow: confirmDisabled
                                            ? "none"
                                            : generatorConfirmButtonStyles.root.boxShadow,
                                        color: confirmDisabled ? rgba(RAW_GREY, 0.55) : undefined,
                                        cursor: confirmDisabled ? "not-allowed" : undefined,
                                    },
                                }}
                                onClick={() => {
                                    updateHealthAndWillpowerAndBloodPotencyAndHumanity(character)
                                    const updatedCharacter: Character = {
                                        ...character,
                                        disciplines: allPickedPowers,
                                        rituals: containsBloodSorcery(allPickedPowers)
                                            ? character.rituals
                                            : [],
                                        ceremonies: containsOblivion(allPickedPowers)
                                            ? character.ceremonies
                                            : [],
                                    }
                                    setCharacter(updatedCharacter)
                                    nextStep(updatedCharacter)
                                }}
                            >
                                Confirm
                            </Button>
                        </Group>
                    </Box>
                </div>
            </ScrollArea>
        </div>
    )
}
