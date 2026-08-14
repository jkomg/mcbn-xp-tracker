import { Button, ScrollArea, Stack, Tabs, Text, TextInput, Title } from "@mantine/core"
import { IconCheck } from "@tabler/icons-react"
import { useEffect, useState } from "react"
import { Character } from "~/data/Character"
import { AttributesKey } from "~/data/Attributes"
import { SkillsKey } from "~/data/Skills"
import { Loresheet, LoresheetDot, LORESHEETS, loresheetDotCost } from "~/data/Loresheets"
import { RAW_RED, rgba } from "~/theme/colors"
import { cc } from "~/utils/api"
import {
    attrLevelCost,
    computeCcXpSpent,
    cumulativeCost,
    skillLevelCost,
} from "../ccXp"
import {
    generatorScrollableAreaStyle,
    generatorScrollableContentStyle,
    generatorScrollableShellStyle,
} from "./sharedGeneratorScrollableLayout"
import { nightfallScrollAreaStyles, nightfallScrollbarSize } from "./sharedScrollAreaStyles"

// XP cost functions and spend maths live in ../ccXp so the sidebar and this
// step cannot drift apart again — they previously disagreed about whether
// attribute/skill raises counted against the budget.

// ─── Stat groupings ──────────────────────────────────────────────────────────
const ATTR_GROUPS: { label: string; attrs: AttributesKey[] }[] = [
    { label: "Physical", attrs: ["strength", "dexterity", "stamina"] },
    { label: "Social",   attrs: ["charisma", "manipulation", "composure"] },
    { label: "Mental",   attrs: ["intelligence", "wits", "resolve"] },
]

const SKILL_GROUPS: { label: string; skills: SkillsKey[] }[] = [
    {
        label: "Physical",
        skills: ["athletics", "brawl", "craft", "drive", "firearms", "melee", "larceny", "stealth", "survival"],
    },
    {
        label: "Social",
        skills: ["animal ken", "etiquette", "insight", "intimidation", "leadership", "performance", "persuasion", "streetwise", "subterfuge"],
    },
    {
        label: "Mental",
        skills: ["academics", "awareness", "finance", "investigation", "medicine", "occult", "politics", "science", "technology"],
    },
]

// ─── Loresheet helpers ───────────────────────────────────────────────────────
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
    "live-from-the-succubus-club": "Live From the Succubus Club",
    download: "Download / Choice of Games",
    "winters-teeth": "Winter's Teeth",
    custom: "Nashville",
}

function isLoresheetAvailable(ls: Loresheet, clan: string) {
    return !ls.clanRestriction?.length || ls.clanRestriction.includes(clan)
}
function isDotAvailable(dot: LoresheetDot, clan: string) {
    return !dot.clanRestriction?.length || dot.clanRestriction.includes(clan)
}
function isPurchased(character: Character, lsId: string, dot: number) {
    return (character.loresheet_purchases ?? []).some(p => p.loresheet_id === lsId && p.dot === dot)
}
function togglePurchase(character: Character, lsId: string, dot: number): Character {
    const current = character.loresheet_purchases ?? []
    const exists = current.some(p => p.loresheet_id === lsId && p.dot === dot)
    return {
        ...character,
        loresheet_purchases: exists
            ? current.filter(p => !(p.loresheet_id === lsId && p.dot === dot))
            : [...current, { loresheet_id: lsId, dot }],
    }
}

// ─── Shared style constants ───────────────────────────────────────────────────
const FONT_DISPLAY = "Cinzel, Georgia, serif"
const FONT_BODY    = "Crimson Text, Georgia, serif"
const FONT_UI      = "Inter, Segoe UI, sans-serif"
const C_FG         = "rgba(244, 236, 232, 0.95)"
const C_MUTED      = "rgba(220, 210, 205, 0.6)"
const C_CARD       = "rgba(26, 20, 24, 0.88)"
const C_BORDER     = "rgba(125, 91, 72, 0.35)"
const C_RED        = rgba(RAW_RED, 1)
const C_RED_DIM    = rgba(RAW_RED, 0.45)
const C_RED_GLOW   = `0 0 18px ${rgba(RAW_RED, 0.28)}`
const C_GOLD       = "rgba(195, 155, 90, 0.85)"
const C_GOLD_DIM   = "rgba(195, 155, 90, 0.4)"

