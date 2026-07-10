/**
 * /scene request — queue a player's ask for a scene with an SPC. Posts to the
 * configured ST channel with Claim/Reject buttons; Claim/Reject are role-gated
 * to Storytellers (and other staff roles) and notify the requester's cubby
 * channel with the outcome.
 */
import {
  ActionRowBuilder,
  AutocompleteInteraction,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChatInputCommandInteraction,
  EmbedBuilder,
  ModalBuilder,
  ModalSubmitInteraction,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle,
  type TextChannel,
} from 'discord.js';
import type { BotClient, CommandContext } from '../discord';
import { config } from '../config';
import { liveConfig } from '../liveConfig';
import { errorToMessage, logEvent } from '../logger';
import { resolveOwnedCharacter } from '../services/characterOwnership';
import { memberHasAnyRole, type RoleCheckableMember } from '../services/roleGate';
import type { SceneRequestDetails } from '../services/adapter';

const CLAIM_PREFIX = 'SCENE_CLAIM:';
const REJECT_PREFIX = 'SCENE_REJECT:';
const REJECT_MODAL_PREFIX = 'SCENE_REJECT_MODAL:';

export const name = 'scene';

export const data = new SlashCommandBuilder()
  .setName('scene')
  .setDescription('Request a scene with an SPC.')
  .addSubcommand((s) =>
    s
      .setName('request')
      .setDescription('Ask an ST to run a scene with an SPC.')
      .addStringOption((o) =>
        o.setName('spc').setDescription('Which SPC do you want a scene with?').setRequired(true).setMaxLength(200),
      )
      .addStringOption((o) =>
        o.setName('night').setDescription('Which night is this for?').setRequired(true).setAutocomplete(true),
      )
      .addStringOption((o) =>
        o
          .setName('justification')
          .setDescription('Why does this scene need to happen?')
          .setRequired(true)
          .setMaxLength(500),
      )
      .addStringOption((o) =>
        o
          .setName('character')
          .setDescription('Your character (only needed if you have multiple)')
          .setRequired(false)
          .setAutocomplete(true),
      ),
  );

function isStoryteller(interaction: { member: RoleCheckableMember }): boolean {
  const roleIds = [
    config.staffRoleStorytellerId,
    config.staffRoleSystemHelperId,
    config.staffRoleModeratorId,
    config.staffRoleAdministratorId,
  ].filter((id): id is string => Boolean(id));
  return memberHasAnyRole(interaction.member, roleIds);
}

function statusColor(status: string): number {
  if (status === 'claimed') return 0x2ecc71;
  if (status === 'rejected') return 0xe74c3c;
  return 0x8b1a1a;
}

function buildSceneRequestEmbed(req: SceneRequestDetails): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle('🎭 Scene Request')
    .setColor(statusColor(req.status))
    .addFields(
      { name: 'Character', value: req.requester_character_name, inline: true },
      { name: 'SPC', value: req.spc_name, inline: true },
      { name: 'Night', value: req.play_period || '—', inline: true },
      { name: 'Justification', value: req.justification || '—', inline: false },
    )
    .setFooter({ text: `Scene Request #${req.id}` });

  if (req.status === 'claimed') {
    embed.addFields({ name: 'Claimed by', value: req.claimed_by_name || 'an ST', inline: false });
  } else if (req.status === 'rejected') {
    embed.addFields({ name: 'Rejected by', value: req.claimed_by_name || 'an ST', inline: true });
    if (req.rejected_reason) {
      embed.addFields({ name: 'Reason', value: req.rejected_reason, inline: false });
    }
  }

  return embed;
}

function buildButtonRow(req: SceneRequestDetails): ActionRowBuilder<ButtonBuilder>[] {
  if (req.status !== 'pending') return [];
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`${CLAIM_PREFIX}${req.id}`).setLabel('Claim').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`${REJECT_PREFIX}${req.id}`).setLabel('Reject').setStyle(ButtonStyle.Danger),
    ),
  ];
}

function describeCurrentState(req: SceneRequestDetails): string {
  if (req.status === 'claimed') return `already claimed by ${req.claimed_by_name || 'another ST'}.`;
  if (req.status === 'rejected') return `already rejected by ${req.claimed_by_name || 'another ST'}.`;
  return 'already resolved.';
}

