import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChannelType,
  type Client,
  type Message,
  type TextChannel,
} from 'discord.js';
import { errorToMessage, logEvent } from '../logger';

// ── Charts ────────────────────────────────────────────────────────────────────

function messyCritResult(roll: number): string {
  if (roll <= 2) return "One of the character's flaws are triggered.";
  if (roll <= 4) return 'The character breaches the masquerade and has to deal with a witness.';
  if (roll <= 6) return 'The character loses one dot from an appropriate advantage.';
  if (roll <= 8) return 'The character gains a random compulsion.';
  return 'The character kills their victim with no witnesses.';
}

function bestialFailResult(roll: number): string {
  if (roll <= 2) return 'The character breaches the masquerade and has to deal with a witness.';
  if (roll <= 4) return "One of the character's flaws are triggered.";
  if (roll <= 6) return 'The character loses one dot from an appropriate advantage.';
  if (roll <= 8) return 'The character suffers one or more points of Aggravated Health damage.';
  return "The character's hunger increases by one.";
}

// ── Types ─────────────────────────────────────────────────────────────────────

type ConsequenceType = 'mc' | 'bf';

type PendingEntry = {
  type: ConsequenceType;
  characterName: string;
  messageUrl: string;
  // Stored so we can edit the prompt if a WP reroll flips the consequence type
  promptMessage: Message | null;
};

export type HuntConsequenceConfig = {
  enabled: boolean;
  eldestBotId: string;
  monitorChannelIds: Set<string>;
  staffChannelId: string;
  staffRoleId: string;
};

// ── Button ID helpers ─────────────────────────────────────────────────────────

const BUTTON_ROLL = 'hunt_roll:';
const BUTTON_NEGATE = 'hunt_negate:';

export function isHuntConsequenceButton(customId: string): boolean {
  return customId.startsWith(BUTTON_ROLL) || customId.startsWith(BUTTON_NEGATE);
}

// ── State ─────────────────────────────────────────────────────────────────────

// Keyed by The Eldest's message ID
const pending = new Map<string, PendingEntry>();
const respondedIds = new Set<string>();

// ── Embed detection ───────────────────────────────────────────────────────────

function detectType(message: Message): ConsequenceType | null {
  for (const embed of message.embeds) {
    const texts = [
      embed.title ?? '',
      embed.description ?? '',
      embed.footer?.text ?? '',
      ...embed.fields.flatMap((f) => [f.name, f.value]),
    ].join('\n');
    if (texts.includes('Bestial Failure')) return 'bf';
    if (texts.includes('Messy Critical')) return 'mc';
  }
  return null;
}

function extractCharacter(message: Message): string {
  for (const embed of message.embeds) {
    for (const field of embed.fields) {
      if (field.name.toLowerCase() === 'character') {
        return field.value.trim();
      }
    }
  }
  return 'Unknown';
}

// ── Prompt builder ────────────────────────────────────────────────────────────

function buildPrompt(
  type: ConsequenceType,
  characterName: string,
  messageId: string,
): { content: string; components: ActionRowBuilder<ButtonBuilder>[] } {
  const row = new ActionRowBuilder<ButtonBuilder>();

  if (type === 'mc') {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`${BUTTON_ROLL}${messageId}`)
        .setLabel('Roll d10 Consequence')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`${BUTTON_NEGATE}${messageId}`)
        .setLabel('Choose to Fail (negate)')
        .setStyle(ButtonStyle.Secondary),
    );
    return {
      content: [
        `**🩸 Messy Critical** detected for **${characterName}**.`,
        `> You may negate a Messy Critical by choosing to fail — you won't feed, but no consequences apply.`,
        `When you're done with any Willpower rerolls, click below if the Messy Critical still applies.`,
      ].join('\n'),
      components: [row],
    };
  }

  row.addComponents(
    new ButtonBuilder()
      .setCustomId(`${BUTTON_ROLL}${messageId}`)
      .setLabel('Roll d10 Consequence')
      .setStyle(ButtonStyle.Danger),
  );
  return {
    content: [
      `**🐺 Bestial Failure** detected for **${characterName}**.`,
      `> The character gains an appropriate compulsion and fails the hunt. Bestial Failures cannot be negated.`,
      `When you're done with any Willpower rerolls, click below if the Bestial Failure still applies.`,
    ].join('\n'),
    components: [row],
  };
}

// ── Monitor startup ───────────────────────────────────────────────────────────

