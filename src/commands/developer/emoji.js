import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import EmojiMapping from '../../database/repo/EmojiMapping.js';

const emojiCommand = new SlashCommandBuilder()
    .setName('emoji')
    .setDescription('Manage custom emoji mappings for the music bot')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommandGroup(subcommandGroup =>
        subcommandGroup
            .setName('manage')
            .setDescription('Manage emoji mappings')
            .addSubcommand(subcommand =>
                subcommand
                    .setName('add')
                    .setDescription('Add a custom emoji mapping')
                    .addStringOption(option =>
                        option.setName('bot_name')
                            .setDescription('The bot internal emoji name (e.g., play, pause, skip)')
                            .setRequired(true)
                            .setAutocomplete(true))
                    .addStringOption(option =>
                        option.setName('emoji')
                            .setDescription('The emoji to use (custom or Unicode)')
                            .setRequired(true))
            )
            .addSubcommand(subcommand =>
                subcommand
                    .setName('remove')
                    .setDescription('Remove an emoji mapping')
                    .addStringOption(option =>
                        option.setName('bot_name')
                            .setDescription('The bot internal emoji name to remove')
                            .setRequired(true)
                            .setAutocomplete(true))
            )
            .addSubcommand(subcommand =>
                subcommand
                    .setName('set-fallback')
                    .setDescription('Set a fallback Unicode emoji')
                    .addStringOption(option =>
                        option.setName('bot_name')
                            .setDescription('The bot internal emoji name')
                            .setRequired(true)
                            .setAutocomplete(true))
                    .addStringOption(option =>
                        option.setName('fallback')
                            .setDescription('The fallback Unicode emoji')
                            .setRequired(true))
            )
    )
    .addSubcommandGroup(subcommandGroup =>
        subcommandGroup
            .setName('view')
            .setDescription('View emoji mappings')
            .addSubcommand(subcommand =>
                subcommand
                    .setName('list')
                    .setDescription('List all emoji mappings')
                    .addStringOption(option =>
                        option.setName('category')
                            .setDescription('Filter by category')
                            .addChoices(
                                { name: 'Playback', value: 'playback' },
                                { name: 'Filters', value: 'filters' },
                                { name: 'Status', value: 'status' },
                                { name: 'Navigation', value: 'navigation' },
                                { name: 'Actions', value: 'actions' }
                            ))
            )
            .addSubcommand(subcommand =>
                subcommand
                    .setName('defaults')
                    .setDescription('Show default emoji mappings')
            )
    )
    .addSubcommandGroup(subcommandGroup =>
        subcommandGroup
            .setName('sync')
            .setDescription('Sync emoji mappings')
            .addSubcommand(subcommand =>
                subcommand
                    .setName('refresh')
                    .setDescription('Force sync emojis with Discord server')
            )
            .addSubcommand(subcommand =>
                subcommand
                    .setName('reset')
                    .setDescription('Reset all emoji mappings to defaults')
            )
    );

async function execute(interaction) {
    const subcommandGroup = interaction.options.getSubcommandGroup();
    const subcommand = interaction.options.getSubcommand();
    const guildId = interaction.guildId;

    if (!interaction.guild) {
        return interaction.reply({
            content: 'This command can only be used in a server.',
            ephemeral: true
        });
    }

    try {
        switch (subcommandGroup) {
            case 'manage':
                return handleManage(interaction, subcommand, guildId);
            case 'view':
                return handleView(interaction, subcommand, guildId);
            case 'sync':
                return handleSync(interaction, subcommand, guildId);
            default:
                return interaction.reply({
                    content: 'Unknown subcommand group.',
                    ephemeral: true
                });
        }
    } catch (error) {
        console.error('Emoji command error:', error);
        return interaction.reply({
            content: 'An error occurred while processing the command.',
            ephemeral: true
        });
    }
}

