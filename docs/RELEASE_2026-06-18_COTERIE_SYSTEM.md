# Release: Coterie System — 2026-06-18

## Summary

Full coterie lifecycle: player-proposed formation with creation-phase dot allocation, staff sign-off, background donation with pending/approve/deny flow, XP spend donation tracking, domain ratings (Chasse/Lien/Portillon), and a `/coterie status` Discord command.

Also includes CC schema v7: Backgrounds are now a separate top-level field, split from Merits, and synced into `DbCharacterBackground` on draft approval so coterie donation dropdowns are populated automatically.

---

## Player-Facing Features

### Coterie Proposal Flow

Players can propose a new coterie at `/coteries/propose`. The proposer names the coterie, writes a description, and invites other active characters from a dropdown. All invited characters (and the proposer) start with 2 free creation dots each.

**Formation phase** (`creation_state = 'forming'`):
- Members allocate dots to domain ratings (Chasse / Lien / Portillon, max 3 each at creation) or named Backgrounds / Merits via the formation panel on the coterie view page.
- Members can take coterie Flaws (up to 4 dots total) — each flaw dot grants +1 bonus creation dot to the pool.
- Flaw removal is blocked if the bonus dots from that flaw have already been spent.
- Any member can submit the coterie for staff sign-off once the group is satisfied.

**After sign-off** (`creation_state = 'submitted'`), staff review on the manage page. Staff can approve (sets `creation_state = 'active'`, `status = 'active'`) or send back with notes.

Once submitted or active, creation-tagged traits appear in the normal pool alongside any advantages added later.

### Background Donation

Members can donate backgrounds to the coterie pool from the coterie view page. Donations go through a pending → approved/denied flow:

1. Player submits a donation request — background shows as "Pending" with a cancel button.
2. Staff approve or deny from the manage page (optional flaw notes on approval).
3. On approval: `dots_blanked = dots_total` on the character's background row — the background is fully blanked while donated.
4. On un-donate or member removal: `dots_blanked` is restored to 0.

### XP Spend Donation

Players can flag an XP spend request as a coterie donation. The spend form shows a "Donate to Coterie" option when the character is in an active coterie. The coterie's view page shows approved and pending XP donations with a running total.

Security: the server validates that the submitting character is an active member of the submitted coterie ID — tampered form fields are silently dropped.

---

## Staff Features

### Coterie Management

- **Create** (`/coteries/new`): staff create coteries directly (status `pending`, no formation phase).
- **Manage** (`/coteries/<slug>/manage`): add/remove members, edit description, update domain ratings, approve/deny pending background donations, approve/send-back formation submissions.
- **Delete** (`/coteries/<slug>/delete`): permanently deletes draft or pending coteries. Active coteries cannot be deleted.
- **Activate** (`/coteries/<slug>/activate`): manually activate a coterie created via the staff route.

### Domain Ratings

Staff can set Chasse, Lien, and Portillon (0–5) from the manage page. These are displayed on the coterie view page and in the `/coterie status` Discord embed.

---

## Bot: `/coterie status`

New slash command. Shows the player's coterie in a Discord embed:

- Domain ratings displayed as dot strings (`●●●○○`)
- Member list with clan and Discord handle
- Link to the web view page
- Optional `character` parameter for players with multiple characters — passes the name to the API so the correct character is looked up (multi-character players are fully supported)

**Subcommand:** `/coterie status [character]`

---

## Character Creator: Schema v7 — Backgrounds Field

The CC character schema now has a top-level `backgrounds` array, split from `merits`. Items in the known Background categories (Haven, Resources, Fame, Influence, Kindred, Mortals) are now stored separately.

**Migration:** existing characters are migrated automatically via `patchV6ToV7Compatibility()` — backgrounds are moved from `merits[]` to `backgrounds[]` on load.

**Impact:**
- Character sheet, sidebar, and Me page show a Backgrounds column distinct from Merits.
- PDF, Foundry JSON, and Inconnue JSON exports include backgrounds.
- On draft approval, backgrounds in `character_data` are synced into `DbCharacterBackground` rows automatically — no manual staff entry needed for coterie donation dropdowns.

---

## New Web Routes

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/coteries/` | public | Coterie index (active + pending) |
| `GET` | `/coteries/<slug>` | public | Coterie view page |
| `GET` | `/coteries/propose` | player | Propose a new coterie |
| `POST` | `/coteries/propose` | player | Submit coterie proposal |
| `GET` | `/coteries/new` | staff | Staff: create coterie form |
| `POST` | `/coteries/new` | staff | Staff: create coterie |
| `GET` | `/coteries/<slug>/manage` | staff | Manage coterie |
| `POST` | `/coteries/<slug>/members` | staff | Add member |
| `POST` | `/coteries/<slug>/members/<id>/remove` | staff | Remove member |
| `POST` | `/coteries/<slug>/activate` | staff | Activate coterie |
| `POST` | `/coteries/<slug>/edit` | staff | Edit description/channel |
| `POST` | `/coteries/<slug>/domain` | staff | Update domain ratings |
| `POST` | `/coteries/<slug>/advantages` | member/staff | Add pool advantage |
| `POST` | `/coteries/<slug>/advantages/<id>/remove` | staff | Remove pool advantage |
| `POST` | `/coteries/<slug>/donate/<bg_id>` | member | Submit background donation |
| `POST` | `/coteries/<slug>/donate/<bg_id>/cancel` | member | Cancel pending donation |
| `POST` | `/coteries/<slug>/donate/<bg_id>/approve` | staff | Approve donation |
| `POST` | `/coteries/<slug>/donate/<bg_id>/deny` | staff | Deny donation |
| `POST` | `/coteries/<slug>/undonate/<bg_id>` | member | Un-donate background |
| `POST` | `/coteries/<slug>/blank/<bg_id>` | member | Blank donated background |
| `POST` | `/coteries/<slug>/creation/allocate` | member | Allocate creation dots |
| `POST` | `/coteries/<slug>/creation/flaw` | member | Take creation flaw |
| `POST` | `/coteries/<slug>/creation/remove/<id>` | member | Remove creation allocation |
| `POST` | `/coteries/<slug>/submit-for-review` | member | Submit for staff sign-off |
| `POST` | `/coteries/<slug>/approve-formation` | staff | Approve formation |
| `POST` | `/coteries/<slug>/sendback-formation` | staff | Send back with notes |
| `POST` | `/coteries/<slug>/delete` | staff | Delete draft/pending coterie |

---

## New API Endpoints (Bot-Facing)

| Method | Path | Scope | Description |
|--------|------|-------|-------------|
| `GET` | `/api/coteries` | read | List all active coteries with members |
| `POST` | `/api/coteries/activate` | write | Find pending coterie by name, set Discord channel, activate |
| `GET` | `/api/coteries/by-character/<discord_id>` | read | Get coterie for a player's active character |

`GET /api/coteries/by-character/<discord_id>` accepts optional `?character_name=` query param for players with multiple characters.

---

## DB Migrations

| Migration ID | Description |
|-------------|-------------|
| `3e7f1a2b9c5d` | `coterie_id` FK on `spend_requests` |
| `4f2a1b8e6c9d` | `donation_pending_coterie_id` FK on `character_backgrounds` |
| `5a9b2c7e1d3f` | `chasse`, `lien`, `portillon` columns on `coteries` |
| `6b3c8d2f1a4e` | `creation_state`, `creation_notes` columns on `coteries` |
