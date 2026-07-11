import { describe, expect, it, vi, beforeEach } from 'vitest';

const mockConfig = vi.hoisted(() => ({
  correspondenceSceneRequestChannelId: 'scene-channel-1',
  staffRoleStorytellerId: 'st-role',
  staffRoleSystemHelperId: 'helper-role',
  staffRoleModeratorId: 'mod-role',
  staffRoleAdministratorId: 'admin-role',
}));

// Mirrors production: liveConfig (not config) is what scene.ts actually reads
// for the channel ID, since it's already fully resolved (env default, DB
// override, or explicit blank-to-disable) by boot-time seeding / ConfigSyncWorker.
const mockLiveConfig = vi.hoisted(() => ({
  correspondenceSceneRequestChannelId: 'scene-channel-1',
}));

vi.mock('../config', () => ({ config: mockConfig }));
vi.mock('../liveConfig', () => ({ liveConfig: mockLiveConfig }));

import {
  autocomplete,
  execute,
  handleSceneRequestButton,
  handleSceneRequestRejectModal,
  isSceneRequestButton,
} from '../commands/scene';

function baseRequest(overrides: Record<string, unknown> = {}) {
  return {
    id: 7,
    requester_character_name: 'Alice',
    requester_discord_id: 'user-1',
    spc_name: 'Prince Voss',
    play_period: 'Night 14',
    justification: 'Needs to answer for the elysium incident',
    status: 'pending',
    claimed_by_discord_id: '',
    claimed_by_name: '',
    rejected_reason: '',
    queue_channel_id: 'scene-channel-1',
    queue_message_id: 'msg-1',
    created_at: null,
    resolved_at: null,
    ...overrides,
  };
}

function makeAdapter(overrides: Record<string, unknown> = {}) {
  return {
    getActiveRosterWithIds: vi.fn().mockResolvedValue({ characters: [{ name: 'Alice', discordId: 'user-1' }] }),
    getActiveRosterWithChannelIds: vi.fn().mockResolvedValue({
      characters: [{ name: 'Alice', ticketChannelId: 'cubby-1' }],
    }),
    getRecentPeriods: vi.fn().mockResolvedValue([
      { label: 'Night 14', nightNumber: 14, startDate: '', endDate: '' },
    ]),
    createSceneRequest: vi.fn().mockResolvedValue({ ok: true, request: baseRequest() }),
    setSceneRequestQueueMessage: vi.fn().mockResolvedValue(undefined),
    claimSceneRequest: vi.fn().mockResolvedValue({
      ok: true,
      request: baseRequest({ status: 'claimed', claimed_by_discord_id: 'st-1', claimed_by_name: 'storyteller' }),
    }),
    rejectSceneRequest: vi.fn().mockResolvedValue({
      ok: true,
      request: baseRequest({ status: 'rejected', rejected_reason: 'SPC unavailable' }),
    }),
    ...overrides,
  };
}

function makeMessage() {
  return { id: 'msg-1', edit: vi.fn().mockResolvedValue(undefined) };
}

function makeQueueChannel(message: ReturnType<typeof makeMessage>) {
  return {
    id: 'scene-channel-1',
    isTextBased: () => true,
    send: vi.fn().mockResolvedValue(message),
    messages: { fetch: vi.fn().mockResolvedValue(message) },
  };
}

function makeCubbyChannel() {
  return { isTextBased: () => true, send: vi.fn().mockResolvedValue(undefined) };
}

function makeClient(queueChannel: unknown, cubbyChannel: unknown) {
  return {
    channels: {
      fetch: vi.fn((id: string) => {
        if (id === 'scene-channel-1') return Promise.resolve(queueChannel);
        if (id === 'cubby-1') return Promise.resolve(cubbyChannel);
        return Promise.resolve(null);
      }),
    },
  };
}

function makeChatInteraction(
  sub: string,
  options: Record<string, string | null>,
  client: unknown,
  userId = 'user-1',
) {
  return {
    user: { id: userId, username: `user-${userId}` },
    options: {
      getSubcommand: () => sub,
      getString: (key: string) => options[key] ?? null,
    },
    reply: vi.fn().mockResolvedValue(undefined),
    deferReply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
    client,
  };
}

