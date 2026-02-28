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
});
