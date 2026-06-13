import fs from 'node:fs';
import path from 'node:path';
import { type TextChannel } from 'discord.js';
import type { BotClient } from '../discord';
import { errorToMessage, logEvent } from '../logger';
import type { TrackerAdapter } from './adapter';
import type { SubmissionEvent } from '../types';
import { liveConfig } from '../liveConfig';

const STATE_PATH = path.resolve('./data/submission-notifier-cursor.json');

type CursorState = { cursorEpoch: number; cursorEventKey: string };

function loadCursorState(): CursorState | null {
  try {
    const raw = fs.readFileSync(STATE_PATH, 'utf8');
    const parsed = JSON.parse(raw) as CursorState;
    if (typeof parsed.cursorEpoch === 'number' && typeof parsed.cursorEventKey === 'string') {
      return parsed;
    }
  } catch {
    // missing or corrupt — bootstrap from scratch
  }
  return null;
}

function saveCursorState(state: CursorState) {
  try {
    fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
    fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
  } catch (error) {
    logEvent('warn', 'submission_notifier_cursor_save_failed', { error: errorToMessage(error) });
  }
}

type SubmissionNotifierConfig = {
  enabled: boolean;
  channelId?: string;
  intervalMs: number;
  lookbackSeconds: number;
};

function playerMention(event: SubmissionEvent): string {
  const id = (event.playerDiscordId ?? '').trim();
  return id ? ` <@${id}>` : '';
}

export function buildSubmissionNotificationMessage(event: SubmissionEvent): string {
  if (event.kind === 'claim') {
    return [
      `**New XP Claim** from **${event.characterName}**${playerMention(event)}`,
      `**Period:** ${event.playPeriod}`,
      `**Requested:** ${event.requestedXp} XP`,
    ].join('\n');
  }
  return [
    `**New Spend Request** from **${event.characterName}**${playerMention(event)}`,
    `**Trait:** ${event.traitName} (${event.currentDots} → ${event.newDots})`,
    `**Category:** ${event.spendCategory}`,
    `**Cost:** ${event.requestedCost} XP`,
  ].join('\n');
}

export class SubmissionNotifier {
  private readonly client: BotClient;
  private readonly adapter: TrackerAdapter;
  private readonly config: SubmissionNotifierConfig;
  private timer: NodeJS.Timeout | null = null;
  private initialized = false;
  private polling = false;
  private cursorEpoch = 0;
  private cursorEventKey = '';
  private readonly seenEventKeys = new Set<string>();

  constructor(client: BotClient, adapter: TrackerAdapter, config: SubmissionNotifierConfig) {
    this.client = client;
    this.adapter = adapter;
    this.config = config;
  }

  start() {
    if (!this.config.channelId) {
      logEvent('warn', 'submission_notifier_disabled_missing_channel');
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
    logEvent('info', 'submission_notifier_started', {
      channelId: this.config.channelId,
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
    if (!liveConfig.submissionNotifierEnabled) return;
    if (this.polling || !this.config.channelId) {
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

          // Re-seed seenEventKeys for the boundary epoch window to prevent
          // duplicate notifications after restart.  Same fix as ReviewNotifier.
          try {
            const warmup = await this.adapter.getSubmissionEvents({
              sinceEpoch: Math.max(0, this.cursorEpoch - 300),
              limit: 250,
            });
            for (const event of warmup.events) {
              if (
                event.submittedAtEpoch < this.cursorEpoch ||
                (event.submittedAtEpoch === this.cursorEpoch &&
                  event.eventKey <= this.cursorEventKey)
              ) {
                this.seenEventKeys.add(event.eventKey);
              }
            }
          } catch {
            // Non-fatal: worst case is one duplicate notification on this restart cycle.
          }

          this.initialized = true;
          logEvent('info', 'submission_notifier_resumed', {
            cursorEpoch: this.cursorEpoch,
            cursorEventKey: this.cursorEventKey,
            seenOnResume: this.seenEventKeys.size,
          });
          return;
        }

        // No saved state — bootstrap: mark all existing submissions as seen without posting.
        this.cursorEpoch = Math.max(0, nowEpoch - this.config.lookbackSeconds);
        let pages = 0;
        while (pages < 20) {
          const page = await this.adapter.getSubmissionEvents({
            sinceEpoch: this.cursorEpoch,
            sinceEventKey: this.cursorEventKey || undefined,
            limit: 250,
          });
          for (const event of page.events) {
            this.cursorEpoch = event.submittedAtEpoch;
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
        logEvent('info', 'submission_notifier_bootstrap', { seenEvents: this.seenEventKeys.size });
        return;
      }

      // Fetch the channel once per poll.
      const channel = await this.client.channels
        .fetch(this.config.channelId)
        .catch(() => null) as TextChannel | null;
      if (!channel) {
        logEvent('warn', 'submission_notifier_channel_not_found', {
          channelId: this.config.channelId,
        });
        return;
      }

      let pages = 0;
      while (pages < 20) {
        const page = await this.adapter.getSubmissionEvents({
          sinceEpoch: this.cursorEpoch,
          sinceEventKey: this.cursorEventKey || undefined,
          limit: 250,
        });
        if (page.events.length === 0) {
          break;
        }

        for (const event of page.events) {
          if (this.seenEventKeys.has(event.eventKey)) {
            this.cursorEpoch = event.submittedAtEpoch;
            this.cursorEventKey = event.eventKey;
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
          this.cursorEpoch = event.submittedAtEpoch;
          this.cursorEventKey = event.eventKey;
          saveCursorState({ cursorEpoch: this.cursorEpoch, cursorEventKey: this.cursorEventKey });

          try {
            await channel.send({ content: buildSubmissionNotificationMessage(event) });
          } catch (error) {
            logEvent('warn', 'submission_notifier_send_failed', {
              eventKey: event.eventKey,
              channelId: channel.id,
              error: errorToMessage(error),
            });
            continue;
          }

          logEvent('info', 'submission_notifier_posted', {
            eventKey: event.eventKey,
            channelId: channel.id,
            characterName: event.characterName,
            kind: event.kind,
          });
        }

        pages += 1;
        if (!page.hasMore) {
          break;
        }
      }
    } catch (error) {
      logEvent('warn', 'submission_notifier_poll_failed', { error: errorToMessage(error) });
    } finally {
      this.polling = false;
    }
  }
}
