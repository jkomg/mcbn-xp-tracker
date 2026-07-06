/**
 * /deliver — post a hand-delivered, in-character letter to #kindred-delivery.
 * One-shot: no reply/threading (unlike /contact).
 */
import {
  ActionRowBuilder,
  AutocompleteInteraction,
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
  EmbedBuilder,
  ModalBuilder,
  ModalSubmitInteraction,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type TextChannel,
} from 'discord.js';
import type { CommandContext } from '../discord';
import { config } from '../config';
import { liveConfig } from '../liveConfig';
import { errorToMessage } from '../logger';
import { resolveOwnedCharacter } from '../services/characterOwnership';

const _GOLD = 0xc8a85b;
const MODAL_ID = 'deliver:letter';
const REPLY_BUTTON_PREFIX = 'deliver:reply-btn:';

type PendingDelivery = { senderCharacterName: string; to: string };
const pendingDeliveries = new Map<string, PendingDelivery>();

export const name = 'deliver';

export const data = new SlashCommandBuilder()
  .setName('deliver')
  .setDescription('Hand-deliver an in-character letter to another character.')
  .addStringOption((o) =>
    o
      .setName('to')
      .setDescription('Recipient character')
      .setRequired(true)
      .setAutocomplete(true),
  )
  .addStringOption((o) =>
    o
      .setName('character')
      .setDescription('Your character (only needed if you have multiple)')
      .setRequired(false)
      .setAutocomplete(true),
  );

export async function autocomplete(interaction: AutocompleteInteraction, ctx: CommandContext): Promise<void> {
  const focused = interaction.options.getFocused(true);
  const query = focused.value.toLowerCase();

  try {
    const roster = await ctx.adapter.getActiveRosterWithIds();
    let names = roster.characters.map((c) => c.name);
    if (focused.name === 'character') {
      names = roster.characters.filter((c) => c.discordId === interaction.user.id).map((c) => c.name);
    }
    const choices = names
      .filter((n) => query === '' || n.toLowerCase().includes(query))
      .slice(0, 25)
      .map((n) => ({ name: n, value: n }));
    await interaction.respond(choices);
  } catch {
    await interaction.respond([]);
  }
}

export async function execute(interaction: ChatInputCommandInteraction, ctx: CommandContext): Promise<void> {
  if (!(liveConfig.correspondenceDeliveryChannelId || config.correspondenceDeliveryChannelId)) {
    await interaction.reply({
      content: 'The delivery channel is not configured yet — ask a staff member to set `CORRESPONDENCE_DELIVERY_CHANNEL_ID`.',
      ephemeral: true,
    });
    return;
  }

  const to = interaction.options.getString('to', true).trim();
  const requestedCharacter = interaction.options.getString('character');

  const ownership = await resolveOwnedCharacter(ctx.adapter, interaction.user.id, requestedCharacter);
  if (!ownership.ok) {
    await interaction.reply({ content: ownership.errorMessage, ephemeral: true });
    return;
  }

  const roster = await ctx.adapter.getActiveRosterWithIds();
  const recipientExists = roster.characters.some((c) => c.name.toLowerCase() === to.toLowerCase());
  if (!recipientExists) {
    await interaction.reply({ content: `Unknown character: ${to}`, ephemeral: true });
    return;
  }
  if (to.toLowerCase() === ownership.characterName.toLowerCase()) {
    await interaction.reply({ content: "You can't deliver a letter to yourself.", ephemeral: true });
    return;
  }

  pendingDeliveries.set(interaction.user.id, { senderCharacterName: ownership.characterName, to });
  await interaction.showModal(buildDeliveryModal());
}

function buildDeliveryModal(): ModalBuilder {
  const modal = new ModalBuilder().setCustomId(MODAL_ID).setTitle('Deliver a Letter');
  const letterInput = new TextInputBuilder()
    .setCustomId('letter_text')
    .setLabel('Letter')
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder('Write the letter here...')
    .setMaxLength(3900)
    .setRequired(true);
  modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(letterInput));
  return modal;
}

/** Handles the ✉️ Reply button attached to posted letters — replies to the original sender directly. */
export async function handleDeliveryReplyButton(interaction: ButtonInteraction, ctx: CommandContext): Promise<boolean> {
  if (!interaction.customId.startsWith(REPLY_BUTTON_PREFIX)) return false;

  const to = decodeURIComponent(interaction.customId.slice(REPLY_BUTTON_PREFIX.length));

  const ownership = await resolveOwnedCharacter(ctx.adapter, interaction.user.id);
  if (!ownership.ok) {
    await interaction.reply({
      content: `${ownership.errorMessage} Or use \`/deliver\` and pass the \`character\` option directly.`,
      ephemeral: true,
    });
    return true;
  }

  if (to.toLowerCase() === ownership.characterName.toLowerCase()) {
    await interaction.reply({ content: "You can't deliver a letter to yourself.", ephemeral: true });
    return true;
  }

  pendingDeliveries.set(interaction.user.id, { senderCharacterName: ownership.characterName, to });
  await interaction.showModal(buildDeliveryModal());
  return true;
}

export async function handleDeliveryModal(interaction: ModalSubmitInteraction, ctx: CommandContext): Promise<boolean> {
  if (interaction.customId !== MODAL_ID) return false;

  await interaction.deferReply({ ephemeral: true });

  const pending = pendingDeliveries.get(interaction.user.id);
  pendingDeliveries.delete(interaction.user.id);
  if (!pending) {
    await interaction.editReply('Session expired — run `/deliver` again.');
    return true;
  }

  const letterText = interaction.fields.getTextInputValue('letter_text').trim();

  let channel: TextChannel;
  try {
    const fetched = await interaction.client.channels.fetch((liveConfig.correspondenceDeliveryChannelId || config.correspondenceDeliveryChannelId));
    if (!fetched || !fetched.isTextBased() || !('send' in fetched)) {
      await interaction.editReply('Could not find the delivery channel. Ask staff to check the configured channel ID.');
      return true;
    }
    channel = fetched as TextChannel;
  } catch (err) {
    await interaction.editReply(`Could not reach the delivery channel: ${errorToMessage(err)}`);
    return true;
  }

  const embed = new EmbedBuilder()
    .setTitle('✉️ A Letter Arrives')
    .setColor(_GOLD)
    .setDescription(`**To:** ${pending.to}\n**From:** ${pending.senderCharacterName}\n\n${letterText}`)
    .setFooter({ text: '🕯️ Hand-delivered, sealed in wax — in character.' })
    .setTimestamp();

  const replyButton = new ButtonBuilder()
    .setCustomId(`${REPLY_BUTTON_PREFIX}${encodeURIComponent(pending.senderCharacterName)}`)
    .setLabel('Reply')
    .setEmoji('✉️')
    .setStyle(ButtonStyle.Secondary);
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(replyButton);

  let recipientMention = '';
  try {
    const roster = await ctx.adapter.getActiveRosterWithIds();
    const recipientName = pending.to.toLowerCase();
    const recipientCharacter = roster.characters.find((c) => c.name.toLowerCase() === recipientName);
    if (recipientCharacter?.discordId) {
      recipientMention = `<@${recipientCharacter.discordId}>`;
    }
  } catch {
    recipientMention = '';
  }

  try {
    await channel.send({ content: recipientMention || undefined, embeds: [embed], components: [row] });
  } catch (err) {
    await interaction.editReply(`Could not post the letter: ${errorToMessage(err)}`);
    return true;
  }

  await interaction.editReply(`Letter delivered to **${pending.to}**.`);
  return true;
}
