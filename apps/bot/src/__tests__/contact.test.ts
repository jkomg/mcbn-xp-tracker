import { describe, expect, it, vi, beforeEach } from 'vitest';

const mockConfig = vi.hoisted(() => ({
  correspondenceContactChannelId: 'contact-channel-1',
}));

vi.mock('../config', () => ({ config: mockConfig }));

import {
  autocomplete,
  execute,
  handleContactSendModal,
  handleContactReplyModal,
  handleContactReplyButton,
} from '../commands/contact';

function makeRoster() {
  return {
    characters: [
      { name: 'Alice', discordId: 'user-1' },
      { name: 'Marcus', discordId: 'user-2' },
      { name: 'Elena', discordId: 'user-3' },
    ],
  };
}

function makeAdapter(overrides: Record<string, unknown> = {}) {
  return {
    getActiveRosterWithIds: vi.fn().mockResolvedValue(makeRoster()),
    createContactThread: vi.fn().mockResolvedValue({
      ok: true,
      threadId: 7,
      participants: [
        { character_name: 'Alice', discord_id: '111' },
        { character_name: 'Marcus', discord_id: '222' },
      ],
    }),
    getContactThreadsForCharacter: vi.fn().mockResolvedValue({
      character_name: 'Alice',
      threads: [{ id: 7, participant_names: ['Alice', 'Marcus'], last_message_at: null, message_count: 2 }],
    }),
    replyToContactThread: vi.fn().mockResolvedValue({
      ok: true,
      otherParticipants: [{ character_name: 'Alice', discord_id: '111' }],
    }),
    ...overrides,
  };
}

function makeChatInteraction(sub: string, options: Record<string, string | null>, userId = 'user-1') {
  return {
    user: { id: userId, username: `user-${userId}` },
    options: {
      getSubcommand: () => sub,
      getString: (key: string) => options[key] ?? null,
    },
    reply: vi.fn().mockResolvedValue(undefined),
    showModal: vi.fn().mockResolvedValue(undefined),
  };
}

function makeAutocompleteInteraction(focusedName: string, value: string, extraOptions: Record<string, string> = {}, userId = 'user-1') {
  return {
    user: { id: userId },
    options: {
      getFocused: () => ({ name: focusedName, value }),
      getString: (key: string) => extraOptions[key] ?? null,
    },
    respond: vi.fn().mockResolvedValue(undefined),
  };
}

function makeModalInteraction(customId: string, userId = 'user-1') {
  const channel = { isTextBased: () => true, send: vi.fn().mockResolvedValue(undefined) };
  return {
    customId,
    user: { id: userId, username: `user-${userId}` },
    deferReply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
    fields: { getTextInputValue: () => 'Meet me tonight.' },
    client: { channels: { fetch: vi.fn().mockResolvedValue(channel) } },
    _channel: channel,
  };
}

beforeEach(() => {
  mockConfig.correspondenceContactChannelId = 'contact-channel-1';
});

describe('/contact send', () => {
  it('rejects when the channel is not configured', async () => {
    mockConfig.correspondenceContactChannelId = '';
    const interaction = makeChatInteraction('send', { to: 'Marcus' }, 'user-1');
    const adapter = makeAdapter();
    await execute(interaction as never, { adapter } as never);
    expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining('not configured') }));
  });

  it('rejects when the only recipient resolves to the sender', async () => {
    const interaction = makeChatInteraction('send', { to: 'Alice' }, 'user-1');
    const adapter = makeAdapter();
    await execute(interaction as never, { adapter } as never);
    expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining("can't text yourself") }));
  });

  it('opens the message modal for a valid group text, deduping recipients', async () => {
    const interaction = makeChatInteraction('send', { to: 'Marcus', also_to: 'Elena, Marcus' }, 'user-1');
    const adapter = makeAdapter();
    await execute(interaction as never, { adapter } as never);
    expect(interaction.showModal).toHaveBeenCalledTimes(1);
  });
});

describe('/contact reply', () => {
  it('rejects a malformed thread value', async () => {
    const interaction = makeChatInteraction('reply', { thread: 'not-a-number' }, 'user-1');
    const adapter = makeAdapter();
    await execute(interaction as never, { adapter } as never);
    expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining('autocomplete list') }));
  });

  it('opens the reply modal for a valid thread id', async () => {
    const interaction = makeChatInteraction('reply', { thread: '7' }, 'user-1');
    const adapter = makeAdapter();
    await execute(interaction as never, { adapter } as never);
    expect(interaction.showModal).toHaveBeenCalledTimes(1);
  });
});

