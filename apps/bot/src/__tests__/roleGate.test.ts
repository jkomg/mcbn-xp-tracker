import { describe, expect, it } from 'vitest';
import { memberHasAnyRole, requiredRoleIds } from '../services/roleGate';

describe('requiredRoleIds', () => {
  it('includes only the configured (non-empty) role IDs', () => {
    const ids = requiredRoleIds({
      passageOfTimeMortalRoleId: 'mortal',
      passageOfTimeGhoulRoleId: '',
      passageOfTimeKindredRoleId: undefined,
      staffRoleSystemHelperId: 'helper',
      staffRoleStorytellerId: 'st',
      staffRoleModeratorId: 'mod',
      staffRoleAdministratorId: 'admin',
    });
    expect(ids).toEqual(['mortal', 'helper', 'st', 'mod', 'admin']);
  });

  it('returns an empty list when nothing is configured', () => {
    expect(requiredRoleIds({})).toEqual([]);
  });
});

describe('memberHasAnyRole', () => {
  const roleIds = ['mortal', 'ghoul', 'kindred', 'admin'];

  it('is false for a null/undefined member (e.g. DM context)', () => {
    expect(memberHasAnyRole(null, roleIds)).toBe(false);
    expect(memberHasAnyRole(undefined, roleIds)).toBe(false);
  });

  it('is false when there are no required role IDs at all', () => {
    const member = { roles: ['mortal'] };
    expect(memberHasAnyRole(member, [])).toBe(false);
  });

  it('checks a raw interaction member (roles as a plain string array)', () => {
    expect(memberHasAnyRole({ roles: ['mortal'] }, roleIds)).toBe(true);
    expect(memberHasAnyRole({ roles: ['some-other-role'] }, roleIds)).toBe(false);
  });

  it('checks a cached GuildMember (roles.cache.has)', () => {
    const cachedMember = { roles: { cache: { has: (id: string) => id === 'admin' } } };
    expect(memberHasAnyRole(cachedMember, roleIds)).toBe(true);

    const unmatchedMember = { roles: { cache: { has: () => false } } };
    expect(memberHasAnyRole(unmatchedMember, roleIds)).toBe(false);
  });
});
