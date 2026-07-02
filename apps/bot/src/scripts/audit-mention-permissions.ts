/**
 * audit-mention-permissions.ts
 *
 * Audits (and optionally fixes) the two mechanisms that let members mass-ping
 * roles — the attack surface used by sleeper spam bots:
 *
 *   1. role.mentionable — "Allow anyone to @mention this role"
 *   2. The "Mention @everyone, @here, and All Roles" permission
 *      (MentionEveryone) on roles and channel overwrites, which bypasses
 *      the mentionable toggle entirely.
 *
 * Usage (from apps/bot/):
 *   npm run ops:audit-mentions                        # dry-run report only
 *   npm run ops:audit-mentions -- --apply             # fix everything not allow-listed
 *   npm run ops:audit-mentions -- --apply --keep-mentionable <roleId,roleId>
 *   npm run ops:audit-mentions -- --setup-automod     # create native AutoMod mention-spam rule
 *
 * --apply:
 *   - sets mentionable=false on every role except those passed via
 *     --keep-mentionable (comma-separated role IDs)
 *   - removes MentionEveryone from every role except those passed via
 *     --keep-mention-everyone (comma-separated role IDs)
 *   - removes MentionEveryone from channel-overwrite allows (non-allow-listed)
 *   Roles the bot cannot edit (above its highest role, or managed) are
 *   reported but skipped.
 *
 * --setup-automod:
 *   Creates Discord's native AutoMod "mention spam" rule (block message +
 *   timeout + optional alert channel) if no mention-spam rule exists yet.
 *   This is the PRIMARY defense: it blocks the message server-side before
 *   notifications fan out, and keeps working when this bot is offline.
 *   Optional flags: --automod-limit <n> (default 5),
 *   --automod-timeout-minutes <n> (default 10),
 *   --automod-alert-channel <channelId>
 *
 * Required env vars (in apps/bot/.env):
 *   BOT_TOKEN          Discord bot token (needs Manage Roles; Manage Server
 *                      for --setup-automod)
 *   DISCORD_GUILD_ID   Target server ID (falls back to TEST_GUILD_ID)
 */

import path from 'node:path';
import * as dotenv from 'dotenv';
import {
  AutoModerationActionType,
  AutoModerationRuleEventType,
  AutoModerationRuleTriggerType,
  Client,
  GatewayIntentBits,
  PermissionsBitField,
  type Guild,
  type Role,
} from 'discord.js';

dotenv.config({ path: path.resolve(__dirname, '..', '..', '.env') });

const MENTION_EVERYONE = PermissionsBitField.Flags.MentionEveryone;

type Args = {
  apply: boolean;
  setupAutomod: boolean;
  keepMentionable: Set<string>;
  keepMentionEveryone: Set<string>;
  automodLimit: number;
  automodTimeoutMinutes: number;
  automodAlertChannel: string;
};

function parseArgs(argv: string[]): Args {
  const args: Args = {
    apply: false,
    setupAutomod: false,
    keepMentionable: new Set(),
    keepMentionEveryone: new Set(),
    automodLimit: 5,
    automodTimeoutMinutes: 10,
    automodAlertChannel: '',
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => argv[++i] ?? '';
    if (arg === '--apply') args.apply = true;
    else if (arg === '--setup-automod') args.setupAutomod = true;
    else if (arg === '--keep-mentionable') {
      next().split(',').map((s) => s.trim()).filter(Boolean).forEach((id) => args.keepMentionable.add(id));
    } else if (arg === '--keep-mention-everyone') {
      next().split(',').map((s) => s.trim()).filter(Boolean).forEach((id) => args.keepMentionEveryone.add(id));
    } else if (arg === '--automod-limit') args.automodLimit = Number.parseInt(next(), 10) || 5;
    else if (arg === '--automod-timeout-minutes') args.automodTimeoutMinutes = Number.parseInt(next(), 10) || 10;
    else if (arg === '--automod-alert-channel') args.automodAlertChannel = next();
  }
  return args;
}

function canEditRole(guild: Guild, role: Role): boolean {
  const me = guild.members.me;
  if (!me) return false;
  if (role.managed) return false; // bot/integration roles can't be reassigned this way
  return me.roles.highest.comparePositionTo(role) > 0;
}

