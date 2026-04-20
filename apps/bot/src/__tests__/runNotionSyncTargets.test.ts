import { beforeEach, describe, expect, it, vi } from 'vitest';

const restSetToken = vi.fn();
const restGet = vi.fn(async () => []);
const notionCtor = vi.fn();
const notionPagesCreate = vi.fn(async () => ({ id: 'page-1' }));
const notionDbUpdate = vi.fn(async () => ({}));
const webWikiCtor = vi.fn();
const webWikiUpsertPage = vi.fn(async () => {});
const webWikiDeletePage = vi.fn(async () => {});
const webWikiSetCharacterStatus = vi.fn(async () => {});
const payloadBuilderSpies = vi.hoisted(() => ({
  buildHuntingSiteCreatePayload: vi.fn((args: Record<string, unknown>) => ({ __kind: 'hunting', ...args })),
  buildLocationCreatePayload: vi.fn((args: Record<string, unknown>) => ({ __kind: 'location', ...args })),
  buildPcTrackerCreatePayload: vi.fn((args: Record<string, unknown>) => ({ __kind: 'pc', ...args })),
  buildSessionLogCreatePayload: vi.fn((args: Record<string, unknown>) => ({ __kind: 'session', ...args })),
  buildSpcCreatePayload: vi.fn((args: Record<string, unknown>) => ({ __kind: 'spc', ...args })),
}));

vi.mock('discord.js', () => {
  class MockREST {
    setToken(token: string) {
      restSetToken(token);
      return this;
    }

    async get(_route: string) {
      return restGet();
    }
  }

  return {
    REST: MockREST,
    Routes: {
      guildChannels: (guildId: string) => `/guilds/${guildId}/channels`,
    },
  };
});

vi.mock('@notionhq/client', () => {
  class MockNotionClient {
    pages = { create: notionPagesCreate };
    databases = { update: notionDbUpdate };

    constructor(opts: unknown) {
      notionCtor(opts);
    }
  }

  return { Client: MockNotionClient };
});

vi.mock('../scripts/notionSync/discordIngest', () => ({
  fetchAllMessages: vi.fn(async () => []),
  fetchForumThreads: vi.fn(async () => []),
  fetchGuildMember: vi.fn(async () => null),
  fetchPins: vi.fn(async () => []),
}));

vi.mock('../scripts/notionSync/notionWrites', () => ({
  appendBodyBlocks: vi.fn(async () => {}),
  cleanupPreImportEntries: vi.fn(async () => {}),
  notionCall: async <T>(fn: () => Promise<T>) => fn(),
  SOURCE_TAG: 'discord',
}));

vi.mock('../scripts/notionSync/notionPayloadBuilders', () => ({
  buildHuntingSiteCreatePayload: payloadBuilderSpies.buildHuntingSiteCreatePayload,
  buildLocationCreatePayload: payloadBuilderSpies.buildLocationCreatePayload,
  buildPcTrackerCreatePayload: payloadBuilderSpies.buildPcTrackerCreatePayload,
  buildSessionLogCreatePayload: payloadBuilderSpies.buildSessionLogCreatePayload,
  buildSpcCreatePayload: payloadBuilderSpies.buildSpcCreatePayload,
}));

vi.mock('../scripts/notionSync/wikiSyncHelpers', () => ({
  CHAR_TO_COTERIE: new Map<string, string>(),
  COTERIE_MEMBERS: {},
  FACTIONS: [],
  inferSpcType: vi.fn(() => 'other'),
  mapDomain: vi.fn(() => null),
  messagesToMarkdown: vi.fn(() => ''),
  wikiSlug: vi.fn((category: string, value: string) => `${category}-${value}`),
}));

