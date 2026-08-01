import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  GuildChannel,
  ModalBuilder,
  OverwriteType,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type ModalSubmitInteraction,
  type StringSelectMenuInteraction,
  type TextChannel,
} from 'discord.js';
import type { CommandContext } from './discord';
import { config } from './config';
import { errorToMessage, logEvent } from './logger';
import { isCubbyCategoryName } from './services/cubbyChannels';

// ── Constants ──────────────────────────────────────────────────────────────

const CLANS = [
  'Brujah', 'Gangrel', 'Hecata', 'Lasombra', 'Malkavian',
  'Nosferatu', 'Ravnos', 'Salubri', 'Toreador', 'Tremere',
  'Tzimisce', 'Ventrue', 'Banu Haqim', 'The Ministry',
  'Thin-Blood', 'Caitiff', 'Mortal', 'Ghoul',
];

const AGE_OPTIONS = ['Mortal', 'Fledgling', 'Neonate', 'Ancilla'];

const SECT_OPTIONS = ['Camarilla', 'Anarch', 'Hecata', 'Autarkis', 'NA'];

const AGE_TO_CUBBY: Record<string, string> = {
  mortal: 'mortal character cubbies',
  fledgling: 'fledgeling character cubbies',
  neonate: 'neonate character cubbies',
  ancilla: 'ancilla character cubbies',
};

const APPROVAL_ROLE_NAMES = [
  'Kindred', 'Ghouls', 'Mortals', 'Camarilla', 'Anarch', 'Family', 'Autarkis',
  'Banu Haqim', 'Brujah', 'Clanless', 'Gangrel', 'Lasombra', 'Malkavian',
  'Ministry', 'Nosferatu', 'Ravnos', 'Salubri', 'Toreador', 'Tremere',
  'Tzimisce', 'Ventrue',
];

const WELCOME_CHANNEL_CHILDREN_OF_THE_NIGHT = '1168655581486252042'; // #children-of-the-night
const WELCOME_CHANNEL_STANDARD_ROLLS         = '1170108585146056744'; // #standard-rolls
const WELCOME_CHANNEL_THE_BASICS             = '1458780176476405760'; // #the-basics
const WELCOME_CHANNEL_HOUSE_RULES            = '1458869902638190663'; // #house-rules
const WELCOME_CHANNEL_LOOKING_FOR_RP         = '1225527235574759454'; // #looking-for-rp
const WELCOME_CHANNEL_RUMORS                 = '1170107198748237885'; // #rumors

function ch(id: string): string {
  return id ? `<#${id}>` : '*(channel TBD)*';
}

function welcomeMessage(playerMention: string, characterName: string): string {
  const baseUrl = config.playerWebUrl.replace(/\/+$/, '');
  const dashboardUrl = `${baseUrl}/${encodeURIComponent(characterName)}`;
  return [
    `✅ Attributes`,
    `✅ Skills`,
    `✅ Predator Type`,
    `✅ Disciplines`,
    `✅ Character Thresholds (Health, Humanity, Willpower and Blood Potency)`,
    `✅ : Merits/Flaws`,
    `✅ : Convictions & Tenets`,
    `✅ : XP Spend`,
    `✅ : Backstory`,
    ``,
    `Character Approved`,
    `Welcome to Music City, ${playerMention}!`,
    ``,
    `You can view your character on the player dashboard here:`,
    dashboardUrl,
    ``,
    `If you want you can create your character profile in:`,
    ch(WELCOME_CHANNEL_CHILDREN_OF_THE_NIGHT),
    ``,
    `And you can put your character in Realm of Darkness now:`,
    `https://realmofdarkness.app`,
    ``,
    `There is alot of helpful information about house rules and server ettiquette here`,
    ch(WELCOME_CHANNEL_THE_BASICS),
    ch(WELCOME_CHANNEL_HOUSE_RULES),
    ``,
    `After that you can look for RP scenes here:`,
    ch(WELCOME_CHANNEL_LOOKING_FOR_RP),
    ``,
    `You can also search for rumors here:`,
    ch(WELCOME_CHANNEL_RUMORS),
    ``,
    `If you need help with anything just let staff know!`,
  ].join('\n');
}

