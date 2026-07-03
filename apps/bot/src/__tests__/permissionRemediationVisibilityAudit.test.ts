import { ChannelType } from 'discord.js';
import { describe, expect, it } from 'vitest';
import { auditVisibility } from '../scripts/permissionRemediation/visibilityAudit';
import { makeFakeCollection } from './testUtils/fakeCollection';

const EVERYONE_ID = 'guild-1';
const VIEW_CHANNEL = 1024n; // 1n << 10n
const SEND_MESSAGES = 2048n; // 1n << 11n

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

  it('a role-level allow overrides an @everyone-level deny on the same channel (staff-only channel pattern)', async () => {
    // The extremely common "deny @everyone, allow specific staff roles" setup.
    // Regression test: an earlier version OR'd deny bits across @everyone and
    // the role together and let any deny win, so this staff role incorrectly
    // showed up as unable to view its own staff channel.
    const channel = makeChannel({
      permissionOverwrites: {
        cache: makeFakeCollection([
          makeOverwrite(EVERYONE_ID, 0, 0n, VIEW_CHANNEL),
          makeOverwrite('moderator-role', 0, VIEW_CHANNEL, 0n),
        ]),
      },
    });
    const guild = makeGuild({ channels: [channel], roleIds: [EVERYONE_ID, 'moderator-role'] });

    const report = await auditVisibility(guild as never, { modLogChannelIds: [] });

    const row = report.rows[0];
    expect(row.visibleToEveryone).toBe(false);
    expect(row.visibleRoleIds).toContain('moderator-role');
  });

  it('falls back to the category-level overwrite for a role the channel does not mention', async () => {
    // Channel overrides @everyone but says nothing about "storyteller-role" —
    // that role's visibility should come from the category's own entry for
    // it, not be treated as "unset at the channel = category ignored".
    const category = makeChannel({
      id: 'cat-1',
      type: ChannelType.GuildCategory,
      permissionOverwrites: {
        cache: makeFakeCollection([makeOverwrite('storyteller-role', 0, VIEW_CHANNEL, 0n)]),
      },
    });
    const child = makeChannel({
      id: 'chan-1',
      parentId: 'cat-1',
      permissionOverwrites: {
        cache: makeFakeCollection([makeOverwrite(EVERYONE_ID, 0, 0n, VIEW_CHANNEL)]),
      },
    });
    const guild = makeGuild({ channels: [category, child], roleIds: [EVERYONE_ID, 'storyteller-role'] });

    const report = await auditVisibility(guild as never, { modLogChannelIds: [] });

    const row = report.rows.find((r) => r.channelId === 'chan-1');
    expect(row?.visibleToEveryone).toBe(false);
    expect(row?.visibleRoleIds).toContain('storyteller-role');
  });

  it('resolves Send Messages independently from View Channel (broadcast-channel pattern)', async () => {
    // @everyone can view but only Moderator can post — the "read-only
    // announcement channel" pattern found across the real server.
    const channel = makeChannel({
      permissionOverwrites: {
        cache: makeFakeCollection([
          makeOverwrite(EVERYONE_ID, 0, 0n, SEND_MESSAGES),
          makeOverwrite('moderator-role', 0, VIEW_CHANNEL | SEND_MESSAGES, 0n),
        ]),
      },
    });
    const guild = makeGuild({ channels: [channel], roleIds: [EVERYONE_ID, 'moderator-role'] });

    const report = await auditVisibility(guild as never, { modLogChannelIds: [] });

    const row = report.rows[0];
    expect(row.visibleToEveryone).toBe(true);
    expect(row.sendableToEveryone).toBe(false);
    expect(row.sendableRoleIds).toEqual(['moderator-role']);
  });

  it('never reports a role as able to post in a channel it cannot view', async () => {
    // Regression test (flagged in review of #325): a private channel denies
    // View Channel to @everyone and never touches Send Messages at all. Send
    // Messages alone resolves to "allowed" (nothing denies it), but nobody
    // without View Channel can actually post — Discord has no path to send a
    // message in a channel you can't open. sendableRoleIds must reflect that.
    const channel = makeChannel({
      permissionOverwrites: {
        cache: makeFakeCollection([makeOverwrite(EVERYONE_ID, 0, 0n, VIEW_CHANNEL)]),
      },
    });
    const guild = makeGuild({ channels: [channel] });

    const report = await auditVisibility(guild as never, { modLogChannelIds: [] });

    const row = report.rows[0];
    expect(row.visibleToEveryone).toBe(false);
    expect(row.sendableToEveryone).toBe(false);
    expect(row.sendableRoleIds).toEqual([]);
  });

  it('falls back to the category-level overwrite for Send Messages, same as View Channel', async () => {
    const category = makeChannel({
      id: 'cat-1',
      type: ChannelType.GuildCategory,
      permissionOverwrites: {
        cache: makeFakeCollection([makeOverwrite('storyteller-role', 0, SEND_MESSAGES, 0n)]),
      },
    });
    const child = makeChannel({ id: 'chan-1', parentId: 'cat-1' });
    const guild = makeGuild({ channels: [category, child], roleIds: [EVERYONE_ID, 'storyteller-role'] });

    const report = await auditVisibility(guild as never, { modLogChannelIds: [] });

    const row = report.rows.find((r) => r.channelId === 'chan-1');
    expect(row?.sendableRoleIds).toContain('storyteller-role');
  });
});
