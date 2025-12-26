import 'dotenv/config';
import { Client, GatewayIntentBits, Collection } from 'discord.js';
import { prisma } from './db';
import { registerCommands } from './registerCommands';
import { scheduleWindowsJob } from './scheduler';

const TOKEN = process.env.BOT_TOKEN;
if (!TOKEN) {
  console.error('Missing BOT_TOKEN in env');
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

// @ts-ignore
client.commands = new Collection();

client.once('ready', async () => {
  console.log(`Logged in as ${client.user?.tag}`);
  // register application commands (local/dev/guild commands)
  await registerCommands(client);

  // start the scheduler (computes windows and reminders)
  scheduleWindowsJob(client, prisma);

  // more init as needed
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  // @ts-ignore
  const cmd = client.commands.get(interaction.commandName);
  if (!cmd) return;
  try {
    await cmd.execute(interaction, { client, prisma });
  } catch (err) {
    console.error('Command execution failed', err);
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: 'There was an error executing that command.', ephemeral: true });
    } else {
      await interaction.reply({ content: 'There was an error executing that command.', ephemeral: true });
    }
  }
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
});

client.login(TOKEN);
