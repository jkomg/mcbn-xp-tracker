import {
  ActionRowBuilder,
  ChatInputCommandInteraction,
  ModalBuilder,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import type { CommandContext } from '../discord';
import { config } from '../config';
import { findCubbyChannel } from '../services/cubbyChannels';
import { errorToMessage, logEvent } from '../logger';

export const name = 'staff';

export const data = new SlashCommandBuilder()
  .setName('staff')
  .setDescription('Staff-only commands')
  .addSubcommand((s) =>
    s.setName('broadcast').setDescription('Send a message to #announcements, all active character cubbies, or both'),
  );

const BROADCAST_MODAL_ID = 'staff:broadcast:modal';

export async function execute(interaction: ChatInputCommandInteraction, ctx: CommandContext): Promise<void> {
  const sub = interaction.options.getSubcommand();

  if (sub === 'broadcast') {
    if (!config.testerDiscordIds.has(interaction.user.id)) {
      await interaction.reply({ content: 'This command is restricted to staff.', ephemeral: true });
      return;
    }

    const modal = new ModalBuilder()
      .setCustomId(BROADCAST_MODAL_ID)
      .setTitle('Staff Broadcast');

    const messageInput = new TextInputBuilder()
      .setCustomId('message')
      .setLabel('Message')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('Your announcement...')
      .setMaxLength(2000)
      .setRequired(true);

    const targetInput = new TextInputBuilder()
      .setCustomId('target')
      .setLabel('Send to')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('announcements / cubbies / both')
      .setRequired(true);

    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(messageInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(targetInput),
    );

    await interaction.showModal(modal);
    return;
  }
}

export async function handleBroadcastModal(
  interaction: import('discord.js').ModalSubmitInteraction,
  ctx: CommandContext,
): Promise<boolean> {
  if (interaction.customId !== BROADCAST_MODAL_ID) {
    return false;
  }

  await interaction.deferReply({ ephemeral: true });

  const message = interaction.fields.getTextInputValue('message').trim();
  const targetRaw = interaction.fields.getTextInputValue('target').trim().toLowerCase();

  if (!['announcements', 'cubbies', 'both'].includes(targetRaw)) {
    await interaction.editReply(
      'Invalid target. Please enter `announcements`, `cubbies`, or `both`.',
    );
    return true;
  }

  const sendToAnnouncements = targetRaw === 'announcements' || targetRaw === 'both';
  const sendToCubbies = targetRaw === 'cubbies' || targetRaw === 'both';

  const guild = interaction.guild;
  if (!guild) {
    await interaction.editReply('Could not resolve server. Please try again.');
    return true;
  }

  const results: string[] = [];

  if (sendToAnnouncements) {
    const channelId = config.announcementsChannelId;
    if (!channelId) {
      results.push('⚠️ `ANNOUNCEMENTS_CHANNEL_ID` is not configured — skipped #announcements.');
    } else {
      try {
        const channel = await guild.channels.fetch(channelId);
        if (channel && 'send' in channel && typeof channel.send === 'function') {
          await (channel as { send: (content: string) => Promise<unknown> }).send(message);
          results.push(`✅ Sent to <#${channelId}>.`);
        } else {
          results.push('⚠️ Announcements channel not found or not sendable.');
        }
      } catch (err) {
        logEvent('warn', 'broadcast_announcements_failed', { error: errorToMessage(err) });
        results.push('⚠️ Failed to post to #announcements.');
      }
    }
  }

  if (sendToCubbies) {
    let characters: string[] = [];
    try {
      const roster = await ctx.adapter.getActiveRoster();
      characters = roster.characters;
    } catch (err) {
      logEvent('warn', 'broadcast_roster_fetch_failed', { error: errorToMessage(err) });
      results.push('⚠️ Failed to fetch active characters — cubbies not sent.');
      await interaction.editReply(results.join('\n'));
      return true;
    }

    let sent = 0;
    let missing = 0;

    for (const characterName of characters) {
      try {
        const channel = await findCubbyChannel(guild, characterName);
        if (!channel) {
          missing += 1;
          logEvent('warn', 'broadcast_cubby_missing', { characterName });
          continue;
        }
        await channel.send({ content: message });
        sent += 1;
      } catch (err) {
        missing += 1;
        logEvent('warn', 'broadcast_cubby_send_failed', {
          characterName,
          error: errorToMessage(err),
        });
      }
    }

    const missedNote = missing > 0 ? ` (${missing} not found)` : '';
    results.push(`✅ Sent to ${sent} cubby channel${sent !== 1 ? 's' : ''}${missedNote}.`);
  }

  await interaction.editReply(results.join('\n'));

  logEvent('info', 'broadcast_sent', {
    userId: interaction.user.id,
    target: targetRaw,
  });

  return true;
}
