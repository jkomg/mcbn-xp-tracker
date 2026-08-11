import { describe, expect, it, vi, beforeEach } from 'vitest';

const mockConfig = vi.hoisted(() => ({
  correspondenceRumorChannelId: 'rumor-channel-1',
  staffRoleStorytellerId: 'st-role',
  staffRoleSystemHelperId: 'helper-role',
  staffRoleModeratorId: 'mod-role',
  staffRoleAdministratorId: 'admin-role',
  passageOfTimeTimezone: 'America/Chicago',
  passageSunsetWeekdayLocal: 2,
  passageSunsetHourLocal: 12,
  passageSunsetMinuteLocal: 0,
  passageSunsetAnchorDate: '2026-01-06',
}));

// Mirrors production: liveConfig is what rumor.ts actually reads for the
// channel ID and the approval-gate flag, since it's already fully resolved
// (env default, DB override, or explicit blank-to-disable) by boot-time
// seeding / ConfigSyncWorker.
const mockLiveConfig = vi.hoisted(() => ({
  correspondenceRumorChannelId: 'rumor-channel-1',
  rumorApprovalEnabled: false,
}));

vi.mock('../config', () => ({ config: mockConfig }));
vi.mock('../liveConfig', () => ({ liveConfig: mockLiveConfig }));

const mockFindCubbyChannel = vi.hoisted(() => vi.fn());
vi.mock('../services/cubbyChannels', () => ({ findCubbyChannel: mockFindCubbyChannel }));

import {
  autocomplete,
  execute,
  handleRumorButton,
  handleRumorModal,
  handleRumorRejectModal,
  isRumorButton,
  resolveTags,
} from '../commands/rumor';

function makeAdapter(overrides: Record<string, unknown> = {}) {
  return {
    getActiveRosterWithIds: vi.fn().mockResolvedValue({
      characters: [
        { name: 'Alice', discordId: '111111111111111111' },
        { name: 'Marcus', discordId: null },
      ],
    }),
    createRumor: vi.fn().mockResolvedValue({ ok: true, rumor: baseRumor() }),
    setRumorCubbyMessage: vi.fn().mockResolvedValue(undefined),
    setRumorPostedMessage: vi.fn().mockResolvedValue(true),
    approveRumor: vi.fn().mockResolvedValue({
      ok: true,
      rumor: baseRumor({ status: 'approved', approved_by_discord_id: 'st-1', approved_by_name: 'storyteller' }),
    }),
    rejectRumor: vi.fn().mockResolvedValue({
      ok: true,
      rumor: baseRumor({ status: 'rejected', rejected_reason: 'Too similar to an existing rumor' }),
    }),
    ...overrides,
  };
}

function baseRumor(overrides: Record<string, unknown> = {}) {
  return {
    id: 9,
    discovery: 'Kindred',
    rumor_text: 'The Prince was seen leaving in a hurry.',
    location: 'Elysium',
    point_of_contact: 'DC 6',
    roll: 'Intelligence + Streetwise DC 6',
    kind: 'permanent',
    ic_night_key: '',
    status: 'pending',
    requester_discord_id: '111111111111111111',
    requester_character_name: 'Alice',
    cubby_channel_id: 'cubby-1',
    cubby_message_id: 'cubby-msg-1',
    posted_channel_id: null,
    posted_message_id: null,
    approved_by_discord_id: '',
    approved_by_name: '',
    rejected_by_discord_id: '',
    rejected_by_name: '',
    rejected_reason: '',
    created_at: null,
    resolved_at: null,
    ...overrides,
  };
}

function makeChatInteraction(options: Record<string, string | null>, userId = 'user-1') {
  return {
    user: { id: userId, username: `user-${userId}` },
    options: { getString: (key: string) => options[key] ?? null },
    reply: vi.fn().mockResolvedValue(undefined),
    showModal: vi.fn().mockResolvedValue(undefined),
  };
}

