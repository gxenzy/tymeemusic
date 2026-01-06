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

        const queueTracks = tracksToPlay.map(t => {
            try {
                // If we have encoded data, try to use it
                // CRITICAL: If this is a Spotify track that was previously resolved to YouTube,
                // we should IGNORE the encoded data to force our new high-precision re-resolution.
                const isSpotify = t.info?.sourceName === 'spotify' || (t.info?.uri && t.info.uri.includes('spotify.com'));

                if (t.encoded && typeof t.encoded === 'string' && t.encoded.length > 30 && !isSpotify) {
                    try {
                        return this.client.lavalink.utils.buildTrack(t.encoded, options.requester || { id: userId });
                    } catch (buildErr) {
                        logger.debug('PlaylistManager', `Failed to build track from encoded data for ${t.info?.title || t.title}. Falling back to unresolved. Error: ${buildErr.message}`);
                        // Fall through to unresolved creation
                    }
                }

                // If it IS a Spotify track, we purposefully fall through here to re-resolve
                // using our new improved ytmsearch logic below.

                // Calculate properties first
                let uri = t.info?.uri || t.uri;
                let identifier = t.info?.identifier || t.uri || t.identifier;
                const title = t.info?.title || t.title || "Unknown Title";
                const author = t.info?.author || t.author || "Unknown Artist";
                let sourceName = t.info?.sourceName || t.sourceName || 'youtube';

                // SPECIAL HANDLING: Check for Spotify tracks which fail on Lavalink nodes without Spotify plugin
                const originalUri = uri; // Capture original URI for metadata (e.g. Spotify link)
                let originalSource = sourceName;

                if (uri && (uri.includes('spotify.com') || uri.includes('open.spotify'))) {
                    // FORCE YouTube search because Lavalink Spotify plugin is timing out
                    sourceName = 'youtube';
                    originalSource = 'spotify';

                    // Use ISRC if available in the track data from DB
                    const isrc = t.isrc || t.info?.isrc;
                    const album = t.album || t.info?.album || "";

                    // IMPROVED: Use spsearch (LavaSrc) for native Spotify quality
                    identifier = isrc ? `ytmsearch:isrc:${isrc}` : `spsearch:${title} ${author}`;
                    uri = identifier;
                }

                // Prepare requester data with original metadata to persist through YouTube resolution
                // This allows the UI to show "Spotify" and the original Title/Artist even if playing from YouTube
                const requesterData = {
                    id: userId,
                    originalUri: originalUri,
                    originalTitle: title,
                    originalAuthor: author,
                    originalSource: originalSource
                };

                // Try to use client utils to build validated track object
                if (this.client.lavalink.utils) {
                    const trackData = {
                        title,
                        author,
                        duration: t.info?.length || t.duration || 0,
                        uri,
                        identifier,
                        sourceName,
                        artworkUrl: t.info?.artworkUrl || t.artwork_url || t.info?.thumbnail || t.thumbnail || t.info?.image || t.image || '',
                        isSeekable: true,
                        isStream: false
                    };

                    // Handle different lavalink-client versions
                    const builder = this.client.lavalink.utils.buildUnresolvedTrack || this.client.lavalink.utils.buildUnresolved;
                    if (typeof builder === 'function') {
                        // Pass original metadata in the requester object (which acts as userData container)
                        const unresolvedTrack = builder.call(this.client.lavalink.utils, trackData, requesterData);
                        // Also attach to userData for better persistence in some lavalink-client versions
                        if (unresolvedTrack) {
                            unresolvedTrack.userData = { ...unresolvedTrack.userData, ...requesterData };
                        }
                        return unresolvedTrack;
                    }
                }

                // Fallback manual construction
                return {
                    info: {
                        identifier: identifier,
                        sourceName: sourceName,
                        title: title,
                        author: author,
                        uri: uri,
                        artworkUrl: t.info?.artworkUrl || t.artwork_url || t.info?.thumbnail || t.thumbnail || t.info?.image || t.image || '',
                        length: t.info?.length || t.duration || 0,
                        duration: t.info?.length || t.duration || 0,
                        isSeekable: true,
                        isStream: false
                    },
                    requester: requesterData,
                    userData: requesterData
                };
            } catch (err) {
                // Final safety net
                logger.error('PlaylistManager', `Critical error building track object for ${t.title || 'unknown'}: ${err.message}`);
                return {
                    info: {
                        title: t.title || "Unknown",
                        uri: t.uri
                    },
                    requester: { id: userId },
                    userData: { id: userId }
                };
            }
        });

        if (queueTracks.length > 1) {
            logger.debug('PlaylistManager', `Debug: Second Track Structure: ${JSON.stringify(queueTracks[1])}`);
        }

        logger.info('PlaylistManager', `Adding ${queueTracks.length} tracks to guild ${guildId}`);

        // Resolve the first track before adding to get playable encoded data
        let firstTrack = queueTracks[0];
        if (firstTrack && !firstTrack.encoded) {
            try {
                const firstUri = firstTrack.info?.uri || firstTrack.uri;
                if (firstUri) {
                    logger.info('PlaylistManager', `Resolving first track: ${firstUri}`);
                    // Capture original metadata before resolution
                    const originalMetadata = firstTrack.userData || firstTrack.requester || {};

                    const search = await this.client.music.search(firstUri, { requester: options.requester || { id: userId } });
                    if (search?.tracks?.[0]) {
                        const resolvedTrack = search.tracks[0];

                        // IMPORTANT: Merge original metadata to the resolved track
                        // because a fresh search won't have our "originalTitle" etc.
                        resolvedTrack.userData = { ...(resolvedTrack.userData || {}), ...originalMetadata };

                        // Ensure requester object exists and has the metadata
                        if (!resolvedTrack.requester || typeof resolvedTrack.requester !== 'object') {
                            resolvedTrack.requester = { id: userId, ...originalMetadata };
                        } else {
                            resolvedTrack.requester = { ...resolvedTrack.requester, ...originalMetadata };
                        }

                        firstTrack = resolvedTrack;
                        queueTracks[0] = firstTrack; // Replace with resolved track
                        logger.success('PlaylistManager', `First track resolvd & metadata preserved: "${firstTrack.info?.title || firstTrack.title}"`);
                    }
                }
            } catch (e) {
                logger.warn('PlaylistManager', `Failed to resolve first track (${firstTrack.info?.title}): ${e.message}`);
            }
        }

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
                logger.info('PlaylistManager', `Starting playback of: ${firstTrack?.info?.title || 'first track'}`);
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
            throw new Error("No tracks found on Spotify URL. Make sure the playlist is public.");
        }

        // Extract playlist info from search result
        const playlistInfo = result.playlist || result.playlistInfo || {};
        const playlistName = options.name || playlistInfo.name || playlistInfo.title || result.playlistName || `Spotify Import - ${new Date().toLocaleDateString()}`;
        const playlistOwner = playlistInfo.owner?.name || playlistInfo.author || playlistInfo.creator || 'Spotify';

        // Build a proper description with credits
        const description = `Playlist by ${playlistOwner}. Imported from Spotify.`;

        const playlist = await this.createPlaylist(userId, { name: playlistName, description });

        // Enrich tracks with better artwork/metadata first
        const enrichedTracks = await Promise.all((result.tracks || []).map(t => this.client.music.enrichTrack(t)));

        const addResult = await this.db.addTracks(playlist.id, userId, enrichedTracks);

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

        // Enrich tracks with better artwork/metadata first
        const enrichedTracks = await Promise.all((result.tracks || []).map(t => this.client.music.enrichTrack(t)));

        const addResult = await this.db.addTracks(playlist.id, userId, enrichedTracks);

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
