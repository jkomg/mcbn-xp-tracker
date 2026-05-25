import { Character, containsBloodSorcery, containsOblivion } from "~/data/Character"

const XP_ONLY_AGE_CATEGORIES = new Set(["neonate", "ancilla"])

type GeneratorProgressKey =
    | "clan"
    | "attributes"
    | "skills"
    | "predatorType"
    | "name"
    | "disciplines"
    | "ceremonies"
    | "touchstones"
    | "merits"

export type GeneratorStepId =
    | "age-category"
    | "clan"
    | "attributes"
    | "skills"
    | "predator-type"
    | "basics"
    | "disciplines"
    | "rituals"
    | "ceremonies"
    | "touchstones"
    | "merits"
    | "loresheet"
    | "final"

export type GeneratorStep = {
    id: GeneratorStepId
    label: string
    progressKey?: GeneratorProgressKey
}

const allGeneratorSteps: GeneratorStep[] = [
    { id: "age-category", label: "Age Category" },
    { id: "clan", label: "Clan", progressKey: "clan" },
    { id: "attributes", label: "Attributes", progressKey: "attributes" },
    { id: "skills", label: "Skills", progressKey: "skills" },
    { id: "predator-type", label: "Predator Type", progressKey: "predatorType" },
    { id: "basics", label: "Basics", progressKey: "name" },
    { id: "disciplines", label: "Disciplines", progressKey: "disciplines" },
    { id: "rituals", label: "Rituals" },
    { id: "ceremonies", label: "Ceremonies" },
    { id: "touchstones", label: "Touchstones", progressKey: "touchstones" },
    { id: "merits", label: "Merits & Flaws", progressKey: "merits" },
    { id: "loresheet", label: "Loresheets" },
    { id: "final", label: "Review & Submit" },
]

export const defaultGeneratorStepId: GeneratorStepId = "age-category"

const isStepAvailable = (character: Character, stepId: GeneratorStepId) => {
    if (stepId === "rituals") {
        return containsBloodSorcery(character.disciplines)
    }
    if (stepId === "ceremonies") {
        return containsOblivion(character.disciplines)
    }
    if (stepId === "loresheet") {
        return XP_ONLY_AGE_CATEGORIES.has(character.age_category ?? "")
    }
    return true
}

export const getVisibleGeneratorSteps = (character: Character) =>
    allGeneratorSteps.filter((step) => isStepAvailable(character, step.id))

export const isGeneratorStepId = (value: string): value is GeneratorStepId => {
    return allGeneratorSteps.some((step) => step.id === value)
}

export const normalizeGeneratorStepId = (
    stepId: string | null | undefined,
    character: Character
): GeneratorStepId => {
    if (!stepId || !isGeneratorStepId(stepId)) {
        return defaultGeneratorStepId
    }

    const visibleSteps = getVisibleGeneratorSteps(character)
    const visibleStep = visibleSteps.find((step) => step.id === stepId)
    if (visibleStep) {
        return visibleStep.id
    }

    const desiredIndex = allGeneratorSteps.findIndex((step) => step.id === stepId)
    const nextVisibleStep = allGeneratorSteps
        .slice(desiredIndex + 1)
        .find((step) =>
            visibleSteps.some((visibleStepCandidate) => visibleStepCandidate.id === step.id)
        )

    if (nextVisibleStep) {
        return nextVisibleStep.id
    }

    const previousVisibleStep = [...allGeneratorSteps]
        .reverse()
        .find((step) =>
            visibleSteps.some((visibleStepCandidate) => visibleStepCandidate.id === step.id)
        )

    return previousVisibleStep?.id ?? defaultGeneratorStepId
}

export const getGeneratorStepIndex = (character: Character, stepId: GeneratorStepId) => {
    return getVisibleGeneratorSteps(character).findIndex((step) => step.id === stepId)
}

export const getNextGeneratorStepId = (character: Character, stepId: GeneratorStepId) => {
    const visibleSteps = getVisibleGeneratorSteps(character)
    const currentIndex = visibleSteps.findIndex((step) => step.id === stepId)

    if (currentIndex === -1 || currentIndex === visibleSteps.length - 1) {
        return stepId
    }

    return visibleSteps[currentIndex + 1].id
}