async function updateQueueMessage(client: BotClient, req: SceneRequestDetails): Promise<void> {
  if (!req.queue_channel_id || !req.queue_message_id) return;
  try {
    const channel = await client.channels.fetch(req.queue_channel_id).catch(() => null);
    if (!channel || !channel.isTextBased() || !('messages' in channel)) return;
    const message = await channel.messages.fetch(req.queue_message_id).catch(() => null);
    if (!message) return;
    await message.edit({ embeds: [buildSceneRequestEmbed(req)], components: buildButtonRow(req) });
  } catch (err) {
    logEvent('warn', 'scene_request_queue_message_update_failed', { error: errorToMessage(err), requestId: req.id });
  }
}

async function notifyRequester(
  client: BotClient,
  ctx: CommandContext,
  req: SceneRequestDetails,
  message: string,
): Promise<void> {
  try {
    const roster = await ctx.adapter.getActiveRosterWithChannelIds();
    const match = roster.characters.find((c) => c.name.toLowerCase() === req.requester_character_name.toLowerCase());
    const channelId = match?.ticketChannelId;
    if (!channelId) return;
    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel || !channel.isTextBased() || !('send' in channel)) return;
    const mention = req.requester_discord_id ? `<@${req.requester_discord_id}>` : '';
    await (channel as TextChannel).send({
      content: [mention, message].filter(Boolean).join(' '),
      allowedMentions: req.requester_discord_id ? { users: [req.requester_discord_id] } : { parse: [] },
    });
  } catch (err) {
    logEvent('warn', 'scene_request_notify_failed', { error: errorToMessage(err), requestId: req.id });
  }
}

async function fetchSceneRequestChannel(interaction: ChatInputCommandInteraction): Promise<TextChannel | null> {
  // liveConfig is already fully resolved (env default, DB override, or explicit
  // blank-to-disable) by index.ts's boot-time seed and ConfigSyncWorker — do not
  // re-apply the env fallback here, or a staff-set blank override (documented in
  // Settings as "leave blank to disable the command") would be silently ignored.
  const channelId = liveConfig.correspondenceSceneRequestChannelId;
  if (!channelId) return null;
  const fetched = await interaction.client.channels.fetch(channelId).catch(() => null);
  if (!fetched || !fetched.isTextBased() || !('send' in fetched)) return null;
  return fetched as TextChannel;
}

