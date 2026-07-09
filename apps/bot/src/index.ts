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
import { WikiSyncScheduler } from './services/wikiSyncScheduler';
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
import { handleBroadcastModal, handleDeleteButton, handleUpdateModal, handleRetainerUpdateModal, isDeleteButton } from './commands/lasombra';
import { handleDeliveryModal, handleDeliveryReplyButton } from './commands/delivery';
import { handleContactSendModal, handleContactReplyModal, handleContactReplyButton } from './commands/contact';
import { handlePostModal, handlePostReplyButton } from './commands/post';
import { handleCobwebModal, handleCobwebReplyButton } from './commands/cobweb';
import { handleRumorModal } from './commands/rumor';
import { buildDisableTokens, isAnyTokenDisabled } from './services/commandGating';
import { memberHasAnyRole, requiredRoleIds } from './services/roleGate';
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
import { startHoneypotMonitor } from './services/honeypotMonitor';
import { isNewMemberGateButton, startNewMemberGate } from './services/newMemberGate';
import { startMentionSpamBreaker } from './services/mentionSpamBreaker';
import {
  isPermissionsApplyButton,
  handlePermissionsApplyButton,
  isPermissionsRollbackSelect,
  handlePermissionsRollbackSelect,
  isPermissionsRollbackButton,
  handlePermissionsRollbackButton,
} from './permissionsWizard';
import { startCharacterTicketMonitor } from './services/characterTicketMonitor';
import { SubmissionNotifier } from './services/submissionNotifier';
import { CharacterSubmissionNotifier } from './services/characterSubmissionNotifier';
import { SheetImportNotifier } from './services/sheetImportNotifier';
import { CharacterApprovalNotifier } from './services/characterApprovalNotifier';
import {
  startHuntConsequenceMonitor,
  isHuntConsequenceButton,
  handleHuntConsequenceButton,
} from './services/huntConsequenceMonitor';
import { ConfigSyncWorker } from './services/configSyncWorker';
import { BotHeartbeatService } from './services/botHeartbeatService';
import { CubbySyncWorker } from './services/cubbySyncWorker';
import { liveConfig } from './liveConfig';
import { BackgroundBlankReleaseService } from './services/backgroundBlankReleaseService';
import { DiscordActivityTracker } from './services/discordActivityTracker';
import { StaffRoleSyncService } from './services/staffRoleSyncService';
import { MemberEventTracker } from './services/memberEventTracker';
import { RetirementAutomationWorker } from './services/retirementAutomationWorker';

// Seed liveConfig from .env values so services start with the correct initial state.
liveConfig.reviewNotifierEnabled = config.reviewNotifierEnabled;
liveConfig.submissionNotifierEnabled = config.submissionNotifierEnabled;
liveConfig.autoPeriodCreatorEnabled = config.autoPeriodCreatorEnabled;
liveConfig.autoPeriodCloserEnabled = config.autoPeriodCloserEnabled;
liveConfig.claimReminderEnabled = config.claimReminderEnabled;
liveConfig.passageOfTimeEnabled = config.passageOfTimeEnabled;
liveConfig.newNightBroadcastEnabled = config.passageNewNightBroadcastEnabled;
liveConfig.newNightBroadcastMessage = config.passageNewNightBroadcastMessage;
liveConfig.huntConsequenceEnabled = config.huntConsequenceEnabled;
liveConfig.honeypotEnabled = config.honeypotEnabled;
liveConfig.honeypotRequireYoungAccount = config.honeypotRequireYoungAccount;
liveConfig.honeypotMaxAccountAgeDays = config.honeypotMaxAccountAgeDays;
liveConfig.honeypotChannelId = config.honeypotChannelId;
liveConfig.honeypotModLogChannelId = config.honeypotModLogChannelId;
liveConfig.honeypotWhitelistedRoleIds = new Set(config.honeypotWhitelistedRoleIds);
liveConfig.mentionBreakerEnabled = config.mentionBreakerEnabled;
liveConfig.mentionBreakerMaxMentions = config.mentionBreakerMaxMentions;
liveConfig.mentionBreakerTimeoutMinutes = config.mentionBreakerTimeoutMinutes;
liveConfig.mentionBreakerExemptRoleIds = new Set(config.mentionBreakerExemptRoleIds);
liveConfig.mentionBreakerModLogChannelId = config.mentionBreakerModLogChannelId;
liveConfig.verifiedMemberRoleId = config.verifiedMemberRoleId ?? '';
liveConfig.newMemberGateEnabled = config.newMemberGateEnabled;
liveConfig.newMemberGateWelcomeChannelId = config.newMemberGateWelcomeChannelId;
liveConfig.newMemberGateSheetInProgressRoleId = config.newMemberGateSheetInProgressRoleId;
liveConfig.newMemberGateLurkerRoleId = config.newMemberGateLurkerRoleId;
liveConfig.newMemberGatePostableChannelIds = config.newMemberGatePostableChannelIds;
liveConfig.correspondenceDeliveryChannelId = config.correspondenceDeliveryChannelId;
liveConfig.correspondenceContactChannelId = config.correspondenceContactChannelId;
liveConfig.correspondencePrestationChannelId = config.correspondencePrestationChannelId;
liveConfig.correspondenceSocialChannelId = config.correspondenceSocialChannelId;
liveConfig.correspondenceCobwebChannelId = config.correspondenceCobwebChannelId;
liveConfig.correspondenceRumorChannelId = config.correspondenceRumorChannelId;

