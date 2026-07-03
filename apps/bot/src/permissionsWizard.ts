import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type StringSelectMenuInteraction,
} from 'discord.js';
import { config } from './config';
import type { CommandContext } from './discord';
import { errorToMessage, logEvent } from './logger';
import { formatApplyResult, formatCombinedAudit, formatRestoreResult } from './scripts/permissionRemediation/reportFormat';
import { runApply, runAudit } from './scripts/permissionRemediation/runAll';
import { defaultSnapshotDir, listSnapshots, readSnapshot, restoreSnapshot } from './scripts/permissionRemediation/snapshot';
import type { CombinedAuditOptions, CombinedAuditReport, SnapshotFileMeta } from './scripts/permissionRemediation/types';

export const PERMISSIONS_APPLY_CONFIRM_ID = 'permissions:apply:confirm';
export const PERMISSIONS_APPLY_CANCEL_ID = 'permissions:apply:cancel';
export const PERMISSIONS_ROLLBACK_SELECT_ID = 'permissions:rollback:select';
export const PERMISSIONS_ROLLBACK_CONFIRM_ID = 'permissions:rollback:confirm';
export const PERMISSIONS_ROLLBACK_CANCEL_ID = 'permissions:rollback:cancel';

// Keyed by confirmation message ID → the audit report previewed to staff.
const pendingApplies = new Map<string, CombinedAuditReport>();
// Keyed by staff user ID → snapshots offered in the rollback select menu.
const pendingSnapshotChoices = new Map<string, SnapshotFileMeta[]>();
// Keyed by staff user ID → the snapshot path chosen for restore.
const pendingRollbacks = new Map<string, string>();

function snapshotDirOrDefault(): string {
  return config.permissionSnapshotDir || defaultSnapshotDir();
}

function buildAuditOptions(): CombinedAuditOptions {
  return {
    mention: { keepMentionableRoleIds: new Set(), keepMentionEveryoneIds: new Set() },
    overwriteAudit: { includeMembers: false, includeZero: false },
    visibility: {
      verifiedMemberRoleId: config.verifiedMemberRoleId,
      honeypotChannelId: config.honeypotChannelId,
      modLogChannelIds: [config.honeypotModLogChannelId, config.mentionBreakerModLogChannelId].filter(Boolean),
    },
  };
}

/** Both the staff allow-list AND the Administrator role — mutating actions get the stricter gate. */
async function isPermissionsAdmin(interaction: { guild: { members: { fetch: (id: string) => Promise<{ roles: { cache: { has(id: string): boolean } } }> } } | null; user: { id: string } }): Promise<boolean> {
  if (!config.testerDiscordIds.has(interaction.user.id)) return false;
  if (!interaction.guild) return false;
  const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  return member ? member.roles.cache.has(config.staffRoleAdministratorId) : false;
}

function buildAuditEmbed(report: CombinedAuditReport): EmbedBuilder {
  const description = formatCombinedAudit(report).join('\n');
  const truncated =
    description.length > 3900
      ? `${description.slice(0, 3900)}\n… (truncated — run \`npm run ops:permissions\` for the full report)`
      : description;
  return new EmbedBuilder()
    .setTitle('🔍 Permission Audit')
    .setColor(0x3498db)
    .setDescription(truncated || 'No findings.')
    .setTimestamp(new Date());
}

