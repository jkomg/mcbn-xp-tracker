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

Called by the bot on startup and every 60 seconds to record a liveness timestamp.
The web app stores the timestamp in `AppSetting` under key `BOT_LAST_HEARTBEAT`.

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
Used by the bot to send reminder DMs.

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

**Query params:** common requester params

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
| `wildcard_reason` | String ≤500 chars | Required with `wildcard` |
| `wildcard_amount` | Integer string 1–10 | Required with `wildcard` |

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

`xpCost` is the calculated cost based on dot rating and in-clan status.

**Response 400:** Validation error (character not found, inactive, invalid category/dots, etc.)

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
