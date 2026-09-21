import { describe, expect, it, vi } from 'vitest';
import type { Client } from 'discord.js';
import type { TrackerAdapter } from '../services/adapter';
import type { BackgroundReleaseEvent } from '../types';

const sendMock = vi.fn(async (_payload: { content: string }) => undefined);

vi.mock('../services/cubbyChannels', () => ({
  normalizeChannelName: (value: string) => value.toLowerCase(),
  buildCubbyChannelMap: async () => new Map([['aludra', { send: sendMock }]]),
}));

vi.mock('../logger', () => ({
  logEvent: vi.fn(),
  errorToMessage: (error: unknown) => String(error),
}));

import { BackgroundBlankReleaseService, buildBlankReleaseMessage } from '../services/backgroundBlankReleaseService';

const release = (overrides: Partial<BackgroundReleaseEvent> = {}): BackgroundReleaseEvent => ({
  character_name: 'Aludra',
  background_name: 'Mawla',
  dots_released: 3,
  player_discord: '123456789012345678',
  ...overrides,
});

describe('buildBlankReleaseMessage', () => {
  it('says the dots are usable now', () => {
    expect(buildBlankReleaseMessage(release())).toBe(
      '<@123456789012345678> your **3 dots** of **Mawla** are back and can be used now.',
    );
  });

  it('uses the singular for one dot', () => {
    expect(buildBlankReleaseMessage(release({ dots_released: 1 }))).toContain('**1 dot** of **Mawla** is back');
  });

  it('falls back to the character name without a Discord id', () => {
    expect(buildBlankReleaseMessage(release({ player_discord: '' }))).toMatch(/^Aludra your /);
  });
});

describe('BackgroundBlankReleaseService.tick', () => {
  it('does not present the period label as a date', async () => {
    // The 2026-09-04 message: sent on 9/4 while naming "Night 69 - 9/8 - 9/20",
    // which read as the dots coming back on 9/8.
    const adapter = {
      releaseDueBackgroundBlanks: async () => ({
        ok: true,
        currentNight: 'Night 69 - 9/8 - 9/20',
        released: [release()],
      }),
    } as unknown as TrackerAdapter;
    const client = { guilds: { fetch: async () => ({ id: 'guild' }) } } as unknown as Client;

    sendMock.mockClear();
    await new BackgroundBlankReleaseService(client, adapter, 'guild').tick();

    expect(sendMock).toHaveBeenCalledTimes(1);
    const content = sendMock.mock.calls[0][0].content;
    expect(content).toBe('<@123456789012345678> your **3 dots** of **Mawla** are back and can be used now.');
    expect(content).not.toContain('Night 69');
    expect(content).not.toContain('9/8');
  });
});
