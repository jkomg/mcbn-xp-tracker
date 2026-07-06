/**
 * /prestation — boon ledger for #prestation. owe (create), status (list),
 * repay (advance the two-step debtor-proposes/creditor-confirms lifecycle).
 */
import {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  EmbedBuilder,
  SlashCommandBuilder,
  type TextChannel,
} from 'discord.js';
import type { CommandContext } from '../discord';
import { config } from '../config';
import { liveConfig } from '../liveConfig';
import { errorToMessage } from '../logger';
import { resolveOwnedCharacter } from '../services/characterOwnership';
import type { BoonTier } from '../services/adapter';

const _BLOOD = 0x8b1a1a;

const TIER_LABELS: Record<string, string> = {
  trivial: 'Trivial',
  minor: 'Minor',
  major: 'Major',
  life: 'Life boon',
};
const TIER_EMOJI: Record<string, string> = {
  trivial: '🔹',
  minor: '🔸',
  major: '🔶',
  life: '💠',
};

function tierBadge(tier: string): string {
  return `${TIER_EMOJI[tier] ?? '•'} ${TIER_LABELS[tier] ?? tier}`;
}

export const name = 'prestation';

export const data = new SlashCommandBuilder()
  .setName('prestation')
  .setDescription('Track boons owed between characters.')
  .addSubcommand((s) =>
    s
      .setName('owe')
      .setDescription('Record that another character owes you a boon.')
      .addStringOption((o) =>
        o.setName('debtor').setDescription('Who owes the boon').setRequired(true).setAutocomplete(true),
      )
      .addStringOption((o) =>
        o
          .setName('tier')
          .setDescription('Boon tier')
          .setRequired(true)
          .addChoices(
            { name: 'Trivial', value: 'trivial' },
            { name: 'Minor', value: 'minor' },
            { name: 'Major', value: 'major' },
            { name: 'Life boon', value: 'life' },
          ),
      )
      .addStringOption((o) =>
        o.setName('reason').setDescription('What was the boon for?').setRequired(true).setMaxLength(300),
      )
      .addStringOption((o) =>
        o
          .setName('character')
          .setDescription('Your character (only needed if you have multiple)')
          .setRequired(false)
          .setAutocomplete(true),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('status')
      .setDescription('See boons owed to you and boons you owe.')
      .addStringOption((o) =>
        o
          .setName('character')
          .setDescription('Your character (only needed if you have multiple)')
          .setRequired(false)
          .setAutocomplete(true),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('repay')
      .setDescription('Propose or confirm repayment of a boon.')
      .addStringOption((o) =>
        o.setName('boon_id').setDescription('Which boon').setRequired(true).setAutocomplete(true),
      )
      .addStringOption((o) =>
        o
          .setName('character')
          .setDescription('Your character (only needed if you have multiple)')
          .setRequired(false)
          .setAutocomplete(true),
      ),
  );

export async function autocomplete(interaction: AutocompleteInteraction, ctx: CommandContext): Promise<void> {
  const focused = interaction.options.getFocused(true);
  const query = focused.value.toLowerCase();

  if (focused.name === 'debtor' || focused.name === 'character') {
    try {
      const roster = await ctx.adapter.getActiveRosterWithIds();
      let names = roster.characters.map((c) => c.name);
      if (focused.name === 'character') {
        names = roster.characters.filter((c) => c.discordId === interaction.user.id).map((c) => c.name);
      }
      const choices = names
        .filter((n) => query === '' || n.toLowerCase().includes(query))
        .slice(0, 25)
        .map((n) => ({ name: n, value: n }));
      await interaction.respond(choices);
    } catch {
      await interaction.respond([]);
    }
    return;
  }

  if (focused.name === 'boon_id') {
    const requestedCharacter = interaction.options.getString('character') ?? undefined;
    try {
      const result = await ctx.adapter.getBoonsForCharacter(interaction.user.id, requestedCharacter);
      if (!result) {
        await interaction.respond([]);
        return;
      }
      const choices = result.boons
        .filter((b) => b.status !== 'repaid')
        .map((b) => ({
          name: `#${b.id} — ${TIER_LABELS[b.tier] ?? b.tier} ${b.direction === 'owed_to_me' ? 'owed by' : 'owed to'} ${b.counterparty_name} (${b.status})`.slice(0, 100),
          value: String(b.id),
        }))
        .slice(0, 25);
      await interaction.respond(choices);
    } catch {
      await interaction.respond([]);
    }
    return;
  }

  await interaction.respond([]);
}

export async function execute(interaction: ChatInputCommandInteraction, ctx: CommandContext): Promise<void> {
  const sub = interaction.options.getSubcommand();
  if (sub === 'owe') {
    await handleOwe(interaction, ctx);
  } else if (sub === 'status') {
    await handleStatus(interaction, ctx);
  } else if (sub === 'repay') {
    await handleRepay(interaction, ctx);
  }
}

async function fetchPrestationChannel(interaction: ChatInputCommandInteraction): Promise<TextChannel | null> {
  const fetched = await interaction.client.channels.fetch((liveConfig.correspondencePrestationChannelId || config.correspondencePrestationChannelId)).catch(() => null);
  if (!fetched || !fetched.isTextBased() || !('send' in fetched)) return null;
  return fetched as TextChannel;
}

async function handleOwe(interaction: ChatInputCommandInteraction, ctx: CommandContext): Promise<void> {
  if (!(liveConfig.correspondencePrestationChannelId || config.correspondencePrestationChannelId)) {
    await interaction.reply({
      content: 'The prestation channel is not configured yet — ask a staff member to set `CORRESPONDENCE_PRESTATION_CHANNEL_ID`.',
      ephemeral: true,
    });
    return;
  }

  const requestedCharacter = interaction.options.getString('character');
  const ownership = await resolveOwnedCharacter(ctx.adapter, interaction.user.id, requestedCharacter);
  if (!ownership.ok) {
    await interaction.reply({ content: ownership.errorMessage, ephemeral: true });
    return;
  }

  const debtor = interaction.options.getString('debtor', true).trim();
  const tier = interaction.options.getString('tier', true) as BoonTier;
  const reason = interaction.options.getString('reason', true).trim();

  if (debtor.toLowerCase() === ownership.characterName.toLowerCase()) {
    await interaction.reply({ content: "A character can't owe a boon to themself.", ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  const result = await ctx.adapter.createBoon(
    { requesterDiscordId: interaction.user.id, requesterDiscordName: interaction.user.username },
    { creditorCharacterName: ownership.characterName, debtorCharacterName: debtor, tier, reason },
  );
  if (!result.ok || !result.boon) {
    await interaction.editReply(`Could not record the boon: ${result.message}`);
    return;
  }

  const channel = await fetchPrestationChannel(interaction);
  if (!channel) {
    await interaction.editReply('Boon recorded, but the prestation channel could not be found — ask staff to check the configured channel ID.');
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle('🩸 Boon Owed')
    .setColor(_BLOOD)
    .addFields(
      { name: 'Creditor', value: result.boon.creditor_character_name, inline: true },
      { name: 'Debtor', value: result.boon.debtor_character_name, inline: true },
      { name: 'Tier', value: tierBadge(result.boon.tier), inline: true },
      { name: 'Reason', value: result.boon.reason || '—', inline: false },
    )
    .setFooter({ text: `Boon #${result.boon.id} — use /prestation repay to settle.` })
    .setTimestamp();

  let debtorMention = '';
  try {
    const roster = await ctx.adapter.getActiveRosterWithIds();
    const debtorName = result.boon.debtor_character_name.toLowerCase();
    const debtorCharacter = roster.characters.find((c) => c.name.toLowerCase() === debtorName);
    if (debtorCharacter?.discordId) {
      debtorMention = `<@${debtorCharacter.discordId}>`;
    }
  } catch {
    debtorMention = '';
  }

  try {
    await channel.send({ content: debtorMention || undefined, embeds: [embed] });
  } catch (err) {
    await interaction.editReply(`Boon recorded, but could not post to the channel: ${errorToMessage(err)}`);
    return;
  }

  await interaction.editReply(`Boon #${result.boon.id} recorded — ${result.boon.debtor_character_name} owes you.`);
}

async function handleStatus(interaction: ChatInputCommandInteraction, ctx: CommandContext): Promise<void> {
  const requestedCharacter = interaction.options.getString('character');
  const ownership = await resolveOwnedCharacter(ctx.adapter, interaction.user.id, requestedCharacter);
  if (!ownership.ok) {
    await interaction.reply({ content: ownership.errorMessage, ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  const result = await ctx.adapter.getBoonsForCharacter(interaction.user.id, ownership.characterName);
  if (!result) {
    await interaction.editReply('No active character found.');
    return;
  }

  const owedToMe = result.boons.filter((b) => b.direction === 'owed_to_me');
  const iOwe = result.boons.filter((b) => b.direction === 'i_owe');

  const lineFor = (b: (typeof result.boons)[number]) =>
    `#${b.id} — ${b.counterparty_name} — ${tierBadge(b.tier)} — *${b.status}*${b.reason ? ` — ${b.reason}` : ''}`;

  const embed = new EmbedBuilder()
    .setTitle(`🩸 ${result.character_name}'s Boons`)
    .setColor(_BLOOD)
    .addFields(
      { name: 'Owed to you', value: owedToMe.length ? owedToMe.map(lineFor).join('\n') : '—', inline: false },
      { name: 'You owe', value: iOwe.length ? iOwe.map(lineFor).join('\n') : '—', inline: false },
    );

  await interaction.editReply({ embeds: [embed] });
}

async function handleRepay(interaction: ChatInputCommandInteraction, ctx: CommandContext): Promise<void> {
  if (!(liveConfig.correspondencePrestationChannelId || config.correspondencePrestationChannelId)) {
    await interaction.reply({
      content: 'The prestation channel is not configured yet — ask a staff member to set `CORRESPONDENCE_PRESTATION_CHANNEL_ID`.',
      ephemeral: true,
    });
    return;
  }

  const requestedCharacter = interaction.options.getString('character');
  const ownership = await resolveOwnedCharacter(ctx.adapter, interaction.user.id, requestedCharacter);
  if (!ownership.ok) {
    await interaction.reply({ content: ownership.errorMessage, ephemeral: true });
    return;
  }

  const boonIdRaw = interaction.options.getString('boon_id', true).trim();
  const boonId = Number(boonIdRaw);
  if (!Number.isInteger(boonId) || boonId <= 0) {
    await interaction.reply({ content: 'Pick a boon from the autocomplete list.', ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  const result = await ctx.adapter.actOnBoonRepay(boonId, {
    requesterDiscordId: interaction.user.id,
    requesterDiscordName: interaction.user.username,
  });
  if (!result.ok || !result.boon) {
    await interaction.editReply(`Could not update the boon: ${result.message}`);
    return;
  }

  const channel = await fetchPrestationChannel(interaction);
  const boon = result.boon;
  const summaryLine =
    boon.status === 'repaid'
      ? `✅ Boon #${boon.id} repaid — ${boon.creditor_character_name} ↔ ${boon.debtor_character_name}.`
      : `🔸 Repayment of Boon #${boon.id} proposed by ${boon.debtor_character_name} — awaiting confirmation from ${boon.creditor_character_name}.`;

  if (channel) {
    try {
      await channel.send({ content: summaryLine });
    } catch {
      // Non-fatal — the ephemeral reply below still confirms the state change.
    }
  }

  await interaction.editReply(summaryLine);
}
