# Release: 2026-04-07 — Staff Broadcast Overhaul & Passage-of-Time Scheduler Fix

## Included

### Staff broadcast command overhaul (`/lasombra broadcast`)

**`apps/bot` — `src/commands/lasombra.ts`**

The broadcast command has been fully reworked. Target selection is now a slash command option with autocomplete rather than a freetext modal field, enabling precise routing and eliminating typo errors.

**New options:**

| Option | Type | Description |
|--------|------|-------------|
| `target` | string (autocomplete) | Where to send. Static choices: `All cubbies`, `Announcements channel`, `Cubbies + announcements`. Dynamic choices: `Cubby: <CharacterName>` per active character; `#<channel-name>` per channel in the four cubby categories. |
| `mention-kindred` | boolean | Prepend `@Kindred` mention. |
| `mention-ghouls` | boolean | Prepend `@Ghouls` mention. |
| `mention-mortals` | boolean | Prepend `@Mortals` mention. |
| `mention-character` | string (autocomplete) | Prepend a ping to a specific character's player. Shows active characters with a Discord ID on file; value is the Discord user ID. |

The modal now collects only the message body. Options are staged in a module-level `Map<userId, PendingBroadcast>` (keyed by user ID; a user can only have one modal open at a time) so the 100-character customId limit is not a constraint.

**Cubby category channel lookup** (`src/services/cubbyChannels.ts`)

Added `CUBBY_CATEGORY_NAMES` constant (the four cubby category names, lowercase) and `getChannelsInCubbyCategories(guild)` helper, which fetches all guild channels, identifies the four cubby parent categories by name, and returns all `GuildText` channels within them sorted alphabetically.

The four recognised categories:
- Ancilla Character Cubbies
- Neonate Character Cubbies
- Fledgeling Character Cubbies
- Mortal Character Cubbies

**`apps/web` — `blueprints/api.py`**

`GET /api/meta/active-roster` now accepts `?includeDiscordIds=1`. When set, the response changes from `{ characters: string[] }` to `{ characters: [{ name, discordId }] }`. Used by the `mention-character` autocomplete to look up the owning player's Discord ID without a separate API call.

**`apps/bot` — `src/services/adapter.ts`**

Added `getActiveRosterWithIds()` method and `activeRosterWithIdsSchema` Zod schema to match the new response shape.

---

### Passage-of-time scheduler alignment fix

**`apps/bot` — `src/services/passageOfTimeService.ts`**

Previously the service checked whether the current minute fell in a fixed `[minuteLocal, minuteLocal + intervalMinutes)` window. If the bot happened to start at a minute offset that never landed in that window, the event would be silently skipped.

**Fix:** The service now tracks `lastTickTime` (initialised to `now − intervalMs` in the constructor). On each tick it computes `prevMin` and `nowMin` as minutes-of-day in the configured timezone and fires if the target time falls in `(prevMin, nowMin]`. This works regardless of when the bot started and is resilient to delayed ticks caused by system load.

---

### MONOREPO_ROOT Docker fix

**`compose.web.yml` / `compose.full.yml`**

Added `MONOREPO_ROOT: /app` to the web service environment. After a macOS reboot, Docker auto-restarts containers before Docker Desktop's file-sharing layer is ready, causing bind mounts to appear empty. The `_repo_root()` path-walk in `shared_contract.py` previously failed in this state. Setting `MONOREPO_ROOT` bypasses the walk entirely (the configured-path branch only checks that the directory exists, not the marker file).
