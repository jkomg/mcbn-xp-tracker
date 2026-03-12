import 'dotenv/config';
import { Client, GatewayIntentBits } from 'discord.js';
import { config } from './config';
import type { BotClient } from './discord';
import { initClientCommandCollection, registerCommands } from './registerCommands';
import { WebAppAdapter } from './services/adapter';
import { ReviewNotifier } from './services/reviewNotifier';
import { AutoPeriodCreator } from './services/autoPeriodCreator';
import { ClaimReminderService } from './services/claimReminderService';
import path from 'node:path';
import {
  PassageOfTimeService,
  PASSAGE_DOWNTIME_MESSAGE,
  PASSAGE_SUNRISE_MESSAGE,
  PASSAGE_SUNSET_MESSAGE,
} from './services/passageOfTimeService';

const ASSETS_DIR = path.resolve(__dirname, '..', 'assets');
import { errorToMessage, logEvent } from './logger';
import { handleClaimReminderButton } from './claimReminderInteractions';
import {
  handleClaimWizardButton,
  handleClaimWizardModal,
  handleClaimWizardSelect,
} from './interactiveClaimWizard';
import { startCubbyChannelMonitor } from './services/cubbyChannelMonitor';
import {
  startHuntConsequenceMonitor,
  isHuntConsequenceButton,
  handleHuntConsequenceButton,
} from './services/huntConsequenceMonitor';

const adapter = new WebAppAdapter(config.webAppBaseUrl, config.webAppApiToken, {
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

const reviewNotifier = new ReviewNotifier(client, adapter, {
  enabled: config.reviewNotifierEnabled,
  guildId: config.reviewNotifierGuildId,
  intervalMs: config.reviewNotifierIntervalMs,
  lookbackSeconds: config.reviewNotifierLookbackSeconds,
});

const autoPeriodCreator = new AutoPeriodCreator(adapter, {
  enabled: config.autoPeriodCreatorEnabled,
  intervalMs: config.autoPeriodCreatorIntervalMs,
});

const claimReminderService = new ClaimReminderService(client, adapter, {
  enabled: config.claimReminderEnabled,
  guildId: config.claimReminderGuildId,
  intervalMs: config.claimReminderIntervalMs,
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
  intervalMs: config.passageOfTimeIntervalMs,
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
  reviewNotifier.start();
  autoPeriodCreator.start();
  claimReminderService.start();
  passageOfTimeService.start();
  startCubbyChannelMonitor(client);
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
      const handled = await handleClaimWizardSelect(interaction);
      if (handled) {
        logEvent('info', 'interaction_handled_select', { ...baseMeta, customId: interaction.customId });
        return;
      }
    }

    if (interaction.isButton()) {
      if (isHuntConsequenceButton(interaction.customId)) {
        await handleHuntConsequenceButton(interaction, huntConsequenceCfg);
        logEvent('info', 'interaction_handled_hunt_consequence', { ...baseMeta, customId: interaction.customId });
        return;
      }
      const reminderHandled = await handleClaimReminderButton(interaction);
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
