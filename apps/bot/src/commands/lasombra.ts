import {
  ActionRowBuilder,
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  ModalBuilder,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import type { CommandContext } from '../discord';
import { config } from '../config';
import { liveConfig } from '../liveConfig';
import { buildCubbyChannelMap, getChannelsInCubbyCategories, normalizeChannelName } from '../services/cubbyChannels';
import { errorToMessage, logEvent } from '../logger';

export const name = 'lasombra';

export const data = new SlashCommandBuilder()
  .setName('lasombra')
  .setDescription('Staff-only commands')
  .addSubcommand((s) =>
    s
      .setName('broadcast')
      .setDescription('Send a message to announcements, cubbies, or a specific channel')
      .addStringOption((o) =>
        o
          .setName('target')
          .setDescription('Where to send — e.g. "cubbies", "announcements", a character name, or a channel')
          .setRequired(true)
          .setAutocomplete(true),
      )
      .addBooleanOption((o) =>
        o.setName('mention-kindred').setDescription('Prepend an @Kindred mention').setRequired(false),
      )
      .addBooleanOption((o) =>
        o.setName('mention-ghouls').setDescription('Prepend an @Ghouls mention').setRequired(false),
      )
      .addBooleanOption((o) =>
        o.setName('mention-mortals').setDescription('Prepend an @Mortals mention').setRequired(false),
      )
      .addStringOption((o) =>
        o
          .setName('mention-character')
          .setDescription("Ping a specific character's player at the top of the message")
          .setRequired(false)
          .setAutocomplete(true),
      ),
  );

const BROADCAST_MODAL_ID = 'lasombra:broadcast:modal';

type PendingBroadcast = {
  target: string;
  mentionKindred: boolean;
  mentionGhouls: boolean;
  mentionMortals: boolean;
  mentionCharDiscordId: string | null;
};

// Keyed by user ID — a user can only have one modal open at a time.
const pendingBroadcasts = new Map<string, PendingBroadcast>();

export async function execute(interaction: ChatInputCommandInteraction, _ctx: CommandContext): Promise<void> {
  const sub = interaction.options.getSubcommand();

  if (sub === 'broadcast') {
    if (!config.testerDiscordIds.has(interaction.user.id)) {
      await interaction.reply({ content: 'This command is restricted to staff.', ephemeral: true });
      return;
    }

    const target = interaction.options.getString('target', true);
    const mentionKindred = interaction.options.getBoolean('mention-kindred') ?? false;
    const mentionGhouls = interaction.options.getBoolean('mention-ghouls') ?? false;
    const mentionMortals = interaction.options.getBoolean('mention-mortals') ?? false;
    const mentionCharDiscordId = interaction.options.getString('mention-character') ?? null;

    pendingBroadcasts.set(interaction.user.id, {
      target,
      mentionKindred,
      mentionGhouls,
      mentionMortals,
      mentionCharDiscordId,
    });

    const modal = new ModalBuilder().setCustomId(BROADCAST_MODAL_ID).setTitle('Staff Broadcast');

    const messageInput = new TextInputBuilder()
      .setCustomId('message')
      .setLabel('Message')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('Your announcement...')
      .setMaxLength(1800)
      .setRequired(true);

    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(messageInput));

    await interaction.showModal(modal);
  }
}

