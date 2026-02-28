import { SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('ping')
  .setDescription('Health check for the bot runtime');

export const name = 'ping';

export async function execute(interaction: any) {
  await interaction.reply({ content: 'Pong.', ephemeral: true });
}
