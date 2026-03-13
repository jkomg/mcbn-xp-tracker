import fs from 'node:fs';
import path from 'node:path';
import type { Guild } from 'discord.js';
import type { BotClient } from '../discord';
import { errorToMessage, logEvent } from '../logger';
import type { TrackerAdapter } from './adapter';
import type { ReviewEvent } from '../types';
import { findCubbyChannel } from './cubbyChannels';

const STATE_PATH = path.resolve('./data/review-notifier-cursor.json');

type CursorState = { cursorEpoch: number; cursorEventKey: string };

function loadCursorState(): CursorState | null {
  try {
    const raw = fs.readFileSync(STATE_PATH, 'utf8');
    const parsed = JSON.parse(raw) as CursorState;
    if (typeof parsed.cursorEpoch === 'number' && typeof parsed.cursorEventKey === 'string') {
      return parsed;
    }
  } catch {
    // missing or corrupt — fall through to bootstrap
  }
  return null;
}

function saveCursorState(state: CursorState) {
  try {
    fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
    fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
  } catch (error) {
    logEvent('warn', 'review_notifier_cursor_save_failed', { error: errorToMessage(error) });
  }
}

type ReviewNotifierConfig = {
  enabled: boolean;
  guildId?: string;
  intervalMs: number;
  lookbackSeconds: number;
};

function statusLabel(status: 'approved' | 'denied'): string {
  return status === 'approved' ? 'Approved' : 'Denied';
}

function playerMention(event: ReviewEvent): string {
  const id = (event.playerDiscordId ?? '').trim();
  return id ? ` <@${id}>` : '';
}

export function buildReviewNotificationMessage(event: ReviewEvent): string {
  if (event.kind === 'claim') {
    const base = [
      `**XP Claim** ${statusLabel(event.status)} for ${event.characterName}${playerMention(event)}`,
      `**Period:** ${event.playPeriod}`,
      `**Requested:** ${event.requestedXp} XP`,
    ];
    if (event.status === 'approved') {
      base.push(`**Granted:** ${event.approvedXp} XP`);
    }
    if (event.staffNotes.trim()) {
      base.push(`**ST Notes:** ${event.staffNotes.trim()}`);
    }
    return base.join('\n');
  }

  const base = [
    `**XP Spend** ${statusLabel(event.status)} for ${event.characterName}${playerMention(event)}`,
    `**Trait:** ${event.traitName} (${event.currentDots} → ${event.newDots})`,
    `**Category:** ${event.spendCategory}`,
    `**Requested:** ${event.requestedCost} XP`,
  ];
  if (event.status === 'approved') {
    base.push(`**Verified:** ${event.verifiedCost} XP`);
    base.push('Next step: upload your updated character sheet and notify a system helper.');
  }
  if (event.staffNotes.trim()) {
    base.push(`**ST Notes:** ${event.staffNotes.trim()}`);
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
  private cursorEpoch = 0;
  private cursorEventKey = '';
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
      if (!this.initialized) {
        const saved = loadCursorState();
        if (saved) {
          this.cursorEpoch = saved.cursorEpoch;
          this.cursorEventKey = saved.cursorEventKey;
          this.initialized = true;
          logEvent('info', 'review_notifier_resumed', {
            cursorEpoch: this.cursorEpoch,
            cursorEventKey: this.cursorEventKey,
          });
          return;
        }

        this.cursorEpoch = Math.max(0, nowEpoch - this.config.lookbackSeconds);
        let pages = 0;
        while (pages < 20) {
          const page = await this.adapter.getReviewEvents({
            sinceEpoch: this.cursorEpoch,
            sinceEventKey: this.cursorEventKey || undefined,
            limit: 250,
          });
          for (const event of page.events) {
            this.cursorEpoch = event.reviewedAtEpoch;
            this.cursorEventKey = event.eventKey;
            this.seenEventKeys.add(event.eventKey);
          }
          pages += 1;
          if (!page.hasMore || page.events.length === 0) {
            break;
          }
        }
        this.initialized = true;
        saveCursorState({ cursorEpoch: this.cursorEpoch, cursorEventKey: this.cursorEventKey });
        logEvent('info', 'review_notifier_bootstrap', { seenEvents: this.seenEventKeys.size });
        return;
      }

      const guild = await this.client.guilds.fetch(this.config.guildId).catch(() => null);
      if (!guild) {
        logEvent('warn', 'review_notifier_guild_not_found', { guildId: this.config.guildId });
        return;
      }

      let pages = 0;
      while (pages < 20) {
        const page = await this.adapter.getReviewEvents({
          sinceEpoch: this.cursorEpoch,
          sinceEventKey: this.cursorEventKey || undefined,
          limit: 250,
        });
        if (page.events.length === 0) {
          break;
        }

        for (const event of page.events) {
          if (this.seenEventKeys.has(event.eventKey)) {
            this.cursorEpoch = event.reviewedAtEpoch;
            this.cursorEventKey = event.eventKey;
            continue;
          }

          const channel = await findCubbyChannel(guild, event.characterName);
          if (!channel) {
            logEvent('warn', 'review_notifier_channel_missing', {
              characterName: event.characterName,
              eventKey: event.eventKey,
            });
            continue;
          }

          try {
            await channel.send({ content: buildReviewNotificationMessage(event) });
          } catch (error) {
            logEvent('warn', 'review_notifier_send_failed', {
              eventKey: event.eventKey,
              channelId: channel.id,
              error: errorToMessage(error),
            });
            continue;
          }

          this.seenEventKeys.add(event.eventKey);
          if (this.seenEventKeys.size > 5000) {
            const first = this.seenEventKeys.values().next().value;
            if (first) {
              this.seenEventKeys.delete(first);
            }
          }
          this.cursorEpoch = event.reviewedAtEpoch;
          this.cursorEventKey = event.eventKey;
          saveCursorState({ cursorEpoch: this.cursorEpoch, cursorEventKey: this.cursorEventKey });

          logEvent('info', 'review_notifier_posted', {
            eventKey: event.eventKey,
            channelId: channel.id,
            characterName: event.characterName,
            kind: event.kind,
            status: event.status,
          });
        }

        pages += 1;
        if (!page.hasMore) {
          break;
        }
      }
    } catch (error) {
      logEvent('warn', 'review_notifier_poll_failed', { error: errorToMessage(error) });
    } finally {
      this.polling = false;
    }
  }
}
