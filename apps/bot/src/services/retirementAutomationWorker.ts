import {
  ChannelType,
  Guild,
  ThreadAutoArchiveDuration,
  type AnyThreadChannel,
  type Client,
  type ForumChannel,
  type Message,
} from 'discord.js';
import { config } from '../config';
import { errorToMessage, logEvent } from '../logger';
import type { TrackerAdapter } from './adapter';
import { isCubbyCategoryName, normalizeChannelName } from './cubbyChannels';
import { messagesToMarkdown, type DiscordMessageForWiki } from '../scripts/notionSync/wikiSyncHelpers';

export type RetirementAutomationConfig = {
  enabled: boolean;
  intervalMs: number;
  guildId: string;
  retiredCubbyCategoryId: string;
  childrenForumId: string;
  retiredForumId: string;
  wikiBatchEnabled: boolean;
  wikiBatchHourLocal: number;
  wikiBatchMinuteLocal: number;
  wikiBatchTimezone: string;
  notifyChannelId: string;
};

type RollbackAction = {
  label: string;
  run: () => Promise<void>;
};

function localParts(now: Date, timezone: string): { dateKey: string; hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const pick = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return {
    dateKey: `${pick('year')}-${pick('month')}-${pick('day')}`,
    hour: Number.parseInt(pick('hour'), 10) || 0,
    minute: Number.parseInt(pick('minute'), 10) || 0,
  };
}