const adapter = new WebAppAdapter(config.webAppBaseUrl, config.webAppApiToken, {
  readToken: config.webAppApiReadToken,
  writeToken: config.webAppApiWriteToken,
  requestTimeoutMs: config.requestTimeoutMs,
  claimContextCacheTtlMs: config.claimContextCacheTtlMs,
  claimContextStaleIfErrorMs: config.claimContextStaleIfErrorMs,
  claimContextMaxRetries: config.claimContextMaxRetries,
  claimContextRetryBaseMs: config.claimContextRetryBaseMs,
});

const baseIntents = [
  GatewayIntentBits.Guilds,
  GatewayIntentBits.GuildMessages,
  GatewayIntentBits.MessageContent,
];
// GuildMembers is a privileged intent that must be enabled in the Discord
// Developer Portal. Only requested when a deployment actually opts into a
// feature that needs it — kept opt-in rather than unconditional so a fresh
// install (see docs/INSTALL_*.md) that never enables the portal toggle
// doesn't hard-crash with "disallowed intents" on startup.
//
// config.newMemberGateEnabled is a one-time startup decision, not the live
// on/off switch: set NEW_MEMBER_GATE_ENABLED=true once during rollout (this
// is what actually secures the intent), then staff fully control whether
// the feature is live via the Settings dashboard (liveConfig.newMemberGateEnabled,
// synced by configSyncWorker) with no further restarts needed.
if (config.staffRoleSyncEnabled || config.memberEventTrackerEnabled || config.newMemberGateEnabled) {
  baseIntents.push(GatewayIntentBits.GuildMembers);
}

const client = new Client({ intents: baseIntents }) as BotClient;

// discord.js's Client is an EventEmitter; an unhandled 'error' event on it
// (gateway/websocket hiccups, which discord.js reconnects from on its own)
// otherwise crashes the whole process by Node's default EventEmitter
// behavior. This is the standard discord.js pattern — log and let the
// client's own reconnection logic handle it, rather than taking the whole
// bot down for a transient connection issue.
//
// Deliberately NOT a process-wide `unhandledRejection` handler: that would
// also swallow a genuinely fatal failure during startup (e.g. registerCommands
// throwing before workers/heartbeat ever start), leaving the container alive
// but half-initialized with no automatic recovery — worse than crashing and
// letting Docker's restart policy actually fix it. The interaction-specific
// crash this was guarding against is already fixed at its source (see the
// try/catch around the fallback reply in the interactionCreate handler
// below), so no such backstop is needed here.
client.on('error', (error) => {
  logEvent('error', 'client_error', { error: errorToMessage(error) });
});

initClientCommandCollection(client);