async function handleManage(interaction, subcommand, guildId) {
    switch (subcommand) {
        case 'add':
            return handleAdd(interaction, guildId);
        case 'remove':
            return handleRemove(interaction, guildId);
        case 'set-fallback':
            return handleSetFallback(interaction, guildId);
    }
}

async function handleView(interaction, subcommand, guildId) {
    switch (subcommand) {
        case 'list':
            return handleList(interaction, guildId);
        case 'defaults':
            return handleDefaults(interaction);
    }
}

async function handleSync(interaction, subcommand, guildId) {
    switch (subcommand) {
        case 'refresh':
            return handleRefresh(interaction, guildId);
        case 'reset':
            return handleReset(interaction, guildId);
    }
}

async function handleAdd(interaction, guildId) {
    const botName = interaction.options.getString('bot_name');
    const emojiInput = interaction.options.getString('emoji');

    let emojiData = {};

    const emojiRegex = /<a?:(\w+):(\d+)>|^(\p{Emoji_Presentation}|\p{Extended_Pictographic})$/u;
    const match = emojiInput.match(emojiRegex);

    if (match) {
        if (match[1] && match[2]) {
            const emoji = interaction.client.emojis.cache.get(match[2]);
            if (emoji) {
                emojiData = {
                    discordName: emoji.name,
                    emojiId: emoji.id,
                    emojiUrl: emoji.url,
                    isAnimated: emoji.animated,
                    isAvailable: true
                };
            } else {
                emojiData = {
                    discordName: match[1],
                    emojiId: match[2],
                    isAnimated: emojiInput.startsWith('<a:'),
                    isAvailable: true
                };
            }
        } else {
            emojiData = {
                fallback: match[3],
                isAvailable: true
            };
        }
    } else {
        return interaction.reply({
            content: 'Please provide a valid emoji (custom or Unicode).',
            ephemeral: true
        });
    }

    try {
        await interaction.client.emojiManager.addEmoji(guildId, botName, emojiData);

        const resolvedEmoji = await interaction.client.emojiManager.resolveEmoji(guildId, botName);

        return interaction.reply({
            content: `✅ Added emoji mapping: \`${botName}\` → ${resolvedEmoji}`,
            ephemeral: true
        });
    } catch (error) {
        console.error('Error adding emoji:', error);
        return interaction.reply({
            content: 'Failed to add emoji mapping.',
            ephemeral: true
        });
    }
}

async function handleRemove(interaction, guildId) {
    const botName = interaction.options.getString('bot_name');

    try {
        const emoji = await interaction.client.emojiManager.getEmoji(guildId, botName);
        if (!emoji || (!emoji.id && !emoji.fallback)) {
            return interaction.reply({
                content: `No emoji mapping found for \`${botName}\`.`,
                ephemeral: true
            });
        }

        await interaction.client.emojiManager.removeEmoji(guildId, botName);

        return interaction.reply({
            content: `✅ Removed emoji mapping: \`${botName}\``,
            ephemeral: true
        });
    } catch (error) {
        console.error('Error removing emoji:', error);
        return interaction.reply({
            content: 'Failed to remove emoji mapping.',
            ephemeral: true
        });
    }
}

async function handleSetFallback(interaction, guildId) {
    const botName = interaction.options.getString('bot_name');
    const fallback = interaction.options.getString('fallback');

    if (fallback.length > 10) {
        return interaction.reply({
            content: 'Fallback emoji must be a single emoji character.',
            ephemeral: true
        });
    }

    try {
        await interaction.client.emojiManager.setFallback(guildId, botName, fallback);

        return interaction.reply({
            content: `✅ Set fallback emoji for \`${botName}\` to \`${fallback}\``,
            ephemeral: true
        });
    } catch (error) {
        console.error('Error setting fallback:', error);
        return interaction.reply({
            content: 'Failed to set fallback emoji.',
            ephemeral: true
        });
    }
}

