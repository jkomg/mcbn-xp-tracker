import { Client, Collection, REST, Routes } from 'discord.js';
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { logEvent } from './logger';

export async function registerCommands(client: Client) {
  const commands: any[] = [];
  const commandsPath = path.join(__dirname, 'commands');

  for (const file of fs.readdirSync(commandsPath)) {
    if (!file.endsWith('.js') && !file.endsWith('.ts')) {
      continue;
    }

    const mod = require(path.join(commandsPath, file));
    if (mod.data) {
      commands.push(mod.data.toJSON());
    }
    if (mod.name && mod.execute) {
      (client as any).commands.set(mod.name, mod);
    }
  }

  const token = process.env.BOT_TOKEN as string | undefined;
  const clientId = process.env.CLIENT_ID as string | undefined;
  const guildId = process.env.TEST_GUILD_ID as string | undefined;

  if (!token || !clientId) {
    logEvent('warn', 'command_registration_skipped_missing_env', {
      hasBotToken: Boolean(token),
      hasClientId: Boolean(clientId),
    });
    return;
  }

  const rest = new REST({ version: '10' }).setToken(token);

  if (guildId) {
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
    logEvent('info', 'command_registration_guild', { count: commands.length, guildId });
    return;
  }

  await rest.put(Routes.applicationCommands(clientId), { body: commands });
  logEvent('info', 'command_registration_global', { count: commands.length });
}

export function initClientCommandCollection(client: Client) {
  (client as any).commands = new Collection();
}
