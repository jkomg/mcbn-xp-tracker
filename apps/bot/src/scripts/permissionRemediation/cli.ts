/**
 * permissionRemediation/cli.ts
 *
 * Unified, reversible audit/fix tool for Discord server permission hygiene:
 * role mentionability + MentionEveryone, channel-overwrite redundancy and
 * orphaned targets, and a report-only channel-visibility check. Every
 * --apply run snapshots full role+channel state to disk BEFORE mutating
 * anything, so a bad fix is always undoable with --restore.
 *
 * Usage (from apps/bot/):
 *   npm run ops:permissions                              # dry-run report only
 *   npm run ops:permissions -- --apply                   # fix everything not allow-listed (snapshots first)
 *   npm run ops:permissions -- --restore <snapshot.json>  # undo an apply run
 *   npm run ops:permissions -- --list-snapshots           # show recent snapshots
 *   npm run ops:permissions -- --full-matrix              # dry-run with the complete role×channel visibility dump
 *   npm run ops:permissions -- --setup-automod            # create the native AutoMod mention-spam rule
 *
 * Flags:
 *   --apply                          Snapshot then apply mention + overwrite fixes.
 *   --keep-mentionable <ids>          Comma-separated role IDs to leave mentionable.
 *   --keep-mention-everyone <ids>     Comma-separated role/overwrite-target IDs to leave holding MentionEveryone.
 *   --keep-overwrite-targets <ids>    Comma-separated role/member IDs whose overwrites should never be auto-removed.
 *   --members                         Include member-type overwrites in the redundancy scan.
 *   --zero                            Also flag no-op (allow=0,deny=0) overwrites as redundant.
 *   --restore <path>                  Restore role+channel state from a snapshot file.
 *   --list-snapshots                  List recent snapshots.
 *   --full-matrix                     Include the full role×channel visibility table (dry-run only).
 *   --setup-automod                   Create Discord's native AutoMod mention-spam rule if missing.
 *   --automod-limit <n>                (default 5)
 *   --automod-timeout-minutes <n>      (default 10)
 *   --automod-alert-channel <id>
 *
 * Required env vars (in apps/bot/.env):
 *   BOT_TOKEN          Discord bot token (Manage Roles + Manage Channels for apply/restore;
 *                      Manage Server for --setup-automod)
 *   DISCORD_GUILD_ID   Target server ID (falls back to TEST_GUILD_ID)
 *
 * Optional env vars:
 *   VERIFIED_MEMBER_ROLE_ID, HONEYPOT_CHANNEL_ID, HONEYPOT_MOD_LOG_CHANNEL_ID,
 *   MENTION_BREAKER_MOD_LOG_CHANNEL_ID, PERMISSION_SNAPSHOT_DIR
 */

import path from 'node:path';
import * as dotenv from 'dotenv';
import { Client, GatewayIntentBits } from 'discord.js';
import { ensureMentionSpamAutomodRule } from './automod';
import {
  formatApplyResult,
  formatCombinedAudit,
  formatRestoreResult,
} from './reportFormat';
import { runApply, runAudit } from './runAll';
import { defaultSnapshotDir, listSnapshots, readSnapshot, restoreSnapshot } from './snapshot';
import type { CombinedAuditOptions } from './types';

dotenv.config({ path: path.resolve(__dirname, '..', '..', '..', '.env') });

function parseCsv(value: string): Set<string> {
  return new Set(value.split(',').map((s) => s.trim()).filter(Boolean));
}

type Args = {
  apply: boolean;
  restore: string | null;
  listSnapshots: boolean;
  fullMatrix: boolean;
  setupAutomod: boolean;
  keepMentionable: Set<string>;
  keepMentionEveryone: Set<string>;
  keepOverwriteTargets: Set<string>;
  includeMembers: boolean;
  includeZero: boolean;
  automodLimit: number;
  automodTimeoutMinutes: number;
  automodAlertChannel: string;
};

