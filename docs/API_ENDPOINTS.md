# Bot-Facing API Endpoints

All endpoints are under the `/api` prefix and require a bearer token unless noted.

## Authentication

Set the `Authorization` header on every request:

```
Authorization: Bearer <token>
```

Three token types exist (configured via env vars):

| Env var | Scope | Use |
|---------|-------|-----|
| `WEB_APP_API_TOKEN` | read + write | Legacy all-in-one token |
| `WEB_APP_API_READ_TOKEN` | read | Bot read operations |
| `WEB_APP_API_WRITE_TOKEN` | read + write | Bot write operations |

Unauthorized → `401`. Wrong scope → `403`.

## Replay Protection (write endpoints)

Optionally enabled via `BOT_API_REPLAY_PROTECTION_ENABLED=true`. When enabled, write
requests must include:

| Header | Format | Notes |
|--------|--------|-------|
| `X-Request-Timestamp` | Unix seconds | Must be within ±`BOT_API_REPLAY_WINDOW_SECONDS` (default 300) of server time |
| `X-Request-Nonce` | Unique string ≤128 chars | Rejected if seen before within TTL window |

Replay detected → `409`.

## Common requester query params (read endpoints)

| Param | Required | Description |
|-------|----------|-------------|
| `requesterDiscordId` | Yes | Discord snowflake of the requesting user |
| `requesterDiscordName` | No | Display name (for audit log) |
| `testMode` | No | `true` to impersonate another user (staff only) |
| `testAsDiscordId` | No | Discord ID to impersonate when `testMode=true` |

## Common requester body fields (write endpoints)

Same fields as above but in the JSON body.

---

## GET /api/health

No authentication required. Liveness check.

**Response 200:**
```json
{ "ok": true }
```

---

## POST /api/bot-heartbeat

**Scope:** write | **Rate limit:** 120/min | **Replay protection:** exempt

Called by the bot on startup and then on its heartbeat loop interval (default every 120 seconds, configurable with bot env `BOT_HEARTBEAT_INTERVAL_MS`) to record a liveness timestamp.
The web app stores the timestamp in `AppSetting` under key `BOT_LAST_HEARTBEAT`.
Optional live-state fields in the POST body are also persisted for Settings UI status cards (for example, `wikiSyncCapable` stores to `BOT_LIVE_WIKI_SYNC_CAPABLE`).

**Response 200:**
```json
{ "ok": true }
```

---

## GET /api/bot-heartbeat

**Scope:** read | **Rate limit:** 60/min

Returns the time of the last bot heartbeat and its age in seconds.

**Response 200:**
```json
{
  "last_heartbeat": "2026-03-16T22:11:52.000000+00:00",
  "age_seconds": 47
}
```

`last_heartbeat` and `age_seconds` are `null` if no heartbeat has been received yet.

---

## GET /api/bot-config

**Scope:** read | **Rate limit:** 10/min

Returns the current value of each bot feature flag as stored in the web app's settings database. The bot's `configSyncWorker` polls this endpoint to pick up runtime flag changes without restarting (default every 120 seconds, configurable with bot env `CONFIG_SYNC_INTERVAL_MS`).

**Response 200:**
```json
{
  "reviewNotifierEnabled": true,
  "submissionNotifierEnabled": false,
  "autoPeriodCreatorEnabled": false,
  "autoPeriodCloserEnabled": false,
  "claimReminderEnabled": true,
  "passageOfTimeEnabled": false,
  "huntConsequenceEnabled": false,
  "restartRequested": false,
  "passageOfTimeIntervalMs": 300000,
  "reviewNotifierIntervalMs": 120000,
  "submissionNotifierIntervalMs": 120000,
  "claimReminderIntervalMs": 900000,
  "announcementsChannelId": "123456789012345678"
}
```

Each field is `true`, `false`, or `null` (if the flag has never been set in the database).

---

## POST /api/bot-restart-ack

**Scope:** write | **Rate limit:** 10/min | **Replay protection:** exempt

Bot shutdown handshake endpoint. Called just before bot process exit when
`restartRequested=true` is seen from `/api/bot-config`.

**Response 200:**
```json
{ "ok": true }
```

---

## POST /api/wiki-sync-ack

**Scope:** write | **Rate limit:** 30/min | **Replay protection:** exempt

Bot status callback for wiki sync runs.

**Body:**
```json
{
  "status": "running",
  "source": "manual",
  "runId": "run-manual-1"
}
```

| Field | Required | Values | Notes |
|-------|----------|--------|-------|
| `status` | Yes | `running`, `success`, `error` | Current sync lifecycle state |
| `source` | No | `manual`, `scheduled` | Defaults to `manual` when omitted |
| `runId` | No | string (<=64 chars) | Correlation ID for one sync run lifecycle |
| `error` | When `status=error` | string | Human-readable error summary |

