import { Database } from '#structures/classes/Database';
import { config } from "#config/config";
import { logger } from "#utils/logger";

const PLAYLIST_LIMIT = 20;
const TRACKS_PER_PLAYLIST_LIMIT = 50;
const PLAYLIST_NAME_MAX_LENGTH = 100;
const PLAYLIST_DESCRIPTION_MAX_LENGTH = 500;

export class Playlists extends Database {
	constructor() {
		super(config.database.playlists);
		this.initTable();
	}

	initTable() {
		this.exec(`
			CREATE TABLE IF NOT EXISTS playlists (
				id TEXT PRIMARY KEY,
				user_id TEXT NOT NULL,
				name TEXT NOT NULL,
				description TEXT DEFAULT NULL,
				cover_image TEXT DEFAULT NULL,
				is_public INTEGER DEFAULT 0,
				tracks TEXT DEFAULT '[]',
				created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
				updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
				total_duration INTEGER DEFAULT 0,
				track_count INTEGER DEFAULT 0
			)
		`);

		this.exec(`
			CREATE INDEX IF NOT EXISTS idx_playlists_user_id ON playlists(user_id)
		`);

		this.exec(`
			CREATE INDEX IF NOT EXISTS idx_playlists_name ON playlists(name)
		`);

		this.migrate();
		
		logger.info('PlaylistsDatabase', 'Playlists table initialized');
	}

	migrate() {
		try {
			const columns = this.all("PRAGMA table_info(playlists)");
			const hasCoverImage = columns.some(col => col.name === 'cover_image');
			if (!hasCoverImage) {
				this.exec(`ALTER TABLE playlists ADD COLUMN cover_image TEXT DEFAULT NULL`);
			}
		} catch (e) {
			logger.warn('PlaylistsDB', 'Migration error for cover_image:', e.message);
		}
		
		try {
			const columns = this.all("PRAGMA table_info(playlists)");
			const hasIsPublic = columns.some(col => col.name === 'is_public');
			if (!hasIsPublic) {
				this.exec(`ALTER TABLE playlists ADD COLUMN is_public INTEGER DEFAULT 0`);
			}
		} catch (e) {
			logger.warn('PlaylistsDB', 'Migration error for is_public:', e.message);
		}
	}

	generatePlaylistId() {
		return 'pl_' + Math.random().toString(36).substr(2, 16) + Date.now().toString(36);
	}

	createPlaylist(userId, name, description = null, isPublic = false, coverImage = null) {
		if (!name || name.length > PLAYLIST_NAME_MAX_LENGTH) {
			throw new Error('Invalid playlist name');
		}

		if (description && description.length > PLAYLIST_DESCRIPTION_MAX_LENGTH) {
			throw new Error('Description too long');
		}

		const userPlaylists = this.getUserPlaylists(userId);
		if (userPlaylists.length >= PLAYLIST_LIMIT) {
			throw new Error('Maximum playlist limit reached');
		}

		const existingPlaylist = userPlaylists.find(pl => 
			pl.name.toLowerCase() === name.toLowerCase()
		);
		if (existingPlaylist) {
			throw new Error('Playlist with this name already exists');
		}

		const playlistId = this.generatePlaylistId();

		const isPublicValue = Boolean(isPublic) ? 1 : 0;
		const safeUserId = userId ? String(userId) : null;
		const safeName = name ? String(name) : 'Untitled';
		const safeDescription = description ? String(description) : null;
		const safeCoverImage = coverImage ? String(coverImage) : null;

		this.exec(`
			INSERT INTO playlists (id, user_id, name, description, cover_image, is_public, tracks, total_duration, track_count)
			VALUES (?, ?, ?, ?, ?, ?, '[]', 0, 0)
		`, [
			String(playlistId), 
			safeUserId, 
			safeName, 
			safeDescription, 
			safeCoverImage, 
			Number(isPublicValue)
		]);

		return this.getPlaylist(playlistId);
	}

	deletePlaylist(playlistId, userId) {
		const playlist = this.getPlaylist(playlistId);
		if (!playlist) {
			throw new Error('Playlist not found');
		}

		const safeUserId = userId ? String(userId) : null;
		if (playlist.user_id !== safeUserId) {
			throw new Error('Access denied');
		}

		const result = this.exec('DELETE FROM playlists WHERE id = ? AND user_id = ?', 
			[String(playlistId), safeUserId]);

		return result.changes > 0;
	}

