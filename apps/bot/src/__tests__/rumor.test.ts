import { describe, expect, it, vi, beforeEach } from 'vitest';

const mockConfig = vi.hoisted(() => ({
  correspondenceRumorChannelId: 'rumor-channel-1',
}));

vi.mock('../config', () => ({ config: mockConfig }));

import { autocomplete, execute, handleRumorModal, resolveTags } from '../commands/rumor';

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

function makeModalInteraction(fields: Record<string, string>, userId = 'user-1', guild: unknown = undefined) {
  const channel = { isTextBased: () => true, send: vi.fn().mockResolvedValue(undefined) };
  return {
    customId: 'rumor:submit',
    user: { id: userId },
    deferReply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
    fields: { getTextInputValue: (key: string) => fields[key] ?? '' },
    client: { channels: { fetch: vi.fn().mockResolvedValue(channel) } },
    guild,
    _channel: channel,
  };
}

function makeGuild(
  roles: Array<{ id: string; name: string }>,
  channels: Array<{ id: string; name: string; type: number; parentId?: string }>,
) {
  return {
    roles: { fetch: vi.fn().mockResolvedValue(new Map(roles.map((r) => [r.id, r]))) },
    channels: { fetch: vi.fn().mockResolvedValue(new Map(channels.map((c) => [c.id, c]))) },
  };
}

const GUILD_TEXT = 0;
const GUILD_CATEGORY = 4;

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

  it('resolves @role and #location tags against the guild when present', async () => {
    const cmdInteraction = makeChatInteraction({ discovery: 'Kindred' }, 'user-1');
    const adapter = makeAdapter();
    await execute(cmdInteraction as never, { adapter } as never);

    const guild = makeGuild(
      [{ id: 'role-kindred', name: 'Kindred' }, { id: 'role-camcourt', name: 'Camarilla Court' }],
      [
        { id: 'cat-nash', name: 'city of nashville', type: GUILD_CATEGORY },
        { id: 'chan-downtown', name: 'downtown', type: GUILD_TEXT, parentId: 'cat-nash' },
      ],
    );
    const modalInteraction = makeModalInteraction(
      {
        rumor_text: 'The @Camarilla Court was seen near #downtown.',
        location: '#downtown',
        point_of_contact: 'DC 5',
        roll: 'x',
      },
      'user-1',
      guild,
    );
    await handleRumorModal(modalInteraction as never);

    const posted = modalInteraction._channel.send.mock.calls[0][0].content as string;
    expect(posted).toContain('The <@&role-camcourt> was seen near <#chan-downtown>.');
    expect(posted).toContain('**Location (Optional)**: <#chan-downtown>');
  });

  it('leaves an out-of-allowlist role tag as literal text', async () => {
    const cmdInteraction = makeChatInteraction({ discovery: 'Kindred' }, 'user-1');
    const adapter = makeAdapter();
    await execute(cmdInteraction as never, { adapter } as never);

    // "Administrator" is a real guild role but NOT on the taggable allowlist,
    // so it must never resolve into a real mention.
    const guild = makeGuild([{ id: 'role-admin', name: 'Administrator' }], []);
    const modalInteraction = makeModalInteraction(
      { rumor_text: 'Reported to @Administrator immediately.', point_of_contact: 'DC 5', roll: 'x' },
      'user-1',
      guild,
    );
    await handleRumorModal(modalInteraction as never);

    const posted = modalInteraction._channel.send.mock.calls[0][0].content as string;
    expect(posted).toContain('@Administrator');
    expect(posted).not.toContain('<@&role-admin>');
  });

  it('still posts normally when there is no guild on the interaction', async () => {
    const cmdInteraction = makeChatInteraction({ discovery: 'Kindred' }, 'user-1');
    const adapter = makeAdapter();
    await execute(cmdInteraction as never, { adapter } as never);

    const modalInteraction = makeModalInteraction(
      { rumor_text: 'No guild context here @Kindred.', point_of_contact: 'DC 5', roll: 'x' },
      'user-1',
    );
    const handled = await handleRumorModal(modalInteraction as never);

    expect(handled).toBe(true);
    const posted = modalInteraction._channel.send.mock.calls[0][0].content as string;
    expect(posted).toContain('@Kindred');
  });
});

describe('resolveTags', () => {
  const roleMap = new Map([
    ['kindred', 'role-kindred'],
    ['camarilla court', 'role-camcourt'],
  ]);
  const channelMap = new Map([
    ['downtown', 'chan-downtown'],
    ['north nashville', 'chan-northnash'],
  ]);

  it('resolves a single-word role tag', () => {
    expect(resolveTags('Word from @Kindred circles.', roleMap, channelMap)).toBe('Word from <@&role-kindred> circles.');
  });

  it('resolves a multi-word role tag, longest match first', () => {
    expect(resolveTags('Ask the @Camarilla Court about it.', roleMap, channelMap)).toBe('Ask the <@&role-camcourt> about it.');
  });

  it('resolves a hyphenated location tag typed as a channel slug', () => {
    expect(resolveTags('Meet at #north-nashville tonight.', roleMap, channelMap)).toBe('Meet at <#chan-northnash> tonight.');
  });

  it('resolves a location tag typed with spaces', () => {
    expect(resolveTags('Meet at #North Nashville tonight.', roleMap, channelMap)).toBe('Meet at <#chan-northnash> tonight.');
  });

  it('leaves unmatched tags as literal text', () => {
    expect(resolveTags('Ping @Administrator please.', roleMap, channelMap)).toBe('Ping @Administrator please.');
  });

  it('handles trailing punctuation correctly', () => {
    expect(resolveTags('It was @Kindred, allegedly.', roleMap, channelMap)).toBe('It was <@&role-kindred>, allegedly.');
  });

  it('resolves a single-word tag with a possessive suffix', () => {
    expect(resolveTags("It's @Kindred's gathering tonight.", roleMap, channelMap)).toBe(
      "It's <@&role-kindred>'s gathering tonight.",
    );
  });

  it('resolves a multi-word tag with a possessive suffix', () => {
    expect(resolveTags("The @Camarilla Court's decree was clear.", roleMap, channelMap)).toBe(
      "The <@&role-camcourt>'s decree was clear.",
    );
  });

  it('resolves a location tag with a possessive suffix', () => {
    expect(resolveTags("It's #downtown's finest hour.", roleMap, channelMap)).toBe(
      "It's <#chan-downtown>'s finest hour.",
    );
  });

  it('does not cross-match @ against locations or # against roles', () => {
    expect(resolveTags('#Kindred and @downtown', roleMap, channelMap)).toBe('#Kindred and @downtown');
  });

  it('leaves text with no tags untouched', () => {
    expect(resolveTags('Nothing to see here.', roleMap, channelMap)).toBe('Nothing to see here.');
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
