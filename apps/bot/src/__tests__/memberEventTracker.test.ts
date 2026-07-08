import { describe, expect, it } from 'vitest';
import { detectRoleGains } from '../services/memberEventTracker';

const ROLE_IDS = { kindred: 'kindred-role-id', ghoul: 'ghoul-role-id', mortal: 'mortal-role-id' };

describe('detectRoleGains', () => {
  it('detects a single false->true transition', () => {
    const oldRoles = new Set<string>();
    const newRoles = new Set(['kindred-role-id']);
    expect(detectRoleGains(oldRoles, newRoles, ROLE_IDS)).toEqual(['kindred']);
  });

  it('returns empty when no tracked role changed', () => {
    const oldRoles = new Set(['some-other-role']);
    const newRoles = new Set(['some-other-role', 'yet-another-role']);
    expect(detectRoleGains(oldRoles, newRoles, ROLE_IDS)).toEqual([]);
  });

  it('does not report a role the member already had', () => {
    const oldRoles = new Set(['kindred-role-id']);
    const newRoles = new Set(['kindred-role-id']);
    expect(detectRoleGains(oldRoles, newRoles, ROLE_IDS)).toEqual([]);
  });

  it('does not report a role that was removed (true->false)', () => {
    const oldRoles = new Set(['kindred-role-id']);
    const newRoles = new Set<string>();
    expect(detectRoleGains(oldRoles, newRoles, ROLE_IDS)).toEqual([]);
  });

  it('detects multiple roles gained in the same update', () => {
    const oldRoles = new Set<string>();
    const newRoles = new Set(['kindred-role-id', 'ghoul-role-id']);
    expect(detectRoleGains(oldRoles, newRoles, ROLE_IDS)).toEqual(['kindred', 'ghoul']);
  });

  it('detects all three roles gained at once', () => {
    const oldRoles = new Set<string>();
    const newRoles = new Set(['kindred-role-id', 'ghoul-role-id', 'mortal-role-id']);
    expect(detectRoleGains(oldRoles, newRoles, ROLE_IDS)).toEqual(['kindred', 'ghoul', 'mortal']);
  });

  it('skips a role whose ID is unconfigured (empty string)', () => {
    const unconfigured = { kindred: 'kindred-role-id', ghoul: '', mortal: 'mortal-role-id' };
    const oldRoles = new Set<string>();
    const newRoles = new Set(['kindred-role-id', 'ghoul-role-id', 'mortal-role-id']);
    expect(detectRoleGains(oldRoles, newRoles, unconfigured)).toEqual(['kindred', 'mortal']);
  });

  it('is order-independent on input role-id sets', () => {
    const oldRoles = new Set(['ghoul-role-id']);
    const newRoles = new Set(['ghoul-role-id', 'mortal-role-id']);
    expect(detectRoleGains(oldRoles, newRoles, ROLE_IDS)).toEqual(['mortal']);
  });
});