/** Legacy-flow modal interaction: a single client-wide channel, matching the
 * pre-approval-flow behavior where /rumor only ever touches #rumors. */
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
  mockLiveConfig.correspondenceRumorChannelId = 'rumor-channel-1';
  mockLiveConfig.rumorApprovalEnabled = false;
  mockFindCubbyChannel.mockReset();
});

describe('/rumor (approval off — legacy immediate-post behavior)', () => {
  it('rejects when the channel is not configured', async () => {
    mockLiveConfig.correspondenceRumorChannelId = '';
    mockConfig.correspondenceRumorChannelId = '';
    const interaction = makeChatInteraction({ discovery: 'Streets', type: 'permanent' });
    const adapter = makeAdapter();
    await execute(interaction as never, { adapter } as never);
    expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining('not configured') }));
  });

  it('rejects an unknown source-character', async () => {
    const interaction = makeChatInteraction({ discovery: 'Streets', type: 'permanent', 'source-character': 'Nobody' });
    const adapter = makeAdapter();
    await execute(interaction as never, { adapter } as never);
    expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining('Unknown character') }));
  });

  it('opens the modal when discovery and type alone are provided', async () => {
    const interaction = makeChatInteraction({ discovery: 'Streets', type: 'permanent' });
    const adapter = makeAdapter();
    await execute(interaction as never, { adapter } as never);
    expect(interaction.showModal).toHaveBeenCalledTimes(1);
    // The approval flag is off, so /rumor doesn't need to know who's posting.
    expect(adapter.getActiveRosterWithIds).not.toHaveBeenCalled();
  });

  it('reports session expiry when there is no pending rumor', async () => {
    const interaction = makeModalInteraction({ rumor_text: 'x', roll: 'x' }, 'never-started');
    const adapter = makeAdapter();
    const handled = await handleRumorModal(interaction as never, { adapter } as never);
    expect(handled).toBe(true);
    expect(interaction.editReply).toHaveBeenCalledWith(expect.stringContaining('Session expired'));
  });

  it('reproduces the exact template byte-for-byte, with Location omitted when blank', async () => {
    const cmdInteraction = makeChatInteraction({ discovery: 'Kindred', type: 'permanent' }, 'user-1');
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
    const handled = await handleRumorModal(modalInteraction as never, { adapter } as never);

    expect(handled).toBe(true);
    expect(adapter.createRumor).not.toHaveBeenCalled();
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
    const cmdInteraction = makeChatInteraction({ discovery: 'Underworld', type: 'permanent' }, 'user-1');
    const adapter = makeAdapter();
    await execute(cmdInteraction as never, { adapter } as never);

    const modalInteraction = makeModalInteraction(
      { rumor_text: 'Something stirs beneath the city.', location: 'The Sewers', point_of_contact: 'DC 4', roll: 'Wits + Streetwise DC 4' },
      'user-1',
    );
    await handleRumorModal(modalInteraction as never, { adapter } as never);

    const posted = modalInteraction._channel.send.mock.calls[0][0].content as string;
    expect(posted).toContain('**Location (Optional)**: The Sewers\n');
    expect(posted.split('\n').indexOf('**Location (Optional)**: The Sewers')).toBe(2);
  });

  it('uses a real mention for Point of Contact when a source-character with a linked Discord account is set and the field is left blank', async () => {
    const cmdInteraction = makeChatInteraction({ discovery: 'High Society', type: 'permanent', 'source-character': 'Alice' }, 'user-1');
    const adapter = makeAdapter();
    await execute(cmdInteraction as never, { adapter } as never);

    const modalInteraction = makeModalInteraction(
      { rumor_text: 'Alice was seen near the docks.', point_of_contact: '', roll: 'Manipulation + Subterfuge DC 5' },
      'user-1',
    );
    await handleRumorModal(modalInteraction as never, { adapter } as never);

    const posted = modalInteraction._channel.send.mock.calls[0][0].content as string;
    expect(posted).toContain('**Point of Contact**: <@111111111111111111>');
  });

  it('prefers typed Point of Contact text over the source-character mention when both are given', async () => {
    const cmdInteraction = makeChatInteraction({ discovery: 'Streets', type: 'permanent', 'source-character': 'Alice' }, 'user-1');
    const adapter = makeAdapter();
    await execute(cmdInteraction as never, { adapter } as never);

    const modalInteraction = makeModalInteraction(
      { rumor_text: 'x', point_of_contact: 'DC 8 instead', roll: 'y' },
      'user-1',
    );
    await handleRumorModal(modalInteraction as never, { adapter } as never);

    const posted = modalInteraction._channel.send.mock.calls[0][0].content as string;
    expect(posted).toContain('**Point of Contact**: DC 8 instead');
  });

  it('spoiler-wraps only the rumor text, not the other fields', async () => {
    const cmdInteraction = makeChatInteraction({ discovery: 'Streets', type: 'permanent' }, 'user-1');
    const adapter = makeAdapter();
    await execute(cmdInteraction as never, { adapter } as never);

    const modalInteraction = makeModalInteraction(
      { rumor_text: 'secret info', location: 'no spoiler here', point_of_contact: 'no spoiler here either', roll: 'no spoiler on roll' },
      'user-1',
    );
    await handleRumorModal(modalInteraction as never, { adapter } as never);

    const posted = modalInteraction._channel.send.mock.calls[0][0].content as string;
    expect(posted).toContain('||secret info||');
    expect(posted).not.toContain('||no spoiler');
  });

  it('resolves @role and #location tags against the guild when present', async () => {
    const cmdInteraction = makeChatInteraction({ discovery: 'Kindred', type: 'permanent' }, 'user-1');
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
    await handleRumorModal(modalInteraction as never, { adapter } as never);

    const posted = modalInteraction._channel.send.mock.calls[0][0].content as string;
    expect(posted).toContain('The <@&role-camcourt> was seen near <#chan-downtown>.');
    expect(posted).toContain('**Location (Optional)**: <#chan-downtown>');
  });

  it('leaves an out-of-allowlist role tag as literal text', async () => {
    const cmdInteraction = makeChatInteraction({ discovery: 'Kindred', type: 'permanent' }, 'user-1');
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
    await handleRumorModal(modalInteraction as never, { adapter } as never);

    const posted = modalInteraction._channel.send.mock.calls[0][0].content as string;
    expect(posted).toContain('@Administrator');
    expect(posted).not.toContain('<@&role-admin>');
  });

  it('still posts normally when there is no guild on the interaction', async () => {
    const cmdInteraction = makeChatInteraction({ discovery: 'Kindred', type: 'permanent' }, 'user-1');
    const adapter = makeAdapter();
    await execute(cmdInteraction as never, { adapter } as never);

    const modalInteraction = makeModalInteraction(
      { rumor_text: 'No guild context here @Kindred.', point_of_contact: 'DC 5', roll: 'x' },
      'user-1',
    );
    const handled = await handleRumorModal(modalInteraction as never, { adapter } as never);

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

  it('suggests only owned characters for character', async () => {
    const interaction = {
      user: { id: '111111111111111111' },
      options: { getFocused: () => ({ name: 'character', value: '' }) },
      respond: vi.fn().mockResolvedValue(undefined),
    };
    const adapter = makeAdapter();
    await autocomplete(interaction as never, { adapter } as never);
    const responded = interaction.respond.mock.calls[0][0] as Array<{ name: string }>;
    expect(responded.map((c) => c.name)).toEqual(['Alice']);
  });
});

