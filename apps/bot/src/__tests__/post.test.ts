import { describe, expect, it, vi, beforeEach } from 'vitest';

const mockConfig = vi.hoisted(() => ({
  correspondenceSocialChannelId: 'social-channel-1',
}));

vi.mock('../config', () => ({ config: mockConfig }));

import { autocomplete, execute, handlePostModal } from '../commands/post';

function makeAdapter() {
  return {
    getActiveRosterWithIds: vi.fn().mockResolvedValue({
      characters: [
        { name: 'Alice', discordId: 'user-1' },
        { name: 'Elena', discordId: 'user-1' },
        { name: 'Marcus', discordId: 'user-2' },
      ],
    }),
  };
}

function makeChatInteraction(options: Record<string, string | null>, userId = 'user-2') {
  return {
    user: { id: userId },
    options: { getString: (key: string) => options[key] ?? null },
    reply: vi.fn().mockResolvedValue(undefined),
    showModal: vi.fn().mockResolvedValue(undefined),
  };
}

function makeModalInteraction(customId: string, handle: string, content: string, userId = 'user-2') {
  const channel = { isTextBased: () => true, send: vi.fn().mockResolvedValue(undefined) };
  return {
    customId,
    user: { id: userId },
    deferReply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
    fields: { getTextInputValue: (key: string) => (key === 'handle' ? handle : content) },
    client: { channels: { fetch: vi.fn().mockResolvedValue(channel) } },
    _channel: channel,
  };
}

beforeEach(() => {
  mockConfig.correspondenceSocialChannelId = 'social-channel-1';
});

describe('/post', () => {
  it('rejects when the channel is not configured', async () => {
    mockConfig.correspondenceSocialChannelId = '';
    const interaction = makeChatInteraction({}, 'user-2');
    const adapter = makeAdapter();
    await execute(interaction as never, { adapter } as never);
    expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining('not configured') }));
  });

  it('opens the post modal for a single-character sender', async () => {
    const interaction = makeChatInteraction({}, 'user-2');
    const adapter = makeAdapter();
    await execute(interaction as never, { adapter } as never);
    expect(interaction.showModal).toHaveBeenCalledTimes(1);
  });

  it('uses the typed handle when provided, else the character name', async () => {
    const cmdInteraction = makeChatInteraction({}, 'user-2');
    const adapter = makeAdapter();
    await execute(cmdInteraction as never, { adapter } as never);

    const withHandle = makeModalInteraction('post:social', 'MidnightMarcus', 'Feeling thirsty tonight.', 'user-2');
    await handlePostModal(withHandle as never);
    expect(withHandle._channel.send).toHaveBeenCalledTimes(1);
    expect(withHandle._channel.send.mock.calls[0][0].embeds[0].data.title).toBe('📱 @MidnightMarcus');

    await execute(cmdInteraction as never, { adapter } as never);
    const withoutHandle = makeModalInteraction('post:social', '', 'Feeling thirsty tonight.', 'user-2');
    await handlePostModal(withoutHandle as never);
    expect(withoutHandle._channel.send.mock.calls[0][0].embeds[0].data.title).toBe('📱 @Marcus');
  });

  it('reports session expiry when there is no pending post', async () => {
    const interaction = makeModalInteraction('post:social', '', 'x', 'never-started');
    const handled = await handlePostModal(interaction as never);
    expect(handled).toBe(true);
    expect(interaction.editReply).toHaveBeenCalledWith(expect.stringContaining('Session expired'));
  });
});

describe('/post autocomplete', () => {
  it('suggests only the invoker\'s own characters', async () => {
    const interaction = {
      user: { id: 'user-1' },
      options: { getFocused: () => ({ name: 'character', value: '' }) },
      respond: vi.fn().mockResolvedValue(undefined),
    };
    const adapter = makeAdapter();
    await autocomplete(interaction as never, { adapter } as never);
    const responded = interaction.respond.mock.calls[0][0] as Array<{ name: string }>;
    expect(responded.map((c) => c.name).sort()).toEqual(['Alice', 'Elena']);
  });
});
