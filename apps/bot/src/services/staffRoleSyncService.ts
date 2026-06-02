import type { Client, GuildMember, PartialGuildMember } from 'discord.js';
import { errorToMessage, logEvent } from '../logger';
import type { TrackerAdapter } from './adapter';

export interface StaffRoleSyncConfig {
  guildId: string;
  /** Map from Discord role ID → internal role value (e.g. 'storyteller') */
  roleMap: Map<string, string>;
}

type StaffOp = { action: 'upsert' | 'remove'; discord_id: string; display_name: string; role: string };

const ROLE_PRIORITY = ['administrator', 'moderator', 'storyteller', 'system_helper'];

export class StaffRoleSyncService {
  private readonly client: Client;
  private readonly adapter: TrackerAdapter;
  private readonly guildId: string;
  private readonly roleMap: Map<string, string>;

  constructor(client: Client, adapter: TrackerAdapter, config: StaffRoleSyncConfig) {
    this.client = client;
    this.adapter = adapter;
    this.guildId = config.guildId;
    this.roleMap = config.roleMap;
  }

  start(): void {
    void this.syncAll();
    this.client.on('guildMemberUpdate', (oldMember, newMember) => {
      void this.handleMemberUpdate(oldMember, newMember);
    });
  }

  private getHighestRole(member: GuildMember | PartialGuildMember): string | null {
    const memberRoleIds = new Set(member.roles.cache.keys());
    const roleValues = new Set<string>();
    for (const [roleId, roleValue] of this.roleMap) {
      if (memberRoleIds.has(roleId)) roleValues.add(roleValue);
    }
    for (const role of ROLE_PRIORITY) {
      if (roleValues.has(role)) return role;
    }
    return null;
  }

  private async syncAll(): Promise<void> {
    if (!this.guildId) return;
    try {
      const guild = await this.client.guilds.fetch(this.guildId);
      await guild.members.fetch();

      const operations: StaffOp[] = [];
      for (const [, member] of guild.members.cache) {
        const role = this.getHighestRole(member);
        if (role) {
          operations.push({
            action: 'upsert',
            discord_id: member.id,
            display_name: member.displayName,
            role,
          });
        }
      }

      await this.adapter.syncStaff(operations, true);
      logEvent('info', 'staff_role_sync_all', { count: operations.length });
    } catch (err) {
      logEvent('warn', 'staff_role_sync_all_failed', { error: errorToMessage(err) });
    }
  }

  private async handleMemberUpdate(
    oldMember: GuildMember | PartialGuildMember,
    newMember: GuildMember | PartialGuildMember,
  ): Promise<void> {
    if (newMember.guild.id !== this.guildId) return;

    const oldRole = this.getHighestRole(oldMember);
    const newRole = this.getHighestRole(newMember);

    if (oldRole === newRole) return;

    try {
      if (newRole) {
        await this.adapter.syncStaff([{
          action: 'upsert',
          discord_id: newMember.id,
          display_name: newMember.displayName,
          role: newRole,
        }]);
        logEvent('info', 'staff_role_sync_upsert', { discordId: newMember.id, role: newRole });
      } else {
        await this.adapter.syncStaff([{
          action: 'remove',
          discord_id: newMember.id,
          display_name: newMember.displayName,
          role: '',
        }]);
        logEvent('info', 'staff_role_sync_remove', { discordId: newMember.id });
      }
    } catch (err) {
      logEvent('warn', 'staff_role_sync_update_failed', { discordId: newMember.id, error: errorToMessage(err) });
    }
  }
}
