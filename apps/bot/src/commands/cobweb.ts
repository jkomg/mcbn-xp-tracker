/**
 * /cobweb — Malkavian Cobweb discipline telepathic message to
 * #reach-out-and-touch-mind. Trust-based: no mechanical discipline check
 * (the bot has no discipline data — only clan is exposed to it today).
 * Broadcast, not 1:1 — no target option.
 */
import {
  ActionRowBuilder,
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  EmbedBuilder,
  ModalBuilder,
  ModalSubmitInteraction,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle,
  type TextChannel,
} from 'discord.js';
import type { CommandContext } from '../discord';
import { config } from '../config';
import { errorToMessage } from '../logger';
import { resolveOwnedCharacter } from '../services/characterOwnership';

const _COBWEB_PURPLE = 0x4b0082;
const MODAL_ID = 'cobweb:whisper';

const pendingWhispers = new Map<string, string>();

export const name = 'cobweb';

export const data = new SlashCommandBuilder()
  .setName('cobweb')
  .setDescription('Send a telepathic Cobweb message to #reach-out-and-touch-mind.')
  .addStringOption((o) =>
    o
      .setName('character')
      .setDescription('Your character (only needed if you have multiple)')
      .setRequired(false)
      .setAutocomplete(true),
  );

export async function autocomplete(interaction: AutocompleteInteraction, ctx: CommandContext): Promise<void> {
  const focused = interaction.options.getFocused(true);
  if (focused.name !== 'character') {
    await interaction.respond([]);
    return;
  }
  const query = focused.value.toLowerCase();
  try {
    const roster = await ctx.adapter.getActiveRosterWithIds();
    const choices = roster.characters
      .filter((c) => c.discordId === interaction.user.id)
      .map((c) => c.name)
      .filter((n) => query === '' || n.toLowerCase().includes(query))
      .slice(0, 25)
      .map((n) => ({ name: n, value: n }));
    await interaction.respond(choices);
  } catch {
    await interaction.respond([]);
  }
}

export async function execute(interaction: ChatInputCommandInteraction, ctx: CommandContext): Promise<void> {
  if (!config.correspondenceCobwebChannelId) {
    await interaction.reply({
      content: 'The Cobweb channel is not configured yet — ask a staff member to set `CORRESPONDENCE_COBWEB_CHANNEL_ID`.',
      ephemeral: true,
    });
    return;
  }

  const requestedCharacter = interaction.options.getString('character');
  const ownership = await resolveOwnedCharacter(ctx.adapter, interaction.user.id, requestedCharacter);
  if (!ownership.ok) {
    await interaction.reply({ content: ownership.errorMessage, ephemeral: true });
    return;
  }

  pendingWhispers.set(interaction.user.id, ownership.characterName);

  const modal = new ModalBuilder().setCustomId(MODAL_ID).setTitle('Reach Out and Touch Mind');
  const messageInput = new TextInputBuilder()
    .setCustomId('message')
    .setLabel('Telepathic message')
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder('What do they hear?')
    .setMaxLength(1500)
    .setRequired(true);
  modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(messageInput));
  await interaction.showModal(modal);
}

export async function handleCobwebModal(interaction: ModalSubmitInteraction): Promise<boolean> {
  if (interaction.customId !== MODAL_ID) return false;

  await interaction.deferReply({ ephemeral: true });

  const senderCharacterName = pendingWhispers.get(interaction.user.id);
  pendingWhispers.delete(interaction.user.id);
  if (!senderCharacterName) {
    await interaction.editReply('Session expired — run `/cobweb` again.');
    return true;
  }

  const message = interaction.fields.getTextInputValue('message').trim();

  let channel: TextChannel;
  try {
    const fetched = await interaction.client.channels.fetch(config.correspondenceCobwebChannelId);
    if (!fetched || !fetched.isTextBased() || !('send' in fetched)) {
      await interaction.editReply('Could not find the Cobweb channel. Ask staff to check the configured channel ID.');
      return true;
    }
    channel = fetched as TextChannel;
  } catch (err) {
    await interaction.editReply(`Could not reach the Cobweb channel: ${errorToMessage(err)}`);
    return true;
  }

  const embed = new EmbedBuilder()
    .setTitle('🕸️ A Whisper in the Web')
    .setColor(_COBWEB_PURPLE)
    .addFields({ name: 'From', value: senderCharacterName, inline: true })
    .setDescription(message)
    .setFooter({ text: 'Received only by those attuned — trust-based, no mechanical verification.' });

  try {
    await channel.send({ embeds: [embed] });
  } catch (err) {
    await interaction.editReply(`Could not send: ${errorToMessage(err)}`);
    return true;
  }

  await interaction.editReply('Sent.');
  return true;
}
