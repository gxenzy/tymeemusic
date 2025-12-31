import express from 'express';
import { createServer } from 'http';
import { createServer as createHttpsServer } from 'https';
import { WebSocketServer } from 'ws';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { logger } from '#utils/logger';
import { config } from '#config/config';
import { db } from '#database/DatabaseManager';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export class WebServer {
  constructor(client) {
    this.client = client;
    this.app = express();
    this.clients = new Map(); // Map of guildId -> Set of WebSocket connections
    this.port = config.web.port;
    this.secure = config.web.secure;
    this.apiKey = config.web.apiKey;
    this.host = config.web.host;

    // Create server (HTTP or HTTPS)
    if (this.secure) {
      if (!config.web.sslCert || !config.web.sslKey) {
        logger.error('WebServer', 'SSL enabled but WEB_SSL_CERT or WEB_SSL_KEY not provided. Falling back to HTTP.');
        this.secure = false;
      } else {
        try {
          const sslOptions = {
            key: readFileSync(config.web.sslKey, 'utf8'),
            cert: readFileSync(config.web.sslCert, 'utf8'),
          };
          this.server = createHttpsServer(sslOptions, this.app);
          logger.success('WebServer', 'HTTPS server configured with SSL certificates');
        } catch (error) {
          logger.error('WebServer', 'Failed to load SSL certificates. Falling back to HTTP:', error);
          this.secure = false;
        }
      }
    }

    if (!this.secure) {
      this.server = createServer(this.app);
    }

    this.wss = new WebSocketServer({ server: this.server });

    this.setupMiddleware();
    this.setupRoutes();
    this.setupWebSocket();
  }

  setupMiddleware() {
    // CORS middleware
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key');
      if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
      }
      next();
    });

    // Body parser
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));

    // Static files
    this.app.use(express.static(join(__dirname, 'public')));
  }

  // Authentication middleware
  authenticate(req, res, next) {
    const apiKey = req.headers['x-api-key'] || req.query.apiKey;
    
    if (!apiKey || apiKey !== this.apiKey) {
      return res.status(401).json({ error: 'Unauthorized. Invalid or missing API key.' });
    }
    
    next();
  }

  setupRoutes() {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({ status: 'ok', timestamp: Date.now() });
    });

    // Get all active players (guilds with music playing) OR all guilds the bot is in
    this.app.get('/api/players', this.authenticate.bind(this), async (req, res) => {
      try {
        const players = [];
        const includeInactive = req.query.includeInactive === 'true';
        
        // Get all guilds the bot is in
        const allGuilds = [];
        for (const [guildId, guild] of this.client.guilds.cache) {
          allGuilds.push({
            guildId: guild.id,
            guildName: guild.name,
          });
        }
        
        // If no guilds, return empty
        if (allGuilds.length === 0) {
          return res.json({ players: [] });
        }
        
        // Get active players from lavalink
        const activePlayers = new Map();
        if (this.client.music?.lavalink) {
          for (const [guildId, player] of this.client.music.lavalink.players) {
            activePlayers.set(guildId, player);
          }
        }
        
        // Build player state for each guild
        for (const guildInfo of allGuilds) {
          const guildId = guildInfo.guildId;
          const player = activePlayers.get(guildId);
          
          if (player) {
            const { PlayerManager } = await import('#managers/PlayerManager');
            const pm = new PlayerManager(player);
            players.push(this.getPlayerState(pm, guildId, guildInfo.guildName));
          } else if (includeInactive) {
            // Include guilds without active players
            players.push({
              guildId,
              guildName: guildInfo.guildName,
              isPlaying: false,
              isPaused: false,
              isConnected: false,
              volume: 100,
              repeatMode: 'off',
              position: 0,
              currentTrack: null,
              queueSize: 0,
              voiceChannel: null,
            });
          }
        }
        
        res.json({ players });
      } catch (error) {
        logger.error('WebServer', 'Error getting players:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Get player state for a specific guild
    this.app.get('/api/player/:guildId', this.authenticate.bind(this), async (req, res) => {
      try {
        const { guildId } = req.params;
        const player = this.client.music?.getPlayer(guildId);
        
        if (!player) {
          return res.status(404).json({ error: 'No player found for this guild' });
        }
        
        const { PlayerManager } = await import('#managers/PlayerManager');
        const pm = new PlayerManager(player);
        res.json(this.getPlayerState(pm, guildId));
      } catch (error) {
        logger.error('WebServer', 'Error getting player state:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Control endpoints
    this.app.post('/api/player/:guildId/play', this.authenticate.bind(this), async (req, res) => {
      try {
        const { guildId } = req.params;
        const player = this.client.music?.getPlayer(guildId);
        
        if (!player) {
          return res.status(404).json({ error: 'No player found' });
        }
        
        const { PlayerManager } = await import('#managers/PlayerManager');
        const pm = new PlayerManager(player);
        await pm.resume();
        this.broadcastToGuild(guildId, { type: 'state_update', data: this.getPlayerState(pm, guildId) });
        res.json({ success: true, message: 'Playback resumed' });
      } catch (error) {
        logger.error('WebServer', 'Error resuming playback:', error);
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/player/:guildId/pause', this.authenticate.bind(this), async (req, res) => {
      try {
        const { guildId } = req.params;
        const player = this.client.music?.getPlayer(guildId);
        
        if (!player) {
          return res.status(404).json({ error: 'No player found' });
        }
        
        const { PlayerManager } = await import('#managers/PlayerManager');
        const pm = new PlayerManager(player);
        await pm.pause();
        this.broadcastToGuild(guildId, { type: 'state_update', data: this.getPlayerState(pm, guildId) });
        res.json({ success: true, message: 'Playback paused' });
      } catch (error) {
        logger.error('WebServer', 'Error pausing playback:', error);
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/player/:guildId/skip', this.authenticate.bind(this), async (req, res) => {
      try {
        const { guildId } = req.params;
        const player = this.client.music?.getPlayer(guildId);
        
        if (!player) {
          return res.status(404).json({ error: 'No player found' });
        }
        
        const { PlayerManager } = await import('#managers/PlayerManager');
        const pm = new PlayerManager(player);
        await pm.skip();
        this.broadcastToGuild(guildId, { type: 'state_update', data: this.getPlayerState(pm, guildId) });
        res.json({ success: true, message: 'Track skipped' });
      } catch (error) {
        logger.error('WebServer', 'Error skipping track:', error);
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/player/:guildId/previous', this.authenticate.bind(this), async (req, res) => {
      try {
        const { guildId } = req.params;
        const player = this.client.music?.getPlayer(guildId);
        
        if (!player) {
          return res.status(404).json({ error: 'No player found' });
        }
        
        const { PlayerManager } = await import('#managers/PlayerManager');
        const pm = new PlayerManager(player);
        await pm.playPrevious();
        this.broadcastToGuild(guildId, { type: 'state_update', data: this.getPlayerState(pm, guildId) });
        res.json({ success: true, message: 'Playing previous track' });
      } catch (error) {
        logger.error('WebServer', 'Error playing previous:', error);
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/player/:guildId/seek', this.authenticate.bind(this), async (req, res) => {
      try {
        const { guildId } = req.params;
        const { position } = req.body; // position in milliseconds
        
        if (typeof position !== 'number' || position < 0) {
          return res.status(400).json({ error: 'Invalid position. Must be a positive number (milliseconds)' });
        }
        
        const player = this.client.music?.getPlayer(guildId);
        if (!player) {
          return res.status(404).json({ error: 'No player found' });
        }
        
        const { PlayerManager } = await import('#managers/PlayerManager');
        const pm = new PlayerManager(player);
        await pm.seek(position);
        this.broadcastToGuild(guildId, { type: 'state_update', data: this.getPlayerState(pm, guildId) });
        res.json({ success: true, message: 'Seeked to position' });
      } catch (error) {
        logger.error('WebServer', 'Error seeking:', error);
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/player/:guildId/volume', this.authenticate.bind(this), async (req, res) => {
      try {
        const { guildId } = req.params;
        const { volume } = req.body; // volume 0-100
        
        if (typeof volume !== 'number' || volume < 0 || volume > 100) {
          return res.status(400).json({ error: 'Invalid volume. Must be between 0 and 100' });
        }
        
        const player = this.client.music?.getPlayer(guildId);
        if (!player) {
          return res.status(404).json({ error: 'No player found' });
        }
        
        const { PlayerManager } = await import('#managers/PlayerManager');
        const pm = new PlayerManager(player);
        await pm.setVolume(volume);
        this.broadcastToGuild(guildId, { type: 'state_update', data: this.getPlayerState(pm, guildId) });
        res.json({ success: true, message: `Volume set to ${volume}%` });
      } catch (error) {
        logger.error('WebServer', 'Error setting volume:', error);
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/player/:guildId/shuffle', this.authenticate.bind(this), async (req, res) => {
      try {
        const { guildId } = req.params;
        const player = this.client.music?.getPlayer(guildId);
        
        if (!player) {
          return res.status(404).json({ error: 'No player found' });
        }
        
        const { PlayerManager } = await import('#managers/PlayerManager');
        const pm = new PlayerManager(player);
        await pm.shuffleQueue();
        this.broadcastToGuild(guildId, { type: 'state_update', data: this.getPlayerState(pm, guildId) });
        res.json({ success: true, message: 'Queue shuffled' });
      } catch (error) {
        logger.error('WebServer', 'Error shuffling queue:', error);
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/player/:guildId/loop', this.authenticate.bind(this), async (req, res) => {
      try {
        const { guildId } = req.params;
        const { mode } = req.body; // 'off', 'track', 'queue'
        
        if (!['off', 'track', 'queue'].includes(mode)) {
          return res.status(400).json({ error: 'Invalid loop mode. Must be: off, track, or queue' });
        }
        
        const player = this.client.music?.getPlayer(guildId);
        if (!player) {
          return res.status(404).json({ error: 'No player found' });
        }
        
        const { PlayerManager } = await import('#managers/PlayerManager');
        const pm = new PlayerManager(player);
        await pm.setRepeatMode(mode);
        this.broadcastToGuild(guildId, { type: 'state_update', data: this.getPlayerState(pm, guildId) });
        res.json({ success: true, message: `Loop mode set to ${mode}` });
      } catch (error) {
        logger.error('WebServer', 'Error setting loop mode:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Queue management
    this.app.get('/api/player/:guildId/queue', this.authenticate.bind(this), async (req, res) => {
      try {
        const { guildId } = req.params;
        const player = this.client.music?.getPlayer(guildId);
        
        if (!player) {
          return res.status(404).json({ error: 'No player found' });
        }
        
        const { PlayerManager } = await import('#managers/PlayerManager');
        const pm = new PlayerManager(player);
        const queue = player.queue.tracks.map((track, index) => ({
          position: index + 1,
          title: track.info?.title || 'Unknown',
          author: track.info?.author || 'Unknown',
          duration: track.info?.duration || 0,
          uri: track.info?.uri,
          artworkUrl: track.info?.artworkUrl || track.pluginInfo?.artworkUrl,
          requester: track.requester?.id || null,
        }));
        
        res.json({ queue, current: pm.currentTrack ? {
          title: pm.currentTrack.info?.title || 'Unknown',
          author: pm.currentTrack.info?.author || 'Unknown',
          duration: pm.currentTrack.info?.duration || 0,
          position: pm.position,
          artworkUrl: pm.currentTrack.info?.artworkUrl || pm.currentTrack.pluginInfo?.artworkUrl,
        } : null });
      } catch (error) {
        logger.error('WebServer', 'Error getting queue:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Remove track from queue
    this.app.delete('/api/player/:guildId/queue/:position', this.authenticate.bind(this), async (req, res) => {
      try {
        const { guildId, position } = req.params;
        const pos = parseInt(position, 10);
        
        if (isNaN(pos) || pos < 1) {
          return res.status(400).json({ error: 'Invalid position' });
        }
        
        const player = this.client.music?.getPlayer(guildId);
        if (!player) {
          return res.status(404).json({ error: 'No player found' });
        }
        
        const { PlayerManager } = await import('#managers/PlayerManager');
        const pm = new PlayerManager(player);
        await pm.removeTrack(pos - 1);
        this.broadcastToGuild(guildId, { type: 'state_update', data: this.getPlayerState(pm, guildId) });
        res.json({ success: true, message: 'Track removed from queue' });
      } catch (error) {
        logger.error('WebServer', 'Error removing track:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // History endpoint - returns guild-level history
    this.app.get('/api/player/:guildId/history', this.authenticate.bind(this), async (req, res) => {
      try {
        const { guildId } = req.params;
        
        const history = db.guild.getHistory(guildId) || [];
        res.json({ history });
      } catch (error) {
        logger.error('WebServer', 'Error getting history:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Clear history endpoint
    this.app.delete('/api/player/:guildId/history', this.authenticate.bind(this), async (req, res) => {
      try {
        const { guildId } = req.params;
        db.guild.clearHistory(guildId);
        res.json({ success: true, message: 'History cleared' });
      } catch (error) {
        logger.error('WebServer', 'Error clearing history:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Bump track endpoint
    this.app.post('/api/player/:guildId/bump', this.authenticate.bind(this), async (req, res) => {
      try {
        const { guildId } = req.params;
        const { position } = req.body;
        
        const player = this.client.music?.getPlayer(guildId);
        if (!player) {
          return res.status(404).json({ error: 'No player found' });
        }
        
        const { PlayerManager } = await import('#managers/PlayerManager');
        const pm = new PlayerManager(player);
        
        const track = player.queue.tracks[position - 1];
        if (track) {
          player.queue.tracks.splice(position - 1, 1);
          player.queue.tracks.unshift(track);
          this.broadcastToGuild(guildId, { type: 'state_update', data: this.getPlayerState(pm, guildId) });
        }
        
        res.json({ success: true, message: 'Track bumped to front' });
      } catch (error) {
        logger.error('WebServer', 'Error bumping track:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Filter endpoint
    this.app.post('/api/player/:guildId/filter', this.authenticate.bind(this), async (req, res) => {
      try {
        const { guildId } = req.params;
        const { filters } = req.body;
        
        const player = this.client.music?.getPlayer(guildId);
        if (!player) {
          return res.status(404).json({ error: 'No player found' });
        }
        
        const { filters: filterConfig } = await import('#config/filters.js');
        const allFilters = {};
        
        if (filters && filters.length > 0) {
          for (const filter of filters) {
            if (filterConfig[filter]) {
              Object.assign(allFilters, filterConfig[filter]);
            }
          }
        }
        
        try {
          if (player.filters) {
            await player.filters.setFilters(allFilters);
          } else if (player.setFilters) {
            await player.setFilters(allFilters);
          } else if (player.equalizer) {
            for (let i = 0; i < 14; i++) {
              const band = allFilters.find(b => b.band === i);
              await player.equalizer.setBand(i, band ? band.gain : 0);
            }
          } else {
            return res.status(400).json({ error: 'Filter API not available on this player' });
          }
          
          res.json({ success: true, message: 'Filter applied' });
        } catch (filterError) {
          logger.error('WebServer', 'Filter application error:', filterError);
          res.status(500).json({ error: `Failed to apply filter: ${filterError.message}` });
        }
      } catch (error) {
        logger.error('WebServer', 'Error applying filter:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Get available filters
    this.app.get('/api/filters', this.authenticate.bind(this), async (req, res) => {
      try {
        const { filters: filterConfig } = await import('#config/filters.js');
        
        res.json({
          genres: filterConfig.getGenreFilters(),
          bass: filterConfig.getBassFilters(),
          vocal: filterConfig.getVocalFilters(),
          treble: filterConfig.getTrebleFilters(),
          special: filterConfig.getSpecialFilters(),
          all: filterConfig.getNames()
        });
      } catch (error) {
        logger.error('WebServer', 'Error getting filters:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Search endpoint
    this.app.get('/api/search', this.authenticate.bind(this), async (req, res) => {
      try {
        const { q } = req.query;
        if (!q) {
          return res.status(400).json({ error: 'Query required' });
        }
        
        const player = this.client.music?.getPlayer(this.client.guilds.cache.first()?.id);
        if (!player) {
          return res.json({ tracks: [] });
        }
        
        const results = await player.search(q, 'ytsearch');
        const tracks = results.tracks?.slice(0, 10).map((track, index) => ({
          title: track.info?.title || 'Unknown',
          author: track.info?.author || 'Unknown',
          duration: track.info?.duration || 0,
          uri: track.info?.uri,
          artworkUrl: track.info?.artworkUrl || track.pluginInfo?.artworkUrl,
          source: track.info?.sourceName || 'youtube'
        })) || [];
        
        res.json(tracks);
      } catch (error) {
        logger.error('WebServer', 'Error searching:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Playlists endpoints - get all playlists for dashboard
    this.app.get('/api/playlists', this.authenticate.bind(this), async (req, res) => {
      try {
        const guildId = req.query.guildId;
        let playlists;

        if (guildId) {
          // Get guild-specific playlists
          playlists = db.playlists.getGuildPlaylists(guildId);
        } else {
          // Get all playlists (for dashboard)
          playlists = db.playlists.getAllPlaylists();
        }

        res.json(playlists.map(p => ({
          id: p.id,
          name: p.name,
          description: p.description,
          trackCount: p.tracks?.length || p.track_count || 0,
          totalDuration: p.total_duration || 0,
          createdAt: p.created_at,
        })));
      } catch (error) {
        logger.error('WebServer', 'Error getting playlists:', error);
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/playlist/create', this.authenticate.bind(this), async (req, res) => {
      try {
        const { name, guildId, userId, description } = req.body;
        if (!name) {
          return res.status(400).json({ error: 'Name required' });
        }
        
        // Use userId if provided, otherwise use guildId or 'dashboard'
        const ownerId = userId || guildId || 'dashboard';
        db.playlists.createPlaylist(ownerId, name, description, guildId);
        res.json({ success: true, message: 'Playlist created' });
      } catch (error) {
        logger.error('WebServer', 'Error creating playlist:', error);
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/playlist/load', this.authenticate.bind(this), async (req, res) => {
      try {
        const { name, guildId } = req.body;
        if (!name) {
          return res.status(400).json({ error: 'Name required' });
        }
        
        const playlist = db.playlists.getPlaylistByName(name);
        if (!playlist) {
          return res.status(404).json({ error: 'Playlist not found' });
        }
        
        const player = this.client.music?.getPlayer(guildId);
        if (player && playlist.tracks) {
          for (const track of playlist.tracks) {
            await player.play(track.uri || track.info?.uri);
          }
        }
        
        res.json({ success: true, message: 'Playlist loaded' });
      } catch (error) {
        logger.error('WebServer', 'Error loading playlist:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Delete playlist endpoint
    this.app.delete('/api/playlist/:playlistId', this.authenticate.bind(this), async (req, res) => {
      try {
        const { playlistId } = req.params;
        const { userId } = req.query;
        
        if (!userId) {
          return res.status(400).json({ error: 'User ID required' });
        }
        
        const playlist = db.playlists.getPlaylist(playlistId);
        if (!playlist) {
          return res.status(404).json({ error: 'Playlist not found' });
        }
        
        if (playlist.user_id !== userId) {
          return res.status(403).json({ error: 'Access denied' });
        }
        
        db.playlists.deletePlaylist(playlistId, userId);
        res.json({ success: true, message: 'Playlist deleted' });
      } catch (error) {
        logger.error('WebServer', 'Error deleting playlist:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Update playlist endpoint
    this.app.put('/api/playlist/:playlistId', this.authenticate.bind(this), async (req, res) => {
      try {
        const { playlistId } = req.params;
        const { userId, name, description } = req.body;
        
        if (!userId) {
          return res.status(400).json({ error: 'User ID required' });
        }
        
        const updates = {};
        if (name) updates.name = name;
        if (description !== undefined) updates.description = description;
        
        const playlist = db.playlists.updatePlaylist(playlistId, userId, updates);
        res.json({ success: true, playlist });
      } catch (error) {
        logger.error('WebServer', 'Error updating playlist:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Guild settings endpoints
    this.app.get('/api/guild/:guildId/settings', this.authenticate.bind(this), async (req, res) => {
      try {
        const { guildId } = req.params;
        const guild = db.guild.getGuild(guildId);
        
        if (!guild) {
          return res.status(404).json({ error: 'Guild not found' });
        }
        
        res.json({
          prefixes: JSON.parse(guild.prefixes || '["!"]'),
          default_volume: guild.default_volume || 100,
          stay_247: guild.stay_247 === 1,
          auto_disconnect: guild.auto_disconnect !== 0
        });
      } catch (error) {
        logger.error('WebServer', 'Error getting guild settings:', error);
        res.status(500).json({ error: error.message });
      }
    });

    this.app.put('/api/guild/:guildId/settings', this.authenticate.bind(this), async (req, res) => {
      try {
        const { guildId } = req.params;
        const { prefix, default_volume, stay_247, auto_disconnect } = req.body;
        
        if (prefix) {
          db.guild.setPrefixes(guildId, [prefix]);
        }
        
        if (default_volume !== undefined) {
          db.guild.setDefaultVolume(guildId, default_volume);
        }
        
        if (stay_247 !== undefined) {
          const currentSettings = db.guild.get247Settings(guildId);
          db.guild.set247Mode(guildId, stay_247, currentSettings.voiceChannel, currentSettings.textChannel);
        }
        
        if (auto_disconnect !== undefined) {
          db.guild.setAutoDisconnect(guildId, auto_disconnect);
        }
        
        res.json({ success: true, message: 'Settings updated' });
      } catch (error) {
        logger.error('WebServer', 'Error updating guild settings:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Emoji sync endpoint
    this.app.post('/api/emoji/sync', this.authenticate.bind(this), async (req, res) => {
      try {
        const { guildId } = req.body;
        if (!guildId) {
          return res.status(400).json({ error: 'Guild ID required' });
        }
        
        const guild = this.client.guilds.cache.get(guildId);
        if (!guild) {
          return res.status(404).json({ error: 'Guild not found' });
        }
        
        const { emojiService } = await import('#services/EmojiService');
        const synced = emojiService.syncEmojis(guildId, guild);
        
        res.json({ success: true, message: `Synced ${synced} emojis` });
      } catch (error) {
        logger.error('WebServer', 'Error syncing emojis:', error);
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/api/emoji', this.authenticate.bind(this), async (req, res) => {
      try {
        const { guildId } = req.query;
        const emojis = {};
        
        if (guildId) {
          const dbEmojis = db.emoji.getAllEmojis(guildId);
          for (const row of dbEmojis) {
            emojis[row.emoji_key] = `<:${row.emoji_name}:${row.emoji_id}>`;
          }
        }
        
        res.json(emojis);
      } catch (error) {
        logger.error('WebServer', 'Error getting emojis:', error);
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/emoji/add', this.authenticate.bind(this), async (req, res) => {
      try {
        const { guildId, key, emoji } = req.body;
        
        if (!guildId || !key || !emoji) {
          return res.status(400).json({ error: 'Missing required fields' });
        }
        
        const parsed = this.parseEmoji(emoji);
        if (!parsed) {
          return res.status(400).json({ error: 'Invalid emoji format' });
        }
        
        db.emoji.setEmoji(guildId, key, parsed.id, parsed.name);
        res.json({ success: true, message: 'Emoji added' });
      } catch (error) {
        logger.error('WebServer', 'Error adding emoji:', error);
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/emoji/remove', this.authenticate.bind(this), async (req, res) => {
      try {
        const { guildId, key } = req.body;
        
        if (!guildId || !key) {
          return res.status(400).json({ error: 'Missing required fields' });
        }
        
        db.emoji.removeEmoji(guildId, key);
        res.json({ success: true, message: 'Emoji removed' });
      } catch (error) {
        logger.error('WebServer', 'Error removing emoji:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Serve dashboard with auto-connect support
    this.app.get('/', (req, res) => {
      res.sendFile(join(__dirname, 'public', 'index.html'));
    });
    
    // Auto-connect route (for Discord button links)
    this.app.get('/connect', (req, res) => {
      res.sendFile(join(__dirname, 'public', 'index.html'));
    });
  }

  parseEmoji(emojiStr) {
    if (!emojiStr) return null;
    const match = emojiStr.match(/^<a?:(.+):(\d+)>$/);
    if (match) {
      return { name: match[1], id: match[2], animated: emojiStr.startsWith("<a:") };
    }
    return null;
  }

  getPlayerState(pm, guildId, guildName = null) {
    const currentTrack = pm?.currentTrack;
    const guild = this.client.guilds.cache.get(guildId);
    
    // Get voice channel info if player exists
    let voiceChannel = null;
    if (pm?.voiceChannelId) {
      voiceChannel = {
        id: pm.voiceChannelId,
        name: guild?.channels.cache.get(pm.voiceChannelId)?.name || 'Unknown',
      };
    }
    
    return {
      guildId,
      guildName: guildName || guild?.name || 'Unknown Guild',
      isPlaying: pm?.isPlaying || false,
      isPaused: pm?.isPaused || false,
      isConnected: pm?.isConnected || false,
      volume: pm?.volume || 100,
      repeatMode: pm?.repeatMode || 'off',
      position: pm?.position || 0,
      currentTrack: currentTrack ? {
        title: currentTrack.info?.title || 'Unknown',
        author: currentTrack.info?.author || 'Unknown',
        duration: currentTrack.info?.duration || 0,
        uri: currentTrack.info?.uri,
        artworkUrl: currentTrack.info?.artworkUrl || currentTrack.pluginInfo?.artworkUrl,
        isStream: currentTrack.info?.isStream || false,
        isSeekable: currentTrack.info?.isSeekable !== false && !currentTrack.info?.isStream,
      } : null,
      queueSize: pm?.queueSize || 0,
      voiceChannel,
    };
  }

  setupWebSocket() {
    this.wss.on('connection', (ws, req) => {
      const url = new URL(req.url, `http://${req.headers.host}`);
      const guildId = url.searchParams.get('guildId');
      const apiKey = url.searchParams.get('apiKey');
      
      if (!guildId || !apiKey || apiKey !== this.apiKey) {
        ws.close(1008, 'Invalid or missing parameters');
        return;
      }
      
      // Add to clients map
      if (!this.clients.has(guildId)) {
        this.clients.set(guildId, new Set());
      }
      this.clients.get(guildId).add(ws);
      
      // Send initial state
      (async () => {
        try {
          const player = this.client.music?.getPlayer(guildId);
          if (player) {
            const { PlayerManager } = await import('#managers/PlayerManager');
            const pm = new PlayerManager(player);
            ws.send(JSON.stringify({
              type: 'state_update',
              data: this.getPlayerState(pm, guildId),
            }));
          }
        } catch (error) {
          logger.error('WebServer', 'Error sending initial state:', error);
        }
      })();
      
      ws.on('close', () => {
        const guildClients = this.clients.get(guildId);
        if (guildClients) {
          guildClients.delete(ws);
          if (guildClients.size === 0) {
            this.clients.delete(guildId);
          }
        }
      });
      
      ws.on('error', (error) => {
        logger.error('WebServer', 'WebSocket error:', error);
      });
    });
  }

  broadcastToGuild(guildId, message) {
    const guildClients = this.clients.get(guildId);
    if (guildClients) {
      const data = JSON.stringify(message);
      guildClients.forEach(ws => {
        if (ws.readyState === 1) { // WebSocket.OPEN
          ws.send(data);
        }
      });
    }
  }

  // Method to be called when player state changes
  async updatePlayerState(guildId) {
    try {
      const player = this.client.music?.getPlayer(guildId);
      if (player) {
        const { PlayerManager } = await import('#managers/PlayerManager');
        const pm = new PlayerManager(player);
        this.broadcastToGuild(guildId, {
          type: 'state_update',
          data: this.getPlayerState(pm, guildId),
        });
      }
    } catch (error) {
      logger.error('WebServer', 'Error updating player state:', error);
    }
  }

  start() {
    this.server.listen(this.port, () => {
      const protocol = this.secure ? 'https' : 'http';
      logger.success('WebServer', `🌐 Web dashboard running on ${protocol}://${this.host}:${this.port}`);
      logger.info('WebServer', `📝 API Key: ${this.apiKey} (set WEB_API_KEY in .env to change)`);
      if (this.secure) {
        logger.info('WebServer', `🔒 HTTPS enabled with SSL certificates`);
      }
    });
  }

  stop() {
    return new Promise((resolve) => {
      this.wss.close(() => {
        this.server.close(() => {
          logger.info('WebServer', 'Web server stopped');
          resolve();
        });
      });
    });
  }
}