// ── Custom IDs ─────────────────────────────────────────────────────────────

export const APPROVE_AGE_SELECT_ID = 'approve:age:select';
export const APPROVE_CLAN_SELECT_ID = 'approve:clan:select';
export const APPROVE_SECT_SELECT_ID = 'approve:sect:select';
export const APPROVE_ROLES_SELECT_ID = 'approve:roles:select';
export const APPROVE_CONFIRM_ID = 'approve:confirm';
export const APPROVE_CANCEL_ID = 'approve:cancel';
export const APPROVE_NAME_MODAL_ID = 'approve:name:modal';
export const APPROVE_NAME_INPUT_ID = 'approve:name:input';

// ── State ──────────────────────────────────────────────────────────────────

type ApproveState = {
  channelId: string;
  /** Canonical display name used for roster and messages (may differ from channel slug). */
  characterName: string;
  playerId: string | null;
  pdfUrl: string | null;
  pdfFilename: string | null;
  age: string | null;
  clan: string | null;
  sect: string | null;
  roleIds: string[];
  availableRoles: { id: string; name: string }[];
};

// keyed by staffUserId — one wizard per staff member at a time
const pending = new Map<string, ApproveState>();

// ── Helpers ────────────────────────────────────────────────────────────────

export async function findPlayerInChannel(
  channel: TextChannel,
  staffIds: Set<string>,
): Promise<string | null> {
  const memberOverwriteIds = channel.permissionOverwrites.cache
    .filter((o) => o.type === OverwriteType.Member && !staffIds.has(o.id))
    .map((o) => o.id);

  for (const id of memberOverwriteIds) {
    try {
      const member = await channel.guild.members.fetch(id);
      if (!member.user.bot) {
        return id;
      }
    } catch {
      // member may have left; skip
    }
  }
  return null;
}

export async function findLatestPdf(
  channel: TextChannel,
): Promise<{ url: string; name: string } | null> {
  try {
    let before: string | undefined;
    // Search up to 3 pages of 100 (300 messages) to handle active channels
    // where the PDF may have been posted well before recent review discussion.
    for (let page = 0; page < 3; page++) {
      const opts: { limit: number; before?: string } = { limit: 100 };
      if (before) opts.before = before;
      const messages = await channel.messages.fetch(opts);
      if (messages.size === 0) break;
      // Collection is newest-first; return the most recent PDF found.
      for (const msg of messages.values()) {
        for (const att of msg.attachments.values()) {
          if (att.name?.toLowerCase().endsWith('.pdf')) {
            return { url: att.url, name: att.name };
          }
        }
      }
      before = messages.last()?.id;
    }
  } catch {
    // ignore fetch errors
  }
  return null;
}

