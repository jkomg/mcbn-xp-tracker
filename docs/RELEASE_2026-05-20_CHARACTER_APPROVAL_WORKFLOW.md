# Release: Character Approval Workflow — 2026-05-20

## Summary

Full staff-facing character onboarding workflow via `/lasombra` slash commands. Staff can now approve, edit, update, and delete characters entirely from Discord without touching the web UI or spreadsheet.

---

## New Bot Commands

### `/lasombra approve`

Run in a character ticket channel. Launches a multi-step wizard:

1. Detects the player (reads channel permissions) and latest character sheet PDF from the channel
2. Staff selects age category, clan, sect, and roles via Discord select menus
3. On confirm:
   - Moves the channel to the correct cubby category (Mortal / Fledgling / Neonate / Ancilla)
   - Assigns Discord roles (clan, sect, age, Kindred/Ghoul/Mortal)
   - Removes the "Sheet in Progress" role
   - Creates the character roster entry via `POST /api/roster/character`
   - Posts the character sheet PDF to `#player-character-sheets`
   - Posts a welcome message in the new cubby channel

### `/lasombra edit`

Run in a character's cubby channel. Opens a wizard to change clan, sect, and/or age category:

- Pre-fills current values fetched from `GET /api/roster/character/{name}`
- On confirm: updates clan/sect/age via `PATCH /api/roster/character/{name}`
- If age changed: moves the cubby channel to the new age category
- Includes a **Rename** button that opens a modal — renames the character and Discord channel via `POST /api/roster/character/{name}/rename`

### `/lasombra update`

Run in a character's cubby channel. Finds the latest character sheet PDF in the channel and posts it to `#player-character-sheets` with a confirmation message in the cubby.

### `/lasombra delete`

Staff-only. Hard-deletes a character with no XP/spend history via `DELETE /api/roster/character/{name}`. Characters with any history cannot be deleted this way — use retired/deceased status instead. Includes a public confirmation step in channel; deletes the channel automatically if its name matches the character.

---

## New Web API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/roster/character/{name}` | Fetch current character details (used by edit wizard pre-fill) |
| `PATCH` | `/api/roster/character/{name}` | Update clan, age_category, and/or sect |
| `POST` | `/api/roster/character/{name}/rename` | Rename character and migrate all history |
| `POST` | `/api/roster/character` | Create new character roster entry |
| `DELETE` | `/api/roster/character/{name}` | Hard-delete (no-history characters only) |

---

## Other Changes

- Bot heartbeat stale threshold raised to 10 minutes (`1ecb3f7`) to reduce cold-start false alarms
- Staff management UI added to Settings (Administrators only)
- Settings page gated behind Administrator role (`SETTINGS_ADMIN_DISCORD_IDS`)
- Delete confirmation keyed by message ID to avoid multi-user collision
