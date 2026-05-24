import {
    AppShell,
    BackgroundImage,
    Container,
    useComputedColorScheme
} from "@mantine/core"
import { useLocalStorage, useMediaQuery } from "@mantine/hooks"
import { notifications } from "@mantine/notifications"
import { useEffect, useState } from "react"
import "./App.css"
import Generator from "./generator/Generator"
import { defaultGeneratorStepId, type GeneratorStepId } from "./generator/steps"
import AsideBar from "./sidebar/AsideBar"
import Sidebar from "./sidebar/Sidebar"
import Topbar from "./topbar/Topbar"
import CharacterSheet from "./character_sheet/CharacterSheet"
import BrokenSaveModal from "./components/BrokenSaveModal"
import LoadModal from "./components/LoadModal"
import NameCharacterBeforeSwitchModal from "./components/NameCharacterBeforeSwitchModal"
import MePage from "./pages/MePage"

import { useViewportSize } from "@mantine/hooks"
import { rndInt } from "./generator/utils"
import { globals } from "./globals"
import club from "./resources/backgrounds/aleksandr-popov-3InMDrsuYrk-unsplash.jpg"
import brokenDoor from "./resources/backgrounds/amber-kipp-VcPo_DvKjQE-unsplash.jpg"
import city from "./resources/backgrounds/dominik-hofbauer-IculuMoubkQ-unsplash.jpg"
import bloodGuy from "./resources/backgrounds/marcus-bellamy-xvW725b6LQk-unsplash.jpg"
import batWoman from "./resources/backgrounds/peter-scherbatykh-VzQWVqHOCaE-unsplash.jpg"
import alley from "./resources/backgrounds/thomas-le-KNQEvvCGoew-unsplash.jpg"
import { useCharacterLocalStorage } from "./hooks/useCharacterLocalStorage"
import {
    characterSchema,
    getEmptyCharacter,
    type Character as CharacterType
} from "./data/Character"
import { useAuth } from "./hooks/useAuth"
import { useCharacters } from "./hooks/useCharacters"
import { api } from "./utils/api"

const backgrounds = [club, brokenDoor, city, bloodGuy, batWoman, alley]
type PendingSwitchAction = { type: "load"; characterId: string } | { type: "create" } | null

