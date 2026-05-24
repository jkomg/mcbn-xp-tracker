import { AppShell, Box, useComputedColorScheme } from "@mantine/core"
import { useMediaQuery, useViewportSize } from "@mantine/hooks"
import { useEffect, useRef, useState } from "react"
import React from "react"
import { useLocation, useNavigate } from "@tanstack/react-router"
import RenderProfiler from "~/components/RenderProfiler"
import { characterSchema, getEmptyCharacter, type Character as CharacterType } from "~/data/Character"
import Generator from "~/generator/Generator"
import {
    defaultGeneratorStepId,
    normalizeGeneratorStepId,
    type GeneratorStepId,
} from "~/generator/steps"
import { globals } from "~/globals"
import { useCharacterLocalStorage } from "~/hooks/useCharacterLocalStorage"
import AsideBar from "~/sidebar/AsideBar"
import Sidebar from "~/sidebar/Sidebar"
import Topbar from "~/topbar/Topbar"
import { cc } from "~/utils/api"

const DRAFT_ID_KEY = "cc-draft-id"

export default function CreatorPage() {
    const navigate = useNavigate()
    const location = useLocation()
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
    const [showAsideBar, setShowAsideBar] = useState(!globals.isSmallScreen)

    // Draft persistence — stored in a ref (no re-renders) + localStorage for reload survival
    const draftIdRef = useRef(localStorage.getItem(DRAFT_ID_KEY) ?? "")
    const saveInFlightRef = useRef(false)

    // Ticket channel ID from ?ticket= URL param (set by Lasombra's welcome message link).
    // Captured once on mount; stored in a ref so it's available when the first draft is created.
    const ticketChannelIdRef = useRef(new URLSearchParams(location.search).get("ticket") ?? "")

    useEffect(() => {
        setShowAsideBar(!globals.isSmallScreen)
    }, [globals.isSmallScreen])

    // ---------------------------------------------------------------------------
    // Step routing via URL hash
    // ---------------------------------------------------------------------------
    const routeHash = location.hash.replace(/^#/, "")
    const selectedStep = normalizeGeneratorStepId(routeHash || defaultGeneratorStepId, character)

    const setSelectedStep = (step: GeneratorStepId, options?: { replace?: boolean }) => {
        const nextHash = `#${step}`
        if (location.hash === nextHash) return
        // Preserve the current pathname (/player/new or /player/<name>/sheet) so
        // that navigating between steps doesn't redirect to /create, which Flask
        // doesn't serve and would 404 on refresh.
        navigate({ to: location.pathname as "/player/new", hash: step, replace: options?.replace ?? false })
    }

    useEffect(() => {
        const normalized = routeHash
            ? normalizeGeneratorStepId(routeHash, character)
            : defaultGeneratorStepId
        if (location.hash !== `#${normalized}`) {
            setSelectedStep(normalized, { replace: true })
        }
    }, [character, location.hash, location.pathname, routeHash])

    // ---------------------------------------------------------------------------
    // Auto-save to Flask CC API (debounced 1.5 s)
    // ---------------------------------------------------------------------------
    const isCharacterEmpty = () => {
        const empty = getEmptyCharacter()
        return (
            JSON.stringify({ ...character, id: "", name: "", version: empty.version, characterVersion: empty.characterVersion, draft_id: "" }) ===
            JSON.stringify(empty)
        )
    }

    useEffect(() => {
        if (isCharacterEmpty()) return

        const timer = setTimeout(async () => {
            if (saveInFlightRef.current) return
            saveInFlightRef.current = true
            try {
                const charName = character.name?.trim() ?? ""
                const charData = { ...character }

                if (!draftIdRef.current) {
                    const draft = await cc.createDraft({
                        character_name: charName,
                        character_data: charData,
                        ...(ticketChannelIdRef.current ? { ticket_channel_id: ticketChannelIdRef.current } : {}),
                    })
                    draftIdRef.current = draft.id
                    localStorage.setItem(DRAFT_ID_KEY, draft.id)
                } else {
                    await cc.saveDraft(draftIdRef.current, {
                        character_name: charName,
                        character_data: charData,
                    })
                }
            } catch (e) {
                console.warn("Auto-save failed:", e)
            } finally {
                saveInFlightRef.current = false
            }
        }, 1500)

        return () => clearTimeout(timer)
    }, [character])

    // ---------------------------------------------------------------------------
    // Load a draft by ID (used by Sidebar character-switch)
    // ---------------------------------------------------------------------------
    const handleLoadDraft = async (draftId: string) => {
        try {
            const draft = await cc.getDraft(draftId)
            if (draft.character_data) {
                const parsed = characterSchema.safeParse(draft.character_data)
                if (parsed.success) {
                    setCharacter(parsed.data)
                    draftIdRef.current = draftId
                    localStorage.setItem(DRAFT_ID_KEY, draftId)
                    setSelectedStep(defaultGeneratorStepId)
                }
            }
        } catch (e) {
            console.error("Failed to load draft:", e)
        }
    }

    // ---------------------------------------------------------------------------
    // Start a new draft (clears everything)
    // ---------------------------------------------------------------------------
    const handleNewCharacter = async () => {
        setCharacter(getEmptyCharacter())
        draftIdRef.current = ""
        localStorage.removeItem(DRAFT_ID_KEY)
        setSelectedStep(defaultGeneratorStepId)
    }

    // ---------------------------------------------------------------------------
    // Reset (called from Final's "Start over" button)
    // ---------------------------------------------------------------------------
    const handleReset = () => {
        draftIdRef.current = ""
        localStorage.removeItem(DRAFT_ID_KEY)
    }

    return (
        <AppShell
            padding="0"
            header={{ height: 52 }}
            styles={(theme) => ({
                root: { height: "100vh" },
                header: {
                    background: "transparent",
                    borderBottom: "1px solid rgba(139, 0, 0, 0.4)",
                    zIndex: 200,
                },
                navbar: {
                    top: 52,
                    height: "calc(100vh - 52px)",
                    background: "rgba(16, 21, 40, 0.88)",
                    backdropFilter: "blur(10px)",
                    WebkitBackdropFilter: "blur(10px)",
                    borderRight: "1px solid rgba(139, 0, 0, 0.3)",
                },
                aside: {
                    top: 52,
                    height: "calc(100vh - 52px)",
                    background: "rgba(16, 21, 40, 0.88)",
                    backdropFilter: "blur(10px)",
                    WebkitBackdropFilter: "blur(10px)",
                    borderLeft: "1px solid rgba(139, 0, 0, 0.3)",
                },
                main: {
                    backgroundColor:
                        computedColorScheme === "dark"
                            ? theme.colors.dark[8]
                            : theme.colors.gray[0],
                    height: "100%",
                    display: "flex",
                    flexDirection: "column",
                    overflow: "hidden",
                },
            })}
        >
            <AppShell.Header>
                <RenderProfiler id="CreatorTopbar">
                    <Topbar
                        asideBar={{
                            show: showAsideBar,
                            onToggle: () => setShowAsideBar(!showAsideBar),
                        }}
                    />
                </RenderProfiler>
            </AppShell.Header>
            {!globals.isSmallScreen && (
                <AppShell.Navbar p="xs" w={{ base: 250, xl: 300 }}>
                    <RenderProfiler id="CreatorSidebar">
                        <Sidebar
                            character={character}
                            onLoadFromFile={() => undefined}
                            onLoadSavedCharacter={handleLoadDraft}
                            onCreateCharacter={handleNewCharacter}
                        />
                    </RenderProfiler>
                </AppShell.Navbar>
            )}
            {showAsideBar && (
                <AppShell.Aside
                    p="md"
                    w={{ xs: 200 }}
                    style={{ display: "flex", flexDirection: "column" }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <RenderProfiler id="CreatorAsideBar">
                        <AsideBar
                            selectedStep={selectedStep}
                            setSelectedStep={setSelectedStep}
                            character={character}
                        />
                    </RenderProfiler>
                </AppShell.Aside>
            )}
            <Box
                h="100%"
                style={{
                    flex: 1,
                    minHeight: 0,
                    backgroundImage: "linear-gradient(rgba(10,10,20,0.78), rgba(16,21,40,0.88)), url('/static/images/music.png')",
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                    display: "flex",
                    flexDirection: "column",
                }}
                onClick={() => {
                    if (globals.isSmallScreen && showAsideBar) {
                        setShowAsideBar(false)
                    }
                }}
            >
                <div
                    style={{
                        height: "100%",
                        display: "flex",
                        flexDirection: "column",
                    }}
                >
                    <div
                        style={
                            {
                                width: "100%",
                                height: "100%",
                                display: "flex",
                                flexDirection: "column",
                                flex: 1,
                                minHeight: 0,
                                "--aside-offset": showAsideBar ? "200px" : "0px",
                                "--navbar-offset": globals.isSmallScreen ? "0px" : "250px",
                            } as React.CSSProperties
                        }
                    >
                        <RenderProfiler id="Generator">
                            <Generator
                                character={character}
                                setCharacter={setCharacter}
                                selectedStep={selectedStep}
                                setSelectedStep={setSelectedStep}
                                draftId={draftIdRef.current}
                                onReset={handleReset}
                            />
                        </RenderProfiler>
                    </div>
                </div>
            </Box>
        </AppShell>
    )
}
