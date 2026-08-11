/**
 * /rumor — posts to #rumors using the exact staff-provided template, as
 * plain message content (not an embed) to preserve the markdown exactly.
 * The rumor text itself is auto-wrapped in Discord spoiler tags.
 *
 * When liveConfig.rumorApprovalEnabled is on, a rumor no longer posts
 * immediately: it's queued, and an Approve/Reject request (pinging
 * @system-helper) is posted into the poster's own cubby channel first. When
 * it's off, /rumor keeps posting instantly, exactly as before this flag existed.
 */
import {
  ActionRowBuilder,
  AutocompleteInteraction,
  ButtonBuilder,
  type ButtonInteraction,
  ButtonStyle,
  CategoryChannel,
  ChannelType,
  ChatInputCommandInteraction,
  EmbedBuilder,
  Guild,
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
import { findCubbyChannel } from '../services/cubbyChannels';
import { currentIcNightKey } from '../services/icNightTracker';
import { activeSunsetSchedule } from '../services/sunsetSchedule';
import { memberHasAnyRole, type RoleCheckableMember } from '../services/roleGate';
import type { RumorDetails } from '../services/adapter';

const MODAL_ID = 'rumor:submit';
const APPROVE_PREFIX = 'RUMOR_APPROVE:';
const REJECT_PREFIX = 'RUMOR_REJECT:';
const REJECT_MODAL_PREFIX = 'RUMOR_REJECT_MODAL:';

// Curated allowlist — the bot posts with its own permissions, so this must
// stay an explicit list of in-fiction roles rather than "any guild role."
// Letting @ resolve arbitrary roles would let a player trigger a real
// @Administrator (or effectively @everyone-scale) ping through this command.
const RUMOR_TAGGABLE_ROLE_NAMES = [
  'Kindred', 'Ghouls', 'Mortals', 'Storyteller',
  'Camarilla', 'Anarch', 'Autarkis', 'Family', 'Family Representatives',
  'Camarilla Court', 'Anarch Leaders',
  'Banu Haqim', 'Brujah', 'Gangrel', 'Lasombra', 'Malkavian', 'Ministry',
  'Nosferatu', 'Ravnos', 'Salubri', 'Toreador', 'Tremere', 'Tzimisce', 'Ventrue',
];

// Channels under these categories are treated as taggable in-game locations.
const RUMOR_LOCATION_CATEGORY_NAMES = ['city of nashville', 'elysium', 'event locations'];

function normalizeTagName(s: string): string {
  return s.toLowerCase().replace(/-/g, ' ').replace(/\s+/g, ' ').trim();
}

async function buildTagMaps(guild: Guild): Promise<{ roleMap: Map<string, string>; channelMap: Map<string, string> }> {
  const roleMap = new Map<string, string>();
  const channelMap = new Map<string, string>();
  try {
    const [roles, channels] = await Promise.all([guild.roles.fetch(), guild.channels.fetch()]);

    for (const role of roles.values()) {
      if (RUMOR_TAGGABLE_ROLE_NAMES.some((n) => n.toLowerCase() === role.name.toLowerCase())) {
        roleMap.set(normalizeTagName(role.name), role.id);
      }
    }

    const locationCategoryIds = new Set(
      Array.from(channels.values())
        .filter((ch): ch is CategoryChannel => !!ch && ch.type === ChannelType.GuildCategory)
        .filter((ch) => RUMOR_LOCATION_CATEGORY_NAMES.some((n) => n === ch.name.toLowerCase()))
        .map((ch) => ch.id),
    );
    for (const channel of channels.values()) {
      if (channel && channel.type === ChannelType.GuildText && channel.parentId && locationCategoryIds.has(channel.parentId)) {
        channelMap.set(normalizeTagName(channel.name), channel.id);
      }
    }
  } catch {
    // Tag resolution is a best-effort enhancement — a rumor must still post
    // even if the guild role/channel fetch fails.
  }
  return { roleMap, channelMap };
}

/**
 * Scans text for `@word[ word...]` / `#word[ word...]` runs and replaces
 * any that match a known role/location name with a real Discord mention —
 * trying the longest run of words first, then backing off one word at a
 * time, so multi-word names (e.g. "Camarilla Court") resolve without
 * requiring special quoting. Unmatched tags are left as literal text.
 */
export function resolveTags(text: string, roleMap: Map<string, string>, channelMap: Map<string, string>): string {
  // Apostrophes are deliberately excluded from the candidate character class
  // (none of the taggable role/location names contain one) so a possessive
  // like "@Kindred's gathering" or "@Camarilla Court's decree" naturally
  // stops the match right before the apostrophe — "Kindred"/"Camarilla
  // Court" resolves normally, and "'s gathering"/"'s decree" is left
  // completely untouched as trailing text outside the match.
  return text.replace(/([@#])([A-Za-z0-9][A-Za-z0-9 -]{0,48})/g, (full, sigil: string, rest: string) => {
    const map = sigil === '@' ? roleMap : channelMap;
    const wordMatches = Array.from(rest.matchAll(/\S+/g));
    for (let n = wordMatches.length; n >= 1; n--) {
      const lastWord = wordMatches[n - 1];
      const endIdx = (lastWord.index ?? 0) + lastWord[0].length;
      const candidate = rest.slice(0, endIdx);
      const id = map.get(normalizeTagName(candidate));
      if (id) {
        const trailing = rest.slice(endIdx);
        const mention = sigil === '@' ? `<@&${id}>` : `<#${id}>`;
        return mention + trailing;
      }
    }
    return full;
  });
}

const DISCOVERY_CHOICES = [
  { name: 'Kindred', value: 'Kindred' },
  { name: 'Underworld', value: 'Underworld' },
  { name: 'High Society', value: 'High Society' },
  { name: 'Streets', value: 'Streets' },
];

const KIND_CHOICES = [
  { name: 'Permanent — stays through nights and downtime', value: 'permanent' },
  { name: 'Ephemeral — this IC night only', value: 'ephemeral' },
];

type PendingRumor = {
  discovery: string;
  kind: 'permanent' | 'ephemeral';
  sourceCharacterName: string | null;
  sourceDiscordId: string | null;
  posterCharacterName: string | null;
};
const pendingRumors = new Map<string, PendingRumor>();

export const name = 'rumor';

export const data = new SlashCommandBuilder()
  .setName('rumor')
  .setDescription('Post a rumor to #rumors using the standard template.')
  .addStringOption((o) =>
    o.setName('discovery').setDescription('Point of Discovery').setRequired(true).addChoices(...DISCOVERY_CHOICES),
  )
  .addStringOption((o) =>
    o.setName('type').setDescription('How long should this rumor last?').setRequired(true).addChoices(...KIND_CHOICES),
  )
  .addStringOption((o) =>
    o
      .setName('source-character')
      .setDescription('Point of Contact, if it\'s a known character rather than an investigation-roll DC')
      .setRequired(false)
      .setAutocomplete(true),
  )
  .addStringOption((o) =>
    o
      .setName('character')
      .setDescription('Your character (only needed if you have multiple)')
      .setRequired(false)
      .setAutocomplete(true),
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

/** The exact public #rumors post content, spoiler-tagging the rumor text. */
function buildPublicRumorLines(
  discovery: string, rumorText: string, location: string, pointOfContact: string, roll: string,
): string[] {
  const lines = [
    `**Rumor**: ||${rumorText}||`,
    `**Point of Discovery**: ${discovery}`,
  ];
  if (location) {
    lines.push(`**Location (Optional)**: ${location}`);
  }
  lines.push(`**Point of Contact**: ${pointOfContact}`);
  lines.push(`**Roll**: ${roll}`);
  lines.push('');
  lines.push('If you want to maintain a rumor, let us know during downtime and we will not delete it!');
  return lines;
}

function buildApprovalEmbed(rumor: RumorDetails): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle('📜 Rumor Approval')
    .setColor(rumor.status === 'approved' ? 0x2ecc71 : rumor.status === 'rejected' ? 0xe74c3c : 0x8b1a1a)
    .addFields(
      { name: 'Discovery', value: rumor.discovery, inline: true },
      { name: 'Kind', value: rumor.kind === 'ephemeral' ? 'Ephemeral (this night only)' : 'Permanent', inline: true },
      { name: 'Rumor', value: rumor.rumor_text, inline: false },
    );
  if (rumor.location) embed.addFields({ name: 'Location', value: rumor.location, inline: true });
  if (rumor.point_of_contact) embed.addFields({ name: 'Point of Contact', value: rumor.point_of_contact, inline: true });
  if (rumor.roll) embed.addFields({ name: 'Roll', value: rumor.roll, inline: true });
  embed.setFooter({ text: `Rumor #${rumor.id}` });

  if (rumor.status === 'approved') {
    embed.addFields({ name: 'Approved by', value: rumor.approved_by_name || 'an ST', inline: false });
  } else if (rumor.status === 'rejected') {
    embed.addFields({ name: 'Rejected by', value: rumor.rejected_by_name || 'an ST', inline: true });
    if (rumor.rejected_reason) {
      embed.addFields({ name: 'Reason', value: rumor.rejected_reason, inline: false });
    }
  }
  return embed;
}

function buildApprovalButtons(rumor: RumorDetails): ActionRowBuilder<ButtonBuilder>[] {
  if (rumor.status !== 'pending') return [];
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`${APPROVE_PREFIX}${rumor.id}`).setLabel('Approve').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`${REJECT_PREFIX}${rumor.id}`).setLabel('Reject').setStyle(ButtonStyle.Danger),
    ),
  ];
}

