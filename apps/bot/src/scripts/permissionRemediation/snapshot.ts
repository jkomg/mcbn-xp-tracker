import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Guild, OverwriteType } from 'discord.js';
import { fetchAllNonThreadChannels, hasOverwrites, overwriteToSnapshotEntry } from './discordHelpers';
import type {
  ChannelSnapshotEntry,
  PermissionSnapshot,
  RestoreResult,
  RoleSnapshotEntry,
  SnapshotFileMeta,
  SnapshotTrigger,
} from './types';

const REASON = 'Permission remediation rollback';

/** apps/bot/permission-snapshots/ — sibling to this module's src/scripts dir. */
export function defaultSnapshotDir(): string {
  return path.resolve(__dirname, '..', '..', '..', 'permission-snapshots');
}

export async function captureSnapshot(
  guild: Guild,
  opts: { modulesRun: PermissionSnapshot['modulesRun']; triggeredBy: SnapshotTrigger },
): Promise<PermissionSnapshot> {
  const roles = await guild.roles.fetch();
  const channels = await fetchAllNonThreadChannels(guild);

  const roleEntries: RoleSnapshotEntry[] = roles.map((role) => ({
    id: role.id,
    name: role.name,
    position: role.position,
    mentionable: role.mentionable,
    permissions: role.permissions.bitfield.toString(),
    managed: role.managed,
  }));

  const channelEntries: ChannelSnapshotEntry[] = [];
  let overwritesCaptured = 0;
  for (const channel of channels.values()) {
    if (!hasOverwrites(channel)) continue;
    const overwrites = channel.permissionOverwrites.cache.map(overwriteToSnapshotEntry);
    overwritesCaptured += overwrites.length;
    channelEntries.push({
      id: channel.id,
      name: channel.name,
      type: channel.type as unknown as number,
      parentId: 'parentId' in channel ? (channel.parentId ?? null) : null,
      permissionOverwrites: overwrites,
    });
  }

  return {
    schemaVersion: 1,
    guildId: guild.id,
    guildName: guild.name,
    createdAt: new Date().toISOString(),
    triggeredBy: opts.triggeredBy,
    modulesRun: opts.modulesRun,
    summary: {
      rolesCaptured: roleEntries.length,
      channelsCaptured: channelEntries.length,
      overwritesCaptured,
    },
    roles: roleEntries,
    channels: channelEntries,
  };
}

function timestampForFilename(iso: string): string {
  return iso.replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z').replace('T', '-').replace('Z', '');
}

export async function writeSnapshot(snapshot: PermissionSnapshot, dir?: string): Promise<string> {
  const targetDir = dir ?? defaultSnapshotDir();
  await mkdir(targetDir, { recursive: true });
  const fileName = `snapshot-${timestampForFilename(snapshot.createdAt)}.json`;
  const fullPath = path.join(targetDir, fileName);
  await writeFile(fullPath, JSON.stringify(snapshot, null, 2), 'utf8');
  return fullPath;
}

export async function readSnapshot(filePath: string): Promise<PermissionSnapshot> {
  const raw = await readFile(filePath, 'utf8');
  return JSON.parse(raw) as PermissionSnapshot;
}

export async function listSnapshots(dir?: string, limit = 10): Promise<SnapshotFileMeta[]> {
  const targetDir = dir ?? defaultSnapshotDir();
  let fileNames: string[];
  try {
    fileNames = (await readdir(targetDir)).filter((f) => f.startsWith('snapshot-') && f.endsWith('.json'));
  } catch {
    return []; // directory doesn't exist yet — no snapshots taken
  }
  fileNames.sort((a, b) => b.localeCompare(a)); // timestamp-in-filename sorts correctly, descending
  const chosen = fileNames.slice(0, limit);

  const metas: SnapshotFileMeta[] = [];
  for (const fileName of chosen) {
    const fullPath = path.join(targetDir, fileName);
    try {
      const snapshot = await readSnapshot(fullPath);
      metas.push({
        path: fullPath,
        fileName,
        createdAt: snapshot.createdAt,
        triggeredBy: snapshot.triggeredBy,
        modulesRun: snapshot.modulesRun,
        summary: snapshot.summary,
      });
    } catch {
      // Skip unreadable/corrupt snapshot files rather than failing the whole listing.
    }
  }
  return metas;
}

export async function restoreSnapshot(guild: Guild, snapshot: PermissionSnapshot): Promise<RestoreResult> {
  const result: RestoreResult = {
    rolesRestored: [],
    rolesSkipped: [],
    channelsRestored: [],
    channelsSkipped: [],
  };

  for (const entry of snapshot.roles) {
    const live = await guild.roles.fetch(entry.id).catch(() => null);
    if (!live) {
      result.rolesSkipped.push({ roleId: entry.id, roleName: entry.name, reason: 'role no longer exists' });
      continue;
    }
    if (live.managed) {
      result.rolesSkipped.push({ roleId: entry.id, roleName: entry.name, reason: 'managed role, cannot edit' });
      continue;
    }
    const me = guild.members.me;
    if (!me || me.roles.highest.comparePositionTo(live) <= 0) {
      result.rolesSkipped.push({
        roleId: entry.id,
        roleName: entry.name,
        reason: 'role is above the bot in the hierarchy',
      });
      continue;
    }
    try {
      if (live.mentionable !== entry.mentionable) {
        await live.setMentionable(entry.mentionable, REASON);
      }
      if (live.permissions.bitfield.toString() !== entry.permissions) {
        await live.setPermissions(BigInt(entry.permissions), REASON);
      }
      result.rolesRestored.push(entry.id);
    } catch (error) {
      result.rolesSkipped.push({
        roleId: entry.id,
        roleName: entry.name,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  for (const entry of snapshot.channels) {
    const live = await guild.channels.fetch(entry.id).catch(() => null);
    if (!live) {
      result.channelsSkipped.push({ channelId: entry.id, channelName: entry.name, reason: 'channel no longer exists' });
      continue;
    }
    if (!hasOverwrites(live)) {
      result.channelsSkipped.push({
        channelId: entry.id,
        channelName: entry.name,
        reason: 'channel type has no overwrites',
      });
      continue;
    }
    try {
      const overwriteData = entry.permissionOverwrites.map((o) => ({
        id: o.id,
        type: o.type as unknown as OverwriteType,
        allow: BigInt(o.allow),
        deny: BigInt(o.deny),
      }));
      await live.permissionOverwrites.set(overwriteData, REASON);
      result.channelsRestored.push(entry.id);
    } catch (error) {
      result.channelsSkipped.push({
        channelId: entry.id,
        channelName: entry.name,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  return result;
}
