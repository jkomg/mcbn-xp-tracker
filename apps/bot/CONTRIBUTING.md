# Contributing

## Workflow

1. Create a branch from `main` using `codex/<short-topic>`.
2. Keep changes scoped to one concern per pull request.
3. Run `npm run check` before opening a PR.
4. Add or update tests for behavioral changes.
5. Update docs (`README.md`, command docs, or config docs) when behavior changes.

## Pull Request Expectations

- Clear problem statement and solution summary.
- Risk notes for security, auth, API contracts, or command UX.
- Repro steps and test evidence.

## Coding Standards

- TypeScript strict-mode compatible (`tsconfig.json`).
- Prefer explicit types at boundaries (Discord interactions, API payloads, env config).
- Validate user input before API calls.
- Avoid logging secrets or raw tokens.

## Security

If your change affects auth, permissions, or external API behavior, add a short security impact note in the PR description.

## Commit Style

Use short, imperative summaries. Example: `Harden adapter timeouts and sanitize API errors`.
