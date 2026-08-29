import fs from 'node:fs';
import path from 'node:path';
import type { Guild } from 'discord.js';
import type { BotClient } from '../discord';
import { errorToMessage, logEvent } from '../logger';
import { writeJsonStateFile } from './stateFile';
import type { TrackerAdapter } from './adapter';
import type { ReviewEvent } from '../types';
import { buildCubbyChannelMap, findClosestChannelName, normalizeChannelName, type NotificationChannel } from './cubbyChannels';
import { liveConfig } from '../liveConfig';

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
    writeJsonStateFile(STATE_PATH, state);
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
    base.push(`**Reviewed by:** ${event.reviewedBy}`);
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
  base.push(`**Reviewed by:** ${event.reviewedBy}`);
  if (event.staffNotes.trim()) {
    base.push(`**ST Notes:** ${event.staffNotes.trim()}`);
  }
  return base.join('\n');
}

/**
 * Resolve a cubby channel for a character name.
 * First tries an exact normalized match; if that fails, falls back to
 * matching on just the first word of the character name.  If the fallback
 * is ambiguous (multiple channels share the same first-word prefix) the
 * notification is skipped and an error is logged.
 */
function resolveChannel(
  channelMap: Map<string, NotificationChannel>,
  characterName: string,
  eventKey: string,
): NotificationChannel | null {
  const fullKey = normalizeChannelName(characterName);
  const exact = channelMap.get(fullKey);
  if (exact) return exact;

  // First-name fallback: find channels whose normalized name is exactly
  // the first word of the character name (e.g. "sylvester" for "Sylvester Glass").
  // Prefix matching is intentionally excluded to avoid routing to unrelated
  // channels that happen to share the same prefix.
  const firstName = fullKey.split('-')[0];
  const candidates: NotificationChannel[] = [];
  for (const [key, ch] of channelMap) {
    if (key === firstName) {
      candidates.push(ch);
    }
  }

  if (candidates.length === 1) {
    logEvent('warn', 'review_notifier_channel_first_name_fallback', {
      characterName,
      channelName: candidates[0].name,
      eventKey,
    });
    return candidates[0];
  }

  if (candidates.length > 1) {
    logEvent('error', 'review_notifier_channel_ambiguous', {
      characterName,
      candidates: candidates.map((c) => c.name),
      eventKey,
    });
    return null;
  }

  const suggestedChannel = findClosestChannelName(fullKey, channelMap.keys());
  logEvent('error', 'review_notifier_channel_missing', {
    characterName,
    eventKey,
    ...(suggestedChannel ? { suggestedChannel } : {}),
  });
  return null;
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
    if (!liveConfig.reviewNotifierEnabled) return;
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

          // Re-seed seenEventKeys for the boundary epoch window.
          //
          // Event keys embed the DB row ID as a plain string (e.g. "spend:14:..." vs
          // "spend:136:..."), so the server-side string comparison used to filter the
          // same-epoch boundary can produce wrong results: "spend:14" > "spend:136"
          // lexicographically even though 14 < 136.  In normal operation seenEventKeys
          // catches these; on a cold restart it's empty, causing duplicates.
          //
          // Fix: fetch a 5-minute window ending at the cursor and mark everything at or
          // before the cursor as seen before the first real poll runs.
          try {
            const warmup = await this.adapter.getReviewEvents({
              sinceEpoch: Math.max(0, this.cursorEpoch - 300),
              limit: 250,
            });
            for (const event of warmup.events) {
              if (
                event.reviewedAtEpoch < this.cursorEpoch ||
                (event.reviewedAtEpoch === this.cursorEpoch &&
                  event.eventKey <= this.cursorEventKey)
              ) {
                this.seenEventKeys.add(event.eventKey);
              }
            }
          } catch {
            // Non-fatal: worst case is one duplicate notification on this restart cycle.
          }

          this.initialized = true;
          logEvent('info', 'review_notifier_resumed', {
            cursorEpoch: this.cursorEpoch,
            cursorEventKey: this.cursorEventKey,
            seenOnResume: this.seenEventKeys.size,
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

        // Build channel map once per page to avoid one API round-trip per event.
        const channelMap = await buildCubbyChannelMap(guild);

        for (const event of page.events) {
          if (this.seenEventKeys.has(event.eventKey)) {
            this.cursorEpoch = event.reviewedAtEpoch;
            this.cursorEventKey = event.eventKey;
            continue;
          }

          const channel = resolveChannel(channelMap, event.characterName, event.eventKey);
          if (!channel) {
            // Advance cursor so we don't re-attempt on next poll.
            this.seenEventKeys.add(event.eventKey);
            if (this.seenEventKeys.size > 5000) {
              const first = this.seenEventKeys.values().next().value;
              if (first) this.seenEventKeys.delete(first);
            }
            this.cursorEpoch = event.reviewedAtEpoch;
            this.cursorEventKey = event.eventKey;
            saveCursorState({ cursorEpoch: this.cursorEpoch, cursorEventKey: this.cursorEventKey });
            continue;
          }

          // Advance cursor before sending so a crash between send and save
          // causes a missed notification rather than a duplicate.
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

          try {
            await channel.send({
              content: buildReviewNotificationMessage(event),
              allowedMentions: { parse: ['users'] },
            });
          } catch (error) {
            logEvent('warn', 'review_notifier_send_failed', {
              eventKey: event.eventKey,
              channelId: channel.id,
              error: errorToMessage(error),
            });
            continue;
          }

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
