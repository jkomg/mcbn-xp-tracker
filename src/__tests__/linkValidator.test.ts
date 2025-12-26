import { parseMessageLink } from '../utils/linkValidator';

describe('parseMessageLink', () => {
  it('parses valid Discord message links', () => {
    const parsed = parseMessageLink('https://discord.com/channels/123/456/789');
    expect(parsed).toEqual({ guildId: '123', channelId: '456', messageId: '789' });
  });

  it('returns null for invalid links', () => {
    const parsed = parseMessageLink('https://example.com/not-a-discord-link');
    expect(parsed).toBeNull();
  });
});
