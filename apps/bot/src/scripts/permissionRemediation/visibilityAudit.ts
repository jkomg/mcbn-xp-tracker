import { ChannelType, type Guild } from 'discord.js';
import { fetchAllNonThreadChannels, hasOverwrites, overwriteToSnapshotEntry } from './discordHelpers';
import type {
  ChannelVisibilityRow,
  OverwriteSnapshotEntry,
  VisibilityAssertion,
  VisibilityAuditOptions,
  VisibilityAuditReport,
} from './types';

const VIEW_CHANNEL = 1n << 10n;

function findRoleOverwrite(overwrites: OverwriteSnapshotEntry[], id: string): OverwriteSnapshotEntry | undefined {
  return overwrites.find((o) => o.type === 0 && o.id === id);
}

/**
 * The overwrite that actually governs a given role/`@everyone` on this
 * channel: the channel's own entry for that entity if it has one, else the
 * parent category's entry for that entity. This is per-entity fallback, not
 * "use the channel's overwrites as a whole or the category's as a whole" —
 * a channel that overrides @everyone but says nothing about a specific role
 * still inherits that role's category-level entry.
 */
function effectiveOverwrite(
  entityId: string,
  channelOws: OverwriteSnapshotEntry[],
  categoryOws: OverwriteSnapshotEntry[],
): OverwriteSnapshotEntry | undefined {
  return findRoleOverwrite(channelOws, entityId) ?? findRoleOverwrite(categoryOws, entityId);
}

/** Applies one overwrite's deny-then-allow on top of the running tri-state. */
function applyOverwrite(state: boolean | null, ow: OverwriteSnapshotEntry | undefined): boolean | null {
  if (!ow) return state;
  let next = state;
  if (BigInt(ow.deny) & VIEW_CHANNEL) next = false;
  if (BigInt(ow.allow) & VIEW_CHANNEL) next = true;
  return next;
}

/**
 * Resolves whether someone holding only `@everyone` + one specific role can
 * view a channel. Matches Discord's real resolution order: the `@everyone`
 * overwrite sets a baseline, then the role's own overwrite is applied ON TOP
 * of it — so an explicit role-level allow correctly overrides an
 * `@everyone`-level deny (a very common "deny @everyone, allow staff roles"
 * pattern). An earlier version of this function OR'd all deny/allow bits
 * together and let any deny win regardless of source, which made staff-only
 * channels incorrectly report as visible to nobody.
 */
function resolveViewChannel(
  roleId: string,
  everyoneId: string,
  channelOws: OverwriteSnapshotEntry[],
  categoryOws: OverwriteSnapshotEntry[],
): boolean {
  let state: boolean | null = null;
  state = applyOverwrite(state, effectiveOverwrite(everyoneId, channelOws, categoryOws));
  if (roleId !== everyoneId) {
    state = applyOverwrite(state, effectiveOverwrite(roleId, channelOws, categoryOws));
  }
  // Nothing set anywhere means Discord shows the channel by default.
  return state ?? true;
}

/**
 * Report-only: computes effective View Channel visibility per role per
 * channel, plus two concrete config-driven assertions (mod-log channels
 * hidden from @everyone; the honeypot bait channel hidden from the verified
 * member role, if configured). Never mutates anything. Does not account for
 * member-level (per-user) overwrites — a channel with 0 visible roles may
 * still be visible to a specific member via a member-type overwrite (e.g. a
 * character cubby channel), which this audit doesn't inspect.
 */
export async function auditVisibility(guild: Guild, options: VisibilityAuditOptions): Promise<VisibilityAuditReport> {
  const channels = await fetchAllNonThreadChannels(guild);
  const all = [...channels.values()].filter(hasOverwrites);
  const categories = new Map(all.filter((c) => c.type === ChannelType.GuildCategory).map((c) => [c.id, c]));
  const roleIds = guild.roles.cache.map((r) => r.id);

  const rows: ChannelVisibilityRow[] = [];
  for (const channel of all) {
    if (channel.type === ChannelType.GuildCategory) continue;
    const parentId = 'parentId' in channel ? (channel.parentId ?? null) : null;
    const category = parentId ? categories.get(parentId) : undefined;
    const channelOws = channel.permissionOverwrites.cache.map(overwriteToSnapshotEntry);
    const categoryOws = category ? category.permissionOverwrites.cache.map(overwriteToSnapshotEntry) : [];

    const visibleRoleIds: string[] = [];
    for (const roleId of roleIds) {
      if (resolveViewChannel(roleId, guild.id, channelOws, categoryOws)) {
        visibleRoleIds.push(roleId);
      }
    }

    rows.push({
      channelId: channel.id,
      channelName: channel.name,
      parentId,
      categoryName: category?.name ?? null,
      visibleRoleIds,
      visibleToEveryone: visibleRoleIds.includes(guild.id),
    });
  }

  const roleNames: Record<string, string> = {};
  for (const role of guild.roles.cache.values()) {
    roleNames[role.id] = role.id === guild.id ? '@everyone' : role.name;
  }

  const assertions: VisibilityAssertion[] = [];
  for (const modLogId of options.modLogChannelIds.filter(Boolean)) {
    const row = rows.find((r) => r.channelId === modLogId);
    if (!row) continue;
    assertions.push({
      label: 'Mod-log channel hidden from @everyone',
      channelId: modLogId,
      ok: !row.visibleToEveryone,
      detail: row.visibleToEveryone
        ? `#${row.channelName} is visible to @everyone`
        : `#${row.channelName} is not visible to @everyone`,
    });
  }

  if (options.verifiedMemberRoleId && options.honeypotChannelId) {
    const row = rows.find((r) => r.channelId === options.honeypotChannelId);
    if (row) {
      const visible = row.visibleRoleIds.includes(options.verifiedMemberRoleId);
      assertions.push({
        label: 'Honeypot channel hidden from verified members',
        channelId: options.honeypotChannelId,
        ok: !visible,
        detail: visible
          ? `#${row.channelName} is visible to the verified-member role`
          : `#${row.channelName} is correctly hidden from the verified-member role`,
      });
    }
  }

  return { rows, assertions, roleNames };
}