async function auditRoles(guild: Guild, args: Args): Promise<void> {
  console.log('\n=== Roles: "Allow anyone to @mention this role" (mentionable) ===');
  const mentionableRoles = guild.roles.cache
    .filter((r) => r.mentionable)
    .sort((a, b) => b.position - a.position);
  if (mentionableRoles.size === 0) {
    console.log('  (none — no role is freely mentionable)');
  }
  for (const role of mentionableRoles.values()) {
    const keep = args.keepMentionable.has(role.id);
    const editable = canEditRole(guild, role);
    let action = 'REPORT ONLY (dry-run)';
    if (keep) action = 'KEEP (allow-listed)';
    else if (args.apply && !editable) action = 'SKIP (bot cannot edit: managed or above bot role)';
    else if (args.apply) action = 'FIXING → mentionable=false';
    console.log(`  [${role.id}] @${role.name} — ${action}`);
    if (args.apply && !keep && editable) {
      await role.setMentionable(false, 'Mention audit: restrict mass role pings');
    }
  }

  console.log('\n=== Roles holding "Mention @everyone, @here, and All Roles" ===');
  console.log('    (this permission BYPASSES the mentionable toggle on every role)');
  const dangerousRoles = guild.roles.cache
    .filter((r) => r.permissions.has(MENTION_EVERYONE) && !r.permissions.has(PermissionsBitField.Flags.Administrator))
    .sort((a, b) => b.position - a.position);
  const adminRoles = guild.roles.cache.filter((r) => r.permissions.has(PermissionsBitField.Flags.Administrator));
  for (const role of adminRoles.values()) {
    console.log(`  [${role.id}] @${role.name} — has Administrator (implies it; review membership manually)`);
  }
  if (dangerousRoles.size === 0) {
    console.log('  (none besides Administrator roles)');
  }
  for (const role of dangerousRoles.values()) {
    const keep = args.keepMentionEveryone.has(role.id);
    const editable = canEditRole(guild, role);
    let action = 'REPORT ONLY (dry-run)';
    if (keep) action = 'KEEP (allow-listed)';
    else if (args.apply && !editable) action = 'SKIP (bot cannot edit: managed or above bot role)';
    else if (args.apply) action = 'FIXING → removing MentionEveryone';
    const isEveryone = role.id === guild.id ? ' ← @everyone base role!' : '';
    console.log(`  [${role.id}] @${role.name}${isEveryone} — ${action}`);
    if (args.apply && !keep && editable) {
      await role.setPermissions(
        role.permissions.remove(MENTION_EVERYONE),
        'Mention audit: remove mass-mention permission',
      );
    }
  }
}

async function auditChannelOverwrites(guild: Guild, args: Args): Promise<void> {
  console.log('\n=== Channel overwrites granting MentionEveryone ===');
  const channels = await guild.channels.fetch();
  let found = 0;
  for (const channel of channels.values()) {
    if (!channel || !('permissionOverwrites' in channel)) continue;
    for (const overwrite of channel.permissionOverwrites.cache.values()) {
      if (!overwrite.allow.has(MENTION_EVERYONE)) continue;
      found += 1;
      const keep = args.keepMentionEveryone.has(overwrite.id);
      const target = guild.roles.cache.get(overwrite.id)?.name ?? overwrite.id;
      const action = keep
        ? 'KEEP (allow-listed)'
        : args.apply
          ? 'FIXING → clearing MentionEveryone allow'
          : 'REPORT ONLY (dry-run)';
      console.log(`  #${channel.name} → ${target} — ${action}`);
      if (args.apply && !keep) {
        await overwrite.edit(
          { MentionEveryone: null },
          'Mention audit: remove per-channel mass-mention grant',
        );
      }
    }
  }
  if (found === 0) console.log('  (none)');
}

async function setupAutomod(guild: Guild, args: Args): Promise<void> {
  console.log('\n=== Native AutoMod mention-spam rule ===');
  const rules = await guild.autoModerationRules.fetch();
  const existing = rules.find((r) => r.triggerType === AutoModerationRuleTriggerType.MentionSpam);
  if (existing) {
    console.log(
      `  Rule already exists: "${existing.name}" (enabled=${existing.enabled}, ` +
        `limit=${existing.triggerMetadata.mentionTotalLimit}, ` +
        `raidProtection=${existing.triggerMetadata.mentionRaidProtectionEnabled}) — leaving as-is.`,
    );
    return;
  }

  const actions = [
    { type: AutoModerationActionType.BlockMessage },
    {
      type: AutoModerationActionType.Timeout,
      metadata: { durationSeconds: args.automodTimeoutMinutes * 60 },
    },
  ];
  if (args.automodAlertChannel) {
    actions.push({
      type: AutoModerationActionType.SendAlertMessage,
      metadata: { channel: args.automodAlertChannel },
    } as never);
  }

  const rule = await guild.autoModerationRules.create({
    name: 'Block mention spam (mass role/user pings)',
    eventType: AutoModerationRuleEventType.MessageSend,
    triggerType: AutoModerationRuleTriggerType.MentionSpam,
    triggerMetadata: {
      mentionTotalLimit: args.automodLimit,
      mentionRaidProtectionEnabled: true,
    },
    actions,
    enabled: true,
    reason: 'Mention audit: server-side mass-mention blocking',
  });
  console.log(
    `  Created rule "${rule.name}": >${args.automodLimit} mentions → block + ` +
      `${args.automodTimeoutMinutes}m timeout, mention raid protection ON.`,
  );
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
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

    console.log(`Auditing guild: ${guild.name} (${guild.id})`);
    console.log(args.apply ? 'MODE: APPLY — making changes' : 'MODE: dry-run — report only');

    await auditRoles(guild, args);
    await auditChannelOverwrites(guild, args);
    if (args.setupAutomod) {
      await setupAutomod(guild, args);
    }

    if (!args.apply) {
      console.log(
        '\nDry-run complete. Re-run with --apply (plus --keep-mentionable / ' +
          '--keep-mention-everyone allow-lists) to fix.',
      );
    } else {
      console.log('\nApply complete.');
    }
  } finally {
    await client.destroy();
  }
}

void main();
