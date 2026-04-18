import { REST, Routes } from 'discord.js';

export interface DiscordChannel {
  id: string;
  name: string;
  type: number;
  parent_id?: string;
  topic?: string;
}

export interface DiscordThread {
  id: string;
  name: string;
  parent_id: string;
  type: number;
  thread_metadata?: { archive_timestamp?: string };
}

export interface DiscordAttachment {
  url: string;
  content_type?: string;
  filename: string;
}

export interface DiscordMessage {
  id: string;
  content: string;
  author: { id: string; username: string; global_name?: string };
  timestamp: string;
  attachments?: DiscordAttachment[];
}

export interface DiscordGuildMember {
  user?: { id: string; username: string; global_name?: string };
  nick?: string;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchAllMessages(
  rest: REST,
  channelId: string,
  limit: number,
  pause: (ms: number) => Promise<void> = sleep,
): Promise<DiscordMessage[]> {
  const all: DiscordMessage[] = [];
  let before: string | undefined;
  while (all.length < limit) {
    const batch = Math.min(100, limit - all.length);
    const params = new URLSearchParams({ limit: String(batch) });
    if (before) params.set('before', before);
    const msgs = await rest.get(`${Routes.channelMessages(channelId)}?${params}`) as DiscordMessage[];
    if (!msgs.length) break;
    all.push(...msgs);
    before = msgs[msgs.length - 1].id;
    if (msgs.length < 100) break;
    await pause(250);
  }
  return all.reverse(); // oldest first
}

export async function fetchPins(rest: REST, channelId: string): Promise<DiscordMessage[]> {
  return rest.get(Routes.channelPins(channelId)) as Promise<DiscordMessage[]>;
}

export async function fetchGuildMember(
  rest: REST,
  guildId: string,
  userId: string,
): Promise<DiscordGuildMember | null> {
  try {
    return await rest.get(Routes.guildMember(guildId, userId)) as DiscordGuildMember;
  } catch {
    return null;
  }
}

/**
 * Fetch all threads for a forum channel (active + archived).
 * Active threads come from the guild-wide endpoint; archived are paginated per-channel.
 */
export async function fetchForumThreads(
  rest: REST,
  guildId: string,
  forumChannelId: string,
  pause: (ms: number) => Promise<void> = sleep,
): Promise<DiscordThread[]> {
  const threads: DiscordThread[] = [];

  // Active threads (guild-wide, filter to this forum)
  const active = await rest.get(Routes.guildActiveThreads(guildId)) as { threads: DiscordThread[] };
  for (const t of active.threads) {
    if (t.parent_id === forumChannelId) threads.push(t);
  }
  await pause(200);

  // Archived threads (paginated, forum-specific)
  let before: string | undefined;
  for (;;) {
    const params = new URLSearchParams({ limit: '100' });
    if (before) params.set('before', before);
    const archived = await rest.get(
      `/channels/${forumChannelId}/threads/archived/public?${params}`,
    ) as { threads: DiscordThread[]; has_more: boolean };
    threads.push(...archived.threads);
    if (!archived.has_more || !archived.threads.length) break;
    before = archived.threads[archived.threads.length - 1].id;
    await pause(250);
  }

  return threads;
}