export async function startPermissionsAudit(
  interaction: ChatInputCommandInteraction,
  _ctx: CommandContext,
): Promise<void> {
  if (!config.testerDiscordIds.has(interaction.user.id)) {
    await interaction.reply({ content: 'This command is restricted to staff.', ephemeral: true });
    return;
  }
  if (!interaction.guild) {
    await interaction.reply({ content: 'This command must be run in a server.', ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });
  try {
    const report = await runAudit(interaction.guild, buildAuditOptions());
    await interaction.editReply({ embeds: [buildAuditEmbed(report)] });
    logEvent('info', 'permissions_audit_run', {
      staffId: interaction.user.id,
      mentionFindings: report.mention.findings.length,
      overwriteFindings: report.overwrite.findings.length,
      visibilityFailures: report.visibility.assertions.filter((a) => !a.ok).length,
    });
  } catch (error) {
    await interaction.editReply({ content: `Audit failed: ${errorToMessage(error)}` });
    logEvent('error', 'permissions_audit_failed', { staffId: interaction.user.id, error: errorToMessage(error) });
  }
}

export async function startPermissionsApply(
  interaction: ChatInputCommandInteraction,
  _ctx: CommandContext,
): Promise<void> {
  if (!(await isPermissionsAdmin(interaction))) {
    await interaction.reply({
      content: 'This command is restricted to staff holding the Administrator role.',
      ephemeral: true,
    });
    return;
  }
  if (!interaction.guild) {
    await interaction.reply({ content: 'This command must be run in a server.', ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  let report: CombinedAuditReport;
  try {
    report = await runAudit(interaction.guild, buildAuditOptions());
  } catch (error) {
    await interaction.editReply({ content: `Audit failed: ${errorToMessage(error)}` });
    return;
  }

  if (report.mention.findings.length === 0 && report.overwrite.findings.length === 0) {
    await interaction.editReply({ content: 'Nothing to fix — mention and overwrite audits are both clean.' });
    return;
  }

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(PERMISSIONS_APPLY_CONFIRM_ID).setLabel('Apply Fixes').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(PERMISSIONS_APPLY_CANCEL_ID).setLabel('Cancel').setStyle(ButtonStyle.Secondary),
  );
  await interaction.editReply({
    content:
      `⚠️ This will fix **${report.mention.findings.length}** mention issue(s) and ` +
      `**${report.overwrite.findings.length}** overwrite issue(s), after saving a full role+channel ` +
      `snapshot for rollback. Apply?`,
    components: [row],
  });
  const replyMsg = await interaction.fetchReply();
  pendingApplies.set(replyMsg.id, report);
}

export function isPermissionsApplyButton(customId: string): boolean {
  return customId === PERMISSIONS_APPLY_CONFIRM_ID || customId === PERMISSIONS_APPLY_CANCEL_ID;
}

export async function handlePermissionsApplyButton(
  interaction: ButtonInteraction,
  _ctx: CommandContext,
): Promise<boolean> {
  if (!isPermissionsApplyButton(interaction.customId)) return false;

  if (interaction.customId === PERMISSIONS_APPLY_CANCEL_ID) {
    pendingApplies.delete(interaction.message.id);
    await interaction.update({ content: 'Cancelled.', components: [] });
    return true;
  }

  // Re-check on the clicking user, independent of who ran the original command.
  if (!(await isPermissionsAdmin(interaction))) {
    await interaction.reply({
      content: 'This action is restricted to staff holding the Administrator role.',
      ephemeral: true,
    });
    return true;
  }

  const report = pendingApplies.get(interaction.message.id);
  pendingApplies.delete(interaction.message.id);
  if (!report || !interaction.guild) {
    await interaction.update({ content: 'Session expired — run the apply command again.', components: [] });
    return true;
  }

  await interaction.deferUpdate();
  try {
    const result = await runApply(interaction.guild, {
      ...buildAuditOptions(),
      overwrite: { keepTargetIds: new Set() },
      triggeredBy: { discordUserId: interaction.user.id, discordTag: interaction.user.tag, source: 'discord' },
      snapshotDir: snapshotDirOrDefault(),
    });
    await interaction.editReply({
      content: [...formatApplyResult(result), '', 'Run `/lasombra permissions rollback` to undo.'].join('\n'),
      components: [],
    });
    logEvent('info', 'permissions_apply_applied', { staffId: interaction.user.id, snapshotPath: result.snapshotPath });
  } catch (error) {
    await interaction.editReply({ content: `Apply failed: ${errorToMessage(error)}`, components: [] });
    logEvent('error', 'permissions_apply_failed', { staffId: interaction.user.id, error: errorToMessage(error) });
  }
  return true;
}

export async function startPermissionsRollback(
  interaction: ChatInputCommandInteraction,
  _ctx: CommandContext,
): Promise<void> {
  if (!(await isPermissionsAdmin(interaction))) {
    await interaction.reply({
      content: 'This command is restricted to staff holding the Administrator role.',
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });
  const metas = await listSnapshots(snapshotDirOrDefault(), 10);
  if (metas.length === 0) {
    await interaction.editReply({ content: 'No snapshots found.' });
    return;
  }

  pendingSnapshotChoices.set(interaction.user.id, metas);
  const menu = new StringSelectMenuBuilder()
    .setCustomId(PERMISSIONS_ROLLBACK_SELECT_ID)
    .setPlaceholder('Choose a snapshot to restore')
    .addOptions(
      metas.map((meta, index) => ({
        label: `${meta.createdAt} — ${meta.triggeredBy.discordTag ?? meta.triggeredBy.source}`.slice(0, 100),
        description:
          `${meta.summary.rolesCaptured} roles, ${meta.summary.channelsCaptured} channels, ` +
          `${meta.summary.overwritesCaptured} overwrites`.slice(0, 100),
        value: String(index),
      })),
    );
  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
  await interaction.editReply({ content: 'Choose a snapshot to restore:', components: [row] });
}

export function isPermissionsRollbackSelect(customId: string): boolean {
  return customId === PERMISSIONS_ROLLBACK_SELECT_ID;
}

export async function handlePermissionsRollbackSelect(
  interaction: StringSelectMenuInteraction,
  _ctx: CommandContext,
): Promise<boolean> {
  if (!isPermissionsRollbackSelect(interaction.customId)) return false;

  const metas = pendingSnapshotChoices.get(interaction.user.id);
  const chosenIndex = Number.parseInt(interaction.values[0] ?? '', 10);
  const meta = metas?.[chosenIndex];
  if (!meta) {
    await interaction.update({
      content: 'Session expired — run `/lasombra permissions rollback` again.',
      components: [],
    });
    return true;
  }

  pendingRollbacks.set(interaction.user.id, meta.path);
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(PERMISSIONS_ROLLBACK_CONFIRM_ID)
      .setLabel('Confirm Restore')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(PERMISSIONS_ROLLBACK_CANCEL_ID).setLabel('Cancel').setStyle(ButtonStyle.Secondary),
  );
  await interaction.update({
    content: `⚠️ Restore snapshot from **${meta.createdAt}**? This overwrites current role/channel permission state.`,
    components: [row],
  });
  return true;
}

export function isPermissionsRollbackButton(customId: string): boolean {
  return customId === PERMISSIONS_ROLLBACK_CONFIRM_ID || customId === PERMISSIONS_ROLLBACK_CANCEL_ID;
}

export async function handlePermissionsRollbackButton(
  interaction: ButtonInteraction,
  _ctx: CommandContext,
): Promise<boolean> {
  if (!isPermissionsRollbackButton(interaction.customId)) return false;

  if (interaction.customId === PERMISSIONS_ROLLBACK_CANCEL_ID) {
    pendingRollbacks.delete(interaction.user.id);
    await interaction.update({ content: 'Rollback cancelled.', components: [] });
    return true;
  }

  if (!(await isPermissionsAdmin(interaction))) {
    await interaction.reply({
      content: 'This action is restricted to staff holding the Administrator role.',
      ephemeral: true,
    });
    return true;
  }

  const chosenPath = pendingRollbacks.get(interaction.user.id);
  pendingRollbacks.delete(interaction.user.id);
  if (!chosenPath || !interaction.guild) {
    await interaction.update({
      content: 'Session expired — run `/lasombra permissions rollback` again.',
      components: [],
    });
    return true;
  }

  await interaction.deferUpdate();
  try {
    const snapshot = await readSnapshot(chosenPath);
    const result = await restoreSnapshot(interaction.guild, snapshot);
    await interaction.editReply({ content: formatRestoreResult(result).join('\n'), components: [] });
    logEvent('info', 'permissions_rollback_applied', { staffId: interaction.user.id, snapshotPath: chosenPath });
  } catch (error) {
    await interaction.editReply({ content: `Restore failed: ${errorToMessage(error)}`, components: [] });
    logEvent('error', 'permissions_rollback_failed', { staffId: interaction.user.id, error: errorToMessage(error) });
  }
  return true;
}
