/**
 * Checks which cubby channels a given user can see.
 * Reports any cubby channel they can see that isn't their own.
 *
 * Usage:
 *   node apps/bot/scripts/check-user-cubby-access.mjs <user_id>
 */

import { REST, Routes, PermissionsBitField } from 'discord.js';
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
const USER_ID = process.argv[2];

if (!USER_ID) {
    console.error('Usage: node check-user-cubby-access.mjs <user_id>');
    process.exit(1);
}

const rest = new REST({ version: '10' }).setToken(TOKEN);

const VIEW_CHANNEL = 1n << 10n; // 1024

function computeViewChannel(memberRoleIds, channelOws, everyoneId) {
    // Start with @everyone overwrite on the channel
    let allow = 0n, deny = 0n;

    const everyoneOw = channelOws.find(o => o.id === everyoneId);
    if (everyoneOw) {
        allow |= BigInt(everyoneOw.allow);
        deny  |= BigInt(everyoneOw.deny);
    }

    // Role overwrites
    for (const ow of channelOws) {
        if (ow.type !== 0) continue;
        if (ow.id === everyoneId) continue;
        if (memberRoleIds.has(ow.id)) {
            allow |= BigInt(ow.allow);
            deny  |= BigInt(ow.deny);
        }
    }

    // Member overwrite
    const memberOw = channelOws.find(o => o.type === 1 && o.id === USER_ID);
    if (memberOw) {
        allow |= BigInt(memberOw.allow);
        deny  |= BigInt(memberOw.deny);
    }

    if (deny & VIEW_CHANNEL) return false;
    if (allow & VIEW_CHANNEL) return true;
    return null; // inherits from category
}

async function main() {
    console.log(`Checking cubby access for user: ${USER_ID}\n`);

    const [channels, member, roles] = await Promise.all([
        rest.get(Routes.guildChannels(GUILD_ID)),
        rest.get(Routes.guildMember(GUILD_ID, USER_ID)),
        rest.get(Routes.guildRoles(GUILD_ID)),
    ]);

    const roleNames = Object.fromEntries(roles.map(r => [r.id, r.name]));
    const memberRoleIds = new Set(member.roles);
    const everyoneId = GUILD_ID;

    console.log(`Member: ${member.user?.username ?? USER_ID}`);
    console.log(`Roles: ${member.roles.map(id => roleNames[id] ?? id).join(', ')}\n`);

    // Find cubby categories
    const cubbyCats = channels.filter(ch =>
        ch.type === 4 &&
        ch.name.toLowerCase().includes('character cubb')
    );

    if (cubbyCats.length === 0) {
        console.log('No cubby categories found (looking for "character cubb" in name).');
        return;
    }

    for (const cat of cubbyCats) {
        console.log(`=== Category: ${cat.name} (${cat.id}) ===`);

        // Compute category-level visibility for this user
        const catVisible = computeViewChannel(memberRoleIds, cat.permission_overwrites ?? [], everyoneId);
        console.log(`  Category-level ViewChannel: ${catVisible === null ? 'not set' : catVisible}`);

        const kids = channels.filter(ch => ch.parent_id === cat.id && ch.type !== 4);
        let visibleCount = 0;
        const visibleChannels = [];

        for (const ch of kids) {
            const chResult = computeViewChannel(memberRoleIds, ch.permission_overwrites ?? [], everyoneId);
            // Effective: channel result overrides category, or falls through to category
            const effective = chResult !== null ? chResult : catVisible;
            if (effective === true) {
                visibleCount++;
                visibleChannels.push(ch.name);
            }
        }

        console.log(`  Channels in category: ${kids.length}`);
        console.log(`  Visible to user: ${visibleCount}`);
        if (visibleCount > 0) {
            for (const name of visibleChannels) {
                console.log(`    - #${name}`);
            }
        }
        console.log();
    }
}

main().catch(err => { console.error(err); process.exit(1); });