export async function autocomplete(interaction: AutocompleteInteraction, ctx: CommandContext): Promise<void> {
  const focused = interaction.options.getFocused(true);
  const query = focused.value.toLowerCase();

  if (focused.name === 'character') {
    try {
      const roster = await ctx.adapter.getActiveRosterWithIds();
      const names = roster.characters.filter((c) => c.discordId === interaction.user.id).map((c) => c.name);
      const choices = names
        .filter((n) => query === '' || n.toLowerCase().includes(query))
        .slice(0, 25)
        .map((n) => ({ name: n, value: n }));
      await interaction.respond(choices);
    } catch {
      await interaction.respond([]);
    }
    return;
  }

  if (focused.name === 'night') {
    try {
      const periods = await ctx.adapter.getRecentPeriods(25);
      const choices = periods
        .filter((p) => query === '' || p.label.toLowerCase().includes(query))
        .slice(0, 25)
        .map((p) => ({ name: p.label, value: p.label }));
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
  if (sub === 'request') {
    await handleRequest(interaction, ctx);
  }
}

async function handleRequest(interaction: ChatInputCommandInteraction, ctx: CommandContext): Promise<void> {
  if (!liveConfig.correspondenceSceneRequestChannelId) {
    await interaction.reply({
      content:
        'The scene request channel is not configured yet — ask a staff member to set `CORRESPONDENCE_SCENE_REQUEST_CHANNEL_ID`.',
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

  const spcName = interaction.options.getString('spc', true).trim();
  const night = interaction.options.getString('night', true).trim();
  const justification = interaction.options.getString('justification', true).trim();

  await interaction.deferReply({ ephemeral: true });

  const result = await ctx.adapter.createSceneRequest(
    { requesterDiscordId: interaction.user.id, requesterDiscordName: interaction.user.username },
    { characterName: ownership.characterName, spcName, playPeriod: night, justification },
  );
  if (!result.ok || !result.request) {
    await interaction.editReply(`Could not queue the scene request: ${result.message}`);
    return;
  }

  const channel = await fetchSceneRequestChannel(interaction);
  if (!channel) {
    await interaction.editReply(
      'Scene request recorded, but the queue channel could not be found — ask staff to check the configured channel ID.',
    );
    return;
  }

  const req = result.request;
  const staffRoleId = config.staffRoleStorytellerId;
  try {
    const message = await channel.send({
      content: staffRoleId ? `<@&${staffRoleId}>` : undefined,
      embeds: [buildSceneRequestEmbed(req)],
      components: buildButtonRow(req),
      allowedMentions: staffRoleId ? { roles: [staffRoleId] } : { parse: [] },
    });
    await ctx.adapter.setSceneRequestQueueMessage(req.id, channel.id, message.id);
  } catch (err) {
    await interaction.editReply(`Scene request recorded, but could not post to the channel: ${errorToMessage(err)}`);
    return;
  }

  await interaction.editReply(`Scene request #${req.id} queued — an ST will claim or respond soon.`);
}

export function isSceneRequestButton(customId: string): boolean {
  return customId.startsWith(CLAIM_PREFIX) || customId.startsWith(REJECT_PREFIX);
}

export async function handleSceneRequestButton(interaction: ButtonInteraction, ctx: CommandContext): Promise<void> {
  const customId = interaction.customId;
  const isClaim = customId.startsWith(CLAIM_PREFIX);
  const idRaw = customId.slice(isClaim ? CLAIM_PREFIX.length : REJECT_PREFIX.length);
  const id = Number(idRaw);
  if (!Number.isInteger(id) || id <= 0) {
    await interaction.reply({ content: 'This scene request button has expired.', ephemeral: true });
    return;
  }

  if (!isStoryteller(interaction)) {
    await interaction.reply({ content: 'Storytellers only.', ephemeral: true });
    return;
  }

  if (isClaim) {
    await handleClaim(interaction, ctx, id);
  } else {
    await showRejectModal(interaction, id);
  }
}

async function handleClaim(interaction: ButtonInteraction, ctx: CommandContext, id: number): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const result = await ctx.adapter.claimSceneRequest(id, {
    requesterDiscordId: interaction.user.id,
    requesterDiscordName: interaction.user.username,
  });

  if (!result.ok) {
    if (result.request) await updateQueueMessage(interaction.client as BotClient, result.request);
    const label = result.request ? describeCurrentState(result.request) : result.message;
    await interaction.editReply(`Could not claim: ${label}`);
    return;
  }

  const req = result.request!;
  await updateQueueMessage(interaction.client as BotClient, req);
  await interaction.editReply(`You claimed scene request #${req.id} (${req.spc_name}).`);
  await notifyRequester(
    interaction.client as BotClient,
    ctx,
    req,
    `Your scene request with **${req.spc_name}** was claimed by **${req.claimed_by_name}**.`,
  );
}

async function showRejectModal(interaction: ButtonInteraction, id: number): Promise<void> {
  const modal = new ModalBuilder().setCustomId(`${REJECT_MODAL_PREFIX}${id}`).setTitle('Reject Scene Request');
  const reasonInput = new TextInputBuilder()
    .setCustomId('reason')
    .setLabel('Reason (optional)')
    .setStyle(TextInputStyle.Paragraph)
    .setMaxLength(500)
    .setRequired(false);
  modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(reasonInput));
  await interaction.showModal(modal);
}

export async function handleSceneRequestRejectModal(
  interaction: ModalSubmitInteraction,
  ctx: CommandContext,
): Promise<boolean> {
  if (!interaction.customId.startsWith(REJECT_MODAL_PREFIX)) {
    return false;
  }

  const id = Number(interaction.customId.slice(REJECT_MODAL_PREFIX.length));
  if (!Number.isInteger(id) || id <= 0) {
    await interaction.reply({ content: 'This scene request is no longer valid.', ephemeral: true });
    return true;
  }

  if (!isStoryteller(interaction)) {
    await interaction.reply({ content: 'Storytellers only.', ephemeral: true });
    return true;
  }

  await interaction.deferReply({ ephemeral: true });
  const reason = interaction.fields.getTextInputValue('reason').trim();

  const result = await ctx.adapter.rejectSceneRequest(
    id,
    { requesterDiscordId: interaction.user.id, requesterDiscordName: interaction.user.username },
    reason,
  );

  if (!result.ok) {
    if (result.request) await updateQueueMessage(interaction.client as BotClient, result.request);
    const label = result.request ? describeCurrentState(result.request) : result.message;
    await interaction.editReply(`Could not reject: ${label}`);
    return true;
  }

  const req = result.request!;
  await updateQueueMessage(interaction.client as BotClient, req);
  await interaction.editReply('Scene request rejected.');
  await notifyRequester(
    interaction.client as BotClient,
    ctx,
    req,
    `Your scene request with **${req.spc_name}** was declined${reason ? `: ${reason}` : '.'}`,
  );
  return true;
}