function buildComponents(state: ApproveState) {
  const ageRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(APPROVE_AGE_SELECT_ID)
      .setPlaceholder('Select age category')
      .addOptions(
        AGE_OPTIONS.map((a) => ({
          label: a,
          value: a.toLowerCase(),
          default: state.age === a.toLowerCase(),
        })),
      ),
  );

  const clanRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(APPROVE_CLAN_SELECT_ID)
      .setPlaceholder('Select clan')
      .addOptions(
        CLANS.map((c) => ({
          label: c,
          value: c,
          default: state.clan === c,
        })),
      ),
  );

  const sectRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(APPROVE_SECT_SELECT_ID)
      .setPlaceholder('Select sect')
      .addOptions(
        SECT_OPTIONS.map((s) => ({
          label: s,
          value: s,
          default: state.sect === s,
        })),
      ),
  );

  const rolesRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(APPROVE_ROLES_SELECT_ID)
      .setPlaceholder('Select roles to assign (Kindred, Camarilla, etc.)')
      .setMinValues(0)
      .setMaxValues(Math.max(1, state.availableRoles.length))
      .addOptions(
        state.availableRoles.length > 0
          ? state.availableRoles.map((r) => ({
              label: r.name,
              value: r.id,
              default: state.roleIds.includes(r.id),
            }))
          : [{ label: '(no roles found)', value: 'none', default: false }],
      ),
  );

  const canConfirm = Boolean(state.age && state.clan && state.sect);
  const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(APPROVE_CONFIRM_ID)
      .setLabel('Confirm & Onboard')
      .setStyle(ButtonStyle.Success)
      .setDisabled(!canConfirm),
    new ButtonBuilder()
      .setCustomId(APPROVE_CANCEL_ID)
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Secondary),
  );

  return [ageRow, clanRow, sectRow, rolesRow, buttonRow];
}

function buildStatusContent(state: ApproveState): string {
  const roleList =
    state.roleIds.length > 0
      ? state.roleIds.map((id) => `<@&${id}>`).join(' ')
      : '*(none selected)*';

  return [
    `**Approve character: ${state.characterName}**`,
    `Player: ${state.playerId ? `<@${state.playerId}>` : '⚠️ could not detect — confirm manually'}`,
    `Sheet: ${state.pdfUrl ? `✅ found (\`${state.pdfFilename}\`)` : '⚠️ no PDF found in channel'}`,
    `Age: **${state.age ?? '—'}**  |  Clan: **${state.clan ?? '—'}**  |  Sect: **${state.sect ?? '—'}**`,
    `Roles to add: ${roleList}`,
    '',
    canConfirmStatus(state),
  ].join('\n');
}

function canConfirmStatus(state: ApproveState): string {
  if (state.age && state.clan && state.sect) {
    return '*All required fields set — hit **Confirm & Onboard** to execute.*';
  }
  return '*Select Age, Clan, and Sect to enable confirm.*';
}

// ── Entry point ────────────────────────────────────────────────────────────

export async function startApproveWizard(
  interaction: ChatInputCommandInteraction,
  _ctx: CommandContext,
): Promise<void> {
  if (!config.testerDiscordIds.has(interaction.user.id)) {
    await interaction.reply({ content: 'This command is restricted to staff.', ephemeral: true });
    return;
  }

  const channel = interaction.channel;
  if (!channel || channel.type !== ChannelType.GuildText) {
    await interaction.reply({
      content: 'Run this inside a ticket channel.',
      ephemeral: true,
    });
    return;
  }

  // Guard: don't run if already inside a cubby category
  if (channel.parent?.name && isCubbyCategoryName(channel.parent.name)) {
    await interaction.reply({
      content: `⚠️ This channel is already in **${channel.parent?.name}**. Run \`/lasombra approve\` from a Character Tickets channel.`,
      ephemeral: true,
    });
    return;
  }

  // If the channel still has a default ticket name (starts with "ticket"),
  // the character name hasn't been set yet — show a modal to collect it and
  // rename the channel before proceeding with the rest of the wizard.
  if (/^ticket/i.test(channel.name)) {
    const modal = new ModalBuilder()
      .setCustomId(APPROVE_NAME_MODAL_ID)
      .setTitle('Set Character Name');
    const input = new TextInputBuilder()
      .setCustomId(APPROVE_NAME_INPUT_ID)
      .setLabel('Character name (as it should appear on the roster)')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('e.g. Sylvester Glass')
      .setRequired(true);
    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
    await interaction.showModal(modal);
    return;
  }

  await interaction.deferReply({ ephemeral: false });

  const [playerId, pdf, guildRoles] = await Promise.all([
    findPlayerInChannel(channel, config.testerDiscordIds),
    findLatestPdf(channel),
    interaction.guild!.roles.fetch(),
  ]);

  const availableRoles = APPROVAL_ROLE_NAMES
    .map((name) => {
      const role = guildRoles.find((r) => r.name.toLowerCase() === name.toLowerCase());
      return role ? { id: role.id, name: role.name } : null;
    })
    .filter((r): r is { id: string; name: string } => r !== null);

  const state: ApproveState = {
    channelId: channel.id,
    characterName: channel.name,
    playerId,
    pdfUrl: pdf?.url ?? null,
    pdfFilename: pdf?.name ?? null,
    age: null,
    clan: null,
    sect: null,
    roleIds: [],
    availableRoles,
  };

  pending.set(interaction.user.id, state);

  await interaction.editReply({
    content: buildStatusContent(state),
    components: buildComponents(state),
  });
}

