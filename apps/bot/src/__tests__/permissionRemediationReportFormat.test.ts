import { describe, expect, it } from 'vitest';
import { formatVisibilityAudit } from '../scripts/permissionRemediation/reportFormat';
import type { VisibilityAuditReport } from '../scripts/permissionRemediation/types';

function makeReport(overrides: Partial<VisibilityAuditReport> = {}): VisibilityAuditReport {
  return {
    rows: [],
    assertions: [],
    roleNames: {},
    ...overrides,
  };
}

describe('permissionRemediation/reportFormat formatVisibilityAudit full matrix', () => {
  it('groups channels by category name, sorted alphabetically', () => {
    const report = makeReport({
      rows: [
        {
          channelId: 'c1',
          channelName: 'a-channel',
          parentId: 'cat-z',
          categoryName: 'Zeta',
          visibleRoleIds: [],
          visibleToEveryone: true,
        },
        {
          channelId: 'c2',
          channelName: 'b-channel',
          parentId: 'cat-a',
          categoryName: 'Alpha',
          visibleRoleIds: [],
          visibleToEveryone: true,
        },
      ],
    });

    const lines = formatVisibilityAudit(report, { fullMatrix: true }).join('\n');
    expect(lines.indexOf('-- Alpha --')).toBeLessThan(lines.indexOf('-- Zeta --'));
  });

  it('shows a compact tag for channels visible to @everyone with no role list', () => {
    const report = makeReport({
      rows: [
        {
          channelId: 'c1',
          channelName: 'general',
          parentId: null,
          categoryName: 'Public',
          visibleRoleIds: ['guild-1', 'role-a'],
          visibleToEveryone: true,
        },
      ],
      roleNames: { 'guild-1': '@everyone', 'role-a': 'Storyteller' },
    });

    const lines = formatVisibilityAudit(report, { fullMatrix: true });
    expect(lines).toContain('  #general [visible to @everyone]');
    expect(lines.some((l) => l.includes('Storyteller'))).toBe(false);
  });

  it('lists role names (sorted), not IDs, for restricted channels', () => {
    const report = makeReport({
      rows: [
        {
          channelId: 'c1',
          channelName: 'staff-general',
          parentId: 'cat-1',
          categoryName: 'Staff',
          visibleRoleIds: ['role-mod', 'role-admin'],
          visibleToEveryone: false,
        },
      ],
      roleNames: { 'role-mod': 'Moderator', 'role-admin': 'Administrator' },
    });

    const lines = formatVisibilityAudit(report, { fullMatrix: true });
    expect(lines).toContain('  #staff-general — Administrator, Moderator');
  });

  it('flags a channel with zero visible roles', () => {
    const report = makeReport({
      rows: [
        {
          channelId: 'c1',
          channelName: 'chapters',
          parentId: 'cat-1',
          categoryName: 'Archive',
          visibleRoleIds: [],
          visibleToEveryone: false,
        },
      ],
    });

    const lines = formatVisibilityAudit(report, { fullMatrix: true });
    expect(lines).toContain('  #chapters — (no roles — nobody can see this)');
  });

  it('buckets channels with no category under "(no category)"', () => {
    const report = makeReport({
      rows: [
        {
          channelId: 'c1',
          channelName: 'orphan-channel',
          parentId: null,
          categoryName: null,
          visibleRoleIds: [],
          visibleToEveryone: true,
        },
      ],
    });

    const lines = formatVisibilityAudit(report, { fullMatrix: true });
    expect(lines).toContain('-- (no category) --');
  });

  it('omits the full matrix section when fullMatrix is not requested', () => {
    const report = makeReport({
      rows: [
        {
          channelId: 'c1',
          channelName: 'general',
          parentId: null,
          categoryName: 'Public',
          visibleRoleIds: [],
          visibleToEveryone: true,
        },
      ],
    });

    const lines = formatVisibilityAudit(report).join('\n');
    expect(lines).not.toContain('Full channel visibility matrix');
  });
});
