import { describe, expect, it, vi, beforeEach } from 'vitest';
import { startMentionSpamBreaker, type MentionSpamBreakerConfig } from '../services/mentionSpamBreaker';

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

// discord.js Collection extends Map with array methods like .some().
function makeRolesCache(roleIds: string[] = []) {
  const roles = roleIds.map((id) => ({ id }));
  return { some: (predicate: (role: { id: string }) => boolean) => roles.some(predicate) };
}

function makeMentions({ users = 0, roles = 0, everyone = false } = {}) {
  return {
    users: { size: users },
    roles: { size: roles },
    everyone,
  };
}

function makeMessage(overrides: Record<string, unknown> = {}) {
  const timeoutMock = vi.fn().mockResolvedValue(undefined);
  const fetchChannelMock = vi.fn().mockResolvedValue({
    isTextBased: () => true,
    send: vi.fn().mockResolvedValue(undefined),
  });

  return {
    id: 'msg-1',
    content: '@here free nitro',
    channelId: 'general',
    delete: vi.fn().mockResolvedValue(undefined),
    mentions: makeMentions({ roles: 8 }),
    author: { id: 'user-1', bot: false, tag: 'Sleeper#0001' },
    member: {
      id: 'user-1',
      roles: { cache: makeRolesCache(['member-role']) },
      timeout: timeoutMock,
    },
    guild: {
      channels: { fetch: fetchChannelMock },
    },
    ...overrides,
  };
}

function makeConfig(overrides: Partial<MentionSpamBreakerConfig> = {}): MentionSpamBreakerConfig {
  return {
    enabled: true,
    maxMentions: 5,
    timeoutMinutes: 10,
    exemptRoleIds: new Set<string>(),
    modLogChannelId: 'modlog-channel',
    ...overrides,
  };
}

describe('mentionSpamBreaker', () => {
  let client: ReturnType<typeof makeClient>;

  beforeEach(() => {
    client = makeClient();
  });

  it('registers a messageCreate listener', () => {
    startMentionSpamBreaker(client as never, makeConfig());
    expect(client.on).toHaveBeenCalledWith('messageCreate', expect.any(Function));
  });

  it('deletes and times out on mass role mentions over the limit', async () => {
    startMentionSpamBreaker(client as never, makeConfig());
    const message = makeMessage({ mentions: makeMentions({ roles: 8 }) });
    await client.emit('messageCreate', message);

    expect(message.delete).toHaveBeenCalled();
    expect(message.member.timeout).toHaveBeenCalledWith(
      10 * 60_000,
      expect.stringContaining('circuit breaker'),
    );
  });

  it('counts users and roles together', async () => {
    startMentionSpamBreaker(client as never, makeConfig({ maxMentions: 5 }));
    const message = makeMessage({ mentions: makeMentions({ users: 3, roles: 3 }) });
    await client.emit('messageCreate', message);

    expect(message.member.timeout).toHaveBeenCalled();
  });

  it('treats @everyone as instantly over any limit', async () => {
    startMentionSpamBreaker(client as never, makeConfig({ maxMentions: 50 }));
    const message = makeMessage({ mentions: makeMentions({ everyone: true }) });
    await client.emit('messageCreate', message);

    expect(message.member.timeout).toHaveBeenCalled();
  });

  it('ignores messages at or under the limit', async () => {
    startMentionSpamBreaker(client as never, makeConfig({ maxMentions: 5 }));
    const message = makeMessage({ mentions: makeMentions({ users: 2, roles: 3 }) });
    await client.emit('messageCreate', message);

    expect(message.delete).not.toHaveBeenCalled();
    expect(message.member.timeout).not.toHaveBeenCalled();
  });

  it('does nothing when disabled', async () => {
    startMentionSpamBreaker(client as never, makeConfig({ enabled: false }));
    const message = makeMessage();
    await client.emit('messageCreate', message);

    expect(message.delete).not.toHaveBeenCalled();
  });

  it('ignores bot authors', async () => {
    startMentionSpamBreaker(client as never, makeConfig());
    const message = makeMessage({ author: { id: 'carl', bot: true, tag: 'Carl-bot#0001' } });
    await client.emit('messageCreate', message);

    expect(message.delete).not.toHaveBeenCalled();
  });

  it('skips exempt roles', async () => {
    startMentionSpamBreaker(client as never, makeConfig({ exemptRoleIds: new Set(['staff-role']) }));
    const message = makeMessage({
      member: {
        id: 'user-1',
        roles: { cache: makeRolesCache(['staff-role']) },
        timeout: vi.fn(),
      },
    });
    await client.emit('messageCreate', message);

    expect(message.delete).not.toHaveBeenCalled();
    expect(message.member.timeout).not.toHaveBeenCalled();
  });

  it('posts a mod-log embed after tripping', async () => {
    startMentionSpamBreaker(client as never, makeConfig());
    const message = makeMessage();
    await client.emit('messageCreate', message);

    expect(message.guild.channels.fetch).toHaveBeenCalledWith('modlog-channel');
  });

  it('still times out when delete fails', async () => {
    startMentionSpamBreaker(client as never, makeConfig());
    const message = makeMessage();
    message.delete = vi.fn().mockRejectedValue(new Error('Unknown Message'));
    await expect(client.emit('messageCreate', message)).resolves.not.toThrow();
    expect(message.member.timeout).toHaveBeenCalled();
  });

  it('does not throw when timeout fails', async () => {
    startMentionSpamBreaker(client as never, makeConfig());
    const message = makeMessage();
    message.member.timeout = vi.fn().mockRejectedValue(new Error('Missing Permissions'));
    await expect(client.emit('messageCreate', message)).resolves.not.toThrow();
    expect(message.delete).toHaveBeenCalled();
  });

  it('ignores DMs (no guild member)', async () => {
    startMentionSpamBreaker(client as never, makeConfig());
    const message = makeMessage({ member: null });
    await expect(client.emit('messageCreate', message)).resolves.not.toThrow();
    expect(message.delete).not.toHaveBeenCalled();
  });
});