// ---------------------------------------------------------------------------
// Approval flow (liveConfig.rumorApprovalEnabled = true)
// ---------------------------------------------------------------------------

function makeApprovalChatInteraction(options: Record<string, string | null>, client: unknown, userId = 'user-1') {
  return {
    user: { id: userId, username: `user-${userId}` },
    guild: { id: 'guild-1' },
    options: { getString: (key: string) => options[key] ?? null },
    reply: vi.fn().mockResolvedValue(undefined),
    showModal: vi.fn().mockResolvedValue(undefined),
    client,
  };
}

function makeApprovalModalInteraction(fields: Record<string, string>, client: unknown, userId = 'user-1') {
  return {
    customId: 'rumor:submit',
    user: { id: userId, username: `user-${userId}` },
    guild: { id: 'guild-1' },
    deferReply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
    fields: { getTextInputValue: (key: string) => fields[key] ?? '' },
    client,
  };
}

function makeCubbyMessage() {
  return { id: 'cubby-msg-1', edit: vi.fn().mockResolvedValue(undefined) };
}

function makeCubbyChannel(message: ReturnType<typeof makeCubbyMessage>) {
  return {
    id: 'cubby-1',
    isTextBased: () => true,
    send: vi.fn().mockResolvedValue(message),
    messages: { fetch: vi.fn().mockResolvedValue(message) },
  };
}

