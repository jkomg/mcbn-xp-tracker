/**
 * Cubby Sync Worker
 *
 * Periodically scans Character Cubby Discord channels, diffs against the
 * active roster, and:
 *   - Backfills `ticket_channel_id` on characters whose cubby is found by name
 *   - Retires characters whose cubby channel no longer exists or has been moved
 *     to the "Retired Characters" category
 */

import { ChannelType, type Client } from 'discord.js';
import { errorToMessage, logEvent } from '../logger';
import type { TrackerAdapter } from './adapter';
import {
  isCubbyCategoryName,
  normalizeChannelName,
  resolveRetiredCubbyCategoryIds,
} from './cubbyChannels';

type CubbySyncConfig = {
  enabled: boolean;
  intervalMs: number;
  guildId: string;
  staffChannelId: string;
  retiredCategoryId: string;
  retiredCategoryIds?: string[];
};

export type CubbySyncReport = {
  scannedCharacters: number;
  backfilled: Array<{ name: string; channelId: string }>;
  retired: Array<{ name: string; reason: string }>;
  errors: Array<{ name: string; error: string }>;
};

export class CubbySyncWorker {
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly adapter: TrackerAdapter,
    private readonly client: Client,
    private readonly cfg: CubbySyncConfig,
  ) {}

  start() {
    if (this.timer) return;
    if (!this.cfg.enabled) {
      // Loud and distinct from cubby_sync_worker_started on purpose — this
      // silently no-op'd in production for two days once before (missing
      // CUBBY_SYNC_ENABLED in .env), with nothing but an identical-looking
      // "started" log to suggest it was ever running.
      logEvent('warn', 'cubby_sync_worker_disabled', {
        hint: 'CUBBY_SYNC_ENABLED is not "true" — cubby channel backfill and retirement detection will not run.',
      });
      return;
    }
    this.timer = setInterval(() => {
      void this.tick();
    }, this.cfg.intervalMs);
    this.timer.unref();
    logEvent('info', 'cubby_sync_worker_started', { intervalMs: this.cfg.intervalMs });
    // Run once immediately rather than waiting a full interval — otherwise
    // every bot restart leaves newly-created cubbies unlinked for up to an
    // hour with no visible signal that anything is wrong.
    void this.tick();
  }

  stop() {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  async runSync(): Promise<CubbySyncReport> {
    const report: CubbySyncReport = {
      scannedCharacters: 0,
      backfilled: [],
      retired: [],
      errors: [],
    };

    const guild = await this.client.guilds.fetch(this.cfg.guildId).catch(() => null);
    if (!guild) {
      throw new Error(`Cubby sync: could not fetch guild ${this.cfg.guildId}`);
    }

    // Fetch all channels once
    const allChannels = await guild.channels.fetch();

    // Build sets: parent category IDs for active cubbies
    const activeCubbyParentIds = new Set<string>();
    for (const channel of allChannels.values()) {
      if (!channel || channel.type !== ChannelType.GuildCategory) continue;
      if (isCubbyCategoryName(channel.name)) {
        activeCubbyParentIds.add(channel.id);
      }
    }

    // Build:
    //  activeCubbyChannelIds: Set<channelId> — channels inside active cubby categories
    //  activeCubbyNameMap:    Map<normalizedName, channelId> — for name-based backfill
    //  retiredCubbyChannelIds: Set<channelId> — channels inside any retired category
    const activeCubbyChannelIds = new Set<string>();
    const activeCubbyNameMap = new Map<string, string>();
    const retiredCubbyChannelIds = new Set<string>();

    // Read the same category list the retirement worker moves cubbies into.
    // It overflows into further categories once one hits Discord's 50-channel
    // cap, and a cubby sitting in an overflow category would otherwise be read
    // here as "cubby channel no longer exists".
    const retiredCategoryIds = new Set(
      resolveRetiredCubbyCategoryIds(
        allChannels,
        this.cfg.retiredCategoryIds && this.cfg.retiredCategoryIds.length > 0
          ? this.cfg.retiredCategoryIds
          : [this.cfg.retiredCategoryId],
      ),
    );

    for (const channel of allChannels.values()) {
      if (!channel || channel.type !== ChannelType.GuildText) continue;
      const parentId = channel.parentId ?? '';
      if (activeCubbyParentIds.has(parentId)) {
        activeCubbyChannelIds.add(channel.id);
        activeCubbyNameMap.set(normalizeChannelName(channel.name), channel.id);
      } else if (retiredCategoryIds.has(parentId)) {
        retiredCubbyChannelIds.add(channel.id);
      }
    }

    // Fetch active roster with channel IDs
    const roster = await this.adapter.getActiveRosterWithChannelIds();
    report.scannedCharacters = roster.characters.length;

    for (const { name, ticketChannelId } of roster.characters) {
      try {
        if (ticketChannelId) {
          // Character has a known cubby channel ID — check its current location
          if (activeCubbyChannelIds.has(ticketChannelId)) {
            // Still in an active cubby category — nothing to do
            continue;
          }

          // Channel moved to retired category or deleted entirely
          const reason = retiredCubbyChannelIds.has(ticketChannelId)
            ? 'cubby moved to Retired Characters category'
            : 'cubby channel no longer exists';

          const result = await this.adapter.setCharacterStatus(name, 'retired', 'cubby-sync');
          if (result.ok) {
            report.retired.push({ name, reason });
            logEvent('info', 'cubby_sync_retired', { name, reason });
          } else {
            report.errors.push({ name, error: result.message });
          }
        } else {
          // No channel ID recorded — attempt name-based backfill
          const normalized = normalizeChannelName(name);
          const matchedChannelId = activeCubbyNameMap.get(normalized);
          if (matchedChannelId) {
            const result = await this.adapter.updateCharacterChannelId(name, matchedChannelId, 'cubby-sync');
            if (result.ok) {
              report.backfilled.push({ name, channelId: matchedChannelId });
              logEvent('info', 'cubby_sync_backfilled', { name, channelId: matchedChannelId });
            } else {
              report.errors.push({ name, error: result.message });
            }
          }
          // No match by name and no existing ID — skip (can't confirm retirement)
        }
      } catch (err) {
        report.errors.push({ name, error: errorToMessage(err) });
      }
    }

    return report;
  }

  private async tick() {
    if (!this.cfg.enabled) return;
    if (this.running) return;
    this.running = true;
    try {
      const report = await this.runSync();
      logEvent('info', 'cubby_sync_complete', {
        scanned: report.scannedCharacters,
        backfilled: report.backfilled.length,
        retired: report.retired.length,
        errors: report.errors.length,
      });

      if (this.cfg.staffChannelId && (report.backfilled.length > 0 || report.retired.length > 0 || report.errors.length > 0)) {
        await this._postSummary(report);
      }
    } catch (err) {
      logEvent('warn', 'cubby_sync_error', { error: errorToMessage(err) });
    } finally {
      this.running = false;
    }
  }

  private async _postSummary(report: CubbySyncReport) {
    try {
      const guild = await this.client.guilds.fetch(this.cfg.guildId).catch(() => null);
      if (!guild) return;
      const channel = await guild.channels.fetch(this.cfg.staffChannelId).catch(() => null);
      if (!channel || !('send' in channel)) return;

      const lines: string[] = ['**Cubby Sync Report**'];
      if (report.retired.length > 0) {
        lines.push(`\n**Retired (${report.retired.length}):**`);
        for (const { name, reason } of report.retired) {
          lines.push(`• ${name} — ${reason}`);
        }
      }
      if (report.backfilled.length > 0) {
        lines.push(`\n**Channel ID backfilled (${report.backfilled.length}):**`);
        for (const { name } of report.backfilled) {
          lines.push(`• ${name}`);
        }
      }
      if (report.errors.length > 0) {
        lines.push(`\n**Errors (${report.errors.length}):**`);
        for (const { name, error } of report.errors) {
          lines.push(`• ${name}: ${error}`);
        }
      }

      const content = lines.join('\n').slice(0, 2000);
      await (channel as { send: (opts: { content: string }) => Promise<unknown> }).send({ content });
    } catch (err) {
      logEvent('warn', 'cubby_sync_summary_post_failed', { error: errorToMessage(err) });
    }
  }
}
