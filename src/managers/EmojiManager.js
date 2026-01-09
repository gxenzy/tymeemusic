import defaultEmojiConfig from '../config/emojiConfig.js';
import EmojiMapping from '../database/repo/EmojiMapping.js';

class EmojiManager {
    constructor(bot) {
        this.bot = bot;
        this.db = EmojiMapping;
        this.cache = new Map();
        this.syncQueue = new Set();
        this.isSyncing = new Map();
        this.defaultEmojis = this.buildDefaultEmojiMap();
        this.initialized = false;
    }

    buildDefaultEmojiMap() {
        const emojiMap = new Map();

        for (const category of defaultEmojiConfig.categories) {
            for (const emoji of category.emojis) {
                emojiMap.set(emoji.botName, {
                    botName: emoji.botName,
                    discordName: emoji.discordName,
                    fallback: emoji.fallback,
                    category: category.name,
                    description: emoji.description,
                    isAvailable: true
                });
            }
        }

        return emojiMap;
    }

    async initialize() {
        if (this.initialized) return;

        console.log('Initializing Emoji Manager...');

        for (const guild of this.bot.guilds.cache.values()) {
            await this.syncGuild(guild.id);
        }

        this.initialized = true;
        console.log('Emoji Manager initialized');
    }

    async syncGuild(guildId) {
        if (this.isSyncing.get(guildId)) {
            console.log(`Sync already in progress for guild ${guildId}`);
            return;
        }

        this.isSyncing.set(guildId, true);

        try {
            const guild = this.bot.guilds.cache.get(guildId);
            if (!guild) {
                console.log(`Guild ${guildId} not found`);
                return;
            }

            const discordEmojis = new Map();

            for (const emoji of guild.emojis.cache.values()) {
                discordEmojis.set(emoji.name.toLowerCase(), {
                    emojiId: emoji.id,
                    discordName: emoji.name,
                    emojiUrl: emoji.url,
                    isAnimated: emoji.animated,
                    isAvailable: emoji.available
                });
            }

            const existingMappings = this.db.getAllByGuild(guildId);
            const existingMap = new Map(
                existingMappings.map(m => [m.bot_name, m])
            );

            for (const [discordName, emojiData] of discordEmojis) {
                if (!existingMap.has(discordName)) {
                    const matchingBotName = this.findMatchingBotName(discordName);
                    if (matchingBotName) {
                        this.db.upsertMapping(guildId, matchingBotName, {
                            discordName: emojiData.discordName,
                            emojiId: emojiData.emojiId,
                            emojiUrl: emojiData.emojiUrl,
                            isAnimated: emojiData.isAnimated,
                            isAvailable: emojiData.isAvailable,
                            category: this.getCategoryForEmoji(matchingBotName)
                        });
                    }
                }
            }

            for (const mapping of existingMappings) {
                if (mapping.emoji_id && !discordEmojis.has(mapping.discord_name?.toLowerCase())) {
                    this.db.setUnavailable(guildId, mapping.bot_name);
                }
            }

            await this.updateCache(guildId);

            console.log(`Emoji sync completed for guild ${guildId}`);

        } catch (error) {
            console.error(`Error syncing emojis for guild ${guildId}:`, error);
        } finally {
            this.isSyncing.delete(guildId);
        }
    }

    findMatchingBotName(discordName) {
        const normalizedName = discordName.toLowerCase().replace(/[-_\s]/g, '');

        for (const [botName, emojiData] of this.defaultEmojis) {
            const normalizedBotName = botName.toLowerCase().replace(/[-_]/g, '');

            if (normalizedName === normalizedBotName ||
                normalizedName.includes(normalizedBotName) ||
                normalizedBotName.includes(normalizedName)) {
                return botName;
            }
        }

        return null;
    }

    getCategoryForEmoji(botName) {
        for (const category of defaultEmojiConfig.categories) {
            if (category.emojis.some(e => e.botName === botName)) {
                return category.name;
            }
        }
        return 'general';
    }

