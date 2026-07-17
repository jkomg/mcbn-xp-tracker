/**
 * /rumor — posts to #rumors using the exact staff-provided template, as
 * plain message content (not an embed) to preserve the markdown exactly.
 * The rumor text itself is auto-wrapped in Discord spoiler tags.
 */
import {
  ActionRowBuilder,
  AutocompleteInteraction,
  CategoryChannel,
  ChannelType,
  ChatInputCommandInteraction,
  Guild,
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

// Curated allowlist — the bot posts with its own permissions, so this must
// stay an explicit list of in-fiction roles rather than "any guild role."
// Letting @ resolve arbitrary roles would let a player trigger a real
// @Administrator (or effectively @everyone-scale) ping through this command.
const RUMOR_TAGGABLE_ROLE_NAMES = [
  'Kindred', 'Ghouls', 'Mortals', 'Storyteller',
  'Camarilla', 'Anarch', 'Autarkis', 'Family', 'Family Representatives',
  'Camarilla Court', 'Anarch Leaders',
  'Banu Haqim', 'Brujah', 'Gangrel', 'Lasombra', 'Malkavian', 'Ministry',
  'Nosferatu', 'Ravnos', 'Salubri', 'Toreador', 'Tremere', 'Tzimisce', 'Ventrue',
];

// Channels under these categories are treated as taggable in-game locations.
const RUMOR_LOCATION_CATEGORY_NAMES = ['city of nashville', 'elysium', 'event locations'];

function normalizeTagName(s: string): string {
  return s.toLowerCase().replace(/-/g, ' ').replace(/\s+/g, ' ').trim();
}

async function buildTagMaps(guild: Guild): Promise<{ roleMap: Map<string, string>; channelMap: Map<string, string> }> {
  const roleMap = new Map<string, string>();
  const channelMap = new Map<string, string>();
  try {
    const [roles, channels] = await Promise.all([guild.roles.fetch(), guild.channels.fetch()]);

    for (const role of roles.values()) {
      if (RUMOR_TAGGABLE_ROLE_NAMES.some((n) => n.toLowerCase() === role.name.toLowerCase())) {
        roleMap.set(normalizeTagName(role.name), role.id);
      }
    }

    const locationCategoryIds = new Set(
      Array.from(channels.values())
        .filter((ch): ch is CategoryChannel => !!ch && ch.type === ChannelType.GuildCategory)
        .filter((ch) => RUMOR_LOCATION_CATEGORY_NAMES.some((n) => n === ch.name.toLowerCase()))
        .map((ch) => ch.id),
    );
    for (const channel of channels.values()) {
      if (channel && channel.type === ChannelType.GuildText && channel.parentId && locationCategoryIds.has(channel.parentId)) {
        channelMap.set(normalizeTagName(channel.name), channel.id);
      }
    }
  } catch {
    // Tag resolution is a best-effort enhancement — a rumor must still post
    // even if the guild role/channel fetch fails.
  }
  return { roleMap, channelMap };
}

/**
 * Scans text for `@word[ word...]` / `#word[ word...]` runs and replaces
 * any that match a known role/location name with a real Discord mention —
 * trying the longest run of words first, then backing off one word at a
 * time, so multi-word names (e.g. "Camarilla Court") resolve without
 * requiring special quoting. Unmatched tags are left as literal text.
 */
export function resolveTags(text: string, roleMap: Map<string, string>, channelMap: Map<string, string>): string {
  return text.replace(/([@#])([A-Za-z0-9][A-Za-z0-9 '-]{0,48})/g, (full, sigil: string, rest: string) => {
    const map = sigil === '@' ? roleMap : channelMap;
    const wordMatches = Array.from(rest.matchAll(/\S+/g));
    for (let n = wordMatches.length; n >= 1; n--) {
      const lastWord = wordMatches[n - 1];
      const endIdx = (lastWord.index ?? 0) + lastWord[0].length;
      const candidate = rest.slice(0, endIdx);
      const id = map.get(normalizeTagName(candidate));
      if (id) {
        const trailing = rest.slice(endIdx);
        const mention = sigil === '@' ? `<@&${id}>` : `<#${id}>`;
        return mention + trailing;
      }
    }
    return full;
  });
}

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

  let rumorText = interaction.fields.getTextInputValue('rumor_text').trim();
  let location = interaction.fields.getTextInputValue('location').trim();
  const pointOfContactTyped = interaction.fields.getTextInputValue('point_of_contact').trim();
  const roll = interaction.fields.getTextInputValue('roll').trim();

  if (interaction.guild) {
    const { roleMap, channelMap } = await buildTagMaps(interaction.guild);
    rumorText = resolveTags(rumorText, roleMap, channelMap);
    location = resolveTags(location, roleMap, channelMap);
  }

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
