/**
 * Restores Discord channel permission overwrites from a snapshot JSON file.
 *
 * For every channel in the snapshot:
 *   - Overwrites present in snapshot but missing/changed in current state → PUT (restore)
 *   - Overwrites present in current state but absent in snapshot → DELETE (remove)
 *
 * Usage:
 *   node apps/bot/scripts/restore-overwrites.mjs <snapshot.json>              # dry-run
 *   node apps/bot/scripts/restore-overwrites.mjs <snapshot.json> --apply      # apply
 */

import { REST, Routes } from 'discord.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dir, '..', '.env');

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

const snapshotArg = process.argv.find(a => !a.startsWith('--') && a.endsWith('.json'));
if (!snapshotArg) {
    console.error('Usage: node restore-overwrites.mjs <snapshot.json> [--apply]');
    process.exit(1);
}
if (!TOKEN || !GUILD_ID) {
    console.error('BOT_TOKEN and DISCORD_GUILD_ID required in apps/bot/.env');
    process.exit(1);
}

const snapshotPath = resolve(snapshotArg);
const snapshot = JSON.parse(readFileSync(snapshotPath, 'utf8'));
console.log(`Snapshot: ${snapshotPath}`);
console.log(`Snapshot timestamp: ${snapshot.timestamp}`);
console.log(`Channels in snapshot: ${snapshot.channels.length}`);
console.log(`Mode: ${DRY_RUN ? 'DRY-RUN (pass --apply to execute)' : 'APPLY'}\n`);

const rest = new REST({ version: '10' }).setToken(TOKEN);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function main() {
    // Build snapshot index: channelId → Map of overwriteKey → overwrite
    const snapIndex = {};
    for (const ch of snapshot.channels) {
        snapIndex[ch.id] = {};
        for (const ow of (ch.permission_overwrites ?? [])) {
            snapIndex[ch.id][`${ow.id}:${ow.type}`] = ow;
        }
    }

    // Fetch current state
    console.log('Fetching current channel state from Discord...');
    const currentChannels = await rest.get(Routes.guildChannels(GUILD_ID));
    const currentIndex = {};
    for (const ch of currentChannels) {
        currentIndex[ch.id] = {};
        for (const ow of (ch.permission_overwrites ?? [])) {
            currentIndex[ch.id][`${ow.id}:${ow.type}`] = ow;
        }
    }
    console.log(`Current channels: ${currentChannels.length}\n`);

    const toPut = [];    // restore missing or changed overwrites
    const toDelete = []; // remove overwrites not in snapshot

    for (const snapCh of snapshot.channels) {
        const snapOws = snapIndex[snapCh.id] ?? {};
        const curOws = currentIndex[snapCh.id] ?? {};

        // Overwrites in snapshot that differ from current (missing or changed)
        for (const [key, snapOw] of Object.entries(snapOws)) {
            const curOw = curOws[key];
            if (!curOw || String(curOw.allow) !== String(snapOw.allow) || String(curOw.deny) !== String(snapOw.deny)) {
                toPut.push({ ch: snapCh, ow: snapOw });
            }
        }

        // Overwrites in current that are NOT in snapshot (were added by promote)
        for (const [key, curOw] of Object.entries(curOws)) {
            if (!snapOws[key]) {
                toDelete.push({ ch: snapCh, ow: curOw });
            }
        }
    }

    console.log(`Overwrites to restore (PUT):  ${toPut.length}`);
    console.log(`Overwrites to remove (DELETE): ${toDelete.length}`);
    console.log();

    if (toPut.length === 0 && toDelete.length === 0) {
        console.log('Nothing to do — current state matches snapshot.');
        return;
    }

    if (DRY_RUN) {
        console.log('--- PUT (restore) ---');
        for (const { ch, ow } of toPut) {
            console.log(`  PUT  #${ch.name}  id=${ow.id} type=${ow.type} allow=${ow.allow} deny=${ow.deny}`);
        }
        console.log('--- DELETE (remove added overwrites) ---');
        for (const { ch, ow } of toDelete) {
            console.log(`  DEL  #${ch.name}  id=${ow.id} type=${ow.type} allow=${ow.allow} deny=${ow.deny}`);
        }
        console.log('\nRun with --apply to execute.');
        return;
    }

    // Apply PUTs
    let putOk = 0, putErr = 0;
    console.log('Applying PUTs...');
    for (const { ch, ow } of toPut) {
        try {
            await rest.put(Routes.channelPermission(ch.id, ow.id), {
                body: { allow: ow.allow, deny: ow.deny, type: ow.type }
            });
            putOk++;
            process.stdout.write(`  PUT  #${ch.name}  id=${ow.id}\n`);
        } catch (e) {
            putErr++;
            process.stdout.write(`  ERR  #${ch.name}  id=${ow.id}: ${e.message}\n`);
        }
        await sleep(RATE_LIMIT_MS);
    }

    // Apply DELETEs
    let delOk = 0, delErr = 0;
    console.log('\nApplying DELETEs...');
    for (const { ch, ow } of toDelete) {
        try {
            await rest.delete(Routes.channelPermission(ch.id, ow.id));
            delOk++;
            process.stdout.write(`  DEL  #${ch.name}  id=${ow.id}\n`);
        } catch (e) {
            delErr++;
            process.stdout.write(`  ERR  #${ch.name}  id=${ow.id}: ${e.message}\n`);
        }
        await sleep(RATE_LIMIT_MS);
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log(`  PUT:    ok=${putOk}  err=${putErr}`);
    console.log(`  DELETE: ok=${delOk}  err=${delErr}`);
    console.log('='.repeat(60));
}

main().catch(err => { console.error(err); process.exit(1); });