export function startHuntConsequenceMonitor(client: Client, cfg: HuntConsequenceConfig): void {
  if (!cfg.enabled) return;

  async function handleMessage(message: Message, isUpdate = false): Promise<void> {
    if (message.author.id !== cfg.eldestBotId) return;
    if (!cfg.monitorChannelIds.has(message.channelId)) return;

    const type = detectType(message);

    // On updates to an already-prompted message, check for a type flip
    if (isUpdate && respondedIds.has(message.id)) {
      const existing = pending.get(message.id);
      if (!existing) return; // already resolved — don't re-open
      if (type === null || type === existing.type) return; // no change

      // Consequence type changed (e.g. MC → BF after WP reroll) — edit prompt first, then update state
      const { content, components } = buildPrompt(type, existing.characterName, message.id);
      if (existing.promptMessage) {
        try {
          await existing.promptMessage.edit({ content, components });
          // Only mutate after the edit succeeds — if it fails, existing.type stays unchanged
          // so the next messageUpdate event will retry rather than skip the stale type
          existing.type = type;
          logEvent('info', 'hunt_consequence_prompt_updated', {
            messageId: message.id,
            newType: type,
            characterName: existing.characterName,
          });
        } catch (error) {
          logEvent('warn', 'hunt_consequence_prompt_edit_failed', {
            messageId: message.id,
            error: errorToMessage(error),
          });
        }
      } else {
        // Reply is still in flight — update the type now; the initial reply handler
        // will detect the mismatch once it resolves and edit the sent message
        existing.type = type;
        logEvent('info', 'hunt_consequence_type_queued', {
          messageId: message.id,
          newType: type,
          characterName: existing.characterName,
        });
      }
      return;
    }

    if (respondedIds.has(message.id)) return;
    if (!type) return;

    const characterName = extractCharacter(message);
    const messageUrl = `https://discord.com/channels/${message.guildId}/${message.channelId}/${message.id}`;

    respondedIds.add(message.id);

    // Set the pending entry immediately — before awaiting the reply — so any
    // messageUpdate that arrives while the reply is in flight sees the entry and
    // can update existing.type rather than being dropped as "already resolved"
    pending.set(message.id, { type, characterName, messageUrl, promptMessage: null });

    const { content, components } = buildPrompt(type, characterName, message.id);

    try {
      const promptMessage = await message.reply({ content, components });
      const entry = pending.get(message.id);
      if (entry) {
        entry.promptMessage = promptMessage;
        // A messageUpdate may have changed the type while the reply was in flight;
        // if so, edit the just-sent message to reflect the final type
        if (entry.type !== type) {
          const { content: c, components: r } = buildPrompt(entry.type, entry.characterName, message.id);
          try {
            await promptMessage.edit({ content: c, components: r });
            logEvent('info', 'hunt_consequence_prompt_corrected', {
              messageId: message.id,
              originalType: type,
              finalType: entry.type,
              characterName,
            });
          } catch (editError) {
            logEvent('warn', 'hunt_consequence_prompt_correct_failed', {
              messageId: message.id,
              error: errorToMessage(editError),
            });
          }
        }
      }
      logEvent('info', 'hunt_consequence_prompted', {
        messageId: message.id,
        channelId: message.channelId,
        type: entry?.type ?? type,
        characterName,
      });
    } catch (error) {
      // Clean up so a retry is possible if the reply fails
      respondedIds.delete(message.id);
      pending.delete(message.id);
      logEvent('warn', 'hunt_consequence_prompt_failed', {
        messageId: message.id,
        error: errorToMessage(error),
      });
    }
  }

  client.on('messageCreate', (message) => {
    handleMessage(message, false).catch((err) =>
      logEvent('error', 'hunt_consequence_create_error', { error: errorToMessage(err) }),
    );
  });

  client.on('messageUpdate', (_old, newMessage) => {
    // Fetch full message if partial so embeds are available
    const resolve = newMessage.partial
      ? newMessage.fetch().catch(() => null)
      : Promise.resolve(newMessage as Message);

    resolve
      .then((msg) => msg && handleMessage(msg, true))
      .catch((err) =>
        logEvent('error', 'hunt_consequence_update_error', { error: errorToMessage(err) }),
      );
  });

  logEvent('info', 'hunt_consequence_monitor_started', {
    channels: [...cfg.monitorChannelIds],
    staffChannelId: cfg.staffChannelId,
  });
}

