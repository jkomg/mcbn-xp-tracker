import type {
  CombinedApplyResult,
  CombinedAuditReport,
  MentionAuditReport,
  OverwriteAuditReport,
  RestoreResult,
  VisibilityAuditReport,
} from './types';

export function formatMentionAudit(report: MentionAuditReport): string[] {
  const lines: string[] = [];
  const mentionable = report.findings.filter((f) => f.kind === 'role_mentionable');
  const dangerous = report.findings.filter((f) => f.kind === 'role_mention_everyone');
  const overwrites = report.findings.filter((f) => f.kind === 'overwrite_mention_everyone');

  lines.push(`Mentionable roles: ${mentionable.length}`);
  for (const f of mentionable) {
    if (f.kind !== 'role_mentionable') continue;
    lines.push(`  [${f.roleId}] @${f.roleName}${f.editable ? '' : ' (bot cannot edit)'}`);
  }
  lines.push(`Roles holding MentionEveryone (excl. Administrator): ${dangerous.length}`);
  for (const f of dangerous) {
    if (f.kind !== 'role_mention_everyone') continue;
    lines.push(`  [${f.roleId}] @${f.roleName}${f.isEveryoneRole ? ' ← @everyone base role!' : ''}${f.editable ? '' : ' (bot cannot edit)'}`);
  }
  lines.push(`Channel overwrites granting MentionEveryone: ${overwrites.length}`);
  for (const f of overwrites) {
    if (f.kind !== 'overwrite_mention_everyone') continue;
    lines.push(`  #${f.channelName} → ${f.targetName}`);
  }
  if (report.adminRoleIds.length > 0) {
    lines.push(`Administrator roles (review membership manually, never auto-fixed): ${report.adminRoleIds.map((r) => `@${r.roleName}`).join(', ')}`);
  }
  return lines;
}

export function formatOverwriteAudit(report: OverwriteAuditReport): string[] {
  const lines: string[] = [];
  const redundant = report.findings.filter((f) => f.kind === 'redundant_vs_category');
  const orphaned = report.findings.filter((f) => f.kind === 'orphaned_target');

  lines.push(`Overwrites scanned: ${report.totalOverwritesScanned}`);
  lines.push(`Redundant (matches parent category / no-op): ${redundant.length}`);
  for (const f of redundant) {
    if (f.kind !== 'redundant_vs_category') continue;
    lines.push(`  #${f.channelName} → ${f.targetId} (${f.reason})`);
  }
  lines.push(`Orphaned (target no longer exists): ${orphaned.length}`);
  for (const f of orphaned) {
    if (f.kind !== 'orphaned_target') continue;
    lines.push(`  #${f.channelName} → ${f.targetId} (${f.reason})`);
  }
  return lines;
}

/** Failures/anomalies only by default; pass fullMatrix for the complete role×channel dump (CLI deep-dive). */
export function formatVisibilityAudit(report: VisibilityAuditReport, { fullMatrix = false } = {}): string[] {
  const lines: string[] = [];
  const failed = report.assertions.filter((a) => !a.ok);
  const passed = report.assertions.filter((a) => a.ok);

  if (report.assertions.length === 0) {
    lines.push('No visibility assertions configured (set HONEYPOT_MOD_LOG_CHANNEL_ID / MENTION_BREAKER_MOD_LOG_CHANNEL_ID / VERIFIED_MEMBER_ROLE_ID to enable).');
  } else if (failed.length === 0) {
    lines.push(`All ${passed.length} visibility assertion(s) passed.`);
  } else {
    lines.push(`⚠️ ${failed.length} of ${report.assertions.length} visibility assertion(s) FAILED:`);
    for (const a of failed) {
      lines.push(`  [FAIL] ${a.label}: ${a.detail}`);
    }
  }

  if (fullMatrix) {
    lines.push('', `Full channel visibility matrix (${report.rows.length} channels):`);
    for (const row of report.rows) {
      lines.push(`  #${row.channelName}${row.visibleToEveryone ? ' [visible to @everyone]' : ''} — ${row.visibleRoleIds.length} role(s) can view`);
    }
  }

  return lines;
}

export function formatCombinedAudit(report: CombinedAuditReport, { fullMatrix = false } = {}): string[] {
  return [
    '=== Mentions ===',
    ...formatMentionAudit(report.mention),
    '',
    '=== Channel overwrites ===',
    ...formatOverwriteAudit(report.overwrite),
    '',
    '=== Channel visibility ===',
    ...formatVisibilityAudit(report.visibility, { fullMatrix }),
  ];
}

export function formatApplyResult(result: CombinedApplyResult): string[] {
  return [
    `Snapshot: ${result.snapshotPath}`,
    `Fixed mentionable roles: ${result.mention.fixedMentionableRoleIds.length}`,
    `Fixed MentionEveryone roles: ${result.mention.fixedMentionEveryoneRoleIds.length}`,
    `Fixed MentionEveryone overwrites: ${result.mention.fixedOverwrites.length}`,
    `Removed overwrites (redundant/orphaned): ${result.overwrite.removedByChannel.reduce((n, c) => n + c.removedTargetIds.length, 0)}`,
    ...(result.mention.skipped.length > 0 ? [`Mention fixes skipped: ${result.mention.skipped.length}`] : []),
    ...(result.overwrite.errors.length > 0 ? [`Overwrite fix errors: ${result.overwrite.errors.length}`] : []),
  ];
}

export function formatRestoreResult(result: RestoreResult): string[] {
  return [
    `Roles restored: ${result.rolesRestored.length}`,
    `Roles skipped: ${result.rolesSkipped.length}`,
    ...result.rolesSkipped.map((s) => `  [${s.roleId}] ${s.roleName} — ${s.reason}`),
    `Channels restored: ${result.channelsRestored.length}`,
    `Channels skipped: ${result.channelsSkipped.length}`,
    ...result.channelsSkipped.map((s) => `  [${s.channelId}] ${s.channelName} — ${s.reason}`),
  ];
}
