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

/**
 * Resolves whether a single role (in isolation, plus the @everyone baseline)
 * can view a channel given its overwrites — deny beats allow beats "unset".
 * Ported from apps/bot/scripts/check-user-cubby-access.mjs, generalized from
 * "one member's role set" to "every role independently" so the audit can
 * answer "which roles let someone see this channel" rather than "can this
 * one user see it".
 */
function resolveViewChannel(roleId: string, everyoneId: string, overwrites: OverwriteSnapshotEntry[]): boolean | null {
  let allow = 0n;
  let deny = 0n;

  const everyoneOw = overwrites.find((o) => o.type === 0 && o.id === everyoneId);
  if (everyoneOw) {
    allow |= BigInt(everyoneOw.allow);
    deny |= BigInt(everyoneOw.deny);
  }
  if (roleId !== everyoneId) {
    const roleOw = overwrites.find((o) => o.type === 0 && o.id === roleId);
    if (roleOw) {
      allow |= BigInt(roleOw.allow);
      deny |= BigInt(roleOw.deny);
    }
  }

  if (deny & VIEW_CHANNEL) return false;
  if (allow & VIEW_CHANNEL) return true;
  return null; // inherits — from the category, or from Discord's "visible by default" base case
}

/**
 * Report-only: computes effective View Channel visibility per role per
 * channel, plus two concrete config-driven assertions (mod-log channels
 * hidden from @everyone; the honeypot bait channel hidden from the verified
 * member role, if configured). Never mutates anything.
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
      const channelResult = resolveViewChannel(roleId, guild.id, channelOws);
      const categoryResult = resolveViewChannel(roleId, guild.id, categoryOws);
      // Nothing set anywhere means Discord shows the channel by default —
      // unlike the read-only .mjs precedent this ports from, we treat that
      // as visible=true rather than "not counted", since the two assertions
      // below need to catch a channel that's private-by-omission, not just
      // private-by-explicit-deny.
      const effective = channelResult ?? categoryResult ?? true;
      if (effective) visibleRoleIds.push(roleId);
    }

    rows.push({
      channelId: channel.id,
      channelName: channel.name,
      parentId,
      visibleRoleIds,
      visibleToEveryone: visibleRoleIds.includes(guild.id),
    });
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

  return { rows, assertions };
}
