import { describe, expect, it, vi, beforeEach } from 'vitest';

const mockConfig = vi.hoisted(() => ({
  correspondenceDeliveryChannelId: 'delivery-channel-1',
}));

vi.mock('../config', () => ({ config: mockConfig }));

import { autocomplete, execute, handleDeliveryModal } from '../commands/delivery';

function makeRoster() {
  return {
    characters: [
      { name: 'Alice', discordId: 'user-1' },
      { name: 'Marcus', discordId: 'user-2' },
      { name: 'Elena', discordId: 'user-1' },
    ],
  };
}

function makeAdapter(overrides: Record<string, unknown> = {}) {
  return {
    getActiveRosterWithIds: vi.fn().mockResolvedValue(makeRoster()),
    ...overrides,
  };
}

function makeChatInteraction(options: Record<string, string | null>, userId = 'user-1') {
  return {
    user: { id: userId },
    options: {
      getString: (key: string) => options[key] ?? null,
    },
    reply: vi.fn().mockResolvedValue(undefined),
    showModal: vi.fn().mockResolvedValue(undefined),
  };
}

function makeAutocompleteInteraction(focusedName: string, value: string, userId = 'user-1') {
  return {
    user: { id: userId },
    options: {
      getFocused: () => ({ name: focusedName, value }),
    },
    respond: vi.fn().mockResolvedValue(undefined),
  };
}

beforeEach(() => {
  mockConfig.correspondenceDeliveryChannelId = 'delivery-channel-1';
});

describe('/deliver execute', () => {
  it('rejects when the delivery channel is not configured', async () => {
    mockConfig.correspondenceDeliveryChannelId = '';
    const interaction = makeChatInteraction({ to: 'Marcus', character: null });
    const adapter = makeAdapter();

    await execute(interaction as never, { adapter } as never);

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('not configured') }),
    );
    expect(interaction.showModal).not.toHaveBeenCalled();
  });

  it('rejects an unknown recipient', async () => {
    const interaction = makeChatInteraction({ to: 'Nobody', character: 'Alice' });
    const adapter = makeAdapter();

    await execute(interaction as never, { adapter } as never);

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('Unknown character') }),
    );
  });

  it('rejects delivering a letter to yourself', async () => {
    const interaction = makeChatInteraction({ to: 'Alice', character: 'Alice' }, 'user-1');
    const adapter = makeAdapter();

    await execute(interaction as never, { adapter } as never);

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining("can't deliver a letter to yourself") }),
    );
  });

  it('requires disambiguation when the sender has multiple characters and none is specified', async () => {
    const interaction = makeChatInteraction({ to: 'Marcus', character: null }, 'user-1');
    const adapter = makeAdapter();

    await execute(interaction as never, { adapter } as never);

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('multiple linked characters') }),
    );
  });

  it('opens the letter modal for a valid single-character sender and recipient', async () => {
    const interaction = makeChatInteraction({ to: 'Elena', character: null }, 'user-2');
    const adapter = makeAdapter();

    await execute(interaction as never, { adapter } as never);

    expect(interaction.showModal).toHaveBeenCalledTimes(1);
    expect(interaction.reply).not.toHaveBeenCalled();
  });
});

describe('/deliver autocomplete', () => {
  it('suggests all active characters for "to"', async () => {
    const interaction = makeAutocompleteInteraction('to', 'e');
    const adapter = makeAdapter();

    await autocomplete(interaction as never, { adapter } as never);

    const responded = interaction.respond.mock.calls[0][0] as Array<{ name: string }>;
    expect(responded.map((c) => c.name).sort()).toEqual(['Alice', 'Elena']);
  });

  it('suggests only the invoker\'s own characters for "character"', async () => {
    const interaction = makeAutocompleteInteraction('character', '', 'user-1');
    const adapter = makeAdapter();

    await autocomplete(interaction as never, { adapter } as never);

    const responded = interaction.respond.mock.calls[0][0] as Array<{ name: string }>;
    expect(responded.map((c) => c.name).sort()).toEqual(['Alice', 'Elena']);
  });
});

describe('/deliver modal submit', () => {
  function makeModalInteraction(customId: string, letterText: string, userId = 'user-2') {
    const channel = { isTextBased: () => true, send: vi.fn().mockResolvedValue(undefined) };
    return {
      customId,
      user: { id: userId },
      deferReply: vi.fn().mockResolvedValue(undefined),
      editReply: vi.fn().mockResolvedValue(undefined),
      fields: { getTextInputValue: () => letterText },
      client: { channels: { fetch: vi.fn().mockResolvedValue(channel) } },
      _channel: channel,
    };
  }

  it('ignores modals with a different customId', async () => {
    const interaction = makeModalInteraction('some:other:modal', 'text');
    const handled = await handleDeliveryModal(interaction as never);
    expect(handled).toBe(false);
  });

  it('reports session expiry when there is no pending delivery', async () => {
    const interaction = makeModalInteraction('deliver:letter', 'text', 'never-started-a-delivery');
    const handled = await handleDeliveryModal(interaction as never);
    expect(handled).toBe(true);
    expect(interaction.editReply).toHaveBeenCalledWith(expect.stringContaining('Session expired'));
  });

  it('posts the letter embed and confirms delivery after a successful /deliver execute', async () => {
    const cmdInteraction = makeChatInteraction({ to: 'Elena', character: null }, 'user-2');
    const adapter = makeAdapter();
    await execute(cmdInteraction as never, { adapter } as never);

    const modalInteraction = makeModalInteraction('deliver:letter', 'The night grows long.', 'user-2');
    const handled = await handleDeliveryModal(modalInteraction as never);

    expect(handled).toBe(true);
    expect(modalInteraction._channel.send).toHaveBeenCalledTimes(1);
    const sentEmbed = modalInteraction._channel.send.mock.calls[0][0].embeds[0];
    expect(sentEmbed.data.title).toBe('📜 A Letter Arrives');
    expect(sentEmbed.data.description).toBe('The night grows long.');
    expect(modalInteraction.editReply).toHaveBeenCalledWith(expect.stringContaining('delivered to **Elena**'));
  });
});
