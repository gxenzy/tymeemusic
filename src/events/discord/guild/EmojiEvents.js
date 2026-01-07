import { EmbedBuilder } from 'discord.js';

class EmojiEventHandler {
    constructor(bot) {
        this.bot = bot;
    }

    async guildCreate(guild) {
        if (!this.bot.emojiManager) return;

        try {
            await this.bot.emojiManager.syncGuild(guild.id);
            console.log(`Emojis synced for new guild: ${guild.name} (${guild.id})`);
        } catch (error) {
            console.error(`Error syncing emojis for guild ${guild.id}:`, error);
        }
    }

    async guildDelete(guild) {
        if (!this.bot.emojiManager) return;

        try {
            this.bot.emojiManager.clearGuildCache(guild.id);
            console.log(`Emoji cache cleared for guild: ${guild.name} (${guild.id})`);
        } catch (error) {
            console.error(`Error clearing emoji cache for guild ${guild.id}:`, error);
        }
    }

    async guildEmojisUpdate(emojis) {
        if (!this.bot.emojiManager) return;

        try {
            const guild = emojis.first()?.guild;
            if (!guild) return;

            await this.bot.emojiManager.syncGuild(guild.id);

            if (this.bot.websocket) {
                this.bot.websocket.broadcastToGuild(guild.id, 'emoji:sync', {
                    guildId: guild.id,
                    timestamp: Date.now()
                });
            }

            console.log(`Emojis updated for guild: ${guild.name} (${guild.id})`);
        } catch (error) {
            console.error('Error handling emoji update event:', error);
        }
    }

    async guildAvailable(guild) {
        if (!this.bot.emojiManager) return;

        try {
            if (!this.bot.emojiManager.cache.has(guild.id)) {
                await this.bot.emojiManager.syncGuild(guild.id);
            }
        } catch (error) {
            console.error(`Error handling guild available for ${guild.id}:`, error);
        }
    }

    async guildUnavailable(guild) {
        if (!this.bot.emojiManager) return;

        try {
            this.bot.emojiManager.clearGuildCache(guild.id);
        } catch (error) {
            console.error(`Error handling guild unavailable for ${guild.id}:`, error);
        }
    }
}

export default EmojiEventHandler;