function describeCurrentState(rumor: RumorDetails): string {
  if (rumor.status === 'approved') return `already approved by ${rumor.approved_by_name || 'another ST'}.`;
  if (rumor.status === 'rejected') return `already rejected by ${rumor.rejected_by_name || 'another ST'}.`;
  return 'already resolved.';
}

async function updateCubbyMessage(client: BotClient, rumor: RumorDetails): Promise<void> {
  if (!rumor.cubby_channel_id || !rumor.cubby_message_id) return;
  try {
    const channel = await client.channels.fetch(rumor.cubby_channel_id).catch(() => null);
    if (!channel || !channel.isTextBased() || !('messages' in channel)) return;
    const message = await channel.messages.fetch(rumor.cubby_message_id).catch(() => null);
    if (!message) return;
    await message.edit({ embeds: [buildApprovalEmbed(rumor)], components: buildApprovalButtons(rumor) });
  } catch (err) {
    logEvent('warn', 'rumor_cubby_message_update_failed', { error: errorToMessage(err), rumorId: rumor.id });
  }
}

export async function autocomplete(interaction: AutocompleteInteraction, ctx: CommandContext): Promise<void> {
  const focused = interaction.options.getFocused(true);
  if (focused.name !== 'source-character' && focused.name !== 'character') {
    await interaction.respond([]);
    return;
  }
  const query = focused.value.toLowerCase();
  try {
    const roster = await ctx.adapter.getActiveRosterWithIds();
    const pool = focused.name === 'character'
      ? roster.characters.filter((c) => c.discordId === interaction.user.id)
      : roster.characters;
    const choices = pool
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
  if (!(liveConfig.correspondenceRumorChannelId || config.correspondenceRumorChannelId)) {
    await interaction.reply({
      content: 'The rumors channel is not configured yet — ask a staff member to set `CORRESPONDENCE_RUMOR_CHANNEL_ID`.',
      ephemeral: true,
    });
    return;
  }

  const discovery = interaction.options.getString('discovery', true);
  const kind = interaction.options.getString('type', true) as 'permanent' | 'ephemeral';
  const sourceCharacterName = interaction.options.getString('source-character');
  const requestedCharacter = interaction.options.getString('character');

  let sourceDiscordId: string | null = null;
  if (sourceCharacterName) {
    try {
      const roster = await ctx.adapter.getActiveRosterWithIds();
      const match = roster.characters.find((c) => c.name.toLowerCase() === sourceCharacterName.toLowerCase());
      if (!match) {
        await interaction.reply({ content: `Unknown character: ${sourceCharacterName}`, ephemeral: true });
        return;
      }
      sourceDiscordId = match.discordId;
    } catch {
      sourceDiscordId = null;
    }
  }

  // Only the approval flow needs to know whose cubby to post the review
  // request into — when the flag is off, /rumor doesn't care who's posting,
  // matching its behavior before this feature existed.
  let posterCharacterName: string | null = null;
  if (liveConfig.rumorApprovalEnabled) {
    const ownership = await resolveOwnedCharacter(ctx.adapter, interaction.user.id, requestedCharacter);
    if (!ownership.ok) {
      await interaction.reply({ content: ownership.errorMessage, ephemeral: true });
      return;
    }
    posterCharacterName = ownership.characterName;
  }

  pendingRumors.set(interaction.user.id, { discovery, kind, sourceCharacterName, sourceDiscordId, posterCharacterName });

  const modal = new ModalBuilder().setCustomId(MODAL_ID).setTitle('Post a Rumor');
  const rumorInput = new TextInputBuilder()
    .setCustomId('rumor_text')
    .setLabel('Rumor')
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder('The rumor itself — will be spoiler-tagged automatically.')
    .setMaxLength(1000)
    .setRequired(true);
  const locationInput = new TextInputBuilder()
    .setCustomId('location')
    .setLabel('Location (optional)')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('Where it originates or leads')
    .setMaxLength(200)
    .setRequired(false);
  const contactInput = new TextInputBuilder()
    .setCustomId('point_of_contact')
    .setLabel(sourceDiscordId ? 'Point of Contact (optional)' : 'Point of Contact')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('A name, or a Manipulation + Subterfuge DC')
    .setMaxLength(300)
    .setRequired(!sourceDiscordId);
  const rollInput = new TextInputBuilder()
    .setCustomId('roll')
    .setLabel('Roll')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('Attribute + Skill DC #')
    .setMaxLength(200)
    .setRequired(true);

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(rumorInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(locationInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(contactInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(rollInput),
  );
  await interaction.showModal(modal);
}

export async function handleRumorModal(interaction: ModalSubmitInteraction, ctx: CommandContext): Promise<boolean> {
  if (interaction.customId !== MODAL_ID) return false;

  await interaction.deferReply({ ephemeral: true });

  const pending = pendingRumors.get(interaction.user.id);
  pendingRumors.delete(interaction.user.id);
  if (!pending) {
    await interaction.editReply('Session expired — run `/rumor` again.');
    return true;
  }

  let rumorText = interaction.fields.getTextInputValue('rumor_text').trim();
  let location = interaction.fields.getTextInputValue('location').trim();
  const pointOfContactTyped = interaction.fields.getTextInputValue('point_of_contact').trim();
  const roll = interaction.fields.getTextInputValue('roll').trim();

  if (interaction.guild) {
    const { roleMap, channelMap } = await buildTagMaps(interaction.guild);
    rumorText = resolveTags(rumorText, roleMap, channelMap);
    location = resolveTags(location, roleMap, channelMap);
  }

  const pointOfContact =
    pointOfContactTyped || (pending.sourceDiscordId ? `<@${pending.sourceDiscordId}>` : pending.sourceCharacterName ?? '');

  if (!liveConfig.rumorApprovalEnabled) {
    let channel: TextChannel;
    try {
      const fetched = await interaction.client.channels.fetch((liveConfig.correspondenceRumorChannelId || config.correspondenceRumorChannelId));
      if (!fetched || !fetched.isTextBased() || !('send' in fetched)) {
        await interaction.editReply('Could not find the rumors channel. Ask staff to check the configured channel ID.');
        return true;
      }
      channel = fetched as TextChannel;
    } catch (err) {
      await interaction.editReply(`Could not reach the rumors channel: ${errorToMessage(err)}`);
      return true;
    }

    try {
      await channel.send({ content: buildPublicRumorLines(pending.discovery, rumorText, location, pointOfContact, roll).join('\n') });
    } catch (err) {
      await interaction.editReply(`Could not post the rumor: ${errorToMessage(err)}`);
      return true;
    }

    await interaction.editReply('Rumor posted.');
    return true;
  }

  // Approval flow: queue it, then request ST sign-off in the poster's own cubby.
  const icNightKey = pending.kind === 'ephemeral' ? (currentIcNightKey(new Date(), activeSunsetSchedule()) ?? '') : '';
  const created = await ctx.adapter.createRumor(
    { requesterDiscordId: interaction.user.id, requesterDiscordName: interaction.user.username },
    {
      discovery: pending.discovery,
      rumorText,
      location,
      pointOfContact,
      roll,
      kind: pending.kind,
      icNightKey,
      requesterCharacterName: pending.posterCharacterName ?? '',
    },
  );
  if (!created.ok || !created.rumor) {
    await interaction.editReply(`Could not queue the rumor: ${created.message}`);
    return true;
  }
  const rumor = created.rumor;

  if (!interaction.guild || !pending.posterCharacterName) {
    await interaction.editReply(
      `Rumor #${rumor.id} was queued, but I couldn't determine your cubby channel to notify staff — ask an ST to check the pending rumors.`,
    );
    return true;
  }

  const cubby = await findCubbyChannel(interaction.guild, pending.posterCharacterName).catch(() => null);
  if (!cubby) {
    await interaction.editReply(
      `Rumor #${rumor.id} was queued, but I couldn't find your cubby channel to notify staff — ask an ST to check the pending rumors.`,
    );
    logEvent('warn', 'rumor_cubby_not_found', { rumorId: rumor.id, characterName: pending.posterCharacterName });
    return true;
  }

  const helperRoleId = config.staffRoleSystemHelperId;
  try {
    // findCubbyChannel's NotificationChannel type only declares the narrow
    // `content`-only send() shape the other cubby-posting callers use — this
    // is the one caller that needs embeds/components/role-mentions, which
    // the real underlying discord.js channel already supports at runtime.
    const cubbyChannel = cubby as unknown as TextChannel;
    const message = await cubbyChannel.send({
      content: helperRoleId ? `<@&${helperRoleId}>` : undefined,
      embeds: [buildApprovalEmbed(rumor)],
      components: buildApprovalButtons(rumor),
      allowedMentions: helperRoleId ? { roles: [helperRoleId] } : { parse: [] },
    });
    await ctx.adapter.setRumorCubbyMessage(rumor.id, cubbyChannel.id, message.id);
  } catch (err) {
    await interaction.editReply(
      `Rumor #${rumor.id} was queued, but I couldn't post the approval request: ${errorToMessage(err)}`,
    );
    return true;
  }

  await interaction.editReply(`Rumor #${rumor.id} queued for ST approval — check your cubby.`);
  return true;
}

export function isRumorButton(customId: string): boolean {
  return customId.startsWith(APPROVE_PREFIX) || customId.startsWith(REJECT_PREFIX);
}

export async function handleRumorButton(interaction: ButtonInteraction, ctx: CommandContext): Promise<void> {
  const customId = interaction.customId;
  const isApprove = customId.startsWith(APPROVE_PREFIX);
  const idRaw = customId.slice(isApprove ? APPROVE_PREFIX.length : REJECT_PREFIX.length);
  const id = Number(idRaw);
  if (!Number.isInteger(id) || id <= 0) {
    await interaction.reply({ content: 'This rumor approval button has expired.', ephemeral: true });
    return;
  }

  if (!isStoryteller(interaction)) {
    await interaction.reply({ content: 'Storytellers only.', ephemeral: true });
    return;
  }

  if (isApprove) {
    await handleApprove(interaction, ctx, id);
  } else {
    await showRejectModal(interaction, id);
  }
}

async function handleApprove(interaction: ButtonInteraction, ctx: CommandContext, id: number): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const result = await ctx.adapter.approveRumor(id, {
    requesterDiscordId: interaction.user.id,
    requesterDiscordName: interaction.user.username,
  });

  if (!result.ok) {
    if (result.rumor) await updateCubbyMessage(interaction.client as BotClient, result.rumor);
    const label = result.rumor ? describeCurrentState(result.rumor) : result.message;
    await interaction.editReply(`Could not approve: ${label}`);
    return;
  }

  const rumor = result.rumor!;
  const client = interaction.client as BotClient;
  const channelId = liveConfig.correspondenceRumorChannelId || config.correspondenceRumorChannelId;
  if (channelId) {
    try {
      const fetched = await client.channels.fetch(channelId).catch(() => null);
      if (fetched && fetched.isTextBased() && 'send' in fetched) {
        const lines = buildPublicRumorLines(rumor.discovery, rumor.rumor_text, rumor.location, rumor.point_of_contact, rumor.roll);
        const message = await (fetched as TextChannel).send({ content: lines.join('\n') });
        await ctx.adapter.setRumorPostedMessage(rumor.id, fetched.id, message.id);
      }
    } catch (err) {
      logEvent('warn', 'rumor_post_after_approve_failed', { error: errorToMessage(err), rumorId: rumor.id });
    }
  }

  await updateCubbyMessage(client, rumor);
  await interaction.editReply(`Approved rumor #${rumor.id} — it's live in #rumors.`);
}

async function showRejectModal(interaction: ButtonInteraction, id: number): Promise<void> {
  const modal = new ModalBuilder().setCustomId(`${REJECT_MODAL_PREFIX}${id}`).setTitle('Reject Rumor');
  const reasonInput = new TextInputBuilder()
    .setCustomId('reason')
    .setLabel('Reason (optional)')
    .setStyle(TextInputStyle.Paragraph)
    .setMaxLength(500)
    .setRequired(false);
  modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(reasonInput));
  await interaction.showModal(modal);
}

export async function handleRumorRejectModal(interaction: ModalSubmitInteraction, ctx: CommandContext): Promise<boolean> {
  if (!interaction.customId.startsWith(REJECT_MODAL_PREFIX)) {
    return false;
  }

  const id = Number(interaction.customId.slice(REJECT_MODAL_PREFIX.length));
  if (!Number.isInteger(id) || id <= 0) {
    await interaction.reply({ content: 'This rumor is no longer valid.', ephemeral: true });
    return true;
  }

  if (!isStoryteller(interaction)) {
    await interaction.reply({ content: 'Storytellers only.', ephemeral: true });
    return true;
  }

  await interaction.deferReply({ ephemeral: true });
  const reason = interaction.fields.getTextInputValue('reason').trim();

  const result = await ctx.adapter.rejectRumor(
    id,
    { requesterDiscordId: interaction.user.id, requesterDiscordName: interaction.user.username },
    reason,
  );

  if (!result.ok) {
    if (result.rumor) await updateCubbyMessage(interaction.client as BotClient, result.rumor);
    const label = result.rumor ? describeCurrentState(result.rumor) : result.message;
    await interaction.editReply(`Could not reject: ${label}`);
    return true;
  }

  const rumor = result.rumor!;
  await updateCubbyMessage(interaction.client as BotClient, rumor);
  await interaction.editReply('Rumor rejected.');
  return true;
}
