import fs from 'node:fs';
import path from 'node:path';
import { EmbedBuilder, type Client, type TextChannel } from 'discord.js';
import { errorToMessage, logEvent } from '../logger';
import type { TrackerAdapter, CcApprovedDraft } from './adapter';

const STATE_PATH = path.resolve('./data/cc-approval-cursor.json');

type CursorState = { cursorEpoch: number };

function loadCursorState(): CursorState | null {
  try {
    const raw = fs.readFileSync(STATE_PATH, 'utf8');
    const parsed = JSON.parse(raw) as CursorState;
    if (typeof parsed.cursorEpoch === 'number') return parsed;
  } catch {
    // missing or corrupt — start fresh
  }
  return null;
}

function saveCursorState(state: CursorState) {
  try {
    fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
    fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
  } catch (error) {
    logEvent('warn', 'cc_approval_notifier_cursor_save_failed', { error: errorToMessage(error) });
  }
}

const AGE_LABELS: Record<string, string> = {
  mortal: 'Mortal',
  fledgling: 'Fledgling',
  ghoul: 'Ghoul',
  neonate: 'Neonate',
  ancilla: 'Ancilla',
  elder: 'Elder',
};

function buildEmbed(draft: CcApprovedDraft): EmbedBuilder {
  const ageLabel = AGE_LABELS[draft.age_category.toLowerCase()] ?? draft.age_category;
  const lines = [
    draft.player_discord_id ? `**Player:** <@${draft.player_discord_id}>` : null,
    draft.clan ? `**Clan:** ${draft.clan}` : null,
    ageLabel ? `**Age:** ${ageLabel}` : null,
    draft.predator_type ? `**Predator Type:** ${draft.predator_type}` : null,
  ].filter(Boolean);

  return new EmbedBuilder()
    .setColor(0x8b0000)
    .setTitle(`✅ Character Approved: ${draft.character_name || '(unnamed)'}`)
    .setDescription(lines.join('\n') || 'No details provided.')
    .setFooter({ text: `Approved by ${draft.approved_by || 'staff'}` });
}

export type CharacterApprovalNotifierConfig = {
  enabled: boolean;
  channelId: string;
  intervalMs: number;
  /** How far back to look on first boot (seconds). Prevents re-posting old approvals. */
  lookbackSeconds: number;
};

export class CharacterApprovalNotifier {
  private readonly client: Client;
  private readonly adapter: TrackerAdapter;
  private readonly config: CharacterApprovalNotifierConfig;
  private timer: NodeJS.Timeout | null = null;
  private initialized = false;
  private polling = false;
  private cursorEpoch = 0;
  private readonly seenIds = new Set<string>();

  constructor(client: Client, adapter: TrackerAdapter, config: CharacterApprovalNotifierConfig) {
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
    logEvent('info', 'cc_approval_notifier_started', { intervalMs: this.config.intervalMs });
  }

  stop() {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  private async pollOnce() {
    if (!this.config.enabled || !this.config.channelId) return;
    if (this.polling) return;
    this.polling = true;
    try {
      const nowEpoch = Math.floor(Date.now() / 1000);

      if (!this.initialized) {
        const saved = loadCursorState();
        if (saved) {
          this.cursorEpoch = saved.cursorEpoch;
          this.initialized = true;
          logEvent('info', 'cc_approval_notifier_resumed', { cursorEpoch: this.cursorEpoch });
          return;
        }
        // No saved state — bootstrap: mark existing approvals as seen without posting.
        this.cursorEpoch = Math.max(0, nowEpoch - this.config.lookbackSeconds);
        const bootstrap = await this.adapter.getCcApprovedDrafts({
          sinceEpoch: this.cursorEpoch,
          limit: 200,
        });
        for (const draft of bootstrap.events) {
          this.seenIds.add(draft.id);
          if (draft.approved_at_epoch > this.cursorEpoch) {
            this.cursorEpoch = draft.approved_at_epoch;
          }
        }
        this.initialized = true;
        saveCursorState({ cursorEpoch: this.cursorEpoch });
        logEvent('info', 'cc_approval_notifier_bootstrapped', {
          cursorEpoch: this.cursorEpoch,
          seenCount: this.seenIds.size,
        });
        return;
      }

      const { events } = await this.adapter.getCcApprovedDrafts({
        sinceEpoch: this.cursorEpoch,
        limit: 50,
      });

      const channel = events.length > 0
        ? await this.client.channels.fetch(this.config.channelId).catch(() => null)
        : null;

      for (const draft of events) {
        if (this.seenIds.has(draft.id)) continue;
        this.seenIds.add(draft.id);

        if (channel && channel.isTextBased() && 'send' in channel) {
          try {
            await (channel as TextChannel).send({
              content: draft.player_discord_id ? `<@${draft.player_discord_id}>` : undefined,
              embeds: [buildEmbed(draft)],
            });
            logEvent('info', 'cc_approval_notifier_posted', { characterName: draft.character_name });
          } catch (err) {
            logEvent('warn', 'cc_approval_notifier_post_failed', {
              characterName: draft.character_name,
              error: errorToMessage(err),
            });
          }
        }

        if (draft.approved_at_epoch > this.cursorEpoch) {
          this.cursorEpoch = draft.approved_at_epoch;
          saveCursorState({ cursorEpoch: this.cursorEpoch });
        }
      }
    } catch (err) {
      logEvent('warn', 'cc_approval_notifier_poll_error', { error: errorToMessage(err) });
    } finally {
      this.polling = false;
    }
  }
}