Behavior notes:
- `status=running` with `source=manual` clears `BOT_WIKI_SYNC_REQUESTED`.
- `status=running` with `source=scheduled` **does not** clear `BOT_WIKI_SYNC_REQUESTED` (prevents scheduled runs from consuming staff-queued manual runs).
- Web stores `BOT_WIKI_SYNC_SOURCE` for UI/operator context.
- Each ack appends a row to `notion_sync_events` (bounded history) including `runId` when provided.

**Response 200:**
```json
{ "ok": true, "retirementJobsSynced": 2 }
```

---

## POST /api/bot-log

**Scope:** write | **Rate limit:** 120/min | **Replay protection:** exempt

Bot log forwarder endpoint. Accepts an array of bot log entries and persists
warn/error records to the web DB (`app_log_entries`) for review in the admin UI.

**Body:**
```json
[
  {
    "ts": "2026-04-17T03:00:00.000000+00:00",
    "level": "warn",
    "event": "wiki_sync_scheduled_failed",
    "error": "timeout contacting web wiki API"
  }
]
```

**Response 200:**
```json
{ "ok": true }
```

---

## GET /api/meta/active-roster

**Scope:** read | **Rate limit:** 60/min

Returns all active characters sorted alphabetically.

**Query params:**

| Param | Description |
|-------|-------------|
| `includeDiscordIds=1` | Return objects with `name` and `discordId` instead of plain strings. Used by the staff broadcast command for player @mention autocomplete. |

**Response 200 (default):**
```json
{
  "characters": ["Alice", "Bob", "Carol"]
}
```

**Response 200 (`includeDiscordIds=1`):**
```json
{
  "characters": [
    { "name": "Alice", "discordId": "123456789012345678" },
    { "name": "Bob", "discordId": null },
    { "name": "Carol", "discordId": "987654321098765432" }
  ]
}
```

---

## GET /api/meta/claim-context

**Scope:** read | **Rate limit:** 60/min

Returns active characters and open play periods for the requesting user.
Staff see all active characters; players see only their own.

**Query params:** common requester params

**Response 200:**
```json
{
  "activeCharacters": ["Alice", "Bob"],
  "openPeriods": ["Night 77 - 3/1 - 3/15"],
  "currentNight": "Night 77 - 3/1 - 3/15"
}
```

`currentNight` is `null` if no period is open.

---

## GET /api/meta/claim-reminder-targets

**Scope:** read | **Rate limit:** 20/min

Returns players who have not yet submitted an XP claim for the current open period.
Used by the bot to post claim reminders in character cubby channels.

No requester params needed.

**Response 200:**
```json
{
  "currentNight": "Night 77 - 3/1 - 3/15",
  "targets": [
    { "discordId": "111111111111111111", "characterName": "Bob" }
  ]
}
```

`targets` is empty and `currentNight` is `null` if no period is open.

---

## GET /api/characters/{name}/summary

**Scope:** read | **Rate limit:** 60/min

Returns XP totals for a character. Players can only access their own characters;
staff can access any.

**Path params:** `name` — character name (case-insensitive)

**Query params:** common requester params plus:

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `include_history` | `1`/omitted | omitted | Include `recentClaims` and `recentSpends` arrays (up to 10 each, approved only). |

**Response 200:**
```json
{
  "characterName": "Alice",
  "earnedXp": 12,
  "totalXp": 22,
  "totalSpends": 8,
  "availableXp": 14
}
```

**Response 404:** Character not found or not accessible to requester.

---

## GET /api/backgrounds/status

**Scope:** read | **Rate limit:** 60/min

Returns all tracked backgrounds and their blanking state for a character. Players can only access their own characters; staff can access any.

**Query params:** common requester params plus:

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `characterName` | string | Yes | Character name (case-insensitive) |

**Response 200:**
```json
{
  "characterName": "Alice",
  "currentNight": "Night 42",
  "currentNightNumber": 42,
  "backgrounds": [
    {
      "id": 1,
      "background_name": "Herd",
      "dots_total": 3,
      "dots_blanked": 1,
      "dots_available": 2,
      "blanked": true,
      "blanked_at_night_number": 41,
      "release_night_number": 42,
      "updated_at": "20260421 18:00:00",
      "updated_by": "bot:StaffMember"
    }
  ]
}
```

`currentNight`/`currentNightNumber` are `null` if no open play period exists.

**Response 400:** `characterName` missing. **Response 403:** Requester cannot access this character. **Response 404:** Character not found.

---

## POST /api/backgrounds/blank

**Scope:** write | **Rate limit:** 30/min | **Replay protection:** required

Blanks one or more dots of a tracked background for a character (e.g. hunting consequence). Sets `release_night_number` to `current_night_number + 1`. Requires an active open play period.

