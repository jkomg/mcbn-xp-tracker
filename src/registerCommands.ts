import { Client, REST, Routes, SlashCommandBuilder } from 'discord.js';
import 'dotenv/config';
import fs from 'fs';
import path from 'path';

const CLIENT_ID = process.env.CLIENT_ID; // optional: app client id for global command registration

export async function registerCommands(client: Client) {
  // Minimal: programmatic local/guild command registration for development.
  // In production, use a separate deploy script to register commands to specific guilds.

  // load command definitions from src/commands
  const commands: any[] = [];
  const commandsPath = path.join(__dirname, 'commands');
  for (const file of fs.readdirSync(commandsPath)) {
    if (!file.endsWith('.js') && !file.endsWith('.ts')) continue;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const cmdModule = require(path.join(commandsPath, file));
    if (cmdModule.data) commands.push(cmdModule.data.toJSON());
    if (cmdModule.name && cmdModule.execute) {
      // @ts-ignore
      client.commands.set(cmdModule.name, cmdModule);
    }
  }

  // Optionally register to a test guild if TEST_GUILD_ID is set
  const rest = new REST({ version: '10' }).setToken(process.env.BOT_TOKEN as string);
  const testGuild = process.env.TEST_GUILD_ID;
  try {
    if (testGuild) {
      await rest.put(Routes.applicationGuildCommands(process.env.CLIENT_ID as string, testGuild), { body: commands });
      console.log('Registered commands to test guild');
    } else if (CLIENT_ID) {
      // global registration (may take up to 1 hour)
      await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
      console.log('Registered global commands');
    } else {
      console.log('No CLIENT_ID or TEST_GUILD_ID configured; skipping command registration');
    }
  } catch (err) {
    console.error('Failed to register commands', err);
  }
}
