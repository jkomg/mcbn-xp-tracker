import { useState } from "react"
import { Button, Divider, ScrollArea, Select, Stack, Text, Title } from "@mantine/core"
import { RAW_RED, rgba } from "~/theme/colors"
import { Character, EraXpSpend, InMemoriamEraType, containsBloodSorcery, containsOblivion } from "~/data/Character"
import { disciplines as DISCIPLINES, Power } from "~/data/Disciplines"
import { Rituals } from "~/data/Rituals"
import { Ceremonies } from "~/data/Ceremonies"
import { allSkills, SkillsKey } from "~/data/Skills"
import type { DisciplineName } from "~/data/NameSchemas"
import type { ClanName } from "~/data/NameSchemas"
import { clans } from "~/data/Clans"
import {
    generatorScrollableAreaStyle,
    generatorScrollableContentStyle,
    generatorScrollableShellStyle,
} from "./sharedGeneratorScrollableLayout"
import { nightfallScrollAreaStyles, nightfallScrollbarSize } from "./sharedScrollAreaStyles"

type EraXpPickerProps = {
    character: Character
    setCharacter: (character: Character) => void
    nextStep: (characterOverride?: Character) => void
}

// ── Styling ────────────────────────────────────────────────────────────────────
const FONT_DISPLAY = "Cinzel, Georgia, serif"
const FONT_BODY = "Crimson Text, Georgia, serif"
const FONT_UI = "Inter, Segoe UI, sans-serif"
const C_FG = "rgba(244, 236, 232, 0.95)"
const C_MUTED = "rgba(220, 210, 205, 0.6)"
const C_DIM = "rgba(180, 170, 165, 0.4)"
const C_CARD = "rgba(26, 20, 24, 0.88)"
const C_BORDER = "rgba(125, 91, 72, 0.35)"
const C_RED = rgba(RAW_RED, 1)
const C_RED_DIM = rgba(RAW_RED, 0.45)
const C_RED_GLOW = `0 0 18px ${rgba(RAW_RED, 0.28)}`
const C_GOLD = "rgba(195, 155, 90, 0.85)"
const C_WARN = "rgba(220, 160, 60, 0.9)"
const C_GREEN = "rgba(100, 200, 130, 0.9)"

// ── Pool types ─────────────────────────────────────────────────────────────────
type PoolKey = "skills" | "disciplines" | "sorcery" | "free"

const POOL_LABELS: Record<PoolKey, string> = {
    skills: "Skills Pool",
    disciplines: "Disciplines Pool",
    sorcery: "Sorcery Pool",
    free: "Free Pool",
}

const POOL_RESTRICTIONS: Record<PoolKey, string> = {
    skills: "Skills only",
    disciplines: "Any Disciplines",
    sorcery: "Mental Attributes, Occult, Blood Sorcery Rituals, Oblivion Ceremonies",
    free: "Unrestricted — any category",
}

// ── Era → pool mapping ─────────────────────────────────────────────────────────
const ERA_POOL_MAP: Record<InMemoriamEraType, { base: { pool: PoolKey; xp: number }; gambit: { pool: PoolKey; xp: number } }> = {
    adversity: { base: { pool: "skills",      xp: 12 }, gambit: { pool: "disciplines", xp: 10 } },
    calm:      { base: { pool: "skills",      xp: 6  }, gambit: { pool: "free",        xp: 3  } },
    intrigue:  { base: { pool: "free",        xp: 0  }, gambit: { pool: "free",        xp: 0  } },
    excess:    { base: { pool: "free",        xp: 0  }, gambit: { pool: "disciplines", xp: 10 } },
    violence:  { base: { pool: "disciplines", xp: 15 }, gambit: { pool: "free",        xp: 0  } },
    sorcery:   { base: { pool: "sorcery",     xp: 15 }, gambit: { pool: "sorcery",     xp: 3  } },
    torpor:    { base: { pool: "free",        xp: 0  }, gambit: { pool: "free",        xp: 0  } },
}

function computeXpPools(character: Character): Record<PoolKey, number> {
    const pools: Record<PoolKey, number> = { skills: 0, disciplines: 0, sorcery: 0, free: 0 }
    const eras = character.in_memoriam?.eras ?? []
    for (const era of eras) {
        const def = ERA_POOL_MAP[era.type]
        pools[def.base.pool] += def.base.xp
        if (era.gambit_taken) pools[def.gambit.pool] += def.gambit.xp
    }
    return pools
}

// ── XP cost formulas ──────────────────────────────────────────────────────────
const skillXpCost = (toLevel: number) => toLevel * 3
const attributeXpCost = (toLevel: number) => toLevel * 5
const ritualXpCost = (level: number) => level * 3
const ceremonyXpCost = (level: number) => level * 3

function disciplineXpCost(discName: DisciplineName, toLevel: number, character: Character): number {
    const clanName = character.clan as ClanName
    const clanDiscs = clans[clanName]?.nativeDisciplines ?? []
    const isCaitiff = !clanName || clanDiscs.length === 0
    if (isCaitiff) return toLevel * 6
    if (clanDiscs.includes(discName as any)) return toLevel * 5
    return toLevel * 7
}

// ── Effective level helpers ────────────────────────────────────────────────────
function effectiveSkillLevel(skillName: SkillsKey, character: Character, spends: EraXpSpend[]): number {
    const base = character.skills[skillName] ?? 0
    const relevant = spends.filter(s => s.category === "skill" && s.skill_name === skillName)
    return relevant.length ? Math.max(base, ...relevant.map(s => s.to_level)) : base
}

