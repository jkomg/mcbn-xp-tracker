# Frontend Agent Guide

## Purpose

- The frontend is the user-facing Vite app for character creation, editing, export, authenticated account pages, and live session chat.

## Commands

- Install: `pnpm install`
- Dev server: `pnpm start`
- Build: `pnpm run build`
- Lint: `pnpm run lint`
- Tests: `pnpm run test:run`

## Important Areas

- Routing and providers: `src/routes/`, `src/routes/__root.tsx`, `src/main.tsx`
- Generator experience: `src/generator/`, `src/routes/index.tsx`, `src/sidebar/`, `src/topbar/`
- Character sheet experience: `src/character_sheet/`, `src/routes/sheet.tsx`
- Server-data hooks: `src/hooks/useAuth.tsx`, `src/hooks/useCharacters.tsx`, `src/hooks/useCoteries.tsx`, `src/hooks/useShares.tsx`, `src/hooks/useUserPreferences.ts`
- API wrapper: `src/utils/api.ts`
- Persistent character model and reference data: `src/data/`
- Export logic and regression tests: `src/generator/pdfCreator.ts`, `src/generator/foundryWoDJsonCreator.ts`, `src/test/`

## State Model

- React Query owns server-backed data and auth fetches.
- Local storage owns the editable local character and generator progress.
- Zustand stores own sheet-specific interaction state such as dice rolling and session chat.

## Non-Negotiable Invariants

- Use `src/utils/api.ts` for REST requests so cookies and CSRF handling stay consistent.
- The local character shape is shared across the generator, sheet, JSON import/export, PDF export, and backend persistence. Treat `src/data/Character.ts` as a central contract.
- Generator step order is encoded numerically in `src/generator/Generator.tsx` and mirrored in the surrounding navigation UI. Step changes are rarely isolated to one file.
- The app assumes cookie-based auth against the backend. Avoid introducing ad hoc token storage in the browser.
- Session chat and live updates depend on backend WebSocket message shapes. If you change the store payloads, verify the backend handlers too.

## Character Schema Versioning and Backwards Compatibility

- `schemaVersion` in `src/data/Character.ts` must be incremented whenever the character schema changes in a way that affects serialized data (new required fields, renamed fields, removed fields, changed defaults).
- `applyCharacterCompatibilityPatches` in `src/data/Character.ts` must be updated alongside any such schema change. Add a new `patchVnToVn+1Compatibility` function and call it from `applyCharacterCompatibilityPatches` so that characters saved under old versions are silently upgraded on load.
- Every new patch function needs a corresponding test in `src/test/` that constructs a minimal old-version character object, runs it through `applyCharacterCompatibilityPatches`, and asserts the upgraded fields are correct. These tests are the safety net for production data that predates the change.

## Generator Steps

Steps are declared in `src/generator/steps.ts` as `allGeneratorSteps`, each with a
string `GeneratorStepId`. Conditional steps (Blood Sorcery rituals, Oblivion
ceremonies, the In-Memoriam ancilla path) are filtered by `isStepAvailable()`,
and the current position lives in the URL hash rather than React state.

To add a step: add an entry to `allGeneratorSteps`, give it a case in
`Generator.tsx`'s switch, and gate it in `isStepAvailable()` if conditional.
Order comes from the array, so no index arithmetic is involved.

> This section previously documented a `patchedSelectedStep` numeric-offset
> footgun, where a conditional step at index 8 shifted every later step and had
> to be kept in sync by hand between `Generator.tsx` and `AsideBar.tsx`. That
> mechanism no longer exists — the string-ID refactor removed the whole class
> of bug. Ignore any lingering references to it.

## Character-Creation XP

Budget maths lives in one place, `src/generator/ccXp.ts`, and is mirrored
server-side by `apps/web/app/cc_xp.py`. Budgets and the banking cap come from
`packages/rules/cc_xp.json`; per-trait costs come from
`packages/rules/xp_costs.json`, the same table post-creation spends are priced
from. Do not recompute spend inline — two call sites once disagreed about
whether attribute and skill raises counted, and showed players contradictory
"Remaining" figures.

Attribute/skill spend is measured against `cc_base_attributes` /
`cc_base_skills`, captured when the XP step is first entered and **persisted**
onto the character. Keeping that baseline in component state (as it once was)
means a reload resets it and hands the player their budget back.

## UI and Validation Conventions

- UI components: use Mantine (`@mantine/core`, `@mantine/hooks`, `@mantine/notifications`). Do not introduce custom modal, overlay, or notification implementations when a Mantine primitive exists.
- Icons: use `@tabler/icons-react`. FontAwesome icons are present in the codebase but Tabler is preferred for new work.
- Frontend validation: use Zod where validation logic is needed (already a dependency). Keep Zod schemas co-located with the code that uses them.
- Input focus borders come from Mantine theme input styles. Inputs use their own Mantine `color` prop when present and fall back to the current theme primary color. The root theme defaults to grape for the generator and authenticated UI, and the character sheet provides a nested `MantineProvider` with the selected clan/preference color. Render Mantine inputs directly; do not add per-input focus wrappers.

## Verification Triggers

- UI or route changes: `pnpm run build` — a clean build with no TypeScript errors is the minimum bar.
- API or hook changes: `pnpm run build` and confirm the matching backend route accepts the same payload shape.
- Character model or export/import changes: `pnpm run test:run` — all tests must pass. The suite covers PDF, Foundry, and Inconnu export output; a build-only check is not sufficient here.
- Character schema changes: increment `schemaVersion`, add a `patchVnToVn+1Compatibility` function in `src/data/Character.ts`, call it from `applyCharacterCompatibilityPatches`, and add a backwards-compatibility test in `src/test/` before running `pnpm run test:run`.
- Large UI refactors: `pnpm run lint` in addition to the build. Fix all lint errors before considering the task done.
