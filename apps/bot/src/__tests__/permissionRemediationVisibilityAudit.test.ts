import { ChannelType } from 'discord.js';
import { describe, expect, it } from 'vitest';
import { auditVisibility } from '../scripts/permissionRemediation/visibilityAudit';
import { makeFakeCollection } from './testUtils/fakeCollection';

const EVERYONE_ID = 'guild-1';
const VIEW_CHANNEL = 1024n; // 1n << 10n

function makeOverwrite(id: string, type: 0 | 1, allow: bigint, deny: bigint) {
  return { id, type, allow: { bitfield: allow }, deny: { bitfield: deny } };
}

function makeChannel(overrides: Record<string, unknown> = {}) {
  return {
    id: 'chan-1',
    name: 'mod-log',
    type: 0,
    parentId: null,
    permissionOverwrites: { cache: makeFakeCollection([]) },
    ...overrides,
  };
}

function makeGuild({ channels = [] as ReturnType<typeof makeChannel>[], roleIds = [EVERYONE_ID] as string[] } = {}) {
  return {
    id: EVERYONE_ID,
    roles: { cache: makeFakeCollection(roleIds.map((id) => ({ id }))) },
    channels: {
      fetch: async () => makeFakeCollection(channels),
    },
  };
}

describe('permissionRemediation/visibilityAudit', () => {
  it('resolves a channel as not visible to @everyone when explicitly denied', async () => {
    const channel = makeChannel({
      permissionOverwrites: {
        cache: makeFakeCollection([makeOverwrite(EVERYONE_ID, 0, 0n, VIEW_CHANNEL)]),
      },
    });
    const guild = makeGuild({ channels: [channel] });

    const report = await auditVisibility(guild as never, {
      modLogChannelIds: ['chan-1'],
    });

    expect(report.rows[0].visibleToEveryone).toBe(false);
    expect(report.assertions).toContainEqual(
      expect.objectContaining({ label: 'Mod-log channel hidden from @everyone', channelId: 'chan-1', ok: true }),
    );
  });

  it('defaults an unrestricted channel to visible-to-everyone (fails the mod-log assertion)', async () => {
    const channel = makeChannel(); // no overwrites at all
    const guild = makeGuild({ channels: [channel] });

    const report = await auditVisibility(guild as never, {
      modLogChannelIds: ['chan-1'],
    });

    expect(report.rows[0].visibleToEveryone).toBe(true);
    expect(report.assertions).toContainEqual(
      expect.objectContaining({ label: 'Mod-log channel hidden from @everyone', ok: false }),
    );
  });

  it('flags the honeypot channel as visible to the verified-member role when not denied', async () => {
    const channel = makeChannel({ id: 'honeypot-1', name: 'verify-here' });
    const guild = makeGuild({ channels: [channel], roleIds: [EVERYONE_ID, 'member-role'] });

    const report = await auditVisibility(guild as never, {
      modLogChannelIds: [],
      verifiedMemberRoleId: 'member-role',
      honeypotChannelId: 'honeypot-1',
    });

    expect(report.assertions).toContainEqual(
      expect.objectContaining({ label: 'Honeypot channel hidden from verified members', ok: false }),
    );
  });

  it('passes the honeypot assertion when the member role is explicitly denied', async () => {
    const channel = makeChannel({
      id: 'honeypot-1',
      name: 'verify-here',
      permissionOverwrites: {
        cache: makeFakeCollection([makeOverwrite('member-role', 0, 0n, VIEW_CHANNEL)]),
      },
    });
    const guild = makeGuild({ channels: [channel], roleIds: [EVERYONE_ID, 'member-role'] });

    const report = await auditVisibility(guild as never, {
      modLogChannelIds: [],
      verifiedMemberRoleId: 'member-role',
      honeypotChannelId: 'honeypot-1',
    });

    expect(report.assertions).toContainEqual(
      expect.objectContaining({ label: 'Honeypot channel hidden from verified members', ok: true }),
    );
  });

  it('omits the honeypot assertion when verifiedMemberRoleId is unset', async () => {
    const channel = makeChannel({ id: 'honeypot-1' });
    const guild = makeGuild({ channels: [channel] });

    const report = await auditVisibility(guild as never, {
      modLogChannelIds: [],
      honeypotChannelId: 'honeypot-1',
    });

    expect(report.assertions.find((a) => a.label.startsWith('Honeypot'))).toBeUndefined();
  });

  it('a category-level deny propagates to a child channel with no overwrites of its own', async () => {
    const category = makeChannel({
      id: 'cat-1',
      type: ChannelType.GuildCategory,
      permissionOverwrites: { cache: makeFakeCollection([makeOverwrite(EVERYONE_ID, 0, 0n, VIEW_CHANNEL)]) },
    });
    const child = makeChannel({ id: 'chan-1', parentId: 'cat-1' });
    const guild = makeGuild({ channels: [category, child] });

    const report = await auditVisibility(guild as never, { modLogChannelIds: ['chan-1'] });
    expect(report.rows.find((r) => r.channelId === 'chan-1')?.visibleToEveryone).toBe(false);
  });
});
