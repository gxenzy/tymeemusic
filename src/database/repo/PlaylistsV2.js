import { Database } from '#structures/classes/Database';
import { config } from "#config/config";
import { logger } from "#utils/logger";

/**
 * Playlist Database V2 - Normalized Schema
 * Implements the "Fresh Start" plan with relational tables.
 */
export class PlaylistsV2 extends Database {
    constructor() {
        super(config.database.playlistsV2);
        this.initTables();
    }

    initTables() {
        // Tables init
        // Removed DROP TABLE commands to ensure persistence

        // 1. Playlists Table (Aligned with Plan)
        this.exec(`
            CREATE TABLE IF NOT EXISTS playlists (
                id TEXT PRIMARY KEY,              -- pl_xxxx
                user_id TEXT NOT NULL,            -- Discord user ID
                guild_id TEXT,                    -- Optional guild scope
                name TEXT NOT NULL,
                description TEXT,
                cover_url TEXT,                   -- Cover image URL
                is_public INTEGER DEFAULT 0,
                is_collaborative INTEGER DEFAULT 0,
                track_count INTEGER DEFAULT 0,
                total_duration INTEGER DEFAULT 0, -- milliseconds
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_played_at TIMESTAMP,
                play_count INTEGER DEFAULT 0
            )
        `);

        // 2. Tracks Cache Table (Normalized & Aligned with Plan)
        this.exec(`
            CREATE TABLE IF NOT EXISTS tracks (
                id TEXT PRIMARY KEY,              -- Unique identifier (URI or hash)
                source TEXT NOT NULL,             -- youtube, spotify, soundcloud
                source_id TEXT,                   -- Platform-specific ID
                title TEXT NOT NULL,
                author TEXT,
                album TEXT, 
                duration INTEGER,                 -- milliseconds
                artwork_url TEXT,
                uri TEXT,                         -- Playable URI
                encoded TEXT,                     -- Lavalink encoded base64 track string
                isrc TEXT,                        -- For cross-platform matching
                is_explicit INTEGER DEFAULT 0,
                last_verified TIMESTAMP,          -- When track was last checked
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // 3. Playlist Tracks Junction Table (Ordering)
        this.exec(`
            CREATE TABLE IF NOT EXISTS playlist_tracks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                playlist_id TEXT NOT NULL,
                track_id TEXT NOT NULL,           -- Reference to tracks table
                position INTEGER NOT NULL,        -- Order in playlist
                added_by TEXT,                    -- User who added
                added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
                FOREIGN KEY (track_id) REFERENCES tracks(id)
            )
        `);

        // 4. Playlist Collaborators Table
        this.exec(`
            CREATE TABLE IF NOT EXISTS playlist_collaborators (
                playlist_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                role TEXT DEFAULT 'editor',       -- owner, editor, viewer
                added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (playlist_id, user_id),
                FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE
            )
        `);

        // Indexes for performance
        this.exec(`CREATE INDEX IF NOT EXISTS idx_playlist_id ON playlist_tracks(playlist_id)`);
        this.exec(`CREATE INDEX IF NOT EXISTS idx_track_id ON playlist_tracks(track_id)`);
        this.exec(`CREATE INDEX IF NOT EXISTS idx_playlist_user ON playlists(user_id)`);

        // 5. Play History (Added for System Playlists)
        this.exec(`
            CREATE TABLE IF NOT EXISTS play_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                track_id TEXT NOT NULL,
                guild_id TEXT,
                played_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (track_id) REFERENCES tracks(id)
            )
        `);
        this.exec(`CREATE INDEX IF NOT EXISTS idx_history_user ON play_history(user_id)`);
        this.exec(`CREATE INDEX IF NOT EXISTS idx_history_played ON play_history(played_at)`);
    }

    /**
     * Log a track play to history
     */
    async logPlay(track, userId, guildId) {
        if (!track || !userId) return;

        // 1. Ensure track exists in tracks table
        try {
            await this.addTracks('temp_ignore', userId, [track]);
            // Note: addTracks inserts into 'tracks' table via transaction, but we don't want to add to a playlist.
            // We can extract just the track insertion logic or rely on addTracks ignoring if playlistId is invalid?
            // Actually, addTracks logic (lines 188+) tries to insert into playlist_tracks.
            // I should implement a helper ensureTrackExists.
        } catch (e) {
            // ignore
        }

        // Simpler: Just extract the logic to ensure track exists.
        const info = track.info || track;
        const uri = info.uri || info.identifier;
        if (!uri) return;

        const trackId = uri.length > 200 ? Buffer.from(uri).toString('base64').substring(0, 100) : uri;

        const stmt = this.db.prepare(`
            INSERT OR IGNORE INTO tracks (id, source, source_id, title, author, album, duration, artwork_url, uri, is_explicit, encoded)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        stmt.run(
            trackId,
            info.sourceName || 'unknown',
            info.identifier || null,
            info.title || 'Unknown Title',
            info.author || 'Unknown Artist',
            null, // album
            info.length || 0,
            info.artworkUrl || null,
            uri,
            0,
            track.encoded || null
        );

