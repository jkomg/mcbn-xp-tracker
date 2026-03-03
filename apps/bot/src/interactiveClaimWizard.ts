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
  type ChatInputCommandInteraction,
  type ModalSubmitInteraction,
  type StringSelectMenuInteraction,
} from 'discord.js';
import type { TrackerAdapter } from './services/adapter';
import type { XpClaimCategory } from './types';
import { parseMessageLink } from './utils/linkValidator';

const CATEGORY_OPTIONS = [
  { key: 'posted_once', label: 'Posted at least once' },
  { key: 'hunting_awakening', label: 'Hunting / Awakening scene' },
  { key: 'scene_with_another', label: 'Scene with another character' },
  { key: 'conflict', label: 'Conflict with another character' },
  { key: 'combat', label: 'Combat with another character' },
  { key: 'unmitigated_stain', label: 'Unmitigated stain' },
] as const;

const PAGE_SIZE = 25;
const MODAL_FIELD_LIMIT = 5;
const SESSION_TTL_MS = 30 * 60 * 1000;

const CHARACTER_MENU_ID = 'xp:submit:character';
const PERIOD_MENU_ID = 'xp:submit:period';
const CATEGORIES_MENU_ID = 'xp:submit:categories';
const CHARACTER_PREV_ID = 'xp:submit:character-prev';
const CHARACTER_NEXT_ID = 'xp:submit:character-next';
const PERIOD_PREV_ID = 'xp:submit:period-prev';
const PERIOD_NEXT_ID = 'xp:submit:period-next';
const LINKS_BUTTON_ID = 'xp:submit:links';
const SUBMIT_BUTTON_ID = 'xp:submit:confirm';
const CANCEL_BUTTON_ID = 'xp:submit:cancel';
const LINKS_MODAL_PREFIX = 'xp:submit:links-modal';

type ClaimDraft = {
  characterName?: string;
  playPeriod?: string;
  availableCharacters: string[];
  openPeriods: string[];
  currentNight: string | null;
  characterPage: number;
  periodPage: number;
  categories: XpClaimCategory[];
  links: Partial<Record<XpClaimCategory, string>>;
  createdAt: number;
};

const drafts = new Map<string, ClaimDraft>();

function cleanupExpiredDrafts() {
  const now = Date.now();
  for (const [userId, draft] of drafts.entries()) {
    if (now - draft.createdAt > SESSION_TTL_MS) {
      drafts.delete(userId);
    }
  }
}

function truncateLabel(value: string, max = 100): string {
  if (value.length <= max) {
    return value;
  }
  return `${value.slice(0, max - 1)}…`;
}

function getCategoryLabel(key: XpClaimCategory): string {
  return CATEGORY_OPTIONS.find((c) => c.key === key)?.label ?? key;
}

function pageCount(values: string[]): number {
  return Math.max(1, Math.ceil(values.length / PAGE_SIZE));
}

function pageSlice(values: string[], page: number): string[] {
  const start = page * PAGE_SIZE;
  return values.slice(start, start + PAGE_SIZE);
}

function clampPage(page: number, values: string[]): number {
  const maxPage = pageCount(values) - 1;
  return Math.max(0, Math.min(page, maxPage));
}

function pageForValue(values: string[], value?: string): number {
  if (!value) {
    return 0;
  }
  const idx = values.indexOf(value);
  if (idx < 0) {
    return 0;
  }
  return Math.floor(idx / PAGE_SIZE);
}

function modalIdForBatch(keys: XpClaimCategory[]): string {
  return `${LINKS_MODAL_PREFIX}:${keys.join(',')}`;
}

function parseModalKeys(customId: string): XpClaimCategory[] {
  if (!customId.startsWith(`${LINKS_MODAL_PREFIX}:`)) {
    return [];
  }
  const encoded = customId.slice(`${LINKS_MODAL_PREFIX}:`.length);
  return encoded
    .split(',')
    .map((s) => s.trim())
    .filter((s): s is XpClaimCategory => CATEGORY_OPTIONS.some((opt) => opt.key === s));
}

function linkInputIdForKey(key: XpClaimCategory): string {
  return `link:${key}`;
}

function nextModalBatchKeys(draft: ClaimDraft): XpClaimCategory[] {
  const missingFirst = [...draft.categories].sort((a, b) => {
    const aMissing = !draft.links[a];
    const bMissing = !draft.links[b];
    if (aMissing === bMissing) return 0;
    return aMissing ? -1 : 1;
  });
  return missingFirst.slice(0, MODAL_FIELD_LIMIT);
}