// ── Button handler ────────────────────────────────────────────────────────────

export async function handleHuntConsequenceButton(
  interaction: ButtonInteraction,
  cfg: HuntConsequenceConfig,
): Promise<void> {
  const isNegate = interaction.customId.startsWith(BUTTON_NEGATE);
  const prefix = isNegate ? BUTTON_NEGATE : BUTTON_ROLL;
  const messageId = interaction.customId.slice(prefix.length);

  const entry = pending.get(messageId);
  if (!entry) {
    await interaction.reply({
      content:
        'This consequence has already been resolved, or the bot restarted since the roll. Please ping staff directly.',
      ephemeral: true,
    });
    return;
  }

  // Guard: negate is only valid for Messy Critical. If a WP reroll flipped the type to BF
  // after the prompt was posted, reject the stale negate click gracefully.
  if (isNegate && entry.type === 'bf') {
    await interaction.reply({
      content:
        'The roll was updated to a **Bestial Failure** after your Willpower reroll — negation is not available. Please use the Roll d10 button.',
      ephemeral: true,
    });
    return;
  }

  // Fetch the staff/coordination channel
  const staffChannel = await interaction.client.channels
    .fetch(cfg.staffChannelId)
    .catch(() => null);
  const staffChannelOk =
    staffChannel !== null && staffChannel.type === ChannelType.GuildText;

  const typeLabel = entry.type === 'mc' ? 'Messy Critical' : 'Bestial Failure';
  const resolvedBy = `<@${interaction.user.id}>`;

  // ── Negate path (Messy Critical only) ──────────────────────────────────────
  if (isNegate) {
    const coordMsg = [
      `<@&${cfg.staffRoleId}> — Hunt consequence resolved`,
      ``,
      `**Character:** ${entry.characterName}`,
      `**Roll Type:** ${typeLabel}`,
      `**Outcome:** Player chose to fail — Messy Critical negated, no consequence applies. Character does not feed.`,
      `**Resolved by:** ${resolvedBy}`,
      ``,
      `**Original Roll:** ${entry.messageUrl}`,
    ].join('\n');

    if (staffChannelOk) {
      await (staffChannel as TextChannel).send({ content: coordMsg });
    }
    await interaction.reply({
      content: staffChannelOk
        ? `Messy Critical negated — **${entry.characterName}** chose to fail. Staff notified in <#${cfg.staffChannelId}>.`
        : `Messy Critical negated — **${entry.characterName}** chose to fail. ⚠️ Could not reach staff channel, please ping staff manually.`,
      ephemeral: true,
    });

    pending.delete(messageId);
    logEvent('info', 'hunt_consequence_negated', {
      messageId,
      characterName: entry.characterName,
      resolvedByUserId: interaction.user.id,
    });
    return;
  }

  // ── Roll path ──────────────────────────────────────────────────────────────
  const roll = Math.floor(Math.random() * 10) + 1;
  const result =
    entry.type === 'mc' ? messyCritResult(roll) : bestialFailResult(roll);
  const bestialNote =
    entry.type === 'bf'
      ? '\n**Also:** The character gains an appropriate compulsion and fails the hunt.'
      : '';

  const coordMsg = [
    `<@&${cfg.staffRoleId}> — Hunt consequence needed`,
    ``,
    `**Character:** ${entry.characterName}`,
    `**Roll Type:** ${typeLabel}`,
    `**d10 Result:** ${roll}`,
    `**Consequence:** ${result}${bestialNote}`,
    `**Resolved by:** ${resolvedBy}`,
    ``,
    `**Original Roll:** ${entry.messageUrl}`,
  ].join('\n');

  if (staffChannelOk) {
    await (staffChannel as TextChannel).send({ content: coordMsg });
  }
  await interaction.reply({
    content: staffChannelOk
      ? `🎲 Rolled a **${roll}** — *${result}*${bestialNote}\nPosted to <#${cfg.staffChannelId}> for staff to resolve.`
      : `🎲 Rolled a **${roll}** — *${result}*${bestialNote}\n⚠️ Could not reach staff channel — please ping staff manually.`,
    ephemeral: true,
  });

  pending.delete(messageId);
  logEvent('info', 'hunt_consequence_rolled', {
    messageId,
    type: entry.type,
    characterName: entry.characterName,
    roll,
    result,
    resolvedByUserId: interaction.user.id,
  });
}
