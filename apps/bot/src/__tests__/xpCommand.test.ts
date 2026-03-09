import { describe, expect, it, vi } from 'vitest';
import type { AutocompleteInteraction, ChatInputCommandInteraction } from 'discord.js';

describe('xp claim command validation', () => {
  it('rejects invalid discord message links before sending to adapter', async () => {
    vi.resetModules();
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
      guildId: '123456789012345678',
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
      content: 'Invalid Discord message link for "posted_once".',
      ephemeral: true,
    });

    vi.unstubAllEnvs();
  });

  it('autocompletes play_period from active open periods', async () => {
    vi.resetModules();
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
      guildId: '123456789012345678',
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

  it('submits multiple claim categories in one adapter request', async () => {
    vi.resetModules();
    vi.stubEnv('BOT_TOKEN', 'test-token');
    vi.stubEnv('WEB_APP_BASE_URL', 'http://127.0.0.1:5001');
    const { execute } = await import('../commands/xp');

    const reply = vi.fn();
    const adapter = {
      submitClaim: vi.fn(async () => ({ ok: true, message: 'Claim submitted to web app API.' })),
    };

    const interaction = {
      id: 'interaction-4',
      user: { id: 'user-1', username: 'tester' },
      guildId: '123456789012345678',
      options: {
        getSubcommand: vi.fn(() => 'claim'),
        getBoolean: vi.fn(() => null),
        getString: vi.fn((name: string, required?: boolean) => {
          const values: Record<string, string | null | undefined> = {
            character: 'Alice',
            play_period: 'Night 1',
            category: 'posted_once',
            link: 'https://discord.com/channels/123456789012345678/223456789012345678/323456789012345678',
            category_2: 'scene_with_another',
            link_2: 'https://discord.com/channels/123456789012345678/423456789012345678/523456789012345678',
            category_3: undefined,
            link_3: undefined,
            category_4: undefined,
            link_4: undefined,
            category_5: undefined,
            link_5: undefined,
            category_6: undefined,
            link_6: undefined,
          };
          const value = values[name];
          if (required && (value === null || value === undefined || value === '')) {
            throw new Error(`Missing required option ${name}`);
          }
          return value as string | null;
        }),
      },
      reply,
    } as unknown as ChatInputCommandInteraction;

    await execute(interaction, { adapter } as never);
    expect(adapter.submitClaim).toHaveBeenCalledTimes(1);
    expect(adapter.submitClaim).toHaveBeenCalledWith(
      expect.objectContaining({
        characterName: 'Alice',
        playPeriod: 'Night 1',
        categories: {
          posted_once: 'https://discord.com/channels/123456789012345678/223456789012345678/323456789012345678',
          scene_with_another:
            'https://discord.com/channels/123456789012345678/423456789012345678/523456789012345678',
        },
      }),
    );
    expect(reply).toHaveBeenCalledWith({
      content: 'Claim submitted to web app API.',
      ephemeral: true,
    });

    vi.unstubAllEnvs();
  });

  it('returns player help with configured guide URL', async () => {
    vi.resetModules();
    vi.stubEnv('BOT_TOKEN', 'test-token');
    vi.stubEnv('WEB_APP_BASE_URL', 'http://127.0.0.1:5001');
    vi.stubEnv('PLAYER_GUIDE_URL', 'https://discord.com/channels/1/2/3');
    const { execute } = await import('../commands/xp');

    const reply = vi.fn();
    const interaction = {
      id: 'interaction-3',
      user: { id: 'user-1', username: 'tester' },
      guildId: 'guild-1',
      options: {
        getSubcommand: vi.fn(() => 'help'),
        getBoolean: vi.fn(() => null),
        getString: vi.fn(() => null),
      },
      reply,
    } as unknown as ChatInputCommandInteraction;

    await execute(interaction, { adapter: {} } as never);

    expect(reply).toHaveBeenCalledTimes(1);
    const payload = reply.mock.calls[0][0] as { content: string; ephemeral: boolean };
    expect(payload.ephemeral).toBe(true);
    expect(payload.content).toContain('`/xp submit`');
    expect(payload.content).toContain('Full player guide: https://discord.com/channels/1/2/3');

    vi.unstubAllEnvs();
  });
});
