import type { Guild } from 'discord.js';
import type { BotClient } from '../discord';
import { errorToMessage, logEvent } from '../logger';
import type { TrackerAdapter } from './adapter';
import type { ReviewEvent } from '../types';
import { findCubbyChannel } from './cubbyChannels';

type ReviewNotifierConfig = {
  enabled: boolean;
  guildId?: string;
  intervalMs: number;
  lookbackSeconds: number;
};

function eventStatusLabel(status: 'approved' | 'denied'): string {
  return status === 'approved' ? 'Approved' : 'Denied';
}

function toNotificationMessage(event: ReviewEvent): string {
  if (event.kind === 'claim') {
    const base = [
      `XP claim **${eventStatusLabel(event.status)}** for **${event.characterName}**`,
      `Period: **${event.playPeriod}**`,
      `Requested: **${event.requestedXp} XP**`,
    ];
    if (event.status === 'approved') {
      base.push(`Granted: **${event.approvedXp} XP**`);
    }
    if (event.staffNotes.trim()) {
      base.push(`ST notes: ${event.staffNotes.trim()}`);
    }
    return base.join('\n');
  }

  const base = [
    `XP spend **${eventStatusLabel(event.status)}** for **${event.characterName}**`,
    `Trait: **${event.traitName}** (${event.currentDots} -> ${event.newDots})`,
    `Category: **${event.spendCategory}**`,
    `Requested: **${event.requestedCost} XP**`,
  ];
  if (event.status === 'approved') {
    base.push(`Verified: **${event.verifiedCost} XP**`);
  }
  if (event.staffNotes.trim()) {
    base.push(`ST notes: ${event.staffNotes.trim()}`);
  }
  return base.join('\n');
}

export class ReviewNotifier {
  private readonly client: BotClient;
  private readonly adapter: TrackerAdapter;
  private readonly config: ReviewNotifierConfig;
  private timer: NodeJS.Timeout | null = null;
  private initialized = false;
  private polling = false;
  private lastSeenEpoch = 0;
  private readonly seenEventKeys = new Set<string>();

  constructor(client: BotClient, adapter: TrackerAdapter, config: ReviewNotifierConfig) {
    this.client = client;
    this.adapter = adapter;
    this.config = config;
  }

  start() {
    if (!this.config.enabled) {
      return;
    }
    if (!this.config.guildId) {
      logEvent('warn', 'review_notifier_disabled_missing_guild');
      return;
    }
    if (this.timer) {
      return;
    }
    this.timer = setInterval(() => {
      void this.pollOnce();
    }, this.config.intervalMs);
    this.timer.unref();
    void this.pollOnce();
    logEvent('info', 'review_notifier_started', {
      guildId: this.config.guildId,
      intervalMs: this.config.intervalMs,
      lookbackSeconds: this.config.lookbackSeconds,
    });
  }

  stop() {
    if (!this.timer) {
      return;
    }
    clearInterval(this.timer);
    this.timer = null;
  }

  private async pollOnce() {
    if (this.polling || !this.config.guildId) {
      return;
    }
    this.polling = true;
    try {
      const nowEpoch = Math.floor(Date.now() / 1000);
      const fallbackSince = Math.max(0, nowEpoch - this.config.lookbackSeconds);
      const sinceEpoch = Math.max(fallbackSince, this.lastSeenEpoch - 1);
      const events = await this.adapter.getReviewEvents({ sinceEpoch, limit: 250 });
      events.sort((a, b) => a.reviewedAtEpoch - b.reviewedAtEpoch);

      if (!this.initialized) {
        for (const event of events) {
          this.seenEventKeys.add(event.eventKey);
          this.lastSeenEpoch = Math.max(this.lastSeenEpoch, event.reviewedAtEpoch);
        }
        this.initialized = true;
        logEvent('info', 'review_notifier_bootstrap', { seenEvents: this.seenEventKeys.size });
        return;
      }

      const guild = await this.client.guilds.fetch(this.config.guildId).catch(() => null);
      if (!guild) {
        logEvent('warn', 'review_notifier_guild_not_found', { guildId: this.config.guildId });
        return;
      }

      for (const event of events) {
        this.lastSeenEpoch = Math.max(this.lastSeenEpoch, event.reviewedAtEpoch);
        if (this.seenEventKeys.has(event.eventKey)) {
          continue;
        }
        this.seenEventKeys.add(event.eventKey);
        if (this.seenEventKeys.size > 5000) {
          const first = this.seenEventKeys.values().next().value;
          if (first) {
            this.seenEventKeys.delete(first);
          }
        }

        const channel = await findCubbyChannel(guild, event.characterName);
        if (!channel) {
          logEvent('warn', 'review_notifier_channel_missing', {
            characterName: event.characterName,
            eventKey: event.eventKey,
          });
          continue;
        }

        await channel.send({ content: toNotificationMessage(event) });
        logEvent('info', 'review_notifier_posted', {
          eventKey: event.eventKey,
          channelId: channel.id,
          characterName: event.characterName,
          kind: event.kind,
          status: event.status,
        });
      }
    } catch (error) {
      logEvent('warn', 'review_notifier_poll_failed', { error: errorToMessage(error) });
    } finally {
      this.polling = false;
    }
  }
}
