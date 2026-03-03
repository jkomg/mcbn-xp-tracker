import type { Client } from 'discord.js';

const MESSAGE_LINK_RE = /^https?:\/\/(?:ptb\.|canary\.)?discord(?:app)?\.com\/channels\/(\d+)\/(\d+)\/(\d+)$/i;

type Expected = {
  expectedGuildId?: string;
  expectedChannelId?: string;
  expectedAuthorId?: string;
};

export function parseMessageLink(link: string) {
  const match = link.trim().match(MESSAGE_LINK_RE);
  if (!match) {
    return null;
  }

  const [, guildId, channelId, messageId] = match;
  return { guildId, channelId, messageId };
}

export async function fetchDiscordMessageFromLink(client: Client, link: string, expected: Expected) {
  const parsed = parseMessageLink(link);
  if (!parsed) {
    throw new Error('Invalid Discord message link format.');
  }

  const { guildId, channelId, messageId } = parsed;
  if (expected.expectedGuildId && expected.expectedGuildId !== guildId) {
    throw new Error('Message is not from this server.');
  }
  if (expected.expectedChannelId && expected.expectedChannelId !== channelId) {
    throw new Error('Message is not from the expected channel.');
  }

  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel || !('messages' in channel)) {
    throw new Error('Unable to access the referenced channel.');
  }

  const message = await channel.messages.fetch(messageId).catch(() => null);
  if (!message) {
    throw new Error('Unable to fetch the referenced message.');
  }

  if (expected.expectedAuthorId && message.author.id !== expected.expectedAuthorId) {
    throw new Error('Message author does not match the character owner.');
  }

  return message;
}