**Body:**
```json
{
  "characterName": "Alice",
  "backgroundName": "Herd",
  "dots": 1,
  "requesterDiscordId": "123456789",
  "requesterDiscordName": "StaffMember"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `characterName` | string | Yes | Character name (case-insensitive) |
| `backgroundName` | string | Yes | Background name as it appears in the tracker |
| `dots` | int | No (default 1) | Number of dots to blank (must be > 0) |

**Response 200:**
```json
{
  "ok": true,
  "currentNight": "Night 42",
  "result": {
    "character_name": "Alice",
    "background_name": "Herd",
    "dots_blanked_now": 1,
    "dots_total": 3,
    "dots_blanked_total": 1,
    "dots_available": 2,
    "release_night_number": 43
  }
}
```

**Response 400:** Missing/invalid fields, or background not tracked for this character. **Response 403:** Requester cannot access this character. **Response 404:** Character not found. **Response 409:** No active open night found.

---

## POST /api/backgrounds/release-due

**Scope:** write | **Rate limit:** 30/min | **Replay protection:** required

Releases all blanked backgrounds whose `release_night_number` is ≤ the current open night number. Called automatically by the bot's passage-of-time monitor at the start of each night. No body required.

If no open play period exists, returns `ok: true` with an empty `released` array.

**Response 200:**
```json
{
  "ok": true,
  "currentNight": "Night 43",
  "released": [
    {
      "character_name": "Alice",
      "background_name": "Herd",
      "dots_released": 1,
      "player_discord": "111222333444555666"
    }
  ]
}
```

---

## GET /api/submission-events

**Scope:** read | **Rate limit:** 30/min

Returns pending claims and spends submitted since a given timestamp.
Used by the bot's SubmissionNotifier to post alerts to a staff channel when new submissions arrive.

**Query params:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `sinceEpoch` | int | 0 | Unix timestamp; return events submitted at or after this time |
| `sinceEventKey` | string | — | Cursor from last page |
| `limit` | int | 100 | Max events per response (1–500) |

**Response 200:**
```json
{
  "events": [
    {
      "eventKey": "claim:42:pending:1741200000",
      "kind": "claim",
      "rowIndex": 42,
      "characterName": "Alice",
      "playerDiscordId": "111111111111111111",
      "submittedAt": "20260301 14:00:00",
      "submittedAtEpoch": 1741200000,
      "playPeriod": "Night 77 - 3/1 - 3/15",
      "requestedXp": 3
    },
    {
      "eventKey": "spend:22:pending:1741203600",
      "kind": "spend",
      "rowIndex": 22,
      "characterName": "Alice",
      "playerDiscordId": "111111111111111111",
      "submittedAt": "20260301 15:00:00",
      "submittedAtEpoch": 1741203600,
      "spendCategory": "Merit/Background",
      "traitName": "Status",
      "currentDots": 2,
      "newDots": 3,
      "requestedCost": 3
    }
  ],
  "hasMore": false
}
```

Only pending items are returned. Once a claim or spend is reviewed (approved/denied), it no longer appears here.

---

## GET /api/review-events

**Scope:** read | **Rate limit:** 30/min

Returns approved and denied claims and spends since a given timestamp.
Used by the bot to poll for completed reviews and send player notifications.

**Query params:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `sinceEpoch` | int | 0 | Unix timestamp; return events reviewed at or after this time |
| `sinceEventKey` | string | — | Cursor from last page; skip events ≤ this key at the same epoch |
| `limit` | int | 100 | Max events per response (1–500) |

**Response 200:**
```json
{
  "events": [
    {
      "eventKey": "claim:42:approved:1741200000",
      "kind": "claim",
      "rowIndex": 42,
      "characterName": "Alice",
      "playerDiscordId": "111111111111111111",
      "status": "approved",
      "reviewedBy": "Storyteller",
      "reviewDate": "20260301 14:00:00",
      "reviewedAtEpoch": 1741200000,
      "staffNotes": "Nice RP.",
      "playPeriod": "Night 77 - 3/1 - 3/15",
      "requestedXp": 3,
      "approvedXp": 2
    },
    {
      "eventKey": "spend:22:approved:1741203600",
      "kind": "spend",
      "rowIndex": 22,
      "characterName": "Alice",
      "playerDiscordId": "111111111111111111",
      "status": "approved",
      "reviewedBy": "Storyteller",
      "reviewDate": "20260301 15:00:00",
      "reviewedAtEpoch": 1741203600,
      "staffNotes": "",
      "spendCategory": "Merit/Background",
      "traitName": "Status",
      "currentDots": 2,
      "newDots": 3,
      "requestedCost": 3,
      "verifiedCost": 3
    }
  ],
  "hasMore": false
}
```

`hasMore: true` means more events exist; re-request with the last `eventKey` as `sinceEventKey`.

**Pagination pattern:**
```
GET /api/review-events?sinceEpoch=0&limit=100
  → hasMore: true, last eventKey: "claim:99:approved:1741200000"
GET /api/review-events?sinceEpoch=1741200000&sinceEventKey=claim:99:approved:1741200000&limit=100
  → hasMore: false
