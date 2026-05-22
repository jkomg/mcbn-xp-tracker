/**
 * Two-phase overwrite reduction using discord.js REST:
 *   Phase 1 (promote): For each category, find role overwrites that appear
 *     identically on ALL channels → merge them onto the category.
 *   Phase 2 (cleanup): Remove channel-level overwrites that now exactly
 *     match their parent category (redundant after phase 1 or prior state).
 *
 * Usage:
 *   node apps/bot/scripts/promote-and-cleanup.mjs              # dry-run
 *   node apps/bot/scripts/promote-and-cleanup.mjs --apply      # apply both phases
 *   node apps/bot/scripts/promote-and-cleanup.mjs --cleanup-only  # skip promote
 */

import { REST, Routes } from 'discord.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

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
const CLEANUP_ONLY = process.argv.includes('--cleanup-only');
const thresholdArg = process.argv.find(a => a.startsWith('--threshold='));
const THRESHOLD = thresholdArg ? parseFloat(thresholdArg.split('=')[1]) : 1.0;
const RATE_LIMIT_MS = 500;

if (!TOKEN || !GUILD_ID) {
    console.error('BOT_TOKEN and DISCORD_GUILD_ID required in apps/bot/.env');
    process.exit(1);
}

const rest = new REST({ version: '10' }).setToken(TOKEN);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function mergePerms(catAllow, catDeny, newAllow, newDeny) {
    const merged_allow = BigInt(catAllow) | BigInt(newAllow);
    const merged_deny = (BigInt(catDeny) | BigInt(newDeny)) & ~merged_allow;
    return [String(merged_allow), String(merged_deny)];
}

async function main() {
    console.log('Fetching channels and roles...');
    let [channels, roles] = await Promise.all([
        rest.get(Routes.guildChannels(GUILD_ID)),
        rest.get(Routes.guildRoles(GUILD_ID)),
    ]);
    const roleNames = Object.fromEntries(roles.map(r => [r.id, r.name]));

    const totalBefore = channels.reduce((n, ch) => n + (ch.permission_overwrites?.length ?? 0), 0);
    console.log(`Total overwrites at start: ${totalBefore}\n`);

    // ── Phase 1: Promote category permissions ────────────────────────────────
    if (!CLEANUP_ONLY) {
        console.log('=== Phase 1: Promote to category level ===');
        const categories = channels.filter(ch => ch.type === 4);
        const children = {};
        for (const ch of channels) {
            if (ch.type === 4 || !ch.parent_id) continue;
            if (!children[ch.parent_id]) children[ch.parent_id] = [];
            children[ch.parent_id].push(ch);
        }

        const promotions = [];
        for (const cat of categories) {
            const kids = children[cat.id] ?? [];
            if (!kids.length) continue;

            // Tally votes per role overwrite
            const votes = {};
            for (const ch of kids) {
                for (const ow of (ch.permission_overwrites ?? [])) {
                    if (ow.type !== 0) continue;
                    const key = `${ow.id}`;
                    if (!votes[key]) votes[key] = {};
                    const valKey = `${ow.allow}:${ow.deny}`;
                    votes[key][valKey] = (votes[key][valKey] ?? 0) + 1;
                }
            }

            const catOwMap = Object.fromEntries((cat.permission_overwrites ?? []).map(o => [o.id, o]));

            for (const [roleId, tally] of Object.entries(votes)) {
                const best = Object.entries(tally).sort((a, b) => b[1] - a[1])[0];
                if (best[1] / kids.length < THRESHOLD) continue;

                const [consensusAllow, consensusDeny] = best[0].split(':');
                const existing = catOwMap[roleId];
                const [newAllow, newDeny] = mergePerms(
                    existing?.allow ?? '0', existing?.deny ?? '0',
                    consensusAllow, consensusDeny
                );

                if (newAllow === (existing?.allow ?? '0') && newDeny === (existing?.deny ?? '0')) continue;

                promotions.push({ cat, roleId, newAllow, newDeny, existing });
            }
        }

        console.log(`Promotions found: ${promotions.length}`);
        for (const p of promotions) {
            const role = roleNames[p.roleId] ?? p.roleId;
            console.log(`  [${p.cat.name}] ${role}  allow=${p.newAllow} deny=${p.newDeny}`);
        }

        if (!DRY_RUN && promotions.length > 0) {
            console.log('\nApplying promotions...');
            let promoted = 0, errors = 0;
            for (const p of promotions) {
                try {
                    await rest.put(Routes.channelPermission(p.cat.id, p.roleId), {
                        body: { allow: p.newAllow, deny: p.newDeny, type: 0 }
                    });
                    promoted++;
                    console.log(`  promoted [${p.cat.name}] ${roleNames[p.roleId] ?? p.roleId}`);
                } catch (e) {
                    errors++;
                    console.log(`  ERROR [${p.cat.name}] ${roleNames[p.roleId] ?? p.roleId}: ${e.message}`);
                }
                await sleep(RATE_LIMIT_MS);
            }
            console.log(`Promote done. Applied: ${promoted} | Errors: ${errors}\n`);

            // Refresh channels after promotions
            channels = await rest.get(Routes.guildChannels(GUILD_ID));
        }
        console.log();
    }

    // ── Phase 2: Remove redundant channel overwrites ──────────────────────────
    console.log('=== Phase 2: Remove redundant channel overwrites ===');
    const catOws = {};
    for (const ch of channels) {
        if (ch.type === 4) {
            catOws[ch.id] = {};
            for (const ow of (ch.permission_overwrites ?? [])) {
                catOws[ch.id][`${ow.id}:${ow.type}`] = ow;
            }
        }
    }

    const toRemove = [];
    for (const ch of channels) {
        if (ch.type === 4) continue;
        const pid = ch.parent_id;
        if (!pid || !catOws[pid]) continue;
        for (const ow of (ch.permission_overwrites ?? [])) {
            if (ow.type !== 0) continue;
            const catOw = catOws[pid][`${ow.id}:${ow.type}`];
            if (catOw && String(catOw.allow) === String(ow.allow) && String(catOw.deny) === String(ow.deny)) {
                toRemove.push({ ch, ow });
            }
        }
    }

    const totalNow = channels.reduce((n, ch) => n + (ch.permission_overwrites?.length ?? 0), 0);
    console.log(`Redundant overwrites to remove: ${toRemove.length}`);
    console.log(`Current total: ${totalNow}  →  projected: ${totalNow - toRemove.length}`);
    console.log(`Mode: ${DRY_RUN ? 'DRY-RUN' : 'APPLY'}\n`);

    if (DRY_RUN || toRemove.length === 0) {
        if (toRemove.length === 0) console.log('Nothing to remove.');
        if (DRY_RUN) console.log('Run with --apply to execute.');
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

    const finalTotal = totalNow - removed;
    console.log(`\n${'='.repeat(60)}`);
    console.log(`  Removed: ${removed} | Errors: ${errors}`);
    console.log(`  Overwrites before: ${totalBefore}  →  now: ~${finalTotal}`);
    console.log('='.repeat(60));
}

main().catch(err => { console.error(err); process.exit(1); });