    async updateCache(guildId) {
        try {
            const emojis = this.db.getAllByGuild(guildId);
            const emojiMap = new Map();

            for (const emoji of emojis) {
                emojiMap.set(emoji.bot_name, {
                    id: emoji.emoji_id,
                    name: emoji.discord_name,
                    url: emoji.emoji_url,
                    animated: emoji.is_animated === 1,
                    available: emoji.is_available === 1,
                    fallback: emoji.fallback,
                    category: emoji.category,
                    botName: emoji.bot_name
                });
            }

            this.cache.set(guildId, emojiMap);

        } catch (error) {
            console.error(`Error updating cache for guild ${guildId}:`, error);
        }
    }

    async getPlayerEmojis(guildId) {
        return {
            // Playback controls
            play: await this.resolveEmoji(guildId, 'play'),
            pause: await this.resolveEmoji(guildId, 'pause'),
            stop: await this.resolveEmoji(guildId, 'stop'),
            skip: await this.resolveEmoji(guildId, 'skip'),
            previous: await this.resolveEmoji(guildId, 'previous'),
            shuffle: await this.resolveEmoji(guildId, 'shuffle'),
            loop: await this.resolveEmoji(guildId, 'loop'),
            loop_track: await this.resolveEmoji(guildId, 'loop_track'),

            // Volume controls
            volume_up: await this.resolveEmoji(guildId, 'volume_up'),
            volume_down: await this.resolveEmoji(guildId, 'volume_down'),
            volume_mute: await this.resolveEmoji(guildId, 'volume_mute'),

            // Progress bar emojis
            pb_start: await this.resolveEmoji(guildId, 'pb_start'),
            pb_filled: await this.resolveEmoji(guildId, 'pb_filled'),
            pb_empty: await this.resolveEmoji(guildId, 'pb_empty'),
            pb_head: await this.resolveEmoji(guildId, 'pb_head'),
            pb_end: await this.resolveEmoji(guildId, 'pb_end'),
            pb_start_filled: await this.resolveEmoji(guildId, 'pb_start_filled'),
            pb_end_filled: await this.resolveEmoji(guildId, 'pb_end_filled'),

            // Status indicators
            playing: await this.resolveEmoji(guildId, 'playing'),
            loading: await this.resolveEmoji(guildId, 'loading'),
            error: await this.resolveEmoji(guildId, 'error'),
            success: await this.resolveEmoji(guildId, 'success'),
            warning: await this.resolveEmoji(guildId, 'warning'),
            idle: await this.resolveEmoji(guildId, 'idle'),

            // UI Elements
            music: await this.resolveEmoji(guildId, 'music'),
            artist: await this.resolveEmoji(guildId, 'artist'),
            queue: await this.resolveEmoji(guildId, 'queue'),
            album: await this.resolveEmoji(guildId, 'album'),
            heart: await this.resolveEmoji(guildId, 'heart'),
            star: await this.resolveEmoji(guildId, 'star'),
            fire: await this.resolveEmoji(guildId, 'fire'),
            sparkle: await this.resolveEmoji(guildId, 'sparkle'),
            crown: await this.resolveEmoji(guildId, 'crown'),
            trophy: await this.resolveEmoji(guildId, 'trophy'),

            // Features
            autoplay: await this.resolveEmoji(guildId, 'autoplay'),
            lyrics: await this.resolveEmoji(guildId, 'lyrics'),
            fx: await this.resolveEmoji(guildId, 'fx'),
            sleep: await this.resolveEmoji(guildId, 'sleep'),
            live: await this.resolveEmoji(guildId, 'live'),

            // Connection quality
            ping_good: await this.resolveEmoji(guildId, 'ping_good'),
            ping_medium: await this.resolveEmoji(guildId, 'ping_medium'),
            ping_bad: await this.resolveEmoji(guildId, 'ping_bad'),
            signal: await this.resolveEmoji(guildId, 'signal'),
            globe: await this.resolveEmoji(guildId, 'globe'),
            location: await this.resolveEmoji(guildId, 'location'),

            // Source icons
            source_spotify: await this.resolveEmoji(guildId, 'source_spotify'),
            source_youtube: await this.resolveEmoji(guildId, 'source_youtube'),
            source_soundcloud: await this.resolveEmoji(guildId, 'source_soundcloud'),
            source_deezer: await this.resolveEmoji(guildId, 'source_deezer'),
            source_apple: await this.resolveEmoji(guildId, 'source_apple'),

            // Decorative
            divider: await this.resolveEmoji(guildId, 'divider'),
            arrow_right: await this.resolveEmoji(guildId, 'arrow_right'),
            diamond: await this.resolveEmoji(guildId, 'diamond'),
        };
    }

