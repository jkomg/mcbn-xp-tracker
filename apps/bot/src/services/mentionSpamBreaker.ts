import { EmbedBuilder, type Client, type Message } from 'discord.js';
import { errorToMessage, logEvent } from '../logger';

/**
 * Circuit breaker for mass-mention spam (sleeper-bot role-ping raids).
 *
 * This is the damage-containment backstop, not the primary defense: Discord's
 * native AutoMod mention-spam rule blocks the message BEFORE notifications
 * fan out, while this service can only act after delivery. Keep both enabled
 * — this layer stops repeat pings, times out the author, and alerts staff
 * even if AutoMod is misconfigured or the rule gets deleted.
 * See scripts: npm run ops:audit-mentions -- --setup-automod
 */
export type MentionSpamBreakerConfig = {
  enabled: boolean;
  /** Messages with MORE than this many unique user+role mentions trip the breaker. */
  maxMentions: number;
  /** Timeout applied to the author, in minutes. */
  timeoutMinutes: number;
  /** Role IDs exempt from the breaker (staff, trusted bots' roles). */
  exemptRoleIds: Set<string>;
  /** Channel for audit embeds; falls back silently if unset/unreachable. */
  modLogChannelId: string;
};

const TRIP_REASON = 'Mention-spam circuit breaker: mass mentions in one message';

function countUniqueMentions(message: Message): number {
  // @everyone/@here is the worst case — count it as over any sane limit.
  const everyone = message.mentions.everyone ? 1000 : 0;
  return message.mentions.users.size + message.mentions.roles.size + everyone;
}

export function startMentionSpamBreaker(client: Client, cfg: MentionSpamBreakerConfig): void {
  client.on('messageCreate', (message) => {
    handleMessage(message, cfg).catch((error) =>
      logEvent('error', 'mention_breaker_error', { error: errorToMessage(error) }),
    );
  });

  logEvent('info', 'mention_breaker_started', {
    enabled: cfg.enabled,
    maxMentions: cfg.maxMentions,
    timeoutMinutes: cfg.timeoutMinutes,
  });
}

async function handleMessage(message: Message, cfg: MentionSpamBreakerConfig): Promise<void> {
  if (!cfg.enabled) return;
  if (message.author.bot) return;

  const guild = message.guild;
  const member = message.member;
  if (!guild || !member) return;

  if (member.roles.cache.some((role) => cfg.exemptRoleIds.has(role.id))) return;

  const mentionCount = countUniqueMentions(message);
  if (mentionCount <= cfg.maxMentions) return;

  const contentPreview = message.content ? message.content.slice(0, 500) : '(no text content)';

  try {
    await message.delete();
  } catch (error) {
    logEvent('warn', 'mention_breaker_delete_failed', {
      userId: member.id,
      error: errorToMessage(error),
    });
  }

  let timedOut = false;
  try {
    await member.timeout(cfg.timeoutMinutes * 60_000, TRIP_REASON);
    timedOut = true;
  } catch (error) {
    logEvent('error', 'mention_breaker_timeout_failed', {
      userId: member.id,
      error: errorToMessage(error),
    });
  }

  logEvent('warn', 'mention_breaker_tripped', {
    userId: member.id,
    userTag: message.author.tag,
    channelId: message.channelId,
    mentionCount,
    timedOut,
  });

  if (!cfg.modLogChannelId) return;

  const logChannel = await guild.channels.fetch(cfg.modLogChannelId).catch(() => null);
  if (!logChannel?.isTextBased()) return;

  const embed = new EmbedBuilder()
    .setTitle('⚠️ Mention Spam Blocked')
    .setColor(0xe67e22)
    .setTimestamp(new Date())
    .setDescription(
      timedOut
        ? `Message deleted and author timed out for ${cfg.timeoutMinutes} minutes. Review and ban if malicious.`
        : 'Message deleted but **timeout failed** — check role hierarchy/permissions and act manually.',
    )
    .addFields(
      { name: 'User', value: `${message.author.tag} (<@${member.id}>)`, inline: false },
      { name: 'Unique mentions', value: String(Math.min(mentionCount, 999)), inline: true },
      { name: 'Channel', value: `<#${message.channelId}>`, inline: true },
      { name: 'Message content', value: contentPreview, inline: false },
    );

  try {
    await logChannel.send({ embeds: [embed] });
  } catch (error) {
    logEvent('warn', 'mention_breaker_modlog_failed', { error: errorToMessage(error) });
  }
}
