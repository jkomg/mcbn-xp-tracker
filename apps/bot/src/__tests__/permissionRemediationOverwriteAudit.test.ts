import { ChannelType } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';
import { applyOverwriteFixes, auditOverwrites } from '../scripts/permissionRemediation/overwriteAudit';
import { makeFakeCollection } from './testUtils/fakeCollection';

function makeOverwrite(id: string, type: 0 | 1, allow: bigint, deny: bigint) {
  return { id, type, allow: { bitfield: allow }, deny: { bitfield: deny } };
}

function makeChannel(overrides: Record<string, unknown> = {}) {
  return {
    id: 'chan-1',
    name: 'general',
    type: 0,
    parentId: null,
    permissionOverwrites: {
      cache: makeFakeCollection([]),
      delete: vi.fn().mockResolvedValue(undefined),
    },
    ...overrides,
  };
}

function makeGuild({
  channels = [] as ReturnType<typeof makeChannel>[],
  roleIds = ['role-a'] as string[],
  memberFetch = vi.fn().mockResolvedValue({ id: 'existing' }),
} = {}) {
  return {
    id: 'guild-1',
    roles: { cache: makeFakeCollection(roleIds.map((id) => ({ id }))) },
    channels: {
      fetch: vi.fn(async (id?: string) =>
        id === undefined ? makeFakeCollection(channels) : (channels.find((c) => c.id === id) ?? null),
      ),
    },
    members: { fetch: memberFetch },
  };
}

describe('permissionRemediation/overwriteAudit', () => {
  describe('auditOverwrites', () => {
    it('flags a channel overwrite identical to its parent category overwrite', async () => {
      const category = makeChannel({
        id: 'cat-1',
        name: 'Category',
        type: ChannelType.GuildCategory,
        permissionOverwrites: {
          cache: makeFakeCollection([makeOverwrite('role-a', 0, 1024n, 0n)]),
          delete: vi.fn(),
        },
      });
      const child = makeChannel({
        id: 'chan-1',
        parentId: 'cat-1',
        permissionOverwrites: {
          cache: makeFakeCollection([makeOverwrite('role-a', 0, 1024n, 0n)]),
          delete: vi.fn(),
        },
      });
      const guild = makeGuild({ channels: [category, child] });

      const report = await auditOverwrites(guild as never, { includeMembers: false, includeZero: false });

      expect(report.findings).toContainEqual({
        kind: 'redundant_vs_category',
        channelId: 'chan-1',
        channelName: 'general',
        parentId: 'cat-1',
        targetId: 'role-a',
        targetType: 0,
        allow: '1024',
        deny: '0',
        reason: 'matches_category',
      });
    });

    it('does not flag a channel overwrite that differs from its category', async () => {
      const category = makeChannel({
        id: 'cat-1',
        type: ChannelType.GuildCategory,
        permissionOverwrites: { cache: makeFakeCollection([makeOverwrite('role-a', 0, 1024n, 0n)]), delete: vi.fn() },
      });
      const child = makeChannel({
        id: 'chan-1',
        parentId: 'cat-1',
        permissionOverwrites: { cache: makeFakeCollection([makeOverwrite('role-a', 0, 2048n, 0n)]), delete: vi.fn() },
      });
      const guild = makeGuild({ channels: [category, child] });

      const report = await auditOverwrites(guild as never, { includeMembers: false, includeZero: false });
      expect(report.findings).toEqual([]);
    });

    it('flags an overwrite referencing a role that no longer exists', async () => {
      const child = makeChannel({
        permissionOverwrites: { cache: makeFakeCollection([makeOverwrite('role-ghost', 0, 1n, 0n)]), delete: vi.fn() },
      });
      const guild = makeGuild({ channels: [child], roleIds: ['role-a'] });

      const report = await auditOverwrites(guild as never, { includeMembers: false, includeZero: false });
      expect(report.findings).toContainEqual(
        expect.objectContaining({ kind: 'orphaned_target', targetId: 'role-ghost', reason: 'role_not_found' }),
      );
    });

    it('flags an overwrite referencing a member that no longer exists, deduping fetches', async () => {
      const chanA = makeChannel({
        id: 'chan-a',
        permissionOverwrites: { cache: makeFakeCollection([makeOverwrite('user-ghost', 1, 1n, 0n)]), delete: vi.fn() },
      });
      const chanB = makeChannel({
        id: 'chan-b',
        permissionOverwrites: { cache: makeFakeCollection([makeOverwrite('user-ghost', 1, 1n, 0n)]), delete: vi.fn() },
      });
      const memberFetch = vi.fn().mockRejectedValue(new Error('Unknown Member'));
      const guild = makeGuild({ channels: [chanA, chanB], memberFetch });

      const report = await auditOverwrites(guild as never, { includeMembers: false, includeZero: false });

      expect(memberFetch).toHaveBeenCalledTimes(1); // deduped across both channels
      expect(report.findings.filter((f) => f.kind === 'orphaned_target' && f.reason === 'member_not_found')).toHaveLength(2);
    });

    it('flags no-op overwrites only when includeZero is set', async () => {
      const category = makeChannel({
        id: 'cat-1',
        type: ChannelType.GuildCategory,
        permissionOverwrites: { cache: makeFakeCollection([]), delete: vi.fn() },
      });
      const child = makeChannel({
        id: 'chan-1',
        parentId: 'cat-1',
        permissionOverwrites: { cache: makeFakeCollection([makeOverwrite('role-a', 0, 0n, 0n)]), delete: vi.fn() },
      });
      const guild = makeGuild({ channels: [category, child] });

      const withoutZero = await auditOverwrites(guild as never, { includeMembers: false, includeZero: false });
      expect(withoutZero.findings).toEqual([]);

      const withZero = await auditOverwrites(guild as never, { includeMembers: false, includeZero: true });
      expect(withZero.findings).toContainEqual(expect.objectContaining({ reason: 'no_op' }));
    });
  });

  describe('applyOverwriteFixes', () => {
    it('deletes flagged overwrites and groups results by channel', async () => {
      const child = makeChannel({
        permissionOverwrites: { cache: makeFakeCollection([makeOverwrite('role-ghost', 0, 1n, 0n)]), delete: vi.fn() },
      });
      const guild = makeGuild({ channels: [child] });
      const report = await auditOverwrites(guild as never, { includeMembers: false, includeZero: false });

      const result = await applyOverwriteFixes(guild as never, report, { keepTargetIds: new Set() });

      expect(child.permissionOverwrites.delete).toHaveBeenCalledWith('role-ghost', expect.any(String));
      expect(result.removedByChannel).toEqual([
        { channelId: 'chan-1', channelName: 'general', removedTargetIds: ['role-ghost'] },
      ]);
    });

    it('does not delete allow-listed targets', async () => {
      const child = makeChannel({
        permissionOverwrites: { cache: makeFakeCollection([makeOverwrite('role-ghost', 0, 1n, 0n)]), delete: vi.fn() },
      });
      const guild = makeGuild({ channels: [child] });
      const report = await auditOverwrites(guild as never, { includeMembers: false, includeZero: false });

      const result = await applyOverwriteFixes(guild as never, report, { keepTargetIds: new Set(['role-ghost']) });

      expect(child.permissionOverwrites.delete).not.toHaveBeenCalled();
      expect(result.removedByChannel).toEqual([]);
    });
  });
});