function effectiveAttributeLevel(attrName: string, character: Character, spends: EraXpSpend[]): number {
    const base = (character.attributes as Record<string, number>)[attrName] ?? 0
    const relevant = spends.filter(s => s.category === "attribute" && s.attribute_name === attrName)
    return relevant.length ? Math.max(base, ...relevant.map(s => s.to_level)) : base
}

function effectiveDiscLevel(discName: DisciplineName, character: Character, spends: EraXpSpend[]): number {
    const basePowers = character.disciplines.filter(p => p.discipline === discName)
    const base = basePowers.length ? Math.max(...basePowers.map(p => p.level)) : 0
    const relevant = spends.filter(s => s.category === "discipline" && s.discipline_name === discName)
    return relevant.length ? Math.max(base, ...relevant.map(s => s.to_level)) : base
}

function effectiveRitualNames(character: Character, spends: EraXpSpend[]): string[] {
    const base = character.rituals.map(r => r.name)
    const added = spends.filter(s => s.category === "ritual").map(s => s.ritual_name ?? "")
    return Array.from(new Set([...base, ...added]))
}

function effectiveCeremonyNames(character: Character, spends: EraXpSpend[]): string[] {
    const base = character.ceremonies.map(c => c.name)
    const added = spends.filter(s => s.category === "ceremony").map(s => s.ceremony_name ?? "")
    return Array.from(new Set([...base, ...added]))
}

// ── Dot display ────────────────────────────────────────────────────────────────
const Dots = ({ level, max = 5 }: { level: number; max?: number }) => (
    <span style={{ display: "inline-flex", gap: 3, alignItems: "center", marginLeft: 6 }}>
        {Array.from({ length: max }, (_, i) => (
            <span
                key={i}
                style={{
                    width: 7,
                    height: 7,
                    borderRadius: "50%",
                    background: i < level ? C_RED : "rgba(125, 91, 72, 0.3)",
                    display: "inline-block",
                }}
            />
        ))}
    </span>
)

// ── Spend row ─────────────────────────────────────────────────────────────────
function SpendRow({ spend, onRemove }: { spend: EraXpSpend; onRemove: () => void }) {
    return (
        <div
            style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "6px 10px",
                borderRadius: 6,
                background: "rgba(40, 30, 36, 0.7)",
                border: "1px solid rgba(125, 91, 72, 0.2)",
            }}
        >
            <span style={{ fontFamily: FONT_UI, fontSize: "0.82rem", color: C_FG }}>{spend.label}</span>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                <span style={{ fontFamily: FONT_DISPLAY, fontSize: "0.78rem", color: C_GOLD }}>
                    −{spend.xp_cost} XP
                </span>
                <button
                    onClick={onRemove}
                    style={{
                        background: "none",
                        border: `1px solid ${rgba(RAW_RED, 0.3)}`,
                        borderRadius: 4,
                        color: C_RED_DIM,
                        cursor: "pointer",
                        fontFamily: FONT_UI,
                        fontSize: "0.72rem",
                        padding: "2px 7px",
                    }}
                >
                    undo
                </button>
            </div>
        </div>
    )
}

// ── Skills add form ────────────────────────────────────────────────────────────
function SkillAddForm({
    character,
    spends,
    remaining,
    onAdd,
}: {
    character: Character
    spends: EraXpSpend[]
    remaining: number
    onAdd: (spend: EraXpSpend) => void
}) {
    const [selectedSkill, setSelectedSkill] = useState<SkillsKey | null>(null)

    const currentLevel = selectedSkill ? effectiveSkillLevel(selectedSkill, character, spends) : 0
    const nextLevel = currentLevel + 1
    const cost = skillXpCost(nextLevel)
    const canAdd = selectedSkill !== null && nextLevel <= 5 && cost <= remaining

    const skillOptions = allSkills.map(s => ({
        value: s,
        label: `${s.charAt(0).toUpperCase() + s.slice(1).replace(/ ./, m => m.toUpperCase())} (${effectiveSkillLevel(s, character, spends)})`,
        disabled: effectiveSkillLevel(s, character, spends) >= 5,
    }))

    const handleAdd = () => {
        if (!selectedSkill || !canAdd) return
        onAdd({
            pool: "skills",
            category: "skill",
            label: `${selectedSkill.charAt(0).toUpperCase() + selectedSkill.slice(1).replace(/ ./, m => m.toUpperCase())} ${currentLevel}→${nextLevel}`,
            from_level: currentLevel,
            to_level: nextLevel,
            xp_cost: cost,
            skill_name: selectedSkill,
        })
        setSelectedSkill(null)
    }

    return (
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end", marginTop: 10, flexWrap: "wrap" }}>
            <Select
                placeholder="Choose a skill"
                data={skillOptions}
                value={selectedSkill}
                onChange={v => setSelectedSkill(v as SkillsKey | null)}
                style={{ flex: 1, minWidth: 180 }}
                styles={{ input: inputStyles }}
            />
            {selectedSkill && (
                <span style={{ fontFamily: FONT_UI, fontSize: "0.8rem", color: cost <= remaining ? C_GOLD : C_WARN, alignSelf: "center" }}>
                    L{currentLevel}→{nextLevel} — {cost} XP
                </span>
            )}
            <Button
                disabled={!canAdd}
                onClick={handleAdd}
                size="xs"
                styles={{ root: { background: canAdd ? rgba(RAW_RED, 0.7) : "rgba(60,60,60,0.6)", fontFamily: FONT_UI } }}
            >
                Add
            </Button>
        </div>
    )
}

