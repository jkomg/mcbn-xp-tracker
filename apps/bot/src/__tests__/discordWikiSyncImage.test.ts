import type { REST } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';
import { firstImageInThread } from '../scripts/discord-wiki-sync';

vi.mock('../config', () => ({
  config: {
    botToken: 'bot-token',
    discordGuildId: 'guild-1',
    webAppBaseUrl: 'https://web.example',
    webAppApiToken: 'legacy-token',
    webAppApiReadToken: 'read-token',
    webAppApiWriteToken: 'write-token',
  },
}));

function messageWithImage(id: string, url: string) {
  return {
    id,
    content: `msg-${id}`,
    author: { id: `u-${id}`, username: `user-${id}` },
    timestamp: '2026-04-18T00:00:00.000Z',
    attachments: [{ url, filename: 'portrait.png' }],
  };
}

function messageWithoutImage(id: string) {
  return {
    id,
    content: `msg-${id}`,
    author: { id: `u-${id}`, username: `user-${id}` },
    timestamp: '2026-04-18T00:00:00.000Z',
  };
}

describe('firstImageInThread', () => {
  it('uses the recent-message window when it already covers the whole thread', async () => {
    const get = vi.fn();
    const rest = { get } as unknown as REST;
    const msgs = [messageWithoutImage('1'), messageWithImage('2', 'https://cdn/recent.png')];

    // fewer messages than the fetch limit → the window includes the starter already
    const result = await firstImageInThread(rest, 'thread-1', msgs, 50);

    expect(result).toBe('https://cdn/recent.png');
    expect(get).not.toHaveBeenCalled();
  });

  it('prefers the starter message over a later image when the window is truncated', async () => {
    const starter = messageWithImage('starter', 'https://cdn/starter-portrait.png');
    const get = vi.fn().mockResolvedValueOnce(starter);
    const rest = { get } as unknown as REST;
    // window is exactly at fetchLimit → thread may be longer, starter may be missing from msgs
    const msgs = Array.from({ length: 50 }, (_, i) => messageWithoutImage(String(i)));
    msgs.push(messageWithImage('unrelated-later', 'https://cdn/unrelated.png'));

    const result = await firstImageInThread(rest, 'thread-1', msgs.slice(0, 50), 50);

    expect(result).toBe('https://cdn/starter-portrait.png');
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('falls back to the recent window when the starter has no image', async () => {
    const starter = messageWithoutImage('starter');
    const get = vi.fn().mockResolvedValueOnce(starter);
    const rest = { get } as unknown as REST;
    const msgs = Array.from({ length: 49 }, (_, i) => messageWithoutImage(String(i)));
    msgs.push(messageWithImage('later', 'https://cdn/later.png'));

    const result = await firstImageInThread(rest, 'thread-1', msgs, 50);

    expect(result).toBe('https://cdn/later.png');
  });

  it('returns null when neither the starter nor the window has an image', async () => {
    const get = vi.fn().mockRejectedValueOnce(new Error('not found'));
    const rest = { get } as unknown as REST;
    const msgs = Array.from({ length: 50 }, (_, i) => messageWithoutImage(String(i)));

    const result = await firstImageInThread(rest, 'thread-1', msgs, 50);

    expect(result).toBeNull();
  });
});
