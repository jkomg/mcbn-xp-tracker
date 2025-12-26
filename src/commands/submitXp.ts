import { SlashCommandBuilder } from 'discord.js';
import { fetchDiscordMessageFromLink } from '../utils/linkValidator';

export const data = new SlashCommandBuilder()
  .setName('submit-xp')
  .setDescription('Submit XP for this character (use in the character channel)')
  .addStringOption((o) => o.setName('character').setDescription('Character id or name').setRequired(true))
  .addBooleanOption((o) => o.setName('posted').setDescription('Posted at least once during the play period'))
  .addBooleanOption((o) => o.setName('hunting').setDescription('Hunting and/or awakening scene'))
  .addBooleanOption((o) => o.setName('scene').setDescription('Participating in a scene with another character'))
  .addBooleanOption((o) => o.setName('conflict').setDescription('Engaged in conflict with another character'))
  .addBooleanOption((o) => o.setName('combat').setDescription('Engaged in combat with another character'))
  .addBooleanOption((o) => o.setName('stain').setDescription('Took an unmitigated stain'))
  .addStringOption((o) => o.setName('links').setDescription('Comma-separated Discord message links for each selected criterion (match order)').setRequired(true))
  .addStringOption((o) => o.setName('notes').setDescription('Optional notes'))
  ;

export const name = 'submit-xp';

export async function execute(interaction: any, { prisma, client }: any) {
  const guildId = interaction.guildId;
  const actorId = interaction.user.id;
  const charKey = interaction.options.getString('character', true);

  if (guildId) {
    await prisma.guild.upsert({
      where: { id: guildId },
      update: {},
      create: { id: guildId },
    });
  }

  await prisma.user.upsert({
    where: { id: actorId },
    update: { username: interaction.user.tag },
    create: { id: actorId, username: interaction.user.tag },
  });

  // Lookup character by id or name within this guild
  const character = await prisma.character.findFirst({
    where: { guildId, OR: [{ id: charKey }, { name: charKey }] },
  });
  if (!character) {
    await interaction.reply({ content: 'Character not found in this server. Make sure to register and link the channel.', ephemeral: true });
    return;
  }

  // Enforce that this must be the character's channel if character.channelId is configured
  if (character.channelId && interaction.channelId !== character.channelId) {
    await interaction.reply({ content: `Submissions must be made in the linked character channel <#${character.channelId}>. Please submit there.`, ephemeral: true });
    return;
  }

  // ensure submitter owns the character
  if (character.ownerId !== actorId) {
    await interaction.reply({ content: 'You are not the owner of that character.', ephemeral: true });
    return;
  }

  // Build criteria object and collect selected flags
  const criteriaFlags = {
    posted: interaction.options.getBoolean('posted') ?? false,
    hunting: interaction.options.getBoolean('hunting') ?? false,
    scene: interaction.options.getBoolean('scene') ?? false,
    conflict: interaction.options.getBoolean('conflict') ?? false,
    combat: interaction.options.getBoolean('combat') ?? false,
    stain: interaction.options.getBoolean('stain') ?? false,
  };

  const selectedCriteria = Object.entries(criteriaFlags).filter(([, v]) => v).map(([k]) => k);
  const expectedLinksCount = selectedCriteria.length;
  const linksRaw = interaction.options.getString('links', true);
  const links = linksRaw.split(',').map((s) => s.trim()).filter(Boolean);

  if (expectedLinksCount === 0) {
    await interaction.reply({ content: 'You did not select any criteria. Select at least one criterion to submit.', ephemeral: true });
    return;
  }

  if (links.length !== expectedLinksCount) {
    await interaction.reply({ content: `You selected ${expectedLinksCount} criteria but provided ${links.length} link(s). Please provide one Discord message link per selected criterion, in the same order.`, ephemeral: true });
    return;
  }

  // Validate each provided link: must be a Discord message link authored by the character owner and in the character's channel.
  try {
    const validatedMessages: any[] = [];
    for (const link of links) {
      const msg = await fetchDiscordMessageFromLink(client, link, {
        expectedGuildId: guildId,
        expectedChannelId: character.channelId || undefined,
        expectedAuthorId: character.ownerId,
      });
      validatedMessages.push(msg);
    }
    // If all succeeded, continue
  } catch (err: any) {
    await interaction.reply({ content: `Evidence validation failed: ${err.message}`, ephemeral: true });
    return;
  }

  // Determine current window
  const currentWindow = await prisma.submissionWindow.findFirst({
    where: { guildId, startAt: { lte: new Date() }, endAt: { gte: new Date() } },
    orderBy: { startAt: 'desc' },
  });

  if (!currentWindow) {
    await interaction.reply({ content: 'There is no active submission window right now. Please wait until the next window opens.', ephemeral: true });
    return;
  }

  const xpAmount = expectedLinksCount; // 1 XP per criterion

  // Create XP submission (pending)
  const submission = await prisma.xpSubmission.create({
    data: {
      windowId: currentWindow.id,
      characterId: character.id,
      submitterId: actorId,
      xpAmount,
      criteria: criteriaFlags,
      evidenceUrls: links,
      notes: interaction.options.getString('notes') ?? null,
      status: 'pending',
    },
  });

  // Forward to staff review channel
  const guildConfig = (await prisma.guild.findUnique({ where: { id: guildId } }))?.config as any;
  const staffChannelId = guildConfig?.staffReviewChannelId || process.env.TEST_STAFF_CHANNEL;
  if (staffChannelId) {
    const staffChannel = await client.channels.fetch(staffChannelId).catch(() => null);
    if (staffChannel && 'send' in staffChannel) {
      const lines = [
        `**New XP submission** — id: \`${submission.id}\``,
        `Character: **${character.name}** — owner: <@${actorId}>`,
        `XP: **${xpAmount}**`,
        `Criteria: ${selectedCriteria.join(', ')}`,
        `Evidence: ${links.join(' , ')}`,
        `Notes: ${submission.notes ?? '—'}`,
        `Review with: /submission review id:${submission.id} action:accept|reject`,
      ];
      // @ts-ignore
      await staffChannel.send({ content: lines.join('\n') }).catch(() => null);
    }
  }

  await interaction.reply({ content: `Submission received and forwarded to staff for review (id ${submission.id}).`, ephemeral: true });
}
