/**
 * One-off script to manually fire a passage-of-time message to the production channel.
 * Usage: npx tsx scripts/send-passage-now.ts <sunrise|sunset|downtime>
 */
import 'dotenv/config';
import path from 'node:path';
import { AttachmentBuilder, Client, GatewayIntentBits } from 'discord.js';
import { config } from '../src/config';
import {
  PASSAGE_DOWNTIME_MESSAGE,
  PASSAGE_SUNRISE_MESSAGE,
  PASSAGE_SUNSET_MESSAGE,
} from '../src/services/passageOfTimeService';

const EVENT = (process.argv[2] ?? '') as 'sunrise' | 'sunset' | 'downtime';
const EXTRA = process.argv[3] ?? '';

if (!['sunrise', 'sunset', 'downtime'].includes(EVENT)) {
  console.error('Usage: npx tsx scripts/send-passage-now.ts <sunrise|sunset|downtime> [extra text]');
  process.exit(1);
}

const BODIES: Record<typeof EVENT, string> = {
  sunrise: PASSAGE_SUNRISE_MESSAGE,
  sunset: PASSAGE_SUNSET_MESSAGE,
  downtime: PASSAGE_DOWNTIME_MESSAGE,
};

const IMAGE_FILES: Partial<Record<typeof EVENT, string>> = {
  sunrise: path.resolve(__dirname, '..', 'assets', 'sunrise-rising-sun.gif'),
  sunset: path.resolve(__dirname, '..', 'assets', 'Nashville_at_Night.gif'),
};

const channelId = config.passageOfTimeChannelId;
if (!channelId) {
  console.error('PASSAGE_OF_TIME_CHANNEL_ID is not set.');
  process.exit(1);
}

const mentionIds = [
  config.passageOfTimeKindredRoleId,
  config.passageOfTimeGhoulRoleId,
  config.passageOfTimeMortalRoleId,
].filter((id): id is string => !!id && /^\d{17,20}$/.test(id));

const mentions = mentionIds.map((id) => `<@&${id}>`).join(' ');
const body = EXTRA ? `${BODIES[EVENT]}\n\n${EXTRA}` : BODIES[EVENT];
const content = mentions ? `${mentions}\n\n${body}` : body;

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('ready', async () => {
  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel?.isTextBased()) {
      console.error('Channel not found or not text-based.');
      process.exit(1);
    }

    const imageFile = IMAGE_FILES[EVENT];
    if (imageFile) {
      const filename = path.basename(imageFile);
      const attachment = new AttachmentBuilder(imageFile, { name: filename });
      await channel.send({
        content,
        files: [attachment],
        embeds: [{ image: { url: `attachment://${filename}` } }],
      });
    } else {
      await channel.send({ content });
    }

    console.log(`✓ Sent ${EVENT} message to channel ${channelId}.`);
  } catch (err) {
    console.error('Failed to send:', err);
    process.exit(1);
  } finally {
    await client.destroy();
  }
});

client.login(config.botToken);
