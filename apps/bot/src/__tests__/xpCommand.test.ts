import { describe, expect, it, vi } from 'vitest';
import type { ChatInputCommandInteraction } from 'discord.js';

describe('xp claim command validation', () => {
  it('rejects invalid discord message links before sending to adapter', async () => {
    vi.stubEnv('BOT_TOKEN', 'test-token');
    vi.stubEnv('WEB_APP_BASE_URL', 'http://127.0.0.1:5001');
    const { execute } = await import('../commands/xp');

    const reply = vi.fn();
    const adapter = {
      submitClaim: vi.fn(),
    };

    const interaction = {
      id: 'interaction-1',
      user: { id: 'user-1' },
      guildId: 'guild-1',
      options: {
        getSubcommand: vi.fn(() => 'claim'),
        getBoolean: vi.fn(() => null),
        getString: vi.fn((name: string) => {
          const values: Record<string, string> = {
            character: 'Alice',
            play_period: 'Night 1',
            category: 'posted_once',
            link: 'https://example.com/not-a-discord-link',
          };
          return values[name];
        }),
      },
      reply,
    } as unknown as ChatInputCommandInteraction;

    await execute(interaction, { adapter } as never);

    expect(adapter.submitClaim).not.toHaveBeenCalled();
    expect(reply).toHaveBeenCalledWith({
      content: 'Invalid Discord message link format.',
      ephemeral: true,
    });

    vi.unstubAllEnvs();
  });
});
