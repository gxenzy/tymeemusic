import express from 'express';
import { createServer } from 'http';
import { createServer as createHttpsServer } from 'https';
import { WebSocketServer } from 'ws';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { logger } from '#utils/logger';
import { config } from '#config/config';

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

    // Get all active players (guilds with music playing)
    this.app.get('/api/players', this.authenticate.bind(this), async (req, res) => {
      try {
        const players = [];
        const { PlayerManager } = await import('#managers/PlayerManager');
        
        if (this.client.music?.lavalink) {
          const allPlayers = this.client.music.lavalink.players;
          
          for (const [guildId, player] of allPlayers) {
            const pm = new PlayerManager(player);
            players.push(this.getPlayerState(pm, guildId));
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

    // Serve dashboard with auto-connect support
    this.app.get('/', (req, res) => {
      res.sendFile(join(__dirname, 'public', 'index.html'));
    });
    
    // Auto-connect route (for Discord button links)
    this.app.get('/connect', (req, res) => {
      res.sendFile(join(__dirname, 'public', 'index.html'));
    });
  }

  getPlayerState(pm, guildId) {
    const currentTrack = pm.currentTrack;
    const guild = this.client.guilds.cache.get(guildId);
    
    return {
      guildId,
      guildName: guild?.name || 'Unknown Guild',
      isPlaying: pm.isPlaying,
      isPaused: pm.isPaused,
      isConnected: pm.isConnected,
      volume: pm.volume,
      repeatMode: pm.repeatMode,
      position: pm.position,
      currentTrack: currentTrack ? {
        title: currentTrack.info?.title || 'Unknown',
        author: currentTrack.info?.author || 'Unknown',
        duration: currentTrack.info?.duration || 0,
        uri: currentTrack.info?.uri,
        artworkUrl: currentTrack.info?.artworkUrl || currentTrack.pluginInfo?.artworkUrl,
        isStream: currentTrack.info?.isStream || false,
        isSeekable: currentTrack.info?.isSeekable !== false && !currentTrack.info?.isStream,
      } : null,
      queueSize: pm.queueSize,
      voiceChannel: pm.voiceChannelId ? {
        id: pm.voiceChannelId,
        name: guild?.channels.cache.get(pm.voiceChannelId)?.name || 'Unknown',
      } : null,
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