function makeRumorChannel() {
  return { id: 'rumor-channel-1', isTextBased: () => true, send: vi.fn().mockResolvedValue({ id: 'public-msg-1' }) };
}

function makeApprovalClient(rumorChannel: unknown, cubbyChannel: unknown) {
  return {
    channels: {
      fetch: vi.fn((id: string) => {
        if (id === 'rumor-channel-1') return Promise.resolve(rumorChannel);
        if (id === 'cubby-1') return Promise.resolve(cubbyChannel);
        return Promise.resolve(null);
      }),
    },
  };
}

function makeButtonInteraction(customId: string, member: unknown, client: unknown) {
  return {
    customId,
    user: { id: 'st-1', username: 'storyteller' },
    member,
    client,
    reply: vi.fn().mockResolvedValue(undefined),
    deferReply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
    showModal: vi.fn().mockResolvedValue(undefined),
  };
}

const staffMember = { roles: ['st-role'] };
const playerMember = { roles: ['player-role'] };

describe('/rumor execute — approval on', () => {
  it('resolves the poster\'s own character before showing the modal', async () => {
    mockLiveConfig.rumorApprovalEnabled = true;
    const client = makeApprovalClient(makeRumorChannel(), makeCubbyChannel(makeCubbyMessage()));
    const interaction = makeApprovalChatInteraction({ discovery: 'Kindred', type: 'ephemeral' }, client, '111111111111111111');
    const adapter = makeAdapter();

    await execute(interaction as never, { adapter } as never);

    expect(interaction.showModal).toHaveBeenCalledTimes(1);
    expect(adapter.getActiveRosterWithIds).toHaveBeenCalled();
  });

  it('errors instead of showing the modal when the poster has no linked character', async () => {
    mockLiveConfig.rumorApprovalEnabled = true;
    const client = makeApprovalClient(makeRumorChannel(), makeCubbyChannel(makeCubbyMessage()));
    const interaction = makeApprovalChatInteraction({ discovery: 'Kindred', type: 'permanent' }, client);
    const adapter = makeAdapter({ getActiveRosterWithIds: vi.fn().mockResolvedValue({ characters: [] }) });

    await execute(interaction as never, { adapter } as never);

    expect(interaction.showModal).not.toHaveBeenCalled();
    expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining('No linked active character') }));
  });
});

