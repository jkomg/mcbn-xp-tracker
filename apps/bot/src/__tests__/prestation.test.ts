import { describe, expect, it, vi, beforeEach } from 'vitest';

const mockConfig = vi.hoisted(() => ({
  correspondencePrestationChannelId: 'prestation-channel-1',
}));

vi.mock('../config', () => ({ config: mockConfig }));

import { autocomplete, execute } from '../commands/prestation';

function makeRoster() {
  return {
    characters: [
      { name: 'Alice', discordId: 'user-1' },
      { name: 'Marcus', discordId: 'user-2' },
    ],
  };
}

function makeAdapter(overrides: Record<string, unknown> = {}) {
  return {
    getActiveRosterWithIds: vi.fn().mockResolvedValue(makeRoster()),
    createBoon: vi.fn().mockResolvedValue({
      ok: true,
      boon: { id: 5, creditor_character_name: 'Alice', debtor_character_name: 'Marcus', tier: 'minor', reason: 'test', status: 'owed' },
    }),
    getBoonsForCharacter: vi.fn().mockResolvedValue({
      character_name: 'Alice',
      boons: [
        { id: 5, direction: 'owed_to_me', counterparty_name: 'Marcus', tier: 'minor', reason: 'test', status: 'owed' },
        { id: 6, direction: 'i_owe', counterparty_name: 'Marcus', tier: 'major', reason: '', status: 'repayment_offered' },
      ],
    }),
    actOnBoonRepay: vi.fn().mockResolvedValue({
      ok: true,
      boon: { id: 5, creditor_character_name: 'Alice', debtor_character_name: 'Marcus', tier: 'minor', status: 'repayment_offered' },
    }),
    ...overrides,
  };
}

function makeChannel() {
  return { isTextBased: () => true, send: vi.fn().mockResolvedValue(undefined) };
}

function makeChatInteraction(sub: string, options: Record<string, string | null>, userId = 'user-1') {
  const channel = makeChannel();
  return {
    user: { id: userId, username: `user-${userId}` },
    options: {
      getSubcommand: () => sub,
      getString: (key: string) => options[key] ?? null,
    },
    reply: vi.fn().mockResolvedValue(undefined),
    deferReply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
    client: { channels: { fetch: vi.fn().mockResolvedValue(channel) } },
    _channel: channel,
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

beforeEach(() => {
  mockConfig.correspondencePrestationChannelId = 'prestation-channel-1';
});

describe('/prestation owe', () => {
  it('rejects when the channel is not configured', async () => {
    mockConfig.correspondencePrestationChannelId = '';
    const interaction = makeChatInteraction('owe', { debtor: 'Marcus', tier: 'minor', reason: 'x' }, 'user-1');
    const adapter = makeAdapter();
    await execute(interaction as never, { adapter } as never);
    expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining('not configured') }));
  });

  it('rejects a self-owed boon', async () => {
    const interaction = makeChatInteraction('owe', { debtor: 'Alice', tier: 'minor', reason: 'x' }, 'user-1');
    const adapter = makeAdapter();
    await execute(interaction as never, { adapter } as never);
    expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining("can't owe a boon to themself") }));
  });

  it('creates the boon and posts a public embed', async () => {
    const interaction = makeChatInteraction('owe', { debtor: 'Marcus', tier: 'minor', reason: 'Covered a shift' }, 'user-1');
    const adapter = makeAdapter();

    await execute(interaction as never, { adapter } as never);

    expect(adapter.createBoon).toHaveBeenCalledWith(
      { requesterDiscordId: 'user-1', requesterDiscordName: 'user-user-1' },
      { creditorCharacterName: 'Alice', debtorCharacterName: 'Marcus', tier: 'minor', reason: 'Covered a shift' },
    );
    expect(interaction._channel.send).toHaveBeenCalledTimes(1);
    const embed = interaction._channel.send.mock.calls[0][0].embeds[0];
    expect(embed.data.title).toBe('🩸 Boon Owed');
    expect(interaction.editReply).toHaveBeenCalledWith(expect.stringContaining('Boon #5 recorded'));
  });

  it('surfaces the API error message when creation fails', async () => {
    const interaction = makeChatInteraction('owe', { debtor: 'Marcus', tier: 'minor', reason: 'x' }, 'user-1');
    const adapter = makeAdapter({ createBoon: vi.fn().mockResolvedValue({ ok: false, message: 'A character cannot owe a boon to themself' }) });

    await execute(interaction as never, { adapter } as never);

    expect(interaction.editReply).toHaveBeenCalledWith(expect.stringContaining('Could not record the boon'));
    expect(interaction._channel.send).not.toHaveBeenCalled();
  });
});

