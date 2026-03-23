import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type ModalSubmitInteraction,
  type StringSelectMenuInteraction,
} from 'discord.js';
import { config } from './config';
import { logEvent, errorToMessage } from './logger';

export const PARTICIPANTS_SELECT_ID = 'combat:participants';
export const PAGE_PREV_ID = 'combat:page:prev';
export const PAGE_NEXT_ID = 'combat:page:next';
export const CONTINUE_ID = 'combat:continue';
const SETUP_MODAL_ID = 'combat:setup';
const TYPE_INPUT_ID = 'combat:setup:type';
const CONSENT_INPUT_ID = 'combat:setup:consent';

const PAGE_SIZE = 25;
const SESSION_TTL_MS = 15 * 60 * 1000;

type CombatSession = {
  allCharacters: string[];
  selectedNames: Set<string>;
  currentPage: number;
  createdAt: number;
};

const sessions = new Map<string, CombatSession>();

function cleanupExpiredSessions() {
  const now = Date.now();
  for (const [key, session] of sessions) {
    if (now - session.createdAt > SESSION_TTL_MS) {
      sessions.delete(key);
    }
  }
}

function pageCount(characters: string[]): number {
  return Math.max(1, Math.ceil(characters.length / PAGE_SIZE));
}

function pageSlice(characters: string[], page: number): string[] {
  const start = page * PAGE_SIZE;
  return characters.slice(start, start + PAGE_SIZE);
}

function truncateLabel(s: string, max = 100): string {
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}

export function initCombatSession(userId: string, characters: string[]): CombatSession {
  cleanupExpiredSessions();
  const session: CombatSession = {
    allCharacters: characters,
    selectedNames: new Set(),
    currentPage: 0,
    createdAt: Date.now(),
  };
  sessions.set(userId, session);
  return session;
}

export function buildCombatUI(session: CombatSession): {
  content: string;
  components: ActionRowBuilder<StringSelectMenuBuilder | ButtonBuilder>[];
} {
  const totalPages = pageCount(session.allCharacters);
  const pageChars = pageSlice(session.allCharacters, session.currentPage);
  const selectedCount = session.selectedNames.size;

  const options = pageChars.map((name) =>
    new StringSelectMenuOptionBuilder()
      .setLabel(truncateLabel(name))
      .setValue(name)
      .setDefault(session.selectedNames.has(name)),
  );

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId(PARTICIPANTS_SELECT_ID)
    .setPlaceholder(
      totalPages > 1
        ? `Page ${session.currentPage + 1}/${totalPages} — select combatants`
        : 'Select combatants (minimum 2)',
    )
    .setMinValues(0)
    .setMaxValues(options.length)
    .addOptions(options);

  const selectRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

  const pagerRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(PAGE_PREV_ID)
      .setLabel('◀ Prev')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(session.currentPage <= 0),
    new ButtonBuilder()
      .setCustomId(PAGE_NEXT_ID)
      .setLabel('Next ▶')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(session.currentPage >= totalPages - 1),
    new ButtonBuilder()
      .setCustomId(CONTINUE_ID)
      .setLabel(selectedCount >= 2 ? `Continue (${selectedCount} selected)` : 'Continue (need 2+)')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(selectedCount < 2),
  );

  const selectedSummary =
    selectedCount > 0
      ? `Selected: ${[...session.selectedNames].sort().join(', ')}`
      : 'No combatants selected yet.';

  return {
    content: `**Start Combat** — choose participants across pages, then click Continue.\n${selectedSummary}`,
    components: [selectRow, pagerRow],
  };
}

function buildSetupModal(): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(SETUP_MODAL_ID)
    .setTitle('Combat Setup')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId(TYPE_INPUT_ID)
          .setLabel('Combat Type')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('physical or social')
          .setRequired(true)
          .setMaxLength(20),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId(CONSENT_INPUT_ID)
          .setLabel('Consent Level')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('standard, gritty, or social-only')
          .setRequired(true)
          .setMaxLength(30),
      ),
    );
}

type CombatType = 'physical' | 'social';
type ConsentLevel = 'standard' | 'gritty' | 'social-only';

function parseCombatType(raw: string): CombatType | null {
  const v = raw.trim().toLowerCase();
  if (v === 'physical') return 'physical';
  if (v === 'social') return 'social';
  return null;
}

function parseConsentLevel(raw: string): ConsentLevel | null {
  const v = raw.trim().toLowerCase().replace(/\s+/g, '-');
  if (v === 'standard') return 'standard';
  if (v === 'gritty') return 'gritty';
  if (v === 'social-only' || v === 'social') return 'social-only';
  return null;
}