    async getEmoji(guildId, botName) {
        let guildCache = this.cache.get(guildId);

        if (guildCache?.has(botName)) {
            const emoji = guildCache.get(botName);
            if (emoji.available && emoji.id) {
                return emoji;
            }
        }

        const dbEmoji = this.db.getByGuildAndName(guildId, botName);

        if (dbEmoji) {
            if (!guildCache) {
                guildCache = new Map();
                this.cache.set(guildId, guildCache);
            }

            guildCache.set(botName, {
                id: dbEmoji.emoji_id,
                name: dbEmoji.discord_name,
                url: dbEmoji.emoji_url,
                animated: dbEmoji.is_animated === 1,
                available: dbEmoji.is_available === 1,
                fallback: dbEmoji.fallback,
                category: dbEmoji.category,
                botName: dbEmoji.bot_name
            });

            return guildCache.get(botName);
        }

        const defaultEmoji = this.defaultEmojis.get(botName);
        return defaultEmoji || { fallback: '❓', botName };
    }

    async resolveEmoji(guildId, botName, format = 'mention') {
        const emoji = await this.getEmoji(guildId, botName);

        if (!emoji) {
            return this.getDefaultEmoji(botName);
        }

        if (emoji.id && emoji.available) {
            switch (format) {
                case 'mention':
                    return emoji.animated
                        ? `<a:${emoji.name}:${emoji.id}>`
                        : `<:${emoji.name}:${emoji.id}>`;
                case 'url':
                    return emoji.url;
                case 'object':
                    return { id: emoji.id, name: emoji.name, animated: emoji.animated };
                case 'name':
                    return emoji.name;
                case 'id':
                    return emoji.id;
                default:
                    return emoji.fallback || this.getDefaultEmoji(botName);
            }
        }

        return emoji.fallback || this.getDefaultEmoji(botName);
    }

    async resolveButtonEmoji(guildId, botName) {
        const emoji = await this.getEmoji(guildId, botName);

        if (emoji.id && emoji.available) {
            return { id: emoji.id, name: emoji.name, animated: emoji.animated };
        }

        return emoji.fallback || this.getDefaultEmoji(botName);
    }

    async resolveEmojis(guildId, emojiNames) {
        const results = {};
        for (const name of emojiNames) {
            results[name] = await this.resolveEmoji(guildId, name);
        }
        return results;
    }

    getDefaultEmoji(botName) {
        const defaultEmoji = this.defaultEmojis.get(botName);
        return defaultEmoji?.fallback || '❓';
    }

    async addEmoji(guildId, botName, emojiData) {
        const category = this.getCategoryForEmoji(botName);

        this.db.upsertMapping(guildId, botName, {
            discordName: emojiData.discordName || botName,
            emojiId: emojiData.emojiId || null,
            emojiUrl: emojiData.emojiUrl || null,
            isAnimated: emojiData.isAnimated || false,
            isAvailable: true,
            fallback: emojiData.fallback || this.getDefaultEmoji(botName),
            category
        });

        await this.updateCache(guildId);

        if (this.bot.websocket) {
            this.bot.websocket.broadcastToGuild(guildId, 'emoji:update', {
                guildId,
                botName,
                timestamp: Date.now()
            });
        }

        return await this.getEmoji(guildId, botName);
    }

    async removeEmoji(guildId, botName) {
        this.db.deleteByBotName(guildId, botName);
        await this.updateCache(guildId);

        if (this.bot.websocket) {
            this.bot.websocket.broadcastToGuild(guildId, 'emoji:remove', {
                guildId,
                botName,
                timestamp: Date.now()
            });
        }

        return true;
    }

    async setFallback(guildId, botName, fallback) {
        this.db.setFallback(guildId, botName, fallback);
        await this.updateCache(guildId);

        return true;
    }

    async resetEmojis(guildId) {
        this.db.resetGuildEmojis(guildId);
        this.cache.delete(guildId);

        if (this.bot.websocket) {
            this.bot.websocket.broadcastToGuild(guildId, 'emoji:reset', {
                guildId,
                timestamp: Date.now()
            });
        }

        return true;
    }

