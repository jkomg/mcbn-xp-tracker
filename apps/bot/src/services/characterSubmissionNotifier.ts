import fs from 'node:fs';
import path from 'node:path';
import { EmbedBuilder, type Client, type TextChannel } from 'discord.js';
import { errorToMessage, logEvent } from '../logger';
import type { TrackerAdapter, CcSubmittedDraft } from './adapter';

const STATE_PATH = path.resolve('./data/cc-submission-cursor.json');

type CursorState = { cursorEpoch: number; seenIds?: string[] };

function loadCursorState(): CursorState | null {
  try {
    const raw = fs.readFileSync(STATE_PATH, 'utf8');
    const parsed = JSON.parse(raw) as CursorState;
    if (typeof parsed.cursorEpoch === 'number') return parsed;
  } catch {
    // missing or corrupt — start from scratch
  }
  return null;
}

function saveCursorState(state: CursorState) {
  try {
    fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
    fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
  } catch (error) {
    logEvent('warn', 'cc_submission_notifier_cursor_save_failed', { error: errorToMessage(error) });
  }
}

const AGE_LABELS: Record<string, string> = {
  mortal: 'Mortal',
  fledgling: 'Fledgling',
  ghoul: 'Ghoul',
  neonate: 'Neonate',
  ancilla: 'Ancilla',
};

function buildEmbed(draft: CcSubmittedDraft): EmbedBuilder {
  const ageLabel = AGE_LABELS[draft.age_category] ?? draft.age_category;
  const description = [
    draft.player_discord_id ? `**Player:** <@${draft.player_discord_id}>` : null,
    draft.clan ? `**Clan:** ${draft.clan}` : null,
    ageLabel ? `**Age:** ${ageLabel}` : null,
    draft.submission_notes
      ? `\n**Notes from player:**\n${draft.submission_notes}`
      : null,
  ]
    .filter(Boolean)
    .join('\n');

  return new EmbedBuilder()
    .setColor(0x8b0000)
    .setTitle(`Character Submitted: ${draft.character_name || '(unnamed)'}`)
    .setDescription(description || 'No details provided.')
    .setFooter({ text: 'Ready for ST review' });
}

type CharacterSubmissionNotifierConfig = {
  enabled: boolean;
  intervalMs: number;
  /** How far back to look on first boot (seconds). Prevents flooding old submissions. */
  lookbackSeconds: number;
};

export class CharacterSubmissionNotifier {
  private readonly client: Client;
  private readonly adapter: TrackerAdapter;
  private readonly config: CharacterSubmissionNotifierConfig;
  private timer: NodeJS.Timeout | null = null;
  private initialized = false;
  private polling = false;
  private cursorEpoch = 0;
  private readonly seenIds = new Set<string>();

  constructor(client: Client, adapter: TrackerAdapter, config: CharacterSubmissionNotifierConfig) {
    this.client = client;
    this.adapter = adapter;
    this.config = config;
  }

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.pollOnce();
    }, this.config.intervalMs);
    this.timer.unref();
    void this.pollOnce();
    logEvent('info', 'cc_submission_notifier_started', { intervalMs: this.config.intervalMs });
  }

  stop() {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  private async pollOnce() {
    if (!this.config.enabled) return;
    if (this.polling) return;
    this.polling = true;
    try {
      const nowEpoch = Math.floor(Date.now() / 1000);

      if (!this.initialized) {
        const saved = loadCursorState();
        if (saved) {
          this.cursorEpoch = saved.cursorEpoch;
          for (const id of saved.seenIds ?? []) this.seenIds.add(id);
          this.initialized = true;
          logEvent('info', 'cc_submission_notifier_resumed', {
            cursorEpoch: this.cursorEpoch,
            seenCount: this.seenIds.size,
          });
          return;
        }
        // No saved state — bootstrap: mark existing submissions as seen without posting.
        this.cursorEpoch = Math.max(0, nowEpoch - this.config.lookbackSeconds);
        const bootstrap = await this.adapter.getCcSubmittedDrafts({
          sinceEpoch: this.cursorEpoch,
          limit: 200,
        });
        for (const draft of bootstrap.events) {
          this.seenIds.add(draft.id);
          this.cursorEpoch = Math.max(this.cursorEpoch, draft.submitted_at_epoch);
        }
        this.initialized = true;
        saveCursorState({ cursorEpoch: this.cursorEpoch, seenIds: [...this.seenIds] });
        logEvent('info', 'cc_submission_notifier_bootstrap', { seenCount: this.seenIds.size });
        return;
      }

      let pages = 0;
      while (pages < 10) {
        const page = await this.adapter.getCcSubmittedDrafts({
          sinceEpoch: this.cursorEpoch,
          limit: 50,
        });
        if (page.events.length === 0) break;

        for (const draft of page.events) {
          this.cursorEpoch = Math.max(this.cursorEpoch, draft.submitted_at_epoch);

          if (this.seenIds.has(draft.id)) continue;
          this.seenIds.add(draft.id);
          if (this.seenIds.size > 2000) {
            const first = this.seenIds.values().next().value;
            if (first) this.seenIds.delete(first);
          }
          saveCursorState({ cursorEpoch: this.cursorEpoch, seenIds: [...this.seenIds] });

          if (!draft.ticket_channel_id) {
            logEvent('warn', 'cc_submission_notifier_no_ticket_channel', {
              draftId: draft.id,
              characterName: draft.character_name,
            });
            continue;
          }

          const channel = await this.client.channels
            .fetch(draft.ticket_channel_id)
            .catch(() => null) as TextChannel | null;

          if (!channel) {
            logEvent('warn', 'cc_submission_notifier_channel_not_found', {
              draftId: draft.id,
              ticketChannelId: draft.ticket_channel_id,
            });
            continue;
          }

          try {
            await channel.send({ embeds: [buildEmbed(draft)] });
            logEvent('info', 'cc_submission_notifier_posted', {
              draftId: draft.id,
              characterName: draft.character_name,
              ticketChannelId: draft.ticket_channel_id,
            });
          } catch (error) {
            logEvent('warn', 'cc_submission_notifier_send_failed', {
              draftId: draft.id,
              ticketChannelId: draft.ticket_channel_id,
              error: errorToMessage(error),
            });
          }
        }

        pages += 1;
        if (!page.hasMore) break;
      }
    } catch (error) {
      logEvent('warn', 'cc_submission_notifier_poll_failed', { error: errorToMessage(error) });
    } finally {
      this.polling = false;
    }
  }
}
