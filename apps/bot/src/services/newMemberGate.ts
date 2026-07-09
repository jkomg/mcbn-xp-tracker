import { ActionRowBuilder, ButtonBuilder, ButtonStyle, type Client, type Message } from 'discord.js';
import { liveConfig } from '../liveConfig';
import { errorToMessage, logEvent } from '../logger';

/**
 * New-member "jail" gate: a raid/spam account that joins and instantly
 * clicks through Discord's native onboarding UI (a real incident — see
 * docs/RELEASE notes) can self-grant onboarding roles in milliseconds,
 * something a genuine new player can't be distinguished from by click speed
 * alone. This service replaces that with a message-gate — a member must
 * actually post real text in the welcome channel before being offered real
 * server access, which a scripted click-through can't fake as cheaply.
 *
 * The channel-permission side of this (closing off ~90 previously-open
 * channels, restricting the welcome channel to plain text) is handled by
 * the one-time migration in scripts/newMemberGate/migrateChannelAccess.ts —
 * this service only handles the live prompt-and-grant flow after that
 * migration is in place.
 *
 * All config is read live from liveConfig on every event — dashboard
 * changes (Settings → Bot — Feature Flags / Channel IDs) apply within ~1
 * minute, no bot restart needed (same convention as honeypotMonitor.ts).
 * The verified-role id reuses liveConfig.verifiedMemberRoleId, already
 * dashboard-configurable for the honeypot's permissions audit.
 */

const BUTTON_PREFIX = 'new-member-gate:';

/**
 * The target user's ID is encoded directly in the customId (matching
 * claimReminderInteractions.ts's pattern) — confirmed live that without
 * this, ANY member who can see #welcome (including another brand-new,
 * unverified account) could click a button attached to someone else's
 * greeting and grant themselves roles without ever posting a message
 * themselves, defeating the entire point of the message-gate.
 */
export function buildButtonId(choice: 'player' | 'lurker', targetUserId: string): string {
  return `${BUTTON_PREFIX}${choice}:${targetUserId}`;
}

export function parseButtonId(customId: string): { choice: 'player' | 'lurker'; targetUserId: string } | null {
  if (!customId.startsWith(BUTTON_PREFIX)) return null;
  const [choice, targetUserId] = customId.slice(BUTTON_PREFIX.length).split(':', 2);
  if (choice !== 'player' && choice !== 'lurker') return null;
  if (!targetUserId) return null;
  return { choice, targetUserId };
}

/**
 * Must be exempted from the bot-wide role gate (roleGate.ts) in index.ts —
 * these buttons are how a brand-new member earns their first role in the
 * first place, so requiring Mortal/Ghoul/Kindred/staff to click them is a
 * chicken-and-egg lockout. Confirmed live: the gate intercepted the click
 * and replied first, then this service's own reply failed with "already
 * been sent."
 */
export function isNewMemberGateButton(customId: string | undefined): boolean {
  return customId != null && parseButtonId(customId) != null;
}

/** Snapshot shape consumed by the pure helpers below — built fresh from liveConfig on every event. */
export interface NewMemberGateConfig {
  welcomeChannelId: string;
  /** "The Washed Masses" — granted either way; this is what the migration's channel overwrites key off of. */
  verifiedRoleId: string;
  sheetInProgressRoleId: string;
  lurkerRoleId: string;
}

function currentConfig(): NewMemberGateConfig {
  return {
    welcomeChannelId: liveConfig.newMemberGateWelcomeChannelId,
    verifiedRoleId: liveConfig.verifiedMemberRoleId,
    sheetInProgressRoleId: liveConfig.newMemberGateSheetInProgressRoleId,
    lurkerRoleId: liveConfig.newMemberGateLurkerRoleId,
  };
}

/** Discord user IDs already shown the prompt, awaiting a button click — avoids re-prompting on every message they send before clicking. */
const alreadyPrompted = new Set<string>();

