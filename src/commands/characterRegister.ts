import { SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('character')
  .setDescription('Character management')
  .addSubcommand((s) =>
    s.setName('register')
      .setDescription('Register a character')
      .addStringOption((o) => o.setName('name').setDescription('Character name').setRequired(true))
      .addStringOption((o) => o.setName('clan').setDescription('Clan (optional)'))
      .addStringOption((o) => o.setName('sheet').setDescription('Sheet URL (optional)'))
      .addChannelOption((o) => o.setName('channel').setDescription('Character channel (optional)')),
  )
  .addSubcommand((s) => s.setName('list').setDescription('List your characters'));

export const name = 'character';
export async function execute(interaction: any, { prisma }: any) {
  const sub = interaction.options.getSubcommand();
  const discordUserId = interaction.user.id;
  if (sub === 'register') {
    if (interaction.guildId) {
      await prisma.guild.upsert({
        where: { id: interaction.guildId },
        update: {},
        create: { id: interaction.guildId },
      });
    }

    const name = interaction.options.getString('name', true);
    const clan = interaction.options.getString('clan') ?? null;
    const sheet = interaction.options.getString('sheet') ?? null;
    const channel = interaction.options.getChannel('channel') ?? null;

    // enforce 2-character limit
    const existing = await prisma.character.count({ where: { ownerId: discordUserId } });
    if (existing >= 2) {
      await interaction.reply({ content: 'You already have 2 characters registered. Contact staff for exceptions.', ephemeral: true });
      return;
    }

    // upsert user
    await prisma.user.upsert({
      where: { id: discordUserId },
      update: { username: interaction.user.tag },
      create: { id: discordUserId, username: interaction.user.tag },
    });

    const created = await prisma.character.create({
      data: {
        ownerId: discordUserId,
        guildId: interaction.guildId,
        name,
        clan,
        sheetUrl: sheet,
        channelId: channel ? channel.id : null,
      },
    });

    await interaction.reply({ content: `Character ${name} registered (id: ${created.id}).`, ephemeral: true });
    return;
  } else if (sub === 'list') {
    const chars = await prisma.character.findMany({ where: { ownerId: discordUserId, guildId: interaction.guildId } });
    if (chars.length === 0) {
      await interaction.reply({ content: 'You have no characters registered.', ephemeral: true });
      return;
    }
    const lines = chars.map((c) => `• ${c.name} (${c.clan ?? '—'}) — channel: ${c.channelId ?? 'not linked'}`);
    await interaction.reply({ content: lines.join('\n'), ephemeral: true });
    return;
  }
}
