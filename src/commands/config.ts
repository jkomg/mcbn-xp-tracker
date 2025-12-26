import { SlashCommandBuilder, ChannelType } from 'discord.js';

type GuildConfig = {
  timezone?: string;
  windowLengthHours?: number;
  anchorWeekday?: number;
  anchorHour?: number;
  staffReviewChannelId?: string;
  storytellerRoleId?: string;
};

function parseConfig(config: unknown): GuildConfig {
  if (!config || typeof config !== 'object') return {};
  return config as GuildConfig;
}

export const data = new SlashCommandBuilder()
  .setName('config')
  .setDescription('Configure guild settings for the XP tracker')
  .addSubcommand((s) =>
    s.setName('set-schedule')
      .setDescription('Set submission window schedule defaults')
      .addStringOption((o) => o.setName('timezone').setDescription('IANA timezone, e.g. America/Chicago'))
      .addIntegerOption((o) => o.setName('window_hours').setDescription('Window length in hours'))
      .addIntegerOption((o) => o.setName('anchor_weekday').setDescription('1=Mon ... 7=Sun'))
      .addIntegerOption((o) => o.setName('anchor_hour').setDescription('Hour of day (0-23) for anchor')),
  )
  .addSubcommand((s) =>
    s.setName('set-review-channel')
      .setDescription('Set the staff review channel for submissions')
      .addChannelOption((o) =>
        o.setName('channel')
          .setDescription('Channel to post staff reviews')
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(true),
      ),
  )
  .addSubcommand((s) =>
    s.setName('set-storyteller-role')
      .setDescription('Set the storyteller/staff role required to review')
      .addRoleOption((o) => o.setName('role').setDescription('Role allowed to review').setRequired(true)),
  )
  .addSubcommand((s) => s.setName('show').setDescription('Show current configuration'));

export const name = 'config';

export async function execute(interaction: any, { prisma }: any) {
  if (!interaction.guildId) {
    await interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true });
    return;
  }

  const sub = interaction.options.getSubcommand();
  const guildId = interaction.guildId;

  const existingGuild = await prisma.guild.upsert({
    where: { id: guildId },
    update: {},
    create: { id: guildId },
  });

  const config = parseConfig(existingGuild.config);

  if (sub === 'set-schedule') {
    const timezone = interaction.options.getString('timezone') ?? config.timezone;
    const windowLengthHours = interaction.options.getInteger('window_hours') ?? config.windowLengthHours;
    const anchorWeekday = interaction.options.getInteger('anchor_weekday') ?? config.anchorWeekday;
    const anchorHour = interaction.options.getInteger('anchor_hour') ?? config.anchorHour;

    const updated: GuildConfig = {
      ...config,
      timezone,
      windowLengthHours,
      anchorWeekday,
      anchorHour,
    };

    await prisma.guild.update({
      where: { id: guildId },
      data: { config: updated },
    });

    await interaction.reply({
      content: [
        'Schedule updated.',
        `Timezone: ${updated.timezone ?? 'default'}`,
        `Window length (hours): ${updated.windowLengthHours ?? 'default'}`,
        `Anchor weekday: ${updated.anchorWeekday ?? 'default'}`,
        `Anchor hour: ${updated.anchorHour ?? 'default'}`,
      ].join('\n'),
      ephemeral: true,
    });
    return;
  }

  if (sub === 'set-review-channel') {
    const channel = interaction.options.getChannel('channel', true);
    const updated: GuildConfig = { ...config, staffReviewChannelId: channel.id };
    await prisma.guild.update({
      where: { id: guildId },
      data: { config: updated },
    });
    await interaction.reply({ content: `Staff review channel set to <#${channel.id}>.`, ephemeral: true });
    return;
  }

  if (sub === 'set-storyteller-role') {
    const role = interaction.options.getRole('role', true);
    const updated: GuildConfig = { ...config, storytellerRoleId: role.id };
    await prisma.guild.update({
      where: { id: guildId },
      data: { config: updated },
    });
    await interaction.reply({ content: `Storyteller role set to <@&${role.id}>.`, ephemeral: true });
    return;
  }

  if (sub === 'show') {
    await interaction.reply({
      content: [
        '**Current config**',
        `Timezone: ${config.timezone ?? 'default (America/Chicago)'}`,
        `Window length (hours): ${config.windowLengthHours ?? 'default (168)'}`,
        `Anchor weekday: ${config.anchorWeekday ?? 'default (7/Sun)'}`,
        `Anchor hour: ${config.anchorHour ?? 'default (12)'}`,
        `Staff review channel: ${config.staffReviewChannelId ? `<#${config.staffReviewChannelId}>` : 'not set'}`,
        `Storyteller role: ${config.storytellerRoleId ? `<@&${config.storytellerRoleId}>` : 'not set'}`,
      ].join('\n'),
      ephemeral: true,
    });
  }
}
