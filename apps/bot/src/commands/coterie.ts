/**
 * /coterie — coterie info commands for players.
 */
import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  SlashCommandBuilder,
} from 'discord.js';
import type { CommandContext } from '../discord';
import { errorToMessage } from '../logger';
import { config } from '../config';

const _BLOOD = 0x8b1a1a;
const _GOLD  = 0xc8a85b;
const _GREY  = 0x5a5a5a;

function _dots(rating: number, max = 5): string {
  const n = Math.max(0, Math.min(max, rating ?? 0));
  return '●'.repeat(n) + '○'.repeat(max - n);
}

export const name = 'coterie';

export const data = new SlashCommandBuilder()
  .setName('coterie')
  .setDescription('Coterie information')
  .addSubcommand((s) =>
    s
      .setName('status')
      .setDescription("Show your coterie's domain and members.")
      .addStringOption((o) =>
        o
          .setName('character')
          .setDescription('Character name (only needed if you have multiple)')
          .setRequired(false),
      ),
  );

export async function execute(
  interaction: ChatInputCommandInteraction,
  { adapter }: CommandContext,
): Promise<void> {
  const sub = interaction.options.getSubcommand();
  if (sub === 'status') {
    await handleStatus(interaction, adapter);
  }
}

async function handleStatus(
  interaction: ChatInputCommandInteraction,
  adapter: CommandContext['adapter'],
): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const discordId = interaction.user.id;
  const requestedName = interaction.options.getString('character') ?? undefined;

  let data: Awaited<ReturnType<typeof adapter.getCoterieForCharacter>>;
  try {
    data = await adapter.getCoterieForCharacter(discordId, requestedName);
  } catch (err) {
    await interaction.editReply(
      `❌ Could not reach the tracker right now. Try again in a moment.\n\`${errorToMessage(err)}\``,
    );
    return;
  }

  if (!data) {
    const suffix = requestedName ? ` named **${requestedName}**` : '';
    await interaction.editReply(
      `You have no active character${suffix} registered in the tracker.`,
    );
    return;
  }

  if (!data.coterie) {
    await interaction.editReply(
      `**${data.character_name}** is not in a coterie.\n\n` +
      'Coterie formations are reviewed by staff — talk to your Storyteller.',
    );
    return;
  }

  const embed = buildCoterieEmbed(data);
  await interaction.editReply({ embeds: [embed] });
}

function buildCoterieEmbed(
  data: NonNullable<Awaited<ReturnType<CommandContext['adapter']['getCoterieForCharacter']>>>,
): EmbedBuilder {
  const co = data.coterie!;
  const members = data.members;

  const color = co.status === 'active' ? _BLOOD : _GREY;

  const embed = new EmbedBuilder()
    .setTitle(`🩸 ${co.name}`)
    .setColor(color);

  if (co.description) {
    embed.setDescription(co.description);
  }

  // Domain
  const domainLines = [
    `Chasse     ${_dots(co.chasse)}  ${co.chasse}/5`,
    `Lien       ${_dots(co.lien)}  ${co.lien}/5`,
    `Portillon  ${_dots(co.portillon)}  ${co.portillon}/5`,
  ];
  embed.addFields({
    name: 'Domain',
    value: `\`\`\`\n${domainLines.join('\n')}\n\`\`\``,
    inline: false,
  });

  // Members
  const memberLines = members.map((m) => {
    const clan = (m.clan || '').replace(/-/g, ' ');
    let line = `• **${m.character_name}**`;
    if (clan) line += `  ·  _${clan}_`;
    if (m.player_name) line += `  ·  \`${m.player_name}\``;
    if (m.character_name === data.character_name) line += '  ·  **you**';
    return line;
  });
  embed.addFields({
    name: `Members (${members.length})`,
    value: memberLines.join('\n') || '—',
    inline: false,
  });

  const webUrl = config.webAppBaseUrl;
  embed.setFooter({
    text: `Status: ${co.status.charAt(0).toUpperCase() + co.status.slice(1)}  ·  View at ${webUrl}/coteries/${co.slug}`,
  });

  return embed;
}
