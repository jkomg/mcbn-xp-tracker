import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  GuildChannel,
  ModalBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type ModalSubmitInteraction,
  type StringSelectMenuInteraction,
} from 'discord.js';
import type { CommandContext } from './discord';
import { config } from './config';
import { normalizeChannelName } from './services/cubbyChannels';
import { errorToMessage, logEvent } from './logger';

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

// ── Custom IDs ─────────────────────────────────────────────────────────────

export const EDIT_AGE_SELECT_ID = 'edit:age:select';
export const EDIT_CLAN_SELECT_ID = 'edit:clan:select';
export const EDIT_SECT_SELECT_ID = 'edit:sect:select';
export const EDIT_SAVE_ID = 'edit:save';
export const EDIT_RENAME_ID = 'edit:rename';
export const EDIT_CANCEL_ID = 'edit:cancel';
export const EDIT_RENAME_MODAL_ID = 'edit:rename:modal';

// ── State ──────────────────────────────────────────────────────────────────

type EditState = {
  channelId: string;
  characterName: string;
  originalAge: string;
  age: string;
  clan: string;
  sect: string;
};

// keyed by staffUserId
const pending = new Map<string, EditState>();

// ── Helpers ────────────────────────────────────────────────────────────────

function buildComponents(state: EditState) {
  const ageRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(EDIT_AGE_SELECT_ID)
      .setPlaceholder('Age category')
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
      .setCustomId(EDIT_CLAN_SELECT_ID)
      .setPlaceholder('Clan')
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
      .setCustomId(EDIT_SECT_SELECT_ID)
      .setPlaceholder('Sect')
      .addOptions(
        SECT_OPTIONS.map((s) => ({
          label: s,
          value: s,
          default: state.sect === s,
        })),
      ),
  );

  const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(EDIT_SAVE_ID)
      .setLabel('Save Changes')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(EDIT_RENAME_ID)
      .setLabel('Rename Character')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(EDIT_CANCEL_ID)
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Secondary),
  );

  return [ageRow, clanRow, sectRow, buttonRow];
}

function buildStatusContent(state: EditState): string {
  const ageDirty = state.age !== state.originalAge;
  return [
    `**Edit character: ${state.characterName}**`,
    `Age: **${state.age || '—'}**${ageDirty ? ` *(was ${state.originalAge || '—'}, cubby will move)*` : ''}`,
    `Clan: **${state.clan || '—'}**  |  Sect: **${state.sect || '—'}**`,
    '',
    '*Adjust fields above, then hit **Save Changes**. Use **Rename Character** to fix the name.*',
  ].join('\n');
}

// ── Entry point ────────────────────────────────────────────────────────────