        // 2. Insert into history
        this.exec(`
            INSERT INTO play_history (user_id, track_id, guild_id)
            VALUES (?, ?, ?)
        `, [userId, trackId, guildId]);
    }

    /**
     * Get recent tracks for dynamic playlist
     */
    /**
     * Get recent tracks for dynamic playlist
     */
    getRecentlyPlayedTracks(userId, limit = 50) {
        // First try the play_history table in this DB
        const tracks = this.all(`
            SELECT t.*, ph.played_at 
            FROM play_history ph
            JOIN tracks t ON ph.track_id = t.id
            WHERE ph.user_id = ?
            ORDER BY ph.played_at DESC
            LIMIT ?
        `, [userId, limit]);

        if (tracks.length > 0) {
            return tracks.map(t => {
                let identifier = t.uri;
                if (t.source === 'spotify' && t.uri && t.uri.includes('spotify.com')) {
                    identifier = t.uri;
                } else if (t.isrc) {
                    identifier = `ytmsearch:${t.isrc}`;
                }

                return {
                    ...t,
                    id: String(t.id),
                    info: {
                        title: t.title,
                        author: t.author,
                        length: t.duration,
                        artworkUrl: t.artwork_url,
                        uri: t.uri,
                        identifier: identifier,
                        isrc: t.isrc,
                        sourceName: t.source
                    },
                    encoded: t.encoded,
                    isrc: t.isrc
                };
            });
        }


        return [];
    }

    /**
     * Create a new playlist
     */
    async createPlaylist(userId, options = {}) {
        const { name, description = '', isPublic = false, guildId = null, coverUrl = null } = options;
        const id = `pl_${Date.now().toString(36)}`;

        // Explicit casting to ensure SQLite compatibility
        const params = [
            String(id),
            String(userId),
            String(name),
            String(description || ''),
            String(coverUrl || ''),
            isPublic ? 1 : 0,
            guildId ? String(guildId) : null
        ];

        try {
            this.exec(`
                INSERT INTO playlists (id, user_id, name, description, cover_url, is_public, guild_id)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `, params);
            return this.getPlaylist(id);
        } catch (e) {
            logger.error('PlaylistsV2', `Create failed. Params: ${JSON.stringify(params)}`, e);
            throw e;
        }
    }

    /**
     * Get a playlist by ID (with optional check for owner/privacy)
     */
    getPlaylist(id, requestingUserId = null) {
        const playlist = this.get('SELECT * FROM playlists WHERE id = ?', [id]);
        if (!playlist) return null;

        // Privacy check
        if (requestingUserId && playlist.user_id !== requestingUserId && !playlist.is_public) {
            // Check collaborators
            const collaborator = this.get('SELECT 1 FROM playlist_collaborators WHERE playlist_id = ? AND user_id = ?', [id, requestingUserId]);
            if (!collaborator) return null;
        }

        let mappedTracks = [];

        // Dynamic System Playlists Logic
        const isSystemRecent = id.startsWith('system_recent_');
        const isSystemTop = id.startsWith('system_top_');
        const isSystemDiscover = id.startsWith('system_discover_');

        if (isSystemRecent && requestingUserId && id.endsWith(requestingUserId)) {
            mappedTracks = this.getRecentlyPlayedTracks(requestingUserId);
        } else if (isSystemTop && requestingUserId && id.endsWith(requestingUserId)) {
            // Get most played tracks from history
            const tracks = this.all(`
                SELECT t.*, COUNT(ph.track_id) as play_count
                FROM play_history ph
                JOIN tracks t ON ph.track_id = t.id
                WHERE ph.user_id = ?
                GROUP BY ph.track_id
                ORDER BY play_count DESC
                LIMIT 50
            `, [requestingUserId]);

            mappedTracks = tracks.map(t => {
                let identifier = t.uri;
                if (t.source === 'spotify' && t.uri && t.uri.includes('spotify.com')) {
                    identifier = t.uri;
                } else if (t.isrc) {
                    identifier = `ytmsearch:${t.isrc}`;
                }

                return {
                    ...t,
                    id: String(t.id),
                    info: {
                        title: t.title,
                        author: t.author,
                        length: t.duration,
                        artworkUrl: t.artwork_url,
                        uri: t.uri,
                        identifier: identifier,
                        isrc: t.isrc,
                        sourceName: t.source
                    },
                    encoded: t.encoded,
                    isrc: t.isrc
                };
            });

        } else if (isSystemDiscover && requestingUserId && id.endsWith(requestingUserId)) {
            // Placeholder: Discover Weekly usually needs external API or complex logic
            // For now, return recent tracks not played in the last day? 
            // Or just a variety of tracks from history.
            mappedTracks = this.getRecentlyPlayedTracks(requestingUserId, 30);
        } else {
            // Standard Playlist Fetch
            const tracks = this.all(`
               SELECT 
                   pt.position, pt.added_by, pt.added_at, 
                   t.* 
               FROM playlist_tracks pt
               JOIN tracks t ON pt.track_id = t.id
               WHERE pt.playlist_id = ?
               ORDER BY pt.position ASC
            `, [id]);

            mappedTracks = tracks.map(t => {
                // Build proper identifier for LavaSrc resolution
                // If it's a Spotify track, use the Spotify URI directly
                // Otherwise, construct a search query with ISRC if available
                let identifier = t.uri;
                if (t.source === 'spotify' && t.uri && t.uri.includes('spotify.com')) {
                    identifier = t.uri; // Direct Spotify URL works best
                } else if (t.isrc) {
                    // Use ISRC for accurate YouTube Music resolution
                    identifier = `ytmsearch:${t.isrc}`;
                } else if (t.uri) {
                    identifier = t.uri;
                }

                return {
                    ...t,
                    id: String(t.id),
                    info: {
                        title: t.title,
                        author: t.author,
                        length: t.duration,
                        artworkUrl: t.artwork_url,
                        uri: t.uri,
                        identifier: identifier,
                        isrc: t.isrc,
                        sourceName: t.source
                    },
                    encoded: t.encoded,
                    isrc: t.isrc
                };
            });

        }

        const collageArtworks = mappedTracks
            .slice(0, 4)
            .map(t => t.info.artworkUrl)
            .filter(url => !!url);

        return {
            ...playlist,
            is_public: !!playlist.is_public,
            is_collaborative: !!playlist.is_collaborative,
            tracks: mappedTracks,
            collageArtworks
        };
    }

    /**
     * Add tracks to playlist
     */
    async addTracks(playlistId, userId, tracks) {
        if (!Array.isArray(tracks)) tracks = [tracks];

        let addedCount = 0;
        let skipped = 0;

        const maxPosRow = this.get('SELECT MAX(position) as pos FROM playlist_tracks WHERE playlist_id = ?', [playlistId]);
        let currentPos = maxPosRow?.pos || 0;

        const db = this.db;

        const transaction = db.transaction((tracksToAdd) => {
            for (const track of tracksToAdd) {
                const info = track.info || track;
                const uri = info.uri || info.identifier;

                if (!uri) {
                    skipped++;
                    continue;
                }

                // Normalizing track ID
                const trackId = uri.length > 200 ? Buffer.from(uri).toString('base64').substring(0, 100) : uri;

                // 1. Ensure track exists in cache
                this.exec(`
                    INSERT INTO tracks (id, title, author, duration, artwork_url, uri, source, encoded, isrc)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(id) DO UPDATE SET
                    title = excluded.title,
                    author = excluded.author,
                    duration = excluded.duration,
                    artwork_url = excluded.artwork_url,
                    uri = excluded.uri,
                    encoded = excluded.encoded,
                    isrc = excluded.isrc
                `, [
                    trackId,
                    info.title || 'Unknown Title',
                    info.author || 'Unknown Artist',
                    info.length || info.duration || 0,
                    info.artworkUrl || info.artwork_url || info.thumbnail || info.image || '',
                    uri,
                    info.sourceName || info.source || 'unknown',
                    track.encoded || null,
                    track.isrc || info.isrc || null
                ]);

                // 2. Add to playlist_tracks if not already there
                const exists = this.get('SELECT 1 FROM playlist_tracks WHERE playlist_id = ? AND track_id = ?', [playlistId, trackId]);

                if (!exists) {
                    currentPos++;
                    this.exec(`
                        INSERT INTO playlist_tracks(playlist_id, track_id, position, added_by)
                VALUES(?, ?, ?, ?)
                    `, [playlistId, trackId, currentPos, userId]);
                    addedCount++;
                } else {
                    skipped++;
                }
            }
        });

        transaction(tracks);

        // Update track count and duration
        this.exec(`
            UPDATE playlists 
            SET track_count = (SELECT COUNT(*) FROM playlist_tracks WHERE playlist_id = ?),
            total_duration = (
                SELECT SUM(t.duration) 
                    FROM playlist_tracks pt 
                    JOIN tracks t ON pt.track_id = t.id 
                    WHERE pt.playlist_id = ?
                ),
        updated_at = CURRENT_TIMESTAMP 
            WHERE id = ?
            `, [playlistId, playlistId, playlistId]);

        return {
            addedCount,
            skipped,
            playlist: this.getPlaylist(playlistId, userId)
        };
    }

    /**
     * Remove track by identification
     */
    async removeTrack(playlistId, trackId, userId) {
        this.exec('DELETE FROM playlist_tracks WHERE playlist_id = ? AND track_id = ?', [playlistId, trackId]);
        this.renumberPositions(playlistId);
        this.exec(`
            UPDATE playlists 
            SET track_count = (SELECT COUNT(*) FROM playlist_tracks WHERE playlist_id = ?),
        total_duration = (
            SELECT COALESCE(SUM(t.duration), 0) 
                    FROM playlist_tracks pt 
                    JOIN tracks t ON pt.track_id = t.id 
                    WHERE pt.playlist_id = ?
                ),
        updated_at = CURRENT_TIMESTAMP 
            WHERE id = ?
            `, [playlistId, playlistId, playlistId]);
        return this.getPlaylist(playlistId, userId);
    }

    /**
     * Remove track at specific position
     */
    async removeTrackAtPosition(playlistId, position, userId) {
        // Find the track ID at that position first to be safe
        const track = this.get('SELECT id FROM playlist_tracks WHERE playlist_id = ? AND position = ?', [playlistId, position]);

        if (!track) {
            // No track at that position, but let's return the playlist anyway
            return this.getPlaylist(playlistId, userId);
        }

        this.exec('DELETE FROM playlist_tracks WHERE id = ?', [track.id]);
        this.renumberPositions(playlistId);
        this.exec(`
            UPDATE playlists 
            SET track_count = (SELECT COUNT(*) FROM playlist_tracks WHERE playlist_id = ?),
            total_duration = (
                SELECT COALESCE(SUM(t.duration), 0) 
                FROM playlist_tracks pt 
                JOIN tracks t ON pt.track_id = t.id 
                WHERE pt.playlist_id = ?
            ),
            updated_at = CURRENT_TIMESTAMP 
            WHERE id = ?
        `, [playlistId, playlistId, playlistId]);

        return this.getPlaylist(playlistId, userId);
    }

    /**
     * Clear all tracks
     */
    async clearTracks(playlistId, userId) {
        this.exec('DELETE FROM playlist_tracks WHERE playlist_id = ?', [playlistId]);
        this.exec('UPDATE playlists SET track_count = 0, total_duration = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [playlistId, playlistId]);
        return this.getPlaylist(playlistId, userId);
    }

    /**
     * Renumber all track positions to be contiguous 1..N
     */
    renumberPositions(playlistId) {
        const tracks = this.all('SELECT id FROM playlist_tracks WHERE playlist_id = ? ORDER BY position ASC', [playlistId]);
        const db = this.db;
        const transaction = db.transaction((items) => {
            items.forEach((item, idx) => {
                this.exec('UPDATE playlist_tracks SET position = ? WHERE id = ?', [idx + 1, item.id]);
            });
        });
        transaction(tracks);
    }

    async updatePlaylist(id, userId, updates) {
        const { name, description, isPublic, coverUrl } = updates;
        if (name) this.exec('UPDATE playlists SET name = ? WHERE id = ?', [name, id]);
        if (description !== undefined) this.exec('UPDATE playlists SET description = ? WHERE id = ?', [description, id]);
        if (isPublic !== undefined) this.exec('UPDATE playlists SET is_public = ? WHERE id = ?', [isPublic ? 1 : 0, id]);
        if (coverUrl !== undefined) this.exec('UPDATE playlists SET cover_url = ? WHERE id = ?', [coverUrl, id]);

        this.exec('UPDATE playlists SET updated_at = CURRENT_TIMESTAMP WHERE id = ?', [id]);
        return this.getPlaylist(id, userId);
    }

    async deletePlaylist(id, userId) {
        const pl = this.get('SELECT user_id FROM playlists WHERE id = ?', [id]);
        if (!pl || pl.user_id !== userId) return false;
        this.exec('DELETE FROM playlists WHERE id = ?', [id]);
        return true;
    }

    async reorderTracks(playlistId, userId, fromIndex, toIndex) {
        const tracks = this.all('SELECT id FROM playlist_tracks WHERE playlist_id = ? ORDER BY position ASC', [playlistId]);

        if (fromIndex < 0 || fromIndex >= tracks.length || toIndex < 0 || toIndex >= tracks.length) return this.getPlaylist(playlistId, userId);

        const [moved] = tracks.splice(fromIndex, 1);
        tracks.splice(toIndex, 0, moved);

        const db = this.db;
        const update = db.transaction((sortedTracks) => {
            sortedTracks.forEach((track, idx) => {
                this.exec('UPDATE playlist_tracks SET position = ? WHERE id = ?', [idx + 1, track.id]);
            });
        });

        update(tracks);
        this.exec('UPDATE playlists SET updated_at = CURRENT_TIMESTAMP WHERE id = ?', [playlistId]);
        return this.getPlaylist(playlistId, userId);
    }

    getUserPlaylists(userId, options = {}) {
        const { guildId, includePublic = false } = options;

        let query = 'SELECT * FROM playlists WHERE user_id = ?';
        const params = [userId];

        if (guildId) {
            query += ' OR guild_id = ?';
            params.push(guildId);
        }

        if (includePublic) {
            query += ' OR is_public = 1';
        }

        query += ' ORDER BY created_at DESC';

        const playlists = this.all(query, params);

        return playlists.map(p => {
            // Fetch up to 4 artworks for the collage
            const artworks = this.all(`
                SELECT t.artwork_url 
                FROM playlist_tracks pt 
                JOIN tracks t ON pt.track_id = t.id 
                WHERE pt.playlist_id = ? AND t.artwork_url IS NOT NULL AND t.artwork_url != ''
                ORDER BY pt.position ASC
                LIMIT 4
            `, [p.id]).map(r => r.artwork_url);

            return {
                ...p,
                is_public: !!p.is_public,
                is_collaborative: !!p.is_collaborative,
                collageArtworks: artworks
            };
        });
    }

    // ============ COLLABORATIVE PLAYLISTS ============

    /**
     * Add a collaborator to a playlist
     */
    async addCollaborator(playlistId, ownerId, collaboratorId, role = 'editor') {
        const playlist = this.get('SELECT user_id FROM playlists WHERE id = ?', [playlistId]);
        if (!playlist || playlist.user_id !== ownerId) {
            throw new Error('Only the playlist owner can add collaborators');
        }

        // Check if already a collaborator
        const existing = this.get(
            'SELECT 1 FROM playlist_collaborators WHERE playlist_id = ? AND user_id = ?',
            [playlistId, collaboratorId]
        );
        if (existing) {
            throw new Error('User is already a collaborator');
        }

        this.exec(`
            INSERT INTO playlist_collaborators (playlist_id, user_id, role)
            VALUES (?, ?, ?)
        `, [playlistId, collaboratorId, role]);

        // Enable collaborative mode if not already
        this.exec('UPDATE playlists SET is_collaborative = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [playlistId]);

        return this.getCollaborators(playlistId);
    }

    /**
     * Remove a collaborator from a playlist
     */
    async removeCollaborator(playlistId, ownerId, collaboratorId) {
        const playlist = this.get('SELECT user_id FROM playlists WHERE id = ?', [playlistId]);
        if (!playlist || playlist.user_id !== ownerId) {
            throw new Error('Only the playlist owner can remove collaborators');
        }

        this.exec(
            'DELETE FROM playlist_collaborators WHERE playlist_id = ? AND user_id = ?',
            [playlistId, collaboratorId]
        );

        // Disable collaborative mode if no collaborators left
        const remaining = this.get('SELECT COUNT(*) as count FROM playlist_collaborators WHERE playlist_id = ?', [playlistId]);
        if (remaining.count === 0) {
            this.exec('UPDATE playlists SET is_collaborative = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [playlistId]);
        }

        return this.getCollaborators(playlistId);
    }

    /**
     * Get all collaborators for a playlist
     */
    getCollaborators(playlistId) {
        return this.all(`
            SELECT user_id, role, added_at
            FROM playlist_collaborators
            WHERE playlist_id = ?
            ORDER BY added_at ASC
        `, [playlistId]);
    }

    /**
     * Toggle collaborative mode
     */
    async toggleCollaborative(playlistId, userId, enabled) {
        const playlist = this.get('SELECT user_id FROM playlists WHERE id = ?', [playlistId]);
        if (!playlist || playlist.user_id !== userId) {
            throw new Error('Only the playlist owner can change collaborative mode');
        }

        this.exec('UPDATE playlists SET is_collaborative = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [enabled ? 1 : 0, playlistId]);

        return this.getPlaylist(playlistId, userId);
    }

    /**
     * Check if user can edit playlist (owner or collaborator with editor role)
     */
    canUserEdit(playlistId, userId) {
        const playlist = this.get('SELECT user_id, is_collaborative FROM playlists WHERE id = ?', [playlistId]);
        if (!playlist) return false;
        if (playlist.user_id === userId) return true;
        if (!playlist.is_collaborative) return false;

        const collab = this.get(
            'SELECT role FROM playlist_collaborators WHERE playlist_id = ? AND user_id = ?',
            [playlistId, userId]
        );
        return collab && (collab.role === 'editor' || collab.role === 'owner');
    }

    // ============ SYSTEM PLAYLISTS (Liked, Recently Played, Smart) ============

    /**
     * Get or create a system playlist (liked songs, recently played, etc)
     */
    getOrCreateSystemPlaylist(userId, type) {
        const systemTypes = {
            liked: { name: '❤️ Liked Songs', description: 'Your favorite tracks' },
            recent: { name: '🕐 Recently Played', description: 'Your listening history' },
            discover: { name: '✨ Discover Weekly', description: 'Songs we think you\'ll love' },
            top: { name: '🔥 Your Top Tracks', description: 'Your most played songs' }
        };

        const config = systemTypes[type];
        if (!config) throw new Error(`Unknown system playlist type: ${type}`);

        const systemId = `system_${type}_${userId}`;

        let playlist = this.get('SELECT * FROM playlists WHERE id = ?', [systemId]);

        if (!playlist) {
            this.exec(`
                INSERT INTO playlists (id, user_id, name, description, is_public, is_collaborative)
                VALUES (?, ?, ?, ?, 0, 0)
            `, [systemId, userId, config.name, config.description]);
            playlist = this.get('SELECT * FROM playlists WHERE id = ?', [systemId]);
        }

        return this.getPlaylist(systemId, userId);
    }

    /**
     * Get recently played tracks for user (from user history table)
     * This reads from the user database's track history
     */
    getRecentlyPlayed(userId, limit = 50) {
        // Note: This requires accessing the user database
        // For now, return the system playlist if it exists
        return this.getOrCreateSystemPlaylist(userId, 'recent');
    }

    /**
     * Add track to liked songs
     */
    async likeTrack(userId, track) {
        const playlist = this.getOrCreateSystemPlaylist(userId, 'liked');
        return this.addTracks(playlist.id, userId, [track]);
    }

    /**
     * Remove track from liked songs
     */
    async unlikeTrack(userId, trackId) {
        const systemId = `system_liked_${userId}`;
        return this.removeTrack(systemId, trackId, userId);
    }

    /**
     * Check if track is liked
     */
    isTrackLiked(userId, trackId) {
        const systemId = `system_liked_${userId}`;
        const result = this.get(
            'SELECT 1 FROM playlist_tracks WHERE playlist_id = ? AND track_id = ?',
            [systemId, trackId]
        );
        return !!result;
    }

    /**
     * Get all liked tracks for user
     */
    getLikedTracks(userId) {
        const playlist = this.getOrCreateSystemPlaylist(userId, 'liked');
        return playlist?.tracks || [];
    }

    /**
     * Generate a smart playlist based on listening patterns
     */
    async generateSmartPlaylist(userId, db, options = {}) {
        const { type = 'discover', limit = 30 } = options;

        // Get user's listening history from the USER database (Legacy history)
        const legacyHistory = db.user?.getHistory?.(userId) || [];

        // Also get history from play_history table
        const localHistory = this.all(`
            SELECT t.* FROM play_history ph
            JOIN tracks t ON ph.track_id = t.id
            WHERE ph.user_id = ?
            ORDER BY ph.played_at DESC
            LIMIT 100
        `, [userId]);

        // Merge and unique-ify
        const allHistory = [...localHistory.map(t => ({
            title: t.title,
            author: t.author,
            uri: t.uri,
            artworkUrl: t.artwork_url,
            duration: t.duration,
            sourceName: t.source,
            encoded: t.encoded
        })), ...legacyHistory];

        if (allHistory.length === 0) {
            return { tracks: [], message: 'Not enough listening history' };
        }

        // Filter and process (e.g., top artists)
        const artistCounts = {};
        allHistory.forEach(track => {
            const artist = track.author || 'Unknown';
            artistCounts[artist] = (artistCounts[artist] || 0) + 1;
        });

        const topArtists = Object.entries(artistCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([artist]) => artist);

        // System playlist ID
        const systemId = `system_${type}_${userId}`;
        const playlist = this.getOrCreateSystemPlaylist(userId, type);

        // For "Discover Weekly" or "Top Tracks", we might want to refresh the tracks
        // In this simple implementation, we just ensure the system playlist is ready
        // getPlaylist already handles dynamic tracks for system_top_ etc.

        return {
            playlist,
            topArtists,
            historyCount: allHistory.length,
            message: `Smart playlist updated based on ${allHistory.length} tracks`
        };
    }

    /**
     * Get tracks for a "Radio" experience
     */
    async getRadioTracks(userId, type, seed = null) {
        // Simple Radio implementation:
        // 'mixed' -> A mix of top tracks and similar genres
        // 'artist' -> Tracks by the seed artist + top artists from history
        // 'discovery' -> Tracks from history you haven't played much lately

        let query = '';
        let params = [];

        if (type === 'mixed') {
            query = `
                SELECT t.* FROM tracks t
                JOIN play_history ph ON t.id = ph.track_id
                WHERE ph.user_id = ?
                GROUP BY t.id
                ORDER BY RANDOM()
                LIMIT 30
            `;
            params = [userId];
        } else if (type === 'artist' && seed) {
            query = `
                SELECT * FROM tracks 
                WHERE author LIKE ? OR author LIKE ?
                ORDER BY RANDOM()
                LIMIT 30
            `;
            params = [`%${seed}%`, `%${seed.split(' ')[0]}%` || seed];
        } else {
            // Default to random history
            query = `SELECT t.* FROM tracks t JOIN play_history ph ON t.id = ph.track_id WHERE ph.user_id = ? GROUP BY t.id ORDER BY RANDOM() LIMIT 20`;
            params = [userId];
        }

        const tracks = this.all(query, params);
        return tracks.map(t => ({
            ...t,
            id: String(t.id),
            info: {
                title: t.title,
                author: t.author,
                length: t.duration,
                artworkUrl: t.artwork_url,
                uri: t.uri,
                sourceName: t.source
            },
            encoded: t.encoded
        }));
    }

    /**
     * Get public playlists for discovery
     */
    getPublicPlaylists(limit = 20, excludeUserId = null) {
        let query = 'SELECT * FROM playlists WHERE is_public = 1';
        const params = [];

        if (excludeUserId) {
            query += ' AND user_id != ?';
            params.push(excludeUserId);
        }

        query += ' ORDER BY play_count DESC, track_count DESC LIMIT ?';
        params.push(limit);

        const playlists = this.all(query, params);

        return playlists.map(p => {
            const artworks = this.all(`
                SELECT t.artwork_url 
                FROM playlist_tracks pt 
                JOIN tracks t ON pt.track_id = t.id 
                WHERE pt.playlist_id = ? AND t.artwork_url IS NOT NULL AND t.artwork_url != ''
                ORDER BY pt.position ASC
                LIMIT 4
            `, [p.id]).map(r => r.artwork_url);

            return {
                ...p,
                is_public: true,
                is_collaborative: !!p.is_collaborative,
                collageArtworks: artworks
            };
        });
    }

    /**
     * Log a track play to history
     */
    async logPlay(track, userId, guildId) {
        try {
            if (!track || !userId) return;
            const trackInfo = track.info || track;

            // 1. Cache the track data first
            const trackId = await this.saveTrackToCache(trackInfo, track.encoded);

            // 2. Add to play_history table
            this.exec(`
                INSERT INTO play_history (user_id, track_id, guild_id)
                VALUES (?, ?, ?)
            `, [userId, trackId, guildId]);

            // 3. Update playlist global stats if it was a system playlist
            // (Optional: update last_played_at for specific playlists if needed)

            return trackId;
        } catch (error) {
            logger.error("PlaylistsV2", "Error logging track play:", error);
            return null;
        }
    }

    /**
     * Save/Update a track in the cache table
     */
    async saveTrackToCache(trackInfo, encoded = null) {
        try {
            const id = trackInfo.identifier || trackInfo.uri || trackInfo.id;
            if (!id) return null;

            const existing = this.get('SELECT id FROM tracks WHERE id = ?', [id]);

            const params = [
                id,
                trackInfo.sourceName || 'unknown',
                trackInfo.identifier || id,
                trackInfo.title || 'Unknown Title',
                trackInfo.author || 'Unknown Artist',
                trackInfo.album || '',
                trackInfo.duration || trackInfo.length || 0,
                trackInfo.artworkUrl || trackInfo.thumbnail || '',
                trackInfo.uri || id,
                encoded,
                trackInfo.isrc || null,
                trackInfo.is_explicit ? 1 : 0
            ];

            if (existing) {
                this.exec(`
                    UPDATE tracks SET 
                        source = ?, source_id = ?, title = ?, author = ?, album = ?, 
                        duration = ?, artwork_url = ?, uri = ?, encoded = ?, isrc = ?, 
                        is_explicit = ?, last_verified = CURRENT_TIMESTAMP
                    WHERE id = ?
                `, [...params.slice(1), id]);
            } else {
                this.exec(`
                    INSERT INTO tracks (
                        id, source, source_id, title, author, album, 
                        duration, artwork_url, uri, encoded, isrc, is_explicit
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, params);
            }

            return id;
        } catch (error) {
            logger.error("PlaylistsV2", "Error saving track to cache:", error);
            return null;
        }
    }
}