describe('/rumor modal submit — approval on', () => {
  it('queues the rumor and posts an approval request to the poster\'s cubby', async () => {
    mockLiveConfig.rumorApprovalEnabled = true;
    const message = makeCubbyMessage();
    const cubbyChannel = makeCubbyChannel(message);
    mockFindCubbyChannel.mockResolvedValue(cubbyChannel);
    const client = makeApprovalClient(makeRumorChannel(), cubbyChannel);
    const adapter = makeAdapter();

    const chatInteraction = makeApprovalChatInteraction({ discovery: 'Kindred', type: 'ephemeral' }, client, '111111111111111111');
    await execute(chatInteraction as never, { adapter } as never);

    const modalInteraction = makeApprovalModalInteraction(
      { rumor_text: 'A secret', location: '', point_of_contact: 'DC 5', roll: 'Wits + Streetwise DC 5' },
      client,
      '111111111111111111',
    );
    const handled = await handleRumorModal(modalInteraction as never, { adapter } as never);

    expect(handled).toBe(true);
    expect(adapter.createRumor).toHaveBeenCalledWith(
      { requesterDiscordId: '111111111111111111', requesterDiscordName: 'user-111111111111111111' },
      expect.objectContaining({
        discovery: 'Kindred',
        rumorText: 'A secret',
        kind: 'ephemeral',
        requesterCharacterName: 'Alice',
      }),
    );
    expect(cubbyChannel.send).toHaveBeenCalledTimes(1);
    const sendArgs = cubbyChannel.send.mock.calls[0][0];
    expect(sendArgs.content).toBe('<@&helper-role>');
    expect(sendArgs.embeds[0].data.title).toBe('📜 Rumor Approval');
    expect(sendArgs.components).toHaveLength(1);
    expect(adapter.setRumorCubbyMessage).toHaveBeenCalledWith(9, 'cubby-1', 'cubby-msg-1');
    expect(modalInteraction.editReply).toHaveBeenCalledWith(expect.stringContaining('Rumor #9 queued for ST approval'));
  });

  it('reports a queued-but-unnotified rumor when the cubby cannot be found', async () => {
    mockLiveConfig.rumorApprovalEnabled = true;
    mockFindCubbyChannel.mockResolvedValue(null);
    const client = makeApprovalClient(makeRumorChannel(), makeCubbyChannel(makeCubbyMessage()));
    const adapter = makeAdapter();

    const chatInteraction = makeApprovalChatInteraction({ discovery: 'Kindred', type: 'permanent' }, client, '111111111111111111');
    await execute(chatInteraction as never, { adapter } as never);

    const modalInteraction = makeApprovalModalInteraction(
      { rumor_text: 'A secret', location: '', point_of_contact: 'DC 5', roll: 'Wits + Streetwise DC 5' },
      client,
      '111111111111111111',
    );
    const handled = await handleRumorModal(modalInteraction as never, { adapter } as never);

    expect(handled).toBe(true);
    expect(modalInteraction.editReply).toHaveBeenCalledWith(expect.stringContaining("couldn't find your cubby channel"));
  });

  it('surfaces the API error message when queueing fails', async () => {
    mockLiveConfig.rumorApprovalEnabled = true;
    const client = makeApprovalClient(makeRumorChannel(), makeCubbyChannel(makeCubbyMessage()));
    const adapter = makeAdapter({ createRumor: vi.fn().mockResolvedValue({ ok: false, message: 'boom' }) });

    const chatInteraction = makeApprovalChatInteraction({ discovery: 'Kindred', type: 'permanent' }, client, '111111111111111111');
    await execute(chatInteraction as never, { adapter } as never);

    const modalInteraction = makeApprovalModalInteraction(
      { rumor_text: 'A secret', location: '', point_of_contact: 'DC 5', roll: 'Wits + Streetwise DC 5' },
      client,
      '111111111111111111',
    );
    await handleRumorModal(modalInteraction as never, { adapter } as never);

    expect(modalInteraction.editReply).toHaveBeenCalledWith(expect.stringContaining('Could not queue the rumor: boom'));
  });
});

describe('isRumorButton', () => {
  it('matches approve and reject prefixes only', () => {
    expect(isRumorButton('RUMOR_APPROVE:9')).toBe(true);
    expect(isRumorButton('RUMOR_REJECT:9')).toBe(true);
    expect(isRumorButton('SOMETHING_ELSE:9')).toBe(false);
  });
});

