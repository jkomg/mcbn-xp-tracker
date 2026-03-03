import { AutocompleteInteraction, ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import type { CommandContext } from '../discord';
import { startClaimWizard } from '../interactiveClaimWizard';
import { errorToMessage, logEvent } from '../logger';
import type { XpClaimCategory, XpSpendCategory } from '../types';
import { parseMessageLink } from '../utils/linkValidator';
import { calculateXpCost } from '../xpRules';

const CLAIM_CATEGORY_CHOICES = [
  { name: 'Posted at least once', value: 'posted_once' },
  { name: 'Hunting / Awakening scene', value: 'hunting_awakening' },
  { name: 'Scene with another character', value: 'scene_with_another' },
  { name: 'Conflict with another character', value: 'conflict' },
  { name: 'Combat with another character', value: 'combat' },
  { name: 'Unmitigated stain', value: 'unmitigated_stain' },
] as const;

export const data = new SlashCommandBuilder()
  .setName('xp')
  .setDescription('XP workflow bridge commands')
  .addSubcommand((s) =>
    s
      .setName('submit')
      .setDescription('Open interactive XP claim wizard with live character/night context')
      .addStringOption((o) =>
        o
          .setName('character')
          .setDescription('Optional preselected character name')
          .setAutocomplete(true)
          .setRequired(false),
      )
      .addStringOption((o) => o.setName('play_period').setDescription('Optional preselected period label').setRequired(false)),
  )
  .addSubcommand((s) =>
    s
      .setName('summary')
      .setDescription('Get XP summary for a character from the web-app adapter')
      .addStringOption((o) => o.setName('character').setDescription('Character name').setRequired(true)),
  )
  .addSubcommand((s) =>
    s
      .setName('claim')
      .setDescription('Submit a simple XP claim via adapter')
      .addStringOption((o) => o.setName('character').setDescription('Character name').setRequired(true))
      .addStringOption((o) => o.setName('play_period').setDescription('Period label').setRequired(true))
      .addStringOption((o) =>
        o
          .setName('category')
          .setDescription('Claim category')
          .setRequired(true)
          .addChoices(...CLAIM_CATEGORY_CHOICES),
      )
      .addStringOption((o) => o.setName('link').setDescription('Discord post link').setRequired(true)),
  )
  .addSubcommand((s) =>
    s
      .setName('spend')
      .setDescription('Submit an XP spend request via adapter')
      .addStringOption((o) => o.setName('character').setDescription('Character name').setRequired(true))
      .addStringOption((o) =>
        o
          .setName('category')
          .setDescription('Spend category')
          .setRequired(true)
          .addChoices(
            { name: 'Attribute', value: 'Attribute' },
            { name: 'Skill', value: 'Skill' },
            { name: 'New Skill', value: 'New Skill' },
            { name: 'Discipline (In-Clan)', value: 'Discipline (In-Clan)' },
            { name: 'Discipline (Out-of-Clan)', value: 'Discipline (Out-of-Clan)' },
            { name: 'Caitiff Discipline', value: 'Caitiff Discipline' },
            { name: 'Blood Sorcery Ritual', value: 'Blood Sorcery Ritual' },
            { name: 'Thin-Blood Alchemy Formula', value: 'Thin-Blood Alchemy Formula' },
            { name: 'Advantage (Merit/Background)', value: 'Advantage (Merit/Background)' },
          ),
      )
      .addStringOption((o) => o.setName('trait').setDescription('Trait name').setRequired(true))
      .addIntegerOption((o) =>
        o.setName('current_dots').setDescription('Current dots').setRequired(true).setMinValue(0).setMaxValue(10),
      )
      .addIntegerOption((o) =>
        o.setName('new_dots').setDescription('New dots').setRequired(true).setMinValue(0).setMaxValue(10),
      )
      .addStringOption((o) => o.setName('justification').setDescription('RP rationale').setRequired(true))
      .addBooleanOption((o) => o.setName('is_in_clan').setDescription('In-clan discipline?').setRequired(false)),
  )
  .addSubcommand((s) =>
    s
      .setName('spend-cost')
      .setDescription('Compute V5 XP cost for a spend request')
      .addStringOption((o) =>
        o
          .setName('category')
          .setDescription('Spend category')
          .setRequired(true)
          .addChoices(
            { name: 'Attribute', value: 'Attribute' },
            { name: 'Skill', value: 'Skill' },
            { name: 'New Skill', value: 'New Skill' },
            { name: 'Discipline (In-Clan)', value: 'Discipline (In-Clan)' },
            { name: 'Discipline (Out-of-Clan)', value: 'Discipline (Out-of-Clan)' },
            { name: 'Caitiff Discipline', value: 'Caitiff Discipline' },
            { name: 'Blood Sorcery Ritual', value: 'Blood Sorcery Ritual' },
            { name: 'Thin-Blood Alchemy Formula', value: 'Thin-Blood Alchemy Formula' },
            { name: 'Advantage (Merit/Background)', value: 'Advantage (Merit/Background)' },
          ),
      )
      .addIntegerOption((o) =>
        o.setName('current_dots').setDescription('Current dots').setRequired(true).setMinValue(0).setMaxValue(10),
      )
      .addIntegerOption((o) =>
        o.setName('new_dots').setDescription('New dots').setRequired(true).setMinValue(0).setMaxValue(10),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('health')
      .setDescription('Check bot-to-web API health, latency, and claim-context freshness'),
  );

export const name = 'xp';

export async function autocomplete(interaction: AutocompleteInteraction, { adapter }: CommandContext) {
  const option = interaction.options.getFocused(true);
  const sub = interaction.options.getSubcommand(false);
  if (sub !== 'submit' || option.name !== 'character') {
    await interaction.respond([]);
    return;
  }

  try {
    const query = String(option.value ?? '').trim().toLowerCase();
    const context = await adapter.getClaimContext();
    const values = context.activeCharacters;

    const startsWith = values.filter((v: string) => v.toLowerCase().startsWith(query));
    const includes = values.filter(
      (v: string) => !v.toLowerCase().startsWith(query) && v.toLowerCase().includes(query),
    );

    const ranked = [...startsWith, ...includes].slice(0, 25);
    await interaction.respond(ranked.map((name: string) => ({ name, value: name })));
  } catch (error) {
    logEvent('warn', 'xp_submit_autocomplete_failed', {
      interactionId: interaction.id,
      userId: interaction.user?.id,
      guildId: interaction.guildId,
      error: errorToMessage(error),
    });
    await interaction.respond([]);
  }
}

export async function execute(interaction: ChatInputCommandInteraction, { adapter }: CommandContext) {
  const sub = interaction.options.getSubcommand();
  const meta = {
    interactionId: interaction.id,
    userId: interaction.user?.id,
    guildId: interaction.guildId,
    subcommand: sub,
  };

  if (sub === 'submit') {
    logEvent('info', 'xp_submit_start', meta);
    const character = interaction.options.getString('character') ?? undefined;
    const playPeriod = interaction.options.getString('play_period') ?? undefined;
    await interaction.deferReply({ ephemeral: true });
    try {
      await startClaimWizard(interaction, adapter, character, playPeriod);
      logEvent('info', 'xp_submit_ready', meta);
    } catch (error) {
      logEvent('error', 'xp_submit_failed', { ...meta, error: errorToMessage(error) });
      const message =
        'Unable to load claim context from the web app right now (temporary API issue). Please retry in a minute.';
      await interaction.editReply({ content: message, components: [] });
    }
    return;
  }

  if (sub === 'summary') {
    const character = interaction.options.getString('character', true);
    logEvent('info', 'xp_summary_start', { ...meta, character });
    const summary = await adapter.getSummary(character);
    if (!summary) {
      await interaction.reply({ content: `No summary found for ${character}.`, ephemeral: true });
      return;
    }

    await interaction.reply({
      content: [
        `**${summary.characterName}**`,
        `Earned XP: ${summary.earnedXp}`,
        `Total XP: ${summary.totalXp}`,
        `Total Spends: ${summary.totalSpends}`,
        `Available XP: ${summary.availableXp}`,
      ].join('\n'),
      ephemeral: true,
    });
    return;
  }

  if (sub === 'claim') {
    const character = interaction.options.getString('character', true);
    const playPeriod = interaction.options.getString('play_period', true);
    const category = interaction.options.getString('category', true) as XpClaimCategory;
    const link = interaction.options.getString('link', true);
    const parsed = parseMessageLink(link);
    if (!parsed) {
      await interaction.reply({ content: 'Invalid Discord message link format.', ephemeral: true });
      return;
    }
    if (interaction.guildId && parsed.guildId !== interaction.guildId) {
      await interaction.reply({ content: 'Link must point to a message in this server.', ephemeral: true });
      return;
    }

    const result = await adapter.submitClaim({
      characterName: character,
      playPeriod,
      categories: {
        [category]: link,
      },
    });

    logEvent('info', 'xp_claim_result', { ...meta, character, playPeriod, category, ok: result.ok });
    await interaction.reply({ content: result.message, ephemeral: true });
    return;
  }

  if (sub === 'spend') {
    const character = interaction.options.getString('character', true);
    const spendCategory = interaction.options.getString('category', true);
    const traitName = interaction.options.getString('trait', true);
    const currentDots = interaction.options.getInteger('current_dots', true);
    const newDots = interaction.options.getInteger('new_dots', true);
    const isInClan = interaction.options.getBoolean('is_in_clan') ?? false;
    const justification = interaction.options.getString('justification', true);

    const result = await adapter.submitSpend({
      characterName: character,
      spendCategory: spendCategory as XpSpendCategory,
      traitName,
      currentDots,
      newDots,
      isInClan,
      justification,
    });

    logEvent('info', 'xp_spend_result', {
      ...meta,
      character,
      spendCategory,
      traitName,
      currentDots,
      newDots,
      ok: result.ok,
    });
    await interaction.reply({ content: result.message, ephemeral: true });
    return;
  }

  if (sub === 'spend-cost') {
    const category = interaction.options.getString('category', true);
    const currentDots = interaction.options.getInteger('current_dots', true);
    const newDots = interaction.options.getInteger('new_dots', true);

    try {
      const cost = calculateXpCost(category as XpSpendCategory, currentDots, newDots);
      logEvent('info', 'xp_spend_cost', { ...meta, category, currentDots, newDots, cost });
      await interaction.reply({ content: `Calculated cost: **${cost} XP**`, ephemeral: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid request.';
      logEvent('warn', 'xp_spend_cost_invalid', { ...meta, category, currentDots, newDots, message });
      await interaction.reply({ content: message, ephemeral: true });
    }
    return;
  }

  if (sub === 'health') {
    const startedAt = Date.now();
    await interaction.deferReply({ ephemeral: true });
    try {
      const report = await adapter.getHealthReport();
      const totalMs = Date.now() - startedAt;
      const claim = report.claimContext;
      const web = report.webApi;

      const lines = [
        `Checked: ${report.timestamp}`,
        `Total probe time: ${totalMs}ms`,
        '',
        `Web API: ${web.ok ? 'OK' : 'FAIL'} (status ${web.status ?? 'n/a'}, ${web.latencyMs}ms)`,
      ];

      if (web.error) {
        lines.push(`Web API error: ${web.error}`);
      }

      lines.push(
        `Claim context: ${claim.ok ? 'OK' : 'FAIL'} (${claim.latencyMs}ms)` +
          (claim.source ? `, source=${claim.source}` : '') +
          (typeof claim.retries === 'number' ? `, retries=${claim.retries}` : '') +
          (typeof claim.cacheAgeMs === 'number' ? `, cacheAge=${claim.cacheAgeMs}ms` : ''),
      );

      if (claim.ok) {
        lines.push(
          `Context payload: ${claim.activeCharacters ?? 0} characters, ${claim.openPeriods ?? 0} periods, current=${claim.currentNight ?? 'none'}`,
        );
      } else if (claim.error) {
        lines.push(`Claim context error: ${claim.error}`);
      }

      await interaction.editReply({ content: lines.join('\n') });
      logEvent('info', 'xp_health_report', {
        ...meta,
        totalMs,
        webApi: report.webApi,
        claimContext: report.claimContext,
      });
    } catch (error) {
      const message = `Health check failed: ${errorToMessage(error)}`;
      await interaction.editReply({ content: message });
      logEvent('error', 'xp_health_failed', { ...meta, error: errorToMessage(error) });
    }
    return;
  }
}
