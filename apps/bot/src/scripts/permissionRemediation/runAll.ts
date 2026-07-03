import type { Guild } from 'discord.js';
import { applyMentionFixes, auditMentions } from './mentionAudit';
import { applyOverwriteFixes, auditOverwrites } from './overwriteAudit';
import { captureSnapshot, writeSnapshot } from './snapshot';
import { auditVisibility } from './visibilityAudit';
import type { CombinedApplyOptions, CombinedApplyResult, CombinedAuditOptions, CombinedAuditReport } from './types';

/** Read-only combined audit — used both by the `audit` command and as the preview step of `apply`. */
export async function runAudit(guild: Guild, options: CombinedAuditOptions): Promise<CombinedAuditReport> {
  const [mention, overwrite, visibility] = await Promise.all([
    auditMentions(guild, options.mention),
    auditOverwrites(guild, options.overwriteAudit),
    auditVisibility(guild, options.visibility),
  ]);
  return { mention, overwrite, visibility };
}

/**
 * Snapshots full role+channel state, writes it to disk, and ONLY THEN applies
 * mention and overwrite fixes. If the snapshot write fails, this throws
 * before any mutation happens — an apply run must never leave a change with
 * no corresponding rollback path.
 */
export async function runApply(guild: Guild, options: CombinedApplyOptions): Promise<CombinedApplyResult> {
  const mentionReport = await auditMentions(guild, options.mention);
  const overwriteReport = await auditOverwrites(guild, options.overwriteAudit);

  const snapshot = await captureSnapshot(guild, {
    modulesRun: ['mention', 'overwrite'],
    triggeredBy: options.triggeredBy,
  });
  const snapshotPath = await writeSnapshot(snapshot, options.snapshotDir);

  const mentionResult = await applyMentionFixes(guild, mentionReport, options.mention);
  const overwriteResult = await applyOverwriteFixes(guild, overwriteReport, options.overwrite);

  return { snapshotPath, mention: mentionResult, overwrite: overwriteResult };
}
