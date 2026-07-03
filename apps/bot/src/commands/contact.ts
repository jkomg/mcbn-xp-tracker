/**
 * /contact — text messages between characters, posted to #kindred-contact.
 * Thread-tracked (unlike /deliver): `send` starts a conversation with one or
 * more recipients, `reply` continues an existing one and notifies every
 * other participant.
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
import type { ContactParticipant } from '../services/adapter';

const _BLUE = 0x4a90d9;
const SEND_MODAL_ID = 'contact:send';
const REPLY_MODAL_ID = 'contact:reply';

type PendingSend = { senderCharacterName: string; recipientNames: string[] };
type PendingReply = { senderCharacterName: string; threadId: number };
const pendingSends = new Map<string, PendingSend>();
const pendingReplies = new Map<string, PendingReply>();

export const name = 'contact';

export const data = new SlashCommandBuilder()
  .setName('contact')
  .setDescription('Text message another character (or several) through #kindred-contact.')
  .addSubcommand((s) =>
    s
      .setName('send')
      .setDescription('Start a new conversation.')
      .addStringOption((o) =>
        o.setName('to').setDescription('Recipient character').setRequired(true).setAutocomplete(true),
      )
      .addStringOption((o) =>
        o
          .setName('also_to')
          .setDescription('Additional recipients for a group text, comma-separated')
          .setRequired(false),
      )
      .addStringOption((o) =>
        o
          .setName('character')
          .setDescription('Your character (only needed if you have multiple)')
          .setRequired(false)
          .setAutocomplete(true),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('reply')
      .setDescription('Reply to an existing conversation.')
      .addStringOption((o) =>
        o.setName('thread').setDescription('Which conversation').setRequired(true).setAutocomplete(true),
      )
      .addStringOption((o) =>
        o
          .setName('character')
          .setDescription('Your character (fill this first if you have multiple, to filter the list)')
          .setRequired(false)
          .setAutocomplete(true),
      ),
  );

export async function autocomplete(interaction: AutocompleteInteraction, ctx: CommandContext): Promise<void> {
  const focused = interaction.options.getFocused(true);
  const query = focused.value.toLowerCase();

  if (focused.name === 'to') {
    try {
      const roster = await ctx.adapter.getActiveRosterWithIds();
      const choices = roster.characters
        .map((c) => c.name)
        .filter((n) => query === '' || n.toLowerCase().includes(query))
        .slice(0, 25)
        .map((n) => ({ name: n, value: n }));
      await interaction.respond(choices);
    } catch {
      await interaction.respond([]);
    }
    return;
  }

  if (focused.name === 'character') {
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
    return;
  }

  if (focused.name === 'thread') {
    const requestedCharacter = interaction.options.getString('character') ?? undefined;
    try {
      const result = await ctx.adapter.getContactThreadsForCharacter(interaction.user.id, requestedCharacter);
      if (!result) {
        await interaction.respond([]);
        return;
      }
      const choices = result.threads
        .map((t) => ({
          name: `${t.participant_names.join(', ')} — ${t.message_count} message${t.message_count === 1 ? '' : 's'}`.slice(0, 100),
          value: String(t.id),
        }))
        .slice(0, 25);
      await interaction.respond(choices);
    } catch {
      await interaction.respond([]);
    }
    return;
  }

  await interaction.respond([]);
}

export async function execute(interaction: ChatInputCommandInteraction, ctx: CommandContext): Promise<void> {
  const sub = interaction.options.getSubcommand();
  if (sub === 'send') {
    await handleSend(interaction, ctx);
  } else if (sub === 'reply') {
    await handleReply(interaction, ctx);
  }
}

async function handleSend(interaction: ChatInputCommandInteraction, ctx: CommandContext): Promise<void> {
  if (!config.correspondenceContactChannelId) {
    await interaction.reply({
      content: 'The contact channel is not configured yet — ask a staff member to set `CORRESPONDENCE_CONTACT_CHANNEL_ID`.',
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

  const to = interaction.options.getString('to', true).trim();
  const alsoTo = interaction.options.getString('also_to') ?? '';
  const extraNames = alsoTo
    .split(/[,\n]+/)
    .map((n) => n.trim())
    .filter(Boolean);

  const seen = new Set<string>([ownership.characterName.toLowerCase()]);
  const recipientNames: string[] = [];
  for (const candidate of [to, ...extraNames]) {
    const key = candidate.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    recipientNames.push(candidate);
  }

  if (recipientNames.length === 0) {
    await interaction.reply({ content: "You can't text yourself — add at least one other recipient.", ephemeral: true });
    return;
  }

  pendingSends.set(interaction.user.id, { senderCharacterName: ownership.characterName, recipientNames });

  const modal = new ModalBuilder().setCustomId(SEND_MODAL_ID).setTitle('New Message');
  const messageInput = new TextInputBuilder()
    .setCustomId('message')
    .setLabel('Message')
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder('Type your text...')
    .setMaxLength(1500)
    .setRequired(true);
  modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(messageInput));
  await interaction.showModal(modal);
}

async function handleReply(interaction: ChatInputCommandInteraction, ctx: CommandContext): Promise<void> {
  if (!config.correspondenceContactChannelId) {
    await interaction.reply({
      content: 'The contact channel is not configured yet — ask a staff member to set `CORRESPONDENCE_CONTACT_CHANNEL_ID`.',
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

  const threadRaw = interaction.options.getString('thread', true).trim();
  const threadId = Number(threadRaw);
  if (!Number.isInteger(threadId) || threadId <= 0) {
    await interaction.reply({ content: 'Pick a conversation from the autocomplete list.', ephemeral: true });
    return;
  }

  pendingReplies.set(interaction.user.id, { senderCharacterName: ownership.characterName, threadId });

  const modal = new ModalBuilder().setCustomId(REPLY_MODAL_ID).setTitle('Reply');
  const messageInput = new TextInputBuilder()
    .setCustomId('message')
    .setLabel('Message')
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder('Type your reply...')
    .setMaxLength(1500)
    .setRequired(true);
  modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(messageInput));
  await interaction.showModal(modal);
}

function buildContactEmbed(title: string, from: string, body: string, mentions: ContactParticipant[]): {
  embed: EmbedBuilder;
  content: string;
} {
  const embed = new EmbedBuilder()
    .setTitle(title)
    .setColor(_BLUE)
    .addFields({ name: 'From', value: from, inline: true })
    .setDescription(body)
    .setFooter({ text: 'Sent via text — in character.' });

  const mentionText = mentions
    .filter((p) => p.discord_id)
    .map((p) => `<@${p.discord_id}>`)
    .join(' ');

  return { embed, content: mentionText };
}

async function fetchContactChannel(interaction: ModalSubmitInteraction): Promise<TextChannel | null> {
  const fetched = await interaction.client.channels.fetch(config.correspondenceContactChannelId).catch(() => null);
  if (!fetched || !fetched.isTextBased() || !('send' in fetched)) return null;
  return fetched as TextChannel;
}

export async function handleContactSendModal(
  interaction: ModalSubmitInteraction,
  ctx: CommandContext,
): Promise<boolean> {
  if (interaction.customId !== SEND_MODAL_ID) return false;

  await interaction.deferReply({ ephemeral: true });

  const pending = pendingSends.get(interaction.user.id);
  pendingSends.delete(interaction.user.id);
  if (!pending) {
    await interaction.editReply('Session expired — run `/contact send` again.');
    return true;
  }

  const message = interaction.fields.getTextInputValue('message').trim();

  const result = await ctx.adapter.createContactThread(
    { requesterDiscordId: interaction.user.id, requesterDiscordName: interaction.user.username },
    { senderCharacterName: pending.senderCharacterName, recipientCharacterNames: pending.recipientNames, body: message },
  );
  if (!result.ok || !result.participants) {
    await interaction.editReply(`Could not send: ${result.message}`);
    return true;
  }

  const channel = await fetchContactChannel(interaction);
  if (!channel) {
    await interaction.editReply('Could not find the contact channel. Ask staff to check the configured channel ID.');
    return true;
  }

  const otherParticipants = result.participants.filter(
    (p) => p.character_name.toLowerCase() !== pending.senderCharacterName.toLowerCase(),
  );
  const { embed, content } = buildContactEmbed('📱 Incoming Message', pending.senderCharacterName, message, otherParticipants);

  try {
    await channel.send({ content: content || undefined, embeds: [embed] });
  } catch (err) {
    await interaction.editReply(`Could not post the message: ${errorToMessage(err)}`);
    return true;
  }

  await interaction.editReply(`Message sent to **${pending.recipientNames.join(', ')}**.`);
  return true;
}

export async function handleContactReplyModal(
  interaction: ModalSubmitInteraction,
  ctx: CommandContext,
): Promise<boolean> {
  if (interaction.customId !== REPLY_MODAL_ID) return false;

  await interaction.deferReply({ ephemeral: true });

  const pending = pendingReplies.get(interaction.user.id);
  pendingReplies.delete(interaction.user.id);
  if (!pending) {
    await interaction.editReply('Session expired — run `/contact reply` again.');
    return true;
  }

  const message = interaction.fields.getTextInputValue('message').trim();

  const result = await ctx.adapter.replyToContactThread(
    pending.threadId,
    { requesterDiscordId: interaction.user.id, requesterDiscordName: interaction.user.username },
    { senderCharacterName: pending.senderCharacterName, body: message },
  );
  if (!result.ok || !result.otherParticipants) {
    await interaction.editReply(`Could not send reply: ${result.message}`);
    return true;
  }

  const channel = await fetchContactChannel(interaction);
  if (!channel) {
    await interaction.editReply('Could not find the contact channel. Ask staff to check the configured channel ID.');
    return true;
  }

  const { embed, content } = buildContactEmbed('📱 Reply', pending.senderCharacterName, message, result.otherParticipants);

  try {
    await channel.send({ content: content || undefined, embeds: [embed] });
  } catch (err) {
    await interaction.editReply(`Could not post the reply: ${errorToMessage(err)}`);
    return true;
  }

  await interaction.editReply('Reply sent.');
  return true;
}
