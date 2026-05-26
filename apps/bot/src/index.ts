import 'dotenv/config';
import { Client, GatewayIntentBits } from 'discord.js';
import { config } from './config';
import type { BotClient } from './discord';
import { initClientCommandCollection, registerCommands } from './registerCommands';
import { WebAppAdapter } from './services/adapter';
import { ReviewNotifier } from './services/reviewNotifier';
import { AutoPeriodCreator } from './services/autoPeriodCreator';
import { AutoPeriodCloser } from './services/autoPeriodCloser';
import { ClaimReminderService } from './services/claimReminderService';
import path from 'node:path';
import {
  PassageOfTimeService,
  PASSAGE_DOWNTIME_MESSAGE,
  PASSAGE_SUNRISE_MESSAGE,
  PASSAGE_SUNSET_MESSAGE,
} from './services/passageOfTimeService';
import { SheetsReconcileService } from './services/sheetsReconcileService';
import { BotLogForwarder } from './services/botLogForwarder';

const ASSETS_DIR = path.resolve(__dirname, '..', 'assets');
import { errorToMessage, logEvent } from './logger';
import { handleClaimReminderButton } from './claimReminderInteractions';
import {
  handleClaimWizardButton,
  handleClaimWizardModal,
  handleClaimWizardSelect,
} from './interactiveClaimWizard';
import { handleCombatParticipantSelect, handleCombatSetupModal, handleCombatButton, isCombatButton } from './combatSetupWizard';
import { handleBroadcastModal, handleDeleteButton, handleUpdateModal, isDeleteButton } from './commands/lasombra';
import {
  handleApproveWizardStringSelect,
  handleApproveWizardButton,
  handleApproveNameModal,
  isApproveWizardButton,
} from './approveWizard';
import {
  handleEditWizardStringSelect,
  handleEditWizardButton,
  isEditWizardButton,
  handleEditRenameModal,
} from './editWizard';
import { startCubbyChannelMonitor } from './services/cubbyChannelMonitor';
import { startCharacterTicketMonitor } from './services/characterTicketMonitor';
import { SubmissionNotifier } from './services/submissionNotifier';
import { CharacterSubmissionNotifier } from './services/characterSubmissionNotifier';
import {
  startHuntConsequenceMonitor,
  isHuntConsequenceButton,
  handleHuntConsequenceButton,
} from './services/huntConsequenceMonitor';
import { ConfigSyncWorker } from './services/configSyncWorker';
import { BotHeartbeatService } from './services/botHeartbeatService';
import { liveConfig } from './liveConfig';
import { BackgroundBlankReleaseService } from './services/backgroundBlankReleaseService';

// Seed liveConfig from .env values so services start with the correct initial state.
liveConfig.reviewNotifierEnabled = config.reviewNotifierEnabled;
liveConfig.submissionNotifierEnabled = config.submissionNotifierEnabled;
liveConfig.autoPeriodCreatorEnabled = config.autoPeriodCreatorEnabled;
liveConfig.autoPeriodCloserEnabled = config.autoPeriodCloserEnabled;
liveConfig.claimReminderEnabled = config.claimReminderEnabled;
liveConfig.passageOfTimeEnabled = config.passageOfTimeEnabled;
liveConfig.huntConsequenceEnabled = config.huntConsequenceEnabled;

const adapter = new WebAppAdapter(config.webAppBaseUrl, config.webAppApiToken, {
  readToken: config.webAppApiReadToken,
  writeToken: config.webAppApiWriteToken,
  requestTimeoutMs: config.requestTimeoutMs,
  claimContextCacheTtlMs: config.claimContextCacheTtlMs,
  claimContextStaleIfErrorMs: config.claimContextStaleIfErrorMs,
  claimContextMaxRetries: config.claimContextMaxRetries,
  claimContextRetryBaseMs: config.claimContextRetryBaseMs,
});

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
}) as BotClient;

initClientCommandCollection(client);