function parseArgs(argv: string[]): Args {
  const args: Args = {
    apply: false,
    restore: null,
    listSnapshots: false,
    fullMatrix: false,
    setupAutomod: false,
    keepMentionable: new Set(),
    keepMentionEveryone: new Set(),
    keepOverwriteTargets: new Set(),
    includeMembers: false,
    includeZero: false,
    automodLimit: 5,
    automodTimeoutMinutes: 10,
    automodAlertChannel: '',
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => argv[++i] ?? '';
    if (arg === '--apply') args.apply = true;
    else if (arg === '--restore') args.restore = next();
    else if (arg === '--list-snapshots') args.listSnapshots = true;
    else if (arg === '--full-matrix') args.fullMatrix = true;
    else if (arg === '--setup-automod') args.setupAutomod = true;
    else if (arg === '--keep-mentionable') args.keepMentionable = parseCsv(next());
    else if (arg === '--keep-mention-everyone') args.keepMentionEveryone = parseCsv(next());
    else if (arg === '--keep-overwrite-targets') args.keepOverwriteTargets = parseCsv(next());
    else if (arg === '--members') args.includeMembers = true;
    else if (arg === '--zero') args.includeZero = true;
    else if (arg === '--automod-limit') args.automodLimit = Number.parseInt(next(), 10) || 5;
    else if (arg === '--automod-timeout-minutes') args.automodTimeoutMinutes = Number.parseInt(next(), 10) || 10;
    else if (arg === '--automod-alert-channel') args.automodAlertChannel = next();
  }
  return args;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const token = process.env.BOT_TOKEN;
  const guildId = process.env.DISCORD_GUILD_ID || process.env.TEST_GUILD_ID;
  const snapshotDir = process.env.PERMISSION_SNAPSHOT_DIR || defaultSnapshotDir();

  if (args.listSnapshots) {
    const metas = await listSnapshots(snapshotDir, 10);
    if (metas.length === 0) {
      console.log(`No snapshots found in ${snapshotDir}`);
      return;
    }
    console.log(`Recent snapshots in ${snapshotDir}:\n`);
    for (const meta of metas) {
      const who = meta.triggeredBy.discordTag ?? meta.triggeredBy.source;
      console.log(
        `  ${meta.fileName}  ${meta.createdAt}  by ${who}  ` +
          `(${meta.summary.rolesCaptured} roles, ${meta.summary.channelsCaptured} channels, ${meta.summary.overwritesCaptured} overwrites)`,
      );
    }
    return;
  }

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

    if (args.restore) {
      const snapshot = await readSnapshot(args.restore);
      console.log(`Restoring snapshot from ${args.restore} (captured ${snapshot.createdAt})...\n`);
      const result = await restoreSnapshot(guild, snapshot);
      console.log(formatRestoreResult(result).join('\n'));
      return;
    }

    const auditOptions: CombinedAuditOptions = {
      mention: { keepMentionableRoleIds: args.keepMentionable, keepMentionEveryoneIds: args.keepMentionEveryone },
      overwriteAudit: { includeMembers: args.includeMembers, includeZero: args.includeZero },
      visibility: {
        verifiedMemberRoleId: process.env.VERIFIED_MEMBER_ROLE_ID,
        honeypotChannelId: process.env.HONEYPOT_CHANNEL_ID,
        modLogChannelIds: [process.env.HONEYPOT_MOD_LOG_CHANNEL_ID, process.env.MENTION_BREAKER_MOD_LOG_CHANNEL_ID].filter(
          (v): v is string => Boolean(v),
        ),
      },
    };

    if (args.apply) {
      console.log('MODE: APPLY — snapshotting current state, then fixing mentions + overwrites\n');
      const result = await runApply(guild, {
        ...auditOptions,
        overwrite: { keepTargetIds: args.keepOverwriteTargets },
        triggeredBy: { discordUserId: null, discordTag: null, source: 'cli' },
        snapshotDir,
      });
      console.log(formatApplyResult(result).join('\n'));
      console.log(`\nTo undo everything: npm run ops:permissions -- --restore ${result.snapshotPath}`);
    } else {
      console.log('MODE: dry-run — no changes will be made\n');
      const report = await runAudit(guild, auditOptions);
      console.log(formatCombinedAudit(report, { fullMatrix: args.fullMatrix }).join('\n'));
      console.log('\nRe-run with --apply to fix (snapshots first, restore anytime with --restore).');
    }

    if (args.setupAutomod) {
      const result = await ensureMentionSpamAutomodRule(guild, {
        limit: args.automodLimit,
        timeoutMinutes: args.automodTimeoutMinutes,
        alertChannelId: args.automodAlertChannel || undefined,
      });
      console.log(
        result.created
          ? `\nCreated AutoMod rule "${result.rule.name}".`
          : `\nAutoMod mention-spam rule already exists: "${result.rule.name}" — left as-is.`,
      );
    }
  } finally {
    await client.destroy();
  }
}

void main();
