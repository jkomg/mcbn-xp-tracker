import { describe, expect, it, vi } from 'vitest';
import type { AutocompleteInteraction, ChatInputCommandInteraction } from 'discord.js';

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

  it('autocompletes play_period from active open periods', async () => {
    vi.stubEnv('BOT_TOKEN', 'test-token');
    vi.stubEnv('WEB_APP_BASE_URL', 'http://127.0.0.1:5001');
    const { autocomplete } = await import('../commands/xp');

    const respond = vi.fn();
    const adapter = {
      getClaimContext: vi.fn(async () => ({
        activeCharacters: ['Alice'],
        openPeriods: ['Night 80', 'Night 79'],
        currentNight: 'Night 80',
      })),
    };

    const interaction = {
      id: 'interaction-2',
      user: { id: 'user-1', username: 'tester' },
      guildId: 'guild-1',
      options: {
        getSubcommand: vi.fn(() => 'claim'),
        getFocused: vi.fn(() => ({ name: 'play_period', value: 'night' })),
        getBoolean: vi.fn(() => null),
        getString: vi.fn(() => null),
      },
      respond,
    } as unknown as AutocompleteInteraction;

    await autocomplete(interaction, { adapter } as never);

    expect(adapter.getClaimContext).toHaveBeenCalledTimes(1);
    expect(respond).toHaveBeenCalledWith([
      { name: 'Night 80', value: 'Night 80' },
      { name: 'Night 79', value: 'Night 79' },
    ]);

    vi.unstubAllEnvs();
  });
});
