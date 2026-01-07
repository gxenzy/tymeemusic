import { logger } from '#utils/logger';
import { PlaylistManager } from '#managers/PlaylistManager';

/**
 * Playlist API v2 Routes
 * Clean, consistent API for the new playlist system
 */
export function registerPlaylistV2Routes(app, webServer) {
    const authenticate = webServer.authenticate.bind(webServer);

    // Helper to get PlaylistManager
    const getPlaylistManager = () => {
        if (!webServer.client.playlistManager) {
            webServer.client.playlistManager = new PlaylistManager(webServer.client);
        }
        return webServer.client.playlistManager;
    };

    // Helper to get userId from request
    const getUserId = (req) => {
        return req.session?.passport?.user?.id ||
            req.query.userId ||
            req.body?.localUserId ||
            webServer.getUserIdFromRequest?.(req);
    };

    // ==========================================
    // 1. NON-PARAMETERIZED ROUTES (Highest Priority)
    // ==========================================

    // List user's playlists
    app.get('/api/v2/playlists', authenticate, async (req, res) => {
        try {
            const userId = getUserId(req);
            if (!userId) {
                return res.status(401).json({ error: 'User ID required' });
            }

            const pm = getPlaylistManager();
            const playlists = await pm.getUserPlaylists(userId, {
                guildId: req.query.guildId,
                includePublic: req.query.includePublic === 'true'
            });

            res.json({
                success: true,
                playlists,
                count: playlists.length
            });
        } catch (error) {
            logger.error('PlaylistAPI', 'Error listing playlists:', error);
            res.status(500).json({ error: error.message });
        }
    });

    // Create new playlist
    app.post('/api/v2/playlists', authenticate, async (req, res) => {
        try {
            const userId = getUserId(req);
            if (!userId) {
                return res.status(401).json({ error: 'User ID required' });
            }

            const { name, description, guildId, isPublic, coverUrl } = req.body;

            if (!name || !name.trim()) {
                return res.status(400).json({ error: 'Playlist name is required' });
            }

            const pm = getPlaylistManager();
            const playlist = await pm.createPlaylist(userId, {
                name: name.trim(),
                description,
                guildId,
                isPublic: Boolean(isPublic),
                coverUrl
            });

            // Emit WebSocket event
            if (webServer.broadcastToUser) {
                webServer.broadcastToUser(userId, {
                    type: 'playlist:created',
                    playlist
                });
            }

            res.status(201).json({
                success: true,
                playlist
            });
        } catch (error) {
            logger.error('PlaylistAPI', 'Error creating playlist:', error);
            res.status(400).json({ error: error.message });
        }
    });

    // ==========================================
    // 1.5 SYSTEM PLAYLISTS & SPECIAL ROUTES
    // ==========================================

    // Get system playlist (liked, recent, discover, top)
    app.get('/api/v2/playlists/system/:type', authenticate, async (req, res) => {
        try {
            const userId = getUserId(req);
            if (!userId) {
                return res.status(401).json({ error: 'User ID required' });
            }

            const { type } = req.params;
            const validTypes = ['liked', 'recent', 'discover', 'top'];

            if (!validTypes.includes(type)) {
                return res.status(400).json({
                    error: `Invalid type. Must be one of: ${validTypes.join(', ')}`
                });
            }

            const pm = getPlaylistManager();
            const playlist = await pm.getSystemPlaylist(userId, type);

            res.json({
                success: true,
                playlist,
                isSystemPlaylist: true,
                type
            });
        } catch (error) {
            logger.error('PlaylistAPI', 'Error getting system playlist:', error);
            res.status(500).json({ error: error.message });
        }
    });

    // Get public playlists for discovery
    app.get('/api/v2/playlists/public', authenticate, async (req, res) => {
        try {
            const userId = getUserId(req);
            const limit = parseInt(req.query.limit, 10) || 20;

            const pm = getPlaylistManager();
            const playlists = await pm.getPublicPlaylists(limit, userId);

            res.json({
                success: true,
                playlists,
                count: playlists.length
            });
        } catch (error) {
            logger.error('PlaylistAPI', 'Error getting public playlists:', error);
            res.status(500).json({ error: error.message });
        }
    });

    // Like a track (adds to Liked Songs)
    app.post('/api/v2/playlists/liked/tracks', authenticate, async (req, res) => {
        try {
            const userId = getUserId(req);
            if (!userId) {
                return res.status(401).json({ error: 'User ID required' });
            }

            const { track } = req.body;
            if (!track) {
                return res.status(400).json({ error: 'Track data required' });
            }

            const pm = getPlaylistManager();
            const result = await pm.likeTrack(userId, track);

            if (webServer.broadcastToUser) {
                webServer.broadcastToUser(userId, {
                    type: 'track:liked',
                    trackId: track.identifier || track.uri
                });
            }

            res.json({
                success: true,
                liked: true,
                playlist: result.playlist
            });
        } catch (error) {
            logger.error('PlaylistAPI', 'Error liking track:', error);
            res.status(400).json({ error: error.message });
        }
    });

    // Unlike a track
    app.delete('/api/v2/playlists/liked/tracks/:trackId', authenticate, async (req, res) => {
        try {
            const userId = getUserId(req);
            if (!userId) {
                return res.status(401).json({ error: 'User ID required' });
            }

            const { trackId } = req.params;
            const pm = getPlaylistManager();
            const playlist = await pm.unlikeTrack(userId, trackId);

            if (webServer.broadcastToUser) {
                webServer.broadcastToUser(userId, {
                    type: 'track:unliked',
                    trackId
                });
            }

            res.json({
                success: true,
                liked: false,
                playlist
            });
        } catch (error) {
            logger.error('PlaylistAPI', 'Error unliking track:', error);
            res.status(400).json({ error: error.message });
        }
    });

    // Check if track is liked
    app.get('/api/v2/playlists/liked/check/:trackId', authenticate, async (req, res) => {
        try {
            const userId = getUserId(req);
            if (!userId) {
                return res.status(401).json({ error: 'User ID required' });
            }

            const { trackId } = req.params;
            const pm = getPlaylistManager();
            const isLiked = await pm.isTrackLiked(userId, trackId);

            res.json({
                success: true,
                trackId,
                isLiked
            });
        } catch (error) {
            logger.error('PlaylistAPI', 'Error checking liked status:', error);
            res.status(500).json({ error: error.message });
        }
    });

    // ==========================================
    // 2. IMPORT ROUTES (Must be before parameterized routes)
    // ==========================================


    // Import from Spotify
    app.post('/api/v2/playlists/import/spotify', authenticate, async (req, res) => {
        try {
            const userId = getUserId(req);
            if (!userId) {
                return res.status(401).json({ error: 'User ID required' });
            }

            const { url, name, guildId } = req.body;

            if (!url) {
                return res.status(400).json({ error: 'Spotify URL required' });
            }

            const pm = getPlaylistManager();
            const result = await pm.importFromSpotify(userId, url, {
                name,
                guildId,
                progressCallback: (progress) => {
                    // Send progress via WebSocket
                    if (webServer.broadcastToUser) {
                        webServer.broadcastToUser(userId, {
                            type: 'playlist:import_progress',
                            ...progress
                        });
                    }
                }
            });

            // Send completion event
            if (webServer.broadcastToUser) {
                webServer.broadcastToUser(userId, {
                    type: 'playlist:import_complete',
                    playlistId: result.playlist.id,
                    imported: result.imported,
                    total: result.total
                });
            }

            res.json({
                success: true,
                playlist: result.playlist,
                imported: result.imported,
                total: result.total
            });
        } catch (error) {
            logger.error('PlaylistAPI', 'Error importing from Spotify:', error);
            res.status(400).json({ error: error.message });
        }
    });

    // Import from YouTube
    app.post('/api/v2/playlists/import/youtube', authenticate, async (req, res) => {
        try {
            const userId = getUserId(req);
            if (!userId) {
                return res.status(401).json({ error: 'User ID required' });
            }

            const { url, name, guildId } = req.body;

            if (!url) {
                return res.status(400).json({ error: 'YouTube URL required' });
            }

            const pm = getPlaylistManager();
            const result = await pm.importFromYouTube(userId, url, {
                name,
                guildId,
                progressCallback: (progress) => {
                    if (webServer.broadcastToUser) {
                        webServer.broadcastToUser(userId, {
                            type: 'playlist:import_progress',
                            ...progress
                        });
                    }
                }
            });

            if (webServer.broadcastToUser) {
                webServer.broadcastToUser(userId, {
                    type: 'playlist:import_complete',
                    playlistId: result.playlist.id,
                    imported: result.imported,
                    total: result.total
                });
            }

            res.json({
                success: true,
                playlist: result.playlist,
                imported: result.imported,
                total: result.total
            });
        } catch (error) {
            logger.error('PlaylistAPI', 'Error importing from YouTube:', error);
            res.status(400).json({ error: error.message });
        }
    });

    // Import from current queue
    app.post('/api/v2/playlists/import/queue', authenticate, async (req, res) => {
        try {
            const userId = getUserId(req);
            if (!userId) {
                return res.status(401).json({ error: 'User ID required' });
            }

            const { guildId, name } = req.body;

            if (!guildId) {
                return res.status(400).json({ error: 'Guild ID required' });
            }

            const pm = getPlaylistManager();
            const result = await pm.importFromQueue(userId, guildId, name);

            if (webServer.broadcastToUser) {
                webServer.broadcastToUser(userId, {
                    type: 'playlist:created',
                    playlist: result.playlist
                });
            }

            res.json({
                success: true,
                playlist: result.playlist,
                imported: result.imported,
                total: result.total
            });
        } catch (error) {
            logger.error('PlaylistAPI', 'Error importing from queue:', error);
            res.status(400).json({ error: error.message });
        }
    });

    // ==========================================
    // 3. PARAMETERIZED ROUTES (:id)
    // ==========================================

    // Get single playlist with tracks
    app.get('/api/v2/playlists/:id', authenticate, async (req, res) => {
        try {
            const userId = getUserId(req);
            const { id } = req.params;

            const pm = getPlaylistManager();
            const playlist = await pm.getPlaylist(id, userId);

            if (!playlist) {
                return res.status(404).json({ error: 'Playlist not found' });
            }

            res.json({
                success: true,
                playlist
            });
        } catch (error) {
            logger.error('PlaylistAPI', 'Error getting playlist:', error);
            res.status(500).json({ error: error.message });
        }
    });

    // Update playlist
    app.patch('/api/v2/playlists/:id', authenticate, async (req, res) => {
        try {
            const userId = getUserId(req);
            const { id } = req.params;
            const updates = req.body;

            const pm = getPlaylistManager();
            const playlist = await pm.updatePlaylist(id, userId, updates);

            // Emit WebSocket event
            if (webServer.broadcastToUser) {
                webServer.broadcastToUser(userId, {
                    type: 'playlist:updated',
                    playlist
                });
            }

            res.json({
                success: true,
                playlist
            });
        } catch (error) {
            logger.error('PlaylistAPI', 'Error updating playlist:', error);
            res.status(400).json({ error: error.message });
        }
    });

    // Delete playlist
    app.delete('/api/v2/playlists/:id', authenticate, async (req, res) => {
        try {
            const userId = getUserId(req);
            const { id } = req.params;

            const pm = getPlaylistManager();
            await pm.deletePlaylist(id, userId);

            // Emit WebSocket event
            if (webServer.broadcastToUser) {
                webServer.broadcastToUser(userId, {
                    type: 'playlist:deleted',
                    playlistId: id
                });
            }

            res.json({
                success: true,
                message: 'Playlist deleted'
            });
        } catch (error) {
            logger.error('PlaylistAPI', 'Error deleting playlist:', error);
            res.status(400).json({ error: error.message });
        }
    });

    // Add track(s) to playlist
    app.post('/api/v2/playlists/:id/tracks', authenticate, async (req, res) => {
        try {
            const userId = getUserId(req);
            const { id } = req.params;
            const { track, tracks } = req.body;

            const pm = getPlaylistManager();
            let result;

            if (tracks && Array.isArray(tracks)) {
                result = await pm.addTracks(id, userId, tracks);
            } else if (track) {
                try {
                    const playlist = await pm.addTrack(id, userId, track);
                    result = { playlist, addedCount: 1, skipped: 0 };
                } catch (e) {
                    if (e.message.includes('already exists')) {
                        // Return success=true but addedCount=0 to indicate no change
                        // Fetch playlist to return current state
                        const playlist = await pm.getPlaylist(id, userId);
                        result = { playlist, addedCount: 0, skipped: 1, message: 'Track already exists' };
                    } else {
                        throw e;
                    }
                }
            } else {
                return res.status(400).json({ error: 'Track data required' });
            }

            // Emit WebSocket event if something was actually added
            if (result.addedCount > 0 && webServer.broadcastToUser) {
                webServer.broadcastToUser(userId, {
                    type: 'playlist:tracks_added',
                    playlistId: id,
                    addedCount: result.addedCount
                });
            }

            res.json({
                success: true,
                playlist: result.playlist,
                addedCount: result.addedCount,
                skipped: result.skipped || 0,
                message: result.message
            });
        } catch (error) {
            logger.error('PlaylistAPI', 'Error adding tracks:', error);
            res.status(400).json({ error: error.message });
        }
    });

    // Remove track from playlist
    app.delete('/api/v2/playlists/:id/tracks/:trackId', authenticate, async (req, res) => {
        try {
            const userId = getUserId(req);
            const { id, trackId } = req.params;

            const pm = getPlaylistManager();
            const playlist = await pm.removeTrack(id, userId, trackId);

            // Emit WebSocket event
            if (webServer.broadcastToUser) {
                webServer.broadcastToUser(userId, {
                    type: 'playlist:track_removed',
                    playlistId: id,
                    trackId
                });
            }

            res.json({
                success: true,
                playlist
            });
        } catch (error) {
            logger.error('PlaylistAPI', 'Error removing track:', error);
            res.status(400).json({ error: error.message });
        }
    });

    // Remove track by position
    app.delete('/api/v2/playlists/:id/tracks/position/:position', authenticate, async (req, res) => {
        try {
            const userId = getUserId(req);
            const { id, position } = req.params;

            logger.info('PlaylistAPI', `Remove track request: playlist=${id}, position=${position}, userId=${userId}`);

            if (!userId) {
                return res.status(401).json({ error: 'User ID required - please log in' });
            }

            const pm = getPlaylistManager();
            const playlist = await pm.removeTrackAtPosition(id, userId, parseInt(position, 10));

            logger.info('PlaylistAPI', `Track removed successfully from playlist ${id}`);

            res.json({
                success: true,
                playlist
            });
        } catch (error) {
            logger.error('PlaylistAPI', 'Error removing track:', error);
            res.status(400).json({ error: error.message });
        }
    });

    // Reorder tracks
    app.patch('/api/v2/playlists/:id/tracks/reorder', authenticate, async (req, res) => {
        try {
            const userId = getUserId(req);
            const { id } = req.params;
            const { from, to } = req.body;

            if (typeof from !== 'number' || typeof to !== 'number') {
                return res.status(400).json({ error: 'Invalid from/to positions' });
            }

            const pm = getPlaylistManager();
            const playlist = await pm.reorderTracks(id, userId, from, to);

            // Emit WebSocket event
            if (webServer.broadcastToUser) {
                webServer.broadcastToUser(userId, {
                    type: 'playlist:tracks_reordered',
                    playlistId: id
                });
            }

            res.json({
                success: true,
                playlist
            });
        } catch (error) {
            logger.error('PlaylistAPI', 'Error reordering tracks:', error);
            res.status(400).json({ error: error.message });
        }
    });

    // Clear all tracks
    app.delete('/api/v2/playlists/:id/tracks', authenticate, async (req, res) => {
        try {
            const userId = getUserId(req);
            const { id } = req.params;

            const pm = getPlaylistManager();
            const playlist = await pm.clearPlaylist(id, userId);

            res.json({
                success: true,
                playlist
            });
        } catch (error) {
            logger.error('PlaylistAPI', 'Error clearing playlist:', error);
            res.status(400).json({ error: error.message });
        }
    });

    // Play entire playlist
    app.post('/api/v2/playlists/:id/play', authenticate, async (req, res) => {
        try {
            const userId = getUserId(req);
            const { id } = req.params;
            const { guildId, shuffle, startIndex, clearQueue } = req.body;

            if (!guildId) {
                return res.status(400).json({ error: 'Guild ID required' });
            }

            const pm = getPlaylistManager();
            const result = await pm.playPlaylist(id, guildId, {
                userId,
                shuffle: Boolean(shuffle),
                startIndex: parseInt(startIndex, 10) || 0,
                clearQueue: clearQueue !== false,
                requester: { id: userId, username: 'Dashboard' }
            });

            if (webServer.updatePlayerState) {
                webServer.updatePlayerState(guildId);
            }

            res.json({
                success: true,
                message: `Playing ${result.playlist.name}`,
                tracksQueued: result.tracksQueued,
                shuffled: result.shuffled
            });
        } catch (error) {
            logger.error('PlaylistAPI', 'Error playing playlist:', error);
            res.status(400).json({ error: error.message });
        }
    });

    // Add playlist to queue
    app.post('/api/v2/playlists/:id/queue', authenticate, async (req, res) => {
        try {
            const userId = getUserId(req);
            const { id } = req.params;
            const { guildId, shuffle } = req.body;

            if (!guildId) {
                return res.status(400).json({ error: 'Guild ID required' });
            }

            const pm = getPlaylistManager();
            const result = await pm.queuePlaylist(id, guildId, {
                userId,
                shuffle: Boolean(shuffle),
                requester: { id: userId, username: 'Dashboard' }
            });

            if (webServer.updatePlayerState) {
                webServer.updatePlayerState(guildId);
            }

            res.json({
                success: true,
                message: `Added ${result.tracksQueued} tracks to queue`,
                tracksQueued: result.tracksQueued
            });
        } catch (error) {
            logger.error('PlaylistAPI', 'Error queuing playlist:', error);
            res.status(400).json({ error: error.message });
        }
    });

    // ==========================================
    // 4. COLLABORATIVE PLAYLIST ROUTES
    // ==========================================

    // Get collaborators for a playlist
    app.get('/api/v2/playlists/:id/collaborators', authenticate, async (req, res) => {
        try {
            const userId = getUserId(req);
            const { id } = req.params;

            const pm = getPlaylistManager();
            const collaborators = await pm.getCollaborators(id, userId);

            res.json({
                success: true,
                playlistId: id,
                collaborators
            });
        } catch (error) {
            logger.error('PlaylistAPI', 'Error getting collaborators:', error);
            res.status(500).json({ error: error.message });
        }
    });

    // Add collaborator to playlist
    app.post('/api/v2/playlists/:id/collaborators', authenticate, async (req, res) => {
        try {
            const userId = getUserId(req);
            if (!userId) {
                return res.status(401).json({ error: 'User ID required' });
            }

            const { id } = req.params;
            const { collaboratorId, role } = req.body;

            if (!collaboratorId) {
                return res.status(400).json({ error: 'Collaborator user ID required' });
            }

            const pm = getPlaylistManager();
            const collaborators = await pm.addCollaborator(id, userId, collaboratorId, role || 'editor');

            if (webServer.broadcastToUser) {
                // Notify the new collaborator
                webServer.broadcastToUser(collaboratorId, {
                    type: 'playlist:shared_with_you',
                    playlistId: id,
                    sharedBy: userId,
                    role: role || 'editor'
                });
            }

            res.json({
                success: true,
                message: 'Collaborator added',
                collaborators
            });
        } catch (error) {
            logger.error('PlaylistAPI', 'Error adding collaborator:', error);
            res.status(400).json({ error: error.message });
        }
    });

    // Remove collaborator from playlist
    app.delete('/api/v2/playlists/:id/collaborators/:collaboratorId', authenticate, async (req, res) => {
        try {
            const userId = getUserId(req);
            if (!userId) {
                return res.status(401).json({ error: 'User ID required' });
            }

            const { id, collaboratorId } = req.params;

            const pm = getPlaylistManager();
            const collaborators = await pm.removeCollaborator(id, userId, collaboratorId);

            if (webServer.broadcastToUser) {
                webServer.broadcastToUser(collaboratorId, {
                    type: 'playlist:access_revoked',
                    playlistId: id
                });
            }

            res.json({
                success: true,
                message: 'Collaborator removed',
                collaborators
            });
        } catch (error) {
            logger.error('PlaylistAPI', 'Error removing collaborator:', error);
            res.status(400).json({ error: error.message });
        }
    });

    // Toggle collaborative mode
    app.patch('/api/v2/playlists/:id/collaborative', authenticate, async (req, res) => {
        try {
            const userId = getUserId(req);
            if (!userId) {
                return res.status(401).json({ error: 'User ID required' });
            }

            const { id } = req.params;
            const { enabled } = req.body;

            const pm = getPlaylistManager();
            const playlist = await pm.toggleCollaborative(id, userId, Boolean(enabled));

            res.json({
                success: true,
                playlist,
                isCollaborative: playlist.is_collaborative
            });
        } catch (error) {
            logger.error('PlaylistAPI', 'Error toggling collaborative mode:', error);
            res.status(400).json({ error: error.message });
        }
    });

    logger.success('PlaylistAPI', 'Playlist v2 routes registered');
}
