import {
  AutocompleteInteraction,
  CategoryChannel,
  ChannelType,
  ChatInputCommandInteraction,
  PermissionsBitField,
  SlashCommandBuilder,
  TextChannel,
} from 'discord.js';
import type { CommandContext } from '../discord';
import { startClaimWizard } from '../interactiveClaimWizard';
import { config } from '../config';
import { errorToMessage, logEvent } from '../logger';
import { SPEND_CATEGORY_CHOICES } from '../sharedContract';
import { buildClaimReminderActionRow, buildClaimReminderText } from '../services/claimReminderService';
import { findCubbyChannel, normalizeChannelName } from '../services/cubbyChannels';
import { getPassageMessage } from '../services/passageOfTimeService';
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
      .addStringOption((o) => o.setName('play_period').setDescription('Optional preselected period label').setRequired(false))
      .addBooleanOption((o) =>
        o.setName('test').setDescription('Staff only: simulate player-scoped visibility').setRequired(false),
      )
      .addStringOption((o) =>
        o
          .setName('test_as_discord_id')
          .setDescription('Staff only: player Discord ID to emulate (snowflake)')
          .setRequired(false),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('summary')
      .setDescription('Get XP summary for a character from the web-app adapter')
      .addStringOption((o) =>
        o
          .setName('character')
          .setDescription('Character name')
          .setRequired(true)
          .setAutocomplete(true),
      )
      .addBooleanOption((o) =>
        o.setName('test').setDescription('Staff only: simulate player-scoped visibility').setRequired(false),
      )
      .addStringOption((o) =>
        o
          .setName('test_as_discord_id')
          .setDescription('Staff only: player Discord ID to emulate (snowflake)')
          .setRequired(false),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('claim')
      .setDescription('Submit a simple XP claim via adapter')
      .addStringOption((o) =>
        o
          .setName('character')
          .setDescription('Character name')
          .setRequired(true)
          .setAutocomplete(true),
      )
      .addStringOption((o) =>
        o
          .setName('play_period')
          .setDescription('Active period label')
          .setRequired(true)
          .setAutocomplete(true),
      )
      .addStringOption((o) =>
        o
          .setName('category')
          .setDescription('Claim category (slot 1)')
          .setRequired(true)
          .addChoices(...CLAIM_CATEGORY_CHOICES),
      )
      .addStringOption((o) => o.setName('link').setDescription('Discord post link (slot 1)').setRequired(true))
      .addStringOption((o) =>
        o
          .setName('category_2')
          .setDescription('Optional second claim category')
          .setRequired(false)
          .addChoices(...CLAIM_CATEGORY_CHOICES),
      )
      .addStringOption((o) => o.setName('link_2').setDescription('Discord post link for category_2').setRequired(false))
      .addStringOption((o) =>
        o
          .setName('category_3')
          .setDescription('Optional third claim category')
          .setRequired(false)
          .addChoices(...CLAIM_CATEGORY_CHOICES),
      )
      .addStringOption((o) => o.setName('link_3').setDescription('Discord post link for category_3').setRequired(false))
      .addStringOption((o) =>
        o
          .setName('category_4')
          .setDescription('Optional fourth claim category')
          .setRequired(false)
          .addChoices(...CLAIM_CATEGORY_CHOICES),
      )
      .addStringOption((o) => o.setName('link_4').setDescription('Discord post link for category_4').setRequired(false))
      .addStringOption((o) =>
        o
          .setName('category_5')
          .setDescription('Optional fifth claim category')
          .setRequired(false)
          .addChoices(...CLAIM_CATEGORY_CHOICES),
      )
      .addStringOption((o) => o.setName('link_5').setDescription('Discord post link for category_5').setRequired(false))
      .addStringOption((o) =>
        o
          .setName('category_6')
          .setDescription('Optional sixth claim category')
          .setRequired(false)
          .addChoices(...CLAIM_CATEGORY_CHOICES),
      )
      .addStringOption((o) => o.setName('link_6').setDescription('Discord post link for category_6').setRequired(false))
      .addBooleanOption((o) =>
        o.setName('test').setDescription('Staff only: simulate player-scoped visibility').setRequired(false),
      )
      .addStringOption((o) =>
        o
          .setName('test_as_discord_id')
          .setDescription('Staff only: player Discord ID to emulate (snowflake)')
          .setRequired(false),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('spend')
      .setDescription('Submit an XP spend request via adapter')
      .addStringOption((o) =>
        o
          .setName('character')
          .setDescription('Character name')
          .setRequired(true)
          .setAutocomplete(true),
      )
      .addStringOption((o) =>
        o
          .setName('category')
          .setDescription('Spend category')
          .setRequired(true)
          .addChoices(...SPEND_CATEGORY_CHOICES),
      )
      .addStringOption((o) => o.setName('trait').setDescription('Trait name').setRequired(true))
      .addIntegerOption((o) =>
        o.setName('current_dots').setDescription('Current dots').setRequired(true).setMinValue(0).setMaxValue(10),
      )
      .addIntegerOption((o) =>
        o.setName('new_dots').setDescription('New dots').setRequired(true).setMinValue(0).setMaxValue(10),
      )
      .addStringOption((o) => o.setName('justification').setDescription('RP rationale').setRequired(true))
      .addBooleanOption((o) => o.setName('is_in_clan').setDescription('In-clan discipline?').setRequired(false))
      .addBooleanOption((o) =>
        o.setName('test').setDescription('Staff only: simulate player-scoped visibility').setRequired(false),
      )
      .addStringOption((o) =>
        o
          .setName('test_as_discord_id')
          .setDescription('Staff only: player Discord ID to emulate (snowflake)')
          .setRequired(false),
      ),
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
          .addChoices(...SPEND_CATEGORY_CHOICES),
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
  )
  .addSubcommand((s) =>
    s
      .setName('help')
      .setDescription('Show quick player help for XP claims, spends, and summaries'),
  )
  .addSubcommand((s) =>
    s
      .setName('test-reminder')
      .setDescription('Staff test: post a dummy cubby reminder in-character channel')
      .addStringOption((o) =>
        o.setName('character').setDescription('Character / cubby channel name to target').setRequired(true),
      )
      .addUserOption((o) =>
        o.setName('target_user').setDescription('Linked player to mention (default: you)').setRequired(false),
      )
      .addStringOption((o) =>
        o.setName('current_night').setDescription('Override current night label').setRequired(false),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('test-passage')
      .setDescription('Staff test: post a passage-of-time message in #bot-testing (no role tags)')
      .addStringOption((o) =>
        o
          .setName('event')
          .setDescription('Message variant to post')
          .setRequired(true)
          .addChoices(
            { name: 'Sunrise', value: 'sunrise' },
            { name: 'Sunset', value: 'sunset' },
            { name: 'Downtime', value: 'downtime' },
          ),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('sync-cubby-access')
      .setDescription('Staff tool: grant bot permissions on all Character Cubbies channels')
      .addBooleanOption((o) =>
        o
          .setName('dry_run')
          .setDescription('Preview changes only (default: true)')
          .setRequired(false),
      ),
  );

export const name = 'xp';

async function suggestCubbyNames(
  interaction: ChatInputCommandInteraction,
  requestedName: string,
): Promise<string[]> {
  const guildId = interaction.guildId;
  if (!guildId) {
    return [];
  }
  const guild = await interaction.client.guilds.fetch(guildId).catch(() => null);
  if (!guild) {
    return [];
  }
  const normalizedRequested = normalizeChannelName(requestedName);
  const channels = await guild.channels.fetch();
  const names = Array.from(channels.values())
    .filter((ch): ch is NonNullable<typeof ch> => !!ch)
    .filter((ch) => ch.type === ChannelType.GuildText)
    .map((ch) => ch.name);
  const ranked = names
    .map((name) => ({
      name,
      normalized: normalizeChannelName(name),
    }))
    .filter((item) => item.normalized.includes(normalizedRequested) || normalizedRequested.includes(item.normalized))
    .slice(0, 8)
    .map((item) => item.name);
  return ranked;
}

export async function autocomplete(interaction: AutocompleteInteraction, { adapter }: CommandContext) {
  const option = interaction.options.getFocused(true);
  const sub = interaction.options.getSubcommand(false) ?? '';
  const supportsCharacterAutocomplete = new Set(['submit', 'summary', 'claim', 'spend', 'test-reminder']);
  const supportsPeriodAutocomplete = new Set(['submit', 'claim']);
  const isCharacterLookup = supportsCharacterAutocomplete.has(sub) && option.name === 'character';
  const isPeriodLookup = supportsPeriodAutocomplete.has(sub) && option.name === 'play_period';
  if (!isCharacterLookup && !isPeriodLookup) {
    await interaction.respond([]);
    return;
  }

  try {
    const requester = {
      requesterDiscordId: interaction.user.id,
      requesterDiscordName: interaction.user.username,
      testMode: interaction.options.getBoolean('test') ?? false,
      testAsDiscordId: interaction.options.getString('test_as_discord_id') ?? undefined,
    };
    const query = String(option.value ?? '').trim().toLowerCase();
    const context = await adapter.getClaimContext(requester);
    const values = isCharacterLookup ? context.activeCharacters : context.openPeriods;

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
  const requester = {
    requesterDiscordId: interaction.user.id,
    requesterDiscordName: interaction.user.username,
    testMode: interaction.options.getBoolean('test') ?? false,
    testAsDiscordId: interaction.options.getString('test_as_discord_id') ?? undefined,
  };
  const meta = {
    interactionId: interaction.id,
    userId: interaction.user?.id,
    guildId: interaction.guildId,
    subcommand: sub,
  };

  if (sub === 'submit') {
    await interaction.reply({
      content: `XP claims are now submitted through the player portal — the bot wizard is temporarily offline.\n👉 ${config.playerWebUrl}`,
      ephemeral: true,
    });
    return;
  }

  if (sub === 'summary') {
    const character = interaction.options.getString('character', true);
    logEvent('info', 'xp_summary_start', { ...meta, character });
    const summary = await adapter.getSummary(character, requester);
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
    await interaction.reply({
      content: `XP claims are now submitted through the player portal — the bot wizard is temporarily offline.\n👉 ${config.playerWebUrl}`,
      ephemeral: true,
    });
    return;
  }

  if (sub === 'spend') {
    await interaction.reply({
      content: `XP spends are now submitted through the player portal — the bot wizard is temporarily offline.\n👉 ${config.playerWebUrl}`,
      ephemeral: true,
    });
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

  if (sub === 'help') {
    const lines = [
      '**XP Quick Help**',
      '- `/xp submit`: guided XP claim wizard (recommended)',
      '- `/xp claim`: quick claim (1-6 category/link pairs in one submission)',
      '- `/xp spend`: submit an XP spend request',
      '- `/xp summary`: show your character XP totals',
      '- `/xp spend-cost`: preview spend XP cost',
      '',
      `Web player interface: ${config.playerWebUrl}`,
    ];
    if (config.playerGuideUrl) {
      lines.push(`Full player guide: ${config.playerGuideUrl}`);
    }
    await interaction.reply({ content: lines.join('\n'), ephemeral: true });
    return;
  }

  if (sub === 'test-reminder') {
    if (!config.testerDiscordIds.has(interaction.user.id)) {
      await interaction.reply({
        content: 'This test command is restricted. Add your Discord ID to BOT_TESTER_IDS.',
        ephemeral: true,
      });
      return;
    }

    const targetUser = interaction.options.getUser('target_user') ?? interaction.user;
    const currentNight = interaction.options.getString('current_night') ?? 'Night TEST';
    const character = interaction.options.getString('character', true);
    const guildId = interaction.guildId ?? config.claimReminderGuildId;
    if (!guildId) {
      await interaction.reply({ content: 'No guild available for cubby matching.', ephemeral: true });
      return;
    }
    const guild = await interaction.client.guilds.fetch(guildId).catch(() => null);
    if (!guild) {
      await interaction.reply({ content: 'Configured guild was not found.', ephemeral: true });
      return;
    }
    const channel = await findCubbyChannel(guild, character);
    if (!channel) {
      const normalized = normalizeChannelName(character);
      const suggestions = await suggestCubbyNames(interaction, character);
      const hint = suggestions.length > 0 ? `\nClosest matches: ${suggestions.join(', ')}` : '';
      await interaction.reply({
        content: `No cubby channel matched character name "${character}" (normalized: "${normalized}").${hint}`,
        ephemeral: true,
      });
      return;
    }
    const row = buildClaimReminderActionRow(targetUser.id);
    try {
      await channel.send({
        content: buildClaimReminderText(currentNight, character, targetUser.id),
        components: [row],
      });
    } catch (error) {
      await interaction.reply({
        content:
          'I found the cubby, but I cannot post there (Discord Missing Access). Grant the bot View Channel + Send Messages in that cubby.',
        ephemeral: true,
      });
      logEvent('warn', 'xp_test_reminder_send_failed', {
        interactionId: interaction.id,
        userId: interaction.user.id,
        guildId: interaction.guildId,
        channelId: channel.id,
        error: errorToMessage(error),
      });
      return;
    }

    await interaction.reply({
      content: `Posted test reminder in <#${channel.id}> for <@${targetUser.id}>.`,
      ephemeral: true,
    });
    return;
  }

  if (sub === 'test-passage') {
    if (!config.testerDiscordIds.has(interaction.user.id)) {
      await interaction.reply({
        content: 'This test command is restricted. Add your Discord ID to BOT_TESTER_IDS.',
        ephemeral: true,
      });
      return;
    }
    const guildId = interaction.guildId ?? config.passageOfTimeGuildId;
    if (!guildId) {
      await interaction.reply({ content: 'No guild available for passage test.', ephemeral: true });
      return;
    }
    const guild = await interaction.client.guilds.fetch(guildId).catch(() => null);
    if (!guild) {
      await interaction.reply({ content: 'Configured guild was not found.', ephemeral: true });
      return;
    }
    const channels = await guild.channels.fetch();
    const target = channels.find((ch) => ch && ch.type === ChannelType.GuildText && ch.name === 'bot-testing');
    if (!target || target.type !== ChannelType.GuildText) {
      await interaction.reply({
        content: 'Could not find #bot-testing text channel in this guild.',
        ephemeral: true,
      });
      return;
    }
    const eventName = interaction.options.getString('event', true) as 'sunrise' | 'sunset' | 'downtime';
    try {
      await target.send({ content: getPassageMessage(eventName) });
    } catch (error) {
      await interaction.reply({
        content:
          'I found #bot-testing, but I cannot post there (Discord Missing Access). Grant the bot View Channel + Send Messages in #bot-testing.',
        ephemeral: true,
      });
      logEvent('warn', 'xp_test_passage_send_failed', {
        interactionId: interaction.id,
        userId: interaction.user.id,
        guildId: interaction.guildId,
        channelId: target.id,
        error: errorToMessage(error),
      });
      return;
    }
    await interaction.reply({
      content: `Posted ${eventName} passage message in <#${target.id}> (no role tags).`,
      ephemeral: true,
    });
    return;
  }

  if (sub === 'sync-cubby-access') {
    if (!config.testerDiscordIds.has(interaction.user.id)) {
      await interaction.reply({
        content: 'This admin command is restricted. Add your Discord ID to BOT_TESTER_IDS.',
        ephemeral: true,
      });
      return;
    }
    await interaction.deferReply({ ephemeral: true });

    const dryRun = interaction.options.getBoolean('dry_run') ?? true;
    const guildId = interaction.guildId ?? config.claimReminderGuildId ?? config.passageOfTimeGuildId;
    if (!guildId) {
      await interaction.editReply('No guild context is available for cubby sync.');
      return;
    }

    const guild = await interaction.client.guilds.fetch(guildId).catch(() => null);
    if (!guild) {
      await interaction.editReply('Configured guild was not found.');
      return;
    }
    const me = await guild.members.fetchMe().catch(() => null);
    if (!me) {
      await interaction.editReply('Unable to resolve bot membership in this guild.');
      return;
    }

    const canManageChannels = me.permissions.has(PermissionsBitField.Flags.ManageChannels);
    const canManageRoles = me.permissions.has(PermissionsBitField.Flags.ManageRoles);
    if (!canManageChannels && !canManageRoles) {
      await interaction.editReply(
        'Bot lacks permission to update channel overwrites. Grant Manage Channels (or Manage Roles) and retry.',
      );
      return;
    }

    const allChannels = await guild.channels.fetch();
    const categories = Array.from(allChannels.values())
      .filter((ch): ch is CategoryChannel => !!ch && ch.type === ChannelType.GuildCategory)
      .filter((ch) => ch.name.toLowerCase().includes('character cubbies'));

    if (categories.length === 0) {
      await interaction.editReply('No categories matching "Character Cubbies" were found.');
      return;
    }

    const textChannels = Array.from(allChannels.values())
      .filter((ch): ch is TextChannel => !!ch && ch.type === ChannelType.GuildText)
      .filter((ch) => !!ch.parentId && categories.some((cat) => cat.id === ch.parentId));

    const permissionPatch = {
      ViewChannel: true,
      SendMessages: true,
      ReadMessageHistory: true,
      UseApplicationCommands: true,
      SendMessagesInThreads: true,
    } as const;

    let updated = 0;
    let failed = 0;
    const failures: string[] = [];

    for (const category of categories) {
      try {
        if (!dryRun) {
          await category.permissionOverwrites.edit(me.id, permissionPatch);
        }
        updated += 1;
      } catch (error) {
        failed += 1;
        failures.push(`Category ${category.name}: ${errorToMessage(error)}`);
      }
    }

    for (const channel of textChannels) {
      try {
        if (!dryRun) {
          await channel.permissionOverwrites.edit(me.id, permissionPatch);
        }
        updated += 1;
      } catch (error) {
        failed += 1;
        failures.push(`#${channel.name}: ${errorToMessage(error)}`);
      }
    }

    const lines = [
      `Mode: ${dryRun ? 'dry-run' : 'apply'}`,
      `Categories matched: ${categories.length}`,
      `Cubby text channels matched: ${textChannels.length}`,
      `Targets processed: ${categories.length + textChannels.length}`,
      `Successful: ${updated}`,
      `Failed: ${failed}`,
    ];
    if (failures.length > 0) {
      lines.push('', 'Failures (first 10):');
      lines.push(...failures.slice(0, 10).map((msg) => `- ${msg}`));
    }

    logEvent('info', 'xp_sync_cubby_access', {
      interactionId: interaction.id,
      userId: interaction.user.id,
      guildId: guild.id,
      dryRun,
      categories: categories.length,
      channels: textChannels.length,
      updated,
      failed,
    });
    await interaction.editReply(lines.join('\n'));
    return;
  }

  if (sub === 'health') {
    const startedAt = Date.now();
    await interaction.deferReply({ ephemeral: true });
    try {
      const report = await adapter.getHealthReport(requester);
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