// ── String select handler (age / clan / sect) ──────────────────────────────

export function isApproveWizardStringSelect(customId: string): boolean {
  return (
    customId === APPROVE_AGE_SELECT_ID ||
    customId === APPROVE_CLAN_SELECT_ID ||
    customId === APPROVE_SECT_SELECT_ID ||
    customId === APPROVE_ROLES_SELECT_ID
  );
}

export async function handleApproveWizardStringSelect(
  interaction: StringSelectMenuInteraction,
): Promise<boolean> {
  if (!isApproveWizardStringSelect(interaction.customId)) return false;

  const state = pending.get(interaction.user.id);
  if (!state) {
    await interaction.update({ content: 'Session expired — run `/${config.lasombraCommandName} approve` again.', components: [] });
    return true;
  }

  if (interaction.customId === APPROVE_AGE_SELECT_ID) state.age = interaction.values[0] ?? null;
  else if (interaction.customId === APPROVE_CLAN_SELECT_ID) state.clan = interaction.values[0] ?? null;
  else if (interaction.customId === APPROVE_SECT_SELECT_ID) state.sect = interaction.values[0] ?? null;
  else if (interaction.customId === APPROVE_ROLES_SELECT_ID) state.roleIds = interaction.values.filter((v) => v !== 'none');

  await interaction.update({
    content: buildStatusContent(state),
    components: buildComponents(state),
  });
  return true;
}

// ── Button handler (confirm / cancel) ─────────────────────────────────────

export function isApproveWizardButton(customId: string): boolean {
  return customId === APPROVE_CONFIRM_ID || customId === APPROVE_CANCEL_ID;
}

