/**
 * /contact — text messages between characters, posted to #kindred-contact.
 * Thread-tracked (unlike /deliver): `send` starts a conversation with one or
 * more recipients, `reply` continues an existing one and notifies every
 * other participant.
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
import type { ContactParticipant } from '../services/adapter';

const _BLUE = 0x4a90d9;
const SEND_MODAL_ID = 'contact:send';
const REPLY_MODAL_ID = 'contact:reply';
const REPLY_BUTTON_PREFIX = 'contact:reply-btn:';

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
  if (!(liveConfig.correspondenceContactChannelId || config.correspondenceContactChannelId)) {
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
  if (!(liveConfig.correspondenceContactChannelId || config.correspondenceContactChannelId)) {
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
  await interaction.showModal(buildReplyModal());
}

function buildReplyModal(): ModalBuilder {
  const modal = new ModalBuilder().setCustomId(REPLY_MODAL_ID).setTitle('Reply');
  const messageInput = new TextInputBuilder()
    .setCustomId('message')
    .setLabel('Message')
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder('Type your reply...')
    .setMaxLength(1500)
    .setRequired(true);
  modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(messageInput));
  return modal;
}

/**
 * Resolves which of a Discord user's owned characters is actually a
 * participant in the given thread — unlike resolveOwnedCharacter, this
 * disambiguates using thread membership, not just "do you own exactly one
 * active character." A player with several characters should still get an
 * instant reply as long as only one of them is in this specific conversation.
 */
async function resolveThreadParticipantCharacter(
  ctx: CommandContext,
  discordUserId: string,
  threadId: number,
): Promise<{ ok: true; characterName: string } | { ok: false; errorMessage: string }> {
  const roster = await ctx.adapter.getActiveRosterWithIds();
  const owned = roster.characters.filter((c) => c.discordId === discordUserId);

  if (owned.length === 0) {
    return { ok: false, errorMessage: 'No linked active character found. Use the web player page to link one first.' };
  }
  if (owned.length === 1) {
    return { ok: true, characterName: owned[0].name };
  }

  const matches: string[] = [];
  for (const character of owned) {
    const result = await ctx.adapter.getContactThreadsForCharacter(discordUserId, character.name).catch(() => null);
    if (result?.threads.some((t) => t.id === threadId)) {
      matches.push(character.name);
    }
  }

  if (matches.length === 1) {
    return { ok: true, characterName: matches[0] };
  }
  if (matches.length === 0) {
    return { ok: false, errorMessage: 'None of your linked characters are part of this conversation.' };
  }
  return {
    ok: false,
    errorMessage: 'More than one of your characters is in this conversation. Please provide the `character` option.',
  };
}

/** Handles the 📲 Reply button attached to posted messages — jumps straight to the reply modal. */
export async function handleContactReplyButton(interaction: ButtonInteraction, ctx: CommandContext): Promise<boolean> {
  if (!interaction.customId.startsWith(REPLY_BUTTON_PREFIX)) return false;

  const threadId = Number(interaction.customId.slice(REPLY_BUTTON_PREFIX.length));
  if (!Number.isInteger(threadId) || threadId <= 0) {
    await interaction.reply({ content: 'This conversation link looks broken — use `/contact reply` instead.', ephemeral: true });
    return true;
  }

  const ownership = await resolveThreadParticipantCharacter(ctx, interaction.user.id, threadId);
  if (!ownership.ok) {
    await interaction.reply({
      content: `${ownership.errorMessage} Or use \`/contact reply\` and pass the \`character\` option directly.`,
      ephemeral: true,
    });
    return true;
  }

  pendingReplies.set(interaction.user.id, { senderCharacterName: ownership.characterName, threadId });
  await interaction.showModal(buildReplyModal());
  return true;
}

function buildContactEmbed(
  title: string,
  from: string,
  to: string[],
  body: string,
  mentions: ContactParticipant[],
  threadId: number,
): {
  embed: EmbedBuilder;
  content: string;
  components: ActionRowBuilder<ButtonBuilder>[];
} {
  const quoted = body
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n');

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setColor(_BLUE)
    .setDescription(`**To:** ${to.join(', ')}\n**From:** ${from}\n\n${quoted}`)
    .setFooter({ text: '🔒 Encrypted line — in character.' })
    .setTimestamp();

  const mentionText = mentions
    .filter((p) => p.discord_id)
    .map((p) => `<@${p.discord_id}>`)
    .join(' ');

  const replyButton = new ButtonBuilder()
    .setCustomId(`${REPLY_BUTTON_PREFIX}${threadId}`)
    .setLabel('Reply')
    .setEmoji('📲')
    .setStyle(ButtonStyle.Primary);

  return { embed, content: mentionText, components: [new ActionRowBuilder<ButtonBuilder>().addComponents(replyButton)] };
}

async function fetchContactChannel(interaction: ModalSubmitInteraction): Promise<TextChannel | null> {
  const fetched = await interaction.client.channels.fetch((liveConfig.correspondenceContactChannelId || config.correspondenceContactChannelId)).catch(() => null);
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
  if (!result.ok || !result.participants || !result.threadId) {
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
  const { embed, content, components } = buildContactEmbed(
    '📲 New Text Message',
    pending.senderCharacterName,
    otherParticipants.map((p) => p.character_name),
    message,
    otherParticipants,
    result.threadId,
  );

  try {
    await channel.send({ content: content || undefined, embeds: [embed], components });
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

  const { embed, content, components } = buildContactEmbed(
    '📲 Reply',
    pending.senderCharacterName,
    result.otherParticipants.map((p) => p.character_name),
    message,
    result.otherParticipants,
    pending.threadId,
  );

  try {
    await channel.send({ content: content || undefined, embeds: [embed], components });
  } catch (err) {
    await interaction.editReply(`Could not post the reply: ${errorToMessage(err)}`);
    return true;
  }

  await interaction.editReply('Reply sent.');
  return true;
}
