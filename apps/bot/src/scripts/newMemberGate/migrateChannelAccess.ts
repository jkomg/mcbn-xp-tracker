/**
 * scripts/newMemberGate/migrateChannelAccess.ts
 *
 * One-time migration for the new-member "jail" gate. Today, any channel with
 * no explicit `@everyone`-deny overwrite is fully visible and postable
 * (including links/images) to a brand-new account the instant it joins —
 * verified or not. This closes that gap:
 *
 *   1. For every channel currently open to bare `@everyone` (per
 *      visibilityAudit's `visibleToEveryone`), grants explicit View/Send/
 *      Embed/Attach/History/React access to "The Washed Masses" role plus
 *      the four staff roles — restoring exactly the access those roles
 *      already effectively have today.
 *   2. Exception: a small pre-verification allowlist (the #welcome jail
 *      channel + a few informational channels) stays open to bare
 *      `@everyone`, but posting is limited to plain text (no
 *      links/images), and most of the allowlist is read-only.
 *   3. Only after (1) and (2) are confirmed written: removes View Channel
 *      from `@everyone`'s guild-wide base permissions, which is what
 *      actually closes the gap for the ~90 channels that have no overwrite
 *      today.
 *
 * Channels that already have an explicit `@everyone`-deny overwrite (most
 * of the server) are untouched — this migration only affects currently-open
 * channels.
 *
 * Reuses the existing permissionRemediation toolkit rather than
 * reimplementing permission resolution or snapshot/rollback:
 *   - `auditVisibility` (visibilityAudit.ts) for the "is this channel
 *     currently open to @everyone" classification — real Discord
 *     deny-then-allow resolution order, already tested.
 *   - `captureSnapshot`/`writeSnapshot` (snapshot.ts) for a pre-mutation
 *     snapshot; `npm run ops:permissions -- --restore <path>` is the
 *     existing rollback path for the same snapshot format.
 *   - `fetchAllNonThreadChannels`/`forEachRateLimited` (discordHelpers.ts).
 *
 * Usage (from apps/bot/):
 *   npm run ops:migrate-channel-access                              # dry-run against .env
 *   npm run ops:migrate-channel-access -- --apply                   # snapshot, then apply
 *   npm run ops:migrate-channel-access -- --env-file .env.dev       # target the dev/test guild instead
 *
 * Required env vars: BOT_TOKEN, DISCORD_GUILD_ID (or TEST_GUILD_ID —
 * point this at the dev/test guild to validate first).
 */

import path from 'node:path';
import * as dotenv from 'dotenv';
import { Client, GatewayIntentBits, PermissionsBitField, type Guild } from 'discord.js';
import { auditVisibility } from '../permissionRemediation/visibilityAudit';
import { captureSnapshot, defaultSnapshotDir, writeSnapshot } from '../permissionRemediation/snapshot';
import { forEachRateLimited } from '../permissionRemediation/discordHelpers';

function envFileArg(): string {
  const i = process.argv.indexOf('--env-file');
  return i >= 0 ? (process.argv[i + 1] ?? '.env') : '.env';
}

dotenv.config({ path: path.resolve(__dirname, '..', '..', '..', envFileArg()) });

const { ViewChannel, SendMessages, EmbedLinks, AttachFiles, ReadMessageHistory, AddReactions } = PermissionsBitField.Flags;

/** "The Washed Masses" — already granted to everyone who completes onboarding today; repurposed as the real access gate. */
export const VERIFIED_ROLE_ID = process.env.NEW_MEMBER_GATE_VERIFIED_ROLE_ID || '1193292818484052029';

/** The jail channel: bare @everyone can post plain text here, nowhere else. */
export const WELCOME_CHANNEL_ID = process.env.NEW_MEMBER_GATE_WELCOME_CHANNEL_ID || '1168641906356518962';

function parseCsvIds(value: string | undefined, fallback: string[]): Set<string> {
  if (!value) return new Set(fallback);
  return new Set(value.split(',').map((s) => s.trim()).filter(Boolean));
}

