import type { REST } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';
import {
  fetchAllMessages,
  fetchForumThreads,
  fetchGuildMember,
  fetchThreadStarterMessage,
} from '../scripts/notionSync/discordIngest';

function message(id: string) {
  return {
    id,
    content: `msg-${id}`,
    author: { id: `u-${id}`, username: `user-${id}` },
    timestamp: '2026-04-18T00:00:00.000Z',
    attachments: [],
  };
}

describe('discordIngest helpers', () => {
  it('fetchAllMessages paginates and returns oldest-first ordering', async () => {
    const firstPage = Array.from({ length: 100 }, (_, i) => message(String(200 - i)));
    const secondPage = Array.from({ length: 20 }, (_, i) => message(String(100 - i)));
    const get = vi.fn()
      .mockResolvedValueOnce(firstPage)
      .mockResolvedValueOnce(secondPage);
    const rest = { get } as unknown as REST;

    const result = await fetchAllMessages(rest, 'chan-1', 120, async () => {});

    expect(get).toHaveBeenCalledTimes(2);
    expect(String(get.mock.calls[1][0])).toContain(`before=${firstPage[firstPage.length - 1].id}`);
    expect(result).toHaveLength(120);
    expect(result[0]?.id).toBe(secondPage[secondPage.length - 1].id);
    expect(result[result.length - 1]?.id).toBe(firstPage[0].id);
  });

  it('fetchAllMessages returns empty when no messages are present', async () => {
    const get = vi.fn().mockResolvedValueOnce([]);
    const rest = { get } as unknown as REST;

    const result = await fetchAllMessages(rest, 'chan-1', 50, async () => {});

    expect(get).toHaveBeenCalledTimes(1);
    expect(result).toEqual([]);
  });

  it('fetchGuildMember returns null on API errors', async () => {
    const get = vi.fn().mockRejectedValueOnce(new Error('not found'));
    const rest = { get } as unknown as REST;

    const result = await fetchGuildMember(rest, 'guild-1', 'user-1');

    expect(result).toBeNull();
  });

  it('fetchThreadStarterMessage fetches the message with the same ID as the thread', async () => {
    const starter = message('thread-1');
    const get = vi.fn().mockResolvedValueOnce(starter);
    const rest = { get } as unknown as REST;

    const result = await fetchThreadStarterMessage(rest, 'thread-1');

    expect(String(get.mock.calls[0][0])).toBe('/channels/thread-1/messages/thread-1');
    expect(result).toEqual(starter);
  });

  it('fetchThreadStarterMessage returns null on API errors', async () => {
    const get = vi.fn().mockRejectedValueOnce(new Error('unknown message'));
    const rest = { get } as unknown as REST;

    const result = await fetchThreadStarterMessage(rest, 'thread-1');

    expect(result).toBeNull();
  });

  it('fetchForumThreads merges active and archived forum threads', async () => {
    const get = vi.fn()
      .mockResolvedValueOnce({
        threads: [
          { id: 'active-forum', name: 'Active Forum', parent_id: 'forum-1', type: 11 },
          { id: 'active-other', name: 'Active Other', parent_id: 'forum-2', type: 11 },
        ],
      })
      .mockResolvedValueOnce({
        threads: [
          { id: 'arch-2', name: 'Archived 2', parent_id: 'forum-1', type: 11 },
          { id: 'arch-1', name: 'Archived 1', parent_id: 'forum-1', type: 11 },
        ],
        has_more: true,
      })
      .mockResolvedValueOnce({
        threads: [
          { id: 'arch-0', name: 'Archived 0', parent_id: 'forum-1', type: 11 },
        ],
        has_more: false,
      });
    const rest = { get } as unknown as REST;

    const result = await fetchForumThreads(rest, 'guild-1', 'forum-1', async () => {});

    expect(get).toHaveBeenCalledTimes(3);
    expect(String(get.mock.calls[1][0])).toContain('/channels/forum-1/threads/archived/public?');
    expect(String(get.mock.calls[2][0])).toContain('before=arch-1');
    expect(result.map((t) => t.id)).toEqual(['active-forum', 'arch-2', 'arch-1', 'arch-0']);
  });
});
