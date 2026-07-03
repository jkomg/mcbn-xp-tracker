import { describe, expect, it, vi, beforeEach } from 'vitest';
import { liveConfig } from '../liveConfig';
import { startHoneypotMonitor } from '../services/honeypotMonitor';

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

// discord.js Collection extends Map but also exposes array methods like
// .some() — plain Map lacks those, so mock a minimal stand-in.
function makeRolesCache(roleIds: string[] = []) {
  const roles = roleIds.map((id) => ({ id }));
  return { some: (predicate: (role: { id: string }) => boolean) => roles.some(predicate) };
}

function makeMessage(overrides: Record<string, unknown> = {}) {
  const banMock = vi.fn().mockResolvedValue(undefined);
  const fetchChannelMock = vi.fn().mockResolvedValue({
    isTextBased: () => true,
    send: vi.fn().mockResolvedValue(undefined),
  });

  return {
    id: 'msg-1',
    content: 'buy cheap discord nitro',
    channelId: 'honeypot-channel',
    delete: vi.fn().mockResolvedValue(undefined),
    author: {
      id: 'user-1',
      bot: false,
      tag: 'Spammer#0001',
      createdTimestamp: Date.now() - 60_000, // brand new account
    },
    member: {
      id: 'user-1',
      roles: { cache: makeRolesCache() },
    },
    guild: {
      members: { ban: banMock },
      channels: { fetch: fetchChannelMock },
    },
    ...overrides,
  };
}

describe('honeypotMonitor', () => {
  let client: ReturnType<typeof makeClient>;

  beforeEach(() => {
    client = makeClient();
    liveConfig.honeypotEnabled = true;
    liveConfig.honeypotChannelId = 'honeypot-channel';
    liveConfig.honeypotModLogChannelId = 'modlog-channel';
    liveConfig.honeypotWhitelistedRoleIds = new Set();
    liveConfig.honeypotRequireYoungAccount = false;
    liveConfig.honeypotMaxAccountAgeDays = 30;
  });

  it('registers a messageCreate listener', () => {
    startHoneypotMonitor(client as never);
    expect(client.on).toHaveBeenCalledWith('messageCreate', expect.any(Function));
  });

  it('deletes the message and bans the author on trigger', async () => {
    startHoneypotMonitor(client as never);
    const message = makeMessage();
    await client.emit('messageCreate', message);

    expect(message.delete).toHaveBeenCalled();
    expect(message.guild.members.ban).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ reason: expect.stringContaining('Honeypot trigger') }),
    );
  });

  it('posts an audit embed to the mod-log channel', async () => {
    startHoneypotMonitor(client as never);
    const message = makeMessage();
    await client.emit('messageCreate', message);

    expect(message.guild.channels.fetch).toHaveBeenCalledWith('modlog-channel');
  });

  it('does nothing when disabled', async () => {
    liveConfig.honeypotEnabled = false;
    startHoneypotMonitor(client as never);
    const message = makeMessage();
    await client.emit('messageCreate', message);

    expect(message.delete).not.toHaveBeenCalled();
    expect(message.guild.members.ban).not.toHaveBeenCalled();
  });

  it('ignores messages outside the honeypot channel', async () => {
    startHoneypotMonitor(client as never);
    const message = makeMessage({ channelId: 'some-other-channel' });
    await client.emit('messageCreate', message);

    expect(message.delete).not.toHaveBeenCalled();
    expect(message.guild.members.ban).not.toHaveBeenCalled();
  });

  it('ignores messages from bots', async () => {
    startHoneypotMonitor(client as never);
    const message = makeMessage({ author: { id: 'bot-1', bot: true, tag: 'Bot#0001', createdTimestamp: Date.now() } });
    await client.emit('messageCreate', message);

    expect(message.delete).not.toHaveBeenCalled();
    expect(message.guild.members.ban).not.toHaveBeenCalled();
  });

  it('skips whitelisted roles', async () => {
    liveConfig.honeypotWhitelistedRoleIds = new Set(['staff-role']);
    startHoneypotMonitor(client as never);
    const message = makeMessage({
      member: { id: 'user-1', roles: { cache: makeRolesCache(['staff-role']) } },
    });
    await client.emit('messageCreate', message);

    expect(message.delete).not.toHaveBeenCalled();
    expect(message.guild.members.ban).not.toHaveBeenCalled();
  });

  it('skips accounts older than the threshold when requireYoungAccount is set', async () => {
    liveConfig.honeypotRequireYoungAccount = true;
    liveConfig.honeypotMaxAccountAgeDays = 30;
    startHoneypotMonitor(client as never);
    const message = makeMessage({
      author: {
        id: 'user-1',
        bot: false,
        tag: 'OldAccount#0001',
        createdTimestamp: Date.now() - 90 * 86_400_000,
      },
    });
    await client.emit('messageCreate', message);

    expect(message.delete).not.toHaveBeenCalled();
    expect(message.guild.members.ban).not.toHaveBeenCalled();
  });

  it('still bans a young account when requireYoungAccount is set', async () => {
    liveConfig.honeypotRequireYoungAccount = true;
    liveConfig.honeypotMaxAccountAgeDays = 30;
    startHoneypotMonitor(client as never);
    const message = makeMessage();
    await client.emit('messageCreate', message);

    expect(message.guild.members.ban).toHaveBeenCalled();
  });

  it('does not throw when ban fails', async () => {
    startHoneypotMonitor(client as never);
    const message = makeMessage();
    message.guild.members.ban = vi.fn().mockRejectedValue(new Error('Missing Permissions'));
    await expect(client.emit('messageCreate', message)).resolves.not.toThrow();
  });

  it('does not throw when delete fails', async () => {
    startHoneypotMonitor(client as never);
    const message = makeMessage();
    message.delete = vi.fn().mockRejectedValue(new Error('Unknown Message'));
    await expect(client.emit('messageCreate', message)).resolves.not.toThrow();
    expect(message.guild.members.ban).toHaveBeenCalled();
  });

  it('ignores messages with no guild member (DMs)', async () => {
    startHoneypotMonitor(client as never);
    const message = makeMessage({ member: null });
    await expect(client.emit('messageCreate', message)).resolves.not.toThrow();
    expect(message.delete).not.toHaveBeenCalled();
  });
});