function makeAutocompleteInteraction(focusedName: string, value: string, userId = 'user-1') {
  return {
    user: { id: userId },
    options: { getFocused: () => ({ name: focusedName, value }) },
    respond: vi.fn().mockResolvedValue(undefined),
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

function makeModalInteraction(customId: string, member: unknown, client: unknown, reason = '') {
  return {
    customId,
    user: { id: 'st-1', username: 'storyteller' },
    member,
    client,
    reply: vi.fn().mockResolvedValue(undefined),
    deferReply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
    fields: { getTextInputValue: () => reason },
  };
}

const staffMember = { roles: ['st-role'] };
const playerMember = { roles: ['player-role'] };

beforeEach(() => {
  mockConfig.correspondenceSceneRequestChannelId = 'scene-channel-1';
  mockLiveConfig.correspondenceSceneRequestChannelId = 'scene-channel-1';
});

describe('/scene request', () => {
  it('rejects when the channel is not configured', async () => {
    mockLiveConfig.correspondenceSceneRequestChannelId = '';
    const client = makeClient(null, null);
    const interaction = makeChatInteraction('request', { spc: 'Prince Voss', night: 'Night 14', justification: 'x' }, client);
    const adapter = makeAdapter();
    await execute(interaction as never, { adapter } as never);
    expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining('not configured') }));
  });

  it('queues the request and posts the embed with Claim/Reject buttons', async () => {
    const message = makeMessage();
    const queueChannel = makeQueueChannel(message);
    const client = makeClient(queueChannel, makeCubbyChannel());
    const interaction = makeChatInteraction('request', { spc: 'Prince Voss', night: 'Night 14', justification: 'Needs to answer' }, client);
    const adapter = makeAdapter();

    await execute(interaction as never, { adapter } as never);

    expect(adapter.createSceneRequest).toHaveBeenCalledWith(
      { requesterDiscordId: 'user-1', requesterDiscordName: 'user-user-1' },
      { characterName: 'Alice', spcName: 'Prince Voss', playPeriod: 'Night 14', justification: 'Needs to answer' },
    );
    expect(queueChannel.send).toHaveBeenCalledTimes(1);
    const sendArgs = queueChannel.send.mock.calls[0][0];
    expect(sendArgs.content).toBe('<@&st-role>');
    expect(sendArgs.embeds[0].data.title).toBe('🎭 Scene Request');
    expect(sendArgs.components).toHaveLength(1);
    expect(adapter.setSceneRequestQueueMessage).toHaveBeenCalledWith(7, 'scene-channel-1', 'msg-1');
    expect(interaction.editReply).toHaveBeenCalledWith(expect.stringContaining('Scene request #7 queued'));
  });

  it('surfaces the API error message when creation fails', async () => {
    const client = makeClient(makeQueueChannel(makeMessage()), makeCubbyChannel());
    const interaction = makeChatInteraction('request', { spc: 'Prince Voss', night: 'Night 14', justification: 'x' }, client);
    const adapter = makeAdapter({ createSceneRequest: vi.fn().mockResolvedValue({ ok: false, message: 'boom' }) });

    await execute(interaction as never, { adapter } as never);

    expect(interaction.editReply).toHaveBeenCalledWith(expect.stringContaining('Could not queue the scene request'));
  });
});

describe('/scene autocomplete', () => {
  it('suggests owned characters for "character"', async () => {
    const interaction = makeAutocompleteInteraction('character', '');
    const adapter = makeAdapter();
    await autocomplete(interaction as never, { adapter } as never);
    const responded = interaction.respond.mock.calls[0][0] as Array<{ name: string }>;
    expect(responded.map((c) => c.name)).toEqual(['Alice']);
  });

  it('suggests recent play periods for "night"', async () => {
    const interaction = makeAutocompleteInteraction('night', '');
    const adapter = makeAdapter();
    await autocomplete(interaction as never, { adapter } as never);
    const responded = interaction.respond.mock.calls[0][0] as Array<{ name: string }>;
    expect(responded.map((c) => c.name)).toEqual(['Night 14']);
  });
});

describe('isSceneRequestButton', () => {
  it('matches claim and reject prefixes only', () => {
    expect(isSceneRequestButton('SCENE_CLAIM:7')).toBe(true);
    expect(isSceneRequestButton('SCENE_REJECT:7')).toBe(true);
    expect(isSceneRequestButton('SOMETHING_ELSE:7')).toBe(false);
  });
});

