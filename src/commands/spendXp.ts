import { SlashCommandBuilder } from 'discord.js';

type GuildConfig = {
  storytellerRoleId?: string;
};

function parseConfig(config: unknown): GuildConfig {
  if (!config || typeof config !== 'object') return {};
  return config as GuildConfig;
}

function memberHasRole(member: any, roleId: string | undefined) {
  if (!roleId || !member?.roles?.cache) return false;
  return member.roles.cache.has(roleId);
}

export const data = new SlashCommandBuilder()
  .setName('spend')
  .setDescription('Request or review XP spends')
  .addSubcommand((s) =>
    s.setName('request')
      .setDescription('Request to spend XP')
      .addStringOption((o) => o.setName('character').setDescription('Character id or name').setRequired(true))
      .addStringOption((o) => o.setName('type').setDescription('Type of spend, e.g. attribute, skill').setRequired(true))
      .addIntegerOption((o) => o.setName('value').setDescription('New value or dots purchased').setRequired(true))
      .addIntegerOption((o) => o.setName('cost').setDescription('XP cost').setRequired(true))
      .addStringOption((o) => o.setName('reason').setDescription('Optional reason')),
  )
  .addSubcommand((s) =>
    s.setName('review')
      .setDescription('Accept or reject a spend request')
      .addStringOption((o) => o.setName('id').setDescription('Spend request id').setRequired(true))
      .addStringOption((o) =>
        o.setName('action')
          .setDescription('accept or reject')
          .addChoices(
            { name: 'accept', value: 'accept' },
            { name: 'reject', value: 'reject' },
          )
          .setRequired(true),
      )
      .addStringOption((o) => o.setName('notes').setDescription('Optional review notes')),
  );

export const name = 'spend';

export async function execute(interaction: any, { prisma }: any) {
  if (!interaction.guildId) {
    await interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true });
    return;
  }

  const sub = interaction.options.getSubcommand();
  const guild = await prisma.guild.upsert({
    where: { id: interaction.guildId },
    update: {},
    create: { id: interaction.guildId },
  });
  const config = parseConfig(guild.config);

  if (sub === 'request') {
    const actorId = interaction.user.id;
    const charKey = interaction.options.getString('character', true);
    const type = interaction.options.getString('type', true);
    const value = interaction.options.getInteger('value', true);
    const cost = interaction.options.getInteger('cost', true);
    const reason = interaction.options.getString('reason') ?? null;

    await prisma.user.upsert({
      where: { id: actorId },
      update: { username: interaction.user.tag },
      create: { id: actorId, username: interaction.user.tag },
    });

    const character = await prisma.character.findFirst({
      where: { guildId: interaction.guildId, OR: [{ id: charKey }, { name: charKey }] },
    });

    if (!character) {
      await interaction.reply({ content: 'Character not found in this server.', ephemeral: true });
      return;
    }

    if (character.ownerId !== actorId) {
      await interaction.reply({ content: 'You are not the owner of that character.', ephemeral: true });
      return;
    }

    const request = await prisma.xpSpendRequest.create({
      data: {
        characterId: character.id,
        requesterId: actorId,
        type,
        value,
        cost,
        reason,
        status: 'pending',
      },
    });

    await interaction.reply({
      content: `Spend request submitted (id ${request.id}). Staff can review with /spend review id:${request.id} action:accept|reject.`,
      ephemeral: true,
    });
    return;
  }

  if (sub === 'review') {
    if (!memberHasRole(interaction.member, config.storytellerRoleId)) {
      await interaction.reply({ content: 'You do not have permission to review spend requests.', ephemeral: true });
      return;
    }

    const requestId = interaction.options.getString('id', true);
    const action = interaction.options.getString('action', true);
    const notes = interaction.options.getString('notes') ?? null;
    const reviewerId = interaction.user.id;

    const request = await prisma.xpSpendRequest.findUnique({
      where: { id: requestId },
      include: { character: true },
    });

    if (!request) {
      await interaction.reply({ content: 'Spend request not found.', ephemeral: true });
      return;
    }

    if (request.status !== 'pending') {
      await interaction.reply({ content: `Spend request is already ${request.status}.`, ephemeral: true });
      return;
    }

    await prisma.user.upsert({
      where: { id: reviewerId },
      update: { username: interaction.user.tag },
      create: { id: reviewerId, username: interaction.user.tag },
    });

    if (action === 'reject') {
      await prisma.xpSpendRequest.update({
        where: { id: requestId },
        data: { status: 'rejected', reviewerId, reviewedAt: new Date(), reason: notes ?? request.reason },
      });
      await interaction.reply({ content: `Spend request ${requestId} rejected.`, ephemeral: true });
      return;
    }

    await prisma.xpSpendRequest.update({
      where: { id: requestId },
      data: { status: 'accepted', reviewerId, reviewedAt: new Date(), reason: notes ?? request.reason },
    });

    await prisma.xpTransaction.create({
      data: {
        characterId: request.characterId,
        amount: -Math.abs(request.cost),
        type: 'spend',
        reason: `XP spend ${request.id}`,
        performedBy: reviewerId,
      },
    });

    await interaction.reply({ content: `Spend request ${requestId} accepted and XP deducted.`, ephemeral: true });
  }
}
