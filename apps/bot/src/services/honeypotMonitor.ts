import { EmbedBuilder, type Client, type Message } from 'discord.js';
import { errorToMessage, logEvent } from '../logger';

/**
 * Bans anyone who posts in a hidden "bait" channel that only unverified/new
 * accounts and spam bots can see. Deny "View Channel" for the normal member
 * role on that channel so real members never trigger it.
 */
export type HoneypotConfig = {
  enabled: boolean;
  channelId: string;
  modLogChannelId: string;
  whitelistedRoleIds: Set<string>;
  requireYoungAccount: boolean;
  maxAccountAgeDays: number;
};

const BAN_REASON = 'Honeypot trigger: posted in bait channel (auto-detected spam)';
const DELETE_MESSAGE_SECONDS = 86_400; // purge 1 day of the banned user's messages

function accountAgeDays(createdTimestamp: number): number {
  return (Date.now() - createdTimestamp) / 86_400_000;
}

export function startHoneypotMonitor(client: Client, cfg: HoneypotConfig): void {
  client.on('messageCreate', (message) => {
    handleMessage(message, cfg).catch((error) =>
      logEvent('error', 'honeypot_monitor_error', { error: errorToMessage(error) }),
    );
  });

  logEvent('info', 'honeypot_monitor_started', {
    enabled: cfg.enabled,
    channelId: cfg.channelId || null,
  });
}

async function handleMessage(message: Message, cfg: HoneypotConfig): Promise<void> {
  if (!cfg.enabled) return;
  if (!cfg.channelId || message.channelId !== cfg.channelId) return;
  if (message.author.bot) return;

  const guild = message.guild;
  const member = message.member;
  if (!guild || !member) return;

  if (member.roles.cache.some((role) => cfg.whitelistedRoleIds.has(role.id))) {
    logEvent('info', 'honeypot_whitelisted_skip', { userId: member.id });
    return;
  }

  const ageDays = accountAgeDays(message.author.createdTimestamp);
  if (cfg.requireYoungAccount && ageDays > cfg.maxAccountAgeDays) {
    logEvent('info', 'honeypot_old_account_skip', { userId: member.id, ageDays });
    return;
  }

  const contentPreview = message.content ? message.content.slice(0, 500) : '(no text content)';

  try {
    await message.delete();
  } catch (error) {
    logEvent('warn', 'honeypot_delete_failed', { userId: member.id, error: errorToMessage(error) });
  }

  try {
    await guild.members.ban(member.id, {
      reason: BAN_REASON,
      deleteMessageSeconds: DELETE_MESSAGE_SECONDS,
    });
    logEvent('info', 'honeypot_ban_applied', { userId: member.id, userTag: message.author.tag, ageDays });
  } catch (error) {
    logEvent('error', 'honeypot_ban_failed', { userId: member.id, error: errorToMessage(error) });
    return;
  }

  if (!cfg.modLogChannelId) return;

  const logChannel = await guild.channels.fetch(cfg.modLogChannelId).catch(() => null);
  if (!logChannel?.isTextBased()) return;

  const embed = new EmbedBuilder()
    .setTitle('\u{1F36F} Honeypot Triggered — User Banned')
    .setColor(0xcc0000)
    .setTimestamp(new Date())
    .addFields(
      { name: 'User', value: `${message.author.tag} (${member.id})`, inline: false },
      { name: 'Account age', value: `${ageDays.toFixed(1)} days`, inline: true },
      { name: 'Channel', value: `<#${message.channelId}>`, inline: true },
      { name: 'Message content', value: contentPreview, inline: false },
    );

  try {
    await logChannel.send({ embeds: [embed] });
  } catch (error) {
    logEvent('warn', 'honeypot_modlog_failed', { error: errorToMessage(error) });
  }
}