describe('/contact autocomplete', () => {
  it('lists open threads via getContactThreadsForCharacter for "thread"', async () => {
    const interaction = makeAutocompleteInteraction('thread', '');
    const adapter = makeAdapter();
    await autocomplete(interaction as never, { adapter } as never);
    expect(adapter.getContactThreadsForCharacter).toHaveBeenCalledWith('user-1', undefined);
    const responded = interaction.respond.mock.calls[0][0] as Array<{ value: string }>;
    expect(responded).toEqual([{ name: 'Alice, Marcus — 2 messages', value: '7' }]);
  });

  it('passes an already-filled character option through to the thread lookup', async () => {
    const interaction = makeAutocompleteInteraction('thread', '', { character: 'Elena' });
    const adapter = makeAdapter();
    await autocomplete(interaction as never, { adapter } as never);
    expect(adapter.getContactThreadsForCharacter).toHaveBeenCalledWith('user-1', 'Elena');
  });
});

describe('/contact modal submits', () => {
  it('send: posts an embed mentioning only the recipients, not the sender', async () => {
    const sendInteraction = makeChatInteraction('send', { to: 'Marcus' }, 'user-1');
    const adapter = makeAdapter();
    await execute(sendInteraction as never, { adapter } as never);

    const modalInteraction = makeModalInteraction('contact:send', 'user-1');
    const handled = await handleContactSendModal(modalInteraction as never, { adapter } as never);

    expect(handled).toBe(true);
    expect(modalInteraction._channel.send).toHaveBeenCalledTimes(1);
    const sendArgs = modalInteraction._channel.send.mock.calls[0][0];
    expect(sendArgs.content).toBe('<@222>');
    expect(sendArgs.embeds[0].data.title).toBe('📲 New Text Message');
  });

  it('reply: posts an embed and confirms without needing a recipient list', async () => {
    const replyInteraction = makeChatInteraction('reply', { thread: '7' }, 'user-1');
    const adapter = makeAdapter();
    await execute(replyInteraction as never, { adapter } as never);

    const modalInteraction = makeModalInteraction('contact:reply', 'user-1');
    const handled = await handleContactReplyModal(modalInteraction as never, { adapter } as never);

    expect(handled).toBe(true);
    expect(modalInteraction._channel.send).toHaveBeenCalledTimes(1);
    expect(modalInteraction.editReply).toHaveBeenCalledWith('Reply sent.');
  });

  it('reply: reports session expiry when there is no pending reply', async () => {
    const modalInteraction = makeModalInteraction('contact:reply', 'never-started');
    const adapter = makeAdapter();
    const handled = await handleContactReplyModal(modalInteraction as never, { adapter } as never);
    expect(handled).toBe(true);
    expect(modalInteraction.editReply).toHaveBeenCalledWith(expect.stringContaining('Session expired'));
  });

  it('send: surfaces the API error message when the thread cannot be created', async () => {
    const sendInteraction = makeChatInteraction('send', { to: 'Marcus' }, 'user-1');
    const adapter = makeAdapter({
      createContactThread: vi.fn().mockResolvedValue({ ok: false, message: 'No active character found named "Marcus"' }),
    });
    await execute(sendInteraction as never, { adapter } as never);

    const modalInteraction = makeModalInteraction('contact:send', 'user-1');
    await handleContactSendModal(modalInteraction as never, { adapter } as never);

    expect(modalInteraction.editReply).toHaveBeenCalledWith(expect.stringContaining('No active character found'));
    expect(modalInteraction._channel.send).not.toHaveBeenCalled();
  });
});

