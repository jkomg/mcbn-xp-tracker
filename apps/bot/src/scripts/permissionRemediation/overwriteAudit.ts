import { ChannelType, type Guild } from 'discord.js';
import { fetchAllNonThreadChannels, forEachRateLimited, hasOverwrites, overwriteToSnapshotEntry } from './discordHelpers';
import type {
  OverwriteApplyOptions,
  OverwriteApplyResult,
  OverwriteAuditOptions,
  OverwriteAuditReport,
  OverwriteFinding,
  OverwriteSnapshotEntry,
} from './types';

function overwriteKey(id: string, type: number): string {
  return `${id}:${type}`;
}

function overwriteMatches(a: OverwriteSnapshotEntry, b: OverwriteSnapshotEntry): boolean {
  return a.allow === b.allow && a.deny === b.deny;
}

function isNoop(ow: OverwriteSnapshotEntry): boolean {
  return ow.allow === '0' && ow.deny === '0';
}

/**
 * Audits channel overwrite hygiene: overwrites redundant with their parent
 * category (inheritance already applies them, so removing them is a no-op
 * for effective permissions — ported from scripts/fix-discord-overwrites.py),
 * and overwrites that reference a role/member that no longer exists in the
 * guild (provably dead regardless of the redundancy heuristic). Read-only.
 */
export async function auditOverwrites(guild: Guild, options: OverwriteAuditOptions): Promise<OverwriteAuditReport> {
  const channels = await fetchAllNonThreadChannels(guild);
  const allChannels = [...channels.values()].filter(hasOverwrites);

  const categoryOverwrites = new Map<string, Map<string, OverwriteSnapshotEntry>>();
  for (const channel of allChannels) {
    if (channel.type !== ChannelType.GuildCategory) continue;
    const index = new Map<string, OverwriteSnapshotEntry>();
    for (const ow of channel.permissionOverwrites.cache.values()) {
      const entry = overwriteToSnapshotEntry(ow);
      index.set(overwriteKey(entry.id, entry.type), entry);
    }
    categoryOverwrites.set(channel.id, index);
  }

  const findings: OverwriteFinding[] = [];
  let totalOverwritesScanned = 0;
  const memberOverwriteRefs = new Map<
    string,
    Array<{ channelId: string; channelName: string; allow: string; deny: string }>
  >();

  for (const channel of allChannels) {
    const parentId = 'parentId' in channel ? (channel.parentId ?? null) : null;
    const isCategory = channel.type === ChannelType.GuildCategory;
    const categoryIndex = parentId ? categoryOverwrites.get(parentId) : undefined;

    for (const ow of channel.permissionOverwrites.cache.values()) {
      totalOverwritesScanned += 1;
      const entry = overwriteToSnapshotEntry(ow);

      if (entry.type === 0) {
        if (!guild.roles.cache.has(entry.id)) {
          findings.push({
            kind: 'orphaned_target',
            channelId: channel.id,
            channelName: channel.name,
            targetId: entry.id,
            targetType: 0,
            allow: entry.allow,
            deny: entry.deny,
            reason: 'role_not_found',
          });
          continue; // don't also evaluate a dead target against the category heuristic
        }
      } else {
        const refs = memberOverwriteRefs.get(entry.id) ?? [];
        refs.push({ channelId: channel.id, channelName: channel.name, allow: entry.allow, deny: entry.deny });
        memberOverwriteRefs.set(entry.id, refs);
      }

      if (isCategory || !categoryIndex || !parentId) continue;
      if (entry.type === 1 && !options.includeMembers) continue;

      const categoryEntry = categoryIndex.get(overwriteKey(entry.id, entry.type));
      if (categoryEntry && overwriteMatches(entry, categoryEntry)) {
        findings.push({
          kind: 'redundant_vs_category',
          channelId: channel.id,
          channelName: channel.name,
          parentId,
          targetId: entry.id,
          targetType: entry.type,
          allow: entry.allow,
          deny: entry.deny,
          reason: 'matches_category',
        });
      } else if (options.includeZero && isNoop(entry)) {
        findings.push({
          kind: 'redundant_vs_category',
          channelId: channel.id,
          channelName: channel.name,
          parentId,
          targetId: entry.id,
          targetType: entry.type,
          allow: entry.allow,
          deny: entry.deny,
          reason: 'no_op',
        });
      }
    }
  }

  // Deduped member-overwrite orphan check — one fetch per unique member ID, rate-limited.
  await forEachRateLimited([...memberOverwriteRefs.entries()], async ([memberId, refs]) => {
    const member = await guild.members.fetch(memberId).catch(() => null);
    if (member) return;
    for (const ref of refs) {
      findings.push({
        kind: 'orphaned_target',
        channelId: ref.channelId,
        channelName: ref.channelName,
        targetId: memberId,
        targetType: 1,
        allow: ref.allow,
        deny: ref.deny,
        reason: 'member_not_found',
      });
    }
  });

  return { findings, totalOverwritesScanned };
}

export async function applyOverwriteFixes(
  guild: Guild,
  report: OverwriteAuditReport,
  options: OverwriteApplyOptions,
): Promise<OverwriteApplyResult> {
  const result: OverwriteApplyResult = { removedByChannel: [], errors: [] };

  const byChannel = new Map<string, { channelName: string; findings: OverwriteFinding[] }>();
  for (const finding of report.findings) {
    if (options.keepTargetIds.has(finding.targetId)) continue;
    const entry = byChannel.get(finding.channelId) ?? { channelName: finding.channelName, findings: [] };
    entry.findings.push(finding);
    byChannel.set(finding.channelId, entry);
  }

  await forEachRateLimited([...byChannel.entries()], async ([channelId, { channelName, findings }]) => {
    const channel = await guild.channels.fetch(channelId).catch(() => null);
    if (!channel || !hasOverwrites(channel)) {
      result.errors.push({ channelId, error: 'channel no longer exists or has no overwrites' });
      return;
    }
    const removedTargetIds: string[] = [];
    for (const finding of findings) {
      try {
        await channel.permissionOverwrites.delete(
          finding.targetId,
          `Permission remediation: ${finding.kind === 'orphaned_target' ? finding.reason : finding.reason}`,
        );
        removedTargetIds.push(finding.targetId);
      } catch (error) {
        result.errors.push({
          channelId,
          error: `${finding.targetId}: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    }
    if (removedTargetIds.length > 0) {
      result.removedByChannel.push({ channelId, channelName, removedTargetIds });
    }
  });

  return result;
}