function renderDraft(draft: ClaimDraft): string {
  const selected = draft.categories.length
    ? draft.categories.map((k) => `- ${getCategoryLabel(k)} (${k})`).join('\n')
    : '- none selected';

  const missingLinks = draft.categories.filter((k) => !draft.links[k]);
  const linksSummary = draft.categories.length
    ? draft.categories
        .map((k) => `- ${k}: ${draft.links[k] ? 'link set' : 'missing'}`)
        .join('\n')
    : '- no selected categories';

  return [
    '**XP Claim Wizard**',
    `Character: **${draft.characterName ?? 'not selected'}**`,
    `Play period: **${draft.playPeriod ?? 'not selected'}**`,
    draft.currentNight ? `Current night: **${draft.currentNight}**` : 'Current night: unavailable',
    '',
    '**Selected categories**',
    selected,
    '',
    '**Link status**',
    linksSummary,
    '',
    'After selecting categories, click **Add / Update Links (Required)**.',
    'The modal now shows one input field per selected category.',
    '',
    !draft.characterName || !draft.playPeriod
      ? 'Status: Select character and play period to continue.'
      : missingLinks.length
        ? `Status: Missing links for ${missingLinks.length} selected categor${missingLinks.length === 1 ? 'y' : 'ies'}.`
        : draft.categories.length
          ? 'Status: Ready to submit.'
          : 'Status: Select one or more categories.',
  ].join('\n');
}

function buildRows(draft: ClaimDraft, disabled = false) {
  draft.characterPage = clampPage(draft.characterPage, draft.availableCharacters);
  draft.periodPage = clampPage(draft.periodPage, draft.openPeriods);

  const characterTotalPages = pageCount(draft.availableCharacters);
  const periodTotalPages = pageCount(draft.openPeriods);

  const characterPageValues = pageSlice(draft.availableCharacters, draft.characterPage);
  const periodPageValues = pageSlice(draft.openPeriods, draft.periodPage);

  const characterOptions = characterPageValues.map((name) =>
    new StringSelectMenuOptionBuilder()
      .setLabel(truncateLabel(name))
      .setValue(name)
      .setDefault(draft.characterName === name),
  );

  const periodOptions = periodPageValues.map((label) =>
    new StringSelectMenuOptionBuilder()
      .setLabel(truncateLabel(label))
      .setValue(label)
      .setDefault(draft.playPeriod === label),
  );

  const characterSelect = new StringSelectMenuBuilder()
    .setCustomId(CHARACTER_MENU_ID)
    .setPlaceholder(characterOptions.length ? `Select character (page ${draft.characterPage + 1}/${characterTotalPages})` : 'No active characters available')
    .setMinValues(1)
    .setMaxValues(1)
    .setDisabled(disabled || characterOptions.length === 0)
    .addOptions(characterOptions.length ? characterOptions : [new StringSelectMenuOptionBuilder().setLabel('No characters').setValue('__none__')]);

  const periodSelect = new StringSelectMenuBuilder()
    .setCustomId(PERIOD_MENU_ID)
    .setPlaceholder(periodOptions.length ? `Select play period (page ${draft.periodPage + 1}/${periodTotalPages})` : 'No open periods available')
    .setMinValues(1)
    .setMaxValues(1)
    .setDisabled(disabled || periodOptions.length === 0)
    .addOptions(periodOptions.length ? periodOptions : [new StringSelectMenuOptionBuilder().setLabel('No periods').setValue('__none__')]);

  const categoriesEnabled = !!draft.characterName && !!draft.playPeriod;
  const categoriesSelect = new StringSelectMenuBuilder()
    .setCustomId(CATEGORIES_MENU_ID)
    .setPlaceholder('Select claimed categories')
    .setMinValues(1)
    .setMaxValues(CATEGORY_OPTIONS.length)
    .setDisabled(disabled || !categoriesEnabled)
    .addOptions(
      CATEGORY_OPTIONS.map((c) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(c.label)
          .setValue(c.key)
          .setDefault(draft.categories.includes(c.key)),
      ),
    );

  const pagerButtons = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(CHARACTER_PREV_ID).setLabel('Char ◀').setStyle(ButtonStyle.Secondary).setDisabled(disabled || draft.characterPage <= 0),
    new ButtonBuilder().setCustomId(CHARACTER_NEXT_ID).setLabel('Char ▶').setStyle(ButtonStyle.Secondary).setDisabled(disabled || draft.characterPage >= characterTotalPages - 1),
    new ButtonBuilder().setCustomId(PERIOD_PREV_ID).setLabel('Period ◀').setStyle(ButtonStyle.Secondary).setDisabled(disabled || draft.periodPage <= 0),
    new ButtonBuilder().setCustomId(PERIOD_NEXT_ID).setLabel('Period ▶').setStyle(ButtonStyle.Secondary).setDisabled(disabled || draft.periodPage >= periodTotalPages - 1),
  );

  const actionButtons = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(LINKS_BUTTON_ID).setLabel('Add / Update Links (Required)').setStyle(ButtonStyle.Secondary).setDisabled(disabled || !categoriesEnabled),
    new ButtonBuilder().setCustomId(SUBMIT_BUTTON_ID).setLabel('Submit Claim').setStyle(ButtonStyle.Success).setDisabled(disabled || !categoriesEnabled),
    new ButtonBuilder().setCustomId(CANCEL_BUTTON_ID).setLabel('Cancel').setStyle(ButtonStyle.Danger).setDisabled(disabled),
  );

  return [
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(characterSelect),
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(periodSelect),
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(categoriesSelect),
    pagerButtons,
    actionButtons,
  ];
}