export async function handleCombatParticipantSelect(interaction: StringSelectMenuInteraction): Promise<boolean> {
  if (interaction.customId !== PARTICIPANTS_SELECT_ID) {
    return false;
  }

  const session = sessions.get(interaction.user.id);
  if (!session) {
    await interaction.reply({
      content: 'Your combat setup session expired. Please run `/combat start` again.',
      ephemeral: true,
    });
    return true;
  }

  // Replace this page's selections: remove all page chars, then add newly selected ones.
  const pageChars = pageSlice(session.allCharacters, session.currentPage);
  for (const name of pageChars) session.selectedNames.delete(name);
  for (const name of interaction.values) session.selectedNames.add(name);

  const ui = buildCombatUI(session);
  await interaction.update({ content: ui.content, components: ui.components });
  return true;
}

export function isCombatButton(customId: string): boolean {
  return customId === PAGE_PREV_ID || customId === PAGE_NEXT_ID || customId === CONTINUE_ID;
}

export async function handleCombatButton(interaction: ButtonInteraction): Promise<boolean> {
  if (!isCombatButton(interaction.customId)) {
    return false;
  }

  const session = sessions.get(interaction.user.id);
  if (!session) {
    await interaction.reply({
      content: 'Your combat setup session expired. Please run `/combat start` again.',
      ephemeral: true,
    });
    return true;
  }

  if (interaction.customId === PAGE_PREV_ID) {
    session.currentPage = Math.max(0, session.currentPage - 1);
    const ui = buildCombatUI(session);
    await interaction.update({ content: ui.content, components: ui.components });
    return true;
  }

  if (interaction.customId === PAGE_NEXT_ID) {
    session.currentPage = Math.min(pageCount(session.allCharacters) - 1, session.currentPage + 1);
    const ui = buildCombatUI(session);
    await interaction.update({ content: ui.content, components: ui.components });
    return true;
  }

  // CONTINUE_ID
  if (session.selectedNames.size < 2) {
    await interaction.reply({ content: 'Please select at least 2 combatants.', ephemeral: true });
    return true;
  }

  await interaction.showModal(buildSetupModal());
  return true;
}

export async function handleCombatSetupModal(interaction: ModalSubmitInteraction): Promise<boolean> {
  if (interaction.customId !== SETUP_MODAL_ID) {
    return false;
  }

  const session = sessions.get(interaction.user.id);
  if (!session) {
    await interaction.reply({
      content: 'Your combat setup session expired. Please run `/combat start` again.',
      ephemeral: true,
    });
    return true;
  }

  sessions.delete(interaction.user.id);

  const rawType = interaction.fields.getTextInputValue(TYPE_INPUT_ID);
  const rawConsent = interaction.fields.getTextInputValue(CONSENT_INPUT_ID);

  const combatType = parseCombatType(rawType);
  if (!combatType) {
    await interaction.reply({
      content: 'Invalid combat type. Please enter **physical** or **social**.',
      ephemeral: true,
    });
    return true;
  }

  const consentLevel = parseConsentLevel(rawConsent);
  if (!consentLevel) {
    await interaction.reply({
      content: 'Invalid consent level. Please enter **standard**, **gritty**, or **social-only**.',
      ephemeral: true,
    });
    return true;
  }

  await interaction.deferReply();

  try {
    const helperPing = config.combatSystemHelperRoleId ? `<@&${config.combatSystemHelperRoleId}> ` : '';

    const typeLabel = combatType === 'physical' ? 'Physical' : 'Social';
    const consentLabel =
      consentLevel === 'standard'
        ? 'Standard'
        : consentLevel === 'gritty'
          ? 'Gritty (crippling injuries active)'
          : 'Social-only';

    const participants = [...session.selectedNames].sort();
    const participantList = participants.map((p) => `• ${p}`).join('\n');

    const announcement = [
      `${helperPing}⚔️ **Combat has begun!**`,
      ``,
      `**Type:** ${typeLabel}`,
      `**Consent Level:** ${consentLabel}`,
      `**Started by:** <@${interaction.user.id}>`,
      ``,
      `**Participants:**`,
      participantList,
    ].join('\n');

    const allowedRoles = config.combatSystemHelperRoleId ? [config.combatSystemHelperRoleId] : [];

    await interaction.editReply({
      content: announcement,
      allowedMentions: { roles: allowedRoles, users: [interaction.user.id] },
    });

    logEvent('info', 'combat_started', {
      userId: interaction.user.id,
      channelId: interaction.channelId,
      combatType,
      consentLevel,
      participantCount: participants.length,
    });
  } catch (error) {
    logEvent('error', 'combat_setup_failed', {
      userId: interaction.user.id,
      error: errorToMessage(error),
    });
    await interaction.editReply('Failed to start combat. Please try again.');
  }

  return true;
}
