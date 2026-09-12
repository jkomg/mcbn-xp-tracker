# Codex brief — #431 group 4: background-release message clarity

Filled from the template in [../CODEX_TASK_BRIEF.md](../CODEX_TASK_BRIEF.md).
Paste the block below into Codex as the task.

```text
## Task
Reword the background-blank release notification so a player can tell the
returned dots are usable right now, instead of reading a cited night's date
range as a future effective date.

Issue: #431 — full-featured blanking of backgrounds

Read AGENTS.md (repo root) first — it lists the commands CI gates on and the
traps in this repo that cannot be inferred from the code.

Everything else you need is below. Do NOT go looking for openspec/ artifacts;
they are not on main yet. Work only from the checkout you have.

## Branch
Work on: fix/background-release-message-clarity
Branch from origin/main. Do not commit to main. Do not force-push a branch you
did not create.

## In scope
- apps/bot/src/services/backgroundBlankReleaseService.ts  (exists on main)
- apps/bot/src/__tests__/backgroundBlankReleaseService.test.ts  (**does not
  exist — you are creating it**)
- CHANGELOG.md — this changes a message players read, which AGENTS.md counts as
  user-visible. Add an entry at the top, matching the format of the ones there

## Out of scope — do not edit
- apps/web/**                         (the web-side timing fix is a separate task)
- packages/**
- .github/workflows/**
- apps/bot/src/services/adapter.ts    (the API contract is not changing)
If you believe the task genuinely requires one of these, stop and say so rather
than doing it.

## What the message looks like today
In `tick()`, three lines joined with '\n' and filtered for truthiness:

  `${mention} your background refresh is ready.`
  `Released **${release.dots_released}** dot(s) of **${release.background_name}**.`
  releaseBatch.currentNight ? `Current night: **${releaseBatch.currentNight}**.` : ''

## Context you would otherwise have to guess
1. The third line is the defect. `currentNight` is a play-period *label* like
   "Night 69 - 9/8 - 9/20", so it embeds a date range. A player who got this on
   9/4 read it as "available 9/8" when the dots were already back. That is what
   opened the issue.
2. The dots are ALWAYS already released when this message is sent. The web side
   commits the release, returns the released list, then the bot notifies. This is
   a past-tense report, never a schedule.
3. `release.player_discord` may not be a snowflake. Existing code falls back to
   the character name when it fails `/^\d{17,20}$/`. Keep that.
4. Channel resolution (`buildCubbyChannelMap` / `normalizeChannelName`) and the
   structured `logEvent` calls are not changing. Leave both alone — in
   particular do not add new log events for a wording change.
5. There is no existing test for this service. Model the new one on
   `apps/bot/src/__tests__/cubbyChannelMonitor.test.ts` — a service that takes a
   discord.js client and acts on channels, with small `makeChannel()` /
   `makeClient()` factories built from `vi.fn()` and passed in with an
   `as never` cast. That is the pattern to copy. (Do **not** use
   `sheetImportNotifier.test.ts` as the model: despite the name it only calls
   `buildSheetImportEmbed` and never exercises delivery.)

   For this service you need a fake `client.guilds.fetch()` returning a guild
   whose channels resolve through `buildCubbyChannelMap`, and a channel whose
   `send` is a `vi.fn()` you can assert the message text on. Tests here are
   vitest; `vi.mock('../config', ...)` with `vi.hoisted` is the established way
   to stub module-level config if you need it.
6. Assert on the text a player actually sees, not on internals.

## Wording (approved 2026-09-12 — use exactly this)

  `<mention> your background refresh is complete.`
  `**N** dot(s) of **<background>** are available to use now.`

and drop the `Current night:` line entirely, since its embedded dates are the
source of the ambiguity. This wording is settled — do not substitute your own.

## Definition of done
- [ ] The notification makes clear the dots are available immediately
- [ ] The `Current night: <label>` line no longer reads as a future effective date
- [ ] A new test file covers the message a player sees, including the
      non-snowflake fallback to the character name
- [ ] **Each new assertion was confirmed to FAIL against the old wording**, not
      merely to pass against the new. Revert the service change, run the test,
      see it fail, restore. A test that passes either way proves nothing, and
      this repo treats that as the bar — see AGENTS.md, Branching and PRs. State
      in the PR that you did this and what failed
- [ ] `npm run check` passes from apps/bot (lint → format:check → typecheck →
      test → build). This single command is what CI gates on
- [ ] No unrelated files touched; no formatting-only churn
- [ ] Commit message and PR body explain WHY, not just what

## If your sandbox is read-only or offline
Do not try to fetch, push, or comment on GitHub. Produce the diff and the PR
description as text in your final report instead, and say plainly what you could
not do.

## When you are blocked or unsure
Do not guess and do not silently narrow the task. Stop and say exactly what
decision or access you need. A blocked task reported early is cheaper than a
wrong one delivered complete.
```
