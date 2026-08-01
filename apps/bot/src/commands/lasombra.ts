import {
  ActionRowBuilder,
  AutocompleteInteraction,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChannelType,
  ChatInputCommandInteraction,
  GuildChannel,
  ModalBuilder,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import type { CommandContext } from '../discord';
import { config } from '../config';
import { liveConfig } from '../liveConfig';
import { buildCubbyChannelMap, getChannelsInCubbyCategories, normalizeChannelName } from '../services/cubbyChannels';
import { CubbySyncWorker } from '../services/cubbySyncWorker';
import { errorToMessage, logEvent } from '../logger';
import { startApproveWizard, findPlayerInChannel, findLatestPdf } from '../approveWizard';
import { runActivityBackfill, cancelActivityBackfill, isActivityBackfillRunning } from '../services/activityBackfillScanner';
import type { ActivityCategory } from '../services/discordActivityCategories';
import { startEditWizard } from '../editWizard';
import { startPermissionsAudit, startPermissionsApply, startPermissionsRollback } from '../permissionsWizard';

export const name = config.lasombraCommandName;

export const data = new SlashCommandBuilder()
  .setName(config.lasombraCommandName)
  .setDescription('Lasombra utility commands')
  .addSubcommand((s) =>
    s
      .setName('approve')
      .setDescription('Approve a character ticket: move to cubby, assign roles, create roster entry, post sheet'),
  )
  .addSubcommand((s) =>
    s
      .setName('update')
      .setDescription('Post a sheet update to #player-character-sheets. Run in the character\'s channel.'),
  )
  .addSubcommand((s) =>
    s
      .setName('retainer-update')
      .setDescription('Post a retainer sheet update to #player-retainer-sheets. Run in the character\'s channel.'),
  )
  .addSubcommand((s) =>
    s
      .setName('edit')
      .setDescription('Edit a character\'s clan, sect, or age (and move cubby if age changes). Run in their channel.'),
  )
  .addSubcommand((s) =>
    s
      .setName('delete')
      .setDescription('Hard-delete a character with no history (staff only). Use retired/deceased for real characters.')
      .addStringOption((o) =>
        o
          .setName('character')
          .setDescription('Character name to delete')
          .setRequired(true)
          .setAutocomplete(true),
      ),
  )
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
  )
  .addSubcommand((s) =>
    s
      .setName('sync-cubbies')
      .setDescription('Scan cubby channels, backfill channel IDs, and retire characters whose cubby is gone (staff only)'),
  )
  .addSubcommand((s) =>
    s
      .setName('scan-activity')
      .setDescription('Backfill Discord post counts for IC nights (staff only)')
      .addIntegerOption((o) =>
        o.setName('nights').setDescription('Number of recent IC nights to scan (default: 2, max: 50)').setMinValue(1).setMaxValue(50),
      )
      .addStringOption((o) =>
        o.setName('since').setDescription('Start date YYYY-MM-DD — overrides nights'),
      )
      .addStringOption((o) =>
        o.setName('until').setDescription('End date YYYY-MM-DD — defaults to today'),
      )
      .addStringOption((o) =>
        o.setName('category').setDescription('Scan only one category (default: all)')
          .addChoices(
            { name: 'IC', value: 'ic' },
            { name: 'OOC', value: 'ooc' },
            { name: 'Rolls', value: 'rolls' },
            { name: 'Cubby', value: 'cubby' },
          ),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('cancel-scan')
      .setDescription('Cancel a running scan-activity backfill (staff only)'),
  )
  .addSubcommand((s) =>
    s
      .setName('coterie-create')
      .setDescription('Create a coterie on the site and post the setup link here (staff only)')
      .addStringOption((o) =>
        o
          .setName('name')
          .setDescription('Exact coterie name as entered on the site')
          .setRequired(true),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('blank')
      .setDescription('Blank a tracked background for one night')
      .addStringOption((o) =>
        o
          .setName('background')
          .setDescription('Tracked background name')
          .setRequired(true)
          .setAutocomplete(true),
      )
      .addIntegerOption((o) =>
        o
          .setName('dots')
          .setDescription('How many dots to blank')
          .setRequired(true)
          .setMinValue(1)
          .setMaxValue(10),
      )
      .addStringOption((o) =>
        o
          .setName('character')
          .setDescription('Character name (staff may target any character)')
          .setRequired(false)
          .setAutocomplete(true),
      ),
  )
  .addSubcommandGroup((g) =>
    g
      .setName('permissions')
      .setDescription('Audit and remediate Discord role/channel permission hygiene')
      .addSubcommand((s) =>
        s.setName('audit').setDescription('Report-only scan for mention/overwrite/visibility issues (staff only)'),
      )
      .addSubcommand((s) =>
        s
          .setName('apply')
          .setDescription('Fix mention + overwrite issues, snapshotting first (Administrator-role staff only)'),
      )
      .addSubcommand((s) =>
        s
          .setName('rollback')
          .setDescription('Restore a prior permissions snapshot (Administrator-role staff only)'),
      ),
  );

const BROADCAST_MODAL_ID = 'lasombra:broadcast:modal';
const UPDATE_MODAL_ID = 'lasombra:update:modal';
const RETAINER_UPDATE_MODAL_ID = 'lasombra:retainer-update:modal';
export const DELETE_CONFIRM_ID = 'lasombra:delete:confirm';
export const DELETE_CANCEL_ID = 'lasombra:delete:cancel';

// Keyed by staffUserId → channel ID where /lasombra update was run
const pendingUpdates = new Map<string, string>();

// Keyed by staffUserId → channel ID where /lasombra retainer-update was run
const pendingRetainerUpdates = new Map<string, string>();

// Keyed by confirmation message ID → character name pending deletion
const pendingDeletes = new Map<string, string>();

type PendingBroadcast = {
  target: string;
  mentionKindred: boolean;
  mentionGhouls: boolean;
  mentionMortals: boolean;
  mentionCharDiscordId: string | null;
};

// Keyed by user ID — a user can only have one modal open at a time.
const pendingBroadcasts = new Map<string, PendingBroadcast>();

export async function execute(interaction: ChatInputCommandInteraction, ctx: CommandContext): Promise<void> {
  const sub = interaction.options.getSubcommand();

  if (interaction.options.getSubcommandGroup(false) === 'permissions') {
    if (sub === 'audit') {
      await startPermissionsAudit(interaction, ctx);
      return;
    }
    if (sub === 'apply') {
      await startPermissionsApply(interaction, ctx);
      return;
    }
    if (sub === 'rollback') {
      await startPermissionsRollback(interaction, ctx);
      return;
    }
  }

  if (sub === 'approve') {
    await startApproveWizard(interaction, ctx);
    return;
  }

  if (sub === 'update') {
    if (!config.testerDiscordIds.has(interaction.user.id)) {
      await interaction.reply({ content: 'This command is restricted to staff.', ephemeral: true });
      return;
    }
    if (!interaction.channel || interaction.channel.type !== ChannelType.GuildText) {
      await interaction.reply({ content: 'Run this inside the character\'s channel.', ephemeral: true });
      return;
    }
    pendingUpdates.set(interaction.user.id, interaction.channel.id);

    const modal = new ModalBuilder().setCustomId(UPDATE_MODAL_ID).setTitle('Sheet Update');
    const updateInput = new TextInputBuilder()
      .setCustomId('update_message')
      .setLabel('What is the update?')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('e.g. 15 xp spent Presence 3')
      .setMaxLength(1000)
      .setRequired(true);
    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(updateInput));
    await interaction.showModal(modal);
    return;
  }

  if (sub === 'retainer-update') {
    if (!config.testerDiscordIds.has(interaction.user.id)) {
      await interaction.reply({ content: 'This command is restricted to staff.', ephemeral: true });
      return;
    }
    if (!interaction.channel || interaction.channel.type !== ChannelType.GuildText) {
      await interaction.reply({ content: 'Run this inside the character\'s channel.', ephemeral: true });
      return;
    }
    pendingRetainerUpdates.set(interaction.user.id, interaction.channel.id);

    const modal = new ModalBuilder().setCustomId(RETAINER_UPDATE_MODAL_ID).setTitle('Retainer Sheet Update');
    const updateInput = new TextInputBuilder()
      .setCustomId('update_message')
      .setLabel('What is the update?')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('e.g. new retainer sheet uploaded')
      .setMaxLength(1000)
      .setRequired(true);
    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(updateInput));
    await interaction.showModal(modal);
    return;
  }

  if (sub === 'edit') {
    await startEditWizard(interaction, ctx);
    return;
  }

  if (sub === 'delete') {
    if (!config.testerDiscordIds.has(interaction.user.id)) {
      await interaction.reply({ content: 'This command is restricted to staff.', ephemeral: true });
      return;
    }
    const characterName = interaction.options.getString('character', true).trim();
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(DELETE_CONFIRM_ID)
        .setLabel('Yes, delete')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(DELETE_CANCEL_ID)
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Secondary),
    );
    await interaction.reply({
      content: `⚠️ Delete **${characterName}** from the roster? This is permanent and only works if they have no XP history.`,
      components: [row],
    });
    const replyMsg = await interaction.fetchReply();
    pendingDeletes.set(replyMsg.id, characterName);
    return;
  }

  if (sub === 'sync-cubbies') {
    if (!config.testerDiscordIds.has(interaction.user.id)) {
      await interaction.reply({ content: 'This command is restricted to staff.', ephemeral: true });
      return;
    }
    await interaction.deferReply({ ephemeral: true });
    try {
      const worker = new CubbySyncWorker(ctx.adapter, ctx.client, {
        enabled: true,
        intervalMs: config.cubbySyncIntervalMs,
        guildId: config.cubbySyncGuildId,
        staffChannelId: config.cubbySyncStaffChannelId,
        retiredCategoryId: config.cubbyRetiredCategoryId,
      });
      const report = await worker.runSync();
      const lines: string[] = [
        `**Cubby Sync Complete** — scanned ${report.scannedCharacters} character(s)`,
      ];
      if (report.backfilled.length > 0) {
        lines.push(`\nChannel ID backfilled (${report.backfilled.length}): ${report.backfilled.map((b) => b.name).join(', ')}`);
      }
      if (report.retired.length > 0) {
        lines.push(`\nRetired (${report.retired.length}): ${report.retired.map((r) => `${r.name} (${r.reason})`).join(', ')}`);
      }
      if (report.errors.length > 0) {
        lines.push(`\nErrors (${report.errors.length}): ${report.errors.map((e) => `${e.name}: ${e.error}`).join(', ')}`);
      }
      if (report.backfilled.length === 0 && report.retired.length === 0 && report.errors.length === 0) {
        lines.push('\nNo changes — all cubbies are in order.');
      }
      await interaction.editReply({ content: lines.join('\n').slice(0, 2000) });
    } catch (err) {
      await interaction.editReply({ content: `Sync failed: ${errorToMessage(err)}` });
    }
    return;
  }

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
      .setMaxLength(2000)
      .setRequired(true);

    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(messageInput));

    await interaction.showModal(modal);
    return;
  }

  if (sub === 'blank') {
    const isStaff = config.testerDiscordIds.has(interaction.user.id);
    const requestedCharacter = interaction.options.getString('character')?.trim() ?? '';
    const backgroundName = interaction.options.getString('background', true).trim();
    const dots = interaction.options.getInteger('dots', true);

    const roster = await ctx.adapter.getActiveRosterWithIds();
    const allNames = new Set(roster.characters.map((c) => c.name.toLowerCase()));
    const owned = roster.characters.filter((c) => c.discordId === interaction.user.id).map((c) => c.name);

    let characterName = '';
    if (requestedCharacter) {
      if (!allNames.has(requestedCharacter.toLowerCase())) {
        await interaction.reply({ content: `Unknown character: ${requestedCharacter}`, ephemeral: true });
        return;
      }
      if (!isStaff && !owned.some((n) => n.toLowerCase() === requestedCharacter.toLowerCase())) {
        await interaction.reply({
          content: 'You can only blank backgrounds for your own linked character.',
          ephemeral: true,
        });
        return;
      }
      characterName = roster.characters.find((c) => c.name.toLowerCase() === requestedCharacter.toLowerCase())?.name ?? requestedCharacter;
    } else {
      if (owned.length === 1) {
        characterName = owned[0];
      } else if (owned.length > 1) {
        await interaction.reply({
          content: 'You have multiple linked characters. Please provide the `character` option.',
          ephemeral: true,
        });
        return;
      } else {
        await interaction.reply({
          content: 'No linked active character found. Use the web player page to link first.',
          ephemeral: true,
        });
        return;
      }
    }

    const requester = {
      requesterDiscordId: interaction.user.id,
      requesterDiscordName: interaction.user.username,
    };

    const result = await ctx.adapter.blankBackground(requester, {
      characterName,
      backgroundName,
      dots,
    });
    if (!result.ok || !result.result) {
      await interaction.reply({
        content: `Could not blank background: ${result.message}`,
        ephemeral: true,
      });
      return;
    }

    await interaction.reply({
      content: [
        `Blanked **${result.result.dots_blanked_now}** dot(s) of **${result.result.background_name}** for **${result.result.character_name}**.`,
        `Available now: **${result.result.dots_available}**/${result.result.dots_total}.`,
        `Release: **Night ${result.result.release_night_number}**${result.currentNight ? ` (current: ${result.currentNight})` : ''}.`,
      ].join('\n'),
      ephemeral: true,
    });
    return;
  }

  if (sub === 'scan-activity') {
    if (!config.testerDiscordIds.has(interaction.user.id)) {
      await interaction.reply({ content: 'This command is restricted to staff.', ephemeral: true });
      return;
    }
    if (!interaction.guildId || !interaction.guild) {
      await interaction.reply({ content: 'Must be run in the server.', ephemeral: true });
      return;
    }
    if (isActivityBackfillRunning()) {
      await interaction.reply({ content: 'A scan is already running. Use `/lasombra cancel-scan` to stop it first.', ephemeral: true });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    const nightsOpt = interaction.options.getInteger('nights') ?? 2;
    const sinceOpt = (interaction.options.getString('since') ?? '').trim();
    const untilOpt = (interaction.options.getString('until') ?? '').trim();

    const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
    if (sinceOpt && !ISO_DATE.test(sinceOpt)) {
      await interaction.editReply('Invalid `since` date — use YYYY-MM-DD format.');
      return;
    }
    if (untilOpt && !ISO_DATE.test(untilOpt)) {
      await interaction.editReply('Invalid `until` date — use YYYY-MM-DD format.');
      return;
    }

    let sinceDate: string;
    let untilDate: string;
    let scanLabel: string;

    if (sinceOpt) {
      sinceDate = sinceOpt;
      untilDate = untilOpt || new Date().toISOString().slice(0, 10);
      scanLabel = `${sinceDate} → ${untilDate}`;
    } else {
      let periods: Array<{ label: string; startDate: string; endDate: string }> = [];
      try {
        periods = await ctx.adapter.getRecentPeriods(nightsOpt);
      } catch (err) {
        await interaction.editReply(`Could not fetch play periods: ${errorToMessage(err)}`);
        return;
      }

      if (periods.length === 0 || !periods.some(p => p.startDate)) {
        await interaction.editReply('No play periods with dates found — cannot determine scan range.');
        return;
      }

      const startDates = periods.map(p => p.startDate).filter(Boolean);
      const endDates = periods.map(p => p.endDate).filter(Boolean);
      sinceDate = startDates.sort()[0];
      untilDate = untilOpt || endDates.sort().reverse()[0] || new Date().toISOString().slice(0, 10);
      scanLabel = periods.map(p => p.label).join(', ');
    }

    const categoryOpt = (interaction.options.getString('category') ?? '') as ActivityCategory | '';
    const categoryLabel = categoryOpt ? ` [${categoryOpt.toUpperCase()} only]` : '';

    await interaction.editReply(`Scanning channels **(${scanLabel})**${categoryLabel}…\nThis may take a few minutes.`);

    try {
      const result = await runActivityBackfill(
        interaction.guild,
        ctx.adapter,
        sinceDate,
        untilDate,
        undefined,
        categoryOpt || undefined,
      );
      if (result.cancelled) {
        await interaction.editReply(
          `Scan **cancelled** for **(${scanLabel})**${categoryLabel}.\n` +
          `Channels scanned before cancel: **${result.channelsScanned}** | Messages counted: **${result.messagesScanned}** | Unique users: **${result.usersFound}**\n` +
          `Partial data has been saved.`,
        );
      } else {
        await interaction.editReply(
          `Scan complete for **(${scanLabel})**${categoryLabel}.\n` +
          `Channels scanned: **${result.channelsScanned}** | Messages counted: **${result.messagesScanned}** | Unique users: **${result.usersFound}**\n` +
          `Results are now visible on the Reports page.`,
        );
      }
    } catch (err) {
      await interaction.editReply(`Scan failed: ${errorToMessage(err)}`);
    }
    return;
  }

  if (sub === 'coterie-create') {
    if (!config.testerDiscordIds.has(interaction.user.id)) {
      await interaction.reply({ content: 'This command is restricted to staff.', ephemeral: true });
      return;
    }
    const coterieName = interaction.options.getString('name', true).trim();
    const channelId = interaction.channelId;
    await interaction.deferReply();

    let result: Awaited<ReturnType<typeof ctx.adapter.activateCoterie>>;
    try {
      result = await ctx.adapter.activateCoterie(coterieName, channelId);
    } catch (err) {
      await interaction.editReply({
        content: `Failed to activate coterie: ${err instanceof Error ? err.message : String(err)}`,
      });
      return;
    }

    const { coterie } = result;
    const baseUrl = config.webAppBaseUrl.replace(/\/+$/, '');
    const coterieUrl = `${baseUrl}/coteries/${coterie.slug}`;
    const memberMentions = coterie.members
      .filter((m) => m.player_discord_id)
      .map((m) => `<@${m.player_discord_id}>`)
      .join(' ');
    const totalDots = coterie.free_pool_total;
    const memberCount = coterie.members.length;

    await interaction.editReply({
      embeds: [
        {
          title: `🏰 ${coterie.name}`,
          description: [
            `**${memberCount} member${memberCount !== 1 ? 's' : ''}** · **${totalDots} free dot${totalDots !== 1 ? 's' : ''}** in the pool`,
            '',
            coterie.members.map((m) => `• ${m.character_name} (${m.free_dots} free dot${m.free_dots !== 1 ? 's' : ''})`).join('\n'),
            '',
            `[View & set up your coterie](${coterieUrl})`,
          ].join('\n'),
          color: 0x8b0000,
          url: coterieUrl,
        },
      ],
      content: memberMentions ? `${memberMentions} — your coterie is ready!` : undefined,
    });
    return;
  }

  if (sub === 'cancel-scan') {
    if (!config.testerDiscordIds.has(interaction.user.id)) {
      await interaction.reply({ content: 'This command is restricted to staff.', ephemeral: true });
      return;
    }
    const wasRunning = cancelActivityBackfill();
    if (wasRunning) {
      await interaction.reply({
        content: 'Cancel signal sent. The scan will stop after the current channel finishes and flush any partial data.',
        ephemeral: true,
      });
    } else {
      await interaction.reply({
        content: 'No scan is currently running.',
        ephemeral: true,
      });
    }
    return;
  }
}

