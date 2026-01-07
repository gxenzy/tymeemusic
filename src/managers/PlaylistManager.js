import { db } from "#database/DatabaseManager";
import { logger } from "#utils/logger";
import { TrackResolver } from "./TrackResolver.js";
import { PlayerManager } from "./PlayerManager.js";

/**
 * PlaylistManager (V2 Fresh Start)
 * Handles business logic for playlists, delegating data access to PlaylistsV2 repo.
 */
export class PlaylistManager {
    constructor(client) {
        this.client = client;
        this.db = db.playlistsV2;
        this.resolver = new TrackResolver(client.lavalink);
    }

    /**
     * Create a new playlist
     */
    /**
     * Create a new playlist
     */
    async createPlaylist(userId, options = {}) {
        if (typeof options === 'string') {
            options = { name: options };
        }
        if (!options.name) throw new Error("Playlist name is required");
        if (!userId) throw new Error("User ID is required");
        const playlist = await this.db.createPlaylist(userId, options);
        if (playlist) {
            playlist.ownerName = await this.getDiscordUsername(userId);
        }
        return playlist;
    }

    /**
     * Get user playlists
     */
    async getUserPlaylists(userId, options = {}) {
        if (!userId) return [];
        const playlists = await this.db.getUserPlaylists(userId, options);
        // Enrich with usernames in parallel
        return Promise.all(playlists.map(async p => ({
            ...p,
            ownerName: await this.getDiscordUsername(p.user_id)
        })));
    }

    /**
     * Get a playlist
     */
    async getPlaylist(id, userId) {
        const playlist = await this.db.getPlaylist(id, userId);
        if (playlist) {
            playlist.ownerName = await this.getDiscordUsername(playlist.user_id);
        }
        return playlist;
    }

    /**
     * Delete a playlist
     */
    async deletePlaylist(id, userId) {
        return this.db.deletePlaylist(id, userId);
    }

    /**
     * Update playlist metadata
     */
    async updatePlaylist(id, userId, updates) {
        const playlist = await this.db.updatePlaylist(id, userId, updates);
        if (playlist) {
            playlist.ownerName = await this.getDiscordUsername(playlist.user_id);
        }
        return playlist;
    }

    /**
     * Add a single track
     */
    async addTrack(playlistId, userId, track) {
        return this.addTracks(playlistId, userId, [track]);
    }

    /**
     * Add multiple tracks
     */
    async addTracks(playlistId, userId, tracks) {
        const pl = await this.db.getPlaylist(playlistId);
        if (!pl) throw new Error("Playlist not found");
        if (pl.user_id !== userId) throw new Error("Unauthorized");

        return this.db.addTracks(playlistId, userId, tracks);
    }

    /**
     * Remove a track
     */
    async removeTrack(playlistId, userId, trackId) {
        const pl = await this.db.getPlaylist(playlistId);
        if (!pl) throw new Error("Playlist not found");
        if (pl.user_id !== userId) throw new Error("Unauthorized");

        return this.db.removeTrack(playlistId, trackId, userId);
    }

    async removeTrackAtPosition(playlistId, userId, position) {
        const pl = await this.db.getPlaylist(playlistId);
        if (!pl) throw new Error("Playlist not found");
        if (pl.user_id !== userId) throw new Error("Unauthorized");

        return this.db.removeTrackAtPosition(playlistId, position, userId);
    }

    async clearPlaylist(playlistId, userId) {
        const pl = await this.db.getPlaylist(playlistId);
        if (!pl) throw new Error("Playlist not found");
        if (pl.user_id !== userId) throw new Error("Unauthorized");

        return this.db.clearTracks(playlistId, userId);
    }

    async reorderTracks(playlistId, userId, fromIndex, toIndex) {
        const pl = await this.db.getPlaylist(playlistId);
        if (!pl) throw new Error("Playlist not found");
        if (pl.user_id !== userId) throw new Error("Unauthorized");

        return this.db.reorderTracks(playlistId, userId, fromIndex, toIndex);
    }

