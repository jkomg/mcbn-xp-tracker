import { Collection, REST, Routes } from 'discord.js';
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import type { BotClient, BotCommand } from './discord';
import { logEvent } from './logger';
import { config } from './config';

function asBotCommand(candidate: unknown): BotCommand | null {
  if (!candidate || typeof candidate !== 'object') {
    return null;
  }
  const record = candidate as Partial<BotCommand>;
  if (!record.name || !record.data || !record.execute) {
    return null;
  }
  return record as BotCommand;
}

export async function registerCommands(client: BotClient) {
  const commands: unknown[] = [];
  const commandsPath = path.join(__dirname, 'commands');

  for (const file of fs.readdirSync(commandsPath)) {
    if (!file.endsWith('.js') && !file.endsWith('.ts')) {
      continue;
    }

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require(path.join(commandsPath, file));
    const command = asBotCommand(mod);
    if (!command) {
      continue;
    }

    commands.push(command.data.toJSON());
    client.commands.set(command.name, command);
  }

  const token = config.botToken;
  const clientId = config.clientId;
  const guildId = config.testGuildId;

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

export function initClientCommandCollection(client: BotClient) {
  client.commands = new Collection<string, BotCommand>();
}