export async function autocomplete(interaction: AutocompleteInteraction, ctx: CommandContext): Promise<void> {
  if (!config.testerDiscordIds.has(interaction.user.id)) {
    await interaction.respond([]);
    return;
  }

  const focused = interaction.options.getFocused(true);
  const query = focused.value.toLowerCase();

  if (focused.name === 'target') {
    const choices: Array<{ name: string; value: string }> = [];

    // Static targets
    const statics = [
      { name: 'All cubbies', value: 'cubbies' },
      { name: 'Announcements channel', value: 'announcements' },
      { name: 'Cubbies + announcements', value: 'both' },
    ];
    for (const s of statics) {
      if (s.name.toLowerCase().includes(query) || s.value.includes(query)) {
        choices.push(s);
      }
    }

    // Individual character cubbies from active roster
    try {
      const roster = await ctx.adapter.getActiveRoster();
      for (const charName of roster.characters) {
        if (choices.length >= 25) break;
        if (charName.toLowerCase().includes(query) || query === '') {
          choices.push({ name: `Cubby: ${charName}`, value: `cubby:${charName}` });
        }
      }
    } catch {
      // Roster unavailable — skip dynamic cubby choices
    }

    // Channels inside the four cubby categories
    if (interaction.guild && choices.length < 25) {
      try {
        const cubbyChannels = await getChannelsInCubbyCategories(interaction.guild);
        for (const ch of cubbyChannels) {
          if (choices.length >= 25) break;
          if (ch.name.toLowerCase().includes(query) || query === '') {
            choices.push({ name: `#${ch.name}`, value: `channel:${ch.id}` });
          }
        }
      } catch {
        // Channel fetch failed — skip
      }
    }

    await interaction.respond(choices.slice(0, 25));
    return;
  }

  if (focused.name === 'mention-character') {
    try {
      const roster = await ctx.adapter.getActiveRosterWithIds();
      const choices = roster.characters
        .filter((c) => c.discordId && c.name.toLowerCase().includes(query))
        .slice(0, 25)
        .map((c) => ({ name: c.name, value: c.discordId as string }));
      await interaction.respond(choices);
    } catch {
      await interaction.respond([]);
    }
    return;
  }

  await interaction.respond([]);
}