	getPlaylist(playlistId) {
		const safePlaylistId = playlistId ? String(playlistId) : null;
		if (!safePlaylistId) return null;
		
		const playlist = this.get('SELECT * FROM playlists WHERE id = ?', [safePlaylistId]);
		if (!playlist) return null;

		try {
			playlist.tracks = JSON.parse(playlist.tracks || '[]');
		} catch (e) {
			logger.error('PlaylistsDB', `Failed to parse tracks for playlist ${playlistId}`, e);
			playlist.tracks = [];
		}

		return playlist;
	}

	getAllPlaylists(guildId, userId) {
		if (!userId) {
			// Return empty array if no userId - playlists are user-specific
			return [];
		}
		
		const playlists = this.all('SELECT * FROM playlists WHERE user_id = ? ORDER BY created_at DESC', 
			[String(userId)]);

		return playlists.map(playlist => {
			try {
				playlist.tracks = JSON.parse(playlist.tracks || '[]');
			} catch (e) {
				logger.error('PlaylistsDB', `Failed to parse tracks for playlist ${playlist.id}`, e);
				playlist.tracks = [];
			}
			return playlist;
		});
	}

	getUserPlaylists(userId) {
		const playlists = this.all('SELECT * FROM playlists WHERE user_id = ? ORDER BY created_at DESC', 
			[userId]);

		return playlists.map(playlist => {
			try {
				playlist.tracks = JSON.parse(playlist.tracks || '[]');
			} catch (e) {
				logger.error('PlaylistsDB', `Failed to parse tracks for playlist ${playlist.id}`, e);
				playlist.tracks = [];
			}
			return playlist;
		});
	}

	updatePlaylist(playlistId, userId, updates) {
		const playlist = this.getPlaylist(playlistId);
		if (!playlist || playlist.user_id !== userId) {
			throw new Error('Playlist not found or access denied');
		}

		const allowedFields = ['name', 'description', 'cover_image', 'is_public'];
		const updateFields = [];
		const values = [];

		for (const [field, value] of Object.entries(updates)) {
			if (allowedFields.includes(field) && value !== undefined) {
				if (field === 'name') {
					if (!value || value.length > PLAYLIST_NAME_MAX_LENGTH) {
						throw new Error('Invalid playlist name');
					}
					const existingPlaylist = this.getUserPlaylists(userId).find(pl => 
						pl.name.toLowerCase() === value.toLowerCase() && pl.id !== playlistId
					);
					if (existingPlaylist) {
						throw new Error('Playlist with this name already exists');
					}
				}
				if (field === 'description' && value && value.length > PLAYLIST_DESCRIPTION_MAX_LENGTH) {
					throw new Error('Description too long');
				}
				if (field === 'is_public') {
					updateFields.push(`${field} = ?`);
					values.push(value ? 1 : 0);
					continue;
				}
				updateFields.push(`${field} = ?`);
				values.push(value);
			}
		}

		if (updateFields.length === 0) {
			return playlist;
		}

		updateFields.push('updated_at = CURRENT_TIMESTAMP');
		values.push(playlistId, userId);

		this.exec(`
			UPDATE playlists 
			SET ${updateFields.join(', ')} 
			WHERE id = ? AND user_id = ?
		`, values);

		return this.getPlaylist(playlistId);
	}

	addTrackToPlaylist(playlistId, userId, trackInfo) {
		const playlist = this.getPlaylist(playlistId);
		if (!playlist || playlist.user_id !== userId) {
			throw new Error('Playlist not found or access denied');
		}

		if (!trackInfo || !trackInfo.identifier) {
			throw new Error('Invalid track information');
		}

		let tracks = playlist.tracks || [];

		if (tracks.length >= TRACKS_PER_PLAYLIST_LIMIT) {
			throw new Error('Playlist track limit reached');
		}

		const existingTrackIndex = tracks.findIndex(t => t.identifier === trackInfo.identifier);
		if (existingTrackIndex !== -1) {
			throw new Error('Track already exists in playlist');
		}

		const trackEntry = {
			identifier: trackInfo.identifier,
			title: trackInfo.title || 'Unknown Track',
			author: trackInfo.author || 'Unknown',
			album: trackInfo.album || null,
			uri: trackInfo.uri || null,
			duration: trackInfo.duration || null,
			sourceName: trackInfo.sourceName || null,
			artworkUrl: trackInfo.artworkUrl || null,
			isExplicit: trackInfo.isExplicit || false,
			addedAt: Date.now()
		};

		tracks.push(trackEntry);

		const totalDuration = tracks.reduce((sum, track) => 
			sum + (track.duration || 0), 0);

		this.exec(`
			UPDATE playlists 
			SET tracks = ?, total_duration = ?, track_count = ?, updated_at = CURRENT_TIMESTAMP 
			WHERE id = ? AND user_id = ?
		`, [JSON.stringify(tracks), totalDuration, tracks.length, playlistId, userId]);

		return this.getPlaylist(playlistId);
	}