export async function handleApproveWizardButton(
  interaction: ButtonInteraction,
  ctx: CommandContext,
): Promise<boolean> {
  if (!isApproveWizardButton(interaction.customId)) return false;

  if (interaction.customId === APPROVE_CANCEL_ID) {
    pending.delete(interaction.user.id);
    await interaction.update({ content: 'Approval cancelled.', components: [] });
    return true;
  }

  // Confirm
  const state = pending.get(interaction.user.id);
  pending.delete(interaction.user.id);

  if (!state) {
    await interaction.update({ content: 'Session expired — run `/${config.lasombraCommandName} approve` again.', components: [] });
    return true;
  }

  if (!state.age || !state.clan || !state.sect) {
    await interaction.update({
      content: '⚠️ Age, Clan, and Sect are all required.',
      components: buildComponents(state),
    });
    return true;
  }

  await interaction.deferUpdate();

  const guild = interaction.guild;
  if (!guild) {
    await interaction.editReply({ content: '⚠️ Could not resolve server.', components: [] });
    return true;
  }

  const results: string[] = [`**Onboarding: ${state.characterName}**`, ''];

  // ── 1. Move channel to cubbie ──────────────────────────────────────────
  const targetCubbyName = AGE_TO_CUBBY[state.age];
  let channelMoved = false;
  try {
    const allChannels = await guild.channels.fetch();
    const targetCategory = allChannels.find(
      (ch) =>
        ch?.type === ChannelType.GuildCategory &&
        ch.name.toLowerCase().includes(targetCubbyName),
    );
    if (!targetCategory) {
      results.push(`⚠️ Category **${targetCubbyName}** not found — channel not moved.`);
    } else {
      const ticketChannel = await guild.channels.fetch(state.channelId);
      if (ticketChannel instanceof GuildChannel) {
        await ticketChannel.setParent(targetCategory.id, {
          lockPermissions: false,
          reason: `Character approved: ${state.characterName}`,
        });
        results.push(`✅ Channel moved to **${targetCubbyName}**.`);
        channelMoved = true;
      }
    }
  } catch (err) {
    results.push(`⚠️ Channel move failed: ${errorToMessage(err)}`);
  }

  // ── 2. Assign roles ────────────────────────────────────────────────────
  let playerMember: import('discord.js').GuildMember | null = null;
  if (state.playerId) {
    try {
      playerMember = await guild.members.fetch(state.playerId);
    } catch {
      results.push(`⚠️ Could not fetch player <@${state.playerId}> — roles not assigned.`);
    }
  } else {
    results.push('⚠️ No player detected — roles not assigned.');
  }

  if (playerMember) {
    if (state.roleIds.length > 0) {
      try {
        for (const roleId of state.roleIds) {
          await playerMember.roles.add(roleId, `Character approved: ${state.characterName}`);
        }
        results.push(`✅ Added ${state.roleIds.length} role(s) to <@${state.playerId}>.`);
      } catch (err) {
        results.push(`⚠️ Role assignment failed: ${errorToMessage(err)}`);
      }
    } else {
      results.push('ℹ️ No roles selected — none added.');
    }

    // ── 3. Remove Sheet in Progress role ────────────────────────────────
    const sipRoleId = config.approveSheetInProgressRoleId;
    if (sipRoleId) {
      try {
        if (playerMember.roles.cache.has(sipRoleId)) {
          await playerMember.roles.remove(sipRoleId, `Character approved: ${state.characterName}`);
          results.push('✅ Removed Sheet in Progress role.');
        } else {
          results.push('ℹ️ Sheet in Progress role not present on player — skipped.');
        }
      } catch (err) {
        results.push(`⚠️ Could not remove Sheet in Progress role: ${errorToMessage(err)}`);
      }
    } else {
      results.push('ℹ️ `APPROVE_SHEET_IN_PROGRESS_ROLE_ID` not set — skipped.');
    }
  }

  // ── 4. Create roster entry ─────────────────────────────────────────────
  let rosterCreated = false;
  const ageForRoster = state.age.charAt(0).toUpperCase() + state.age.slice(1);
  try {
    const result = await ctx.adapter.createCharacter({
      characterName: state.characterName,
      playerDiscord: state.playerId ?? '',
      playerDiscordName: playerMember?.user.username ?? '',
      clan: state.clan,
      ageCategory: ageForRoster,
      sect: state.sect,
      requesterDiscordId: interaction.user.id,
      requesterDiscordName: interaction.user.username,
    });
    if (result.ok) {
      results.push(`✅ Roster entry created for **${state.characterName}**.`);
      rosterCreated = true;
    } else {
      results.push(`⚠️ Roster creation failed: ${result.message}`);
    }
  } catch (err) {
    results.push(`⚠️ Roster creation error: ${errorToMessage(err)}`);
  }

  // ── 5. Post to #player-character-sheets ───────────────────────────────
  const sheetsChannelId = config.approvePlayerSheetsChannelId;
  if (sheetsChannelId) {
    try {
      const sheetsChannel = await guild.channels.fetch(sheetsChannelId);
      if (sheetsChannel && sheetsChannel.isTextBased() && 'send' in sheetsChannel) {
        const playerTag = state.playerId ? ` <@${state.playerId}>` : '';
        const content = `${state.characterName}${playerTag} initial sub`;
        if (state.pdfUrl) {
          await (sheetsChannel as TextChannel).send({
            content,
            files: [{ attachment: state.pdfUrl, name: state.pdfFilename ?? 'character-sheet.pdf' }],
          });
        } else {
          await (sheetsChannel as TextChannel).send({ content: `${content} *(no PDF found in ticket)*` });
        }
        results.push(`✅ Posted to <#${sheetsChannelId}>.`);
      } else {
        results.push('⚠️ #player-character-sheets channel not found or not sendable.');
      }
    } catch (err) {
      results.push(`⚠️ #player-character-sheets post failed: ${errorToMessage(err)}`);
    }
  } else {
    results.push('ℹ️ `APPROVE_PLAYER_SHEETS_CHANNEL_ID` not configured — skipped.');
  }

  // ── 6. Post welcome message in cubby ──────────────────────────────────
  if (state.playerId) {
    try {
      const cubbyChannel = await guild.channels.fetch(state.channelId);
      if (cubbyChannel && cubbyChannel.isTextBased() && 'send' in cubbyChannel) {
        await (cubbyChannel as TextChannel).send({
          content: welcomeMessage(`<@${state.playerId}>`, state.characterName),
        });
        results.push('✅ Welcome message posted.');
      }
    } catch (err) {
      results.push(`⚠️ Welcome message failed: ${errorToMessage(err)}`);
    }
  }

  logEvent('info', 'character_approved', {
    characterName: state.characterName,
    playerId: state.playerId,
    age: state.age,
    clan: state.clan,
    sect: state.sect,
    roleIds: state.roleIds,
    staffId: interaction.user.id,
    rosterCreated,
    channelMoved,
  });

  await interaction.editReply({ content: results.join('\n'), components: [] });
  return true;
}

