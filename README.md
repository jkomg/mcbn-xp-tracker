# VTM5 XP Tracker — Discord Bot

This repository is a scaffold for a Discord bot to track XP for a play-by-post Vampire: The Masquerade 5E server.

Key choices in this scaffold:
- TypeScript + discord.js v14
- Prisma ORM + Postgres (SQLite supported for local dev)
- Scheduler uses Luxon for timezone-aware windows
- Submissions accepted in character channels (ephemeral fallback)
- Evidence are Discord message links (bot verifies message exists and owner)
- Staff review (Storyteller role) required for approvals

What this contains
- src/index.ts — bot bootstrap, command loader, scheduler hook
- src/commands/* — slash command handlers:
  - character register, list
  - submit-xp
  - submission review (staff)
  - config (schedule + staff settings)
  - spend requests (player + staff review)
- src/db.ts — Prisma client helper
- prisma/schema.prisma — DB schema models
- .env.example — environment configuration template

Prerequisites
1. A Discord application + bot token
2. A Postgres database
3. Guild ID(s) where the bot will run
4. A Storyteller role ID and a staff review channel for approvals

## Step-by-step setup (local)
1. **Create a Discord app + bot**
   - Go to https://discord.com/developers/applications and create a new application.
   - Under **Bot**, click **Add Bot** and copy the **Bot Token**.
   - Under **OAuth2 → URL Generator**, select `bot` and `applications.commands` scopes.
   - Grant required permissions: `Send Messages`, `Read Message History`, `Use Slash Commands`.
   - Invite the bot to your server using the generated URL.

2. **Configure environment**
   - Copy `.env.example` to `.env`.
   - Fill in:
     - `BOT_TOKEN`
     - `DATABASE_URL`
     - Optional: `CLIENT_ID`, `TEST_GUILD_ID`, `TEST_STAFF_CHANNEL`

3. **Install dependencies**
   - `pnpm install` (or `npm install`)

4. **Run Prisma migrations**
   - `npx prisma migrate dev` (or `npx prisma db push` for prototyping)

5. **Start the bot**
   - `pnpm dev` (or `npm run dev`)

6. **Initial config in Discord**
   - Set staff review channel:
     - `/config set-review-channel channel:#staff-review`
   - Set storyteller role:
     - `/config set-storyteller-role role:@Storyteller`
   - Configure windows (optional):
     - `/config set-schedule timezone:America/Chicago window_hours:168 anchor_weekday:7 anchor_hour:12`

## Step-by-step setup (cloud)
You can deploy to any Node-compatible host. These steps assume a container-based host (Render, Railway, Fly.io, etc.).

1. **Create a managed Postgres database**
   - Copy the connection string into `DATABASE_URL`.

2. **Provision a Node service**
   - Use Node 18+.
   - Configure environment variables:
     - `BOT_TOKEN`
     - `DATABASE_URL`
     - Optional: `CLIENT_ID`, `TEST_GUILD_ID`, `TEST_STAFF_CHANNEL`

3. **Build and run**
   - Build command: `npm install && npm run build`
   - Start command: `npm run start`

4. **Run migrations**
   - Most platforms provide a one-off command runner.
   - Execute: `npx prisma migrate deploy`

5. **Finish in Discord**
   - Set staff review channel and storyteller role with `/config`.

## Commands overview
### Player commands
- `/character register name:<name> clan:<clan> sheet:<url> channel:<channel>`
- `/character list`
- `/submit-xp character:<id|name> posted:true hunting:true ... links:<msg links> notes:<optional>`
- `/spend request character:<id|name> type:<string> value:<int> cost:<int> reason:<string>`

### Staff commands
- `/submission review id:<submissionId> action:accept|reject notes:<optional>`
- `/spend review id:<requestId> action:accept|reject notes:<optional>`
- `/config set-review-channel channel:<#channel>`
- `/config set-storyteller-role role:<@role>`
- `/config set-schedule ...`
- `/config show`

## Testing
- Run unit tests with: `npm test`

## How submissions work
1. Players submit XP with `/submit-xp`, including message links as evidence.
2. The bot validates the links (guild/channel/author).
3. Submissions are stored as `pending` and forwarded to the staff review channel.
4. Staff review with `/submission review`, which either grants XP (creates a transaction) or rejects it.

## How XP spend requests work
1. Players submit a spend request with `/spend request`.
2. Staff review with `/spend review`.
3. Accepted requests create a negative XP transaction.
