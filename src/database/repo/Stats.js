import { Database } from '#structures/classes/Database';
import { config } from '#config/config';
import { logger } from '#utils/logger';

export class Stats extends Database {
    constructor() {
        super(config.database.stats || 'database/stats.db');
        this.initTables();
    }

    initTables() {
        this.exec(`
      CREATE TABLE IF NOT EXISTS track_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT,
        user_id TEXT,
        title TEXT,
        author TEXT,
        uri TEXT,
        artwork_url TEXT,
        duration INTEGER,
        source TEXT,
        played_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

        this.exec(`
      CREATE TABLE IF NOT EXISTS guild_stats (
        guild_id TEXT PRIMARY KEY,
        total_plays INTEGER DEFAULT 0,
        unique_users TEXT DEFAULT '[]',
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

        logger.success('StatsDatabase', 'Stats tables initialized');
    }

    async addTrackPlay(guildId, userId, trackInfo) {
        try {
            // Add to history
            this.exec(`
        INSERT INTO track_history (guild_id, user_id, title, author, uri, artwork_url, duration, source)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [
                guildId,
                userId,
                trackInfo.title,
                trackInfo.author,
                trackInfo.uri,
                trackInfo.artworkUrl || trackInfo.thumbnail,
                trackInfo.duration,
                this.getSourceFromUri(trackInfo.uri)
            ]);

            // Update guild stats
            const stats = this.get('SELECT * FROM guild_stats WHERE guild_id = ?', [guildId]);
            if (!stats) {
                this.exec('INSERT INTO guild_stats (guild_id, total_plays, unique_users) VALUES (?, 1, ?)',
                    [guildId, JSON.stringify([userId])]);
            } else {
                const uniqueUsers = JSON.parse(stats.unique_users || '[]');
                if (!uniqueUsers.includes(userId)) {
                    uniqueUsers.push(userId);
                }
                this.exec('UPDATE guild_stats SET total_plays = total_plays + 1, unique_users = ?, updated_at = CURRENT_TIMESTAMP WHERE guild_id = ?',
                    [JSON.stringify(uniqueUsers), guildId]);
            }
        } catch (error) {
            logger.error('StatsDB', 'Error adding track play:', error);
        }
    }

    getSourceFromUri(uri) {
        if (!uri) return 'Unknown';
        if (uri.includes('spotify.com')) return 'Spotify';
        if (uri.includes('youtube.com') || uri.includes('youtu.be')) return 'YouTube';
        if (uri.includes('soundcloud.com')) return 'SoundCloud';
        if (uri.includes('apple.com')) return 'Apple Music';
        return 'Other';
    }

    getGuildStats(guildId) {
        const stats = this.get('SELECT * FROM guild_stats WHERE guild_id = ?', [guildId]);
        const history = this.all('SELECT * FROM track_history WHERE guild_id = ? ORDER BY played_at DESC LIMIT 100', [guildId]);

        const uniqueUsersCount = stats ? JSON.parse(stats.unique_users || '[]').length : 0;

        return {
            totalPlays: stats?.total_plays || 0,
            uniqueUsers: uniqueUsersCount,
            history: history
        };
    }

    getTopSongs(guildId, limit = 10) {
        return this.all(`
      SELECT title, author, artwork_url, uri, COUNT(*) as playCount
      FROM track_history
      WHERE guild_id = ?
      GROUP BY title, author
      ORDER BY playCount DESC
      LIMIT ?
    `, [guildId, limit]);
    }

    getSourceDistribution(guildId) {
        return this.all(`
      SELECT source, COUNT(*) as count
      FROM track_history
      WHERE guild_id = ?
      GROUP BY source
    `, [guildId]);
    }

    getGlobalStats() {
        const totalPlays = this.get('SELECT SUM(total_plays) as total FROM guild_stats').total || 0;
        const totalGuilds = this.get('SELECT COUNT(*) as count FROM guild_stats').count || 0;
        return { totalPlays, totalGuilds };
    }

    clearGuildStats(guildId) {
        try {
            this.exec('DELETE FROM track_history WHERE guild_id = ?', [guildId]);
            this.exec('DELETE FROM guild_stats WHERE guild_id = ?', [guildId]);
            logger.info('StatsDB', `Cleared statistics for guild: ${guildId}`);
            return true;
        } catch (error) {
            logger.error('StatsDB', `Error clearing guild stats: ${error.message}`);
            return false;
        }
    }
}