describe('/prestation status', () => {
  it('shows both directions in one ephemeral embed', async () => {
    const interaction = makeChatInteraction('status', {}, 'user-1');
    const adapter = makeAdapter();

    await execute(interaction as never, { adapter } as never);

    const embed = interaction.editReply.mock.calls[0][0].embeds[0];
    const fields = embed.data.fields as Array<{ name: string; value: string }>;
    expect(fields.find((f) => f.name === 'Owed to you')?.value).toContain('#5');
    expect(fields.find((f) => f.name === 'You owe')?.value).toContain('#6');
  });
});

describe('/prestation repay', () => {
  it('rejects a malformed boon id', async () => {
    const interaction = makeChatInteraction('repay', { boon_id: 'nope' }, 'user-1');
    const adapter = makeAdapter();
    await execute(interaction as never, { adapter } as never);
    expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining('autocomplete list') }));
  });

  it('posts the propose-repayment summary when status is repayment_offered', async () => {
    const interaction = makeChatInteraction('repay', { boon_id: '5' }, 'user-2');
    const adapter = makeAdapter();

    await execute(interaction as never, { adapter } as never);

    expect(interaction._channel.send).toHaveBeenCalledWith({
      content: '🔸 Repayment of Boon #5 proposed by Marcus — awaiting confirmation from Alice.',
    });
  });

  it('posts the repaid summary when status is repaid', async () => {
    const interaction = makeChatInteraction('repay', { boon_id: '5' }, 'user-1');
    const adapter = makeAdapter({
      actOnBoonRepay: vi.fn().mockResolvedValue({
        ok: true,
        boon: { id: 5, creditor_character_name: 'Alice', debtor_character_name: 'Marcus', status: 'repaid' },
      }),
    });

    await execute(interaction as never, { adapter } as never);

    expect(interaction._channel.send).toHaveBeenCalledWith({
      content: '✅ Boon #5 repaid — Alice ↔ Marcus.',
    });
  });

  it('surfaces a 409-style rejection message without posting to the channel', async () => {
    const interaction = makeChatInteraction('repay', { boon_id: '5' }, 'user-1');
    const adapter = makeAdapter({
      actOnBoonRepay: vi.fn().mockResolvedValue({ ok: false, message: 'Only the debtor can propose repayment of an owed boon' }),
    });

    await execute(interaction as never, { adapter } as never);

    expect(interaction.editReply).toHaveBeenCalledWith(expect.stringContaining('Only the debtor can propose'));
    expect(interaction._channel.send).not.toHaveBeenCalled();
  });
});

describe('/prestation autocomplete', () => {
  it('lists open boons for boon_id with a human-readable label', async () => {
    const interaction = makeAutocompleteInteraction('boon_id', '');
    const adapter = makeAdapter();
    await autocomplete(interaction as never, { adapter } as never);
    const responded = interaction.respond.mock.calls[0][0] as Array<{ name: string; value: string }>;
    expect(responded).toEqual([
      { name: '#5 — Minor owed by Marcus (owed)', value: '5' },
      { name: '#6 — Major owed to Marcus (repayment_offered)', value: '6' },
    ]);
  });

  it('suggests active roster characters for "debtor"', async () => {
    const interaction = makeAutocompleteInteraction('debtor', 'm');
    const adapter = makeAdapter();
    await autocomplete(interaction as never, { adapter } as never);
    const responded = interaction.respond.mock.calls[0][0] as Array<{ name: string }>;
    expect(responded.map((c) => c.name)).toEqual(['Marcus']);
  });
});
