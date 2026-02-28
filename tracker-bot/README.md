# mcbn-tracker-bot

Discord bot scaffold for MCbN XP tracking.

This project is the starting point for a true Discord bot front-end that can:
- mirror XP workflows from the Flask web app (`/Users/jasonkennedy/Projects/mcbn-xp-tracker`), and
- reuse command/bot patterns from the original TypeScript bot scaffold (`/Users/jasonkennedy/Documents/Coding/mcbn-xp-tracker`).

## What is already wired

- Discord bot runtime and slash-command registration.
- `/ping` command for runtime health.
- `/xp summary` command calling a pluggable adapter.
- `/xp claim` command posting claim payload to adapter.
- `/xp spend-cost` command using V5 XP rules.
- V5 XP rules ported to TypeScript from Flask `app/xp_rules.py`.
- Discord message link parser/validator ported from the TS scaffold.

## Integration model

This bot uses `TrackerAdapter` (`src/services/adapter.ts`) to decouple Discord command UX from backend storage/workflow.

Current implementation: `WebAppAdapter` expects future API endpoints on the Flask app:
- `GET /api/characters/:name/summary`
- `POST /api/claims`
- `POST /api/spends`

Those endpoints do not exist yet in the Flask app, so commands are scaffold-level right now.

## Quick start

```bash
cp .env.example .env
# set BOT_TOKEN, CLIENT_ID, TEST_GUILD_ID
npm run dev
```

## Scripts

- `npm run dev` - run bot with tsx
- `npm run build` - compile TypeScript
- `npm run start` - run built bot
- `npm run test` - run unit tests

## Next implementation steps

1. Add JSON API routes to Flask app for summary/claim/spend.
2. Add auth between bot and web app API (token or signed HMAC).
3. Expand command parity with web UI flows (review queues, approvals, roster, periods).
4. Add guild-to-chronicle config and role-based permissions.

## Side-by-side test setup (with isolated web-app clone)

Use the isolated Flask clone at:
`/Users/jasonkennedy/Projects/mcbn-xp-tracker-bot-test`

1. In that clone, set `.env` with a test `WEB_APP_API_TOKEN` and your Sheets credentials.
2. Start clone on port 5002:
   ```bash
   ./dev-bot-test.sh
   ```
3. In this bot project, set `.env`:
   ```env
   WEB_APP_BASE_URL=http://127.0.0.1:5002
   WEB_APP_API_TOKEN=<same token as Flask clone>
   ```
4. Start bot:
   ```bash
   npm run dev
   ```

Then test with slash commands:
- `/xp summary`
- `/xp claim`
- `/xp spend`
- `/xp spend-cost`