export async function startClaimWizard(
  interaction: ChatInputCommandInteraction,
  adapter: TrackerAdapter,
  initialCharacter?: string,
  initialPlayPeriod?: string,
) {
  cleanupExpiredDrafts();

  const context = await adapter.getClaimContext();

  const characterName = initialCharacter && context.activeCharacters.includes(initialCharacter)
    ? initialCharacter
    : undefined;

  const playPeriod = initialPlayPeriod && context.openPeriods.includes(initialPlayPeriod)
    ? initialPlayPeriod
    : context.currentNight ?? undefined;

  const draft: ClaimDraft = {
    characterName,
    playPeriod,
    availableCharacters: context.activeCharacters,
    openPeriods: context.openPeriods,
    currentNight: context.currentNight,
    characterPage: pageForValue(context.activeCharacters, characterName),
    periodPage: pageForValue(context.openPeriods, playPeriod),
    categories: [],
    links: {},
    createdAt: Date.now(),
  };
  drafts.set(interaction.user.id, draft);

  const response = {
    content: renderDraft(draft),
    components: buildRows(draft),
  };

  if (interaction.deferred || interaction.replied) {
    await interaction.editReply(response);
    return;
  }

  await interaction.reply({ ...response, ephemeral: true });
}

export async function handleClaimWizardSelect(interaction: StringSelectMenuInteraction) {
  if (!interaction.customId.startsWith('xp:submit:')) {
    return false;
  }

  cleanupExpiredDrafts();
  const draft = drafts.get(interaction.user.id);
  if (!draft) {
    await interaction.reply({ content: 'No active claim wizard. Run /xp submit again.', ephemeral: true });
    return true;
  }

  if (interaction.customId === CHARACTER_MENU_ID) {
    const value = interaction.values[0];
    draft.characterName = value === '__none__' ? undefined : value;
    draft.characterPage = pageForValue(draft.availableCharacters, draft.characterName);
  }

  if (interaction.customId === PERIOD_MENU_ID) {
    const value = interaction.values[0];
    draft.playPeriod = value === '__none__' ? undefined : value;
    draft.periodPage = pageForValue(draft.openPeriods, draft.playPeriod);
  }

  if (interaction.customId === CATEGORIES_MENU_ID) {
    draft.categories = interaction.values.filter((value): value is XpClaimCategory =>
      CATEGORY_OPTIONS.some((option) => option.key === value),
    );
  }

  await interaction.update({
    content: renderDraft(draft),
    components: buildRows(draft),
  });
  return true;
}