    /**
     * Play a playlist
     */
    async playPlaylist(playlistId, guildId, options = {}) {
        const { userId, startIndex = 0, shuffle = false, clearQueue = true } = options;

        let playlist;
        // Check if it's a system playlist ID (format: system_type_userId)
        if (playlistId && playlistId.startsWith('system_')) {
            const parts = playlistId.split('_');
            if (parts.length >= 3) {
                const type = parts[1];
                const ownerId = parts.slice(2).join('_');

                // Only allow playing if the requester is the owner
                if (ownerId === userId) {
                    playlist = await this.getSystemPlaylist(userId, type);
                }
            }
        }

        if (!playlist) {
            playlist = await this.db.getPlaylist(playlistId, userId);
        }

        if (!playlist || (!playlist.is_public && playlist.user_id !== userId && !playlist.isSystemPlaylist)) {
            throw new Error("Playlist not found or private");
        }

        if (!playlist.tracks || playlist.tracks.length === 0) {
            throw new Error("Playlist is empty");
        }

        const guild = this.client.guilds.cache.get(guildId);
        if (!guild) throw new Error("Guild not found");

        const member = guild.members.cache.get(userId);
        const voiceChannel = member?.voice?.channel;
        const textChannel = options.textChannelId ? guild.channels.cache.get(options.textChannelId) : null;

        if (!voiceChannel) throw new Error("You must be in a voice channel to play music!");

        // Initialize player
        const player = await this.client.music.createPlayer({
            guildId,
            voiceChannelId: voiceChannel.id,
            textChannelId: textChannel?.id,
            selfDeaf: true
        });

        if (!player) throw new Error("Failed to create player");

        // Ensure we have a valid requester object (User)
        let requester = options.requester;
        if (!requester && userId) {
            try {
                requester = await this.client.users.fetch(userId);
            } catch (e) {
                logger.warn('PlaylistManager', `Failed to fetch user ${userId}, using basic object`);
                requester = { id: userId };
            }
        }

        // Connect to voice
        if (player.state !== "CONNECTED") {
            player.connect();
        }
        const pm = new PlayerManager(player);

        // Note: clearQueue is handled later during track addition

        let tracksToPlay = [...playlist.tracks];
        if (shuffle) {
            tracksToPlay = tracksToPlay.sort(() => Math.random() - 0.5);
        } else if (startIndex > 0) {
            tracksToPlay = tracksToPlay.slice(startIndex);
        }

        // Resolve tracks properly - for Spotify, use the original URI to get accurate resolution
        const queueTracks = [];
        for (const t of tracksToPlay) {
            try {
                const title = t.info?.title || t.title || "Unknown Title";
                const author = t.info?.author || t.author || "Unknown Artist";
                const originalUri = t.info?.uri || t.uri;
                const sourceName = t.info?.sourceName || t.sourceName || 'unknown';
                const isSpotify = sourceName === 'spotify' || (originalUri && originalUri.includes('spotify.com'));

                // For Spotify tracks, resolve using the Spotify URI directly
                // This is exactly what t!p does and gives the most accurate results
                if (isSpotify && originalUri && originalUri.includes('spotify.com')) {
                    try {
                        logger.debug('PlaylistManager', `Resolving Spotify track: ${title} via ${originalUri}`);
                        const searchResult = await this.client.music.search(originalUri, { requester: options.requester || { id: userId } });
                        if (searchResult?.tracks?.[0]) {
                            const resolved = searchResult.tracks[0];
                            // Preserve original metadata
                            resolved.userData = {
                                ...(resolved.userData || {}),
                                originalUri,
                                originalTitle: title,
                                originalAuthor: author,
                                originalSource: 'spotify'
                            };
                            queueTracks.push(resolved);
                            continue;
                        }
                    } catch (resolveErr) {
                        logger.warn('PlaylistManager', `Failed to resolve Spotify track ${title}: ${resolveErr.message}`);
                    }
                }

                // For non-Spotify tracks with encoded data, use it directly
                if (t.encoded && typeof t.encoded === 'string' && t.encoded.length > 30) {
                    try {
                        const built = this.client.lavalink.utils.buildTrack(t.encoded, options.requester || { id: userId });
                        if (built) {
                            queueTracks.push(built);
                            continue;
                        }
                    } catch (buildErr) {
                        logger.debug('PlaylistManager', `Failed to build from encoded: ${buildErr.message}`);
                    }
                }

                // Fallback: Build unresolved track for Lavalink to resolve at playtime
                const requesterData = {
                    id: userId,
                    originalUri,
                    originalTitle: title,
                    originalAuthor: author,
                    originalSource: sourceName
                };

                const trackData = {
                    title,
                    author,
                    duration: t.info?.length || t.duration || 0,
                    uri: originalUri,
                    identifier: originalUri,
                    sourceName: sourceName,
                    artworkUrl: t.info?.artworkUrl || t.artwork_url || '',
                    isSeekable: true,
                    isStream: false
                };

                // Use lavalink utils to build unresolved track if available
                if (this.client.lavalink.utils) {
                    const builder = this.client.lavalink.utils.buildUnresolvedTrack || this.client.lavalink.utils.buildUnresolved;
                    if (typeof builder === 'function') {
                        const unresolvedTrack = builder.call(this.client.lavalink.utils, trackData, requesterData);
                        if (unresolvedTrack) {
                            unresolvedTrack.userData = { ...unresolvedTrack.userData, ...requesterData };
                            queueTracks.push(unresolvedTrack);
                            continue;
                        }
                    }
                }

                // Manual fallback construction
                queueTracks.push({
                    info: {
                        identifier: originalUri,
                        sourceName,
                        title,
                        author,
                        uri: originalUri,
                        artworkUrl: t.info?.artworkUrl || t.artwork_url || '',
                        length: t.info?.length || t.duration || 0,
                        duration: t.info?.length || t.duration || 0,
                        isSeekable: true,
                        isStream: false
                    },
                    requester: requesterData,
                    userData: requesterData
                });

            } catch (err) {
                logger.error('PlaylistManager', `Critical error processing track ${t.title || 'unknown'}: ${err.message}`);
                // Add minimal track data as last resort
                queueTracks.push({
                    info: {
                        title: t.title || "Unknown",
                        uri: t.uri
                    },
                    requester: { id: userId },
                    userData: { id: userId }
                });
            }
        }


        if (queueTracks.length > 1) {
            logger.debug('PlaylistManager', `Debug: Second Track Structure: ${JSON.stringify(queueTracks[1]?.info?.title || 'N/A')}`);
        }

        logger.info('PlaylistManager', `Resolved and adding ${queueTracks.length} tracks to guild ${guildId}`);


        // Add tracks to queue - use proper API which handles UnresolvedTrack creation
        if (clearQueue) {
            // Use PlayerManager's clearQueue which handles the specific queue implementation details
            await pm.clearQueue();
        }

        // Add all tracks using add(), which converts plain objects to proper Track/UnresolvedTrack instances
        await player.queue.add(queueTracks);

        logger.warn('PlaylistManager', `Queue now has ${player.queue.tracks.length} tracks after adding ${queueTracks.length} tracks.`);

        // Save and notify
        await player.queue.utils.save();
        if (this.client.webServer) {
            this.client.webServer.updatePlayerState(guildId);
        }

        // Handle playback initiation
        if (clearQueue || (!player.playing && !player.paused)) {
            if (player.queue.tracks.length > 0) {
                logger.info('PlaylistManager', `Starting playback of: ${queueTracks[0]?.info?.title || 'first track'}`);
                // Use player.play() directly - it will shift from queue and start playing
                await player.play();
            } else {
                logger.error('PlaylistManager', `Queue is empty! Cannot start playback.`);
                throw new Error("Failed to initiate playback: Queue is empty after adding tracks.");
            }
        }

        return {
            playlist: { id: playlist.id, name: playlist.name },
            tracksQueued: queueTracks.length,
            shuffled: shuffle
        };
    }