const activeTabStyle = {
    background: "rgba(255,255,255,0.07)",
    borderColor: "rgba(255,255,255,0.18)",
    color: C_FG,
}

// ─── Dot row component (attributes & skills) ──────────────────────────────────
function StatRow({
    name,
    base,
    current,
    min,
    max,
    costFn,
    remaining,
    onSet,
}: {
    name: string
    base: number
    current: number
    min: number
    max: number
    costFn: (l: number) => number
    remaining: number
    onSet: (level: number) => void
}) {
    const bought = cumulativeCost(base, current, costFn)
    return (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", borderBottom: "1px solid rgba(125,91,72,0.1)" }}>
            <div style={{ width: 130, fontFamily: FONT_BODY, fontSize: "0.9rem", color: C_FG, textTransform: "capitalize", flexShrink: 0 }}>
                {name}
            </div>
            <div style={{ display: "flex", gap: 4 }}>
                {Array.from({ length: max - min + 1 }, (_, i) => i + min).map(level => {
                    const filled = level <= current
                    const isBase = level <= base
                    const costToReach = level > current
                        ? cumulativeCost(current, level, costFn)
                        : level < current && level >= base
                            ? -(cumulativeCost(level, current, costFn))
                            : 0
                    const canAfford = costToReach <= remaining
                    const disabled = isBase || (level > current && !canAfford)
                    return (
                        <button
                            key={level}
                            title={
                                isBase ? "Set in earlier step"
                                    : level > current ? `+${costToReach} XP to reach ${level}`
                                        : level < current ? `Refund ${-costToReach} XP`
                                            : "Current level"
                            }
                            onClick={() => { if (!disabled) onSet(level) }}
                            style={{
                                width: 22,
                                height: 22,
                                borderRadius: 4,
                                border: `1.5px solid ${filled ? (isBase ? "rgba(125,91,72,0.4)" : rgba(RAW_RED, 0.7)) : "rgba(125,91,72,0.3)"}`,
                                background: filled
                                    ? isBase ? "rgba(125,91,72,0.2)" : rgba(RAW_RED, 0.18)
                                    : "rgba(255,255,255,0.02)",
                                cursor: disabled ? "default" : "pointer",
                                opacity: disabled && !isBase ? 0.35 : 1,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: "0.65rem",
                                color: filled ? (isBase ? C_MUTED : C_RED) : "rgba(125,91,72,0.4)",
                                transition: "all 120ms ease",
                                fontFamily: "inherit",
                                padding: 0,
                            }}
                        >
                            {filled ? "●" : "○"}
                        </button>
                    )
                })}
            </div>
            {bought > 0 && (
                <span style={{ marginLeft: "auto", fontFamily: FONT_UI, fontSize: "0.65rem", color: C_RED_DIM, letterSpacing: "0.08em" }}>
                    -{bought} XP
                </span>
            )}
        </div>
    )
}

// ─── Main component ───────────────────────────────────────────────────────────
type LoresheetPickerProps = {
    character: Character
    setCharacter: (character: Character) => void
    nextStep: () => void
}

