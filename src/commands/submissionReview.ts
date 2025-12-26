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
  .setName('submission')
  .setDescription('Review XP submissions (staff only)')
  .addSubcommand((s) =>
    s.setName('review')
      .setDescription('Accept or reject a submission')
      .addStringOption((o) => o.setName('id').setDescription('Submission id').setRequired(true))
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

export const name = 'submission';

export async function execute(interaction: any, { prisma }: any) {
  if (!interaction.guildId) {
    await interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true });
    return;
  }

  const guild = await prisma.guild.upsert({
    where: { id: interaction.guildId },
    update: {},
    create: { id: interaction.guildId },
  });
  const config = parseConfig(guild.config);

  if (!memberHasRole(interaction.member, config.storytellerRoleId)) {
    await interaction.reply({ content: 'You do not have permission to review submissions.', ephemeral: true });
    return;
  }

  const sub = interaction.options.getSubcommand();
  if (sub !== 'review') return;

  const submissionId = interaction.options.getString('id', true);
  const action = interaction.options.getString('action', true);
  const notes = interaction.options.getString('notes') ?? null;

  const submission = await prisma.xpSubmission.findUnique({
    where: { id: submissionId },
    include: { character: true },
  });

  if (!submission) {
    await interaction.reply({ content: 'Submission not found.', ephemeral: true });
    return;
  }

  if (submission.status !== 'pending') {
    await interaction.reply({ content: `Submission is already ${submission.status}.`, ephemeral: true });
    return;
  }

  const reviewerId = interaction.user.id;
  await prisma.user.upsert({
    where: { id: reviewerId },
    update: { username: interaction.user.tag },
    create: { id: reviewerId, username: interaction.user.tag },
  });

  if (action === 'reject') {
    await prisma.xpSubmission.update({
      where: { id: submissionId },
      data: { status: 'rejected', reviewerId, reviewedAt: new Date(), notes },
    });
    await interaction.reply({ content: `Submission ${submissionId} rejected.`, ephemeral: true });
    return;
  }

  await prisma.xpSubmission.update({
    where: { id: submissionId },
    data: { status: 'accepted', reviewerId, reviewedAt: new Date(), notes },
  });

  await prisma.xpTransaction.create({
    data: {
      characterId: submission.characterId,
      amount: submission.xpAmount,
      type: 'submission',
      reason: `XP submission ${submission.id}`,
      performedBy: reviewerId,
    },
  });

  await interaction.reply({ content: `Submission ${submissionId} accepted and XP granted.`, ephemeral: true });
}