export async function startEditWizard(
  interaction: ChatInputCommandInteraction,
  ctx: CommandContext,
): Promise<void> {
  if (!config.testerDiscordIds.has(interaction.user.id)) {
    await interaction.reply({ content: 'This command is restricted to staff.', ephemeral: true });
    return;
  }

  const channel = interaction.channel;
  if (!channel || channel.type !== ChannelType.GuildText) {
    await interaction.reply({ content: 'Run this inside a character cubby channel.', ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  // Channel names are normalized slugs (e.g. "astrid-von-holt") but roster
  // names are human-readable (e.g. "Astrid von Holt"). Match by normalizing
  // each roster entry rather than sending the slug directly to the API.
  let resolvedName: string | null = null;
  try {
    const roster = await ctx.adapter.getActiveRosterWithIds();
    const match = roster.characters.find(
      (c) => normalizeChannelName(c.name) === channel.name,
    );
    resolvedName = match?.name ?? null;
  } catch {
    // fall through to the not-found message below
  }

  if (!resolvedName) {
    await interaction.editReply(
      `No roster entry found matching channel **${channel.name}**. Make sure the channel name matches the character name.`,
    );
    return;
  }

  const charDetails = await ctx.adapter.getCharacterDetails(resolvedName).catch(() => null);
  if (!charDetails) {
    await interaction.editReply(
      `Could not load details for **${resolvedName}** — try again shortly.`,
    );
    return;
  }

  const age = charDetails.age_category.toLowerCase();
  const state: EditState = {
    channelId: channel.id,
    characterName: charDetails.character_name,
    originalAge: age,
    age,
    clan: charDetails.clan,
    sect: charDetails.sect,
  };

  pending.set(interaction.user.id, state);

  await interaction.editReply({
    content: buildStatusContent(state),
    components: buildComponents(state),
  });
}

// ── String select handler ──────────────────────────────────────────────────

export function isEditWizardStringSelect(customId: string): boolean {
  return (
    customId === EDIT_AGE_SELECT_ID ||
    customId === EDIT_CLAN_SELECT_ID ||
    customId === EDIT_SECT_SELECT_ID
  );
}

export async function handleEditWizardStringSelect(
  interaction: StringSelectMenuInteraction,
): Promise<boolean> {
  if (!isEditWizardStringSelect(interaction.customId)) return false;

  const state = pending.get(interaction.user.id);
  if (!state) {
    await interaction.update({ content: 'Session expired — run `/lasombra edit` again.', components: [] });
    return true;
  }

  const value = interaction.values[0] ?? '';
  if (interaction.customId === EDIT_AGE_SELECT_ID) state.age = value;
  else if (interaction.customId === EDIT_CLAN_SELECT_ID) state.clan = value;
  else if (interaction.customId === EDIT_SECT_SELECT_ID) state.sect = value;

  await interaction.update({
    content: buildStatusContent(state),
    components: buildComponents(state),
  });
  return true;
}

// ── Button handler ─────────────────────────────────────────────────────────

export function isEditWizardButton(customId: string): boolean {
  return (
    customId === EDIT_SAVE_ID ||
    customId === EDIT_RENAME_ID ||
    customId === EDIT_CANCEL_ID
  );
}

export async function handleEditWizardButton(
  interaction: ButtonInteraction,
  ctx: CommandContext,
): Promise<boolean> {
  if (!isEditWizardButton(interaction.customId)) return false;

  if (interaction.customId === EDIT_CANCEL_ID) {
    pending.delete(interaction.user.id);
    await interaction.update({ content: 'Edit cancelled.', components: [] });
    return true;
  }

  if (interaction.customId === EDIT_RENAME_ID) {
    const state = pending.get(interaction.user.id);
    if (!state) {
      await interaction.update({ content: 'Session expired — run `/lasombra edit` again.', components: [] });
      return true;
    }
    const modal = new ModalBuilder()
      .setCustomId(EDIT_RENAME_MODAL_ID)
      .setTitle('Rename Character');
    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('new_name')
          .setLabel('New character name')
          .setStyle(TextInputStyle.Short)
          .setValue(state.characterName)
          .setRequired(true)
          .setMaxLength(100),
      ),
    );
    await interaction.showModal(modal);
    return true;
  }

  // Save Changes
  const state = pending.get(interaction.user.id);
  pending.delete(interaction.user.id);

  if (!state) {
    await interaction.update({ content: 'Session expired — run `/lasombra edit` again.', components: [] });
    return true;
  }

  await interaction.deferUpdate();

  const guild = interaction.guild;
  if (!guild) {
    await interaction.editReply({ content: '⚠️ Could not resolve server.', components: [] });
    return true;
  }

  const updates: { clan?: string; ageCategory?: string; sect?: string } = {};
  if (state.clan) updates.clan = state.clan;
  if (state.sect) updates.sect = state.sect;
  if (state.age) updates.ageCategory = state.age.charAt(0).toUpperCase() + state.age.slice(1);

  // Detect what actually changed by re-fetching current character
  const current = await ctx.adapter.getCharacterDetails(state.characterName).catch(() => null);
  if (!current) {
    await interaction.editReply({ content: `⚠️ Could not fetch current data for **${state.characterName}**.`, components: [] });
    return true;
  }

  const changed: typeof updates = {};
  if (updates.clan && updates.clan !== current.clan) changed.clan = updates.clan;
  if (updates.sect && updates.sect !== current.sect) changed.sect = updates.sect;
  if (updates.ageCategory && updates.ageCategory.toLowerCase() !== current.age_category.toLowerCase()) {
    changed.ageCategory = updates.ageCategory;
  }

  if (Object.keys(changed).length === 0) {
    await interaction.editReply({ content: 'No changes detected — nothing saved.', components: [] });
    return true;
  }

  const results: string[] = [`**Edit: ${state.characterName}**`, ''];

  // ── Update roster fields ───────────────────────────────────────────────
  const updateResult = await ctx.adapter.updateCharacter(state.characterName, changed, {
    requesterDiscordId: interaction.user.id,
    requesterDiscordName: interaction.user.username,
  });
  if (updateResult.ok) {
    const fieldList = Object.keys(changed).map((k) => k.replace('ageCategory', 'age')).join(', ');
    results.push(`✅ Roster updated (${fieldList}).`);
  } else {
    results.push(`⚠️ Roster update failed: ${updateResult.message}`);
    await interaction.editReply({ content: results.join('\n'), components: [] });
    return true;
  }

  // ── Move cubby if age changed (only runs if roster update succeeded) ───
  if (changed.ageCategory) {
    const targetCubbyName = AGE_TO_CUBBY[changed.ageCategory.toLowerCase()];
    if (targetCubbyName) {
      try {
        const allChannels = await guild.channels.fetch();
        const targetCategory = allChannels.find(
          (ch) =>
            ch?.type === ChannelType.GuildCategory &&
            ch.name.toLowerCase().trim() === targetCubbyName,
        );
        if (!targetCategory) {
          results.push(`⚠️ Category **${targetCubbyName}** not found — channel not moved.`);
        } else {
          const ch = await guild.channels.fetch(state.channelId);
          if (ch instanceof GuildChannel) {
            await ch.setParent(targetCategory.id, {
              lockPermissions: false,
              reason: `Age updated to ${changed.ageCategory}: ${state.characterName}`,
            });
            results.push(`✅ Channel moved to **${targetCubbyName}**.`);
          }
        }
      } catch (err) {
        results.push(`⚠️ Channel move failed: ${errorToMessage(err)}`);
      }
    }
  }

  logEvent('info', 'character_edited', {
    characterName: state.characterName,
    changed,
    staffId: interaction.user.id,
  });

  await interaction.editReply({ content: results.join('\n'), components: [] });
  return true;
}

// ── Rename modal handler ───────────────────────────────────────────────────

export function isEditRenameModal(customId: string): boolean {
  return customId === EDIT_RENAME_MODAL_ID;
}

export async function handleEditRenameModal(
  interaction: ModalSubmitInteraction,
  ctx: CommandContext,
): Promise<boolean> {
  if (!isEditRenameModal(interaction.customId)) return false;

  const state = pending.get(interaction.user.id);
  pending.delete(interaction.user.id);

  if (!state) {
    await interaction.reply({ content: 'Session expired — run `/lasombra edit` again.', ephemeral: true });
    return true;
  }

  const newName = interaction.fields.getTextInputValue('new_name').trim();
  if (!newName) {
    await interaction.reply({ content: '⚠️ New name cannot be empty.', ephemeral: true });
    return true;
  }

  if (newName.toLowerCase() === state.characterName.toLowerCase()) {
    await interaction.reply({ content: 'Name unchanged — nothing saved.', ephemeral: true });
    return true;
  }

  await interaction.deferReply({ ephemeral: true });

  const guild = interaction.guild;
  if (!guild) {
    await interaction.editReply('⚠️ Could not resolve server.');
    return true;
  }

  const results: string[] = [`**Rename: ${state.characterName} → ${newName}**`, ''];

  // ── Rename in roster ───────────────────────────────────────────────────
  const renameResult = await ctx.adapter.renameCharacter(state.characterName, newName, {
    requesterDiscordId: interaction.user.id,
    requesterDiscordName: interaction.user.username,
  });
  if (renameResult.ok) {
    results.push(`✅ Roster entry renamed to **${newName}**.`);
  } else {
    results.push(`⚠️ Roster rename failed: ${renameResult.message}`);
    await interaction.editReply(results.join('\n'));
    return true;
  }

  // ── Rename Discord channel ─────────────────────────────────────────────
  try {
    const ch = await guild.channels.fetch(state.channelId);
    if (ch instanceof GuildChannel) {
      await ch.setName(normalizeChannelName(newName), `Renamed from ${state.characterName}: ${interaction.user.username}`);
      results.push(`✅ Channel renamed to **${normalizeChannelName(newName)}**.`);
    }
  } catch (err) {
    results.push(`⚠️ Channel rename failed: ${errorToMessage(err)}`);
  }

  logEvent('info', 'character_renamed', {
    oldName: state.characterName,
    newName,
    staffId: interaction.user.id,
  });

  await interaction.editReply(results.join('\n'));
  return true;
}