    async getAllEmojis(guildId) {
        return this.db.getAllByGuild(guildId);
    }

    async getEmojisByCategory(guildId, category) {
        return this.db.getByCategory(guildId, category);
    }

    async getServerEmojis(guildId) {
        const guild = this.bot.guilds.cache.get(guildId);
        if (!guild) return [];

        return guild.emojis.cache.map(emoji => ({
            id: emoji.id,
            name: emoji.name,
            url: emoji.url,
            isAnimated: emoji.animated,
            isAvailable: emoji.available
        }));
    }

    async autoSyncEmojis(guildId) {
        const guild = this.bot.guilds.cache.get(guildId);
        if (!guild) return { synced: 0, skipped: 0 };

        const serverEmojis = guild.emojis.cache;
        const existingMappings = this.db.getAllByGuild(guildId);
        const existingMap = new Map(existingMappings.map(m => [m.bot_name.toLowerCase(), m]));

        let synced = 0;
        let skipped = 0;

        for (const [name, emoji] of serverEmojis) {
            const normalizedName = name.toLowerCase().replace(/[-_\s]/g, '');

            // Check if already mapped
            if (existingMap.has(normalizedName)) {
                skipped++;
                continue;
            }

            // Find matching bot name
            const matchingBotName = this.findMatchingBotName(name);

            if (matchingBotName) {
                // Check if this bot name is already mapped to another emoji
                const alreadyMapped = existingMappings.some(m =>
                    m.bot_name.toLowerCase() === matchingBotName.toLowerCase()
                );

                if (!alreadyMapped) {
                    await this.addEmoji(guildId, matchingBotName, {
                        discordName: emoji.name,
                        emojiId: emoji.id,
                        emojiUrl: emoji.url,
                        isAnimated: emoji.animated,
                        fallback: this.getDefaultEmoji(matchingBotName)
                    });
                    synced++;
                } else {
                    skipped++;
                }
            } else {
                // Create a general mapping for unmapped emojis
                const generalBotName = `emoji_${normalizedName}`;
                await this.addEmoji(guildId, generalBotName, {
                    discordName: emoji.name,
                    emojiId: emoji.id,
                    emojiUrl: emoji.url,
                    isAnimated: emoji.animated,
                    fallback: '❓',
                    category: 'custom'
                });
                synced++;
            }
        }

        return { synced, skipped };
    }

    async getAutoSyncPreview(guildId) {
        const guild = this.bot.guilds.cache.get(guildId);
        if (!guild) return [];

        const serverEmojis = Array.from(guild.emojis.cache.values());
        const existingMappings = this.db.getAllByGuild(guildId);
        const existingMap = new Set(existingMappings.map(m => m.bot_name.toLowerCase()));

        const preview = [];

        for (const emoji of serverEmojis) {
            const normalizedName = emoji.name.toLowerCase().replace(/[-_\s]/g, '');
            const matchingBotName = this.findMatchingBotName(emoji.name);
            const isMapped = existingMap.has(normalizedName) ||
                (matchingBotName && existingMap.has(matchingBotName.toLowerCase()));

            preview.push({
                emojiId: emoji.id,
                emojiName: emoji.name,
                emojiUrl: emoji.url,
                isAnimated: emoji.animated,
                suggestedBotName: matchingBotName || `emoji_${normalizedName}`,
                isMapped: isMapped,
                category: matchingBotName ? this.getCategoryForEmoji(matchingBotName) : 'custom'
            });
        }

        return preview;
    }

    getCategories() {
        return defaultEmojiConfig.categories.map(c => ({
            name: c.name,
            description: c.description,
            emojiCount: c.emojis.length
        }));
    }

    getDefaultEmojisByCategory() {
        const categorized = {};

        for (const category of defaultEmojiConfig.categories) {
            categorized[category.name] = category.emojis.map(e => ({
                botName: e.botName,
                fallback: e.fallback,
                description: e.description
            }));
        }

        return categorized;
    }

    clearGuildCache(guildId) {
        this.cache.delete(guildId);
    }

    clearAllCache() {
        this.cache.clear();
    }
}

export default EmojiManager;