export async function autocomplete(interaction: AutocompleteInteraction, ctx: CommandContext): Promise<void> {
  const isStaff = config.testerDiscordIds.has(interaction.user.id);
  const sub = interaction.options.getSubcommand(false) ?? '';
  const focused = interaction.options.getFocused(true);
  const query = focused.value.toLowerCase();

  if (focused.name === 'target') {
    if (!isStaff || sub !== 'broadcast') {
      await interaction.respond([]);
      return;
    }
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
    if (!isStaff || sub !== 'broadcast') {
      await interaction.respond([]);
      return;
    }
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

  if (sub === 'blank' && focused.name === 'character') {
    try {
      const roster = await ctx.adapter.getActiveRosterWithIds();
      const candidates = isStaff
        ? roster.characters.map((c) => c.name)
        : roster.characters.filter((c) => c.discordId === interaction.user.id).map((c) => c.name);
      const choices = candidates
        .filter((name) => name.toLowerCase().includes(query))
        .slice(0, 25)
        .map((name) => ({ name, value: name }));
      await interaction.respond(choices);
    } catch {
      await interaction.respond([]);
    }
    return;
  }

  if (sub === 'blank' && focused.name === 'background') {
    try {
      const roster = await ctx.adapter.getActiveRosterWithIds();
      const requestedCharacter = interaction.options.getString('character')?.trim();
      const owned = roster.characters.filter((c) => c.discordId === interaction.user.id).map((c) => c.name);
      let characterName = requestedCharacter || '';
      if (!characterName) {
        if (owned.length === 1) {
          characterName = owned[0];
        } else {
          await interaction.respond([]);
          return;
        }
      }
      if (!isStaff && !owned.some((name) => name.toLowerCase() === characterName.toLowerCase())) {
        await interaction.respond([]);
        return;
      }

      const requester = {
        requesterDiscordId: interaction.user.id,
        requesterDiscordName: interaction.user.username,
      };
      const status = await ctx.adapter.getBackgroundStatus(characterName, requester);
      if (!status) {
        await interaction.respond([]);
        return;
      }
      const choices = status.backgrounds
        .map((bg) => bg.background_name)
        .filter((name) => name.toLowerCase().includes(query))
        .slice(0, 25)
        .map((name) => ({ name, value: name }));
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

  const fullMessage = mentionParts.length > 0
    ? `${mentionParts.join(' ')}\n\n${messageBody}`
    : messageBody;

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

// ── Update modal handlers ───────────────────────────────────────────────────

/**
 * The player who dropped the PDF in their ticket channel may be on Nitro,
 * which raises their personal client upload ceiling (currently 500MB)
 * independent of the guild's boost tier. The bot re-uploading that same
 * file is bound by the guild's own boost-tier cap instead — bots don't
 * inherit a user's Nitro allowance, and (per Discord's own API-docs tracker,
 * discord/discord-api-docs#6058) bot/webhook uploads may not even get the
 * newer default bump that Discord client uploads do. So a file a player
 * uploaded natively without issue can still bounce when the bot tries to
 * re-post it. Discord rejects it at the HTTP layer before it ever becomes a
 * coded API error, so this is a message-text match rather than a discord.js
 * error code check.
 */
export function isRequestEntityTooLarge(err: unknown): boolean {
  return err instanceof Error && /request entity too large/i.test(err.message);
}

type SheetUpdateFlavor = {
  /** e.g. 'update' — used in the "session expired" retry hint. */
  subcommandName: string;
  targetChannelId: string;
  targetChannelEnvVarName: string;
  /** e.g. '#player-character-sheets' — used in error/confirmation text. */
  targetChannelLabel: string;
  /** e.g. 'Character sheet uploaded.' */
  publicConfirmMessage: string;
  logEventName: string;
};

async function handleSheetUpdateModal(
  interaction: import('discord.js').ModalSubmitInteraction,
  pendingChannels: Map<string, string>,
  flavor: SheetUpdateFlavor,
): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const channelId = pendingChannels.get(interaction.user.id);
  pendingChannels.delete(interaction.user.id);

  if (!channelId) {
    await interaction.editReply(`Session expired — run \`/${config.lasombraCommandName} ${flavor.subcommandName}\` again.`);
    return;
  }

  const updateMessage = interaction.fields.getTextInputValue('update_message').trim();

  const guild = interaction.guild;
  if (!guild) {
    await interaction.editReply('Could not resolve server. Please try again.');
    return;
  }

  let channel: import('discord.js').TextChannel;
  try {
    const fetched = await guild.channels.fetch(channelId);
    if (!fetched || !fetched.isTextBased() || !('messages' in fetched)) {
      await interaction.editReply('Could not find the original channel.');
      return;
    }
    channel = fetched as import('discord.js').TextChannel;
  } catch (err) {
    await interaction.editReply(`Could not fetch channel: ${errorToMessage(err)}`);
    return;
  }

  const characterName = channel.name;
  const [playerId, pdf] = await Promise.all([
    findPlayerInChannel(channel, config.testerDiscordIds),
    findLatestPdf(channel),
  ]);

  const sheetsChannelId = flavor.targetChannelId;
  if (!sheetsChannelId) {
    await interaction.editReply(`\`${flavor.targetChannelEnvVarName}\` is not configured.`);
    return;
  }

  let attachmentTooLarge = false;
  try {
    const sheetsChannel = await guild.channels.fetch(sheetsChannelId);
    if (!sheetsChannel || !sheetsChannel.isTextBased() || !('send' in sheetsChannel)) {
      await interaction.editReply(`${flavor.targetChannelLabel} channel not found or not sendable.`);
      return;
    }

    const playerMention = playerId ? `<@${playerId}>` : characterName;
    const content = `${playerMention} "${updateMessage}"`;

    // Download the PDF to a buffer before sending so the send() itself is
    // reliable. Using a CDN URL directly can trigger an AbortError mid-request
    // if the fetch is slow, leaving the message posted but the bot thinking it failed.
    let pdfBuffer: Buffer | null = null;
    if (pdf) {
      try {
        const res = await fetch(pdf.url);
        if (res.ok) pdfBuffer = Buffer.from(await res.arrayBuffer());
      } catch {
        // ignore — send without attachment below
      }
    }

    if (pdfBuffer && pdf) {
      try {
        await (sheetsChannel as import('discord.js').TextChannel).send({
          content,
          files: [{ attachment: pdfBuffer, name: pdf.name }],
        });
      } catch (err) {
        // Discord rejects the *entire* request (text + file together) if the
        // attachment exceeds this guild's upload cap (varies by boost tier,
        // and Discord doesn't expose the exact limit via the API) -- fall
        // back to posting the text confirmation alone rather than losing the
        // update entirely. attachmentTooLarge feeds the pdfNote below so the
        // requester knows the file needs sharing another way.
        if (!isRequestEntityTooLarge(err)) throw err;
        attachmentTooLarge = true;
        await (sheetsChannel as import('discord.js').TextChannel).send({ content });
      }
    } else {
      await (sheetsChannel as import('discord.js').TextChannel).send({ content });
    }
  } catch (err) {
    await interaction.editReply(`Failed to post to ${flavor.targetChannelLabel}: ${errorToMessage(err)}`);
    return;
  }

  logEvent('info', flavor.logEventName, {
    characterName,
    playerId,
    staffId: interaction.user.id,
    hasPdf: Boolean(pdf),
    attachmentTooLarge,
  });

  // Post public confirmation in the character's channel
  const publicConfirmMessage = attachmentTooLarge
    ? `${flavor.publicConfirmMessage} *(file too large to upload — shared as text only)*`
    : flavor.publicConfirmMessage;
  try {
    await channel.send({ content: publicConfirmMessage });
  } catch (err) {
    logEvent('warn', `${flavor.logEventName}_channel_confirm_failed`, { characterName, error: errorToMessage(err) });
  }

  const pdfNote = attachmentTooLarge
    ? ' *(PDF too large for this server to upload — share it manually)*'
    : pdf ? '' : ' *(no PDF found in channel)*';
  await interaction.editReply(`✅ Posted update for **${characterName}** to <#${sheetsChannelId}>${pdfNote}.`);
}

export async function handleUpdateModal(
  interaction: import('discord.js').ModalSubmitInteraction,
): Promise<boolean> {
  if (interaction.customId !== UPDATE_MODAL_ID) return false;
  await handleSheetUpdateModal(interaction, pendingUpdates, {
    subcommandName: 'update',
    targetChannelId: config.approvePlayerSheetsChannelId,
    targetChannelEnvVarName: 'APPROVE_PLAYER_SHEETS_CHANNEL_ID',
    targetChannelLabel: '#player-character-sheets',
    publicConfirmMessage: 'Character sheet uploaded.',
    logEventName: 'sheet_update_posted',
  });
  return true;
}

export async function handleRetainerUpdateModal(
  interaction: import('discord.js').ModalSubmitInteraction,
): Promise<boolean> {
  if (interaction.customId !== RETAINER_UPDATE_MODAL_ID) return false;
  await handleSheetUpdateModal(interaction, pendingRetainerUpdates, {
    subcommandName: 'retainer-update',
    targetChannelId: config.retainerSheetsChannelId,
    targetChannelEnvVarName: 'RETAINER_SHEETS_CHANNEL_ID',
    targetChannelLabel: '#player-retainer-sheets',
    publicConfirmMessage: 'Retainer sheet uploaded.',
    logEventName: 'retainer_sheet_update_posted',
  });
  return true;
}

// ── Delete confirmation button handler ─────────────────────────────────────

export function isDeleteButton(customId: string): boolean {
  return customId === DELETE_CONFIRM_ID || customId === DELETE_CANCEL_ID;
}

export async function handleDeleteButton(
  interaction: ButtonInteraction,
  ctx: CommandContext,
): Promise<boolean> {
  if (!isDeleteButton(interaction.customId)) return false;

  if (interaction.customId === DELETE_CANCEL_ID) {
    pendingDeletes.delete(interaction.message.id);
    await interaction.update({ content: 'Delete cancelled.', components: [] });
    return true;
  }

  const characterName = pendingDeletes.get(interaction.message.id);
  pendingDeletes.delete(interaction.message.id);

  if (!characterName) {
    await interaction.update({ content: `Session expired — run \`/${config.lasombraCommandName} delete\` again.`, components: [] });
    return true;
  }

  await interaction.deferUpdate();

  const result = await ctx.adapter.deleteCharacter(characterName, {
    requesterDiscordId: interaction.user.id,
    requesterDiscordName: interaction.user.username,
  });

  if (!result.ok) {
    const hint = result.hasHistory
      ? `\nUse \`/${config.lasombraCommandName} edit\` to mark them as retired or deceased instead.`
      : '';
    await interaction.editReply({ content: `⚠️ ${result.message}${hint}`, components: [] });
    return true;
  }

  logEvent('info', 'character_deleted', { characterName, staffId: interaction.user.id });

  // Delete the current channel if its name matches the character (ticket cleanup)
  const channel = interaction.channel;
  if (
    channel &&
    channel.type === ChannelType.GuildText &&
    channel.name === normalizeChannelName(characterName)
  ) {
    try {
      await (channel as GuildChannel).delete(`Character deleted: ${characterName}`);
      // Channel is gone — no editReply possible
      return true;
    } catch (err) {
      await interaction.editReply({
        content: `✅ **${characterName}** deleted from the roster.\n⚠️ Channel delete failed: ${errorToMessage(err)}`,
        components: [],
      });
      return true;
    }
  }

  await interaction.editReply({ content: `✅ **${characterName}** deleted from the roster.`, components: [] });
  return true;
}