export async function handleBroadcastModal(
  interaction: import('discord.js').ModalSubmitInteraction,
  ctx: CommandContext,
): Promise<boolean> {
  if (interaction.customId !== BROADCAST_MODAL_ID) {
    return false;
  }

  await interaction.deferReply({ ephemeral: true });

  const pending = pendingBroadcasts.get(interaction.user.id);
  pendingBroadcasts.delete(interaction.user.id);

  if (!pending) {
    await interaction.editReply('Broadcast options expired. Please run the command again.');
    return true;
  }

  const messageBody = interaction.fields.getTextInputValue('message').trim();

  // Build mention prefix
  const mentionParts: string[] = [];
  if (pending.mentionKindred && config.passageOfTimeKindredRoleId) {
    mentionParts.push(`<@&${config.passageOfTimeKindredRoleId}>`);
  }
  if (pending.mentionGhouls && config.passageOfTimeGhoulRoleId) {
    mentionParts.push(`<@&${config.passageOfTimeGhoulRoleId}>`);
  }
  if (pending.mentionMortals && config.passageOfTimeMortalRoleId) {
    mentionParts.push(`<@&${config.passageOfTimeMortalRoleId}>`);
  }
  if (pending.mentionCharDiscordId) {
    mentionParts.push(`<@${pending.mentionCharDiscordId}>`);
  }

  const prefix = mentionParts.length > 0 ? `${mentionParts.join(' ')}\n\n` : '';
  const fullMessage = `${prefix}${messageBody}`;
  if (fullMessage.length > 2000) {
    await interaction.editReply(
      `Message is too long after adding mentions (${fullMessage.length}/2000 chars). Shorten the body and try again.`,
    );
    return true;
  }

  const guild = interaction.guild;
  if (!guild) {
    await interaction.editReply('Could not resolve server. Please try again.');
    return true;
  }

  const { target } = pending;
  const results: string[] = [];

  const sendToAnnouncements = target === 'announcements' || target === 'both';
  const sendToAllCubbies = target === 'cubbies' || target === 'both';
  const singleCubbyName = target.startsWith('cubby:') ? target.slice('cubby:'.length) : null;
  const singleChannelId = target.startsWith('channel:') ? target.slice('channel:'.length) : null;

  // --- Announcements ---
  if (sendToAnnouncements) {
    const channelId = liveConfig.announcementsChannelId ?? config.announcementsChannelId;
    if (!channelId) {
      results.push('⚠️ `ANNOUNCEMENTS_CHANNEL_ID` is not configured — skipped #announcements.');
    } else {
      try {
        const channel = await guild.channels.fetch(channelId);
        if (channel && 'send' in channel && typeof channel.send === 'function') {
          await (channel as { send: (content: string) => Promise<unknown> }).send(fullMessage);
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

  // --- All cubbies ---
  if (sendToAllCubbies) {
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

    let channelMap: Map<string, import('../services/cubbyChannels').NotificationChannel>;
    try {
      channelMap = await buildCubbyChannelMap(guild);
    } catch (err) {
      logEvent('warn', 'broadcast_channel_map_failed', { error: errorToMessage(err) });
      results.push('⚠️ Failed to fetch channel list — cubbies not sent.');
      await interaction.editReply(results.join('\n'));
      return true;
    }

    let sent = 0;
    let missing = 0;
    for (const characterName of characters) {
      const channel = channelMap.get(normalizeChannelName(characterName));
      if (!channel) {
        missing += 1;
        logEvent('warn', 'broadcast_cubby_missing', { characterName });
        continue;
      }
      try {
        await channel.send({ content: fullMessage });
        sent += 1;
      } catch (err) {
        missing += 1;
        logEvent('warn', 'broadcast_cubby_send_failed', { characterName, error: errorToMessage(err) });
      }
    }

    const missedNote = missing > 0 ? ` (${missing} not found)` : '';
    results.push(`✅ Sent to ${sent} cubby channel${sent !== 1 ? 's' : ''}${missedNote}.`);
  }

  // --- Single cubby ---
  if (singleCubbyName) {
    let channelMap: Map<string, import('../services/cubbyChannels').NotificationChannel>;
    try {
      channelMap = await buildCubbyChannelMap(guild);
    } catch (err) {
      logEvent('warn', 'broadcast_channel_map_failed', { error: errorToMessage(err) });
      results.push('⚠️ Failed to fetch channel list.');
      await interaction.editReply(results.join('\n'));
      return true;
    }

    const channel = channelMap.get(normalizeChannelName(singleCubbyName));
    if (!channel) {
      results.push(`⚠️ Could not find cubby channel for **${singleCubbyName}**.`);
    } else {
      try {
        await channel.send({ content: fullMessage });
        results.push(`✅ Sent to ${channel.name}'s cubby.`);
      } catch (err) {
        logEvent('warn', 'broadcast_cubby_send_failed', { characterName: singleCubbyName, error: errorToMessage(err) });
        results.push(`⚠️ Failed to send to ${singleCubbyName}'s cubby.`);
      }
    }
  }

  // --- Named channel ---
  if (singleChannelId) {
    try {
      const channel = await guild.channels.fetch(singleChannelId);
      if (channel && 'send' in channel && typeof channel.send === 'function') {
        await (channel as { send: (content: string) => Promise<unknown> }).send(fullMessage);
        results.push(`✅ Sent to <#${singleChannelId}>.`);
      } else {
        results.push('⚠️ Target channel not found or not sendable.');
      }
    } catch (err) {
      logEvent('warn', 'broadcast_channel_send_failed', { channelId: singleChannelId, error: errorToMessage(err) });
      results.push('⚠️ Failed to send to target channel.');
    }
  }

  if (results.length === 0) {
    await interaction.editReply(
      `⚠️ Unknown broadcast target \`${target}\`. Please re-run the command and choose a target from the autocomplete list.`,
    );
    return true;
  }

  await interaction.editReply(results.join('\n'));

  logEvent('info', 'broadcast_sent', {
    userId: interaction.user.id,
    target,
    mentionKindred: pending.mentionKindred,
    mentionGhouls: pending.mentionGhouls,
    mentionMortals: pending.mentionMortals,
    mentionCharDiscordId: pending.mentionCharDiscordId,
  });

  return true;
}
