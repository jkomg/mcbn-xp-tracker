import type {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  Client,
  Collection,
} from 'discord.js';
import type { TrackerAdapter } from './services/adapter';

export type CommandContext = {
  client: BotClient;
  adapter: TrackerAdapter;
};

export type BotCommand = {
  name: string;
  data: { toJSON: () => unknown };
  execute: (interaction: ChatInputCommandInteraction, ctx: CommandContext) => Promise<void>;
  autocomplete?: (interaction: AutocompleteInteraction, ctx: CommandContext) => Promise<void>;
};

export type BotClient = Client & {
  commands: Collection<string, BotCommand>;
};
