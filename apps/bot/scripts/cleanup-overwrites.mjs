/**
 * One-off script: removes redundant channel permission overwrites.
 * A channel overwrite is redundant if it is bit-for-bit identical to its
 * parent category's overwrite for the same role.
 *
 * Uses discord.js REST (same library the bot uses) so routing works correctly.
 *
 * Usage:
 *   node apps/bot/scripts/cleanup-overwrites.mjs           # dry-run
 *   node apps/bot/scripts/cleanup-overwrites.mjs --apply   # apply changes
 */

import { REST, Routes } from 'discord.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dir, '..', '.env');

// Load .env
const env = {};
for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const [k, ...rest] = trimmed.split('=');
    env[k.trim()] = rest.join('=').trim();
}

const TOKEN = env.BOT_TOKEN;
const GUILD_ID = env.DISCORD_GUILD_ID;
const DRY_RUN = !process.argv.includes('--apply');
const RATE_LIMIT_MS = 500;

if (!TOKEN || !GUILD_ID) {
    console.error('BOT_TOKEN and DISCORD_GUILD_ID required in apps/bot/.env');
    process.exit(1);
}

const rest = new REST({ version: '10' }).setToken(TOKEN);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function main() {
    console.log('Fetching channels and roles...');
    const [channels, roles] = await Promise.all([
        rest.get(Routes.guildChannels(GUILD_ID)),
        rest.get(Routes.guildRoles(GUILD_ID)),
    ]);
    const roleNames = Object.fromEntries(roles.map(r => [r.id, r.name]));

    // Build category overwrite index
    const catOws = {};
    for (const ch of channels) {
        if (ch.type === 4) { // category
            catOws[ch.id] = {};
            for (const ow of (ch.permission_overwrites ?? [])) {
                catOws[ch.id][`${ow.id}:${ow.type}`] = ow;
            }
        }
    }

    // Find redundant channel overwrites (role only, type=0)
    const toRemove = [];
    for (const ch of channels) {
        if (ch.type === 4) continue;
        const pid = ch.parent_id;
        if (!pid || !catOws[pid]) continue;

        for (const ow of (ch.permission_overwrites ?? [])) {
            if (ow.type !== 0) continue; // role overwrites only
            const catOw = catOws[pid][`${ow.id}:${ow.type}`];
            if (catOw && String(catOw.allow) === String(ow.allow) && String(catOw.deny) === String(ow.deny)) {
                toRemove.push({ ch, ow });
            }
        }
    }

    const totalBefore = channels.reduce((n, ch) => n + (ch.permission_overwrites?.length ?? 0), 0);
    console.log(`\nTotal overwrites before: ${totalBefore}`);
    console.log(`Redundant overwrites found: ${toRemove.length}`);
    console.log(`Projected total after: ${totalBefore - toRemove.length}`);
    console.log(`Mode: ${DRY_RUN ? 'DRY-RUN (pass --apply to execute)' : 'APPLY'}\n`);

    if (DRY_RUN || toRemove.length === 0) {
        if (toRemove.length === 0) console.log('Nothing to remove.');
        return;
    }

    let removed = 0, errors = 0;
    for (const { ch, ow } of toRemove) {
        const role = roleNames[ow.id] ?? ow.id;
        try {
            await rest.delete(Routes.channelPermission(ch.id, ow.id));
            removed++;
            process.stdout.write(`  removed  #${ch.name}  ${role}\n`);
        } catch (e) {
            errors++;
            process.stdout.write(`  ERROR    #${ch.name}  ${role}: ${e.message}\n`);
        }
        await sleep(RATE_LIMIT_MS);
    }

    console.log(`\nDone. Removed: ${removed} | Errors: ${errors}`);
}

main().catch(err => { console.error(err); process.exit(1); });