describe('/contact reply button', () => {
  function makeButtonInteraction(customId: string, userId = 'user-1') {
    return {
      customId,
      user: { id: userId, username: `user-${userId}` },
      reply: vi.fn().mockResolvedValue(undefined),
      showModal: vi.fn().mockResolvedValue(undefined),
    };
  }

  it('opens the reply modal directly when the user owns exactly one active character', async () => {
    const interaction = makeButtonInteraction('contact:reply-btn:7', 'user-1');
    const adapter = makeAdapter();

    const handled = await handleContactReplyButton(interaction as never, { adapter } as never);

    expect(handled).toBe(true);
    expect(interaction.showModal).toHaveBeenCalledTimes(1);
    expect(interaction.reply).not.toHaveBeenCalled();
  });

  it('picks the right character when the user owns several but only one is in this thread', async () => {
    const roster = {
      characters: [
        { name: 'Marcus', discordId: 'user-multi' },
        { name: 'Other Guy', discordId: 'user-multi' },
      ],
    };
    const adapter = makeAdapter({
      getActiveRosterWithIds: vi.fn().mockResolvedValue(roster),
      getContactThreadsForCharacter: vi.fn().mockImplementation((_discordId: string, characterName?: string) => {
        if (characterName === 'Marcus') {
          return Promise.resolve({ character_name: 'Marcus', threads: [{ id: 7, participant_names: [], last_message_at: null, message_count: 1 }] });
        }
        return Promise.resolve({ character_name: characterName, threads: [] });
      }),
    });

    const interaction = makeButtonInteraction('contact:reply-btn:7', 'user-multi');
    const handled = await handleContactReplyButton(interaction as never, { adapter } as never);

    expect(handled).toBe(true);
    expect(interaction.showModal).toHaveBeenCalledTimes(1);
    expect(interaction.reply).not.toHaveBeenCalled();
  });

  it('opens the modal immediately even when ownership is still ambiguous, then reports it on submit', async () => {
    // The modal must open before any network calls — Discord's ack deadline
    // applies to the button click, not to the (potentially multi-call)
    // ownership resolution. The ambiguous-character error only surfaces
    // later, when the player actually submits the modal.
    const roster = {
      characters: [
        { name: 'Marcus', discordId: 'user-multi' },
        { name: 'Other Guy', discordId: 'user-multi' },
      ],
    };
    const adapter = makeAdapter({
      getActiveRosterWithIds: vi.fn().mockResolvedValue(roster),
      getContactThreadsForCharacter: vi.fn().mockResolvedValue({
        character_name: 'x',
        threads: [{ id: 7, participant_names: [], last_message_at: null, message_count: 1 }],
      }),
    });

    const interaction = makeButtonInteraction('contact:reply-btn:7', 'user-multi');
    const handled = await handleContactReplyButton(interaction as never, { adapter } as never);

    expect(handled).toBe(true);
    expect(interaction.showModal).toHaveBeenCalledTimes(1);
    expect(interaction.reply).not.toHaveBeenCalled();

    const modalInteraction = makeModalInteraction('contact:reply', 'user-multi');
    await handleContactReplyModal(modalInteraction as never, { adapter } as never);
    expect(modalInteraction.editReply).toHaveBeenCalledWith(
      expect.stringContaining('More than one of your characters'),
    );
    expect(modalInteraction._channel.send).not.toHaveBeenCalled();
  });

  it('queries owned characters concurrently rather than one at a time', async () => {
    const roster = {
      characters: [
        { name: 'Argento', discordId: 'user-multi' },
        { name: 'Constance', discordId: 'user-multi' },
      ],
    };
    const inFlight: string[] = [];
    const adapter = makeAdapter({
      getActiveRosterWithIds: vi.fn().mockResolvedValue(roster),
      getContactThreadsForCharacter: vi.fn().mockImplementation((_discordId: string, characterName?: string) => {
        inFlight.push(characterName ?? '');
        return Promise.resolve({
          character_name: characterName,
          threads: characterName === 'Argento' ? [{ id: 7, participant_names: [], last_message_at: null, message_count: 1 }] : [],
        });
      }),
    });

    const interaction = makeButtonInteraction('contact:reply-btn:7', 'user-multi');
    await handleContactReplyButton(interaction as never, { adapter } as never);

    // Both lookups must have been issued before either resolved — proof
    // they ran concurrently, not sequentially.
    expect(inFlight.sort()).toEqual(['Argento', 'Constance']);
    expect(adapter.getContactThreadsForCharacter).toHaveBeenCalledTimes(2);
  });

  it('ignores button clicks for other custom ids', async () => {
    const interaction = makeButtonInteraction('some:other:button', 'user-1');
    const adapter = makeAdapter();
    const handled = await handleContactReplyButton(interaction as never, { adapter } as never);
    expect(handled).toBe(false);
  });
});
