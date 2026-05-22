import { ChannelType, EmbedBuilder, type Client, type NonThreadGuildBasedChannel } from 'discord.js';
import { errorToMessage, logEvent } from '../logger';

const TICKET_CATEGORY_KEYWORD = 'character tickets';

interface CharacterTicketMonitorOptions {
    /** Web app base URL, e.g. https://mcbn.jkomg.us (no trailing slash) */
    webBaseUrl: string;
    /** Optional Discord channel URL for creation rules. */
    creationRulesUrl?: string;
    /**
     * Optional set of category IDs to restrict monitoring to specific categories.
     * When provided, only channels created under these exact category IDs trigger
     * the welcome message. When absent, falls back to keyword matching on category name.
     */
    ticketCategoryIds?: Set<string>;
}

/**
 * Listens for channelCreate events. When a new channel appears under a category
 * whose name contains "character tickets" (case-insensitive), posts a welcome
 * message linking the player to the character creator with the ticket channel ID
 * pre-embedded in the URL so the draft is automatically associated with the ticket.
 */
export function startCharacterTicketMonitor(
    client: Client,
    options: CharacterTicketMonitorOptions,
): void {
    client.on('channelCreate', async (channel: NonThreadGuildBasedChannel) => {
        if (channel.type !== ChannelType.GuildText) return;

        const parent = channel.parent;
        if (!parent) return;

        const matchesCategory = options.ticketCategoryIds
            ? options.ticketCategoryIds.has(parent.id)
            : parent.name.toLowerCase().includes(TICKET_CATEGORY_KEYWORD);
        if (!matchesCategory) return;

        const creatorUrl = `${options.webBaseUrl.replace(/\/$/, '')}/player/new?ticket=${channel.id}`;

        const embed = new EmbedBuilder()
            .setColor(0x8b0000)
            .setTitle('Welcome to Character Creation')
            .setDescription(
                [
                    'When you\'re ready to build your character, use the link below to get started on the character creator. ' +
                    'Your work is saved automatically and linked to this ticket.',
                    '',
                    options.creationRulesUrl
                        ? `📖 **Creation rules:** ${options.creationRulesUrl} — and see the rest of the Guidelines category for options and house rules.`
                        : '📖 Check the **Guidelines** category in Discord for creation rules and options.',
                    '',
                    `🧛 **[Start building your character](${creatorUrl})**`,
                    '',
                    'Once your character is ready, let the Storytellers know here and they\'ll review it. ' +
                    'Staff may request revisions — you can update your character at any time before approval.',
                ].join('\n'),
            );

        try {
            await channel.send({ embeds: [embed] });
            logEvent('info', 'character_ticket_welcome_sent', {
                guildId: channel.guild.id,
                channelId: channel.id,
                channelName: channel.name,
                categoryName: parent.name,
            });
        } catch (error) {
            logEvent('warn', 'character_ticket_welcome_failed', {
                guildId: channel.guild.id,
                channelId: channel.id,
                error: errorToMessage(error),
            });
        }
    });
}
