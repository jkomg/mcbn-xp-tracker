import { describe, expect, it } from 'vitest';
import { rolesForChoice, shouldPrompt } from '../services/newMemberGate';

const CONFIG = {
  verifiedRoleId: 'washed-masses-id',
  sheetInProgressRoleId: 'sheet-in-progress-id',
  lurkerRoleId: 'lurkers-id',
};

const WELCOME_CONFIG = { welcomeChannelId: 'welcome-channel-id', verifiedRoleId: 'washed-masses-id' };

function message(overrides: Partial<{ channelId: string; authorIsBot: boolean; memberId: string | null; memberRoleIds: string[] }> = {}) {
  return {
    channelId: 'welcome-channel-id',
    authorIsBot: false,
    memberId: 'user-1',
    memberRoleIds: [],
    ...overrides,
  };
}

describe('shouldPrompt', () => {
  it('prompts for a fresh, unverified member posting in the welcome channel', () => {
    expect(shouldPrompt(message(), WELCOME_CONFIG, new Set())).toBe(true);
  });

  it('ignores messages outside the welcome channel', () => {
    expect(shouldPrompt(message({ channelId: 'some-other-channel' }), WELCOME_CONFIG, new Set())).toBe(false);
  });

  it('ignores messages from bots', () => {
    expect(shouldPrompt(message({ authorIsBot: true }), WELCOME_CONFIG, new Set())).toBe(false);
  });

  it('ignores messages with no resolvable member (e.g. partial/DM-like payload)', () => {
    expect(shouldPrompt(message({ memberId: null }), WELCOME_CONFIG, new Set())).toBe(false);
  });

  it('skips a member who already holds the verified role', () => {
    expect(shouldPrompt(message({ memberRoleIds: ['washed-masses-id'] }), WELCOME_CONFIG, new Set())).toBe(false);
  });

  it('skips a member already prompted and awaiting a button click', () => {
    expect(shouldPrompt(message(), WELCOME_CONFIG, new Set(['user-1']))).toBe(false);
  });

  it('does nothing if the welcome channel is unconfigured', () => {
    expect(shouldPrompt(message(), { ...WELCOME_CONFIG, welcomeChannelId: '' }, new Set())).toBe(false);
  });
});

describe('rolesForChoice', () => {
  it('grants Sheet in Progress + Washed Masses for the player choice', () => {
    expect(rolesForChoice(true, CONFIG)).toEqual(['sheet-in-progress-id', 'washed-masses-id']);
  });

  it('grants Lurkers + Washed Masses for the lurker choice', () => {
    expect(rolesForChoice(false, CONFIG)).toEqual(['lurkers-id', 'washed-masses-id']);
  });

  it('omits an unconfigured role id rather than passing an empty string to roles.add', () => {
    const partial = { verifiedRoleId: 'washed-masses-id', sheetInProgressRoleId: '', lurkerRoleId: 'lurkers-id' };
    expect(rolesForChoice(true, partial)).toEqual(['washed-masses-id']);
    expect(rolesForChoice(false, partial)).toEqual(['lurkers-id', 'washed-masses-id']);
  });
});
