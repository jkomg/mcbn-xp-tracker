#!/usr/bin/env node
/**
 * Clears all globally-registered slash commands for this bot application.
 * Run this once on ursula to remove stale global commands that conflict with
 * guild-specific commands registered on startup.
 *
 * Usage:
 *   node scripts/clear-global-commands.mjs
 *
 * Requires CLIENT_ID and BOT_TOKEN in .env (or environment).
 */

import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Parse .env manually (avoid needing dotenv installed as a dep for a script)
function loadEnv() {
  try {
    const envPath = join(__dirname, '..', '.env');
    const lines = readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
      if (!(key in process.env)) process.env[key] = val;
    }
  } catch {
    // .env not found — rely on existing environment
  }
}

loadEnv();

const clientId = process.env.CLIENT_ID;
const token = process.env.BOT_TOKEN;

if (!clientId || !token) {
  console.error('Missing CLIENT_ID or BOT_TOKEN in environment / .env');
  process.exit(1);
}

const url = `https://discord.com/api/v10/applications/${clientId}/commands`;

console.log(`Clearing global commands for application ${clientId}…`);

const res = await fetch(url, {
  method: 'PUT',
  headers: {
    Authorization: `Bot ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify([]),
});

if (!res.ok) {
  const text = await res.text();
  console.error(`Discord API error ${res.status}: ${text}`);
  process.exit(1);
}

const data = await res.json();
console.log(`Done. Global commands are now: ${JSON.stringify(data)} (should be empty [])`);
