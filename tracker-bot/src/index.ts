import 'dotenv/config';
import { Client, GatewayIntentBits } from 'discord.js';
import { initClientCommandCollection, registerCommands } from './registerCommands';
import { WebAppAdapter } from './services/adapter';
import { errorToMessage, logEvent } from './logger';
import {
  handleClaimWizardButton,
  handleClaimWizardModal,
  handleClaimWizardSelect,
} from './interactiveClaimWizard';

const token = process.env.BOT_TOKEN;
if (!token) {
  throw new Error('Missing BOT_TOKEN. Add it to .env');
}

const webAppBaseUrl = process.env.WEB_APP_BASE_URL ?? 'http://127.0.0.1:5001';
const webAppToken = process.env.WEB_APP_API_TOKEN;
const adapter = new WebAppAdapter(webAppBaseUrl, webAppToken);

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

initClientCommandCollection(client);

client.once('ready', async () => {
  logEvent('info', 'bot_ready', { userTag: client.user?.tag });
  await registerCommands(client);
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
      const cmd = (client as any).commands.get(interaction.commandName);
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

    const cmd = (client as any).commands.get(interaction.commandName);
    if (!cmd) {
      return;
    }

    logEvent('info', 'command_execute_start', { ...baseMeta, commandName: interaction.commandName });
    await cmd.execute(interaction, { client, adapter });
    logEvent('info', 'command_execute_done', { ...baseMeta, commandName: interaction.commandName });
  } catch (error: any) {
    const code = error?.code;
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

client.login(token);
