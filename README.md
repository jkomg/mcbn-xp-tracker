# VTM5 XP Tracker — Discord Bot (scaffold)

This repository is a scaffold for a Discord bot to track XP for a play-by-post Vampire: The Masquerade 5E server.

Key choices in this scaffold:
- TypeScript + discord.js v14
- Prisma ORM + Postgres (SQLite supported for local dev)
- Scheduler uses Luxon for timezone-aware windows
- Submissions accepted in character channels (ephemeral fallback)
- Evidence are Discord message links (bot verifies message exists and owner)
- Staff review (Storyteller role) required for approvals

What this scaffold contains
- src/index.ts — bot bootstrap, command loader, scheduler hook
- src/commands/* — starter slash command handlers:
  - character register, list
  - submit-xp (skeleton)
  - submission review (skeleton for staff)
  - config set-schedule (skeleton)
- src/db.ts — Prisma client helper
- prisma/schema.prisma — DB schema models
- docker-compose.yml / Dockerfile / .env.example

Next steps before full MVP
1. Provide Guild ID(s), Storyteller role ID(s), and the staff review channel ID(s).
2. Decide Day/Night mapping if you want something other than alternating windows.
3. Optionally provide an initial anchor date; otherwise the bot will compute the next Sunday 12:00 America/Chicago as the first anchor.
4. Deploy the bot and provide BOT_TOKEN + DATABASE_URL env vars.

To run locally (dev)
- Install dependencies: `pnpm install` (or `npm install`)
- Create `.env` from `.env.example` and set values
- Run Prisma migrations: `npx prisma migrate dev` (or `npx prisma db push` for prototyping)
- Start dev: `pnpm dev` (or `npm run dev`)

If you want, I'll:
- Finish implementing the submit/verify/forward flow next
- Implement scheduler (windows and reminders)
- Add full staff review (approve/reject) and spending request flows
- Provide deployment + docker instructions for hosting

Say "Continue: implement submit flow + scheduler" to have me implement the next set of features.