```

---

## POST /api/periods/auto-create

**Scope:** write | **Rate limit:** 10/min | **Replay protection required**

Creates the next play period if one is due, based on server configuration.
Returns `created: false` (not an error) if creation is disabled or not yet due.

**Body:** empty / no body required

**Response 201** (period created):
```json
{
  "created": true,
  "reason": "created",
  "periodLabel": "Night 78 - 3/15 - 3/29",
  "nightNumber": 78
}
```

**Response 200** (no period needed):
```json
{
  "created": false,
  "reason": "not_due"
}
```

Returns `created: false, reason: "disabled"` if `AUTO_CREATE_PERIODS_ENABLED` is not `true`.

---

## POST /api/periods/auto-close

**Scope:** write | **Rate limit:** 10/min | **Replay protection required**

Closes submissions for the most recent open period if its `end_date` has passed (day after end date). Returns the list of players who had not submitted a claim, so the bot can send close notifications.

Returns `closed: false` (not an error) if close is disabled or not yet due.

**Body:** empty / no body required

**Response 200** (period closed):
```json
{
  "closed": true,
  "reason": "closed",
  "periodLabel": "Night 77 - 3/1 - 3/15",
  "nightNumber": 77,
  "reminderTargets": [
    { "discordId": "111111111111111111", "characterName": "Bob" }
  ]
}
```

**Response 200** (no action needed):
```json
{
  "closed": false,
  "reason": "not_due_yet"
}
```

Returns `closed: false, reason: "disabled"` if `AUTO_CLOSE_PERIODS_ENABLED` is not `true`.

---

## POST /api/claims

**Scope:** write | **Rate limit:** 20/min | **Replay protection required**

Submits an XP claim on behalf of a player character.

**Body:**
```json
{
  "requesterDiscordId": "111111111111111111",
  "requesterDiscordName": "PlayerName",
  "characterName": "Alice",
  "playPeriod": "Night 77 - 3/1 - 3/15",
  "categories": {
    "posted_once": "https://discord.com/...",
    "scene_with_another": "https://discord.com/...",
    "wildcard": "https://discord.com/...",
    "wildcard_reason": "Attended a Conclave",
    "wildcard_amount": "2"
  }
}
```

**Category keys:**

| Key | Value | Notes |
|-----|-------|-------|
| `posted_once` | Discord post URL | 1 XP |
| `hunting_awakening` | Discord post URL | 1 XP |
| `scene_with_another` | Discord post URL | 1 XP |
| `conflict` | Discord post URL | 1 XP |
| `combat` | Discord post URL | 1 XP |
| `unmitigated_stain` | Discord post URL | 1 XP |
| `wildcard` | Discord post URL | Amount from `wildcard_amount` |
| `wildcard_reason` | String ≤500 chars | Optional API field; player portal requires it when wildcard is used |
| `wildcard_amount` | Integer string 1–10 | Optional API field; defaults to `1` if omitted/invalid |

**Response 201:**
```json
{ "ok": true, "message": "Claim submitted" }
```

**Response 400:** Validation error (character inactive, period closed, duplicate claim, etc.)

---

## POST /api/spends

**Scope:** write | **Rate limit:** 20/min | **Replay protection required**

Submits an XP spend request on behalf of a player character.

**Body:**
```json
{
  "requesterDiscordId": "111111111111111111",
  "requesterDiscordName": "PlayerName",
  "characterName": "Alice",
  "spendCategory": "Merit/Background",
  "traitName": "Status",
  "currentDots": 2,
  "newDots": 3,
  "isInClan": false,
  "justification": "IC reason for the purchase."
}
```

**Spend categories** are defined in `packages/api-contract/spend_categories.json`.

**Dot ratings:** `currentDots` and `newDots` must be 0–10.

**Response 201:**
```json
{
  "ok": true,
  "message": "Spend request submitted",
  "xpCost": 6
}
```

`xpCost` is calculated from category + dot transition using shared XP rules.

**Response 400:** Validation error (character not found, inactive, invalid category/dots, etc.)

---

## GET /api/reminder-prefs

**Scope:** read

Returns persisted claim-reminder preferences keyed by Discord user ID.

**Response 200:**
```json
{
  "preferences": {
    "111111111111111111": {
      "optOut": false,
      "snoozeUntilEpoch": 0
    }
  }
}
```

---

## PUT /api/reminder-prefs/{discord_id}

**Scope:** write

Upserts claim-reminder preference state for one Discord user.

**Path params:** `discord_id` — numeric Discord ID

**Body:**
```json
{
  "optOut": true,
  "snoozeUntilEpoch": 0
}
```

**Response 200:**
```json
{ "ok": true }
```

---

## POST /api/wiki/page

**Scope:** write | **Rate limit:** 120/min | **Replay protection:** exempt

Creates or updates a wiki page record. Used by the sync script.

**Body (minimum):**
```json
{
  "slug": "hara-s-club",
  "title": "Hara's Club"
}
```

Optional fields:
- `body_markdown`
- `category`
- `cover_image_url` (Discord CDN URLs are mirrored to GCS when configured)
- `published` (boolean)
- `source`
- `updated_by`

**Response 201 (created):**
```json
{ "status": "created", "slug": "hara-s-club" }
```

**Response 200 (updated):**
```json
{ "status": "updated", "slug": "hara-s-club" }
```

**Response 423 (sync-locked):**
```json
{
  "status": "locked",
  "slug": "hara-s-club",
  "error": "wiki page is sync-locked"
}
```

---

## DELETE /api/wiki/page/{slug}

**Scope:** write | **Rate limit:** 120/min | **Replay protection:** exempt

Deletes a wiki page by slug.

**Response 200:**
```json
{ "status": "deleted", "slug": "hara-s-club" }
```

**Response 404:**
```json
{ "status": "not_found", "slug": "hara-s-club" }
```

**Response 423 (sync-locked):**
```json
{
  "status": "locked",
  "slug": "hara-s-club",
  "error": "wiki page is sync-locked"
}
```

---

## PUT /api/character/{name}/status

**Scope:** write | **Rate limit:** 120/min | **Replay protection:** exempt

Updates a character lifecycle status during sync (`active`, `deceased`, `retired`).
Also keeps `active` boolean aligned with status.
When the status transitions into `retired`, the web app also enqueues a retirement automation job for the bot.

**Body:**
```json
{ "status": "retired" }
```

**Response 200:**
```json
{
  "status": "updated",
  "character": "Alice",
  "new_status": "retired"
}
```

---

## GET /api/retirement-automation/pending

**Scope:** read | **Rate limit:** 120/min

Returns retirement automation jobs whose Discord-side work has not yet completed.

Failed jobs are retried with capped exponential backoff. This endpoint returns only jobs that are currently eligible to run again.

**Response 200:**
```json
{
  "jobs": [
    {
      "id": 14,
      "characterName": "Alice Voss",
      "cubbyChannelId": "123456789012345678",
      "requestedAt": "2026-06-25T14:00:00+00:00",
      "nextRetryAt": null
    }
  ]
}
```

---

## POST /api/retirement-automation/{id}/discord-complete

**Scope:** write | **Rate limit:** 120/min | **Replay protection:** exempt

Marks the Discord-side retirement work complete after the bot moves the cubby channel and handles the associated forum post.

**Body:**
```json
{
  "cubbyChannelId": "123456789012345678",
  "childrenSourceThreadId": "1168655581486252999",
  "childrenRetiredThreadId": "1168669113871257999"
}
```

**Response 200:**
```json
{ "ok": true }
```

---

## POST /api/retirement-automation/{id}/discord-failed

**Scope:** write | **Rate limit:** 120/min | **Replay protection:** exempt

Records a failed Discord-side retirement attempt after the bot has tried to roll back any partial channel or thread changes. The job stays pending for retry, and the error is visible in staff reports/settings.

Retry cadence is currently capped exponential backoff: 5 minutes, 10 minutes, 20 minutes, 40 minutes, and so on up to 6 hours.

**Body:**
```json
{
  "error": "completion endpoint failed"
}
```

**Response 200:**
```json
{ "ok": true }
```

---

## POST /api/retirement-automation/wiki-batch-request

**Scope:** write | **Rate limit:** 30/min | **Replay protection:** exempt

Requests a daily wiki sync batch if retirement jobs are waiting for wiki propagation and no wiki sync is already queued.

**Response 200:**
```json
{
  "ok": true,
  "requested": true,
  "pendingCount": 3
}
```

---

## GET /api/roster/character/{name}

**Scope:** read | **Rate limit:** 120/hour

Returns current details for a character. Used by `/lasombra edit` to pre-fill the form.

**Response 200:**
```json
{
  "character_name": "Astrid",
  "player_discord": "166346048049119233",
  "player_discord_name": "itsneeon",
  "clan": "Gangrel",
  "age_category": "Neonate",
  "sect": "Camarilla",
  "active": true
}
```

**Response 404:** Character not found.

---

## PATCH /api/roster/character/{name}

**Scope:** write | **Rate limit:** 60/hour

Updates clan, age_category, and/or sect for an existing character.

**Body:**
```json
{
  "clan": "Toreador",
  "age_category": "Ancilla",
  "sect": "Camarilla",
  "requesterDiscordId": "111111111111111111",
  "requesterDiscordName": "StaffMember"
}
```

All fields are optional. At least one of `clan`, `age_category`, `sect` is required.

**Response 200:** `{ "ok": true, "character_name": "Astrid" }`
**Response 400:** No updatable fields or invalid value.
**Response 404:** Character not found.

---

## POST /api/roster/character/{name}/rename

**Scope:** write | **Rate limit:** 30/hour

Renames a character and migrates all claims, spends, ledger, and audit entries.

**Body:**
```json
{
  "new_name": "Astrid von Holt",
  "requesterDiscordId": "111111111111111111",
  "requesterDiscordName": "StaffMember"
}
```

**Response 200:** `{ "ok": true, "old_name": "Astrid", "new_name": "Astrid von Holt" }`
**Response 400:** `new_name` missing or same as current.
**Response 404:** Character not found.
**Response 409:** `new_name` already exists on the roster.

---

## POST /api/roster/character

**Scope:** write | **Rate limit:** 60/hour

Creates a new character roster entry. Called by the bot during `/lasombra approve`.

**Body:**
```json
{
  "character_name": "Astrid",
  "player_discord": "166346048049119233",
  "player_discord_name": "itsneeon",
  "clan": "Gangrel",
  "age_category": "Neonate",
  "sect": "Camarilla",
  "requesterDiscordId": "111111111111111111",
  "requesterDiscordName": "StaffMember"
}
```

| Field | Required | Notes |
|-------|----------|-------|
| `character_name` | Yes | Must be unique (case-insensitive) |
| `clan` | No | Must match CLANS list if provided |
| `age_category` | No | Fledgling / Neonate / Ancilla / Elder / Mortal |
| `sect` | No | Camarilla / Anarch / Hecata / Autarkis / NA |
| `player_discord` | No | Discord snowflake |
| `player_discord_name` | No | Discord username |

**Response 201:**
```json
{ "ok": true, "character_name": "Astrid" }
```

**Response 400:** Missing or invalid fields.
**Response 409:** Character name already exists.

---

## POST /api/sheets/reconcile

**Scope:** write | **Rate limit:** 5/hour

Triggers a full Google Sheets reconciliation. Compares every DB record against
Sheets and appends missing rows or updates stale statuses. Called by the bot
once nightly via `SheetsReconcileService`. Returns 503 if Sheets is not
configured on the web side.

**Body:** empty / no body required

**Response 200:**
```json
{
  "started_at": "2026-04-10 03:00:00 UTC",
  "finished_at": "2026-04-10 03:00:12 UTC",
  "claims_appended": 0,
  "claims_status_updated": 1,
  "spends_appended": 0,
  "spends_status_updated": 0,
  "ledger_appended": 2,
  "characters_appended": 0,
  "errors": []
}
```

---

## Error response format

All error responses use this shape:

```json
{ "error": "Human-readable message" }
```

| Status | Meaning |
|--------|---------|
| 400 | Bad request / validation failure |
| 401 | Missing or invalid bearer token |
| 403 | Valid token but insufficient scope |
| 404 | Resource not found |
| 409 | Replay attack detected |
| 503 | Server-side config missing (token or DB not configured) |

---

## DELETE /api/roster/character/{name}

**Scope:** write | **Rate limit:** 60/hour

Hard-deletes a character roster entry with no history. Refuses with `409` if the character has any XP claims, spend requests, or ledger entries — use `PUT /api/character/{name}/status` with `retired` or `deceased` for those cases instead.

Called by the bot during `/lasombra delete` (staff-only, no-history characters only).

**Path params:** `name` — character name (case-insensitive)

**Body (optional):**
```json
{
  "requesterDiscordId": "111111111111111111",
  "requesterDiscordName": "StaffMember"
}
```

**Response 200:**
```json
{ "ok": true, "character_name": "Astrid" }
```

**Response 404:** Character not found.
**Response 409:** Character has existing history — retire or mark deceased instead.

---

## GET /api/coteries

**Scope:** read | **Rate limit:** 60/min

Returns all active coteries with their members. Used by wiki sync and the bot.

**Response 200:**
```json
{
  "coteries": [
    {
      "id": 1,
      "name": "The Dusk Compact",
      "slug": "the-dusk-compact",
      "description": "...",
      "discord_channel_id": "123456789012345678",
      "members": [
        { "character_name": "Alice", "clan": "Brujah", "player_discord_id": "111111111111111111" }
      ]
    }
  ]
}
```

---

## POST /api/coteries/activate

**Scope:** write | **Rate limit:** 30/min

Finds a pending coterie by name, sets its Discord channel ID, and activates it. Called by the bot after provisioning a coterie channel.

**Body:**
```json
{
  "name": "The Dusk Compact",
  "discord_channel_id": "123456789012345678"
}
```

**Response 200:**
```json
{
  "ok": true,
  "coterie": {
    "id": 1,
    "name": "The Dusk Compact",
    "slug": "the-dusk-compact",
    "members": [
      { "character_name": "Alice", "player_discord_id": "111111111111111111", "free_dots": 3 }
    ],
    "free_pool_total": 3
  }
}
```

**Response 404:** No coterie found with that name.
**Response 409:** Coterie is already active.

---

## GET /api/coteries/by-character/{discord_id}

**Scope:** read | **Rate limit:** 60/min

Returns the active coterie for a player's character. Used by the bot's `/coterie status` command.

**Path params:** `discord_id` — Discord snowflake

**Query params:**

| Param | Required | Description |
|-------|----------|-------------|
| `character_name` | No | Character name filter — required for players with multiple active characters |

**Response 200:**
```json
{
  "character_name": "Alice",
  "coterie": {
    "id": 1,
    "name": "The Dusk Compact",
    "slug": "the-dusk-compact",
    "description": "...",
    "status": "active",
    "chasse": 2,
    "lien": 1,
    "portillon": 3
  },
  "members": [
    {
      "character_name": "Alice",
      "clan": "Brujah",
      "player_discord_id": "111111111111111111",
      "player_name": "playerhandle"
    }
  ]
}
```

`coterie` is `null` if the character is not in a coterie (still returns 200).

**Response 404:** No active character found for this Discord user (with optional `character_name` filter).

---

## POST /api/boons

**Scope:** write (replay-protected) | **Rate limit:** 20/min

Creates a boon: the creditor's player asserts the debtor owes them one. Called by the bot's `/prestation owe` command.

**Body:**
```json
{
  "creditorCharacterName": "Alice",
  "debtorCharacterName": "Marcus",
  "tier": "minor",
  "reason": "Covered for a missed elysium appearance",
  "requesterDiscordId": "111111111111111111",
  "requesterDiscordName": "playerhandle"
}
```

`tier` must be one of `trivial`, `minor`, `major`, `life`. The requester must control the creditor character (staff bypass allowed) — you can only assert a boon owed *to* your own character.

**Response 201:**
```json
{
  "ok": true,
  "boon": {
    "id": 12,
    "creditor_character_name": "Alice",
    "debtor_character_name": "Marcus",
    "tier": "minor",
    "reason": "Covered for a missed elysium appearance",
    "status": "owed",
    "created_at": "2026-07-03T20:00:00+00:00",
    "resolved_at": null
  }
}
```

**Response 400:** Missing/invalid fields, invalid `tier`, or `creditorCharacterName == debtorCharacterName`.
**Response 403:** Requester doesn't control the creditor character.
**Response 404:** Creditor or debtor character not found (or inactive).

---

## GET /api/boons/by-character/{discord_id}

**Scope:** read | **Rate limit:** 60/min

Lists boons where one of the requester's active characters is either creditor or debtor. Used by the bot's `/prestation status` command.

**Path params:** `discord_id` — Discord snowflake

**Query params:**

| Param | Required | Description |
|-------|----------|-------------|
| `character_name` | No | Character name filter — required for players with multiple active characters |
| `status` | No | Filter to one status: `owed`, `repayment_offered`, `repaid` |

**Response 200:**
```json
{
  "character_name": "Alice",
  "boons": [
    {
      "id": 12,
      "direction": "owed_to_me",
      "counterparty_name": "Marcus",
      "tier": "minor",
      "reason": "Covered for a missed elysium appearance",
      "status": "owed",
      "created_at": "2026-07-03T20:00:00+00:00"
    }
  ]
}
```

**Response 404:** No active character found for this Discord user.

---

## POST /api/boons/{boon_id}/repay-action

**Scope:** write (replay-protected) | **Rate limit:** 20/min

Two-step boon repayment. The debtor's player calls this to propose repayment (`owed` → `repayment_offered`); the creditor's player calls it again to confirm (`repayment_offered` → `repaid`). Staff may call it at either step regardless of role. Used by the bot's `/prestation repay` command — the bot doesn't need to know which step it is; the endpoint figures it out from the boon's current status and the requester's relationship to it.

**Body:**
```json
{
  "requesterDiscordId": "222222222222222222",
  "requesterDiscordName": "otherplayerhandle"
}
```

**Response 200:** Same `boon` shape as `POST /api/boons`, with the updated `status`.
**Response 404:** Boon not found.
**Response 409:** Wrong role for the boon's current status (e.g. the creditor tries to propose, or the debtor tries to confirm their own proposal), or the boon is already `repaid`. The error message explains exactly which case.

---

## POST /api/scene-requests

**Scope:** write (replay-protected) | **Rate limit:** 20/min

Queues a player's request for a scene with an SPC (ST-played character). Called by the bot's `/scene request` command.

**Body:**
```json
{
  "characterName": "Alice",
  "spcName": "Prince Voss",
  "playPeriod": "Night 14",
  "justification": "Alice needs to answer for the elysium incident",
  "requesterDiscordId": "111111111111111111",
  "requesterDiscordName": "playerhandle"
}
```

The requester must control `characterName` (staff bypass allowed). `playPeriod` is a free-text label (matches `DbPlayPeriod.period_label`, not validated against the table).

**Response 201:**
```json
{
  "ok": true,
  "request": {
    "id": 7,
    "requester_character_name": "Alice",
    "requester_discord_id": "111111111111111111",
    "spc_name": "Prince Voss",
    "play_period": "Night 14",
    "justification": "Alice needs to answer for the elysium incident",
    "status": "pending",
    "claimed_by_discord_id": "",
    "claimed_by_name": "",
    "rejected_reason": "",
    "queue_channel_id": null,
    "queue_message_id": null,
    "created_at": "2026-07-10T20:00:00+00:00",
    "resolved_at": null
  }
}
```

**Response 400:** Missing `characterName`, `spcName`, or `justification`.
**Response 403:** Requester doesn't control `characterName`.
**Response 404:** Character not found (or inactive).

---

## POST /api/scene-requests/{request_id}/queue-message

**Scope:** write (replay-protected) | **Rate limit:** 20/min

Records where the bot posted the queue embed, so it can be edited in place on claim/reject. Best-effort — called by the bot right after posting; failure here doesn't fail the scene request itself.

**Body:**
```json
{ "channelId": "999999999999999999", "messageId": "888888888888888888" }
```

**Response 200:** `{ "ok": true }`
**Response 404:** Scene request not found.

---

## POST /api/scene-requests/{request_id}/claim-action

**Scope:** write (replay-protected) | **Rate limit:** 20/min

An ST claims a `pending` scene request. Called by the bot when a Storyteller clicks **Claim** on the queue embed — role-gating (Storyteller/staff) happens bot-side before this is called.

**Body:**
```json
{ "requesterDiscordId": "222222222222222222", "requesterDiscordName": "stormteller" }
```

**Response 200:** Same `request` shape as `POST /api/scene-requests`, with `status: "claimed"`, `claimed_by_discord_id`, and `claimed_by_name` set.
**Response 404:** Scene request not found.
**Response 409:** Already `claimed` or `rejected` by someone else. Body includes the current `request` state so the caller can show who got there first.

---

## POST /api/scene-requests/{request_id}/reject-action

**Scope:** write (replay-protected) | **Rate limit:** 20/min

An ST rejects a `pending` scene request. Called by the bot when a Storyteller submits the reject-reason modal.

**Body:**
```json
{ "requesterDiscordId": "222222222222222222", "requesterDiscordName": "stormteller", "reason": "SPC is unavailable that night" }
```

`reason` is optional.

**Response 200:** Same `request` shape as `POST /api/scene-requests`, with `status: "rejected"` and `rejected_reason` set.
**Response 404:** Scene request not found.
**Response 409:** Already `claimed` or `rejected`. Body includes the current `request` state.

---

## POST /api/contact-threads

**Scope:** write (replay-protected) | **Rate limit:** 20/min

Starts a new `#kindred-contact` conversation, possibly with multiple recipients (a group text). Called by the bot's `/contact send` command.