// ── Name modal handler ─────────────────────────────────────────────────────

export async function handleApproveNameModal(
  interaction: ModalSubmitInteraction,
  _ctx: CommandContext,
): Promise<boolean> {
  if (interaction.customId !== APPROVE_NAME_MODAL_ID) return false;

  const characterName = interaction.fields.getTextInputValue(APPROVE_NAME_INPUT_ID).trim();
  if (!characterName) {
    await interaction.reply({ content: '⚠️ Character name cannot be empty.', ephemeral: true });
    return true;
  }

  const channel = interaction.channel;
  if (!channel || channel.type !== ChannelType.GuildText) {
    await interaction.reply({ content: '⚠️ Could not resolve channel.', ephemeral: true });
    return true;
  }

  // Rename the channel to a Discord-safe slug of the character name.
  const slug = characterName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  try {
    await channel.setName(slug, `Character ticket renamed to: ${characterName}`);
  } catch (err) {
    await interaction.reply({
      content: `⚠️ Could not rename channel: ${errorToMessage(err)}`,
      ephemeral: true,
    });
    return true;
  }

  await interaction.deferReply({ ephemeral: false });

  const guild = interaction.guild!;
  const [playerId, pdf, guildRoles] = await Promise.all([
    findPlayerInChannel(channel, config.testerDiscordIds),
    findLatestPdf(channel),
    guild.roles.fetch(),
  ]);

  const availableRoles = APPROVAL_ROLE_NAMES
    .map((name) => {
      const role = guildRoles.find((r) => r.name.toLowerCase() === name.toLowerCase());
      return role ? { id: role.id, name: role.name } : null;
    })
    .filter((r): r is { id: string; name: string } => r !== null);

  const state: ApproveState = {
    channelId: channel.id,
    characterName,
    playerId,
    pdfUrl: pdf?.url ?? null,
    pdfFilename: pdf?.name ?? null,
    age: null,
    clan: null,
    sect: null,
    roleIds: [],
    availableRoles,
  };

  pending.set(interaction.user.id, state);

  await interaction.editReply({
    content: `✅ Channel renamed to \`${slug}\`.\n\n${buildStatusContent(state)}`,
    components: buildComponents(state),
  });
  return true;
}