    /**
     * Add playlist to queue without clearing
     */
    async queuePlaylist(playlistId, guildId, options = {}) {
        return this.playPlaylist(playlistId, guildId, { ...options, clearQueue: false });
    }

    /**
     * Import from Spotify
     */
    async importFromSpotify(userId, url, options = {}) {
        if (!url.includes('spotify.com')) throw new Error("Invalid Spotify URL");

        // Send initial progress if callback exists
        options.progressCallback?.({ status: 'fetching', message: 'Fetching Spotify tracks...' });

        const result = await this.client.music.search(url, { requester: { id: userId } });
        if (!result || !result.tracks || result.tracks.length === 0) {
            logger.warn('PlaylistManager', `Import failed: No tracks found for ${url}`);
            throw new Error("No tracks found on Spotify URL. Make sure the playlist is public.");
        }

        logger.info('PlaylistManager', `Found ${result.tracks.length} tracks on Spotify. Importing...`);

        // Extract playlist info from search result
        const playlistInfo = result.playlist || result.playlistInfo || {};
        const playlistName = options.name || playlistInfo.name || playlistInfo.title || result.playlistName || `Spotify Import - ${new Date().toLocaleDateString()}`;
        const playlistOwner = playlistInfo.owner?.name || playlistInfo.author || playlistInfo.creator || 'Spotify';

        // Build a proper description with credits
        const description = `Playlist by ${playlistOwner}. Imported from Spotify.`;

        const playlist = await this.createPlaylist(userId, { name: playlistName, description });

        // Enrich tracks with better artwork/metadata one by one to avoid rate limits
        const enrichedTracks = [];
        const total = result.tracks.length;

        logger.debug('PlaylistManager', `Starting enrichment for ${total} tracks...`);

        for (let i = 0; i < total; i++) {
            try {
                const track = result.tracks[i];
                if (i % 10 === 0) {
                    options.progressCallback?.({
                        status: 'enriching',
                        message: `Processing track ${i + 1}/${total}...`,
                        progress: (i / total) * 100
                    });
                }
                // Use track directly - no enrichment needed as LavaSrc handles resolution at playtime
                enrichedTracks.push(track);
            } catch (e) {
                logger.warn('PlaylistManager', `Failed to process track at index ${i}: ${e.message}`);
                enrichedTracks.push(result.tracks[i]);
            }
        }


        const addResult = await this.db.addTracks(playlist.id, userId, enrichedTracks);
        logger.success('PlaylistManager', `Imported ${addResult.addedCount} tracks from Spotify to playlist ${playlist.id}`);

        return {
            playlist,
            imported: addResult.addedCount,
            total: enrichedTracks.length
        };

    }

