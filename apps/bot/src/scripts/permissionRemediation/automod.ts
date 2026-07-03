import {
  AutoModerationActionType,
  AutoModerationRuleEventType,
  AutoModerationRuleTriggerType,
  type AutoModerationRule,
  type Guild,
} from 'discord.js';

export type AutomodOptions = {
  limit: number;
  timeoutMinutes: number;
  alertChannelId?: string;
};

export type AutomodResult = { created: boolean; rule: AutoModerationRule };

/**
 * Creates Discord's native AutoMod "mention spam" rule if one doesn't
 * already exist. This is the PRIMARY defense against mass-mention raids —
 * it blocks the message server-side before notifications fan out, and keeps
 * working when this bot is offline. NOT covered by snapshot/restore: it's a
 * one-time setup action, not role/channel state (see plan's known
 * limitations — undoing this later means a manual
 * guild.autoModerationRules.delete(ruleId)).
 */
export async function ensureMentionSpamAutomodRule(guild: Guild, options: AutomodOptions): Promise<AutomodResult> {
  const rules = await guild.autoModerationRules.fetch();
  const existing = rules.find((r) => r.triggerType === AutoModerationRuleTriggerType.MentionSpam);
  if (existing) {
    return { created: false, rule: existing };
  }

  const actions = [
    { type: AutoModerationActionType.BlockMessage },
    {
      type: AutoModerationActionType.Timeout,
      metadata: { durationSeconds: options.timeoutMinutes * 60 },
    },
  ];
  if (options.alertChannelId) {
    actions.push({
      type: AutoModerationActionType.SendAlertMessage,
      metadata: { channel: options.alertChannelId },
    } as never);
  }

  const rule = await guild.autoModerationRules.create({
    name: 'Block mention spam (mass role/user pings)',
    eventType: AutoModerationRuleEventType.MessageSend,
    triggerType: AutoModerationRuleTriggerType.MentionSpam,
    triggerMetadata: {
      mentionTotalLimit: options.limit,
      mentionRaidProtectionEnabled: true,
    },
    actions,
    enabled: true,
    reason: 'Permission remediation: server-side mass-mention blocking',
  });

  return { created: true, rule };
}
