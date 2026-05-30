import { Box, Image, ScrollArea, Stack, Text } from "@mantine/core"
import { RAW_GOLD, RAW_GREY, RAW_RED, rgba } from "~/theme/colors"
import { notifications } from "@mantine/notifications"
import { useEffect } from "react"
import ReactGA from "react-ga4"
import { trackEvent } from "../../utils/analytics"
import { isThinbloodFlaw, isThinbloodMerit, loresheets } from "~/data/MeritsAndFlaws"
import { ClanName, clanNameSchema } from "~/data/NameSchemas"
import { Character, getEmptyCharacter, MeritFlaw } from "../../data/Character"
import { clans } from "../../data/Clans"
import { globals } from "../../globals"
import { notDefault } from "../utils"
import {
    generatorScrollableAreaStyle,
    generatorScrollableContentStyle,
    generatorScrollableShellStyle
} from "./sharedGeneratorScrollableLayout"
import { nightfallScrollAreaStyles, nightfallScrollbarSize } from "./sharedScrollAreaStyles"
import { GeneratorStepHero } from "./sharedGeneratorUi"

type ClanPickerProps = {
    character: Character
    setCharacter: (character: Character) => void
    nextStep: () => void
}

const ClanPicker = ({ character, setCharacter, nextStep }: ClanPickerProps) => {
    useEffect(() => {
        ReactGA.send({ hitType: "pageview", title: "Clan Picker" })
    }, [])

    const handleClanClick = (clan: ClanName) => {
        const newMerits =
            clan === character.clan ? character.merits : getNewMerits(clan, character)
        const newFlaws =
            clan === "Thin-blood" ? character.flaws : flawsWithoutThinbloodFlaws(character.flaws)

        if (
            (notDefault(character, "disciplines") || notDefault(character, "predatorType")) &&
            clan !== character.clan
        ) {
            notifications.show({
                title: "Reset Disciplines",
                message: "Because you changed your clan",
                autoClose: 7000,
                color: "yellow"
            })
            setCharacter({
                ...character,
                clan,
                disciplines: [],
                availableDisciplineNames: clans[clan].nativeDisciplines,
                predatorType:
                    clan === "Thin-blood"
                        ? getEmptyCharacter().predatorType
                        : character.predatorType,
                merits: newMerits,
                flaws: newFlaws
            })
        } else {
            setCharacter({
                ...character,
                clan,
                availableDisciplineNames: clans[clan].nativeDisciplines,
                merits: newMerits,
                flaws: newFlaws
            })
        }

        trackEvent({ action: "clan clicked", category: "clans", label: clan })
        nextStep()
    }

    const createClanRow = (clan: ClanName) => {
        const isSelected = character.clan === clan
        const disciplines = clans[clan].nativeDisciplines

        return (
            <div
                key={clan}
                data-testid={`clan-${clan.toLowerCase().replace(/\s+/g, "-")}-card`}
                onClick={() => handleClanClick(clan)}
                onMouseEnter={(e) => {
                    if (!isSelected) {
                        e.currentTarget.style.borderLeftColor = rgba(RAW_RED, 0.65)
                        e.currentTarget.style.background = rgba(RAW_RED, 0.06)
                    }
                }}
                onMouseLeave={(e) => {
                    if (!isSelected) {
                        e.currentTarget.style.borderLeftColor = "rgba(255,255,255,0.05)"
                        e.currentTarget.style.background = "transparent"
                    }
                }}
                style={{
                    display: "flex",
                    alignItems: "center",
                    gap: globals.isPhoneScreen ? 10 : 14,
                    padding: globals.isPhoneScreen ? "8px 10px" : "10px 14px",
                    borderLeft: `3px solid ${isSelected ? rgba(RAW_RED, 0.85) : "rgba(255,255,255,0.05)"}`,
                    borderBottom: "1px solid rgba(255,255,255,0.04)",
                    background: isSelected ? rgba(RAW_RED, 0.1) : "transparent",
                    cursor: "pointer",
                    transition: "border-left-color 140ms ease, background 140ms ease"
                }}
            >
                <Image
                    src={clans[clan].logo}
                    h={globals.isPhoneScreen ? 32 : 40}
                    w={globals.isPhoneScreen ? 32 : 40}
                    fit="contain"
                    style={{ flexShrink: 0, opacity: isSelected ? 1 : 0.72 }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                    <Text
                        style={{
                            fontFamily: "Cinzel, Georgia, serif",
                            fontWeight: isSelected ? 600 : 500,
                            fontSize: globals.isPhoneScreen ? "0.92rem" : "1rem",
                            color: isSelected ? rgba(RAW_RED, 1) : rgba(RAW_GREY, 0.92),
                            letterSpacing: "0.04em",
                            lineHeight: 1.2
                        }}
                    >
                        {clan}
                    </Text>
                    {!globals.isPhoneScreen && (
                        <Text
                            size="xs"
                            style={{
                                color: "rgba(200,185,170,0.5)",
                                marginTop: 2,
                                fontFamily: "Crimson Text, Georgia, serif",
                                fontSize: "0.82rem"
                            }}
                        >
                            {clans[clan].description}
                        </Text>
                    )}
                </div>
                <div
                    style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: 4,
                        justifyContent: "flex-end",
                        flexShrink: 0,
                        maxWidth: globals.isPhoneScreen ? 110 : 180
                    }}
                >
                    {disciplines.map((d) => (
                        <span
                            key={d}
                            style={{
                                fontSize: "0.68rem",
                                letterSpacing: "0.06em",
                                textTransform: "capitalize",
                                padding: "2px 6px",
                                borderRadius: 3,
                                background: rgba(RAW_GOLD, 0.1),
                                border: `1px solid ${rgba(RAW_GOLD, 0.22)}`,
                                color: rgba(RAW_GOLD, 0.78),
                                whiteSpace: "nowrap"
                            }}
                        >
                            {d}
                        </span>
                    ))}
                </div>
            </div>
        )
    }

    const clanList = (names: string[]) =>
        names.map((c) => clanNameSchema.parse(c)).map(createClanRow)

    return (
        <div style={generatorScrollableShellStyle}>
            <ScrollArea
                style={generatorScrollableAreaStyle}
                w={"100%"}
                px={globals.isPhoneScreen ? 10 : 20}
                pt={4}
                pb={8}
                scrollbarSize={nightfallScrollbarSize}
                type="always"
                styles={nightfallScrollAreaStyles}
            >
                <div style={generatorScrollableContentStyle}>
                    <GeneratorStepHero
                        leadText="Choose your"
                        accentText="Clan"
                        description="Your clan defines your lineage, your powers, and your curse."
                    />

                    <Stack gap={0} mb={globals.isPhoneScreen ? 12 : 18}>
                        <CategoryHeading label="Camarilla" />
                        {clanList(["Banu Haqim", "Brujah", "Gangrel", "Malkavian", "Nosferatu", "Toreador", "Tremere", "Ventrue"])}

                        <CategoryHeading label="Anarch" />
                        {clanList(["Caitiff", "Hecata", "Lasombra", "Ministry", "Ravnos", "Salubri", "Tzimisce"])}

                        <CategoryHeading label="Independent / Thin-Blood" />
                        {clanList(["Thin-blood"])}
                    </Stack>
                </div>
            </ScrollArea>
        </div>
    )
}

