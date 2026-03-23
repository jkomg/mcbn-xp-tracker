import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import type { CommandContext } from '../discord';
import { buildCombatUI, initCombatSession } from '../combatSetupWizard';
import { errorToMessage, logEvent } from '../logger';

export const name = 'combat';

export const data = new SlashCommandBuilder()
  .setName('combat')
  .setDescription('Combat tracker commands')
  .addSubcommand((s) => s.setName('start').setDescription('Open the combat setup form'));

export async function execute(interaction: ChatInputCommandInteraction, ctx: CommandContext): Promise<void> {
  const sub = interaction.options.getSubcommand();
  if (sub !== 'start') return;

  await interaction.deferReply({ ephemeral: true });

  try {
    const roster = await ctx.adapter.getActiveRoster();
    const characters = roster.characters;

    if (characters.length < 2) {
      await interaction.editReply('No registered characters found. At least two are needed to start combat.');
      return;
    }

    const session = initCombatSession(interaction.user.id, characters);
    const ui = buildCombatUI(session);

    await interaction.editReply({
      content: ui.content,
      components: ui.components,
    });

    logEvent('info', 'combat_participant_select_shown', { userId: interaction.user.id });
  } catch (error) {
    logEvent('error', 'combat_start_failed', {
      userId: interaction.user.id,
      error: errorToMessage(error),
    });
    await interaction.editReply('Failed to load character list. Please try again.');
  }
}