describe('scene request Claim button', () => {
  it('blocks non-staff members with an ephemeral reply', async () => {
    const client = makeClient(makeQueueChannel(makeMessage()), makeCubbyChannel());
    const interaction = makeButtonInteraction('SCENE_CLAIM:7', playerMember, client);
    const adapter = makeAdapter();

    await handleSceneRequestButton(interaction as never, { adapter } as never);

    expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({ content: 'Storytellers only.', ephemeral: true }));
    expect(adapter.claimSceneRequest).not.toHaveBeenCalled();
  });

  it('claims, edits the queue message, and notifies the cubby channel', async () => {
    const message = makeMessage();
    const queueChannel = makeQueueChannel(message);
    const cubbyChannel = makeCubbyChannel();
    const client = makeClient(queueChannel, cubbyChannel);
    const interaction = makeButtonInteraction('SCENE_CLAIM:7', staffMember, client);
    const adapter = makeAdapter();

    await handleSceneRequestButton(interaction as never, { adapter } as never);

    expect(adapter.claimSceneRequest).toHaveBeenCalledWith(7, { requesterDiscordId: 'st-1', requesterDiscordName: 'storyteller' });
    expect(message.edit).toHaveBeenCalledTimes(1);
    const editArgs = message.edit.mock.calls[0][0];
    expect(editArgs.components).toEqual([]);
    expect(cubbyChannel.send).toHaveBeenCalledTimes(1);
    expect(cubbyChannel.send.mock.calls[0][0].content).toContain('claimed by **storyteller**');
    expect(interaction.editReply).toHaveBeenCalledWith(expect.stringContaining('You claimed scene request #7'));
  });

  it('shows the already-claimed state on a 409 without erroring', async () => {
    const message = makeMessage();
    const queueChannel = makeQueueChannel(message);
    const client = makeClient(queueChannel, makeCubbyChannel());
    const interaction = makeButtonInteraction('SCENE_CLAIM:7', staffMember, client);
    const adapter = makeAdapter({
      claimSceneRequest: vi.fn().mockResolvedValue({
        ok: false,
        alreadyResolved: true,
        message: 'Scene request is already claimed — nothing to do',
        request: baseRequest({ status: 'claimed', claimed_by_name: 'otherST' }),
      }),
    });

    await handleSceneRequestButton(interaction as never, { adapter } as never);

    expect(message.edit).toHaveBeenCalledTimes(1);
    expect(interaction.editReply).toHaveBeenCalledWith(expect.stringContaining('already claimed by otherST'));
  });
});

describe('scene request Reject button + modal', () => {
  it('blocks non-staff members from opening the reject modal', async () => {
    const client = makeClient(makeQueueChannel(makeMessage()), makeCubbyChannel());
    const interaction = makeButtonInteraction('SCENE_REJECT:7', playerMember, client);
    const adapter = makeAdapter();

    await handleSceneRequestButton(interaction as never, { adapter } as never);

    expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({ content: 'Storytellers only.', ephemeral: true }));
    expect(interaction.showModal).not.toHaveBeenCalled();
  });

  it('shows the reject modal for staff', async () => {
    const client = makeClient(makeQueueChannel(makeMessage()), makeCubbyChannel());
    const interaction = makeButtonInteraction('SCENE_REJECT:7', staffMember, client);
    const adapter = makeAdapter();

    await handleSceneRequestButton(interaction as never, { adapter } as never);

    expect(interaction.showModal).toHaveBeenCalledTimes(1);
  });

  it('rejects with a reason, edits the queue message, and notifies the cubby channel', async () => {
    const message = makeMessage();
    const queueChannel = makeQueueChannel(message);
    const cubbyChannel = makeCubbyChannel();
    const client = makeClient(queueChannel, cubbyChannel);
    const interaction = makeModalInteraction('SCENE_REJECT_MODAL:7', staffMember, client, 'SPC unavailable');
    const adapter = makeAdapter();

    const handled = await handleSceneRequestRejectModal(interaction as never, { adapter } as never);

    expect(handled).toBe(true);
    expect(adapter.rejectSceneRequest).toHaveBeenCalledWith(
      7,
      { requesterDiscordId: 'st-1', requesterDiscordName: 'storyteller' },
      'SPC unavailable',
    );
    expect(message.edit).toHaveBeenCalledTimes(1);
    expect(cubbyChannel.send.mock.calls[0][0].content).toContain('declined: SPC unavailable');
    expect(interaction.editReply).toHaveBeenCalledWith('Scene request rejected.');
  });

  it('ignores modal submissions with an unrelated customId', async () => {
    const interaction = makeModalInteraction('SOME_OTHER_MODAL:7', staffMember, makeClient(null, null));
    const adapter = makeAdapter();

    const handled = await handleSceneRequestRejectModal(interaction as never, { adapter } as never);

    expect(handled).toBe(false);
    expect(adapter.rejectSceneRequest).not.toHaveBeenCalled();
  });
});
