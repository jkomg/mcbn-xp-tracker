/**
 * setupTestGateEnv.ts — one-time helper for standing up a representative
 * test environment for the new-member gate feature (migrateChannelAccess.ts
 * + newMemberGate.ts) on the dev/test Discord guild, ahead of validating
 * against production.
 *
 * Creates (idempotent — reuses by name if already present):
 *   - Roles: "The Washed Masses", "Lurkers", "Sheet in Progress", and a
 *     single "Test Staff" stand-in for all four production staff roles.
 *   - Pre-verification allowlist channels: "welcome" (postable, no
 *     links/images), "server-rules"/"announcements"/"getting-started"
 *     (read-only), "help-desk"/"server-questions" (postable).
 *   - "staff-only-test", with an explicit @everyone-deny overwrite — a
 *     stand-in for an already-gated channel, to verify the migration
 *     leaves it untouched.
 *
 * Deliberately does NOT create a "currently open" channel — the test
 * guild's existing "general" and Correspondence-test channels (no
 * overwrites) already cover that case.
 *
 * Prints every env var migrateChannelAccess.ts and newMemberGate.ts need,
 * ready to paste into apps/bot/.env.dev.
 *
 * Usage (from apps/bot/):
 *   npm run ops:setup-test-gate-env                    # uses .env.dev + TEST_GUILD_ID
 *   npm run ops:setup-test-gate-env -- --guild <id>     # override the target guild
 *
 * Requires BOT_TOKEN with "Manage Roles" + "Manage Channels" in the target guild.
 */

import path from 'node:path';
import * as dotenv from 'dotenv';
import { ChannelType, Client, GatewayIntentBits, type Guild } from 'discord.js';

function parseArgs(argv: string[]) {
  const args = { guildId: '', envFile: '.env.dev' };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--guild') args.guildId = argv[++i] ?? '';
    else if (argv[i] === '--env-file') args.envFile = argv[++i] ?? '.env.dev';
  }
  return args;
}

async function ensureRole(guild: Guild, name: string): Promise<string> {
  const existing = guild.roles.cache.find((r) => r.name === name);
  if (existing) return existing.id;
  const role = await guild.roles.create({ name, reason: 'New-member gate test setup' });
  return role.id;
}

async function ensureTextChannel(guild: Guild, name: string): Promise<string> {
  const existing = guild.channels.cache.find((c) => c?.type === ChannelType.GuildText && c.name === name);
  if (existing) return existing.id;
  const channel = await guild.channels.create({ name, type: ChannelType.GuildText });
  return channel.id;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  dotenv.config({ path: path.resolve(__dirname, '..', '..', '..', args.envFile) });

  const token = process.env.BOT_TOKEN;
  const guildId = args.guildId || process.env.TEST_GUILD_ID;
  if (!token || !guildId) {
    console.error(`BOT_TOKEN and TEST_GUILD_ID are required (loaded from ${args.envFile}, or pass --guild <id>).`);
    process.exitCode = 1;
    return;
  }

  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  await client.login(token);
  try {
    const guild = await client.guilds.fetch(guildId);
    await guild.roles.fetch();
    await guild.channels.fetch();
    console.log(`Guild: ${guild.name} (${guild.id})\n`);

    const verifiedRoleId = await ensureRole(guild, 'The Washed Masses');
    const lurkerRoleId = await ensureRole(guild, 'Lurkers');
    const sheetInProgressRoleId = await ensureRole(guild, 'Sheet in Progress');
    const testStaffRoleId = await ensureRole(guild, 'Test Staff');

    const welcomeId = await ensureTextChannel(guild, 'welcome');
    const rulesId = await ensureTextChannel(guild, 'server-rules');
    const announcementsId = await ensureTextChannel(guild, 'announcements');
    const gettingStartedId = await ensureTextChannel(guild, 'getting-started');
    const helpDeskId = await ensureTextChannel(guild, 'help-desk');
    const serverQuestionsId = await ensureTextChannel(guild, 'server-questions');

    const staffOnlyId = await ensureTextChannel(guild, 'staff-only-test');
    const staffOnlyChannel = await guild.channels.fetch(staffOnlyId);
    if (staffOnlyChannel && 'permissionOverwrites' in staffOnlyChannel) {
      await staffOnlyChannel.permissionOverwrites.edit(
        guild.id,
        { ViewChannel: false },
        { reason: 'New-member gate test setup: stand-in for an already-gated channel' },
      );
    }

    console.log('Paste these into apps/bot/.env.dev:\n');
    console.log(`NEW_MEMBER_GATE_ENABLED=true`);
    console.log(`NEW_MEMBER_GATE_WELCOME_CHANNEL_ID=${welcomeId}`);
    console.log(`VERIFIED_MEMBER_ROLE_ID=${verifiedRoleId}`);
    console.log(`NEW_MEMBER_GATE_SHEET_IN_PROGRESS_ROLE_ID=${sheetInProgressRoleId}`);
    console.log(`NEW_MEMBER_GATE_LURKER_ROLE_ID=${lurkerRoleId}`);
    console.log(`NEW_MEMBER_GATE_READONLY_CHANNEL_IDS=${rulesId},${announcementsId},${gettingStartedId}`);
    console.log(`NEW_MEMBER_GATE_POSTABLE_CHANNEL_IDS=${helpDeskId},${serverQuestionsId}`);
    console.log(`STAFF_ROLE_SYSTEM_HELPER_ID=${testStaffRoleId}`);
    console.log(`STAFF_ROLE_STORYTELLER_ID=${testStaffRoleId}`);
    console.log(`STAFF_ROLE_MODERATOR_ID=${testStaffRoleId}`);
    console.log(`STAFF_ROLE_ADMINISTRATOR_ID=${testStaffRoleId}`);
    console.log(`\n"staff-only-test" (#${staffOnlyId}) is already gated — leave it out of the migration script's allowlist env vars so it stays a "skip-already-gated" test case.`);
    console.log('The guild\'s existing "general" / Correspondence-test channels (no overwrites) already cover the "currently open, should become grant-verified" case.');
  } finally {
    await client.destroy();
  }
}

void main();
