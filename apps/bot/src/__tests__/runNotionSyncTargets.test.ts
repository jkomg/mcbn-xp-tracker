import { beforeEach, describe, expect, it, vi } from 'vitest';

const restSetToken = vi.fn();
const restGet = vi.fn(async () => []);
const notionCtor = vi.fn();
const webWikiCtor = vi.fn();

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
  buildHuntingSiteCreatePayload: vi.fn(() => ({})),
  buildLocationCreatePayload: vi.fn(() => ({})),
  buildPcTrackerCreatePayload: vi.fn(() => ({})),
  buildSessionLogCreatePayload: vi.fn(() => ({})),
  buildSpcCreatePayload: vi.fn(() => ({})),
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

    async upsertPage() {}
    async deletePage() {}
    async setCharacterStatus() {}
  }

  return { WebWikiClient: MockWebWikiClient };
});

import { runNotionSync } from '../scripts/discord-notion-sync';

describe('runNotionSync target orchestration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

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

  it('supports notion-only runs and disables wiki write token', async () => {
    const result = await runNotionSync({
      botToken: 'bot-token',
      guildId: 'guild-1',
      notionToken: 'notion-token',
      webWriteToken: 'wiki-write-token',
      syncToNotion: true,
      syncToWiki: false,
      dryRun: true,
    });

    expect(result.success).toBe(true);
    expect(notionCtor).toHaveBeenCalledTimes(1);
    expect(webWikiCtor).toHaveBeenCalledWith(expect.objectContaining({ writeToken: '' }));
  });

  it('supports wiki-only runs without constructing Notion client', async () => {
    const result = await runNotionSync({
      botToken: 'bot-token',
      guildId: 'guild-1',
      webWriteToken: 'wiki-write-token',
      syncToNotion: false,
      syncToWiki: true,
      dryRun: true,
    });

    expect(result.success).toBe(true);
    expect(notionCtor).not.toHaveBeenCalled();
    expect(webWikiCtor).toHaveBeenCalledWith(
      expect.objectContaining({ writeToken: 'wiki-write-token' }),
    );
  });
});