/** Pure mapping from a button choice to the role pair it grants — exported for unit testing without discord.js mocks. */
export function rolesForChoice(
  isPlayerChoice: boolean,
  config: Pick<NewMemberGateConfig, 'verifiedRoleId' | 'sheetInProgressRoleId' | 'lurkerRoleId'>,
): string[] {
  const roleIds = isPlayerChoice
    ? [config.sheetInProgressRoleId, config.verifiedRoleId]
    : [config.lurkerRoleId, config.verifiedRoleId];
  return roleIds.filter(Boolean);
}

export function startNewMemberGate(client: Client): void {
  client.on('guildMemberAdd', (member) => {
    handleMemberJoin(member).catch((error) =>
      logEvent('error', 'new_member_gate_join_error', { error: errorToMessage(error) }),
    );
  });

  client.on('messageCreate', (message) => {
    handleMessage(message).catch((error) =>
      logEvent('error', 'new_member_gate_message_error', { error: errorToMessage(error) }),
    );
    handleLinkAttempt(message).catch((error) =>
      logEvent('error', 'new_member_gate_link_check_error', { error: errorToMessage(error) }),
    );
  });

  client.on('interactionCreate', (interaction) => {
    if (!interaction.isButton()) return;
    if (!parseButtonId(interaction.customId)) return;
    handleButton(interaction).catch((error) =>
      logEvent('error', 'new_member_gate_button_error', { error: errorToMessage(error) }),
    );
  });

  logEvent('info', 'new_member_gate_started', {});
}

async function handleMemberJoin(member: import('discord.js').GuildMember): Promise<void> {
  if (!liveConfig.newMemberGateEnabled) return;
  const config = currentConfig();
  if (!config.welcomeChannelId) return;
  if (member.roles.cache.has(config.verifiedRoleId)) return; // shouldn't happen on a fresh join, but defensive

  const channel = await member.guild.channels.fetch(config.welcomeChannelId).catch(() => null);
  if (!channel || !channel.isTextBased()) return;

  try {
    await channel.send({
      content:
        `${member} Due to the increased prevalence of bots invading servers, you currently have limited access; ` +
        `just post a quick hello right here in <#${config.welcomeChannelId}> and we'll get you setup with the proper roles.`,
    });
    logEvent('info', 'new_member_gate_join_greeted', { userId: member.id });
  } catch (error) {
    logEvent('warn', 'new_member_gate_join_greet_failed', { userId: member.id, error: errorToMessage(error) });
  }
}

const URL_PATTERN = /https?:\/\/\S+|www\.\S+/i;

/** Pure and exported for unit testing — Discord auto-hyperlinks a raw URL in plain text regardless of the EmbedLinks permission. */
export function messageContainsUrl(content: string): boolean {
  return URL_PATTERN.test(content);
}

/**
 * The postable pre-verification channels (welcome + whatever
 * NEW_MEMBER_GATE_POSTABLE_CHANNEL_IDS resolves to) only have EmbedLinks/
 * AttachFiles denied for @everyone — that stops embed previews and file
 * uploads, but Discord still renders a raw URL in plain message text as a
 * clickable link regardless of that permission. Deletes any link posted by
 * a not-yet-verified member in those channels; verified members can post
 * links there freely.
 */
async function handleLinkAttempt(message: Message): Promise<void> {
  if (!liveConfig.newMemberGateEnabled) return;
  const noLinksChannelIds = [liveConfig.newMemberGateWelcomeChannelId, ...liveConfig.newMemberGatePostableChannelIds];
  if (!noLinksChannelIds.includes(message.channelId)) return;
  if (message.author.bot) return;
  const member = message.member;
  if (!member) return;
  if (member.roles.cache.has(liveConfig.verifiedMemberRoleId)) return;
  if (!messageContainsUrl(message.content)) return;

  try {
    await message.delete();
    logEvent('info', 'new_member_gate_link_removed', { userId: member.id, channelId: message.channelId });
  } catch (error) {
    logEvent('warn', 'new_member_gate_link_removal_failed', { userId: member.id, error: errorToMessage(error) });
  }
}

