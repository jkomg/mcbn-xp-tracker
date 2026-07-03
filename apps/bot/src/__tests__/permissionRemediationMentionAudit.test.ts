import { PermissionsBitField } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';
import { applyMentionFixes, auditMentions } from '../scripts/permissionRemediation/mentionAudit';
import { makeFakeCollection } from './testUtils/fakeCollection';

const MENTION_EVERYONE = PermissionsBitField.Flags.MentionEveryone;
const ADMINISTRATOR = PermissionsBitField.Flags.Administrator;

function makePermissions(flags: bigint[] = []) {
  const bits = flags.reduce((acc, f) => acc | f, 0n);
  return {
    has: (flag: bigint) => (bits & flag) === flag,
    remove: vi.fn((flag: bigint) => makePermissions(flags.filter((f) => f !== flag))),
  };
}

function makeRole(overrides: Record<string, unknown> = {}) {
  return {
    id: 'role-a',
    name: 'Role A',
    mentionable: false,
    permissions: makePermissions(),
    setMentionable: vi.fn().mockResolvedValue(undefined),
    setPermissions: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeOverwrite(overrides: Record<string, unknown> = {}) {
  return {
    id: 'role-a',
    allow: makePermissions(),
    edit: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeChannel(overrides: Record<string, unknown> = {}) {
  return {
    id: 'chan-a',
    name: 'general',
    permissionOverwrites: { cache: makeFakeCollection([]) },
    ...overrides,
  };
}

function makeGuild({ roles = [], channels = [], canEdit = true } = {}) {
  return {
    id: 'guild-1',
    roles: { cache: makeFakeCollection(roles) },
    channels: {
      fetch: vi.fn(async (id?: string) =>
        id === undefined ? makeFakeCollection(channels) : (channels.find((c) => c.id === id) ?? null),
      ),
    },
    members: {
      me: { roles: { highest: { comparePositionTo: vi.fn(() => (canEdit ? 1 : -1)) } } },
    },
  };
}

describe('permissionRemediation/mentionAudit', () => {
  describe('auditMentions', () => {
    it('flags mentionable roles', async () => {
      const role = makeRole({ mentionable: true });
      const guild = makeGuild({ roles: [role] });

      const report = await auditMentions(guild as never, {
        keepMentionableRoleIds: new Set(),
        keepMentionEveryoneIds: new Set(),
      });

      expect(report.findings).toContainEqual({
        kind: 'role_mentionable',
        roleId: 'role-a',
        roleName: 'Role A',
        editable: true,
      });
    });

    it('marks a non-editable mentionable role as not editable, still reported', async () => {
      const role = makeRole({ mentionable: true });
      const guild = makeGuild({ roles: [role], canEdit: false });

      const report = await auditMentions(guild as never, {
        keepMentionableRoleIds: new Set(),
        keepMentionEveryoneIds: new Set(),
      });

      expect(report.findings[0]).toMatchObject({ roleId: 'role-a', editable: false });
    });

    it('flags roles holding MentionEveryone, excluding Administrator roles', async () => {
      const dangerous = makeRole({ id: 'role-b', name: 'Dangerous', permissions: makePermissions([MENTION_EVERYONE]) });
      const admin = makeRole({ id: 'role-c', name: 'Admin', permissions: makePermissions([MENTION_EVERYONE, ADMINISTRATOR]) });
      const guild = makeGuild({ roles: [dangerous, admin] });

      const report = await auditMentions(guild as never, {
        keepMentionableRoleIds: new Set(),
        keepMentionEveryoneIds: new Set(),
      });

      expect(report.findings.some((f) => f.kind === 'role_mention_everyone' && f.roleId === 'role-b')).toBe(true);
      expect(report.findings.some((f) => f.kind === 'role_mention_everyone' && f.roleId === 'role-c')).toBe(false);
      expect(report.adminRoleIds).toEqual([{ roleId: 'role-c', roleName: 'Admin' }]);
    });

    it('flags channel overwrites granting MentionEveryone', async () => {
      const overwrite = makeOverwrite({ allow: makePermissions([MENTION_EVERYONE]) });
      const channel = makeChannel({ permissionOverwrites: { cache: makeFakeCollection([overwrite]) } });
      const guild = makeGuild({ channels: [channel] });

      const report = await auditMentions(guild as never, {
        keepMentionableRoleIds: new Set(),
        keepMentionEveryoneIds: new Set(),
      });

      expect(report.findings).toContainEqual({
        kind: 'overwrite_mention_everyone',
        channelId: 'chan-a',
        channelName: 'general',
        targetId: 'role-a',
        targetName: 'role-a',
      });
    });
  });

  describe('applyMentionFixes', () => {
    it('fixes a mentionable role', async () => {
      const role = makeRole({ mentionable: true });
      const guild = makeGuild({ roles: [role] });
      const report = await auditMentions(guild as never, {
        keepMentionableRoleIds: new Set(),
        keepMentionEveryoneIds: new Set(),
      });

      const result = await applyMentionFixes(guild as never, report, {
        keepMentionableRoleIds: new Set(),
        keepMentionEveryoneIds: new Set(),
      });

      expect(role.setMentionable).toHaveBeenCalledWith(false, expect.any(String));
      expect(result.fixedMentionableRoleIds).toEqual(['role-a']);
    });

    it('skips allow-listed roles without mutating them', async () => {
      const role = makeRole({ mentionable: true });
      const guild = makeGuild({ roles: [role] });
      const report = await auditMentions(guild as never, {
        keepMentionableRoleIds: new Set(['role-a']),
        keepMentionEveryoneIds: new Set(),
      });

      const result = await applyMentionFixes(guild as never, report, {
        keepMentionableRoleIds: new Set(['role-a']),
        keepMentionEveryoneIds: new Set(),
      });

      expect(role.setMentionable).not.toHaveBeenCalled();
      expect(result.fixedMentionableRoleIds).toEqual([]);
    });

    it('skips non-editable roles and records why', async () => {
      const role = makeRole({ mentionable: true });
      const guild = makeGuild({ roles: [role], canEdit: false });
      const report = await auditMentions(guild as never, {
        keepMentionableRoleIds: new Set(),
        keepMentionEveryoneIds: new Set(),
      });

      const result = await applyMentionFixes(guild as never, report, {
        keepMentionableRoleIds: new Set(),
        keepMentionEveryoneIds: new Set(),
      });

      expect(role.setMentionable).not.toHaveBeenCalled();
      expect(result.skipped).toEqual([{ id: 'role-a', scope: 'role', reason: 'bot cannot edit this role' }]);
    });

    it('removes MentionEveryone from a dangerous role', async () => {
      const role = makeRole({ id: 'role-b', permissions: makePermissions([MENTION_EVERYONE]) });
      const guild = makeGuild({ roles: [role] });
      const report = await auditMentions(guild as never, {
        keepMentionableRoleIds: new Set(),
        keepMentionEveryoneIds: new Set(),
      });

      await applyMentionFixes(guild as never, report, {
        keepMentionableRoleIds: new Set(),
        keepMentionEveryoneIds: new Set(),
      });

      expect(role.permissions.remove).toHaveBeenCalledWith(MENTION_EVERYONE);
      expect(role.setPermissions).toHaveBeenCalled();
    });

    it('clears MentionEveryone from a channel overwrite', async () => {
      const overwrite = makeOverwrite({ allow: makePermissions([MENTION_EVERYONE]) });
      const channel = makeChannel({ permissionOverwrites: { cache: makeFakeCollection([overwrite]) } });
      const guild = makeGuild({ channels: [channel] });
      const report = await auditMentions(guild as never, {
        keepMentionableRoleIds: new Set(),
        keepMentionEveryoneIds: new Set(),
      });

      const result = await applyMentionFixes(guild as never, report, {
        keepMentionableRoleIds: new Set(),
        keepMentionEveryoneIds: new Set(),
      });

      expect(overwrite.edit).toHaveBeenCalledWith({ MentionEveryone: null }, expect.any(String));
      expect(result.fixedOverwrites).toEqual([{ channelId: 'chan-a', targetId: 'role-a' }]);
    });
  });
});