export async function handleClaimWizardButton(interaction: ButtonInteraction, adapter: TrackerAdapter) {
  if (!interaction.customId.startsWith('xp:submit:')) {
    return false;
  }

  cleanupExpiredDrafts();
  const draft = drafts.get(interaction.user.id);
  if (!draft) {
    await interaction.reply({ content: 'No active claim wizard. Run /xp submit again.', ephemeral: true });
    return true;
  }

  if (interaction.customId === CHARACTER_PREV_ID) {
    draft.characterPage = clampPage(draft.characterPage - 1, draft.availableCharacters);
    await interaction.update({ content: renderDraft(draft), components: buildRows(draft) });
    return true;
  }

  if (interaction.customId === CHARACTER_NEXT_ID) {
    draft.characterPage = clampPage(draft.characterPage + 1, draft.availableCharacters);
    await interaction.update({ content: renderDraft(draft), components: buildRows(draft) });
    return true;
  }

  if (interaction.customId === PERIOD_PREV_ID) {
    draft.periodPage = clampPage(draft.periodPage - 1, draft.openPeriods);
    await interaction.update({ content: renderDraft(draft), components: buildRows(draft) });
    return true;
  }

  if (interaction.customId === PERIOD_NEXT_ID) {
    draft.periodPage = clampPage(draft.periodPage + 1, draft.openPeriods);
    await interaction.update({ content: renderDraft(draft), components: buildRows(draft) });
    return true;
  }

  if (interaction.customId === LINKS_BUTTON_ID) {
    if (!draft.characterName || !draft.playPeriod) {
      await interaction.reply({ content: 'Select character and play period first.', ephemeral: true });
      return true;
    }

    if (draft.categories.length === 0) {
      await interaction.reply({ content: 'Select one or more categories first.', ephemeral: true });
      return true;
    }

    const keys = nextModalBatchKeys(draft);
    if (!keys.length) {
      await interaction.reply({ content: 'No selected categories to collect links for.', ephemeral: true });
      return true;
    }

    const modal = new ModalBuilder()
      .setCustomId(modalIdForBatch(keys))
      .setTitle(`Evidence Links (${keys.length}/${draft.categories.length})`);

    for (const key of keys) {
      const input = new TextInputBuilder()
        .setCustomId(linkInputIdForKey(key))
        .setLabel(truncateLabel(getCategoryLabel(key), 45))
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder('https://discord.com/channels/...')
        .setValue((draft.links[key] ?? '').slice(0, 400));
      modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
    }

    await interaction.showModal(modal);
    return true;
  }

  if (interaction.customId === CANCEL_BUTTON_ID) {
    drafts.delete(interaction.user.id);
    await interaction.update({
      content: 'XP claim wizard cancelled.',
      components: buildRows(draft, true),
    });
    return true;
  }

  if (interaction.customId === SUBMIT_BUTTON_ID) {
    if (!draft.characterName || !draft.playPeriod) {
      await interaction.reply({ content: 'Select character and play period first.', ephemeral: true });
      return true;
    }

    if (draft.categories.length === 0) {
      await interaction.reply({ content: 'Select at least one category first.', ephemeral: true });
      return true;
    }

    const missing = draft.categories.filter((k) => !draft.links[k]);
    if (missing.length > 0) {
      await interaction.reply({
        content: `Missing links for: ${missing.map((k) => `\`${k}\``).join(', ')}. Click Add / Update Links (Required) first.`,
        ephemeral: true,
      });
      return true;
    }

    const invalid = draft.categories.filter((k) => {
      const link = draft.links[k];
      if (!link) {
        return true;
      }
      const parsed = parseMessageLink(link);
      if (!parsed) {
        return true;
      }
      if (interaction.guildId && parsed.guildId !== interaction.guildId) {
        return true;
      }
      return false;
    });
    if (invalid.length > 0) {
      await interaction.reply({
        content: `Invalid message links for: ${invalid.map((k) => `\`${k}\``).join(', ')}. Update links before submitting.`,
        ephemeral: true,
      });
      return true;
    }

    const payloadCategories: Partial<Record<XpClaimCategory, string>> = {};
    for (const key of draft.categories) {
      payloadCategories[key] = draft.links[key] as string;
    }

    const result = await adapter.submitClaim({
      characterName: draft.characterName,
      playPeriod: draft.playPeriod,
      categories: payloadCategories,
    });

    drafts.delete(interaction.user.id);
    await interaction.update({
      content: `${result.message}\n\nWizard closed.`,
      components: buildRows(draft, true),
    });
    return true;
  }

  return false;
}

export async function handleClaimWizardModal(interaction: ModalSubmitInteraction) {
  if (!interaction.customId.startsWith(`${LINKS_MODAL_PREFIX}:`)) {
    return false;
  }

  cleanupExpiredDrafts();
  const draft = drafts.get(interaction.user.id);
  if (!draft) {
    await interaction.reply({ content: 'No active claim wizard. Run /xp submit again.', ephemeral: true });
    return true;
  }

  const keys = parseModalKeys(interaction.customId);
  if (!keys.length) {
    await interaction.reply({ content: 'Invalid links modal payload.', ephemeral: true });
    return true;
  }

  const invalidKeys: XpClaimCategory[] = [];
  for (const key of keys) {
    const value = interaction.fields.getTextInputValue(linkInputIdForKey(key)).trim();
    if (!value) {
      continue;
    }

    const parsed = parseMessageLink(value);
    if (!parsed) {
      invalidKeys.push(key);
      continue;
    }
    if (interaction.guildId && parsed.guildId !== interaction.guildId) {
      invalidKeys.push(key);
      continue;
    }

    draft.links[key] = value;
  }

  const missing = draft.categories.filter((k) => !draft.links[k]);
  const invalidSummary = invalidKeys.length
    ? `Invalid links were ignored for: ${invalidKeys.map((k) => `\`${k}\``).join(', ')}.\n`
    : '';

  await interaction.reply({
    content: `${invalidSummary}${
      missing.length
        ? `Saved links. ${missing.length} selected categor${missing.length === 1 ? 'y is' : 'ies are'} still missing links. Click **Add / Update Links (Required)** again.`
        : 'Saved links for all selected categories. You can now submit.'
    }`,
    ephemeral: true,
  });
  return true;
}