vi.mock('../scripts/notionSync/webWikiClient', () => {
  class MockWebWikiClient {
    constructor(opts: unknown) {
      webWikiCtor(opts);
    }

    async upsertPage(payload: unknown) {
      await webWikiUpsertPage(payload);
    }

    async deletePage(slug: string) {
      await webWikiDeletePage(slug);
    }

    async setCharacterStatus(name: string, status: string) {
      await webWikiSetCharacterStatus(name, status);
    }
  }

  return { WebWikiClient: MockWebWikiClient };
});

import { runNotionSync } from '../scripts/discord-notion-sync';
import {
  fetchAllMessages,
  fetchForumThreads,
  fetchPins,
  type DiscordChannel,
  type DiscordMessage,
  type DiscordThread,
} from '../scripts/notionSync/discordIngest';

describe('runNotionSync target orchestration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function seedChannels(): void {
    const channels: DiscordChannel[] = [
      { id: 'cat-city', type: 4, name: 'City of Nashville' } as DiscordChannel,
      { id: 'chan-locations', type: 0, name: 'broadway', parent_id: 'cat-city' } as DiscordChannel,
      { id: 'chan-spc', type: 0, name: 'spc-profiles' } as DiscordChannel,
      { id: 'chan-lore', type: 0, name: 'music-city-histories' } as DiscordChannel,
      { id: 'forum-children', type: 15, name: 'children-of-the-night' } as DiscordChannel,
      { id: 'forum-retired', type: 15, name: 'retired' } as DiscordChannel,
    ];
    restGet.mockResolvedValue(channels);

    const defaultAuthor = {
      username: 'user-1',
      global_name: 'User One',
    };
    const defaultMessage = (content: string): DiscordMessage => ({
      id: `msg-${Math.random()}`,
      content,
      timestamp: '2026-01-01T00:00:00.000Z',
      author: defaultAuthor as DiscordMessage['author'],
      attachments: [],
    } as DiscordMessage);

    const thread = (id: string, name: string): DiscordThread => ({
      id,
      name,
      thread_metadata: {
        archive_timestamp: '2026-01-01T00:00:00.000Z',
      } as DiscordThread['thread_metadata'],
    } as DiscordThread);

    vi.mocked(fetchPins).mockResolvedValue([
      defaultMessage('### Site One\nPinned hunting details'),
    ]);
    vi.mocked(fetchForumThreads).mockImplementation(async (_rest, _guildId, channelId) => {
      if (channelId === 'forum-children') return [thread('thread-children-1', 'Aludra')];
      if (channelId === 'forum-retired') return [thread('thread-retired-1', 'Retired One')];
      return [];
    });
    vi.mocked(fetchAllMessages).mockImplementation(async (_rest, channelId) => {
      if (channelId === 'chan-spc') return [defaultMessage('SPC Name\nSPC profile body')];
      if (channelId === 'chan-lore') return [defaultMessage('Lore archive text')];
      if (channelId === 'thread-children-1') return [defaultMessage('Aludra profile body')];
      if (channelId === 'thread-retired-1') return [defaultMessage('Retired profile body')];
      return [];
    });
  }

  it('fails fast when no sync targets are enabled', async () => {
    const result = await runNotionSync({
      botToken: 'bot-token',
      guildId: 'guild-1',
      dryRun: true,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('No sync targets enabled');
    expect(restSetToken).not.toHaveBeenCalled();
  });

  it('supports notion-only runs and skips wiki writes', async () => {
    seedChannels();
    const result = await runNotionSync({
      botToken: 'bot-token',
      guildId: 'guild-1',
      notionToken: 'notion-token',
      webWriteToken: 'wiki-write-token',
      syncToNotion: true,
      syncToWiki: false,
      dryRun: false,
    });

    expect(result.success).toBe(true);
    expect(notionCtor).toHaveBeenCalledTimes(1);
    expect(notionPagesCreate).toHaveBeenCalled();
    expect(webWikiUpsertPage).not.toHaveBeenCalled();
    expect(webWikiDeletePage).not.toHaveBeenCalled();
    expect(webWikiSetCharacterStatus).not.toHaveBeenCalled();
    expect(webWikiCtor).toHaveBeenCalledWith(expect.objectContaining({ writeToken: '' }));
  });

  it('supports wiki-only runs without constructing Notion client', async () => {
    seedChannels();
    const result = await runNotionSync({
      botToken: 'bot-token',
      guildId: 'guild-1',
      webWriteToken: 'wiki-write-token',
      syncToNotion: false,
      syncToWiki: true,
      dryRun: false,
    });

    expect(result.success).toBe(true);
    expect(notionCtor).not.toHaveBeenCalled();
    expect(notionPagesCreate).not.toHaveBeenCalled();
    expect(webWikiUpsertPage).toHaveBeenCalled();
    expect(webWikiCtor).toHaveBeenCalledWith(
      expect.objectContaining({ writeToken: 'wiki-write-token' }),
    );
  });

  it('runs both targets together and performs both notion and wiki write paths', async () => {
    seedChannels();
    const result = await runNotionSync({
      botToken: 'bot-token',
      guildId: 'guild-1',
      notionToken: 'notion-token',
      webWriteToken: 'wiki-write-token',
      syncToNotion: true,
      syncToWiki: true,
      dryRun: false,
    });

    expect(result.success).toBe(true);
    expect(notionCtor).toHaveBeenCalledTimes(1);
    expect(notionDbUpdate).toHaveBeenCalledTimes(5);
    expect(notionPagesCreate).toHaveBeenCalled();
    expect(payloadBuilderSpies.buildLocationCreatePayload).toHaveBeenCalledWith(
      expect.objectContaining({ locationName: 'Broadway' }),
    );
    expect(payloadBuilderSpies.buildHuntingSiteCreatePayload).toHaveBeenCalledWith(
      expect.objectContaining({ siteName: 'Site One' }),
    );
    expect(payloadBuilderSpies.buildSpcCreatePayload).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'SPC Name' }),
    );
    expect(payloadBuilderSpies.buildSessionLogCreatePayload).toHaveBeenCalledWith(
      expect.objectContaining({ title: '#music-city-histories archive' }),
    );
    expect(payloadBuilderSpies.buildSessionLogCreatePayload).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Retired One' }),
    );

    const notionPayloads = notionPagesCreate.mock.calls.map(([payload]) => payload as Record<string, unknown>);
    expect(notionPayloads).toEqual(expect.arrayContaining([
      expect.objectContaining({ __kind: 'location', locationName: 'Broadway' }),
      expect.objectContaining({ __kind: 'hunting', siteName: 'Site One' }),
      expect.objectContaining({ __kind: 'spc', name: 'SPC Name' }),
      expect.objectContaining({ __kind: 'session', title: '#music-city-histories archive' }),
    ]));

    expect(webWikiUpsertPage).toHaveBeenCalled();
    expect(webWikiDeletePage).toHaveBeenCalled();
    expect(webWikiSetCharacterStatus).toHaveBeenCalledWith('Retired One', 'retired');

    const wikiUpserts = webWikiUpsertPage.mock.calls.map(([payload]) => payload as Record<string, unknown>);
    expect(wikiUpserts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        slug: 'locations-Broadway',
        category: 'locations',
        title: 'Broadway',
      }),
      expect.objectContaining({
        slug: 'characters-SPC Name',
        category: 'characters',
        title: 'SPC Name',
        body_markdown: 'SPC Name\nSPC profile body',
      }),
      expect.objectContaining({
        slug: 'lore-music-city-histories archive',
        category: 'lore',
        title: '#music-city-histories archive',
      }),
    ]));

    const broadwayUpsert = wikiUpserts.find((p) => p.slug === 'locations-Broadway');
    expect(String(broadwayUpsert?.body_markdown ?? '')).toContain('## Hunting Sites');
    expect(String(broadwayUpsert?.body_markdown ?? '')).toContain('Site One');
  });
});
