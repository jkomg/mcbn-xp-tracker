import type { Client } from 'discord.js';
import { errorToMessage, logEvent } from '../logger';
import { currentIcNightKey } from './icNightTracker';
import { activeSunsetSchedule } from './sunsetSchedule';
import type { TrackerAdapter } from './adapter';

type RumorExpiryWorkerConfig = {
  intervalMs: number;
};

/**
 * Expires approved ephemeral rumors once the IC night they were posted in
 * has ended: deletes the live #rumors message and marks the rumor expired.
 * Ticks independently of the sunset broadcast — no event hook exists for
 * "a new night started" (see PassageOfTimeService), so this just re-derives
 * the current night key each tick and compares it against what was stamped
 * on the rumor at approval time.
 */
export class RumorExpiryWorker {
  private readonly client: Client;
  private readonly adapter: TrackerAdapter;
  private readonly config: RumorExpiryWorkerConfig;
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(client: Client, adapter: TrackerAdapter, config: RumorExpiryWorkerConfig) {
    this.client = client;
    this.adapter = adapter;
    this.config = config;
  }

  start() {
    if (this.timer) {
      return;
    }
    this.timer = setInterval(() => {
      void this.tick();
    }, this.config.intervalMs);
    this.timer.unref();
    void this.tick();
    logEvent('info', 'rumor_expiry_worker_started', { intervalMs: this.config.intervalMs });
  }

  stop() {
    if (!this.timer) {
      return;
    }
    clearInterval(this.timer);
    this.timer = null;
  }

  private async tick() {
    // Deliberately NOT gated on liveConfig.rumorApprovalEnabled: that flag only
    // controls whether *new* rumors go through approval. Turning it off must
    // not orphan ephemeral rumors that were already approved while it was on —
    // cleanup keeps running; listActiveEphemeralRumors() just returns nothing
    // once there's nothing left to expire.
    if (this.running) {
      return;
    }
    this.running = true;
    try {
      const currentKey = currentIcNightKey(new Date(), activeSunsetSchedule());
      if (!currentKey) {
        logEvent('debug', 'rumor_expiry_worker_no_night_key');
        return;
      }

      const rumors = await this.adapter.listActiveEphemeralRumors();
      const stale = rumors.filter((r) => r.ic_night_key && r.ic_night_key !== currentKey);
      if (!stale.length) return;

      const requester = {
        requesterDiscordId: this.client.user?.id ?? '',
        requesterDiscordName: this.client.user?.username ?? 'Rumor Expiry',
      };
      if (!requester.requesterDiscordId) {
        logEvent('warn', 'rumor_expiry_worker_no_client_user');
        return;
      }

      let expired = 0;
      let failed = 0;
      for (const rumor of stale) {
        try {
          // Only mark expired once the message is confirmed gone (deleted here,
          // already gone — Discord's "Unknown Message", or the channel itself no
          // longer exists). Any other failure (rate limit, transient permission
          // issue) must NOT be treated as success: expireRumor drops the rumor
          // from listActiveEphemeralRumors(), so a false-positive here means the
          // "one night only" message stays visible forever with no retry.
          let messageGone = true;
          if (rumor.posted_channel_id && rumor.posted_message_id) {
            const channel = await this.client.channels.fetch(rumor.posted_channel_id).catch(() => null);
            if (channel && channel.isTextBased() && 'messages' in channel) {
              messageGone = false;
              try {
                await channel.messages.delete(rumor.posted_message_id);
                messageGone = true;
              } catch (delErr) {
                const code = (delErr as { code?: number } | null)?.code;
                if (code === 10008) {
                  // Unknown Message — already deleted (e.g. manually). Fine to proceed.
                  messageGone = true;
                } else {
                  logEvent('warn', 'rumor_expiry_worker_delete_failed', { rumorId: rumor.id, error: errorToMessage(delErr) });
                }
              }
            }
            // else: channel itself is gone/unreachable — nothing left to delete.
          }

          if (!messageGone) {
            failed += 1;
            continue;
          }

          const result = await this.adapter.expireRumor(rumor.id, requester);
          if (result.ok) {
            expired += 1;
          } else {
            failed += 1;
            logEvent('warn', 'rumor_expiry_worker_expire_failed', { rumorId: rumor.id, reason: result.message });
          }
        } catch (error) {
          failed += 1;
          logEvent('warn', 'rumor_expiry_worker_item_error', { rumorId: rumor.id, error: errorToMessage(error) });
        }
      }

      logEvent('info', 'rumor_expiry_worker_run_complete', { currentKey, expired, failed });
    } catch (error) {
      logEvent('warn', 'rumor_expiry_worker_error', { error: errorToMessage(error) });
    } finally {
      this.running = false;
    }
  }
}