describe('rumor Approve button', () => {
  it('blocks non-staff members with an ephemeral reply', async () => {
    const client = makeApprovalClient(makeRumorChannel(), makeCubbyChannel(makeCubbyMessage()));
    const interaction = makeButtonInteraction('RUMOR_APPROVE:9', playerMember, client);
    const adapter = makeAdapter();

    await handleRumorButton(interaction as never, { adapter } as never);

    expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({ content: 'Storytellers only.', ephemeral: true }));
    expect(adapter.approveRumor).not.toHaveBeenCalled();
  });

  it('approves, posts to #rumors, records the posted message, and updates the cubby message', async () => {
    const rumorChannel = makeRumorChannel();
    const cubbyMessage = makeCubbyMessage();
    const cubbyChannel = makeCubbyChannel(cubbyMessage);
    const client = makeApprovalClient(rumorChannel, cubbyChannel);
    const interaction = makeButtonInteraction('RUMOR_APPROVE:9', staffMember, client);
    const adapter = makeAdapter();

    await handleRumorButton(interaction as never, { adapter } as never);

    expect(adapter.approveRumor).toHaveBeenCalledWith(9, { requesterDiscordId: 'st-1', requesterDiscordName: 'storyteller' });
    expect(rumorChannel.send).toHaveBeenCalledTimes(1);
    expect(rumorChannel.send.mock.calls[0][0].content).toContain('||The Prince was seen leaving in a hurry.||');
    expect(adapter.setRumorPostedMessage).toHaveBeenCalledWith(9, 'rumor-channel-1', 'public-msg-1');
    expect(cubbyMessage.edit).toHaveBeenCalledTimes(1);
    expect(cubbyMessage.edit.mock.calls[0][0].components).toEqual([]);
    expect(interaction.editReply).toHaveBeenCalledWith(expect.stringContaining('Approved rumor #9'));
  });

  it('shows the already-resolved state on a 409 without erroring', async () => {
    const cubbyMessage = makeCubbyMessage();
    const client = makeApprovalClient(makeRumorChannel(), makeCubbyChannel(cubbyMessage));
    const interaction = makeButtonInteraction('RUMOR_APPROVE:9', staffMember, client);
    const adapter = makeAdapter({
      approveRumor: vi.fn().mockResolvedValue({
        ok: false,
        alreadyResolved: true,
        message: 'Rumor is already rejected — nothing to do',
        rumor: baseRumor({ status: 'rejected', rejected_by_name: 'otherST' }),
      }),
    });

    await handleRumorButton(interaction as never, { adapter } as never);

    expect(cubbyMessage.edit).toHaveBeenCalledTimes(1);
    expect(interaction.editReply).toHaveBeenCalledWith(expect.stringContaining('already rejected by otherST'));
  });

  it('keeps a retry button and warns instead of claiming success when posting to #rumors fails', async () => {
    const rumorChannel = { id: 'rumor-channel-1', isTextBased: () => true, send: vi.fn().mockRejectedValue(new Error('Discord outage')) };
    const cubbyMessage = makeCubbyMessage();
    const client = makeApprovalClient(rumorChannel, makeCubbyChannel(cubbyMessage));
    const interaction = makeButtonInteraction('RUMOR_APPROVE:9', staffMember, client);
    const adapter = makeAdapter();

    await handleRumorButton(interaction as never, { adapter } as never);

    expect(adapter.setRumorPostedMessage).not.toHaveBeenCalled();
    expect(cubbyMessage.edit).toHaveBeenCalledTimes(1);
    // Retry Post button, not stripped — the rumor is stuck 'approved' server-side
    // with nothing posted, so the only way forward is clicking Approve again.
    expect(cubbyMessage.edit.mock.calls[0][0].components).toHaveLength(1);
    expect(interaction.editReply).toHaveBeenCalledWith(expect.stringContaining('click Approve again in the cubby to retry'));
  });

  it('retries just the post (not a full re-approve) when clicked again after an approved-but-unposted rumor', async () => {
    const rumorChannel = makeRumorChannel();
    const cubbyMessage = makeCubbyMessage();
    const client = makeApprovalClient(rumorChannel, makeCubbyChannel(cubbyMessage));
    const interaction = makeButtonInteraction('RUMOR_APPROVE:9', staffMember, client);
    const adapter = makeAdapter({
      approveRumor: vi.fn().mockResolvedValue({
        ok: false,
        alreadyResolved: true,
        message: 'Rumor is already approved — nothing to do',
        rumor: baseRumor({ status: 'approved', approved_by_name: 'firstST', posted_message_id: null }),
      }),
    });

    await handleRumorButton(interaction as never, { adapter } as never);

    expect(rumorChannel.send).toHaveBeenCalledTimes(1);
    expect(adapter.setRumorPostedMessage).toHaveBeenCalledWith(9, 'rumor-channel-1', 'public-msg-1');
    expect(interaction.editReply).toHaveBeenCalledWith(expect.stringContaining('Approved rumor #9'));
  });

  it('warns that automatic expiry may not work when the posted-message mapping fails to save for an ephemeral rumor', async () => {
    const rumorChannel = makeRumorChannel();
    const cubbyMessage = makeCubbyMessage();
    const client = makeApprovalClient(rumorChannel, makeCubbyChannel(cubbyMessage));
    const interaction = makeButtonInteraction('RUMOR_APPROVE:9', staffMember, client);
    const adapter = makeAdapter({
      approveRumor: vi.fn().mockResolvedValue({
        ok: true,
        rumor: baseRumor({ status: 'approved', kind: 'ephemeral', approved_by_name: 'storyteller' }),
      }),
      setRumorPostedMessage: vi.fn().mockResolvedValue(false),
    });

    await handleRumorButton(interaction as never, { adapter } as never);

    expect(rumorChannel.send).toHaveBeenCalledTimes(1);
    expect(interaction.editReply).toHaveBeenCalledWith(expect.stringContaining('automatic expiry for this ephemeral rumor may not work'));
  });
});

