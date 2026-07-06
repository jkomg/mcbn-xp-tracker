/**
 * /post — in-character social media post to #social-media.
 * Generic framing (no named in-fiction platform).
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

const _POST_ACCENT = 0x1d9bf0;
const MODAL_ID = 'post:social';
const REPLY_BUTTON_PREFIX = 'post:reply-btn:';

type PendingPost = { senderCharacterName: string; handle: string; replyToHandle?: string };
const pendingPosts = new Map<string, PendingPost>();

export const name = 'post';

export const data = new SlashCommandBuilder()
  .setName('post')
  .setDescription('Make an in-character social media post to #social-media.')
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
  if (!(liveConfig.correspondenceSocialChannelId || config.correspondenceSocialChannelId)) {
    await interaction.reply({
      content: 'The social media channel is not configured yet — ask a staff member to set `CORRESPONDENCE_SOCIAL_CHANNEL_ID`.',
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

  pendingPosts.set(interaction.user.id, { senderCharacterName: ownership.characterName, handle: ownership.characterName });
  await interaction.showModal(buildPostModal('New Social Media Post'));
}

function buildPostModal(title: string): ModalBuilder {
  const modal = new ModalBuilder().setCustomId(MODAL_ID).setTitle(title);
  const handleInput = new TextInputBuilder()
    .setCustomId('handle')
    .setLabel('Handle (optional)')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('Defaults to your character name')
    .setMaxLength(50)
    .setRequired(false);
  const contentInput = new TextInputBuilder()
    .setCustomId('content')
    .setLabel('Post')
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder("What's happening?")
    .setMaxLength(500)
    .setRequired(true);
  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(handleInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(contentInput),
  );
  return modal;
}

/** Handles the 💬 Reply button attached to posted posts — opens the post modal, tagging the new post as a reply. */
export async function handlePostReplyButton(interaction: ButtonInteraction, ctx: CommandContext): Promise<boolean> {
  if (!interaction.customId.startsWith(REPLY_BUTTON_PREFIX)) return false;

  const replyToHandle = decodeURIComponent(interaction.customId.slice(REPLY_BUTTON_PREFIX.length));

  const ownership = await resolveOwnedCharacter(ctx.adapter, interaction.user.id);
  if (!ownership.ok) {
    await interaction.reply({
      content: `${ownership.errorMessage} Or use \`/post\` and pass the \`character\` option directly.`,
      ephemeral: true,
    });
    return true;
  }

  pendingPosts.set(interaction.user.id, {
    senderCharacterName: ownership.characterName,
    handle: ownership.characterName,
    replyToHandle,
  });
  await interaction.showModal(buildPostModal(`Reply to @${replyToHandle}`.slice(0, 45)));
  return true;
}

export async function handlePostModal(interaction: ModalSubmitInteraction): Promise<boolean> {
  if (interaction.customId !== MODAL_ID) return false;

  await interaction.deferReply({ ephemeral: true });

  const pending = pendingPosts.get(interaction.user.id);
  pendingPosts.delete(interaction.user.id);
  if (!pending) {
    await interaction.editReply('Session expired — run `/post` again.');
    return true;
  }

  const handleRaw = interaction.fields.getTextInputValue('handle').trim();
  const content = interaction.fields.getTextInputValue('content').trim();
  const handle = handleRaw || pending.handle;

  let channel: TextChannel;
  try {
    const fetched = await interaction.client.channels.fetch((liveConfig.correspondenceSocialChannelId || config.correspondenceSocialChannelId));
    if (!fetched || !fetched.isTextBased() || !('send' in fetched)) {
      await interaction.editReply('Could not find the social media channel. Ask staff to check the configured channel ID.');
      return true;
    }
    channel = fetched as TextChannel;
  } catch (err) {
    await interaction.editReply(`Could not reach the social media channel: ${errorToMessage(err)}`);
    return true;
  }

  const description = pending.replyToHandle ? `↩️ Replying to @${pending.replyToHandle}\n\n${content}` : content;

  const embed = new EmbedBuilder()
    .setTitle(`📱 @${handle}`)
    .setColor(_POST_ACCENT)
    .setDescription(description)
    .setFooter({ text: `Posted by ${pending.senderCharacterName} — in character.` })
    .setTimestamp();

  const replyButton = new ButtonBuilder()
    .setCustomId(`${REPLY_BUTTON_PREFIX}${encodeURIComponent(handle)}`)
    .setLabel('Reply')
    .setEmoji('💬')
    .setStyle(ButtonStyle.Secondary);
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(replyButton);

  try {
    await channel.send({ embeds: [embed], components: [row] });
  } catch (err) {
    await interaction.editReply(`Could not post: ${errorToMessage(err)}`);
    return true;
  }

  await interaction.editReply('Posted.');
  return true;
}
