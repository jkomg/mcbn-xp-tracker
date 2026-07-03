import { describe, expect, it } from 'vitest';
import { formatVisibilityAudit } from '../scripts/permissionRemediation/reportFormat';
import type { ChannelVisibilityRow, VisibilityAuditReport } from '../scripts/permissionRemediation/types';

function makeReport(overrides: Partial<VisibilityAuditReport> = {}): VisibilityAuditReport {
  return {
    rows: [],
    assertions: [],
    roleNames: {},
    ...overrides,
  };
}

/** Defaults sendable = visible, matching the common case where anyone who can view can also post. */
function makeRow(overrides: Partial<ChannelVisibilityRow> & Pick<ChannelVisibilityRow, 'channelId' | 'channelName'>): ChannelVisibilityRow {
  const visibleRoleIds = overrides.visibleRoleIds ?? [];
  const visibleToEveryone = overrides.visibleToEveryone ?? false;
  return {
    parentId: null,
    categoryName: null,
    visibleRoleIds,
    visibleToEveryone,
    sendableRoleIds: visibleRoleIds,
    sendableToEveryone: visibleToEveryone,
    ...overrides,
  };
}

describe('permissionRemediation/reportFormat formatVisibilityAudit full matrix', () => {
  it('groups channels by category name, sorted alphabetically', () => {
    const report = makeReport({
      rows: [
        makeRow({ channelId: 'c1', channelName: 'a-channel', parentId: 'cat-z', categoryName: 'Zeta', visibleToEveryone: true }),
        makeRow({ channelId: 'c2', channelName: 'b-channel', parentId: 'cat-a', categoryName: 'Alpha', visibleToEveryone: true }),
      ],
    });

    const lines = formatVisibilityAudit(report, { fullMatrix: true }).join('\n');
    expect(lines.indexOf('-- Alpha --')).toBeLessThan(lines.indexOf('-- Zeta --'));
  });

  it('shows a compact tag for channels visible to @everyone with no role list', () => {
    const report = makeReport({
      rows: [
        makeRow({
          channelId: 'c1',
          channelName: 'general',
          categoryName: 'Public',
          visibleRoleIds: ['guild-1', 'role-a'],
          visibleToEveryone: true,
        }),
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
        makeRow({
          channelId: 'c1',
          channelName: 'staff-general',
          parentId: 'cat-1',
          categoryName: 'Staff',
          visibleRoleIds: ['role-mod', 'role-admin'],
        }),
      ],
      roleNames: { 'role-mod': 'Moderator', 'role-admin': 'Administrator' },
    });

    const lines = formatVisibilityAudit(report, { fullMatrix: true });
    expect(lines).toContain('  #staff-general — Administrator, Moderator');
  });

  it('flags a channel with zero visible roles', () => {
    const report = makeReport({
      rows: [makeRow({ channelId: 'c1', channelName: 'chapters', parentId: 'cat-1', categoryName: 'Archive' })],
    });

    const lines = formatVisibilityAudit(report, { fullMatrix: true });
    expect(lines).toContain('  #chapters — (no roles — nobody can see this)');
  });

  it('buckets channels with no category under "(no category)"', () => {
    const report = makeReport({
      rows: [makeRow({ channelId: 'c1', channelName: 'orphan-channel', visibleToEveryone: true })],
    });

    const lines = formatVisibilityAudit(report, { fullMatrix: true });
    expect(lines).toContain('-- (no category) --');
  });

  it('omits the full matrix section when fullMatrix is not requested', () => {
    const report = makeReport({
      rows: [makeRow({ channelId: 'c1', channelName: 'general', categoryName: 'Public', visibleToEveryone: true })],
    });

    const lines = formatVisibilityAudit(report).join('\n');
    expect(lines).not.toContain('Full channel visibility matrix');
  });
});

describe('permissionRemediation/reportFormat formatVisibilityAudit posting gaps', () => {
  it('flags a channel visible to @everyone but postable only by specific roles', () => {
    const report = makeReport({
      rows: [
        makeRow({
          channelId: 'c1',
          channelName: 'announcements',
          categoryName: 'Info',
          visibleRoleIds: ['guild-1'],
          visibleToEveryone: true,
          sendableRoleIds: ['role-mod'],
          sendableToEveryone: false,
        }),
      ],
      roleNames: { 'guild-1': '@everyone', 'role-mod': 'Moderator' },
    });

    const lines = formatVisibilityAudit(report);
    expect(lines).toContain('Posting narrower than viewing (1 channels — some roles can see but not post):');
    expect(lines).toContain('  #announcements — can view: @everyone; can post: Moderator');
  });

  it('is shown even when fullMatrix is not requested', () => {
    const report = makeReport({
      rows: [
        makeRow({
          channelId: 'c1',
          channelName: 'announcements',
          visibleRoleIds: ['guild-1'],
          visibleToEveryone: true,
          sendableRoleIds: [],
          sendableToEveryone: false,
        }),
      ],
      roleNames: { 'guild-1': '@everyone' },
    });

    const lines = formatVisibilityAudit(report);
    expect(lines.some((l) => l.startsWith('Posting narrower than viewing'))).toBe(true);
    expect(lines).toContain('  #announcements — can view: @everyone; can post: (nobody)');
  });

  it('omits a channel entirely when everyone who can view can also post', () => {
    const report = makeReport({
      rows: [
        makeRow({
          channelId: 'c1',
          channelName: 'general',
          visibleRoleIds: ['guild-1'],
          visibleToEveryone: true,
        }),
      ],
      roleNames: { 'guild-1': '@everyone' },
    });

    const lines = formatVisibilityAudit(report);
    expect(lines.some((l) => l.startsWith('Posting narrower than viewing'))).toBe(false);
  });

  it('omits the section header entirely when there are no gaps', () => {
    const report = makeReport({
      rows: [makeRow({ channelId: 'c1', channelName: 'general', visibleToEveryone: true })],
    });

    const lines = formatVisibilityAudit(report).join('\n');
    expect(lines).not.toContain('Posting narrower than viewing');
  });
});