	removeTrackFromPlaylist(playlistId, userId, trackIdentifier) {
		const playlist = this.getPlaylist(playlistId);
		if (!playlist || playlist.user_id !== userId) {
			throw new Error('Playlist not found or access denied');
		}

		let tracks = playlist.tracks || [];
		const originalLength = tracks.length;

		tracks = tracks.filter(track => track.identifier !== trackIdentifier);

		if (tracks.length === originalLength) {
			throw new Error('Track not found in playlist');
		}

		const totalDuration = tracks.reduce((sum, track) => 
			sum + (track.duration || 0), 0);

		this.exec(`
			UPDATE playlists 
			SET tracks = ?, total_duration = ?, track_count = ?, updated_at = CURRENT_TIMESTAMP 
			WHERE id = ? AND user_id = ?
		`, [JSON.stringify(tracks), totalDuration, tracks.length, playlistId, userId]);

		return this.getPlaylist(playlistId);
	}

	reorderPlaylistTracks(playlistId, userId, fromIndex, toIndex) {
		const playlist = this.getPlaylist(playlistId);
		if (!playlist || playlist.user_id !== userId) {
			throw new Error('Playlist not found or access denied');
		}

		let tracks = playlist.tracks || [];
		
		if (fromIndex < 0 || fromIndex >= tracks.length || toIndex < 0 || toIndex >= tracks.length) {
			throw new Error('Invalid track positions');
		}

		const [removedTrack] = tracks.splice(fromIndex, 1);
		tracks.splice(toIndex, 0, removedTrack);

		const totalDuration = tracks.reduce((sum, track) => 
			sum + (track.duration || 0), 0);

		this.exec(`
			UPDATE playlists 
			SET tracks = ?, total_duration = ?, track_count = ?, updated_at = CURRENT_TIMESTAMP 
			WHERE id = ? AND user_id = ?
		`, [JSON.stringify(tracks), totalDuration, tracks.length, playlistId, userId]);

		return this.getPlaylist(playlistId);
	}

	clearPlaylist(playlistId, userId) {
		const playlist = this.getPlaylist(playlistId);
		if (!playlist || playlist.user_id !== userId) {
			throw new Error('Playlist not found or access denied');
		}

		this.exec(`
			UPDATE playlists 
			SET tracks = '[]', total_duration = 0, track_count = 0, updated_at = CURRENT_TIMESTAMP 
			WHERE id = ? AND user_id = ?
		`, [playlistId, userId]);

		return this.getPlaylist(playlistId);
	}

	searchUserPlaylists(userId, query) {
		const playlists = this.all(`
			SELECT * FROM playlists 
			WHERE user_id = ? AND (name LIKE ? OR description LIKE ?) 
			ORDER BY created_at DESC
		`, [userId, `%${query}%`, `%${query}%`]);

		return playlists.map(playlist => {
			try {
				playlist.tracks = JSON.parse(playlist.tracks || '[]');
			} catch (e) {
				logger.error('PlaylistsDB', `Failed to parse tracks for playlist ${playlist.id}`, e);
				playlist.tracks = [];
			}
			return playlist;
		});
	}

	getPlaylistStats(userId) {
		const result = this.get(`
			SELECT 
				COUNT(*) as total_playlists,
				COALESCE(SUM(track_count), 0) as total_tracks,
				COALESCE(SUM(total_duration), 0) as total_duration
			FROM playlists 
			WHERE user_id = ?
		`, [userId]);

		return result || { total_playlists: 0, total_tracks: 0, total_duration: 0 };
	}

	cleanupPlaylists(userId) {
		const playlists = this.getUserPlaylists(userId);

		for (const playlist of playlists) {
			try {
				const tracks = playlist.tracks.filter(track => 
					track && track.identifier && track.title
				);

				const totalDuration = tracks.reduce((sum, track) => 
					sum + (track.duration || 0), 0);

				this.exec(`
					UPDATE playlists 
					SET tracks = ?, total_duration = ?, track_count = ?, updated_at = CURRENT_TIMESTAMP 
					WHERE id = ?
				`, [JSON.stringify(tracks), totalDuration, tracks.length, playlist.id]);

			} catch (e) {
				logger.error('PlaylistsDB', `Failed to cleanup playlist ${playlist.id}`, e);
			}
		}

		logger.info('PlaylistsDB', `Cleaned up playlists for user ${userId}`);
	}
}