import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  captureSnapshot,
  listSnapshots,
  readSnapshot,
  restoreSnapshot,
  writeSnapshot,
} from '../scripts/permissionRemediation/snapshot';
import { makeFakeCollection } from './testUtils/fakeCollection';

function makeRole(overrides: Record<string, unknown> = {}) {
  return {
    id: 'role-a',
    name: 'Role A',
    position: 3,
    mentionable: true,
    managed: false,
    permissions: { bitfield: 100n },
    setMentionable: vi.fn().mockResolvedValue(undefined),
    setPermissions: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeChannel(overrides: Record<string, unknown> = {}) {
  return {
    id: 'chan-a',
    name: 'general',
    type: 0,
    parentId: null,
    permissionOverwrites: {
      cache: makeFakeCollection([
        { id: 'role-a', type: 0, allow: { bitfield: 1024n }, deny: { bitfield: 0n } },
      ]),
      set: vi.fn().mockResolvedValue(undefined),
    },
    ...overrides,
  };
}

function makeGuild({ roles = [makeRole()], channels = [makeChannel()], canEdit = true } = {}) {
  const roleMap = new Map(roles.map((r) => [r.id, r]));
  const channelMap = new Map(channels.map((c) => [c.id, c]));
  return {
    id: 'guild-1',
    name: 'Test Guild',
    roles: {
      fetch: vi.fn(async (id?: string) => (id === undefined ? makeFakeCollection(roles) : (roleMap.get(id) ?? null))),
    },
    channels: {
      fetch: vi.fn(async (id?: string) =>
        id === undefined ? makeFakeCollection(channels) : (channelMap.get(id) ?? null),
      ),
    },
    members: {
      me: {
        roles: {
          highest: {
            comparePositionTo: vi.fn(() => (canEdit ? 1 : -1)),
          },
        },
      },
    },
  };
}

describe('permissionRemediation/snapshot', () => {
  describe('captureSnapshot', () => {
    it('captures roles and channel overwrites', async () => {
      const guild = makeGuild();
      const snapshot = await captureSnapshot(guild as never, {
        modulesRun: ['mention'],
        triggeredBy: { discordUserId: null, discordTag: null, source: 'cli' },
      });

      expect(snapshot.roles).toHaveLength(1);
      expect(snapshot.roles[0]).toMatchObject({ id: 'role-a', mentionable: true, permissions: '100' });
      expect(snapshot.channels).toHaveLength(1);
      expect(snapshot.channels[0].permissionOverwrites).toEqual([
        { id: 'role-a', type: 0, allow: '1024', deny: '0' },
      ]);
      expect(snapshot.summary).toEqual({ rolesCaptured: 1, channelsCaptured: 1, overwritesCaptured: 1 });
    });
  });

  describe('restoreSnapshot', () => {
    it('restores mentionable and permissions when live state has drifted', async () => {
      const role = makeRole();
      const guild = makeGuild({ roles: [role] });
      const snapshot = await captureSnapshot(guild as never, {
        modulesRun: ['mention'],
        triggeredBy: { discordUserId: null, discordTag: null, source: 'cli' },
      });

      // Simulate a fix having flipped these away from the captured state.
      role.mentionable = false;
      role.permissions = { bitfield: 0n };

      const result = await restoreSnapshot(guild as never, snapshot);

      expect(role.setMentionable).toHaveBeenCalledWith(true, expect.any(String));
      expect(role.setPermissions).toHaveBeenCalledWith(100n, expect.any(String));
      expect(result.rolesRestored).toEqual(['role-a']);
    });

    it('does not call setters when live state already matches the snapshot', async () => {
      const role = makeRole();
      const guild = makeGuild({ roles: [role] });
      const snapshot = await captureSnapshot(guild as never, {
        modulesRun: ['mention'],
        triggeredBy: { discordUserId: null, discordTag: null, source: 'cli' },
      });

      await restoreSnapshot(guild as never, snapshot);

      expect(role.setMentionable).not.toHaveBeenCalled();
      expect(role.setPermissions).not.toHaveBeenCalled();
    });

    it('replaces the full overwrite array on channel restore', async () => {
      const channel = makeChannel();
      const guild = makeGuild({ channels: [channel] });
      const snapshot = await captureSnapshot(guild as never, {
        modulesRun: ['overwrite'],
        triggeredBy: { discordUserId: null, discordTag: null, source: 'cli' },
      });

      const result = await restoreSnapshot(guild as never, snapshot);

      expect(channel.permissionOverwrites.set).toHaveBeenCalledWith(
        [{ id: 'role-a', type: 0, allow: 1024n, deny: 0n }],
        expect.any(String),
      );
      expect(result.channelsRestored).toEqual(['chan-a']);
    });

    it('skips roles that no longer exist', async () => {
      const guild = makeGuild({ roles: [] });
      const snapshot = await captureSnapshot(makeGuild() as never, {
        modulesRun: ['mention'],
        triggeredBy: { discordUserId: null, discordTag: null, source: 'cli' },
      });

      const result = await restoreSnapshot(guild as never, snapshot);
      expect(result.rolesSkipped).toEqual([
        { roleId: 'role-a', roleName: 'Role A', reason: 'role no longer exists' },
      ]);
    });

    it('skips managed roles', async () => {
      const role = makeRole({ managed: true });
      const guild = makeGuild({ roles: [role] });
      const snapshot = await captureSnapshot(guild as never, {
        modulesRun: ['mention'],
        triggeredBy: { discordUserId: null, discordTag: null, source: 'cli' },
      });

      const result = await restoreSnapshot(guild as never, snapshot);
      expect(result.rolesSkipped[0]).toMatchObject({ roleId: 'role-a', reason: expect.stringContaining('managed') });
    });

    it('skips roles above the bot in the hierarchy', async () => {
      const role = makeRole();
      const guild = makeGuild({ roles: [role], canEdit: false });
      const snapshot = await captureSnapshot(guild as never, {
        modulesRun: ['mention'],
        triggeredBy: { discordUserId: null, discordTag: null, source: 'cli' },
      });

      const result = await restoreSnapshot(guild as never, snapshot);
      expect(result.rolesSkipped[0]).toMatchObject({ roleId: 'role-a', reason: expect.stringContaining('hierarchy') });
    });

    it('skips channels that no longer exist', async () => {
      const guild = makeGuild({ channels: [] });
      const snapshot = await captureSnapshot(makeGuild() as never, {
        modulesRun: ['overwrite'],
        triggeredBy: { discordUserId: null, discordTag: null, source: 'cli' },
      });

      const result = await restoreSnapshot(guild as never, snapshot);
      expect(result.channelsSkipped).toEqual([
        { channelId: 'chan-a', channelName: 'general', reason: 'channel no longer exists' },
      ]);
    });
  });

  describe('write/read/list round trip on real disk', () => {
    let dir: string;

    beforeEach(async () => {
      dir = await mkdtemp(path.join(tmpdir(), 'permission-snapshots-test-'));
    });

    afterEach(async () => {
      await rm(dir, { recursive: true, force: true });
    });

    it('writes, reads back, and lists snapshots sorted newest-first', async () => {
      const guild = makeGuild();
      const older = await captureSnapshot(guild as never, {
        modulesRun: ['mention'],
        triggeredBy: { discordUserId: null, discordTag: null, source: 'cli' },
      });
      older.createdAt = '2026-01-01T00:00:00.000Z';
      const newer = await captureSnapshot(guild as never, {
        modulesRun: ['overwrite'],
        triggeredBy: { discordUserId: '123', discordTag: 'admin#0001', source: 'discord' },
      });
      newer.createdAt = '2026-06-01T00:00:00.000Z';

      const olderPath = await writeSnapshot(older, dir);
      const newerPath = await writeSnapshot(newer, dir);
      expect(olderPath).not.toEqual(newerPath);

      const roundTripped = await readSnapshot(newerPath);
      expect(roundTripped.triggeredBy).toEqual(newer.triggeredBy);

      const metas = await listSnapshots(dir, 10);
      expect(metas).toHaveLength(2);
      expect(metas[0].fileName).toContain('20260601');
      expect(metas[1].fileName).toContain('20260101');
    });

    it('returns an empty list when the directory does not exist', async () => {
      const metas = await listSnapshots(path.join(dir, 'does-not-exist'), 10);
      expect(metas).toEqual([]);
    });
  });
});
