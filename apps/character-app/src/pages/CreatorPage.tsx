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

    // Draft persistence — localStorage for reload survival.
    //
    // The ref exists so the debounced auto-save closure always reads the
    // current id without re-subscribing; the state exists so components that
    // RENDER the id (Final's submit button) actually update when it changes.
    // It used to be ref-only and passed straight to Final as a prop, so after
    // the first auto-save created a draft React never re-rendered and Final
    // still saw "" — its submit refused with "No draft found. Try making a
    // change to trigger an auto-save, then submit again", a message written to
    // work around this rather than fix it. Always go through setDraftId.
    const draftIdRef = useRef(localStorage.getItem(DRAFT_ID_KEY) ?? "")
    const [draftId, setDraftIdState] = useState(draftIdRef.current)

    const setDraftId = (id: string) => {
        draftIdRef.current = id
        setDraftIdState(id)
        if (id) {
            localStorage.setItem(DRAFT_ID_KEY, id)
        } else {
            localStorage.removeItem(DRAFT_ID_KEY)
        }
    }
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
                    setDraftId(draft.id)
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
                    setDraftId(draftId)
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
        setDraftId("")
        setSelectedStep(defaultGeneratorStepId)
    }

    // ---------------------------------------------------------------------------
    // ?new=1 — start a fresh draft rather than resuming the stored one
    // ---------------------------------------------------------------------------
    // Both `character` and the draft id are restored from localStorage on
    // mount, so navigating to the creator resumes whatever was last worked on.
    // That is right for "Edit draft", but wrong for "Create a new character":
    // without a signal the new-character link resumed the previous draft and
    // the 1.5s autosave then wrote over it — including a draft already
    // submitted or awaiting revision, since cc_update_draft still accepts
    // edits in those states.
    //
    // The flag is consumed once and stripped from the URL, so a refresh does
    // not wipe the character the player has just started.
    useEffect(() => {
        const params = new URLSearchParams(window.location.search)
        if (params.get("new") !== "1") return

        setCharacter(getEmptyCharacter())
        setDraftId("")
        setSelectedStep(defaultGeneratorStepId)

        params.delete("new")
        const query = params.toString()
        window.history.replaceState(
            {},
            "",
            `${window.location.pathname}${query ? `?${query}` : ""}`
        )
        // Mount only: re-running would discard work in progress.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // ---------------------------------------------------------------------------
    // Reset (called from Final's "Start over" button)
    // ---------------------------------------------------------------------------
    const handleReset = () => {
        setDraftId("")
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
                    backgroundImage: "linear-gradient(rgba(10,10,20,0.92), rgba(16,21,40,0.96)), url('/static/images/music.png')",
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
                                draftId={draftId}
                                onReset={handleReset}
                            />
                        </RenderProfiler>
                    </div>
                </div>
            </Box>
        </AppShell>
    )
}
