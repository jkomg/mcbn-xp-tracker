import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import type { CommandContext } from '../discord';
import { buildParticipantSelectMenu } from '../combatSetupWizard';
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
    const claimContext = await ctx.adapter.getClaimContext({
      requesterDiscordId: interaction.user.id,
      requesterDiscordName: interaction.user.username,
    });

    const characters = claimContext.activeCharacters;
    if (characters.length < 2) {
      await interaction.editReply('No registered characters found. At least two are needed to start combat.');
      return;
    }

    await interaction.editReply({
      content: 'Select all combatants:',
      components: [buildParticipantSelectMenu(characters)],
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
