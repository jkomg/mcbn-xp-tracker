import type { Client, GuildMember, PartialGuildMember } from 'discord.js';
import { errorToMessage, logEvent } from '../logger';
import type { TrackerAdapter } from './adapter';

export interface MemberEventTrackerConfig {
  guildId: string;
  /** Kindred/Ghoul/Mortal role IDs — reused from the passage-of-time config. */
  roleIds: { kindred: string; ghoul: string; mortal: string };
}

type MemberEvent = { discord_id: string; event_type: 'join' | 'role_gain'; role: string; date: string };

const RECORD_BATCH_SIZE = 500; // matches the API endpoint's per-request cap

function utcDateOf(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Detect which of the tracked roles (kindred/ghoul/mortal) transitioned
 * false→true between an old and new role-ID set. Pure and exported so this
 * can be unit tested without constructing full GuildMember/discord.js mocks.
 */
export function detectRoleGains(
  oldRoleIds: Set<string>,
  newRoleIds: Set<string>,
  roleIds: { kindred: string; ghoul: string; mortal: string },
): string[] {
  const gains: string[] = [];
  for (const [name, id] of Object.entries(roleIds)) {
    if (!id) continue;
    if (!oldRoleIds.has(id) && newRoleIds.has(id)) gains.push(name);
  }
  return gains;
}

/**
 * Tracks two "lurker → active player" growth signals for the Server Health
 * dashboard: new members joining the guild, and members gaining the
 * Kindred/Ghoul/Mortal role for the first time. Stores discrete events
 * (never running counts — see discordActivityTracker's corruption incident
 * this design deliberately avoids repeating), so the startup backfill below
 * is safe to run on every bot restart: re-reporting an already-recorded
 * event is a plain idempotent no-op server-side.
 */
export class MemberEventTracker {
  private readonly client: Client;
  private readonly adapter: TrackerAdapter;
  private readonly guildId: string;
  private readonly roleIds: { kindred: string; ghoul: string; mortal: string };

  constructor(client: Client, adapter: TrackerAdapter, config: MemberEventTrackerConfig) {
    this.client = client;
    this.adapter = adapter;
    this.guildId = config.guildId;
    this.roleIds = config.roleIds;
  }

  start(): void {
    void this.backfillJoins();
    this.client.on('guildMemberAdd', (member) => {
      void this.handleJoin(member);
    });
    this.client.on('guildMemberUpdate', (oldMember, newMember) => {
      void this.handleRoleUpdate(oldMember, newMember);
    });
  }

  /**
   * One-time-per-restart sweep of everyone currently in the guild, recording
   * a join event dated at their actual joinedAt. Gives free historical join
   * data for anyone still present (can't recover joins for people who've
   * since left — a real Discord API limitation, not a gap in this design).
   */
  private async backfillJoins(): Promise<void> {
    if (!this.guildId) return;
    try {
      const guild = await this.client.guilds.fetch(this.guildId);
      await guild.members.fetch();

      const events: MemberEvent[] = [];
      const names: Record<string, string> = {};
      for (const [, member] of guild.members.cache) {
        if (!member.joinedAt) continue;
        events.push({ discord_id: member.id, event_type: 'join', role: '', date: utcDateOf(member.joinedAt) });
        names[member.id] = member.displayName;
      }

      for (let i = 0; i < events.length; i += RECORD_BATCH_SIZE) {
        const batch = events.slice(i, i + RECORD_BATCH_SIZE);
        await this.adapter.recordMemberEvents(batch, i === 0 ? names : undefined);
      }
      logEvent('info', 'member_event_backfill_done', { count: events.length });
    } catch (err) {
      logEvent('warn', 'member_event_backfill_failed', { error: errorToMessage(err) });
    }
  }

  private async handleJoin(member: GuildMember): Promise<void> {
    if (member.guild.id !== this.guildId) return;
    try {
      const date = utcDateOf(member.joinedAt ?? new Date());
      await this.adapter.recordMemberEvents(
        [{ discord_id: member.id, event_type: 'join', role: '', date }],
        { [member.id]: member.displayName },
      );
      logEvent('info', 'member_event_join', { discordId: member.id });
    } catch (err) {
      logEvent('warn', 'member_event_join_failed', { discordId: member.id, error: errorToMessage(err) });
    }
  }

  private async handleRoleUpdate(
    oldMember: GuildMember | PartialGuildMember,
    newMember: GuildMember | PartialGuildMember,
  ): Promise<void> {
    if (newMember.guild.id !== this.guildId) return;

    const gains = detectRoleGains(
      new Set(oldMember.roles.cache.keys()),
      new Set(newMember.roles.cache.keys()),
      this.roleIds,
    );
    if (gains.length === 0) return;

    try {
      const date = utcDateOf(new Date());
      const events: MemberEvent[] = gains.map((role) => ({
        discord_id: newMember.id,
        event_type: 'role_gain',
        role,
        date,
      }));
      await this.adapter.recordMemberEvents(events, { [newMember.id]: newMember.displayName });
      logEvent('info', 'member_event_role_gain', { discordId: newMember.id, roles: gains });
    } catch (err) {
      logEvent('warn', 'member_event_role_gain_failed', { discordId: newMember.id, error: errorToMessage(err) });
    }
  }
}