    /**
     * Import from YouTube
     */
    async importFromYouTube(userId, url, options = {}) {
        if (!url.includes('youtube.com') && !url.includes('youtu.be')) throw new Error("Invalid YouTube URL");

        options.progressCallback?.({ status: 'fetching', message: 'Fetching YouTube tracks...' });

        const result = await this.client.music.search(url, { requester: { id: userId } });
        if (!result || !result.tracks || result.tracks.length === 0) {
            throw new Error("No tracks found on YouTube URL. Make sure the video/playlist is public.");
        }

        // Extract playlist info from search result
        const playlistInfo = result.playlist || result.playlistInfo || {};
        const playlistName = options.name || playlistInfo.name || playlistInfo.title || result.playlistName || `YouTube Import - ${new Date().toLocaleDateString()}`;
        const playlistOwner = playlistInfo.owner?.name || playlistInfo.author || playlistInfo.creator || 'YouTube';

        // Build a proper description with credits
        const description = `Playlist by ${playlistOwner}. Imported from YouTube.`;

        const playlist = await this.createPlaylist(userId, { name: playlistName, description });

        // Enrich tracks sequentially for consistency
        const enrichedTracks = [];
        const total = result.tracks.length;
        for (let i = 0; i < total; i++) {
            try {
                const track = result.tracks[i];
                if (i % 25 === 0) {
                    options.progressCallback?.({
                        status: 'enriching',
                        message: `Processing track ${i + 1}/${total}...`,
                        progress: (i / total) * 100
                    });
                }
                // Use track directly - no enrichment needed
                enrichedTracks.push(track);
            } catch (e) {
                enrichedTracks.push(result.tracks[i]);
            }
        }


        const addResult = await this.db.addTracks(playlist.id, userId, enrichedTracks);
        logger.success('PlaylistManager', `Imported ${addResult.addedCount} tracks from YouTube to playlist ${playlist.id}`);

        return {
            playlist,
            imported: addResult.addedCount,
            total: enrichedTracks.length
        };

    }

