import { describe, expect, it, vi, beforeEach } from 'vitest';

const mockConfig = vi.hoisted(() => ({
  correspondenceRumorChannelId: 'rumor-channel-1',
}));

vi.mock('../config', () => ({ config: mockConfig }));

import { autocomplete, execute, handleRumorModal } from '../commands/rumor';

function makeAdapter() {
  return {
    getActiveRosterWithIds: vi.fn().mockResolvedValue({
      characters: [
        { name: 'Alice', discordId: '111111111111111111' },
        { name: 'Marcus', discordId: null },
      ],
    }),
  };
}

function makeChatInteraction(options: Record<string, string | null>, userId = 'user-1') {
  return {
    user: { id: userId },
    options: { getString: (key: string) => options[key] ?? null },
    reply: vi.fn().mockResolvedValue(undefined),
    showModal: vi.fn().mockResolvedValue(undefined),
  };
}

function makeModalInteraction(fields: Record<string, string>, userId = 'user-1') {
  const channel = { isTextBased: () => true, send: vi.fn().mockResolvedValue(undefined) };
  return {
    customId: 'rumor:submit',
    user: { id: userId },
    deferReply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
    fields: { getTextInputValue: (key: string) => fields[key] ?? '' },
    client: { channels: { fetch: vi.fn().mockResolvedValue(channel) } },
    _channel: channel,
  };
}

beforeEach(() => {
  mockConfig.correspondenceRumorChannelId = 'rumor-channel-1';
});

describe('/rumor', () => {
  it('rejects when the channel is not configured', async () => {
    mockConfig.correspondenceRumorChannelId = '';
    const interaction = makeChatInteraction({ discovery: 'Streets' });
    const adapter = makeAdapter();
    await execute(interaction as never, { adapter } as never);
    expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining('not configured') }));
  });

  it('rejects an unknown source-character', async () => {
    const interaction = makeChatInteraction({ discovery: 'Streets', 'source-character': 'Nobody' });
    const adapter = makeAdapter();
    await execute(interaction as never, { adapter } as never);
    expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining('Unknown character') }));
  });

  it('opens the modal when discovery alone is provided', async () => {
    const interaction = makeChatInteraction({ discovery: 'Streets' });
    const adapter = makeAdapter();
    await execute(interaction as never, { adapter } as never);
    expect(interaction.showModal).toHaveBeenCalledTimes(1);
  });

  it('reports session expiry when there is no pending rumor', async () => {
    const interaction = makeModalInteraction({ rumor_text: 'x', roll: 'x' }, 'never-started');
    const handled = await handleRumorModal(interaction as never);
    expect(handled).toBe(true);
    expect(interaction.editReply).toHaveBeenCalledWith(expect.stringContaining('Session expired'));
  });

  it('reproduces the exact template byte-for-byte, with Location omitted when blank', async () => {
    const cmdInteraction = makeChatInteraction({ discovery: 'Kindred' }, 'user-1');
    const adapter = makeAdapter();
    await execute(cmdInteraction as never, { adapter } as never);

    const modalInteraction = makeModalInteraction(
      {
        rumor_text: 'The Prince is dead.',
        location: '',
        point_of_contact: 'DC 6',
        roll: 'Resolve + Investigation DC 6',
      },
      'user-1',
    );
    const handled = await handleRumorModal(modalInteraction as never);

    expect(handled).toBe(true);
    const posted = modalInteraction._channel.send.mock.calls[0][0].content as string;
    expect(posted).toBe(
      [
        '**Rumor**: ||The Prince is dead.||',
        '**Point of Discovery**: Kindred',
        '**Point of Contact**: DC 6',
        '**Roll**: Resolve + Investigation DC 6',
        '',
        'If you want to maintain a rumor, let us know during downtime and we will not delete it!',
      ].join('\n'),
    );
    expect(modalInteraction.editReply).toHaveBeenCalledWith('Rumor posted.');
  });

  it('includes the Location line when provided', async () => {
    const cmdInteraction = makeChatInteraction({ discovery: 'Underworld' }, 'user-1');
    const adapter = makeAdapter();
    await execute(cmdInteraction as never, { adapter } as never);

    const modalInteraction = makeModalInteraction(
      { rumor_text: 'Something stirs beneath the city.', location: 'The Sewers', point_of_contact: 'DC 4', roll: 'Wits + Streetwise DC 4' },
      'user-1',
    );
    await handleRumorModal(modalInteraction as never);

    const posted = modalInteraction._channel.send.mock.calls[0][0].content as string;
    expect(posted).toContain('**Location (Optional)**: The Sewers\n');
    expect(posted.split('\n').indexOf('**Location (Optional)**: The Sewers')).toBe(2);
  });

  it('uses a real mention for Point of Contact when a source-character with a linked Discord account is set and the field is left blank', async () => {
    const cmdInteraction = makeChatInteraction({ discovery: 'High Society', 'source-character': 'Alice' }, 'user-1');
    const adapter = makeAdapter();
    await execute(cmdInteraction as never, { adapter } as never);

    const modalInteraction = makeModalInteraction(
      { rumor_text: 'Alice was seen near the docks.', point_of_contact: '', roll: 'Manipulation + Subterfuge DC 5' },
      'user-1',
    );
    await handleRumorModal(modalInteraction as never);

    const posted = modalInteraction._channel.send.mock.calls[0][0].content as string;
    expect(posted).toContain('**Point of Contact**: <@111111111111111111>');
  });

  it('prefers typed Point of Contact text over the source-character mention when both are given', async () => {
    const cmdInteraction = makeChatInteraction({ discovery: 'Streets', 'source-character': 'Alice' }, 'user-1');
    const adapter = makeAdapter();
    await execute(cmdInteraction as never, { adapter } as never);

    const modalInteraction = makeModalInteraction(
      { rumor_text: 'x', point_of_contact: 'DC 8 instead', roll: 'y' },
      'user-1',
    );
    await handleRumorModal(modalInteraction as never);

    const posted = modalInteraction._channel.send.mock.calls[0][0].content as string;
    expect(posted).toContain('**Point of Contact**: DC 8 instead');
  });

  it('spoiler-wraps only the rumor text, not the other fields', async () => {
    const cmdInteraction = makeChatInteraction({ discovery: 'Streets' }, 'user-1');
    const adapter = makeAdapter();
    await execute(cmdInteraction as never, { adapter } as never);

    const modalInteraction = makeModalInteraction(
      { rumor_text: 'secret info', location: 'no spoiler here', point_of_contact: 'no spoiler here either', roll: 'no spoiler on roll' },
      'user-1',
    );
    await handleRumorModal(modalInteraction as never);

    const posted = modalInteraction._channel.send.mock.calls[0][0].content as string;
    expect(posted).toContain('||secret info||');
    expect(posted).not.toContain('||no spoiler');
  });
});

describe('/rumor autocomplete', () => {
  it('suggests all active characters for source-character', async () => {
    const interaction = {
      user: { id: 'user-1' },
      options: { getFocused: () => ({ name: 'source-character', value: '' }) },
      respond: vi.fn().mockResolvedValue(undefined),
    };
    const adapter = makeAdapter();
    await autocomplete(interaction as never, { adapter } as never);
    const responded = interaction.respond.mock.calls[0][0] as Array<{ name: string }>;
    expect(responded.map((c) => c.name)).toEqual(['Alice', 'Marcus']);
  });
});
