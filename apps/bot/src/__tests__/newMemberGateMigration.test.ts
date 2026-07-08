import { describe, expect, it } from 'vitest';
import { computePlan, VERIFIED_ROLE_ID, WELCOME_CHANNEL_ID } from '../scripts/newMemberGate/migrateChannelAccess';
import { makeFakeCollection } from './testUtils/fakeCollection';

const EVERYONE_ID = 'guild-1';
const VIEW_CHANNEL = 1024n; // 1n << 10n

function makeOverwrite(id: string, type: 0 | 1, allow: bigint, deny: bigint) {
  return { id, type, allow: { bitfield: allow }, deny: { bitfield: deny } };
}

function makeChannel(overrides: Record<string, unknown> = {}) {
  return {
    id: 'chan-1',
    name: 'some-channel',
    type: 0,
    parentId: null,
    permissionOverwrites: { cache: makeFakeCollection([]) },
    ...overrides,
  };
}

function makeGuild(channels: ReturnType<typeof makeChannel>[]) {
  return {
    id: EVERYONE_ID,
    roles: { cache: makeFakeCollection([{ id: EVERYONE_ID }, { id: VERIFIED_ROLE_ID }]) },
    channels: { fetch: async () => makeFakeCollection(channels) },
  };
}

describe('newMemberGate migration: computePlan', () => {
  it('classifies a currently-open, non-allowlisted channel as grant-verified', async () => {
    const channel = makeChannel({ id: 'general-1', name: 'general' }); // no overwrites at all
    const plan = await computePlan(makeGuild([channel]) as never);
    expect(plan).toEqual([{ kind: 'grant-verified', id: 'general-1', name: 'general' }]);
  });

  it('leaves an already-gated channel (explicit @everyone deny) untouched', async () => {
    const channel = makeChannel({
      id: 'staff-1',
      name: 'staff-chat',
      permissionOverwrites: { cache: makeFakeCollection([makeOverwrite(EVERYONE_ID, 0, 0n, VIEW_CHANNEL)]) },
    });
    const plan = await computePlan(makeGuild([channel]) as never);
    expect(plan).toEqual([{ kind: 'skip-already-gated', id: 'staff-1', name: 'staff-chat' }]);
  });

  it('classifies the welcome channel as pre-verification postable', async () => {
    const channel = makeChannel({ id: WELCOME_CHANNEL_ID, name: 'welcome' });
    const plan = await computePlan(makeGuild([channel]) as never);
    expect(plan).toEqual([{ kind: 'preverify-postable', id: WELCOME_CHANNEL_ID, name: 'welcome' }]);
  });

  it('classifies server-rules as pre-verification read-only', async () => {
    const channel = makeChannel({ id: '1168639288250998785', name: 'server-rules' });
    const plan = await computePlan(makeGuild([channel]) as never);
    expect(plan).toEqual([{ kind: 'preverify-readonly', id: '1168639288250998785', name: 'server-rules' }]);
  });

  it('handles a mixed set of channels independently', async () => {
    const open = makeChannel({ id: 'general-1', name: 'general' });
    const gated = makeChannel({
      id: 'staff-1',
      name: 'staff-chat',
      permissionOverwrites: { cache: makeFakeCollection([makeOverwrite(EVERYONE_ID, 0, 0n, VIEW_CHANNEL)]) },
    });
    const welcome = makeChannel({ id: WELCOME_CHANNEL_ID, name: 'welcome' });

    const plan = await computePlan(makeGuild([open, gated, welcome]) as never);

    expect(plan).toContainEqual({ kind: 'grant-verified', id: 'general-1', name: 'general' });
    expect(plan).toContainEqual({ kind: 'skip-already-gated', id: 'staff-1', name: 'staff-chat' });
    expect(plan).toContainEqual({ kind: 'preverify-postable', id: WELCOME_CHANNEL_ID, name: 'welcome' });
  });
});
