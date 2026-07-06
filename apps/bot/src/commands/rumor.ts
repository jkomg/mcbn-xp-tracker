/**
 * /rumor — posts to #rumors using the exact staff-provided template, as
 * plain message content (not an embed) to preserve the markdown exactly.
 * The rumor text itself is auto-wrapped in Discord spoiler tags.
 */
import {
  ActionRowBuilder,
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  ModalBuilder,
  ModalSubmitInteraction,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle,
  type TextChannel,
} from 'discord.js';
import type { CommandContext } from '../discord';
import { config } from '../config';
import { liveConfig } from '../liveConfig';
import { errorToMessage } from '../logger';

const MODAL_ID = 'rumor:submit';

const DISCOVERY_CHOICES = [
  { name: 'Kindred', value: 'Kindred' },
  { name: 'Underworld', value: 'Underworld' },
  { name: 'High Society', value: 'High Society' },
  { name: 'Streets', value: 'Streets' },
];

type PendingRumor = { discovery: string; sourceCharacterName: string | null; sourceDiscordId: string | null };
const pendingRumors = new Map<string, PendingRumor>();

export const name = 'rumor';

export const data = new SlashCommandBuilder()
  .setName('rumor')
  .setDescription('Post a rumor to #rumors using the standard template.')
  .addStringOption((o) =>
    o.setName('discovery').setDescription('Point of Discovery').setRequired(true).addChoices(...DISCOVERY_CHOICES),
  )
  .addStringOption((o) =>
    o
      .setName('source-character')
      .setDescription('Point of Contact, if it\'s a known character rather than an investigation-roll DC')
      .setRequired(false)
      .setAutocomplete(true),
  );

export async function autocomplete(interaction: AutocompleteInteraction, ctx: CommandContext): Promise<void> {
  const focused = interaction.options.getFocused(true);
  if (focused.name !== 'source-character') {
    await interaction.respond([]);
    return;
  }
  const query = focused.value.toLowerCase();
  try {
    const roster = await ctx.adapter.getActiveRosterWithIds();
    const choices = roster.characters
      .map((c) => c.name)
      .filter((n) => query === '' || n.toLowerCase().includes(query))
      .slice(0, 25)
      .map((n) => ({ name: n, value: n }));
    await interaction.respond(choices);
  } catch {
    await interaction.respond([]);
  }
}

export async function execute(interaction: ChatInputCommandInteraction, ctx: CommandContext): Promise<void> {
  if (!(liveConfig.correspondenceRumorChannelId || config.correspondenceRumorChannelId)) {
    await interaction.reply({
      content: 'The rumors channel is not configured yet — ask a staff member to set `CORRESPONDENCE_RUMOR_CHANNEL_ID`.',
      ephemeral: true,
    });
    return;
  }

  const discovery = interaction.options.getString('discovery', true);
  const sourceCharacterName = interaction.options.getString('source-character');

  let sourceDiscordId: string | null = null;
  if (sourceCharacterName) {
    try {
      const roster = await ctx.adapter.getActiveRosterWithIds();
      const match = roster.characters.find((c) => c.name.toLowerCase() === sourceCharacterName.toLowerCase());
      if (!match) {
        await interaction.reply({ content: `Unknown character: ${sourceCharacterName}`, ephemeral: true });
        return;
      }
      sourceDiscordId = match.discordId;
    } catch {
      sourceDiscordId = null;
    }
  }

  pendingRumors.set(interaction.user.id, { discovery, sourceCharacterName, sourceDiscordId });

  const modal = new ModalBuilder().setCustomId(MODAL_ID).setTitle('Post a Rumor');
  const rumorInput = new TextInputBuilder()
    .setCustomId('rumor_text')
    .setLabel('Rumor')
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder('The rumor itself — will be spoiler-tagged automatically.')
    .setMaxLength(1000)
    .setRequired(true);
  const locationInput = new TextInputBuilder()
    .setCustomId('location')
    .setLabel('Location (optional)')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('Where it originates or leads')
    .setMaxLength(200)
    .setRequired(false);
  const contactInput = new TextInputBuilder()
    .setCustomId('point_of_contact')
    .setLabel(sourceDiscordId ? 'Point of Contact (optional)' : 'Point of Contact')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('A name, or a Manipulation + Subterfuge DC')
    .setMaxLength(300)
    .setRequired(!sourceDiscordId);
  const rollInput = new TextInputBuilder()
    .setCustomId('roll')
    .setLabel('Roll')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('Attribute + Skill DC #')
    .setMaxLength(200)
    .setRequired(true);

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(rumorInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(locationInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(contactInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(rollInput),
  );
  await interaction.showModal(modal);
}

export async function handleRumorModal(interaction: ModalSubmitInteraction): Promise<boolean> {
  if (interaction.customId !== MODAL_ID) return false;

  await interaction.deferReply({ ephemeral: true });

  const pending = pendingRumors.get(interaction.user.id);
  pendingRumors.delete(interaction.user.id);
  if (!pending) {
    await interaction.editReply('Session expired — run `/rumor` again.');
    return true;
  }

  const rumorText = interaction.fields.getTextInputValue('rumor_text').trim();
  const location = interaction.fields.getTextInputValue('location').trim();
  const pointOfContactTyped = interaction.fields.getTextInputValue('point_of_contact').trim();
  const roll = interaction.fields.getTextInputValue('roll').trim();

  const pointOfContact =
    pointOfContactTyped || (pending.sourceDiscordId ? `<@${pending.sourceDiscordId}>` : pending.sourceCharacterName ?? '');

  const lines = [
    `**Rumor**: ||${rumorText}||`,
    `**Point of Discovery**: ${pending.discovery}`,
  ];
  if (location) {
    lines.push(`**Location (Optional)**: ${location}`);
  }
  lines.push(`**Point of Contact**: ${pointOfContact}`);
  lines.push(`**Roll**: ${roll}`);
  lines.push('');
  lines.push('If you want to maintain a rumor, let us know during downtime and we will not delete it!');

  let channel: TextChannel;
  try {
    const fetched = await interaction.client.channels.fetch((liveConfig.correspondenceRumorChannelId || config.correspondenceRumorChannelId));
    if (!fetched || !fetched.isTextBased() || !('send' in fetched)) {
      await interaction.editReply('Could not find the rumors channel. Ask staff to check the configured channel ID.');
      return true;
    }
    channel = fetched as TextChannel;
  } catch (err) {
    await interaction.editReply(`Could not reach the rumors channel: ${errorToMessage(err)}`);
    return true;
  }

  try {
    await channel.send({ content: lines.join('\n') });
  } catch (err) {
    await interaction.editReply(`Could not post the rumor: ${errorToMessage(err)}`);
    return true;
  }

  await interaction.editReply('Rumor posted.');
  return true;
}