function chunkText(value: string, max = 1_900): string[] {
  if (value.length <= max) {
    return [value];
  }
  const chunks: string[] = [];
  let remaining = value;
  while (remaining.length > max) {
    let cut = remaining.lastIndexOf('\n\n', max);
    if (cut < 0 || cut < Math.floor(max / 2)) {
      cut = max;
    }
    chunks.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

async function collectThreadMessages(thread: AnyThreadChannel, limit = 200): Promise<Message[]> {
  const messages: Message[] = [];
  let before: string | undefined;
  while (messages.length < limit) {
    const batch = await thread.messages.fetch({ limit: Math.min(100, limit - messages.length), before });
    if (batch.size === 0) break;
    const ordered = Array.from(batch.values()).sort((a, b) => a.createdTimestamp - b.createdTimestamp);
    messages.push(...ordered);
    before = ordered[0]?.id;
    if (batch.size < 100) break;
  }
  return messages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
}

async function findForumThreadByName(forum: ForumChannel, characterName: string): Promise<AnyThreadChannel | null> {
  const target = normalizeChannelName(characterName);
  const active = await forum.threads.fetchActive().catch(() => null);
  for (const thread of active?.threads.values() ?? []) {
    if (normalizeChannelName(thread.name) === target) return thread;
  }
  const archived = await forum.threads.fetchArchived().catch(() => null);
  for (const thread of archived?.threads.values() ?? []) {
    if (normalizeChannelName(thread.name) === target) return thread;
  }
  return null;
}

export class RetirementAutomationWorker {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private lastTickTime: Date;
  private batchDates = new Set<string>();

  constructor(
    private readonly adapter: TrackerAdapter,
    private readonly client: Client,
    private readonly cfg: RetirementAutomationConfig,
  ) {
    this.lastTickTime = new Date(Date.now() - cfg.intervalMs);
  }

  start(): void {
    if (this.timer) return;
    if (!this.cfg.enabled) {
      // Loud and distinct from retirement_automation_worker_started on
      // purpose — this has no liveConfig mirror, so a wrong env var here
      // would otherwise persist silently for the process's entire lifetime
      // with no dashboard visibility (the same shape as the cubby-sync
      // incident). Defaults to enabled, but don't let a future explicit
      // RETIREMENT_AUTOMATION_ENABLED=false go unnoticed either.
      logEvent('warn', 'retirement_automation_worker_disabled', {
        hint: 'RETIREMENT_AUTOMATION_ENABLED is not "true" — retirement job processing will not run.',
      });
      return;
    }
    this.timer = setInterval(() => {
      void this.tick();
    }, this.cfg.intervalMs);
    this.timer.unref();
    void this.tick();
    logEvent('info', 'retirement_automation_worker_started', {
      intervalMs: this.cfg.intervalMs,
      wikiBatchEnabled: this.cfg.wikiBatchEnabled,
    });
  }

  private async tick(): Promise<void> {
    if (!this.cfg.enabled || this.running) return;
    this.running = true;
    try {
      const guild = await this.client.guilds.fetch(this.cfg.guildId).catch(() => null);
      if (!guild) {
        throw new Error(`Retirement automation: could not fetch guild ${this.cfg.guildId}`);
      }

      const pending = await this.adapter.getPendingRetirementJobs();
      for (const job of pending.jobs) {
        try {
          await this.processJob(guild, job);
        } catch (err) {
          logEvent('warn', 'retirement_automation_job_failed', {
            jobId: job.id,
            characterName: job.characterName,
            error: errorToMessage(err),
          });
        }
      }

      if (this.cfg.wikiBatchEnabled && !config.wikiSyncEnabled) {
        await this.maybeRequestWikiBatch();
      }
    } catch (err) {
      logEvent('warn', 'retirement_automation_tick_failed', { error: errorToMessage(err) });
    } finally {
      this.running = false;
    }
  }

  private async processJob(
    guild: Guild,
    job: { id: number; characterName: string; cubbyChannelId: string | null },
  ): Promise<void> {
    const rollbackActions: RollbackAction[] = [];
    try {
      const cubbyChannelId = await this.moveCubbyChannel(guild, job.characterName, job.cubbyChannelId, rollbackActions);
      const threads = await this.cloneChildrenThreadToRetiredForum(guild, job.characterName, rollbackActions);
      await this.adapter.completeRetirementJobDiscordWork(job.id, {
        cubbyChannelId,
        childrenSourceThreadId: threads.sourceThreadId,
        childrenRetiredThreadId: threads.retiredThreadId,
      });
      logEvent('info', 'retirement_automation_job_completed', {
        jobId: job.id,
        characterName: job.characterName,
        cubbyChannelId,
        sourceThreadId: threads.sourceThreadId,
        retiredThreadId: threads.retiredThreadId,
      });
      await this.notifyCompletion(guild, job.characterName, {
        cubbyChannelId,
        retiredThreadId: threads.retiredThreadId,
      });
    } catch (err) {
      const rollbackFailures = await this.rollback(rollbackActions, job);
      const error = errorToMessage(err);
      const details = rollbackFailures.length
        ? `${error} | rollback failed: ${rollbackFailures.join('; ')}`
        : error;
      try {
        await this.adapter.failRetirementJobDiscordWork(job.id, { error: details });
      } catch (reportErr) {
        logEvent('error', 'retirement_automation_failure_report_failed', {
          jobId: job.id,
          characterName: job.characterName,
          error: errorToMessage(reportErr),
          originalError: details,
        });
      }
      throw new Error(details);
    }
  }

  private async rollback(
    actions: RollbackAction[],
    job: { id: number; characterName: string },
  ): Promise<string[]> {
    const failures: string[] = [];
    while (actions.length > 0) {
      const action = actions.pop();
      if (!action) continue;
      try {
        await action.run();
      } catch (err) {
        const failure = `${action.label}: ${errorToMessage(err)}`;
        failures.push(failure);
        logEvent('error', 'retirement_automation_rollback_failed', {
          jobId: job.id,
          characterName: job.characterName,
          rollbackAction: action.label,
          error: errorToMessage(err),
        });
      }
    }
    if (failures.length === 0) {
      logEvent('info', 'retirement_automation_rollback_succeeded', {
        jobId: job.id,
        characterName: job.characterName,
      });
    }
    return failures;
  }

  private async notifyCompletion(
    guild: Guild,
    characterName: string,
    result: { cubbyChannelId: string | null; retiredThreadId: string | null },
  ): Promise<void> {
    if (!this.cfg.notifyChannelId) return;
    const channel = await guild.channels.fetch(this.cfg.notifyChannelId).catch(() => null);
    if (!channel || !('send' in channel)) return;

    const parts: string[] = [`⚰️ **${characterName}** retired — Discord automation complete.`];
    if (result.cubbyChannelId) {
      parts.push(`• Cubby moved → <#${result.cubbyChannelId}>`);
    } else {
      parts.push(`• Cubby: no channel on file, skipped.`);
    }
    if (result.retiredThreadId) {
      parts.push(`• Children of the Night thread cloned → <#${result.retiredThreadId}>`);
    } else {
      parts.push(`• Children of the Night: no active thread found, skipped.`);
    }

    await (channel as { send: (opts: { content: string }) => Promise<unknown> }).send({
      content: parts.join('\n'),
    });
  }

  private async moveCubbyChannel(
    guild: Guild,
    characterName: string,
    knownChannelId: string | null,
    rollbackActions: RollbackAction[],
  ): Promise<string | null> {
    const allChannels = await guild.channels.fetch();
    let channel = knownChannelId ? await guild.channels.fetch(knownChannelId).catch(() => null) : null;

    if (!channel) {
      const target = normalizeChannelName(characterName);
      const activeParentIds = new Set<string>();
      for (const candidate of allChannels.values()) {
        if (candidate?.type === ChannelType.GuildCategory &&
            isCubbyCategoryName(candidate.name)) {
          activeParentIds.add(candidate.id);
        }
      }
      for (const candidate of allChannels.values()) {
        if (candidate?.type === ChannelType.GuildText &&
            candidate.parentId &&
            activeParentIds.has(candidate.parentId) &&
            normalizeChannelName(candidate.name) === target) {
          channel = candidate;
          break;
        }
      }
    }

    if (!channel) {
      logEvent('warn', 'retirement_cubby_not_found', { characterName });
      return null;
    }

    if (
      channel &&
      'setParent' in channel &&
      typeof channel.setParent === 'function' &&
      'parentId' in channel &&
      channel.parentId !== this.cfg.retiredCubbyCategoryId
    ) {
      const previousParentId = channel.parentId;
      await channel.setParent(this.cfg.retiredCubbyCategoryId, {
        lockPermissions: false,
        reason: `Character retired: ${characterName}`,
      });
      rollbackActions.push({
        label: 'restore_cubby_parent',
        run: async () => {
          if (!previousParentId) return;
          await channel.setParent(previousParentId, {
            lockPermissions: false,
            reason: `Undo retirement automation for ${characterName}`,
          });
        },
      });
    }
    return channel.id;
  }

  private async cloneChildrenThreadToRetiredForum(
    guild: Guild,
    characterName: string,
    rollbackActions: RollbackAction[],
  ): Promise<{ sourceThreadId: string | null; retiredThreadId: string | null }> {
    const sourceChannel = await guild.channels.fetch(this.cfg.childrenForumId).catch(() => null);
    const retiredChannel = await guild.channels.fetch(this.cfg.retiredForumId).catch(() => null);
    if (sourceChannel?.type !== ChannelType.GuildForum || retiredChannel?.type !== ChannelType.GuildForum) {
      throw new Error('Children/retired forums are not accessible as forum channels.');
    }
    const sourceForum = sourceChannel as ForumChannel;
    const retiredForum = retiredChannel as ForumChannel;

    const existingRetired = await findForumThreadByName(retiredForum, characterName);
    const sourceThread = await findForumThreadByName(sourceForum, characterName);
    if (!sourceThread && existingRetired) {
      return { sourceThreadId: null, retiredThreadId: existingRetired.id };
    }
    if (!sourceThread) {
      logEvent('warn', 'retirement_children_thread_missing', { characterName });
      return { sourceThreadId: null, retiredThreadId: existingRetired?.id ?? null };
    }
    if (existingRetired) {
      // Unconditionally unarchive before locking — thread.archived is boolean | null in
      // Discord.js so a conditional check silently skips when null, leaving setLocked to throw.
      await sourceThread.setArchived(false, `Preparing to lock: ${characterName}`).catch(() => null);
      // Register rollback before the lock/archive sequence so any failure in that sequence
      // is covered (otherwise the thread would be left unarchived with no rollback).
      rollbackActions.push({
        label: 'restore_source_thread_open_state',
        run: async () => {
          await sourceThread.setLocked(false, `Undo retirement automation for ${characterName}`);
          await sourceThread.setArchived(false, `Undo retirement automation for ${characterName}`);
        },
      });
      await sourceThread.setLocked(true, `Character retired: ${characterName}`);
      await sourceThread.setArchived(true, `Character retired: ${characterName}`);
      return { sourceThreadId: sourceThread.id, retiredThreadId: existingRetired.id };
    }

    const messages = await collectThreadMessages(sourceThread);
    const wikiMessages: DiscordMessageForWiki[] = messages.map((message) => ({
      content: message.content,
      author: {
        username: message.author.username,
        global_name: message.author.globalName ?? undefined,
      },
      timestamp: message.createdAt.toISOString(),
      attachments: [...message.attachments.values()].map((attachment) => ({
        url: attachment.url,
        content_type: attachment.contentType ?? undefined,
        filename: attachment.name ?? 'attachment',
      })),
    }));

    const transcript = messagesToMarkdown(wikiMessages).trim();
    const sourceUrl = sourceThread.url;
    const content = transcript
      ? `Imported from ${sourceUrl}\n\n${transcript}`
      : `Imported retired profile from ${sourceUrl}`;
    const chunks = chunkText(content);

    const newThread = await retiredForum.threads.create({
      name: sourceThread.name,
      autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
      message: { content: chunks[0] ?? `Imported from ${sourceUrl}` },
      reason: `Character retired: ${characterName}`,
    });
    rollbackActions.push({
      label: 'delete_retired_forum_clone',
      run: async () => {
        await newThread.delete(`Undo retirement automation for ${characterName}`);
      },
    });
    for (const chunk of chunks.slice(1)) {
      await newThread.send({ content: chunk });
    }

    await sourceThread.setArchived(false, `Preparing to lock: ${characterName}`).catch(() => null);
    // Register rollback before the lock/archive sequence so any failure in that sequence
    // is covered (otherwise the thread would be left unarchived with no rollback).
    rollbackActions.push({
      label: 'restore_source_thread_open_state',
      run: async () => {
        await sourceThread.setLocked(false, `Undo retirement automation for ${characterName}`);
        await sourceThread.setArchived(false, `Undo retirement automation for ${characterName}`);
      },
    });
    await sourceThread.setLocked(true, `Character retired: ${characterName}`);
    await sourceThread.setArchived(true, `Character retired: ${characterName}`);
    return { sourceThreadId: sourceThread.id, retiredThreadId: newThread.id };
  }

  private async maybeRequestWikiBatch(): Promise<void> {
    const now = new Date();
    const parts = localParts(now, this.cfg.wikiBatchTimezone);
    const prevParts = localParts(this.lastTickTime, this.cfg.wikiBatchTimezone);
    this.lastTickTime = now;

    const targetMin = this.cfg.wikiBatchHourLocal * 60 + this.cfg.wikiBatchMinuteLocal;
    const nowMin = parts.hour * 60 + parts.minute;
    const prevMin = prevParts.hour * 60 + prevParts.minute;
    if (nowMin < targetMin || prevMin >= targetMin) {
      return;
    }
    if (this.batchDates.has(parts.dateKey)) {
      return;
    }
    this.batchDates.add(parts.dateKey);
    if (this.batchDates.size > 7) {
      const sorted = Array.from(this.batchDates).sort();
      for (const key of sorted.slice(0, sorted.length - 7)) {
        this.batchDates.delete(key);
      }
    }

    const result = await this.adapter.requestRetirementWikiBatch();
    logEvent('info', 'retirement_wiki_batch_checked', result);
  }
}