    /**
     * Import from current queue
     */
    async importFromQueue(userId, guildId, name) {
        logger.info('PlaylistManager', `Importing queue for user ${userId} in guild ${guildId}`);
        const player = this.client.music.getPlayer(guildId);
        if (!player) {
            logger.warn('PlaylistManager', `Import failed: No active player in guild ${guildId}`);
            throw new Error("No active player in this guild");
        }

        const tracks = [];
        if (player.queue.current) tracks.push(player.queue.current);
        if (player.queue.tracks.length > 0) tracks.push(...player.queue.tracks);

        logger.info('PlaylistManager', `Found ${tracks.length} tracks in queue`);
        if (tracks.length === 0) throw new Error("Queue is empty");

        const playlistName = name || `Queue - ${new Date().toLocaleString()}`;
        const playlist = await this.createPlaylist(userId, { name: playlistName, description: `Saved from queue in ${guildId}` });

        logger.info('PlaylistManager', `Created playlist ${playlist.id}, adding tracks...`);
        const result = await this.db.addTracks(playlist.id, userId, tracks);

        logger.success('PlaylistManager', `Successfully imported ${result.addedCount} tracks to ${playlist.id}`);
        return {
            playlist: { ...playlist, ownerName: await this.getDiscordUsername(userId) },
            imported: result.addedCount,
            total: tracks.length
        };
    }

    /**
     * Helper to get Discord username
     */
    async getDiscordUsername(userId) {
        try {
            const user = await this.client.users.fetch(userId).catch(() => null);
            return user ? user.username : 'Unknown User';
        } catch (e) {
            return 'Unknown User';
        }
    }

    // ============ SYSTEM PLAYLISTS ============

    /**
     * Get a system playlist (liked, recent, discover, top)
     */
    async getSystemPlaylist(userId, type) {
        // Special logic for dynamic system playlists
        if (type === 'discover' || type === 'top') {
            await this.db.generateSmartPlaylist(userId, this.client.db, { type });
        }

        const playlist = await this.db.getOrCreateSystemPlaylist(userId, type);
        if (playlist) {
            playlist.ownerName = await this.getDiscordUsername(userId);
            playlist.isSystemPlaylist = true;
            playlist.systemType = type;
        }
        return playlist;
    }

    /**
     * Get public playlists for discovery
     */
    async getPublicPlaylists(limit = 20, excludeUserId = null) {
        const playlists = this.db.getPublicPlaylists(limit, excludeUserId);
        return Promise.all(playlists.map(async p => ({
            ...p,
            ownerName: await this.getDiscordUsername(p.user_id)
        })));
    }

    /**
     * Like a track (adds to Liked Songs)
     */
    async likeTrack(userId, track) {
        return this.db.likeTrack(userId, track);
    }

    /**
     * Unlike a track
     */
    async unlikeTrack(userId, trackId) {
        return this.db.unlikeTrack(userId, trackId);
    }

    /**
     * Check if track is liked
     */
    async isTrackLiked(userId, trackId) {
        return this.db.isTrackLiked(userId, trackId);
    }

    // ============ COLLABORATIVE PLAYLISTS ============

    /**
     * Get collaborators for a playlist
     */
    async getCollaborators(playlistId, userId) {
        const collaborators = this.db.getCollaborators(playlistId);
        // Enrich with usernames
        return Promise.all(collaborators.map(async c => ({
            ...c,
            username: await this.getDiscordUsername(c.user_id)
        })));
    }

    /**
     * Add a collaborator
     */
    async addCollaborator(playlistId, ownerId, collaboratorId, role = 'editor') {
        const collaborators = await this.db.addCollaborator(playlistId, ownerId, collaboratorId, role);
        return this.getCollaborators(playlistId, ownerId);
    }

    /**
     * Remove a collaborator
     */
    async removeCollaborator(playlistId, ownerId, collaboratorId) {
        await this.db.removeCollaborator(playlistId, ownerId, collaboratorId);
        return this.getCollaborators(playlistId, ownerId);
    }

    /**
     * Toggle collaborative mode
     */
    async toggleCollaborative(playlistId, userId, enabled) {
        const playlist = await this.db.toggleCollaborative(playlistId, userId, enabled);
        if (playlist) {
            playlist.ownerName = await this.getDiscordUsername(playlist.user_id);
        }
        return playlist;
    }
}
