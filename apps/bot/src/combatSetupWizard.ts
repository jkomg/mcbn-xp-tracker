import {
  ActionRowBuilder,
  ModalBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ModalSubmitInteraction,
  type StringSelectMenuInteraction,
} from 'discord.js';
import { config } from './config';
import { logEvent, errorToMessage } from './logger';

const PARTICIPANTS_SELECT_ID = 'combat:participants';
const SETUP_MODAL_ID = 'combat:setup';
const TYPE_INPUT_ID = 'combat:setup:type';
const CONSENT_INPUT_ID = 'combat:setup:consent';

const SESSION_TTL_MS = 15 * 60 * 1000;

type CombatSession = {
  participants: string[];
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

export function buildParticipantSelectMenu(characters: string[]): ActionRowBuilder<StringSelectMenuBuilder> {
  const options = characters.slice(0, 25).map((name) =>
    new StringSelectMenuOptionBuilder().setLabel(name).setValue(name),
  );

  const menu = new StringSelectMenuBuilder()
    .setCustomId(PARTICIPANTS_SELECT_ID)
    .setPlaceholder('Select all combatants (minimum 2)')
    .setMinValues(2)
    .setMaxValues(Math.min(options.length, 25))
    .addOptions(options);

  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
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

  cleanupExpiredSessions();
  sessions.set(interaction.user.id, { participants: interaction.values, createdAt: Date.now() });

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

    const participantList = session.participants.map((p) => `• ${p}`).join('\n');

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
      participantCount: session.participants.length,
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
