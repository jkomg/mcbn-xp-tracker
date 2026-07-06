/**
 * setupTestChannels.ts — one-time helper for standing up a dev/test Discord
 * environment for the Correspondence commands (/deliver, /contact,
 * /prestation, /post, /cobweb, /rumor).
 *
 * Creates a "Correspondence (Test)" category plus the six channels those
 * commands post to, in whatever guild you point it at (reusing any that
 * already exist by name), then prints the CORRESPONDENCE_*_CHANNEL_ID lines
 * ready to paste into apps/bot/.env.dev.
 *
 * Usage (from apps/bot/):
 *   npm run ops:setup-test-channels                    # uses .env.dev + TEST_GUILD_ID
 *   npm run ops:setup-test-channels -- --guild <id>     # override the target guild
 *   npm run ops:setup-test-channels -- --env-file <path>
 *
 * Requires BOT_TOKEN with "Manage Channels" in the target guild.
 */

import path from 'node:path';
import * as dotenv from 'dotenv';
import { ChannelType, Client, GatewayIntentBits } from 'discord.js';

const TARGET_CHANNELS: Array<{ channelName: string; envVar: string }> = [
  { channelName: 'kindred-delivery', envVar: 'CORRESPONDENCE_DELIVERY_CHANNEL_ID' },
  { channelName: 'kindred-contact', envVar: 'CORRESPONDENCE_CONTACT_CHANNEL_ID' },
  { channelName: 'prestation', envVar: 'CORRESPONDENCE_PRESTATION_CHANNEL_ID' },
  { channelName: 'social-media', envVar: 'CORRESPONDENCE_SOCIAL_CHANNEL_ID' },
  { channelName: 'reach-out-and-touch-mind', envVar: 'CORRESPONDENCE_COBWEB_CHANNEL_ID' },
  { channelName: 'rumors', envVar: 'CORRESPONDENCE_RUMOR_CHANNEL_ID' },
];

const CATEGORY_NAME = 'Correspondence (Test)';

function parseArgs(argv: string[]) {
  const args = { guildId: '', envFile: '.env.dev' };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--guild') args.guildId = argv[++i] ?? '';
    else if (argv[i] === '--env-file') args.envFile = argv[++i] ?? '.env.dev';
  }
  return args;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  dotenv.config({ path: path.resolve(__dirname, '..', '..', args.envFile) });

  const token = process.env.BOT_TOKEN;
  const guildId = args.guildId || process.env.TEST_GUILD_ID;

  if (!token || !guildId) {
    console.error(`BOT_TOKEN and TEST_GUILD_ID are required (loaded from ${args.envFile}, or pass --guild <id>).`);
    process.exitCode = 1;
    return;
  }

  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  await client.login(token);
  try {
    const guild = await client.guilds.fetch(guildId);
    const channels = await guild.channels.fetch();
    console.log(`Guild: ${guild.name} (${guild.id})\n`);

    let category = [...channels.values()].find(
      (c) => c?.type === ChannelType.GuildCategory && c.name === CATEGORY_NAME,
    );
    if (!category) {
      category = await guild.channels.create({ name: CATEGORY_NAME, type: ChannelType.GuildCategory });
      console.log(`Created category "${CATEGORY_NAME}".`);
    } else {
      console.log(`Reusing existing category "${CATEGORY_NAME}".`);
    }

    console.log('\nPaste these into apps/bot/.env.dev:\n');
    for (const target of TARGET_CHANNELS) {
      let channel = [...channels.values()].find(
        (c) => c?.type === ChannelType.GuildText && c.name === target.channelName && c.parentId === category!.id,
      );
      if (!channel) {
        channel = await guild.channels.create({
          name: target.channelName,
          type: ChannelType.GuildText,
          parent: category.id,
        });
      }
      console.log(`${target.envVar}=${channel.id}`);
    }
  } finally {
    await client.destroy();
  }
}

void main();