// Fetch DB-backed config overrides before constructing services so interval
// overrides set in the web UI take effect immediately on this startup.
async function applyStartupConfigOverrides(): Promise<void> {
  // Seed CC ticket monitor from .env defaults so it works before first DB sync.
  liveConfig.ccTicketMonitorEnabled = config.ccTicketMonitorEnabled;
  liveConfig.ccTicketCategoryIds = new Set(config.ccTicketCategoryIds);
  try {
    const cfg = await adapter.getBotConfig();
    if (cfg.passageOfTimeIntervalMs !== null) liveConfig.passageOfTimeIntervalMs = cfg.passageOfTimeIntervalMs;
    if (cfg.reviewNotifierIntervalMs !== null) liveConfig.reviewNotifierIntervalMs = cfg.reviewNotifierIntervalMs;
    if (cfg.submissionNotifierIntervalMs !== null) liveConfig.submissionNotifierIntervalMs = cfg.submissionNotifierIntervalMs;
    if (cfg.claimReminderIntervalMs !== null) liveConfig.claimReminderIntervalMs = cfg.claimReminderIntervalMs;
    if (cfg.announcementsChannelId) liveConfig.announcementsChannelId = cfg.announcementsChannelId;
    if (cfg.ccTicketMonitorEnabled !== null) liveConfig.ccTicketMonitorEnabled = cfg.ccTicketMonitorEnabled;
    if (cfg.ccTicketCategoryIds !== null) {
      liveConfig.ccTicketCategoryIds = new Set(
        cfg.ccTicketCategoryIds.split(',').map(s => s.trim()).filter(Boolean),
      );
    }
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

  const sheetImportNotifier = new SheetImportNotifier(client, adapter, {
    enabled: config.sheetImportNotifierEnabled,
    guildId: config.discordGuildId,
    staffRoleId: config.staffRoleStorytellerId,
    webBaseUrl: config.webAppBaseUrl,
    intervalMs: config.sheetImportNotifierIntervalMs,
    lookbackSeconds: config.sheetImportNotifierLookbackSeconds,
  });

  const characterApprovalNotifier = new CharacterApprovalNotifier(client, adapter, {
    enabled: config.ccApprovalNotifierEnabled,
    channelId: config.approvePlayerSheetsChannelId,
    intervalMs: config.ccApprovalNotifierIntervalMs,
    lookbackSeconds: config.ccApprovalNotifierLookbackSeconds,
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
    newNightBroadcastCategoryIds: config.passageNewNightBroadcastCategoryIds,
  });

  const sheetsReconcileService = new SheetsReconcileService(adapter, {
    enabled: config.sheetsReconcileEnabled,
    hourLocal: config.sheetsReconcileHourLocal,
    minuteLocal: config.sheetsReconcileMinuteLocal,
    timezone: config.sheetsReconcileTimezone,
    intervalMs: config.sheetsReconcileIntervalMs,
  });

  const wikiSyncScheduler = new WikiSyncScheduler(adapter, {
    enabled: config.wikiSyncEnabled,
    hourLocal: config.wikiSyncHourLocal,
    minuteLocal: config.wikiSyncMinuteLocal,
    timezone: config.wikiSyncTimezone,
    intervalMs: config.wikiSyncIntervalMs,
  });

  const cubbySyncWorker = new CubbySyncWorker(adapter, client, {
    enabled: config.cubbySyncEnabled,
    intervalMs: config.cubbySyncIntervalMs,
    guildId: config.cubbySyncGuildId,
    staffChannelId: config.cubbySyncStaffChannelId,
    retiredCategoryId: config.cubbyRetiredCategoryId,
  });
  const retirementAutomationWorker = new RetirementAutomationWorker(adapter, client, {
    enabled: config.retirementAutomationEnabled,
    intervalMs: config.retirementAutomationIntervalMs,
    guildId: config.retirementAutomationGuildId,
    retiredCubbyCategoryId: config.cubbyRetiredCategoryId,
    childrenForumId: config.retirementChildrenForumId,
    retiredForumId: config.retirementRetiredForumId,
    wikiBatchEnabled: config.retirementWikiBatchEnabled,
    wikiBatchHourLocal: config.retirementWikiBatchHourLocal,
    wikiBatchMinuteLocal: config.retirementWikiBatchMinuteLocal,
    wikiBatchTimezone: config.retirementWikiBatchTimezone,
    notifyChannelId: config.retirementNotifyChannelId,
  });

  const discordActivityGuildId = config.discordGuildId ?? config.reviewNotifierGuildId ?? '';
  const discordActivityTracker = discordActivityGuildId
    ? new DiscordActivityTracker(adapter, discordActivityGuildId)
    : null;

  const staffRoleSyncGuildId = config.discordGuildId ?? config.reviewNotifierGuildId ?? '';
  const staffRoleSync = config.staffRoleSyncEnabled && staffRoleSyncGuildId
    ? new StaffRoleSyncService(client, adapter, {
        guildId: staffRoleSyncGuildId,
        roleMap: new Map([
          [config.staffRoleSystemHelperId, 'system_helper'],
          [config.staffRoleStorytellerId, 'storyteller'],
          [config.staffRoleModeratorId, 'moderator'],
          [config.staffRoleAdministratorId, 'administrator'],
        ]),
      })
    : null;

  const memberEventTrackerGuildId = config.discordGuildId ?? config.reviewNotifierGuildId ?? '';
  const memberEventTracker = config.memberEventTrackerEnabled && memberEventTrackerGuildId
    ? new MemberEventTracker(client, adapter, {
        guildId: memberEventTrackerGuildId,
        roleIds: {
          kindred: config.passageOfTimeKindredRoleId ?? '',
          ghoul: config.passageOfTimeGhoulRoleId ?? '',
          mortal: config.passageOfTimeMortalRoleId ?? '',
        },
      })
    : null;

  const configSyncWorker = new ConfigSyncWorker(adapter, config.configSyncIntervalMs);
  const wikiSyncCapable = Boolean(config.discordGuildId);
  const botHeartbeatService = new BotHeartbeatService(
    adapter,
    config.botHeartbeatIntervalMs,
    { wikiSyncCapable },
  );
  const backgroundBlankReleaseService = new BackgroundBlankReleaseService(
    client,
    adapter,
    config.claimReminderGuildId ?? config.reviewNotifierGuildId ?? config.discordGuildId,
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

    // Start immediately
    configSyncWorker.start();
    backgroundBlankReleaseService.start();
    botLogForwarder.start();
    autoPeriodCreator.start();
    autoPeriodCloser.start();
    claimReminderService.start();
    passageOfTimeService.start();
    sheetsReconcileService.start();
    wikiSyncScheduler.start();
    cubbySyncWorker.start();
    retirementAutomationWorker.start();
    discordActivityTracker?.start();

    reviewNotifier.start();
    submissionNotifier.start();
    characterSubmissionNotifier.start();
    sheetImportNotifier.start();
    characterApprovalNotifier.start();
    // Stagger heartbeat relative to configSyncWorker so they don't fire at
    // the same second and compete for connections during backfill scans.
    // Notifiers start immediately so their cursor bootstrap isn't delayed.
    setTimeout(() => botHeartbeatService.start(), 15_000);
    staffRoleSync?.start();
    memberEventTracker?.start();
    startCubbyChannelMonitor(client);
    startCharacterTicketMonitor(client, {
      webBaseUrl: config.webAppBaseUrl,
      creationRulesUrl: config.ccCreationRulesUrl,
    });
    startHuntConsequenceMonitor(client, huntConsequenceCfg);
    startHoneypotMonitor(client);
    startMentionSpamBreaker(client);
    // Always started, like honeypot/mention-breaker — internally gated on
    // liveConfig.newMemberGateEnabled so the dashboard toggle takes effect
    // live. Only fully functional if NEW_MEMBER_GATE_ENABLED was set at
    // startup (secures the GuildMembers intent above); if not, the
    // guildMemberAdd-driven join greeting silently won't fire, but the
    // message-gate and button flow still work fine either way.
    startNewMemberGate(client);
  });

  const accessRoleIds = requiredRoleIds(config);
  if (accessRoleIds.length === 0) {
    logEvent('warn', 'access_gate_misconfigured_no_role_ids', {});
  }

  client.on('interactionCreate', async (interaction) => {
  const baseMeta = {
    interactionId: interaction.id,
    interactionType: interaction.type,
    userId: interaction.user?.id,
    guildId: interaction.guildId,
  };

  try {
    // interaction.member is null for DM-context interactions — denied by
    // memberHasAnyRole, which is intentional: correspondence/RP commands
    // are guild-only, so DM usage has no legitimate case here.
    const customId = 'customId' in interaction ? interaction.customId : undefined;
    if (
      !config.testerDiscordIds.has(interaction.user.id) &&
      !isNewMemberGateButton(customId) &&
      !memberHasAnyRole(interaction.member, accessRoleIds)
    ) {
      logEvent('info', 'interaction_blocked_unverified_role', baseMeta);
      if (interaction.isAutocomplete()) {
        await interaction.respond([]);
      } else if (interaction.isRepliable()) {
        await interaction.reply({
          content: 'You need an approved character (Mortal, Ghoul, or Kindred) or a staff role to use this bot.',
          ephemeral: true,
        });
      }
      return;
    }

    if (interaction.isAutocomplete()) {
      const cmd = client.commands.get(interaction.commandName);
      if (!cmd?.autocomplete) {
        return;
      }
      if (!config.testerDiscordIds.has(interaction.user.id)) {
        const tokens = buildDisableTokens(
          interaction.commandName,
          interaction.options.getSubcommandGroup(false),
          interaction.options.getSubcommand(false),
        );
        if (isAnyTokenDisabled(tokens, liveConfig.disabledCommands)) {
          await interaction.respond([]);
          return;
        }
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
      if (isPermissionsRollbackSelect(interaction.customId)) {
        await handlePermissionsRollbackSelect(interaction, { client, adapter });
        logEvent('info', 'interaction_handled_permissions_rollback_select', { ...baseMeta, customId: interaction.customId });
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
      if (isPermissionsApplyButton(interaction.customId)) {
        await handlePermissionsApplyButton(interaction, { client, adapter });
        logEvent('info', 'interaction_handled_permissions_apply_button', { ...baseMeta, customId: interaction.customId });
        return;
      }
      if (isPermissionsRollbackButton(interaction.customId)) {
        await handlePermissionsRollbackButton(interaction, { client, adapter });
        logEvent('info', 'interaction_handled_permissions_rollback_button', { ...baseMeta, customId: interaction.customId });
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
      const contactReplyButtonHandled = await handleContactReplyButton(interaction, { client, adapter });
      if (contactReplyButtonHandled) {
        logEvent('info', 'interaction_handled_contact_reply_button', { ...baseMeta, customId: interaction.customId });
        return;
      }
      const deliveryReplyButtonHandled = await handleDeliveryReplyButton(interaction, { client, adapter });
      if (deliveryReplyButtonHandled) {
        logEvent('info', 'interaction_handled_delivery_reply_button', { ...baseMeta, customId: interaction.customId });
        return;
      }
      const cobwebReplyButtonHandled = await handleCobwebReplyButton(interaction, { client, adapter });
      if (cobwebReplyButtonHandled) {
        logEvent('info', 'interaction_handled_cobweb_reply_button', { ...baseMeta, customId: interaction.customId });
        return;
      }
      const postReplyButtonHandled = await handlePostReplyButton(interaction, { client, adapter });
      if (postReplyButtonHandled) {
        logEvent('info', 'interaction_handled_post_reply_button', { ...baseMeta, customId: interaction.customId });
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
      const retainerUpdateHandled = await handleRetainerUpdateModal(interaction);
      if (retainerUpdateHandled) {
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
      const deliveryHandled = await handleDeliveryModal(interaction, { client, adapter });
      if (deliveryHandled) {
        logEvent('info', 'interaction_handled_modal', { ...baseMeta, customId: interaction.customId });
        return;
      }
      const contactSendHandled = await handleContactSendModal(interaction, { client, adapter });
      if (contactSendHandled) {
        logEvent('info', 'interaction_handled_modal', { ...baseMeta, customId: interaction.customId });
        return;
      }
      const contactReplyHandled = await handleContactReplyModal(interaction, { client, adapter });
      if (contactReplyHandled) {
        logEvent('info', 'interaction_handled_modal', { ...baseMeta, customId: interaction.customId });
        return;
      }
      const postHandled = await handlePostModal(interaction);
      if (postHandled) {
        logEvent('info', 'interaction_handled_modal', { ...baseMeta, customId: interaction.customId });
        return;
      }
      const cobwebHandled = await handleCobwebModal(interaction);
      if (cobwebHandled) {
        logEvent('info', 'interaction_handled_modal', { ...baseMeta, customId: interaction.customId });
        return;
      }
      const rumorHandled = await handleRumorModal(interaction);
      if (rumorHandled) {
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

    if (!config.testerDiscordIds.has(interaction.user.id)) {
      const tokens = buildDisableTokens(
        interaction.commandName,
        interaction.options.getSubcommandGroup(false),
        interaction.options.getSubcommand(false),
      );
      if (isAnyTokenDisabled(tokens, liveConfig.disabledCommands)) {
        logEvent('info', 'command_execute_blocked_disabled', { ...baseMeta, commandName: interaction.commandName, tokens });
        await interaction.reply({ content: 'This command is currently disabled by staff.', ephemeral: true });
        return;
      }
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
    // 10062 means the interaction expired before we produced a first
    // response (Discord's ack deadline is ~3s) — recoverable under latency,
    // not a bug worth alerting on. Any reply/followUp attempt on an expired
    // interaction throws this same code again, so there's nothing useful to
    // send back; just record it and stop.
    if (code === 10062) {
      logEvent('warn', 'interaction_expired', { ...baseMeta, code });
      return;
    }

    logEvent('error', 'command_failure', { ...baseMeta, code, error: errorToMessage(error) });
    if (!interaction.isRepliable()) {
      return;
    }

    // This fallback reply can itself fail (e.g. the interaction expired for
    // a different reason than the ones already handled above). An uncaught
    // rejection here previously crashed the entire bot process — for every
    // user, not just the one whose interaction failed — since nothing
    // wrapped it. It must never propagate past this handler.
    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: 'Command failed.', ephemeral: true });
      } else {
        await interaction.reply({ content: 'Command failed.', ephemeral: true });
      }
    } catch (fallbackError) {
      logEvent('warn', 'command_failure_fallback_reply_failed', { ...baseMeta, error: errorToMessage(fallbackError) });
    }
  }
  });

  client.on('messageCreate', (message) => {
    discordActivityTracker?.handleMessage(message);
  });

  client.login(config.botToken);
});