function App() {
    const queryClient = useQueryClient()
    const [pathname, setPathname] = useState(window.location.pathname)
    const { isAuthenticated } = useAuth()
    const { data: characters } = useCharacters(isAuthenticated)

    useEffect(() => {
        const handleLocationChange = () => {
            setPathname(window.location.pathname)
        }
        window.addEventListener("popstate", handleLocationChange)
        return () => window.removeEventListener("popstate", handleLocationChange)
    }, [])

    const { height: viewportHeight, width: viewportWidth } = useViewportSize()
    globals.viewportHeightPx = viewportHeight
    globals.viewportWidthPx = viewportWidth
    globals.isPhoneScreen = useMediaQuery(`(max-width: ${globals.phoneScreenW}px)`)
    globals.isSmallScreen = useMediaQuery(`(max-width: ${globals.smallScreenW}px)`)
    const computedColorScheme = useComputedColorScheme("dark", { getInitialValueInEffect: true })

    useEffect(() => {
        globals.largeFontSize = globals.isPhoneScreen ? "21px" : "30px"
        globals.smallFontSize = globals.isPhoneScreen ? "16px" : "25px"
        globals.smallerFontSize = globals.isPhoneScreen ? "14px" : "20px"
    }, [globals.isPhoneScreen, globals.isSmallScreen])

    const [character, setCharacter] = useCharacterLocalStorage()
    const [selectedStep, setSelectedStep] = useLocalStorage<GeneratorStepId>({
        key: "selectedGeneratorStep",
        defaultValue: defaultGeneratorStepId
    })
    const [loadModalOpened, setLoadModalOpened] = useState(false)
    const [loadedFile, setLoadedFile] = useState<File | null>(null)
    const [backgroundIndex] = useState(rndInt(0, backgrounds.length))
    const [pendingSwitchAction, setPendingSwitchAction] = useState<PendingSwitchAction>(null)
    const [switchNameValue, setSwitchNameValue] = useState("")
    const [isSavingBeforeSwitch, setIsSavingBeforeSwitch] = useState(false)
    const userCharacters = (
        (characters as Array<{ id: string; name: string; shared?: boolean }>) || []
    ).filter((candidate) => !candidate.shared)
    const emptyCharacter = getEmptyCharacter()

    const [showAsideBar, setShowAsideBar] = useState(!globals.isSmallScreen)
    useEffect(() => {
        setShowAsideBar(!globals.isSmallScreen)
    }, [globals.isSmallScreen])

    const openLoadModal = (file: File | null) => {
        if (!file) {
            return
        }

        setLoadedFile(file)
        setLoadModalOpened(true)
    }

    const closeLoadModal = () => {
        setLoadModalOpened(false)
        setLoadedFile(null)
    }

    const loadSavedCharacter = async (characterId: string) => {
        const response = await api.getCharacter(characterId)
        const loadedCharacter = characterSchema.parse((response as { data: unknown }).data)

        setCharacter({
            ...loadedCharacter,
            id: characterId
        } as CharacterType & { id: string })
        setSelectedStep("final")

        notifications.show({
            title: "Character loaded",
            message: `Loaded "${loadedCharacter.name}"`,
            color: "green",
            autoClose: 3000
        })
    }

    const saveCurrentCharacter = async () => {
        const isEmptyCharacter = isCurrentCharacterEmpty()

        if (isEmptyCharacter) {
            return
        }

        if (!character.name.trim()) {
            throw new Error("Please give the current character a name before switching.")
        }

        const targetCharacter = character.id
            ? userCharacters.find((candidate) => candidate.id === character.id)
            : null
        const payload = {
            name: character.name,
            data: character,
            version: character.version
        }

        const savedCharacter = targetCharacter
            ? await api.updateCharacter(targetCharacter.id, payload)
            : await api.createCharacter(payload)

        const saved = savedCharacter as {
            id: string
            data?: { characterVersion?: number }
            characterVersion?: number
        }

        setCharacter({
            ...character,
            id: saved.id,
            characterVersion:
                saved.characterVersion ??
                saved.data?.characterVersion ??
                character.characterVersion ??
                0
        } as CharacterType & { id: string; characterVersion: number })

        await queryClient.invalidateQueries({ queryKey: ["characters"] })
    }

    const isCurrentCharacterEmpty = () =>
        JSON.stringify({
            ...character,
            id: "",
            name: "",
            version: emptyCharacter.version,
            characterVersion: emptyCharacter.characterVersion
        }) === JSON.stringify(emptyCharacter)

    const completePendingSwitchAction = async (action: PendingSwitchAction) => {
        if (!action) {
            return
        }

        if (action.type === "load") {
            await loadSavedCharacter(action.characterId)
            return
        }

        setCharacter(getEmptyCharacter())
        setSelectedStep("clan")
    }

    const openNameBeforeSwitchModal = (action: PendingSwitchAction) => {
        setSwitchNameValue(character.name)
        setPendingSwitchAction(action)
    }

    const closeNameBeforeSwitchModal = () => {
        setPendingSwitchAction(null)
        setSwitchNameValue("")
        setIsSavingBeforeSwitch(false)
    }

    const handleLoadSavedCharacter = async (characterId: string) => {
        if (characterId !== character.id) {
            if (!character.name.trim() && !isCurrentCharacterEmpty()) {
                openNameBeforeSwitchModal({ type: "load", characterId })
                return
            }

            try {
                await saveCurrentCharacter()
            } catch (error) {
                const notifiedError =
                    error instanceof Error ? error : new Error("Failed to save current character")
                notifications.show({
                    title: "Error saving character",
                    message: notifiedError.message,
                    color: "red"
                })
                ;(notifiedError as Error & { alreadyNotified?: boolean }).alreadyNotified = true
                throw notifiedError
            }
        }

        await loadSavedCharacter(characterId)
    }

    const handleCreateCharacter = async () => {
        if (!character.name.trim() && !isCurrentCharacterEmpty()) {
            openNameBeforeSwitchModal({ type: "create" })
            return
        }

        try {
            await saveCurrentCharacter()
        } catch (error) {
            const notifiedError =
                error instanceof Error ? error : new Error("Failed to save current character")
            notifications.show({
                title: "Error saving character",
                message: notifiedError.message,
                color: "red"
            })
            ;(notifiedError as Error & { alreadyNotified?: boolean }).alreadyNotified = true
            throw notifiedError
        }

        await completePendingSwitchAction({ type: "create" })
    }

    const handleSaveAndContinueSwitch = async () => {
        if (!switchNameValue.trim()) {
            notifications.show({
                title: "Name required",
                message: "Enter a character name before saving and switching.",
                color: "red"
            })
            return
        }

        setIsSavingBeforeSwitch(true)

        try {
            const characterToSave = { ...character, name: switchNameValue }
            setCharacter(characterToSave)
            const targetCharacter = characterToSave.id
                ? userCharacters.find((candidate) => candidate.id === characterToSave.id)
                : null
            const payload = {
                name: characterToSave.name,
                data: characterToSave,
                version: characterToSave.version
            }
            const savedCharacter = targetCharacter
                ? await api.updateCharacter(targetCharacter.id, payload)
                : await api.createCharacter(payload)
            const saved = savedCharacter as {
                id: string
                data?: { characterVersion?: number }
                characterVersion?: number
            }

            setCharacter({
                ...characterToSave,
                id: saved.id,
                characterVersion:
                    saved.characterVersion ??
                    saved.data?.characterVersion ??
                    characterToSave.characterVersion ??
                    0
            } as CharacterType & { id: string; characterVersion: number })
            await queryClient.invalidateQueries({ queryKey: ["characters"] })

            const action = pendingSwitchAction
            closeNameBeforeSwitchModal()
            await completePendingSwitchAction(action)
        } catch (error) {
            notifications.show({
                title: "Error saving character",
                message:
                    error instanceof Error ? error.message : "Failed to save current character",
                color: "red"
            })
            setIsSavingBeforeSwitch(false)
        }
    }

    const handleDeleteAndContinueSwitch = async () => {
        const action = pendingSwitchAction
        closeNameBeforeSwitchModal()
        setCharacter(getEmptyCharacter())
        await completePendingSwitchAction(action)
    }

    if (pathname === "/sheet") {
        return (
            <>
                <CharacterSheet character={character} setCharacter={setCharacter} />
                <BrokenSaveModal />
            </>
        )
    }

    if (pathname === "/me") {
        return (
            <>
                <MePage />
                <BrokenSaveModal />
            </>
        )
    }

    return (
        <>
            <BrokenSaveModal />
            <LoadModal
                loadModalOpened={loadModalOpened}
                closeLoadModal={closeLoadModal}
                setCharacter={setCharacter}
                loadedFile={loadedFile}
                setSelectedStep={setSelectedStep}
            />
            <NameCharacterBeforeSwitchModal
                opened={pendingSwitchAction !== null}
                pendingActionLabel={
                    pendingSwitchAction?.type === "load"
                        ? "switch characters"
                        : "create a new character"
                }
                nameValue={switchNameValue}
                setNameValue={setSwitchNameValue}
                onClose={closeNameBeforeSwitchModal}
                onSaveAndContinue={handleSaveAndContinueSwitch}
                onDiscardAndContinue={handleDeleteAndContinueSwitch}
                isSaving={isSavingBeforeSwitch}
            />
            <AppShell
                padding="0"
                styles={(theme) => ({
                    root: {
                        height: "100vh"
                    },
                    main: {
                        backgroundColor:
                            computedColorScheme === "dark"
                                ? theme.colors.dark[8]
                                : theme.colors.gray[0],
                        height: "100%",
                        display: "flex",
                        flexDirection: "column",
                        overflow: "hidden"
                    }
                })}
            >
                {!globals.isSmallScreen && (
                    <AppShell.Navbar p="xs" w={{ base: 250, xl: 300 }}>
                        <Sidebar
                            character={character}
                            onLoadFromFile={openLoadModal}
                            onLoadSavedCharacter={handleLoadSavedCharacter}
                            onCreateCharacter={handleCreateCharacter}
                        />
                    </AppShell.Navbar>
                )}
                <AppShell.Header p="xs" h={75}>
                    <Topbar
                        asideBar={{
                            show: showAsideBar,
                            onToggle: () => setShowAsideBar((prev) => !prev)
                        }}
                    />
                </AppShell.Header>
                {showAsideBar && (
                    <AppShell.Aside
                        p="md"
                        w={{ xs: 200 }}
                        style={{ display: "flex", flexDirection: "column" }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <AsideBar
                            selectedStep={selectedStep}
                            setSelectedStep={setSelectedStep}
                            character={character}
                        />
                    </AppShell.Aside>
                )}
                <BackgroundImage
                    h={"100%"}
                    src={backgrounds[backgroundIndex]}
                    style={{ flex: 1, minHeight: 0 }}
                    onClick={() => {
                        if (globals.isSmallScreen && showAsideBar) {
                            setShowAsideBar(false)
                        }
                    }}
                >
                    <div
                        style={{
                            backgroundColor: "rgba(0, 0, 0, 0.7)",
                            height: "100%",
                            display: "flex",
                            flexDirection: "column"
                        }}
                    >
                        <Container
                            h={"100%"}
                            style={{
                                width: "100%",
                                display: "flex",
                                flexDirection: "column",
                                flex: 1,
                                minHeight: 0
                            }}
                        >
                            <Generator
                                character={character}
                                setCharacter={setCharacter}
                                selectedStep={selectedStep}
                                setSelectedStep={setSelectedStep}
                            />
                        </Container>
                    </div>
                </BackgroundImage>
            </AppShell>
        </>
    )
}

export default App
