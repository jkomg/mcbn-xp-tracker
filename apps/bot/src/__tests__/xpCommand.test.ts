import { describe, expect, it, vi } from 'vitest';
import type { AutocompleteInteraction, ChatInputCommandInteraction } from 'discord.js';

describe('xp claim command validation', () => {
  it('redirects /xp claim to the player portal', async () => {
    vi.resetModules();
    vi.stubEnv('BOT_TOKEN', 'test-token');
    vi.stubEnv('WEB_APP_BASE_URL', 'http://127.0.0.1:5001');
    const { execute } = await import('../commands/xp');

    const reply = vi.fn();
    const adapter = { submitClaim: vi.fn() };

    const interaction = {
      id: 'interaction-1',
      user: { id: 'user-1' },
      guildId: '123456789012345678',
      options: {
        getSubcommand: vi.fn(() => 'claim'),
        getBoolean: vi.fn(() => null),
        getString: vi.fn(() => null),
      },
      reply,
    } as unknown as ChatInputCommandInteraction;

    await execute(interaction, { adapter } as never);

    expect(adapter.submitClaim).not.toHaveBeenCalled();
    expect(reply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('player portal'),
        ephemeral: true,
      }),
    );

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

  it('redirects /xp submit to the player portal', async () => {
    vi.resetModules();
    vi.stubEnv('BOT_TOKEN', 'test-token');
    vi.stubEnv('WEB_APP_BASE_URL', 'http://127.0.0.1:5001');
    const { execute } = await import('../commands/xp');

    const reply = vi.fn();
    const adapter = { submitClaim: vi.fn() };

    const interaction = {
      id: 'interaction-4',
      user: { id: 'user-1', username: 'tester' },
      guildId: '123456789012345678',
      options: {
        getSubcommand: vi.fn(() => 'submit'),
        getBoolean: vi.fn(() => null),
        getString: vi.fn(() => null),
      },
      reply,
    } as unknown as ChatInputCommandInteraction;

    await execute(interaction, { adapter } as never);

    expect(adapter.submitClaim).not.toHaveBeenCalled();
    expect(reply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('player portal'),
        ephemeral: true,
      }),
    );

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