/** Read-only for bare @everyone — informational, no posting needed pre-verification. */
const READ_ONLY_ALLOWLIST_IDS = parseCsvIds(process.env.NEW_MEMBER_GATE_READONLY_CHANNEL_IDS, [
  '1168639288250998785', // server-rules
  '1168639654501814273', // announcements
  '1169724738814349523', // getting-started
]);

/** Postable for bare @everyone, but never links/images — same policy as #welcome. */
const POSTABLE_ALLOWLIST_IDS = new Set([
  WELCOME_CHANNEL_ID,
  ...parseCsvIds(process.env.NEW_MEMBER_GATE_POSTABLE_CHANNEL_IDS, [
    '1170106212453453834', // server-questions
    '1168654464308228217', // help-desk
  ]),
]);

function staffRoleIds(): string[] {
  return [
    process.env.STAFF_ROLE_SYSTEM_HELPER_ID || '1168649906324520992',
    process.env.STAFF_ROLE_STORYTELLER_ID || '1168649373731790948',
    process.env.STAFF_ROLE_MODERATOR_ID || '1168650352132890794',
    process.env.STAFF_ROLE_ADMINISTRATOR_ID || '1168648955731648554',
  ].filter(Boolean);
}

type ChannelAction =
  | { kind: 'preverify-postable'; id: string; name: string }
  | { kind: 'preverify-readonly'; id: string; name: string }
  | { kind: 'grant-verified'; id: string; name: string }
  | { kind: 'skip-already-gated'; id: string; name: string };

export async function computePlan(guild: Guild): Promise<ChannelAction[]> {
  const report = await auditVisibility(guild, {
    verifiedMemberRoleId: VERIFIED_ROLE_ID,
    honeypotChannelId: '',
    modLogChannelIds: [],
  });

  return report.rows.map((row): ChannelAction => {
    if (POSTABLE_ALLOWLIST_IDS.has(row.channelId)) {
      return { kind: 'preverify-postable', id: row.channelId, name: row.channelName };
    }
    if (READ_ONLY_ALLOWLIST_IDS.has(row.channelId)) {
      return { kind: 'preverify-readonly', id: row.channelId, name: row.channelName };
    }
    if (!row.visibleToEveryone) {
      return { kind: 'skip-already-gated', id: row.channelId, name: row.channelName };
    }
    return { kind: 'grant-verified', id: row.channelId, name: row.channelName };
  });
}

function summarize(plan: ChannelAction[]): string[] {
  const lines: string[] = [];
  const byKind = {
    'preverify-postable': plan.filter((a) => a.kind === 'preverify-postable'),
    'preverify-readonly': plan.filter((a) => a.kind === 'preverify-readonly'),
    'grant-verified': plan.filter((a) => a.kind === 'grant-verified'),
    'skip-already-gated': plan.filter((a) => a.kind === 'skip-already-gated'),
  };
  lines.push(`Pre-verification, postable (no links/images) — ${byKind['preverify-postable'].length}:`);
  for (const a of byKind['preverify-postable']) lines.push(`  #${a.name} (${a.id})`);
  lines.push(`Pre-verification, read-only — ${byKind['preverify-readonly'].length}:`);
  for (const a of byKind['preverify-readonly']) lines.push(`  #${a.name} (${a.id})`);
  lines.push(`Grant "The Washed Masses" + staff explicit access — ${byKind['grant-verified'].length}:`);
  for (const a of byKind['grant-verified']) lines.push(`  #${a.name} (${a.id})`);
  lines.push(`Already gated (untouched) — ${byKind['skip-already-gated'].length} channels`);
  lines.push('');
  lines.push('After the above overwrites are written: @everyone loses View Channel at the guild-wide base permission level.');
  return lines;
}