// ── Discipline add form ────────────────────────────────────────────────────────
function DisciplineAddForm({
    character,
    spends,
    remaining,
    onAdd,
}: {
    character: Character
    spends: EraXpSpend[]
    remaining: number
    onAdd: (spend: EraXpSpend) => void
}) {
    const [selectedDisc, setSelectedDisc] = useState<DisciplineName | null>(null)
    const [selectedPower, setSelectedPower] = useState<string | null>(null)

    const discOptions = (character.availableDisciplineNames as DisciplineName[]).map(d => {
        const lvl = effectiveDiscLevel(d, character, spends)
        return {
            value: d,
            label: `${d.charAt(0).toUpperCase() + d.slice(1)} (${lvl})`,
            disabled: lvl >= 5,
        }
    })

    const currentLevel = selectedDisc ? effectiveDiscLevel(selectedDisc, character, spends) : 0
    const nextLevel = currentLevel + 1
    const cost = selectedDisc ? disciplineXpCost(selectedDisc, nextLevel, character) : 0

    const powersAtNextLevel = selectedDisc
        ? (DISCIPLINES[selectedDisc as keyof typeof DISCIPLINES]?.powers ?? []).filter(
              (p: Power) => p.level === nextLevel
          )
        : []

    const powerOptions = powersAtNextLevel.map((p: Power) => ({ value: p.name, label: p.name }))

    const canAdd =
        selectedDisc !== null &&
        nextLevel <= 5 &&
        cost <= remaining &&
        (powerOptions.length === 0 || selectedPower !== null)

    const handleAdd = () => {
        if (!selectedDisc || !canAdd) return
        const powerLabel = selectedPower ? ` (${selectedPower})` : ""
        const discLabel = selectedDisc.charAt(0).toUpperCase() + selectedDisc.slice(1)
        onAdd({
            pool: "disciplines",
            category: "discipline",
            label: `${discLabel} L${nextLevel}${powerLabel}`,
            from_level: currentLevel,
            to_level: nextLevel,
            xp_cost: cost,
            discipline_name: selectedDisc,
            power_name: selectedPower ?? undefined,
        })
        setSelectedDisc(null)
        setSelectedPower(null)
    }

    return (
        <div style={{ marginTop: 10 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
                <Select
                    placeholder="Choose a discipline"
                    data={discOptions}
                    value={selectedDisc}
                    onChange={v => {
                        setSelectedDisc(v as DisciplineName | null)
                        setSelectedPower(null)
                    }}
                    style={{ flex: 1, minWidth: 180 }}
                    styles={{ input: inputStyles }}
                />
                {selectedDisc && (
                    <span style={{ fontFamily: FONT_UI, fontSize: "0.8rem", color: cost <= remaining ? C_GOLD : C_WARN, alignSelf: "center" }}>
                        L{nextLevel} — {cost} XP
                    </span>
                )}
            </div>
            {selectedDisc && powerOptions.length > 0 && (
                <div style={{ display: "flex", gap: 8, alignItems: "flex-end", marginTop: 8, flexWrap: "wrap" }}>
                    <Select
                        placeholder={`Choose L${nextLevel} power`}
                        data={powerOptions}
                        value={selectedPower}
                        onChange={setSelectedPower}
                        style={{ flex: 1, minWidth: 200 }}
                        styles={{ input: inputStyles }}
                    />
                    <Button
                        disabled={!canAdd}
                        onClick={handleAdd}
                        size="xs"
                        styles={{ root: { background: canAdd ? rgba(RAW_RED, 0.7) : "rgba(60,60,60,0.6)", fontFamily: FONT_UI } }}
                    >
                        Add
                    </Button>
                </div>
            )}
            {selectedDisc && powerOptions.length === 0 && (
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
                    <span style={{ fontFamily: FONT_UI, fontSize: "0.78rem", color: C_DIM }}>
                        No powers listed at L{nextLevel}
                    </span>
                    <Button
                        disabled={!canAdd}
                        onClick={handleAdd}
                        size="xs"
                        styles={{ root: { background: canAdd ? rgba(RAW_RED, 0.7) : "rgba(60,60,60,0.6)", fontFamily: FONT_UI } }}
                    >
                        Add
                    </Button>
                </div>
            )}
        </div>
    )
}

// ── Sorcery add form ───────────────────────────────────────────────────────────
function SorceryAddForm({
    character,
    spends,
    remaining,
    onAdd,
}: {
    character: Character
    spends: EraXpSpend[]
    remaining: number
    onAdd: (spend: EraXpSpend) => void
}) {
    const [category, setCategory] = useState<string | null>(null)
    const [item, setItem] = useState<string | null>(null)

    const hasBS = containsBloodSorcery(character.disciplines) ||
        spends.some(s => s.category === "discipline" && s.discipline_name === "blood sorcery")
    const hasObl = containsOblivion(character.disciplines) ||
        spends.some(s => s.category === "discipline" && s.discipline_name === "oblivion")

    const bsLevel = effectiveDiscLevel("blood sorcery", character, spends)
    const oblLevel = effectiveDiscLevel("oblivion", character, spends)

    const categoryOptions = [
        { value: "attribute", label: "Mental Attribute" },
        { value: "skill", label: "Occult (Skill)" },
        ...(hasBS ? [{ value: "ritual", label: "Blood Sorcery Ritual" }] : []),
        ...(hasObl ? [{ value: "ceremony", label: "Oblivion Ceremony" }] : []),
    ]

    const MENTAL_ATTRS = ["intelligence", "wits", "resolve"]

    const itemOptions = (() => {
        if (!category) return []
        if (category === "attribute") {
            return MENTAL_ATTRS.map(a => {
                const lvl = effectiveAttributeLevel(a, character, spends)
                return { value: a, label: `${a.charAt(0).toUpperCase() + a.slice(1)} (${lvl})`, disabled: lvl >= 5 }
            })
        }
        if (category === "skill") {
            const lvl = effectiveSkillLevel("occult", character, spends)
            return [{ value: "occult", label: `Occult (${lvl})`, disabled: lvl >= 5 }]
        }
        if (category === "ritual") {
            const takenNames = effectiveRitualNames(character, spends)
            return Rituals.filter(r => r.level <= bsLevel && !takenNames.includes(r.name))
                .map(r => ({ value: r.name, label: `${r.name} (L${r.level})` }))
        }
        if (category === "ceremony") {
            const takenNames = effectiveCeremonyNames(character, spends)
            return Ceremonies.filter(c => c.level <= oblLevel && !takenNames.includes(c.name))
                .map(c => ({ value: c.name, label: `${c.name} (L${c.level})` }))
        }
        return []
    })()

    const computeCost = (): number => {
        if (!category || !item) return 0
        if (category === "attribute") {
            const lvl = effectiveAttributeLevel(item, character, spends)
            return attributeXpCost(lvl + 1)
        }
        if (category === "skill") {
            const lvl = effectiveSkillLevel("occult", character, spends)
            return skillXpCost(lvl + 1)
        }
        if (category === "ritual") {
            const ritual = Rituals.find(r => r.name === item)
            return ritualXpCost(ritual?.level ?? 1)
        }
        if (category === "ceremony") {
            const ceremony = Ceremonies.find(c => c.name === item)
            return ceremonyXpCost(ceremony?.level ?? 1)
        }
        return 0
    }

    const cost = computeCost()
    const canAdd = item !== null && cost > 0 && cost <= remaining

    const handleAdd = () => {
        if (!category || !item || !canAdd) return
        if (category === "attribute") {
            const lvl = effectiveAttributeLevel(item, character, spends)
            onAdd({
                pool: "sorcery",
                category: "attribute",
                label: `${item.charAt(0).toUpperCase() + item.slice(1)} ${lvl}→${lvl + 1}`,
                from_level: lvl,
                to_level: lvl + 1,
                xp_cost: cost,
                attribute_name: item,
            })
        } else if (category === "skill") {
            const lvl = effectiveSkillLevel("occult", character, spends)
            onAdd({
                pool: "sorcery",
                category: "skill",
                label: `Occult ${lvl}→${lvl + 1}`,
                from_level: lvl,
                to_level: lvl + 1,
                xp_cost: cost,
                skill_name: "occult",
            })
        } else if (category === "ritual") {
            const ritual = Rituals.find(r => r.name === item)!
            onAdd({
                pool: "sorcery",
                category: "ritual",
                label: `Ritual: ${item} (L${ritual.level})`,
                from_level: 0,
                to_level: ritual.level,
                xp_cost: cost,
                ritual_name: item,
            })
        } else if (category === "ceremony") {
            const ceremony = Ceremonies.find(c => c.name === item)!
            onAdd({
                pool: "sorcery",
                category: "ceremony",
                label: `Ceremony: ${item} (L${ceremony.level})`,
                from_level: 0,
                to_level: ceremony.level,
                xp_cost: cost,
                ceremony_name: item,
            })
        }
        setItem(null)
    }

    return (
        <div style={{ marginTop: 10 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Select
                    placeholder="Category"
                    data={categoryOptions}
                    value={category}
                    onChange={v => { setCategory(v); setItem(null) }}
                    style={{ flex: "0 0 200px" }}
                    styles={{ input: inputStyles }}
                />
                {category && (
                    <Select
                        placeholder="Select…"
                        data={itemOptions}
                        value={item}
                        onChange={setItem}
                        style={{ flex: 1, minWidth: 200 }}
                        styles={{ input: inputStyles }}
                    />
                )}
                {item && (
                    <span style={{ fontFamily: FONT_UI, fontSize: "0.8rem", color: cost <= remaining ? C_GOLD : C_WARN, alignSelf: "center" }}>
                        {cost} XP
                    </span>
                )}
                <Button
                    disabled={!canAdd}
                    onClick={handleAdd}
                    size="xs"
                    styles={{ root: { background: canAdd ? rgba(RAW_RED, 0.7) : "rgba(60,60,60,0.6)", fontFamily: FONT_UI } }}
                >
                    Add
                </Button>
            </div>
        </div>
    )
}

// ── Free add form (any category) ───────────────────────────────────────────────
function FreeAddForm({
    character,
    spends,
    remaining,
    onAdd,
}: {
    character: Character
    spends: EraXpSpend[]
    remaining: number
    onAdd: (spend: EraXpSpend) => void
}) {
    const [category, setCategory] = useState<string | null>(null)
    const [skillVal, setSkillVal] = useState<SkillsKey | null>(null)
    const [discVal, setDiscVal] = useState<DisciplineName | null>(null)
    const [powerVal, setPowerVal] = useState<string | null>(null)
    const [attrVal, setAttrVal] = useState<string | null>(null)
    const [ritualVal, setRitualVal] = useState<string | null>(null)
    const [ceremonyVal, setCeremonyVal] = useState<string | null>(null)

    const hasBS = containsBloodSorcery(character.disciplines) ||
        spends.some(s => s.category === "discipline" && s.discipline_name === "blood sorcery")
    const hasObl = containsOblivion(character.disciplines) ||
        spends.some(s => s.category === "discipline" && s.discipline_name === "oblivion")
    const bsLevel = effectiveDiscLevel("blood sorcery", character, spends)
    const oblLevel = effectiveDiscLevel("oblivion", character, spends)
    const MENTAL_ATTRS = ["intelligence", "wits", "resolve"]

    const categoryOptions = [
        { value: "skill", label: "Skill" },
        { value: "discipline", label: "Discipline" },
        { value: "attribute", label: "Mental Attribute" },
        ...(hasBS ? [{ value: "ritual", label: "Blood Sorcery Ritual" }] : []),
        ...(hasObl ? [{ value: "ceremony", label: "Oblivion Ceremony" }] : []),
    ]

    const computeCostAndCanAdd = (): { cost: number; canAdd: boolean } => {
        if (!category) return { cost: 0, canAdd: false }
        if (category === "skill") {
            if (!skillVal) return { cost: 0, canAdd: false }
            const lvl = effectiveSkillLevel(skillVal, character, spends)
            if (lvl >= 5) return { cost: 0, canAdd: false }
            const cost = skillXpCost(lvl + 1)
            return { cost, canAdd: cost <= remaining }
        }
        if (category === "discipline") {
            if (!discVal) return { cost: 0, canAdd: false }
            const lvl = effectiveDiscLevel(discVal, character, spends)
            if (lvl >= 5) return { cost: 0, canAdd: false }
            const powers = (DISCIPLINES[discVal as keyof typeof DISCIPLINES]?.powers ?? []).filter(
                (p: Power) => p.level === lvl + 1
            )
            if (powers.length > 0 && !powerVal) return { cost: 0, canAdd: false }
            const cost = disciplineXpCost(discVal, lvl + 1, character)
            return { cost, canAdd: cost <= remaining }
        }
        if (category === "attribute") {
            if (!attrVal) return { cost: 0, canAdd: false }
            const lvl = effectiveAttributeLevel(attrVal, character, spends)
            if (lvl >= 5) return { cost: 0, canAdd: false }
            const cost = attributeXpCost(lvl + 1)
            return { cost, canAdd: cost <= remaining }
        }
        if (category === "ritual") {
            if (!ritualVal) return { cost: 0, canAdd: false }
            const ritual = Rituals.find(r => r.name === ritualVal)
            const cost = ritualXpCost(ritual?.level ?? 1)
            return { cost, canAdd: cost <= remaining }
        }
        if (category === "ceremony") {
            if (!ceremonyVal) return { cost: 0, canAdd: false }
            const ceremony = Ceremonies.find(c => c.name === ceremonyVal)
            const cost = ceremonyXpCost(ceremony?.level ?? 1)
            return { cost, canAdd: cost <= remaining }
        }
        return { cost: 0, canAdd: false }
    }

    const { cost, canAdd } = computeCostAndCanAdd()

    const resetItems = () => {
        setSkillVal(null); setDiscVal(null); setPowerVal(null)
        setAttrVal(null); setRitualVal(null); setCeremonyVal(null)
    }

    const handleAdd = () => {
        if (!canAdd || !category) return
        if (category === "skill" && skillVal) {
            const lvl = effectiveSkillLevel(skillVal, character, spends)
            onAdd({ pool: "free", category: "skill", label: `${skillVal} ${lvl}→${lvl + 1}`, from_level: lvl, to_level: lvl + 1, xp_cost: cost, skill_name: skillVal })
        } else if (category === "discipline" && discVal) {
            const lvl = effectiveDiscLevel(discVal, character, spends)
            const discLabel = discVal.charAt(0).toUpperCase() + discVal.slice(1)
            const powerLabel = powerVal ? ` (${powerVal})` : ""
            onAdd({ pool: "free", category: "discipline", label: `${discLabel} L${lvl + 1}${powerLabel}`, from_level: lvl, to_level: lvl + 1, xp_cost: cost, discipline_name: discVal, power_name: powerVal ?? undefined })
        } else if (category === "attribute" && attrVal) {
            const lvl = effectiveAttributeLevel(attrVal, character, spends)
            onAdd({ pool: "free", category: "attribute", label: `${attrVal} ${lvl}→${lvl + 1}`, from_level: lvl, to_level: lvl + 1, xp_cost: cost, attribute_name: attrVal })
        } else if (category === "ritual" && ritualVal) {
            const ritual = Rituals.find(r => r.name === ritualVal)!
            onAdd({ pool: "free", category: "ritual", label: `Ritual: ${ritualVal} (L${ritual.level})`, from_level: 0, to_level: ritual.level, xp_cost: cost, ritual_name: ritualVal })
        } else if (category === "ceremony" && ceremonyVal) {
            const ceremony = Ceremonies.find(c => c.name === ceremonyVal)!
            onAdd({ pool: "free", category: "ceremony", label: `Ceremony: ${ceremonyVal} (L${ceremony.level})`, from_level: 0, to_level: ceremony.level, xp_cost: cost, ceremony_name: ceremonyVal })
        }
        resetItems()
    }

    const takenRituals = effectiveRitualNames(character, spends)
    const takenCeremonies = effectiveCeremonyNames(character, spends)

    return (
        <div style={{ marginTop: 10 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                <Select
                    placeholder="Category"
                    data={categoryOptions}
                    value={category}
                    onChange={v => { setCategory(v); resetItems() }}
                    style={{ flex: "0 0 180px" }}
                    styles={{ input: inputStyles }}
                />
                {category === "skill" && (
                    <Select
                        placeholder="Skill"
                        data={allSkills.map(s => ({ value: s, label: `${s} (${effectiveSkillLevel(s, character, spends)})`, disabled: effectiveSkillLevel(s, character, spends) >= 5 }))}
                        value={skillVal}
                        onChange={v => setSkillVal(v as SkillsKey | null)}
                        style={{ flex: 1, minWidth: 160 }}
                        styles={{ input: inputStyles }}
                    />
                )}
                {category === "discipline" && (
                    <>
                        <Select
                            placeholder="Discipline"
                            data={(character.availableDisciplineNames as DisciplineName[]).map(d => ({ value: d, label: `${d} (${effectiveDiscLevel(d, character, spends)})`, disabled: effectiveDiscLevel(d, character, spends) >= 5 }))}
                            value={discVal}
                            onChange={v => { setDiscVal(v as DisciplineName | null); setPowerVal(null) }}
                            style={{ flex: 1, minWidth: 160 }}
                            styles={{ input: inputStyles }}
                        />
                        {discVal && (() => {
                            const lvl = effectiveDiscLevel(discVal, character, spends)
                            const powers = (DISCIPLINES[discVal as keyof typeof DISCIPLINES]?.powers ?? []).filter((p: Power) => p.level === lvl + 1)
                            return powers.length > 0 ? (
                                <Select
                                    placeholder={`L${lvl + 1} power`}
                                    data={powers.map((p: Power) => ({ value: p.name, label: p.name }))}
                                    value={powerVal}
                                    onChange={setPowerVal}
                                    style={{ flex: 1, minWidth: 180 }}
                                    styles={{ input: inputStyles }}
                                />
                            ) : null
                        })()}
                    </>
                )}
                {category === "attribute" && (
                    <Select
                        placeholder="Attribute"
                        data={MENTAL_ATTRS.map(a => ({ value: a, label: `${a} (${effectiveAttributeLevel(a, character, spends)})`, disabled: effectiveAttributeLevel(a, character, spends) >= 5 }))}
                        value={attrVal}
                        onChange={setAttrVal}
                        style={{ flex: 1, minWidth: 160 }}
                        styles={{ input: inputStyles }}
                    />
                )}
                {category === "ritual" && (
                    <Select
                        placeholder="Ritual"
                        data={Rituals.filter(r => r.level <= bsLevel && !takenRituals.includes(r.name)).map(r => ({ value: r.name, label: `${r.name} (L${r.level})` }))}
                        value={ritualVal}
                        onChange={setRitualVal}
                        style={{ flex: 1, minWidth: 200 }}
                        styles={{ input: inputStyles }}
                    />
                )}
                {category === "ceremony" && (
                    <Select
                        placeholder="Ceremony"
                        data={Ceremonies.filter(c => c.level <= oblLevel && !takenCeremonies.includes(c.name)).map(c => ({ value: c.name, label: `${c.name} (L${c.level})` }))}
                        value={ceremonyVal}
                        onChange={setCeremonyVal}
                        style={{ flex: 1, minWidth: 200 }}
                        styles={{ input: inputStyles }}
                    />
                )}
                {cost > 0 && (
                    <span style={{ fontFamily: FONT_UI, fontSize: "0.8rem", color: canAdd ? C_GOLD : C_WARN, alignSelf: "center" }}>
                        {cost} XP
                    </span>
                )}
                <Button
                    disabled={!canAdd}
                    onClick={handleAdd}
                    size="xs"
                    styles={{ root: { background: canAdd ? rgba(RAW_RED, 0.7) : "rgba(60,60,60,0.6)", fontFamily: FONT_UI } }}
                >
                    Add
                </Button>
            </div>
        </div>
    )
}

// ── Shared input styles ────────────────────────────────────────────────────────
const inputStyles = {
    background: "rgba(18, 13, 16, 0.85)",
    border: "1px solid rgba(125, 91, 72, 0.4)",
    color: C_FG,
    fontFamily: FONT_UI,
    fontSize: "0.82rem",
}

// ── Pool section ───────────────────────────────────────────────────────────────
function PoolSection({
    poolKey,
    total,
    spends,
    character,
    onAdd,
    onRemove,
}: {
    poolKey: PoolKey
    total: number
    spends: EraXpSpend[]
    character: Character
    onAdd: (spend: EraXpSpend) => void
    onRemove: (index: number) => void
}) {
    const poolSpends = spends.map((s, i) => ({ spend: s, globalIndex: i })).filter(({ spend }) => spend.pool === poolKey)
    const spent = poolSpends.reduce((sum, { spend }) => sum + spend.xp_cost, 0)
    const remaining = total - spent

    return (
        <div
            style={{
                borderRadius: 10,
                border: `1px solid ${rgba(RAW_RED, 0.25)}`,
                background: C_CARD,
                padding: "16px 18px",
            }}
        >
            {/* Pool header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontFamily: FONT_DISPLAY, fontSize: "0.8rem", fontWeight: 600, letterSpacing: "0.08em", color: C_FG }}>
                    {POOL_LABELS[poolKey]}
                </span>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <span style={{ fontFamily: FONT_UI, fontSize: "0.72rem", color: C_DIM }}>{POOL_RESTRICTIONS[poolKey]}</span>
                    <span
                        style={{
                            fontFamily: FONT_DISPLAY,
                            fontSize: "0.85rem",
                            fontWeight: 700,
                            color: remaining === 0 ? C_DIM : remaining < 3 ? C_WARN : C_GOLD,
                        }}
                    >
                        {remaining}/{total} XP
                    </span>
                </div>
            </div>

            {/* Existing spends */}
            {poolSpends.length > 0 && (
                <Stack gap={4} mb={10}>
                    {poolSpends.map(({ spend, globalIndex }) => (
                        <SpendRow key={globalIndex} spend={spend} onRemove={() => onRemove(globalIndex)} />
                    ))}
                </Stack>
            )}

            <Divider color="rgba(125, 91, 72, 0.15)" mb={8} />

            {/* Add form */}
            {remaining > 0 && (
                <>
                    <p style={{ margin: "0 0 4px 0", fontFamily: FONT_UI, fontSize: "0.7rem", letterSpacing: "0.08em", textTransform: "uppercase", color: C_RED_DIM }}>
                        Add purchase
                    </p>
                    {poolKey === "skills" && (
                        <SkillAddForm character={character} spends={spends} remaining={remaining} onAdd={onAdd} />
                    )}
                    {poolKey === "disciplines" && (
                        <DisciplineAddForm character={character} spends={spends} remaining={remaining} onAdd={onAdd} />
                    )}
                    {poolKey === "sorcery" && (
                        <SorceryAddForm character={character} spends={spends} remaining={remaining} onAdd={onAdd} />
                    )}
                    {poolKey === "free" && (
                        <FreeAddForm character={character} spends={spends} remaining={remaining} onAdd={onAdd} />
                    )}
                </>
            )}
            {remaining === 0 && poolSpends.length === 0 && (
                <p style={{ margin: 0, fontFamily: FONT_UI, fontSize: "0.78rem", color: C_DIM, fontStyle: "italic" }}>
                    No XP in this pool
                </p>
            )}
            {remaining === 0 && poolSpends.length > 0 && (
                <p style={{ margin: 0, fontFamily: FONT_UI, fontSize: "0.78rem", color: C_GREEN }}>
                    Pool fully spent
                </p>
            )}
        </div>
    )
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function EraXpPicker({ character, setCharacter, nextStep }: EraXpPickerProps) {
    const [spends, setSpends] = useState<EraXpSpend[]>(
        () => character.in_memoriam?.era_xp_spends ?? []
    )

    const pools = computeXpPools(character)
    const totalPool = (Object.values(pools) as number[]).reduce((a, b) => a + b, 0)

    const spentPerPool: Record<PoolKey, number> = { skills: 0, disciplines: 0, sorcery: 0, free: 0 }
    for (const s of spends) spentPerPool[s.pool] += s.xp_cost
    const totalSpent = (Object.values(spentPerPool) as number[]).reduce((a, b) => a + b, 0)
    const totalRemaining = totalPool - totalSpent
    const bankedXp = Math.min(totalRemaining, 5)
    const wastedXp = totalRemaining - bankedXp

    const addSpend = (spend: EraXpSpend) => setSpends(prev => [...prev, spend])
    const removeSpend = (index: number) => setSpends(prev => prev.filter((_, i) => i !== index))

    const handleConfirm = () => {
        // Build updated character with all purchases applied
        const updatedSkills = { ...character.skills }
        const updatedAttributes = { ...character.attributes }
        const updatedDisciplines = [...character.disciplines]
        const updatedRituals = [...character.rituals]
        const updatedCeremonies = [...(character.ceremonies ?? [])]

        for (const spend of spends) {
            if (spend.category === "skill" && spend.skill_name) {
                const key = spend.skill_name as SkillsKey
                updatedSkills[key] = Math.max(updatedSkills[key] ?? 0, spend.to_level)
            } else if (spend.category === "attribute" && spend.attribute_name) {
                ;(updatedAttributes as Record<string, number>)[spend.attribute_name] = Math.max(
                    (updatedAttributes as Record<string, number>)[spend.attribute_name] ?? 0,
                    spend.to_level
                )
            } else if (spend.category === "discipline" && spend.discipline_name) {
                // Add a power object for this level if we have one; otherwise create a placeholder
                const discName = spend.discipline_name
                const powerFromData = spend.power_name
                    ? (DISCIPLINES[discName as keyof typeof DISCIPLINES]?.powers ?? []).find(
                          (p: Power) => p.name === spend.power_name
                      )
                    : (DISCIPLINES[discName as keyof typeof DISCIPLINES]?.powers ?? []).find(
                          (p: Power) => p.level === spend.to_level
                      )

                if (powerFromData) {
                    if (!updatedDisciplines.some(p => p.name === powerFromData.name)) {
                        updatedDisciplines.push(powerFromData)
                    }
                } else {
                    // Placeholder for custom discipline or missing power data
                    const placeholder: Power = {
                        name: spend.power_name ?? `${discName} L${spend.to_level}`,
                        description: "",
                        summary: "",
                        dicePool: "",
                        level: spend.to_level,
                        discipline: discName,
                        rouseChecks: 0,
                        amalgamPrerequisites: [],
                    }
                    if (!updatedDisciplines.some(p => p.name === placeholder.name && p.discipline === discName)) {
                        updatedDisciplines.push(placeholder)
                    }
                }
            } else if (spend.category === "ritual" && spend.ritual_name) {
                const ritual = Rituals.find(r => r.name === spend.ritual_name)
                if (ritual && !updatedRituals.some(r => r.name === ritual.name)) {
                    updatedRituals.push(ritual)
                }
            } else if (spend.category === "ceremony" && spend.ceremony_name) {
                const ceremony = Ceremonies.find(c => c.name === spend.ceremony_name)
                if (ceremony && !updatedCeremonies.some(c => c.name === ceremony.name)) {
                    updatedCeremonies.push(ceremony)
                }
            }
        }

        const updated: Character = {
            ...character,
            skills: updatedSkills,
            attributes: updatedAttributes,
            disciplines: updatedDisciplines,
            rituals: updatedRituals,
            ceremonies: updatedCeremonies,
            cc_xp_budget: bankedXp,
            in_memoriam: character.in_memoriam
                ? { ...character.in_memoriam, era_xp_spends: spends }
                : character.in_memoriam,
        }
        setCharacter(updated)
        nextStep(updated)
    }

    const activePools = (Object.keys(pools) as PoolKey[]).filter(k => pools[k] > 0)

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
                    {/* Header */}
                    <Stack gap={4} align="center" mb={26}>
                        <Title
                            order={2}
                            ta="center"
                            style={{ fontFamily: FONT_DISPLAY, fontWeight: 600, letterSpacing: "0.05em", color: C_FG }}
                        >
                            <Text component="strong" inherit c="red.5" style={{ textShadow: C_RED_GLOW }}>
                                Era XP
                            </Text>
                        </Title>
                        <Text ta="center" maw={560} style={{ fontFamily: FONT_BODY, fontSize: "1.05rem", color: C_MUTED }}>
                            Spend the experience your Kindred accumulated across the centuries. Up to 5 XP may be banked into play; the rest is lost.
                        </Text>
                    </Stack>

                    <div style={{ maxWidth: 720, margin: "0 auto", width: "100%" }}>
                        {/* Summary bar */}
                        <div
                            style={{
                                display: "flex",
                                gap: 16,
                                marginBottom: 24,
                                padding: "12px 16px",
                                borderRadius: 8,
                                border: `1px solid ${rgba(RAW_RED, 0.2)}`,
                                background: "rgba(26, 20, 24, 0.7)",
                            }}
                        >
                            <div style={{ textAlign: "center", flex: 1 }}>
                                <p style={{ margin: 0, fontFamily: FONT_DISPLAY, fontSize: "1.4rem", fontWeight: 700, color: C_GOLD, lineHeight: 1 }}>{totalPool}</p>
                                <p style={{ margin: "3px 0 0 0", fontFamily: FONT_UI, fontSize: "0.7rem", letterSpacing: "0.1em", textTransform: "uppercase", color: C_DIM }}>Total XP</p>
                            </div>
                            <div style={{ textAlign: "center", flex: 1 }}>
                                <p style={{ margin: 0, fontFamily: FONT_DISPLAY, fontSize: "1.4rem", fontWeight: 700, color: C_FG, lineHeight: 1 }}>{totalSpent}</p>
                                <p style={{ margin: "3px 0 0 0", fontFamily: FONT_UI, fontSize: "0.7rem", letterSpacing: "0.1em", textTransform: "uppercase", color: C_DIM }}>Spent</p>
                            </div>
                            <div style={{ textAlign: "center", flex: 1 }}>
                                <p style={{ margin: 0, fontFamily: FONT_DISPLAY, fontSize: "1.4rem", fontWeight: 700, color: bankedXp > 0 ? C_GREEN : C_DIM, lineHeight: 1 }}>{bankedXp}</p>
                                <p style={{ margin: "3px 0 0 0", fontFamily: FONT_UI, fontSize: "0.7rem", letterSpacing: "0.1em", textTransform: "uppercase", color: C_DIM }}>Banked XP</p>
                            </div>
                            {wastedXp > 0 && (
                                <div style={{ textAlign: "center", flex: 1 }}>
                                    <p style={{ margin: 0, fontFamily: FONT_DISPLAY, fontSize: "1.4rem", fontWeight: 700, color: C_WARN, lineHeight: 1 }}>{wastedXp}</p>
                                    <p style={{ margin: "3px 0 0 0", fontFamily: FONT_UI, fontSize: "0.7rem", letterSpacing: "0.1em", textTransform: "uppercase", color: C_DIM }}>Wasted</p>
                                </div>
                            )}
                        </div>

                        {/* Banking note */}
                        {wastedXp > 0 && (
                            <div
                                style={{
                                    marginBottom: 16,
                                    padding: "10px 14px",
                                    borderRadius: 8,
                                    border: `1px solid ${rgba(RAW_RED, 0.3)}`,
                                    background: rgba(RAW_RED, 0.06),
                                }}
                            >
                                <p style={{ margin: 0, fontFamily: FONT_UI, fontSize: "0.8rem", color: C_WARN }}>
                                    You have {totalRemaining} XP remaining but can only bank 5 XP into play.
                                    {wastedXp} XP will be lost — consider spending more before confirming.
                                </p>
                            </div>
                        )}

                        {/* Pool sections */}
                        <Stack gap={16}>
                            {activePools.map(poolKey => (
                                <PoolSection
                                    key={poolKey}
                                    poolKey={poolKey}
                                    total={pools[poolKey]}
                                    spends={spends}
                                    character={character}
                                    onAdd={addSpend}
                                    onRemove={removeSpend}
                                />
                            ))}
                        </Stack>

                        {/* Confirm */}
                        <div style={{ display: "flex", justifyContent: "center", marginTop: 28 }}>
                            <Button
                                color="grape"
                                size="lg"
                                styles={{
                                    root: {
                                        fontFamily: FONT_DISPLAY,
                                        letterSpacing: "0.12em",
                                        textTransform: "uppercase",
                                        background: "linear-gradient(135deg, rgba(130, 40, 150, 0.9) 0%, rgba(100, 20, 120, 0.9) 100%)",
                                    },
                                }}
                                onClick={handleConfirm}
                            >
                                Confirm Era XP
                            </Button>
                        </div>
                    </div>
                </div>
            </ScrollArea>
        </div>
    )
}
