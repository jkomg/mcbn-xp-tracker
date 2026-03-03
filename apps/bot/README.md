# mcbn-tracker-bot

Discord bot for MCbN XP workflows, built in TypeScript with a pluggable adapter layer for backend integration.

## Features

- Slash commands for XP summary, claim submission, spend submission, spend cost checks, and health checks.
- Interactive `/xp submit` wizard with paginated selection and required evidence links.
- Adapter abstraction to decouple Discord UX from storage/business logic.
- Structured JSON logging for production diagnostics.
- Retry and stale-cache fallback for claim-context fetches.

## Security and Reliability Hardening

- Startup env validation via `zod` in `src/config.ts`.
- `WEB_APP_BASE_URL` must be `https` unless targeting localhost.
- API calls use request timeouts (`REQUEST_TIMEOUT_MS`) and bounded retries.
- Claim links are validated as Discord message URLs and restricted to the current guild.
- User-facing API errors are sanitized while detailed diagnostics are logged.

## Required Environment Variables

- `BOT_TOKEN`
- `CLIENT_ID` (required for command registration)

Optional:

- `TEST_GUILD_ID` (register commands only to a test guild)
- `WEB_APP_BASE_URL` (default: `http://127.0.0.1:5001`)
- `WEB_APP_API_TOKEN`
- `REQUEST_TIMEOUT_MS` (default: `10000`)
- `CLAIM_CONTEXT_CACHE_TTL_MS` (default: `30000`)
- `CLAIM_CONTEXT_STALE_IF_ERROR_MS` (default: `300000`)
- `CLAIM_CONTEXT_MAX_RETRIES` (default: `2`)
- `CLAIM_CONTEXT_RETRY_BASE_MS` (default: `250`)

## Quick Start

```bash
cp .env.example .env
npm install
npm run dev
```

## Commands

- `/ping`
- `/xp submit`
- `/xp summary`
- `/xp claim`
- `/xp spend`
- `/xp spend-cost`
- `/xp health`

## Development

```bash
npm run lint
npm run format:check
npm run typecheck
npm run build
npm run test
npm run check
```

## CI and Automation Hygiene

- CI workflow enforces `lint`, `format:check`, `typecheck`, tests, and build.
- Weekly maintenance workflow runs full checks and `npm audit` for production dependencies.
- Dependabot is enabled for npm packages and GitHub Actions updates.
- Auto-triage workflow labels new issues/PRs, applies area labels, and assigns PR size labels.
- Branch-protection automation workflow can enforce required checks on `main` (`quality`, `test-build`) using `REPO_ADMIN_TOKEN`.

## Architecture

- `src/index.ts`: bot runtime and interaction routing.
- `src/registerCommands.ts`: slash command registration and command loading.
- `src/services/adapter.ts`: backend adapter contract and `WebAppAdapter`.
- `src/interactiveClaimWizard.ts`: multi-step claim UX.
- `src/xpRules.ts`: V5 XP cost engine.

## Open Source Process

- Contribution guide: `CONTRIBUTING.md`
- Code of conduct: `CODE_OF_CONDUCT.md`
- Security reporting: `SECURITY.md`
- License: `LICENSE`