**Body:**
```json
{
  "senderCharacterName": "Alice",
  "recipientCharacterNames": ["Marcus", "Elena"],
  "body": "Meet me at the warehouse tonight.",
  "requesterDiscordId": "111111111111111111",
  "requesterDiscordName": "playerhandle"
}
```

The requester must control the sender character. Every name in `recipientCharacterNames` must resolve to a distinct, active character other than the sender.

**Response 201:**
```json
{
  "ok": true,
  "thread_id": 7,
  "participants": [
    { "character_name": "Alice", "discord_id": "111111111111111111" },
    { "character_name": "Marcus", "discord_id": "222222222222222222" },
    { "character_name": "Elena", "discord_id": "333333333333333333" }
  ]
}
```

**Response 400:** Missing fields, or no valid recipient other than the sender.
**Response 403:** Requester doesn't control the sender character.
**Response 404:** Sender not found, or one or more recipient names don't resolve to an active character (named in the error message).

---

## GET /api/contact-threads/by-character/{discord_id}

**Scope:** read | **Rate limit:** 60/min

Lists the open conversations (most recent 25 by last activity) one of the requester's active characters participates in. Used by the bot's `/contact reply` thread-picker autocomplete.

**Path params:** `discord_id` — Discord snowflake

**Query params:**