export default function LoresheetPicker({ character, setCharacter, nextStep }: LoresheetPickerProps) {
    const budget = character.cc_xp_budget ?? 0

    // Capture the pre-spend baseline ONCE and persist it onto the character,
    // so it survives a reload. It used to live in useState only: on reload the
    // baseline re-initialised from the already-raised ratings, spend read as 0,
    // and the player could spend their whole budget again. Autosave picks this
    // up like any other character change.
    useEffect(() => {
        if (character.cc_base_attributes && character.cc_base_skills) return
        setCharacter({
            ...character,
            cc_base_attributes: character.cc_base_attributes ?? { ...character.attributes },
            cc_base_skills: character.cc_base_skills ?? { ...character.skills },
        })
        // Runs once on entering the step; deliberately not reacting to later
        // attribute/skill edits, which are exactly what we are measuring.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const baseAttrs = character.cc_base_attributes ?? character.attributes
    const baseSkills = character.cc_base_skills ?? character.skills

    const spent = computeCcXpSpent(character)
    const remaining = budget - spent
    const overBudget = remaining < 0

    // Loresheet state
    const [bannedIds, setBannedIds] = useState<Set<string>>(new Set())
    useEffect(() => {
        cc.getRestrictions().then(r => setBannedIds(new Set(r.loresheets))).catch(() => {})
    }, [])
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
    const toggleExpanded = (id: string) =>
        setExpandedIds(prev => {
            const next = new Set(prev)
            if (next.has(id)) {
                next.delete(id)
            } else {
                next.add(id)
            }
            return next
        })
    const [lsSearch, setLsSearch] = useState("")
    const visibleLoresheets = LORESHEETS
        .filter(ls => isLoresheetAvailable(ls, character.clan ?? "") && !bannedIds.has(ls.id))
        .filter(ls => !lsSearch || ls.name.toLowerCase().includes(lsSearch.toLowerCase()))
        .sort((a, b) => a.name.localeCompare(b.name))

    const [activeTab, setActiveTab] = useState<string | null>("attributes")

    // Stat setters
    const setAttr = (key: AttributesKey, level: number) =>
        setCharacter({ ...character, attributes: { ...character.attributes, [key]: level } })
    const setSkill = (key: SkillsKey, level: number) =>
        setCharacter({ ...character, skills: { ...character.skills, [key]: level } })

    // ── Render ──────────────────────────────────────────────────────────────
    return (
        <div style={generatorScrollableShellStyle}>
            {/* ── Header + XP bar (sticky) ── */}
            <div style={{ flexShrink: 0, padding: "0 20px 12px" }}>
                <div style={generatorScrollableContentStyle}>
                    <Stack gap={4} align="center" mb={16}>
                        <Title
                            order={2}
                            ta="center"
                            style={{ fontFamily: FONT_DISPLAY, fontWeight: 600, letterSpacing: "0.05em", color: C_FG }}
                        >
                            Spend your{" "}
                            <Text component="strong" inherit c="red.5" style={{ textShadow: C_RED_GLOW }}>
                                Starting XP
                            </Text>
                        </Title>
                        <Text ta="center" maw={560} style={{ fontFamily: FONT_BODY, fontSize: "1.05rem", color: C_MUTED }}>
                            Use the XP table to raise attributes, skills, or purchase loresheets.
                        </Text>
                    </Stack>

                    {/* Budget bar */}
                    <div
                        style={{
                            maxWidth: 700,
                            margin: "0 auto",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 16,
                            padding: "10px 16px",
                            borderRadius: 8,
                            border: `1px solid ${overBudget ? rgba(RAW_RED, 0.5) : "rgba(125, 91, 72, 0.3)"}`,
                            background: overBudget ? rgba(RAW_RED, 0.06) : "rgba(26, 20, 24, 0.7)",
                        }}
                    >
                        <span style={{ fontFamily: FONT_UI, fontSize: "0.75rem", letterSpacing: "0.12em", textTransform: "uppercase", color: C_GOLD }}>
                            XP Budget
                        </span>
                        <div style={{ display: "flex", gap: 24 }}>
                            {[
                                { label: "Budget",    value: budget,    color: C_FG },
                                { label: "Spent",     value: -spent,    color: spent === 0 ? C_MUTED : C_RED_DIM },
                                { label: "Remaining", value: remaining, color: overBudget ? C_RED : C_GOLD },
                            ].map(({ label, value, color }) => (
                                <div key={label} style={{ textAlign: "center" }}>
                                    <div style={{ fontFamily: FONT_DISPLAY, fontSize: "1rem", fontWeight: 700, color }}>
                                        {value > 0 ? `+${value}` : value === 0 ? "0" : String(value)} XP
                                    </div>
                                    <div style={{ fontFamily: FONT_UI, fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", color: C_MUTED }}>
                                        {label}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Tabs ── */}
            <Tabs
                value={activeTab}
                onChange={setActiveTab}
                style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}
                styles={{
                    // The header above and every panel below are centred in a
                    // 960px column (generatorScrollableContentStyle). The tab
                    // row was not, so it spanned the full shell width and sat
                    // visibly left of the content it belongs to.
                    list: {
                        gap: 10,
                        borderBottom: "1px solid rgba(255,255,255,0.08)",
                        padding: "0 20px 10px",
                        maxWidth: generatorScrollableContentStyle.maxWidth + 40,
                        marginLeft: "auto",
                        marginRight: "auto",
                        width: "100%",
                        boxSizing: "border-box",
                    },
                    tab: {
                        borderRadius: 999,
                        border: "1px solid rgba(255,255,255,0.08)",
                        background: "rgba(255,255,255,0.03)",
                        color: C_MUTED,
                        fontFamily: FONT_DISPLAY,
                        letterSpacing: "0.08em",
                        textTransform: "uppercase",
                        fontSize: "0.78rem",
                        fontWeight: 600,
                    },
                    panel: { flex: 1, minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column", paddingTop: 12 },
                }}
            >
                <Tabs.List>
                    <Tabs.Tab value="attributes" style={activeTab === "attributes" ? activeTabStyle : undefined}>
                        Attributes
                    </Tabs.Tab>
                    <Tabs.Tab value="skills" style={activeTab === "skills" ? activeTabStyle : undefined}>
                        Skills
                    </Tabs.Tab>
                    <Tabs.Tab value="loresheets" style={activeTab === "loresheets" ? activeTabStyle : undefined}>
                        Loresheets
                    </Tabs.Tab>
                </Tabs.List>

                {/* ── Attributes panel ── */}
                <Tabs.Panel value="attributes">
                    <ScrollArea
                        style={{ flex: 1 }}
                        px={20}
                        pb={40}
                        scrollbarSize={nightfallScrollbarSize}
                        type="always"
                        styles={nightfallScrollAreaStyles}
                    >
                        <div style={generatorScrollableContentStyle}>
                            <Text size="xs" c="dimmed" mb={8} style={{ fontFamily: FONT_UI }}>
                                Cost: new level × 5 XP &nbsp;·&nbsp; Grey dots were set in the Attributes step
                            </Text>
                            {ATTR_GROUPS.map(group => (
                                <div key={group.label} style={{ marginBottom: 20 }}>
                                    <div style={{ fontFamily: FONT_DISPLAY, fontSize: "0.7rem", letterSpacing: "0.1em", textTransform: "uppercase", color: C_GOLD_DIM, marginBottom: 6 }}>
                                        {group.label}
                                    </div>
                                    {group.attrs.map(key => (
                                        <StatRow
                                            key={key}
                                            name={key}
                                            base={baseAttrs[key]}
                                            current={character.attributes[key]}
                                            min={1}
                                            max={5}
                                            costFn={attrLevelCost}
                                            remaining={remaining}
                                            onSet={level => setAttr(key, level)}
                                        />
                                    ))}
                                </div>
                            ))}
                        </div>
                    </ScrollArea>
                </Tabs.Panel>

                {/* ── Skills panel ── */}
                <Tabs.Panel value="skills">
                    <ScrollArea
                        style={{ flex: 1 }}
                        px={20}
                        pb={40}
                        scrollbarSize={nightfallScrollbarSize}
                        type="always"
                        styles={nightfallScrollAreaStyles}
                    >
                        <div style={generatorScrollableContentStyle}>
                            <Text size="xs" c="dimmed" mb={8} style={{ fontFamily: FONT_UI }}>
                                Cost: new level × 3 XP &nbsp;·&nbsp; Grey dots were set in the Skills step
                            </Text>
                            {SKILL_GROUPS.map(group => (
                                <div key={group.label} style={{ marginBottom: 20 }}>
                                    <div style={{ fontFamily: FONT_DISPLAY, fontSize: "0.7rem", letterSpacing: "0.1em", textTransform: "uppercase", color: C_GOLD_DIM, marginBottom: 6 }}>
                                        {group.label}
                                    </div>
                                    {group.skills.map(key => (
                                        <StatRow
                                            key={key}
                                            name={key}
                                            base={baseSkills[key]}
                                            current={character.skills[key]}
                                            min={0}
                                            max={5}
                                            costFn={skillLevelCost}
                                            remaining={remaining}
                                            onSet={level => setSkill(key, level)}
                                        />
                                    ))}
                                </div>
                            ))}
                        </div>
                    </ScrollArea>
                </Tabs.Panel>

                {/* ── Loresheets panel ── */}
                <Tabs.Panel value="loresheets">
                    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", padding: "0 20px" }}>
                        <div style={{ ...generatorScrollableContentStyle, marginBottom: 8 }}>
                            <TextInput
                                placeholder="Search loresheets…"
                                value={lsSearch}
                                onChange={e => setLsSearch(e.currentTarget.value)}
                                size="xs"
                                styles={{ input: { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: C_FG } }}
                            />
                        </div>
                        <ScrollArea
                            style={{ flex: 1, minHeight: 0 }}
                            pb={8}
                            type="always"
                            scrollbarSize={nightfallScrollbarSize}
                            styles={nightfallScrollAreaStyles}
                        >
                            <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 700, margin: "0 auto", paddingBottom: 40 }}>
                                {visibleLoresheets.map(loresheet => {
                                    const isExpanded = expandedIds.has(loresheet.id)
                                    const purchasedCount = (character.loresheet_purchases ?? []).filter(p => p.loresheet_id === loresheet.id).length
                                    return (
                                        <div
                                            key={loresheet.id}
                                            style={{ borderRadius: 10, border: `1px solid ${purchasedCount > 0 ? rgba(RAW_RED, 0.35) : C_BORDER}`, background: C_CARD, overflow: "hidden" }}
                                        >
                                            <button
                                                onClick={() => toggleExpanded(loresheet.id)}
                                                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, width: "100%", padding: "14px 18px 12px", background: "transparent", border: "none", borderBottom: isExpanded ? "1px solid rgba(125,91,72,0.2)" : "none", cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}
                                            >
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <p style={{ margin: 0, fontFamily: FONT_DISPLAY, fontSize: "0.95rem", fontWeight: 600, letterSpacing: "0.06em", color: C_FG }}>
                                                        {loresheet.name}
                                                    </p>
                                                    {loresheet.requiresStPermission && (
                                                        <p style={{ margin: "3px 0 0", fontFamily: FONT_UI, fontSize: "0.68rem", letterSpacing: "0.08em", textTransform: "uppercase", color: C_GOLD_DIM }}>
                                                            Requires ST approval
                                                        </p>
                                                    )}
                                                </div>
                                                <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                                                    {purchasedCount > 0 && (
                                                        <span style={{ padding: "2px 8px", borderRadius: 4, border: `1px solid ${rgba(RAW_RED, 0.45)}`, background: rgba(RAW_RED, 0.12), fontFamily: FONT_UI, fontSize: "0.62rem", letterSpacing: "0.1em", textTransform: "uppercase", color: C_RED_DIM }}>
                                                            {purchasedCount} dot{purchasedCount !== 1 ? "s" : ""}
                                                        </span>
                                                    )}
                                                    <span style={{ padding: "3px 8px", borderRadius: 4, border: "1px solid rgba(125,91,72,0.3)", fontFamily: FONT_UI, fontSize: "0.62rem", letterSpacing: "0.1em", textTransform: "uppercase", color: C_MUTED }}>
                                                        {SOURCE_LABELS[loresheet.source] ?? loresheet.source}
                                                    </span>
                                                    <span style={{ color: "rgba(220,210,205,0.45)", fontSize: "0.8rem" }}>
                                                        {isExpanded ? "▲" : "▼"}
                                                    </span>
                                                </div>
                                            </button>

                                            {isExpanded && (
                                                <div style={{ padding: "8px 0" }}>
                                                    {loresheet.dots.map(dotEntry => {
                                                        const purchased = isPurchased(character, loresheet.id, dotEntry.dot)
                                                        const available = isDotAvailable(dotEntry, character.clan ?? "")
                                                        const cost = loresheetDotCost(dotEntry.dot)
                                                        const canAfford = purchased || remaining >= cost
                                                        return (
                                                            <button
                                                                key={dotEntry.dot}
                                                                onClick={() => { if (available) setCharacter(togglePurchase(character, loresheet.id, dotEntry.dot)) }}
                                                                disabled={!available || (!purchased && !canAfford)}
                                                                style={{ display: "flex", alignItems: "flex-start", gap: 14, width: "100%", padding: "10px 18px", background: purchased ? rgba(RAW_RED, 0.07) : "transparent", border: "none", borderBottom: "1px solid rgba(125,91,72,0.12)", cursor: available ? "pointer" : "not-allowed", textAlign: "left", fontFamily: "inherit", transition: "background 150ms ease", opacity: available && (purchased || canAfford) ? 1 : 0.38 }}
                                                            >
                                                                <div style={{ flexShrink: 0, width: 20, height: 20, marginTop: 1, borderRadius: 4, border: `1.5px solid ${purchased ? C_RED : "rgba(125,91,72,0.5)"}`, background: purchased ? rgba(RAW_RED, 0.15) : "transparent", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 150ms ease" }}>
                                                                    {purchased && <IconCheck size={12} color={C_RED} strokeWidth={2.5} />}
                                                                </div>
                                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                                    <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                                                                        <span style={{ fontFamily: FONT_UI, fontSize: "0.65rem", letterSpacing: "0.1em", color: purchased ? C_RED_DIM : C_MUTED, flexShrink: 0 }}>
                                                                            {"●".repeat(dotEntry.dot)}{"○".repeat(5 - dotEntry.dot)}
                                                                        </span>
                                                                        <span style={{ fontFamily: FONT_BODY, fontSize: "0.92rem", fontWeight: 600, color: C_FG }}>
                                                                            {dotEntry.name}
                                                                        </span>
                                                                        {!available && dotEntry.clanRestriction && (
                                                                            <span style={{ fontFamily: FONT_UI, fontSize: "0.62rem", letterSpacing: "0.08em", textTransform: "uppercase", color: C_GOLD_DIM }}>
                                                                                {dotEntry.clanRestriction.join(" / ")} only
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                    <p style={{ margin: "3px 0 0", fontFamily: FONT_BODY, fontSize: "0.85rem", color: C_MUTED, lineHeight: 1.4 }}>
                                                                        {dotEntry.description}
                                                                    </p>
                                                                </div>
                                                                <div style={{ flexShrink: 0, padding: "4px 10px", borderRadius: 6, border: `1px solid ${purchased ? rgba(RAW_RED, 0.4) : "rgba(125,91,72,0.25)"}`, background: purchased ? rgba(RAW_RED, 0.1) : "rgba(255,255,255,0.03)", textAlign: "center" }}>
                                                                    <div style={{ fontFamily: FONT_DISPLAY, fontSize: "0.85rem", fontWeight: 700, color: purchased ? C_RED : C_MUTED }}>
                                                                        {cost} XP
                                                                    </div>
                                                                </div>
                                                            </button>
                                                        )
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    )
                                })}
                            </div>
                        </ScrollArea>
                    </div>
                </Tabs.Panel>
            </Tabs>

            {/* ── Continue button ── */}
            {/* The outer justifyContent was inert: the inner column is
                width:100%, so it filled the row and the button simply sat at
                its left edge. Other steps centre their confirm button
                (Group justify="center"), so centre it inside the same 960px
                column the rest of the step uses. */}
            <div style={{ flexShrink: 0, padding: "12px 20px", display: "flex" }}>
                <div
                    style={{
                        ...generatorScrollableContentStyle,
                        display: "flex",
                        justifyContent: "center",
                    }}
                >
                    <Button
                        onClick={nextStep}
                        variant="filled"
                        color="red.8"
                        disabled={overBudget}
                        style={{ fontFamily: FONT_UI, letterSpacing: "0.06em" }}
                    >
                        {overBudget ? "Over budget — adjust purchases" : "Continue"}
                    </Button>
                </div>
            </div>
        </div>
    )
}