// Fetch DB-backed config overrides before constructing services so interval
// overrides set in the web UI take effect immediately on this startup.
async function applyStartupConfigOverrides(): Promise<void> {
  try {
    const cfg = await adapter.getBotConfig();
    if (cfg.passageOfTimeIntervalMs !== null) liveConfig.passageOfTimeIntervalMs = cfg.passageOfTimeIntervalMs;
    if (cfg.reviewNotifierIntervalMs !== null) liveConfig.reviewNotifierIntervalMs = cfg.reviewNotifierIntervalMs;
    if (cfg.submissionNotifierIntervalMs !== null) liveConfig.submissionNotifierIntervalMs = cfg.submissionNotifierIntervalMs;
    if (cfg.claimReminderIntervalMs !== null) liveConfig.claimReminderIntervalMs = cfg.claimReminderIntervalMs;
    if (cfg.announcementsChannelId) liveConfig.announcementsChannelId = cfg.announcementsChannelId;
    logEvent('info', 'startup_config_loaded', { liveConfig });
  } catch (err) {
    logEvent('warn', 'startup_config_fetch_failed', { error: errorToMessage(err) });
  }
}

void applyStartupConfigOverrides().then(() => {
  const reviewNotifier = new ReviewNotifier(client, adapter, {
    enabled: config.reviewNotifierEnabled,
    guildId: config.reviewNotifierGuildId,
    intervalMs: liveConfig.reviewNotifierIntervalMs ?? config.reviewNotifierIntervalMs,
    lookbackSeconds: config.reviewNotifierLookbackSeconds,
  });

  const autoPeriodCreator = new AutoPeriodCreator(adapter, {
    enabled: config.autoPeriodCreatorEnabled,
    intervalMs: config.autoPeriodCreatorIntervalMs,
  });

  const autoPeriodCloser = new AutoPeriodCloser(client, adapter, {
    enabled: config.autoPeriodCloserEnabled,
    guildId: config.autoPeriodCloserGuildId,
    intervalMs: config.autoPeriodCloserIntervalMs,
  });

  const submissionNotifier = new SubmissionNotifier(client, adapter, {
    enabled: config.submissionNotifierEnabled,
    channelId: config.submissionNotifierChannelId,
    intervalMs: liveConfig.submissionNotifierIntervalMs ?? config.submissionNotifierIntervalMs,
    lookbackSeconds: config.submissionNotifierLookbackSeconds,
  });

  const characterSubmissionNotifier = new CharacterSubmissionNotifier(client, adapter, {
    enabled: config.ccSubmissionNotifierEnabled,
    intervalMs: config.ccSubmissionNotifierIntervalMs,
    lookbackSeconds: config.ccSubmissionNotifierLookbackSeconds,
  });

  const claimReminderService = new ClaimReminderService(client, adapter, {
    enabled: config.claimReminderEnabled,
    guildId: config.claimReminderGuildId,
    intervalMs: liveConfig.claimReminderIntervalMs ?? config.claimReminderIntervalMs,
    weekdayLocal: config.claimReminderWeekdayLocal,
    hourLocal: config.claimReminderHourLocal,
    minuteLocal: config.claimReminderMinuteLocal,
    timezone: config.claimReminderTimezone,
  });

  const passageOfTimeService = new PassageOfTimeService(client, {
    enabled: config.passageOfTimeEnabled,
    guildId: config.passageOfTimeGuildId,
    channelId: config.passageOfTimeChannelId,
    testMode: config.passageOfTimeTestMode,
    testChannelId: config.passageOfTimeTestChannelId,
    intervalMs: liveConfig.passageOfTimeIntervalMs ?? config.passageOfTimeIntervalMs,
    timezone: config.passageOfTimeTimezone,
    mentionRoleIds: [
      config.passageOfTimeKindredRoleId ?? '',
      config.passageOfTimeGhoulRoleId ?? '',
      config.passageOfTimeMortalRoleId ?? '',
    ],
    events: [
      {
        name: 'sunrise',
        weekdayLocal: config.passageSunriseWeekdayLocal,
        hourLocal: config.passageSunriseHourLocal,
        minuteLocal: config.passageSunriseMinuteLocal,
        anchorDate: config.passageSunriseAnchorDate,
        cadenceWeeks: 2,
        body: PASSAGE_SUNRISE_MESSAGE,
        imageFile: path.join(ASSETS_DIR, 'sunrise-rising-sun.gif'),
      },
      {
        name: 'sunset',
        weekdayLocal: config.passageSunsetWeekdayLocal,
        hourLocal: config.passageSunsetHourLocal,
        minuteLocal: config.passageSunsetMinuteLocal,
        anchorDate: config.passageSunsetAnchorDate,
        cadenceWeeks: 2,
        body: PASSAGE_SUNSET_MESSAGE,
        imageFile: path.join(ASSETS_DIR, 'Nashville_at_Night.gif'),
      },
      {
        name: 'downtime',
        weekdayLocal: config.passageDowntimeWeekdayLocal,
        hourLocal: config.passageDowntimeHourLocal,
        minuteLocal: config.passageDowntimeMinuteLocal,
        anchorDate: config.passageDowntimeAnchorDate,
        cadenceWeeks: 8,
        body: PASSAGE_DOWNTIME_MESSAGE,
      },
    ],
  });

  const sheetsReconcileService = new SheetsReconcileService(adapter, {
    enabled: config.sheetsReconcileEnabled,
    hourLocal: config.sheetsReconcileHourLocal,
    minuteLocal: config.sheetsReconcileMinuteLocal,
    timezone: config.sheetsReconcileTimezone,
    intervalMs: config.sheetsReconcileIntervalMs,
  });

  const configSyncWorker = new ConfigSyncWorker(adapter, config.configSyncIntervalMs);
  const botHeartbeatService = new BotHeartbeatService(adapter, config.botHeartbeatIntervalMs);
  const backgroundBlankReleaseService = new BackgroundBlankReleaseService(
    client,
    adapter,
    config.claimReminderGuildId ?? config.reviewNotifierGuildId ?? config.testGuildId,
    Math.max(60_000, config.botHeartbeatIntervalMs),
  );
  const botLogForwarder = new BotLogForwarder(adapter);

  // Build hunt consequence config, respecting test mode
  const huntConsequenceCfg = {
    enabled: config.huntConsequenceEnabled,
    eldestBotId: config.huntConsequenceEldestBotId,
    monitorChannelIds: new Set(
      config.huntConsequenceTestMode
        ? [config.huntConsequenceTestChannelId].filter(Boolean)
        : config.huntConsequenceChannelIds,
    ),
    staffChannelId: config.huntConsequenceTestMode
      ? config.huntConsequenceTestChannelId
      : config.huntConsequenceStaffChannelId,
    staffRoleId: config.huntConsequenceStaffRoleId,
  };

  client.once('ready', async () => {
    logEvent('info', 'bot_ready', { userTag: client.user?.tag });
    await registerCommands(client);
    configSyncWorker.start();
    botHeartbeatService.start();
    backgroundBlankReleaseService.start();
    botLogForwarder.start();
    reviewNotifier.start();
    autoPeriodCreator.start();
    autoPeriodCloser.start();
    submissionNotifier.start();
    claimReminderService.start();
    passageOfTimeService.start();
    sheetsReconcileService.start();
    characterSubmissionNotifier.start();
    startCubbyChannelMonitor(client);
    startCharacterTicketMonitor(client, {
      webBaseUrl: config.webAppBaseUrl,
      creationRulesUrl: config.ccCreationRulesUrl,
      ...(config.ccTicketCategoryIds.size > 0 ? { ticketCategoryIds: config.ccTicketCategoryIds } : {}),
    });
    startHuntConsequenceMonitor(client, huntConsequenceCfg);
  });

  client.on('interactionCreate', async (interaction) => {
  const baseMeta = {
    interactionId: interaction.id,
    interactionType: interaction.type,
    userId: interaction.user?.id,
    guildId: interaction.guildId,
  };

  try {
    if (interaction.isAutocomplete()) {
      const cmd = client.commands.get(interaction.commandName);
      if (!cmd?.autocomplete) {
        return;
      }
      await cmd.autocomplete(interaction, { client, adapter });
      return;
    }

    if (interaction.isStringSelectMenu()) {
      const combatHandled = await handleCombatParticipantSelect(interaction);
      if (combatHandled) {
        logEvent('info', 'interaction_handled_select', { ...baseMeta, customId: interaction.customId });
        return;
      }
      const claimHandled = await handleClaimWizardSelect(interaction);
      if (claimHandled) {
        logEvent('info', 'interaction_handled_select', { ...baseMeta, customId: interaction.customId });
        return;
      }
      const approveHandled = await handleApproveWizardStringSelect(interaction);
      if (approveHandled) {
        logEvent('info', 'interaction_handled_select', { ...baseMeta, customId: interaction.customId });
        return;
      }
      const editHandled = await handleEditWizardStringSelect(interaction);
      if (editHandled) {
        logEvent('info', 'interaction_handled_select', { ...baseMeta, customId: interaction.customId });
        return;
      }
    }

    if (interaction.isButton()) {
      if (isApproveWizardButton(interaction.customId)) {
        await handleApproveWizardButton(interaction, { client, adapter });
        logEvent('info', 'interaction_handled_approve_button', { ...baseMeta, customId: interaction.customId });
        return;
      }
      if (isEditWizardButton(interaction.customId)) {
        await handleEditWizardButton(interaction, { client, adapter });
        logEvent('info', 'interaction_handled_edit_button', { ...baseMeta, customId: interaction.customId });
        return;
      }
      if (isDeleteButton(interaction.customId)) {
        await handleDeleteButton(interaction, { client, adapter });
        logEvent('info', 'interaction_handled_delete_button', { ...baseMeta, customId: interaction.customId });
        return;
      }
      if (isHuntConsequenceButton(interaction.customId)) {
        await handleHuntConsequenceButton(interaction, huntConsequenceCfg);
        logEvent('info', 'interaction_handled_hunt_consequence', { ...baseMeta, customId: interaction.customId });
        return;
      }
      if (isCombatButton(interaction.customId)) {
        await handleCombatButton(interaction);
        logEvent('info', 'interaction_handled_combat_button', { ...baseMeta, customId: interaction.customId });
        return;
      }
      const reminderHandled = await handleClaimReminderButton(interaction, adapter);
      if (reminderHandled) {
        logEvent('info', 'interaction_handled_reminder_button', { ...baseMeta, customId: interaction.customId });
        return;
      }
      const handled = await handleClaimWizardButton(interaction, adapter);
      if (handled) {
        logEvent('info', 'interaction_handled_button', { ...baseMeta, customId: interaction.customId });
        return;
      }
    }

    if (interaction.isModalSubmit()) {
      const approveNameHandled = await handleApproveNameModal(interaction, { client, adapter });
      if (approveNameHandled) {
        logEvent('info', 'interaction_handled_modal', { ...baseMeta, customId: interaction.customId });
        return;
      }
      const updateHandled = await handleUpdateModal(interaction);
      if (updateHandled) {
        logEvent('info', 'interaction_handled_modal', { ...baseMeta, customId: interaction.customId });
        return;
      }
      const broadcastHandled = await handleBroadcastModal(interaction, { client, adapter });
      if (broadcastHandled) {
        logEvent('info', 'interaction_handled_modal', { ...baseMeta, customId: interaction.customId });
        return;
      }
      const editRenameHandled = await handleEditRenameModal(interaction, { client, adapter });
      if (editRenameHandled) {
        logEvent('info', 'interaction_handled_modal', { ...baseMeta, customId: interaction.customId });
        return;
      }
      const combatHandled = await handleCombatSetupModal(interaction);
      if (combatHandled) {
        logEvent('info', 'interaction_handled_modal', { ...baseMeta, customId: interaction.customId });
        return;
      }
      const handled = await handleClaimWizardModal(interaction);
      if (handled) {
        logEvent('info', 'interaction_handled_modal', { ...baseMeta, customId: interaction.customId });
        return;
      }
    }

    if (!interaction.isChatInputCommand()) {
      return;
    }

    const cmd = client.commands.get(interaction.commandName);
    if (!cmd) {
      return;
    }

    logEvent('info', 'command_execute_start', { ...baseMeta, commandName: interaction.commandName });
    await cmd.execute(interaction, { client, adapter });
    logEvent('info', 'command_execute_done', { ...baseMeta, commandName: interaction.commandName });
  } catch (error) {
    const code = (error as { code?: number }).code;
    // 40060 means another process/handler already acknowledged this interaction.
    if (code === 40060) {
      logEvent('warn', 'interaction_acknowledged_elsewhere', { ...baseMeta, code });
      return;
    }

    logEvent('error', 'command_failure', { ...baseMeta, code, error: errorToMessage(error) });
    if (!interaction.isRepliable()) {
      return;
    }

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: 'Command failed.', ephemeral: true });
      return;
    }

    await interaction.reply({ content: 'Command failed.', ephemeral: true });
  }
  });

  client.login(config.botToken);
});