/**
 * Whether a message in the configured channel should trigger the
 * player/lurker prompt. Pure and exported so the skip conditions are unit
 * testable without constructing full discord.js Message/Member mocks.
 */
export function shouldPrompt(
  message: { channelId: string; authorIsBot: boolean; memberId: string | null; memberRoleIds: string[] },
  config: Pick<NewMemberGateConfig, 'welcomeChannelId' | 'verifiedRoleId'>,
  alreadyPromptedIds: ReadonlySet<string>,
): boolean {
  if (!config.welcomeChannelId || message.channelId !== config.welcomeChannelId) return false;
  if (message.authorIsBot) return false;
  if (!message.memberId) return false;
  if (message.memberRoleIds.includes(config.verifiedRoleId)) return false; // already verified
  if (alreadyPromptedIds.has(message.memberId)) return false;
  return true;
}

async function handleMessage(message: Message): Promise<void> {
  if (!liveConfig.newMemberGateEnabled) return;
  const config = currentConfig();
  const member = message.member;
  const eligible = shouldPrompt(
    {
      channelId: message.channelId,
      authorIsBot: message.author.bot,
      memberId: member?.id ?? null,
      memberRoleIds: member ? [...member.roles.cache.keys()] : [],
    },
    config,
    alreadyPrompted,
  );
  if (!eligible || !member) return;

  alreadyPrompted.add(member.id);

  const playerButton = new ButtonBuilder()
    .setCustomId(buildButtonId('player', member.id))
    .setLabel("I'd like to work towards making a character!")
    .setStyle(ButtonStyle.Primary);
  const lurkerButton = new ButtonBuilder()
    .setCustomId(buildButtonId('lurker', member.id))
    .setLabel("I'd prefer to just lurk for now!")
    .setStyle(ButtonStyle.Secondary);

  try {
    await message.reply({
      content:
        "Thanks for confirming that you're a human! Would you like to join Music City by Night as an active player " +
        "(this would give you the sheet-in-progress role) or just lurk for now (giving you the lurker role)? Both grant access to most channels.",
      components: [new ActionRowBuilder<ButtonBuilder>().addComponents(playerButton, lurkerButton)],
    });
    logEvent('info', 'new_member_gate_prompted', { userId: member.id });
  } catch (error) {
    alreadyPrompted.delete(member.id); // let them retry on their next message if the prompt failed to send
    logEvent('warn', 'new_member_gate_prompt_failed', { userId: member.id, error: errorToMessage(error) });
  }
}

async function handleButton(interaction: import('discord.js').ButtonInteraction): Promise<void> {
  if (!liveConfig.newMemberGateEnabled) return;
  const parsed = parseButtonId(interaction.customId);
  if (!parsed) return;

  if (interaction.user.id !== parsed.targetUserId) {
    await interaction.reply({ content: 'This prompt is for a different member — post in the welcome channel yourself to get your own.', ephemeral: true });
    return;
  }

  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({ content: 'This only works in the server, not in DMs.', ephemeral: true });
    return;
  }

  const member = await guild.members.fetch(interaction.user.id).catch(() => null);
  if (!member) {
    await interaction.reply({ content: 'Something went wrong — try posting in the welcome channel again.', ephemeral: true });
    return;
  }

  const isPlayerChoice = parsed.choice === 'player';
  const roleIds = rolesForChoice(isPlayerChoice, currentConfig());

  await member.roles.add(roleIds, 'New-member gate: completed welcome check-in');
  alreadyPrompted.delete(interaction.user.id);

  await interaction.reply({
    content: isPlayerChoice
      ? "Welcome! You're all set — check out #getting-started to work on your character sheet."
      : "Welcome! You're all set to lurk and explore the server.",
    ephemeral: true,
  });
  logEvent('info', 'new_member_gate_verified', {
    userId: interaction.user.id,
    choice: isPlayerChoice ? 'player' : 'lurker',
  });
}
