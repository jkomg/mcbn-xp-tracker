import type { ButtonInteraction } from 'discord.js';
import { config } from './config';
import {
  CLAIM_REMINDER_ACTION_NOT_NOW,
  CLAIM_REMINDER_ACTION_OPT_OUT,
  CLAIM_REMINDER_ACTION_START,
  CLAIM_REMINDER_BUTTON_PREFIX,
  setClaimReminderOptOut,
  setClaimReminderSnooze,
} from './services/claimReminderService';

export async function handleClaimReminderButton(interaction: ButtonInteraction) {
  if (!interaction.customId.startsWith(CLAIM_REMINDER_BUTTON_PREFIX)) {
    return false;
  }

  const encoded = interaction.customId.slice(CLAIM_REMINDER_BUTTON_PREFIX.length);
  const [action, targetDiscordId] = encoded.split(':', 2);
  const allowedUserId = (targetDiscordId || '').trim();
  if (allowedUserId && interaction.user.id !== allowedUserId) {
    await interaction.reply({
      content: 'This reminder is assigned to a different player.',
      ephemeral: true,
    });
    return true;
  }

  if (action === CLAIM_REMINDER_ACTION_START) {
    await interaction.reply({
      content: 'Use `/xp submit` (wizard) or `/xp claim` when you are ready.',
      ephemeral: true,
    });
    return true;
  }

  if (action === CLAIM_REMINDER_ACTION_NOT_NOW) {
    const snoozeHours = config.claimReminderSnoozeHours;
    setClaimReminderSnooze(allowedUserId || interaction.user.id, snoozeHours);
    await interaction.reply({
      content: `Okay — snoozed for ${snoozeHours} hours.`,
      ephemeral: true,
    });
    return true;
  }

  if (action === CLAIM_REMINDER_ACTION_OPT_OUT) {
    setClaimReminderOptOut(allowedUserId || interaction.user.id, true);
    await interaction.reply({
      content: 'Understood. You are opted out of sunrise claim reminders.',
      ephemeral: true,
    });
    return true;
  }

  return false;
}
