/**
 * Bot-wide access gate: an interaction may only be handled if the invoking
 * member holds a player-status role (Mortal, Ghoul, Kindred) or a staff role
 * (System Helper, Storyteller, Moderator, Administrator). Blocks unverified
 * accounts (e.g. spammers who just joined) from using any bot command,
 * button, modal, or autocomplete. Staff (config.testerDiscordIds) always
 * bypass, matching the existing kill-switch convention in commandGating.ts.
 */

type RoleCollectionMember = { roles: { cache: { has(id: string): boolean } } };
type RawInteractionMember = { roles: string[] };
export type RoleCheckableMember = RoleCollectionMember | RawInteractionMember | null | undefined;

export function requiredRoleIds(config: {
  passageOfTimeMortalRoleId?: string | null;
  passageOfTimeGhoulRoleId?: string | null;
  passageOfTimeKindredRoleId?: string | null;
  staffRoleSystemHelperId?: string | null;
  staffRoleStorytellerId?: string | null;
  staffRoleModeratorId?: string | null;
  staffRoleAdministratorId?: string | null;
}): string[] {
  return [
    config.passageOfTimeMortalRoleId,
    config.passageOfTimeGhoulRoleId,
    config.passageOfTimeKindredRoleId,
    config.staffRoleSystemHelperId,
    config.staffRoleStorytellerId,
    config.staffRoleModeratorId,
    config.staffRoleAdministratorId,
  ].filter((id): id is string => Boolean(id));
}

export function memberHasAnyRole(member: RoleCheckableMember, roleIds: string[]): boolean {
  if (!member || roleIds.length === 0) return false;
  const roles = member.roles;
  if (Array.isArray(roles)) {
    return roleIds.some((id) => roles.includes(id));
  }
  return roleIds.some((id) => roles.cache.has(id));
}
