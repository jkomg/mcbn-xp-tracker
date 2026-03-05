import 'dotenv/config';
import { Client, GatewayIntentBits } from 'discord.js';
import { config } from './config';
import type { BotClient } from './discord';
import { initClientCommandCollection, registerCommands } from './registerCommands';
import { WebAppAdapter } from './services/adapter';
import { ReviewNotifier } from './services/reviewNotifier';
import { AutoPeriodCreator } from './services/autoPeriodCreator';
import { ClaimReminderService } from './services/claimReminderService';
import { errorToMessage, logEvent } from './logger';
import { handleClaimReminderButton } from './claimReminderInteractions';
import {
  handleClaimWizardButton,
  handleClaimWizardModal,
  handleClaimWizardSelect,
} from './interactiveClaimWizard';

const adapter = new WebAppAdapter(config.webAppBaseUrl, config.webAppApiToken, {
  requestTimeoutMs: config.requestTimeoutMs,
  claimContextCacheTtlMs: config.claimContextCacheTtlMs,
  claimContextStaleIfErrorMs: config.claimContextStaleIfErrorMs,
  claimContextMaxRetries: config.claimContextMaxRetries,
  claimContextRetryBaseMs: config.claimContextRetryBaseMs,
});

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
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
  intervalMs: config.claimReminderIntervalMs,
  hourLocal: config.claimReminderHourLocal,
  timezone: config.claimReminderTimezone,
});

client.once('ready', async () => {
  logEvent('info', 'bot_ready', { userTag: client.user?.tag });
  await registerCommands(client);
  reviewNotifier.start();
  autoPeriodCreator.start();
  claimReminderService.start();
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
