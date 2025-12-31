import { Database } from "#structures/classes/Database";
import { config } from "#config/config";

export class EmojiMapping extends Database {
    constructor() {
        super(config.database.guild);
        this.initTable();
    }

    initTable() {
        this.exec(`
            CREATE TABLE IF NOT EXISTS emoji_mappings (
                guild_id TEXT NOT NULL,
                bot_name TEXT NOT NULL,
                discord_name TEXT,
                emoji_id TEXT,
                emoji_url TEXT,
                is_animated INTEGER DEFAULT 0,
                is_available INTEGER DEFAULT 1,
                fallback TEXT,
                category TEXT DEFAULT 'general',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (guild_id, bot_name)
            )
        `);
    }

    getByGuildAndName(guildId, botName) {
        if (!guildId || !botName) return null;
        return this.get(
            "SELECT * FROM emoji_mappings WHERE guild_id = ? AND bot_name = ?",
            [guildId, botName]
        );
    }

    getByCategory(guildId, category) {
        if (!guildId) return [];
        return this.all(
            "SELECT * FROM emoji_mappings WHERE guild_id = ? AND category = ?",
            [guildId, category]
        );
    }

    getAllByGuild(guildId) {
        if (!guildId) return [];
        return this.all(
            "SELECT * FROM emoji_mappings WHERE guild_id = ?",
            [guildId]
        );
    }

    upsertMapping(guildId, botName, data) {
        const stmt = this.db.prepare(`
            INSERT INTO emoji_mappings (guild_id, bot_name, discord_name, emoji_id, emoji_url, is_animated, is_available, fallback, category)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(guild_id, bot_name) DO UPDATE SET
                discord_name = COALESCE(?, emoji_mappings.discord_name),
                emoji_id = COALESCE(?, emoji_mappings.emoji_id),
                emoji_url = COALESCE(?, emoji_mappings.emoji_url),
                is_animated = COALESCE(?, emoji_mappings.is_animated),
                is_available = COALESCE(?, emoji_mappings.is_available),
                fallback = COALESCE(?, emoji_mappings.fallback),
                category = COALESCE(?, emoji_mappings.category),
                updated_at = CURRENT_TIMESTAMP
        `);

        return stmt.run(
            guildId, botName,
            data.discordName || null,
            data.emojiId || null,
            data.emojiUrl || null,
            data.isAnimated ? 1 : 0,
            data.isAvailable ? 1 : 0,
            data.fallback || null,
            data.category || 'general',
            data.discordName || null,
            data.emojiId || null,
            data.emojiUrl || null,
            data.isAnimated ? 1 : 0,
            data.isAvailable ? 1 : 0,
            data.fallback || null,
            data.category || 'general'
        );
    }

    deleteByEmojiId(guildId, emojiId) {
        if (!guildId || !emojiId) return { changes: 0 };
        return this.exec(
            "DELETE FROM emoji_mappings WHERE guild_id = ? AND emoji_id = ?",
            [guildId, emojiId]
        );
    }

    deleteByBotName(guildId, botName) {
        if (!guildId || !botName) return { changes: 0 };
        return this.exec(
            "DELETE FROM emoji_mappings WHERE guild_id = ? AND bot_name = ?",
            [guildId, botName]
        );
    }

    resetGuildEmojis(guildId) {
        if (!guildId) return { changes: 0 };
        return this.exec(
            "DELETE FROM emoji_mappings WHERE guild_id = ?",
            [guildId]
        );
    }

    setFallback(guildId, botName, fallback) {
        return this.exec(
            "UPDATE emoji_mappings SET fallback = ?, updated_at = CURRENT_TIMESTAMP WHERE guild_id = ? AND bot_name = ?",
            [fallback, guildId, botName]
        );
    }

    setUnavailable(guildId, botName) {
        return this.exec(
            "UPDATE emoji_mappings SET is_available = 0, updated_at = CURRENT_TIMESTAMP WHERE guild_id = ? AND bot_name = ?",
            [guildId, botName]
        );
    }
}

export default new EmojiMapping();
