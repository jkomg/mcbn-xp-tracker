import { describe, expect, it } from 'vitest';
import { parseMessageLink } from '../utils/linkValidator';

describe('parseMessageLink', () => {
  it('parses a valid discord message link', () => {
    expect(parseMessageLink('https://discord.com/channels/123/456/789')).toEqual({
      guildId: '123',
      channelId: '456',
      messageId: '789',
    });
  });

  it('returns null for invalid links', () => {
    expect(parseMessageLink('https://example.com/x')).toBeNull();
  });

  it('supports canary and ptb Discord hosts', () => {
    expect(parseMessageLink('https://canary.discord.com/channels/123/456/789')).toEqual({
      guildId: '123',
      channelId: '456',
      messageId: '789',
    });
    expect(parseMessageLink('https://ptb.discordapp.com/channels/123/456/789')).toEqual({
      guildId: '123',
      channelId: '456',
      messageId: '789',
    });
  });

  it('rejects incomplete channel URLs', () => {
    expect(parseMessageLink('https://discord.com/channels/123/456')).toBeNull();
  });
});
