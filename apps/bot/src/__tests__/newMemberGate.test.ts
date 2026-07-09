import { describe, expect, it } from 'vitest';
import {
  buildButtonId,
  isNewMemberGateButton,
  messageContainsUrl,
  parseButtonId,
  rolesForChoice,
  shouldPrompt,
} from '../services/newMemberGate';

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

describe('buildButtonId / parseButtonId', () => {
  it('round-trips the choice and target user id', () => {
    const id = buildButtonId('player', 'user-42');
    expect(parseButtonId(id)).toEqual({ choice: 'player', targetUserId: 'user-42' });
  });

  it('round-trips the lurker choice too', () => {
    const id = buildButtonId('lurker', 'user-99');
    expect(parseButtonId(id)).toEqual({ choice: 'lurker', targetUserId: 'user-99' });
  });

  it('rejects a customId from an unrelated feature', () => {
    expect(parseButtonId('contact:reply-btn:7')).toBeNull();
  });

  it('rejects a malformed new-member-gate customId with no target user', () => {
    expect(parseButtonId('new-member-gate:player:')).toBeNull();
  });
});

describe('isNewMemberGateButton', () => {
  it('recognizes a valid new-member-gate button', () => {
    expect(isNewMemberGateButton(buildButtonId('player', 'user-1'))).toBe(true);
  });

  it('rejects an unrelated customId', () => {
    expect(isNewMemberGateButton('contact:reply-btn:7')).toBe(false);
  });

  it('rejects undefined (non-component interactions have no customId)', () => {
    expect(isNewMemberGateButton(undefined)).toBe(false);
  });
});

describe('messageContainsUrl', () => {
  it('detects an http(s) URL', () => {
    expect(messageContainsUrl('check this out https://evil.example/free-nitro')).toBe(true);
    expect(messageContainsUrl('http://also-a-link.example')).toBe(true);
  });

  it('detects a bare www. URL with no scheme', () => {
    // Discord still auto-hyperlinks these even without http(s):// — the exact gap EmbedLinks:false doesn't cover.
    expect(messageContainsUrl('go to www.evil.example now')).toBe(true);
  });

  it('does not flag plain text with no link', () => {
    expect(messageContainsUrl('hello everyone, excited to be here!')).toBe(false);
  });

  it('does not flag an empty message', () => {
    expect(messageContainsUrl('')).toBe(false);
  });
});
