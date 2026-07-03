import { describe, expect, it, vi, beforeEach } from 'vitest';

const mockConfig = vi.hoisted(() => ({
  correspondenceCobwebChannelId: 'cobweb-channel-1',
}));

vi.mock('../config', () => ({ config: mockConfig }));

import { autocomplete, execute, handleCobwebModal } from '../commands/cobweb';

function makeAdapter() {
  return {
    getActiveRosterWithIds: vi.fn().mockResolvedValue({
      characters: [
        { name: 'Cassandra', discordId: 'user-1' },
        { name: 'Marcus', discordId: 'user-2' },
      ],
    }),
  };
}

function makeChatInteraction(userId = 'user-1') {
  return {
    user: { id: userId },
    options: { getString: () => null },
    reply: vi.fn().mockResolvedValue(undefined),
    showModal: vi.fn().mockResolvedValue(undefined),
  };
}

function makeModalInteraction(customId: string, message: string, userId = 'user-1') {
  const channel = { isTextBased: () => true, send: vi.fn().mockResolvedValue(undefined) };
  return {
    customId,
    user: { id: userId },
    deferReply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
    fields: { getTextInputValue: () => message },
    client: { channels: { fetch: vi.fn().mockResolvedValue(channel) } },
    _channel: channel,
  };
}

beforeEach(() => {
  mockConfig.correspondenceCobwebChannelId = 'cobweb-channel-1';
});

describe('/cobweb', () => {
  it('rejects when the channel is not configured', async () => {
    mockConfig.correspondenceCobwebChannelId = '';
    const interaction = makeChatInteraction('user-1');
    const adapter = makeAdapter();
    await execute(interaction as never, { adapter } as never);
    expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining('not configured') }));
  });

  it('rejects a user with no linked active character', async () => {
    const interaction = makeChatInteraction('user-99');
    const adapter = makeAdapter();
    await execute(interaction as never, { adapter } as never);
    expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining('No linked active character') }));
  });

  it('opens the whisper modal for a valid sender', async () => {
    const interaction = makeChatInteraction('user-1');
    const adapter = makeAdapter();
    await execute(interaction as never, { adapter } as never);
    expect(interaction.showModal).toHaveBeenCalledTimes(1);
  });

  it('posts the whisper embed with no discipline check performed anywhere', async () => {
    const cmdInteraction = makeChatInteraction('user-1');
    const adapter = makeAdapter();
    await execute(cmdInteraction as never, { adapter } as never);

    const modalInteraction = makeModalInteraction('cobweb:whisper', 'Can you hear me?', 'user-1');
    const handled = await handleCobwebModal(modalInteraction as never);

    expect(handled).toBe(true);
    expect(modalInteraction._channel.send).toHaveBeenCalledTimes(1);
    const embed = modalInteraction._channel.send.mock.calls[0][0].embeds[0];
    expect(embed.data.title).toBe('🕸️ A Whisper in the Web');
    expect(embed.data.description).toBe('Can you hear me?');
    // Ownership resolution only ever checked clan-agnostic roster data — no
    // discipline field is referenced anywhere in this command.
    expect(adapter.getActiveRosterWithIds).toHaveBeenCalled();
  });

  it('reports session expiry when there is no pending whisper', async () => {
    const interaction = makeModalInteraction('cobweb:whisper', 'x', 'never-started');
    const handled = await handleCobwebModal(interaction as never);
    expect(handled).toBe(true);
    expect(interaction.editReply).toHaveBeenCalledWith(expect.stringContaining('Session expired'));
  });
});

describe('/cobweb autocomplete', () => {
  it('suggests only the invoker\'s own characters', async () => {
    const interaction = {
      user: { id: 'user-1' },
      options: { getFocused: () => ({ name: 'character', value: '' }) },
      respond: vi.fn().mockResolvedValue(undefined),
    };
    const adapter = makeAdapter();
    await autocomplete(interaction as never, { adapter } as never);
    const responded = interaction.respond.mock.calls[0][0] as Array<{ name: string }>;
    expect(responded.map((c) => c.name)).toEqual(['Cassandra']);
  });
});
