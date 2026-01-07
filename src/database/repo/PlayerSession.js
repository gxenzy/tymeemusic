import { Database } from "#structures/classes/Database";
import { config } from "#config/config";
import { logger } from "#utils/logger";

export class PlayerSession extends Database {
    constructor() {
        super(config.database.playerSession);
        this.initTable();
    }

    initTable() {
        this.exec(`
      CREATE TABLE IF NOT EXISTS player_sessions (
        guild_id TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    }

    getStorageId(guildId) {
        if (!guildId) return null;
        return config.clientId ? `${guildId}_${config.clientId}` : guildId;
    }

    saveSession(guildId, data) {
        const storageId = this.getStorageId(guildId);
        return this.exec(
            "INSERT OR REPLACE INTO player_sessions (guild_id, data) VALUES (?, ?)",
            [storageId, JSON.stringify(data)]
        );
    }

    getSession(guildId) {
        const storageId = this.getStorageId(guildId);
        const row = this.get("SELECT data FROM player_sessions WHERE guild_id = ?", [storageId]);
        if (!row) return null;
        try {
            return JSON.parse(row.data);
        } catch (e) {
            logger.error("PlayerSession", `Failed to parse session data for guild ${guildId}`, e);
            return null;
        }
    }

    deleteSession(guildId) {
        const storageId = this.getStorageId(guildId);
        return this.exec("DELETE FROM player_sessions WHERE guild_id = ?", [storageId]);
    }

    clearAllSessions() {
        return this.exec("DELETE FROM player_sessions");
    }

    getAllSessions() {
        // We only want sessions for this client instance
        const sessions = this.all("SELECT * FROM player_sessions");

        // Filter by client ID suffix if applicable
        return sessions
            .filter(row => {
                if (!config.clientId) return true;
                return row.guild_id.endsWith(`_${config.clientId}`);
            })
            .map(row => {
                let guildId = row.guild_id;
                if (config.clientId) {
                    guildId = row.guild_id.slice(0, -(config.clientId.length + 1));
                }
                try {
                    return {
                        guildId,
                        data: JSON.parse(row.data)
                    };
                } catch (e) {
                    return null;
                }
            })
            .filter(Boolean);
    }
}