async function preflight(guild: Guild): Promise<string[]> {
  const errors: string[] = [];
  for (const roleId of staffRoleIds()) {
    const role = await guild.roles.fetch(roleId).catch(() => null);
    if (!role) errors.push(`Staff role ${roleId} could not be resolved in this guild.`);
  }
  const verified = await guild.roles.fetch(VERIFIED_ROLE_ID).catch(() => null);
  if (!verified) errors.push(`Verified role ${VERIFIED_ROLE_ID} (The Washed Masses) could not be resolved in this guild.`);
  const me = guild.members.me;
  if (!me) errors.push('Bot member could not be resolved in this guild.');
  return errors;
}

async function applyPlan(guild: Guild, plan: ChannelAction[]): Promise<void> {
  const reason = 'New-member gate migration';
  const staff = staffRoleIds();

  await forEachRateLimited(plan, async (action) => {
    const channel = await guild.channels.fetch(action.id).catch(() => null);
    if (!channel || !('permissionOverwrites' in channel)) return;

    if (action.kind === 'preverify-postable') {
      await channel.permissionOverwrites.edit(
        guild.id,
        { ViewChannel: true, SendMessages: true, ReadMessageHistory: true, EmbedLinks: false, AttachFiles: false },
        { reason },
      );
    } else if (action.kind === 'preverify-readonly') {
      await channel.permissionOverwrites.edit(
        guild.id,
        { ViewChannel: true, ReadMessageHistory: true, SendMessages: false },
        { reason },
      );
    } else if (action.kind === 'grant-verified') {
      const fullAccess = {
        ViewChannel: true,
        SendMessages: true,
        EmbedLinks: true,
        AttachFiles: true,
        ReadMessageHistory: true,
        AddReactions: true,
      };
      await channel.permissionOverwrites.edit(VERIFIED_ROLE_ID, fullAccess, { reason });
      for (const staffId of staff) {
        await channel.permissionOverwrites.edit(staffId, fullAccess, { reason });
      }
    }
    // 'skip-already-gated': no-op.
  });
}

async function removeEveryoneViewChannelBase(guild: Guild): Promise<void> {
  const everyone = guild.roles.everyone;
  const next = everyone.permissions.remove(ViewChannel);
  await everyone.setPermissions(next, 'New-member gate migration: close the always-open-channel gap');
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const token = process.env.BOT_TOKEN;
  const guildId = process.env.DISCORD_GUILD_ID || process.env.TEST_GUILD_ID;
  if (!token || !guildId) {
    console.error('BOT_TOKEN and DISCORD_GUILD_ID (or TEST_GUILD_ID) are required.');
    process.exitCode = 1;
    return;
  }

  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  await client.login(token);
  try {
    const guild = await client.guilds.fetch(guildId);
    await guild.roles.fetch();
    console.log(`Guild: ${guild.name} (${guild.id})\n`);

    const preflightErrors = await preflight(guild);
    if (preflightErrors.length > 0) {
      console.error('Pre-flight checks failed — no changes made:');
      for (const err of preflightErrors) console.error(`  - ${err}`);
      process.exitCode = 1;
      return;
    }

    const plan = await computePlan(guild);
    console.log(summarize(plan).join('\n'));

    if (!apply) {
      console.log('\nMODE: dry-run — no changes made. Re-run with --apply to execute.');
      return;
    }

    console.log('\nMODE: APPLY — snapshotting current state first...\n');
    const snapshot = await captureSnapshot(guild, {
      modulesRun: ['overwrite'],
      triggeredBy: { discordUserId: null, discordTag: null, source: 'cli' },
    });
    const snapshotPath = await writeSnapshot(snapshot, process.env.PERMISSION_SNAPSHOT_DIR || defaultSnapshotDir());
    console.log(`Snapshot written to ${snapshotPath}`);

    console.log('\nApplying channel overwrites...');
    await applyPlan(guild, plan);

    console.log('\nRemoving View Channel from @everyone base permissions...');
    await removeEveryoneViewChannelBase(guild);

    console.log('\nDone.');
    console.log(`To undo everything: npm run ops:permissions -- --restore ${snapshotPath}`);
  } finally {
    await client.destroy();
  }
}

void main();