async function handleList(interaction, guildId) {
    const category = interaction.options.getString('category');

    try {
        let emojis;
        if (category) {
            emojis = EmojiMapping.getByCategory(guildId, category);
        } else {
            emojis = EmojiMapping.getAllByGuild(guildId);
        }

        if (emojis.length === 0) {
            return interaction.reply({
                content: 'No emoji mappings found. Use `/emoji manage add` to create one.',
                ephemeral: true
            });
        }

        const defaultEmojis = interaction.client.emojiManager.defaultEmojis;
        const embed = new EmbedBuilder()
            .setTitle('Emoji Mappings')
            .setColor('#5865F2')
            .setTimestamp();

        const groupedEmojis = {};
        for (const emoji of emojis) {
            if (!groupedEmojis[emoji.category]) {
                groupedEmojis[emoji.category] = [];
            }
            groupedEmojis[emoji.category].push(emoji);
        }

        for (const [cat, catEmojis] of Object.entries(groupedEmojis)) {
            let description = '';
            for (const emoji of catEmojis) {
                let emojiDisplay;
                if (emoji.emoji_id && emoji.is_available) {
                    emojiDisplay = `<:${emoji.discord_name}:${emoji.emoji_id}>`;
                } else {
                    emojiDisplay = emoji.fallback || defaultEmojis.get(emoji.bot_name)?.fallback || '❓';
                }
                description += `\`${emoji.bot_name}\` → ${emojiDisplay}\n`;
            }
            embed.addFields({ name: cat.charAt(0).toUpperCase() + cat.slice(1), value: description || 'No emojis', inline: false });
        }

        return interaction.reply({ embeds: [embed], ephemeral: true });
    } catch (error) {
        console.error('Error listing emojis:', error);
        return interaction.reply({
            content: 'Failed to list emoji mappings.',
            ephemeral: true
        });
    }
}

async function handleDefaults(interaction) {
    const defaultEmojis = interaction.client.emojiManager.getDefaultEmojisByCategory();
    const emojiConfig = await import('../../config/emojiConfig.js');

    const embed = new EmbedBuilder()
        .setTitle('Default Emoji Mappings')
        .setColor('#5865F2')
        .setDescription('These are the default emoji mappings that come with the bot.')
        .setTimestamp();

    for (const category of emojiConfig.default.categories) {
        let description = '';
        for (const emoji of category.emojis) {
            description += `\`${emoji.botName}\` → ${emoji.fallback} ${emoji.description ? `*- ${emoji.description}*` : ''}\n`;
        }
        embed.addFields({ name: category.name.charAt(0).toUpperCase() + category.name.slice(1), value: description, inline: false });
    }

    return interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleRefresh(interaction, guildId) {
    try {
        await interaction.client.emojiManager.syncGuild(guildId);

        return interaction.reply({
            content: '✅ Emoji sync completed. The bot has synced with your server\'s emojis.',
            ephemeral: true
        });
    } catch (error) {
        console.error('Error syncing emojis:', error);
        return interaction.reply({
            content: 'Failed to sync emojis.',
            ephemeral: true
        });
    }
}

async function handleReset(interaction, guildId) {
    try {
        await interaction.client.emojiManager.resetEmojis(guildId);

        return interaction.reply({
            content: '✅ Reset all emoji mappings to defaults.',
            ephemeral: true
        });
    } catch (error) {
        console.error('Error resetting emojis:', error);
        return interaction.reply({
            content: 'Failed to reset emoji mappings.',
            ephemeral: true
        });
    }
}

async function autocomplete(interaction) {
    const focusedOption = interaction.options.getFocused(true);
    
    if (focusedOption.name === 'bot_name') {
        const defaultEmojis = interaction.client.emojiManager.defaultEmojis;
        const choices = Array.from(defaultEmojis.keys()).sort();
        const filtered = choices.filter(choice => 
            choice.toLowerCase().includes(focusedOption.value.toLowerCase())
        ).slice(0, 25);
        
        await interaction.respond(
            filtered.map(choice => ({ name: choice, value: choice }))
        );
    }
}

export default { data: emojiCommand, execute, autocomplete };
export { emojiCommand, execute, autocomplete };
