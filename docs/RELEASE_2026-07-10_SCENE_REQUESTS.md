# Release: Scene Request Queue — 2026-07-10

## Summary

`/scene request` lets a player ask an ST to run a scene with an SPC (ST-played character), naming the SPC, the requested night, and a justification. The request posts to a configurable ST queue channel with a Storyteller ping and **Claim**/**Reject** buttons. STs claim (so two STs don't double-book the same scene) or reject (with an optional reason) directly from the queue message; the requesting player is notified of the outcome in their character's cubby channel.

---

## Player-Facing Features

### `/scene request`

Options: `spc` (free text — no SPC roster exists, matches how `DbCharacter.enemy` stores informal NPC references), `night` (autocompletes against recent `DbPlayPeriod` labels), `justification`, and an optional `character` (only needed if the player has multiple linked characters).

The request queues immediately (`status: pending`) and posts an embed to the configured queue channel.

### Outcome notification

When an ST claims or rejects the request, the player is notified in their character's cubby channel (`DbCharacter.ticket_channel_id`) — no DM, matching every other notification flow in this codebase.

---

## Staff Features

### Claim / Reject buttons

The queue embed carries **Claim** and **Reject** buttons, gated to Storyteller/System Helper/Moderator/Administrator roles. This is the first button-driven claim/approve flow in the codebase (every other approve/reject flow here is command-driven) — the claim is handled atomically server-side: only the first click on a `pending` request succeeds, everyone else gets an "already claimed by \<name\>" ephemeral and the embed refreshes to the true current state.

Rejecting opens a modal for an optional reason, which is included in the player's cubby notification and shown on the (now button-less) queue embed.

**Known limitation**: reject is only valid from `pending`. Once a request is claimed, there's no un-claim/re-open path yet — a future `/scene release` could add one if it turns out to be needed.

### Settings

New channel setting **Correspondence: Scene Request channel** (`BOT_CORRESPONDENCE_SCENE_REQUEST_CHANNEL_ID` / env `CORRESPONDENCE_SCENE_REQUEST_CHANNEL_ID`), configurable from Settings → Bot → Channel IDs like the other correspondence channels. Leave blank to disable the command.

---

## API

Three new endpoints, documented in `docs/API_ENDPOINTS.md`:
- `POST /api/scene-requests` — create
- `POST /api/scene-requests/{id}/claim-action` — claim (409 if already resolved)
- `POST /api/scene-requests/{id}/reject-action` — reject (409 if already resolved)
- `POST /api/scene-requests/{id}/queue-message` — best-effort, records where the embed was posted so it can be edited later

## Database

New `scene_requests` table (`apps/web/app/db.py`), modeled on the existing `boons` table (two-party request with a status lifecycle). Migration: `apps/web/migrations/versions/02950c13950e_add_scene_requests_table.py`.