const CategoryHeading = ({ label }: { label: string }) => (
    <Box my="md">
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
            <div
                style={{
                    flex: 1,
                    height: "2px",
                    background: `linear-gradient(90deg, transparent 0%, ${rgba(RAW_RED, 0.38)} 50%, transparent 100%)`
                }}
            />
            <Text
                ta="center"
                style={{
                    fontFamily: "Cinzel, Georgia, serif",
                    fontSize: "0.96rem",
                    fontWeight: 600,
                    letterSpacing: "0.22em",
                    textTransform: "uppercase",
                    color: rgba(RAW_RED, 1)
                }}
            >
                {label}
            </Text>
            <div
                style={{
                    flex: 1,
                    height: "2px",
                    background: `linear-gradient(90deg, transparent 0%, ${rgba(RAW_RED, 0.38)} 50%, transparent 100%)`
                }}
            />
        </div>
    </Box>
)

const meritsWithoutThinbloodMerits = (merits: MeritFlaw[]) =>
    merits.filter((m) => !isThinbloodMerit(m.name))
const flawsWithoutThinbloodFlaws = (flaws: MeritFlaw[]) =>
    flaws.filter((f) => !isThinbloodFlaw(f.name))
const meritsWithoutInvalidLoreSheets = (newClan: ClanName, character: Character) => {
    const { merits } = character
    const loresheetMerits = loresheets.flatMap((loresheet) =>
        loresheet.merits.map((lsMerit) => {
            return { loresheet, meritName: lsMerit.name }
        })
    )

    return merits.filter((m) => {
        const loresheetMerit = loresheetMerits.find((lsMerit) => m.name === lsMerit.meritName)
        if (!loresheetMerit) return true

        const requirementsMet = loresheetMerit.loresheet.requirementFunctions.every((fun) =>
            fun({ ...character, clan: newClan })
        )
        return requirementsMet
    })
}

const getNewMerits = (newClan: ClanName, character: Character) => {
    let newMerits = meritsWithoutInvalidLoreSheets(newClan, character)
    newMerits = newClan === "Thin-blood" ? newMerits : meritsWithoutThinbloodMerits(newMerits)

    if (newMerits.length < character.merits.length) {
        notifications.show({
            title: "Reset (some) Merits",
            message: "Because you changed your clan",
            autoClose: 7000,
            color: "yellow"
        })
    }

    return newMerits
}

export default ClanPicker