describe('rumor Reject button + modal', () => {
  it('blocks non-staff members from opening the reject modal', async () => {
    const client = makeApprovalClient(makeRumorChannel(), makeCubbyChannel(makeCubbyMessage()));
    const interaction = makeButtonInteraction('RUMOR_REJECT:9', playerMember, client);
    const adapter = makeAdapter();

    await handleRumorButton(interaction as never, { adapter } as never);

    expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({ content: 'Storytellers only.', ephemeral: true }));
    expect(interaction.showModal).not.toHaveBeenCalled();
  });

  it('shows the reject modal for staff', async () => {
    const client = makeApprovalClient(makeRumorChannel(), makeCubbyChannel(makeCubbyMessage()));
    const interaction = makeButtonInteraction('RUMOR_REJECT:9', staffMember, client);
    const adapter = makeAdapter();

    await handleRumorButton(interaction as never, { adapter } as never);

    expect(interaction.showModal).toHaveBeenCalledTimes(1);
  });

  it('rejects with a reason and updates the cubby message', async () => {
    const cubbyMessage = makeCubbyMessage();
    const client = makeApprovalClient(makeRumorChannel(), makeCubbyChannel(cubbyMessage));
    const interaction = {
      customId: 'RUMOR_REJECT_MODAL:9',
      user: { id: 'st-1', username: 'storyteller' },
      member: staffMember,
      client,
      reply: vi.fn().mockResolvedValue(undefined),
      deferReply: vi.fn().mockResolvedValue(undefined),
      editReply: vi.fn().mockResolvedValue(undefined),
      fields: { getTextInputValue: () => 'Too similar to an existing rumor' },
    };

    const adapter = makeAdapter();
    const handled = await handleRumorRejectModal(interaction as never, { adapter } as never);

    expect(handled).toBe(true);
    expect(adapter.rejectRumor).toHaveBeenCalledWith(
      9,
      { requesterDiscordId: 'st-1', requesterDiscordName: 'storyteller' },
      'Too similar to an existing rumor',
    );
    expect(cubbyMessage.edit).toHaveBeenCalledTimes(1);
    expect(interaction.editReply).toHaveBeenCalledWith('Rumor rejected.');
  });

  it('ignores modal submissions with an unrelated customId', async () => {
    const adapter = makeAdapter();
    const interaction = {
      customId: 'SOME_OTHER_MODAL:9',
      user: { id: 'st-1', username: 'storyteller' },
      member: staffMember,
      client: makeApprovalClient(null, null),
      reply: vi.fn().mockResolvedValue(undefined),
      fields: { getTextInputValue: () => '' },
    };

    const handled = await handleRumorRejectModal(interaction as never, { adapter } as never);

    expect(handled).toBe(false);
    expect(adapter.rejectRumor).not.toHaveBeenCalled();
  });
});