| Param | Required | Description |
|-------|----------|-------------|
| `character_name` | No | Character name filter — required for players with multiple active characters |

**Response 200:**
```json
{
  "character_name": "Alice",
  "threads": [
    {
      "id": 7,
      "participant_names": ["Alice", "Marcus", "Elena"],
      "last_message_at": "2026-07-03T20:05:00+00:00",
      "message_count": 3
    }
  ]
}
```

**Response 404:** No active character found for this Discord user.

---

## POST /api/contact-threads/{thread_id}/messages

**Scope:** write (replay-protected) | **Rate limit:** 20/min

Replies to an existing `#kindred-contact` conversation. Called by the bot's `/contact reply` command.

**Body:**
```json
{
  "senderCharacterName": "Marcus",
  "body": "On my way.",
  "requesterDiscordId": "222222222222222222",
  "requesterDiscordName": "otherplayerhandle"
}
```

**Response 201:**
```json
{
  "ok": true,
  "message": { "id": 21, "sender_character_name": "Marcus", "body": "On my way." },
  "other_participants": [
    { "character_name": "Alice", "discord_id": "111111111111111111" },
    { "character_name": "Elena", "discord_id": "333333333333333333" }
  ]
}
```

`other_participants` is every thread participant except the sender — the bot uses this to mention everyone who should be notified of the reply.

**Response 400:** Missing fields.
**Response 403:** Requester doesn't control the sender character, or the sender character is not a participant in this thread.
**Response 404:** Thread not found, or sender character not found.
