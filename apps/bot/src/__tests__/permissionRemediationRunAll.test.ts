import { describe, expect, it, vi } from 'vitest';
import { runApply, runAudit } from '../scripts/permissionRemediation/runAll';

const {
  applyMentionFixes,
  auditMentions,
  applyOverwriteFixes,
  auditOverwrites,
  auditVisibility,
  captureSnapshot,
  writeSnapshot,
} = vi.hoisted(() => ({
  applyMentionFixes: vi.fn(),
  auditMentions: vi.fn().mockResolvedValue({ adminRoleIds: [], findings: [] }),
  applyOverwriteFixes: vi.fn(),
  auditOverwrites: vi.fn().mockResolvedValue({ findings: [], totalOverwritesScanned: 0 }),
  auditVisibility: vi.fn().mockResolvedValue({ rows: [], assertions: [] }),
  captureSnapshot: vi.fn().mockResolvedValue({ schemaVersion: 1 }),
  writeSnapshot: vi.fn(),
}));

vi.mock('../scripts/permissionRemediation/mentionAudit', () => ({ applyMentionFixes, auditMentions }));
vi.mock('../scripts/permissionRemediation/overwriteAudit', () => ({ applyOverwriteFixes, auditOverwrites }));
vi.mock('../scripts/permissionRemediation/visibilityAudit', () => ({ auditVisibility }));
vi.mock('../scripts/permissionRemediation/snapshot', () => ({ captureSnapshot, writeSnapshot }));

const baseOptions = {
  mention: { keepMentionableRoleIds: new Set<string>(), keepMentionEveryoneIds: new Set<string>() },
  overwriteAudit: { includeMembers: false, includeZero: false },
  overwrite: { keepTargetIds: new Set<string>() },
  visibility: { modLogChannelIds: [] },
  triggeredBy: { discordUserId: null, discordTag: null, source: 'cli' as const },
};

describe('permissionRemediation/runAll', () => {
  it('runAudit combines all three audits without mutating anything', async () => {
    await runAudit({} as never, baseOptions);
    expect(auditMentions).toHaveBeenCalled();
    expect(auditOverwrites).toHaveBeenCalled();
    expect(auditVisibility).toHaveBeenCalled();
    expect(applyMentionFixes).not.toHaveBeenCalled();
    expect(applyOverwriteFixes).not.toHaveBeenCalled();
  });

  it('runApply applies fixes after a successful snapshot write', async () => {
    writeSnapshot.mockResolvedValueOnce('/tmp/snapshot-1.json');
    applyMentionFixes.mockResolvedValueOnce({
      fixedMentionableRoleIds: [],
      fixedMentionEveryoneRoleIds: [],
      fixedOverwrites: [],
      skipped: [],
    });
    applyOverwriteFixes.mockResolvedValueOnce({ removedByChannel: [], errors: [] });

    const result = await runApply({} as never, baseOptions);

    expect(captureSnapshot).toHaveBeenCalled();
    expect(writeSnapshot).toHaveBeenCalled();
    expect(applyMentionFixes).toHaveBeenCalled();
    expect(applyOverwriteFixes).toHaveBeenCalled();
    expect(result.snapshotPath).toBe('/tmp/snapshot-1.json');
  });

  it('aborts before any mutation if the snapshot write fails', async () => {
    writeSnapshot.mockReset();
    applyMentionFixes.mockClear();
    applyOverwriteFixes.mockClear();
    writeSnapshot.mockRejectedValueOnce(new Error('disk full'));

    await expect(runApply({} as never, baseOptions)).rejects.toThrow('disk full');

    expect(applyMentionFixes).not.toHaveBeenCalled();
    expect(applyOverwriteFixes).not.toHaveBeenCalled();
  });
});
