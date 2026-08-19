import { Text } from "@mantine/core"
import ErrorBoundary from "../components/ErrorBoundary"
import { Character } from "../data/Character"
import AgeCategoryPicker from "./components/AgeCategoryPicker"
import AncillaModePicker from "./components/AncillaModePicker"
import AttributePicker from "./components/AttributePicker"
import BasicsPicker from "./components/BasicsPicker"
import ClanPicker from "./components/ClanPicker"
import CeremoniesPicker from "./components/CeremoniesPicker"
import DisciplinesPicker from "./components/DisciplinesPicker"
import DisciplinesPickerIM from "./components/DisciplinesPickerIM"
import Final from "./components/Final"
import GenerationPickerIM from "./components/GenerationPickerIM"
import InMemoriamPicker from "./components/InMemoriamPicker"
import EraXpPicker from "./components/EraXpPicker"
import LoresheetPicker from "./components/LoresheetPicker"
import MeritsAndFlawsPicker from "./components/MeritsAndFlawsPicker"
import PredatorTypePicker from "./components/PredatorTypePicker"
import RitualsPicker from "./components/RitualsPicker"
import SkillsPicker from "./components/SkillsPicker"
import TouchstonePicker from "./components/TouchstonePicker"
import { GeneratorStepId, getNextGeneratorStepId } from "./steps"

export type GeneratorProps = {
    character: Character
    setCharacter: (character: Character) => void

    selectedStep: GeneratorStepId
    setSelectedStep: (step: GeneratorStepId) => void

    draftId?: string
    /** Persist the current character and resolve to its draft id. */
    onFlushSave?: () => Promise<string>
    onReset?: () => void
}

const Generator = ({ character, setCharacter, selectedStep, setSelectedStep, draftId, onFlushSave, onReset }: GeneratorProps) => {
    const nextStep = (characterOverride?: Character) => {
        // Ignore anything that is not actually a Character. `onClick={nextStep}`
        // is a natural thing to write, and React then hands the MouseEvent in
        // as the override — so step availability was evaluated against an event
        // object, every conditional step disappeared from the visible list,
        // findIndex returned -1, and getNextGeneratorStepId re-selected the
        // current step. The button silently did nothing, with no error.
        const override =
            characterOverride &&
            typeof characterOverride === "object" &&
            "attributes" in characterOverride
                ? characterOverride
                : undefined
        setSelectedStep(getNextGeneratorStepId(override ?? character, selectedStep))
    }

    const getStepComponent = () => {
        const isImAncilla =
            character.age_category === "ancilla" &&
            !!character.in_memoriam &&
            !character.in_memoriam.use_standard

        switch (selectedStep) {
            case "age-category":
                return (
                    <AgeCategoryPicker
                        character={character}
                        setCharacter={setCharacter}
                        nextStep={nextStep}
                    />
                )
            case "ancilla-mode":
                return (
                    <AncillaModePicker
                        character={character}
                        setCharacter={setCharacter}
                        nextStep={nextStep}
                    />
                )
            case "generation":
                return (
                    <GenerationPickerIM
                        character={character}
                        setCharacter={setCharacter}
                        nextStep={nextStep}
                    />
                )
            case "clan":
                return (
                    <ClanPicker
                        character={character}
                        setCharacter={setCharacter}
                        nextStep={nextStep}
                    />
                )
            case "attributes":
                return (
                    <AttributePicker
                        character={character}
                        setCharacter={setCharacter}
                        nextStep={nextStep}
                    />
                )
            case "skills":
                return (
                    <SkillsPicker
                        character={character}
                        setCharacter={setCharacter}
                        nextStep={nextStep}
                    />
                )
            case "predator-type":
                return (
                    <PredatorTypePicker
                        character={character}
                        setCharacter={setCharacter}
                        nextStep={nextStep}
                    />
                )
            case "basics":
                return (
                    <BasicsPicker
                        character={character}
                        setCharacter={setCharacter}
                        nextStep={nextStep}
                    />
                )
            case "disciplines":
                return isImAncilla ? (
                    <DisciplinesPickerIM
                        character={character}
                        setCharacter={setCharacter}
                        nextStep={nextStep}
                    />
                ) : (
                    <DisciplinesPicker
                        character={character}
                        setCharacter={setCharacter}
                        nextStep={nextStep}
                    />
                )
            case "rituals":
                return (
                    <RitualsPicker
                        character={character}
                        setCharacter={setCharacter}
                        nextStep={nextStep}
                    />
                )
            case "ceremonies":
                return (
                    <CeremoniesPicker
                        character={character}
                        setCharacter={setCharacter}
                        nextStep={nextStep}
                    />
                )
            case "touchstones":
                return (
                    <TouchstonePicker
                        character={character}
                        setCharacter={setCharacter}
                        nextStep={nextStep}
                    />
                )
            case "merits":
                return (
                    <MeritsAndFlawsPicker
                        character={character}
                        setCharacter={setCharacter}
                        nextStep={nextStep}
                    />
                )
            case "loresheet":
                return (
                    <LoresheetPicker
                        character={character}
                        setCharacter={setCharacter}
                        nextStep={nextStep}
                    />
                )
            case "in-memoriam":
                return (
                    <InMemoriamPicker
                        character={character}
                        setCharacter={setCharacter}
                        nextStep={nextStep}
                    />
                )
            case "era-xp":
                return (
                    <EraXpPicker
                        character={character}
                        setCharacter={setCharacter}
                        nextStep={nextStep}
                    />
                )
            case "final":
                return (
                    <Final
                        character={character}
                        setCharacter={setCharacter}
                        setSelectedStep={setSelectedStep}
                        draftId={draftId}
                        onFlushSave={onFlushSave}
                        onReset={onReset}
                    />
                )
            default:
                return <Text size={"xl"}>{`Error: Step ${selectedStep} is not implemented`}</Text>
        }
    }

    return (
        // position: relative is the anchor for ShellStyle-based steps that use position: absolute
        <div style={{ height: "100%", width: "100%", position: "relative", flex: 1, minHeight: 0 }}>
            {/* 960px centered wrapper for steps that don't use their own full-width shell */}
            <div
                style={{
                    maxWidth: 960,
                    marginLeft: "auto",
                    marginRight: "auto",
                    width: "100%",
                    height: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    minHeight: 0
                }}
            >
                <ErrorBoundary key={selectedStep}>{getStepComponent()}</ErrorBoundary>
            </div>
        </div>
    )
}

export default Generator
