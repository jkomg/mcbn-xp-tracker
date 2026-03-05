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

  if (interaction.customId === CLAIM_REMINDER_ACTION_START) {
    await interaction.reply({
      content: 'Use `/xp submit` (wizard) or `/xp claim` when you are ready.',
      ephemeral: true,
    });
    return true;
  }

  if (interaction.customId === CLAIM_REMINDER_ACTION_NOT_NOW) {
    const snoozeHours = config.claimReminderSnoozeHours;
    setClaimReminderSnooze(interaction.user.id, snoozeHours);
    await interaction.reply({
      content: `Okay — snoozed for ${snoozeHours} hours.`,
      ephemeral: true,
    });
    return true;
  }

  if (interaction.customId === CLAIM_REMINDER_ACTION_OPT_OUT) {
    setClaimReminderOptOut(interaction.user.id, true);
    await interaction.reply({
      content: 'Understood. You are opted out of sunrise claim reminders.',
      ephemeral: true,
    });
    return true;
  }

  return false;
}
