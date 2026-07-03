import { PermissionsBitField, type Guild } from 'discord.js';
import { canEditRole, fetchAllNonThreadChannels, hasOverwrites } from './discordHelpers';
import type { MentionApplyResult, MentionAuditOptions, MentionAuditReport, MentionFinding } from './types';

const MENTION_EVERYONE = PermissionsBitField.Flags.MentionEveryone;
const REASON_MENTIONABLE = 'Mention audit: restrict mass role pings';
const REASON_ROLE_PERM = 'Mention audit: remove mass-mention permission';
const REASON_OVERWRITE = 'Mention audit: remove per-channel mass-mention grant';

/**
 * Audits the two mechanisms that let members mass-ping roles:
 *   1. role.mentionable — "Allow anyone to @mention this role"
 *   2. The MentionEveryone permission on roles and channel overwrites, which
 *      bypasses the mentionable toggle entirely.
 * Read-only — safe for the weaker staff-only "audit" gate.
 */
export async function auditMentions(guild: Guild, options: MentionAuditOptions): Promise<MentionAuditReport> {
  const findings: MentionFinding[] = [];

  const mentionableRoles = guild.roles.cache.filter((r) => r.mentionable);
  for (const role of mentionableRoles.values()) {
    findings.push({
      kind: 'role_mentionable',
      roleId: role.id,
      roleName: role.name,
      editable: canEditRole(guild, role),
    });
  }

  const adminRoles = guild.roles.cache.filter((r) => r.permissions.has(PermissionsBitField.Flags.Administrator));
  const dangerousRoles = guild.roles.cache.filter(
    (r) => r.permissions.has(MENTION_EVERYONE) && !r.permissions.has(PermissionsBitField.Flags.Administrator),
  );
  for (const role of dangerousRoles.values()) {
    findings.push({
      kind: 'role_mention_everyone',
      roleId: role.id,
      roleName: role.name,
      isEveryoneRole: role.id === guild.id,
      editable: canEditRole(guild, role),
    });
  }

  const channels = await fetchAllNonThreadChannels(guild);
  for (const channel of channels.values()) {
    if (!hasOverwrites(channel)) continue;
    for (const overwrite of channel.permissionOverwrites.cache.values()) {
      if (!overwrite.allow.has(MENTION_EVERYONE)) continue;
      const target = guild.roles.cache.get(overwrite.id);
      findings.push({
        kind: 'overwrite_mention_everyone',
        channelId: channel.id,
        channelName: channel.name,
        targetId: overwrite.id,
        targetName: target?.name ?? overwrite.id,
      });
    }
  }

  return {
    adminRoleIds: adminRoles.map((r) => ({ roleId: r.id, roleName: r.name })),
    findings,
  };
}

export async function applyMentionFixes(
  guild: Guild,
  report: MentionAuditReport,
  options: MentionAuditOptions,
): Promise<MentionApplyResult> {
  const result: MentionApplyResult = {
    fixedMentionableRoleIds: [],
    fixedMentionEveryoneRoleIds: [],
    fixedOverwrites: [],
    skipped: [],
  };

  for (const finding of report.findings) {
    if (finding.kind === 'role_mentionable') {
      if (options.keepMentionableRoleIds.has(finding.roleId)) continue;
      if (!finding.editable) {
        result.skipped.push({ id: finding.roleId, scope: 'role', reason: 'bot cannot edit this role' });
        continue;
      }
      const role = guild.roles.cache.get(finding.roleId);
      if (!role) continue;
      await role.setMentionable(false, REASON_MENTIONABLE);
      result.fixedMentionableRoleIds.push(finding.roleId);
    } else if (finding.kind === 'role_mention_everyone') {
      if (options.keepMentionEveryoneIds.has(finding.roleId)) continue;
      if (!finding.editable) {
        result.skipped.push({ id: finding.roleId, scope: 'role', reason: 'bot cannot edit this role' });
        continue;
      }
      const role = guild.roles.cache.get(finding.roleId);
      if (!role) continue;
      await role.setPermissions(role.permissions.remove(MENTION_EVERYONE), REASON_ROLE_PERM);
      result.fixedMentionEveryoneRoleIds.push(finding.roleId);
    } else if (finding.kind === 'overwrite_mention_everyone') {
      if (options.keepMentionEveryoneIds.has(finding.targetId)) continue;
      const channel = await guild.channels.fetch(finding.channelId).catch(() => null);
      if (!channel || !hasOverwrites(channel)) continue;
      const overwrite = channel.permissionOverwrites.cache.get(finding.targetId);
      if (!overwrite) continue;
      await overwrite.edit({ MentionEveryone: null }, REASON_OVERWRITE);
      result.fixedOverwrites.push({ channelId: finding.channelId, targetId: finding.targetId });
    }
  }

  return result;
}
