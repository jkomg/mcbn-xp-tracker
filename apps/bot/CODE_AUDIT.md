# Codebase Audit (2026-02-28)

## Scope
- TypeScript Discord bot command handling
- Adapter/network reliability paths
- Input validation paths for claim submission

## Findings

### 1) Missing Discord-link validation in claim submission paths (fixed)
**Risk:** Medium (data-quality and moderation workflow bypass)

Both `/xp claim` and the interactive wizard accepted arbitrary strings for evidence links and passed them directly to the backend API. This allows malformed or non-Discord URLs to enter the claim pipeline.

**Fix applied:**
- Added message-link validation to `/xp claim` command handler.
- Added message-link validation in modal submit handling for the interactive wizard.
- Added regression test ensuring invalid links are rejected before adapter submission.

## Additional observations (not changed)
- There is heavy use of `any` in command dispatch and handler signatures, which reduces compile-time guarantees.
- There is no lint target configured in `package.json`; adding one would make static quality checks repeatable.

## Validation performed
- Unit tests (`vitest`) pass, including new command validation coverage.
- TypeScript build (`tsc`) passes.
