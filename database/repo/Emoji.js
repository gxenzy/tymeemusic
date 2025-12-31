import { Database } from "#structures/classes/Database";
import { config } from "#config/config";
import { logger } from "#utils/logger";

export class Emoji extends Database {
  constructor() {
    super(config.database.guild);
    this.initTable();
  }

  initTable() {
    this.exec(`
      CREATE TABLE IF NOT EXISTS guild_emojis (
        guild_id TEXT NOT NULL,
        emoji_key TEXT NOT NULL,
        emoji_id TEXT NOT NULL,
        emoji_name TEXT NOT NULL,
        emoji_format TEXT DEFAULT 'custom',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (guild_id, emoji_key),
        FOREIGN KEY (guild_id) REFERENCES guilds(id) ON DELETE CASCADE
      )
    `);

    this.exec(`
      CREATE INDEX IF NOT EXISTS idx_guild_emojis_guild 
      ON guild_emojis(guild_id)
    `);
  }

  setEmoji(guildId, emojiKey, emojiId, emojiName) {
    return this.exec(
      `INSERT INTO guild_emojis (guild_id, emoji_key, emoji_id, emoji_name, updated_at)
       VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(guild_id, emoji_key) DO UPDATE SET
         emoji_id = excluded.emoji_id,
         emoji_name = excluded.emoji_name,
         updated_at = CURRENT_TIMESTAMP`,
      [guildId, emojiKey, emojiId, emojiName]
    );
  }

  getEmoji(guildId, emojiKey) {
    return this.get(
      "SELECT * FROM guild_emojis WHERE guild_id = ? AND emoji_key = ?",
      [guildId, emojiKey]
    );
  }

  getAllEmojis(guildId) {
    return this.all(
      "SELECT * FROM guild_emojis WHERE guild_id = ? ORDER BY emoji_key",
      [guildId]
    );
  }

  removeEmoji(guildId, emojiKey) {
    return this.exec(
      "DELETE FROM guild_emojis WHERE guild_id = ? AND emoji_key = ?",
      [guildId, emojiKey]
    );
  }

  clearAllEmojis(guildId) {
    return this.exec(
      "DELETE FROM guild_emojis WHERE guild_id = ?",
      [guildId]
    );
  }

  getEmojiFormat(guildId, emojiKey) {
    const row = this.get(
      "SELECT emoji_format FROM guild_emojis WHERE guild_id = ? AND emoji_key = ?",
      [guildId, emojiKey]
    );
    return row?.emoji_format || 'custom';
  }

  getEmojiCount(guildId) {
    const row = this.get(
      "SELECT COUNT(*) as count FROM guild_emojis WHERE guild_id = ?",
      [guildId]
    );
    return row?.count || 0;
  }

  exists(guildId, emojiKey) {
    const row = this.get(
      "SELECT 1 FROM guild_emojis WHERE guild_id = ? AND emoji_key = ?",
      [guildId, emojiKey]
    );
    return !!row;
  }
}

export default Emoji;
