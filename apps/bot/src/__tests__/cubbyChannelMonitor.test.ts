import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ChannelType } from 'discord.js';
import { startCubbyChannelMonitor } from '../services/cubbyChannelMonitor';

// Minimal mock helpers
function makeChannel(overrides: Record<string, unknown> = {}) {
  return {
    type: ChannelType.GuildText,
    id: 'ch-1',
    name: 'aludra',
    parent: { name: 'Character Cubbies' },
    guild: {
      id: 'guild-1',
      members: { fetchMe: vi.fn().mockResolvedValue({ id: 'bot-1' }) },
    },
    permissionOverwrites: { edit: vi.fn().mockResolvedValue(undefined) },
    ...overrides,
  };
}

function makeClient() {
  const handlers: Record<string, ((...args: unknown[]) => void)[]> = {};
  return {
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      handlers[event] = handlers[event] ?? [];
      handlers[event].push(handler);
    }),
    emit: async (event: string, ...args: unknown[]) => {
      for (const handler of handlers[event] ?? []) {
        await handler(...args);
      }
    },
  };
}

describe('cubbyChannelMonitor', () => {
  let client: ReturnType<typeof makeClient>;

  beforeEach(() => {
    client = makeClient();
    startCubbyChannelMonitor(client as never);
  });

  it('registers a channelCreate listener', () => {
    expect(client.on).toHaveBeenCalledWith('channelCreate', expect.any(Function));
  });

  it('grants bot access when a text channel is created under a cubby category', async () => {
    const channel = makeChannel();
    await client.emit('channelCreate', channel);
    expect(channel.permissionOverwrites.edit).toHaveBeenCalledWith(
      'bot-1',
      expect.objectContaining({
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true,
      }),
    );
  });

  it('ignores non-text channels', async () => {
    const channel = makeChannel({ type: ChannelType.GuildVoice });
    await client.emit('channelCreate', channel);
    expect(channel.permissionOverwrites.edit).not.toHaveBeenCalled();
  });

  it('ignores channels outside cubby categories', async () => {
    const channel = makeChannel({ parent: { name: 'General' } });
    await client.emit('channelCreate', channel);
    expect(channel.permissionOverwrites.edit).not.toHaveBeenCalled();
  });

  it('ignores channels with no parent category', async () => {
    const channel = makeChannel({ parent: null });
    await client.emit('channelCreate', channel);
    expect(channel.permissionOverwrites.edit).not.toHaveBeenCalled();
  });

  it('matches category names case-insensitively', async () => {
    const channel = makeChannel({ parent: { name: 'CHARACTER CUBBIES — CAMARILLA' } });
    await client.emit('channelCreate', channel);
    expect(channel.permissionOverwrites.edit).toHaveBeenCalled();
  });

  it('does not throw when fetchMe fails', async () => {
    const channel = makeChannel({
      guild: {
        id: 'guild-1',
        members: { fetchMe: vi.fn().mockRejectedValue(new Error('no access')) },
      },
    });
    await expect(client.emit('channelCreate', channel)).resolves.not.toThrow();
    expect(channel.permissionOverwrites.edit).not.toHaveBeenCalled();
  });

  it('does not throw when permissionOverwrites.edit fails', async () => {
    const channel = makeChannel({
      permissionOverwrites: {
        edit: vi.fn().mockRejectedValue(new Error('Missing Permissions')),
      },
    });
    await expect(client.emit('channelCreate', channel)).resolves.not.toThrow();
  });
});
