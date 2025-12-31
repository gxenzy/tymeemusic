import express from 'express';
import { createServer } from 'http';
import { createServer as createHttpsServer } from 'https';
import { WebSocketServer } from 'ws';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import passport from 'passport';
import { Strategy } from 'passport-discord';
import session from 'express-session';
import crypto from 'crypto';
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

    // Simple token-based auth storage (persisted to file)
    this.authTokensFile = join(__dirname, '..', '..', 'data', 'auth_tokens.json');
    this.authTokens = new Map();
    this.oauthAttempts = new Map();
    
    // Load persisted auth tokens
    this.loadAuthTokens();

    // Session for Passport (required)
    this.app.use(session({
      secret: process.env.SESSION_SECRET || 'default-secret-change-this',
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: false,
        maxAge: 7 * 24 * 60 * 60 * 1000,
        sameSite: 'lax'
      }
    }));

    this.setupPassport();
    this.setupMiddleware();
    this.setupRoutes();
    this.setupWebSocket();
  }

  // Rate limiter for OAuth
  isRateLimited(ip) {
    const now = Date.now();
    const window = 60 * 1000; // 1 minute
    const maxAttempts = 5;
    
    const attempts = this.oauthAttempts.get(ip) || [];
    const recentAttempts = attempts.filter(t => now - t < window);
    
    if (recentAttempts.length >= maxAttempts) {
      return true;
    }
    
    recentAttempts.push(now);
    this.oauthAttempts.set(ip, recentAttempts);
    return false;
  }

  loadAuthTokens() {
    try {
      // Clear all tokens on startup - require fresh login
      // Uncomment below lines if you want to persist tokens across restarts
      /*
      if (existsSync(this.authTokensFile)) {
        const data = JSON.parse(readFileSync(this.authTokensFile, 'utf8'));
        const now = Date.now();
        // Filter out expired tokens
        for (const [token, entry] of Object.entries(data)) {
          if (entry.expires > now) {
            this.authTokens.set(token, entry);
          }
        }
        console.log(`=== LOADED AUTH TOKENS === ${this.authTokens.size} valid tokens`);
      }
      */
      console.log('=== AUTH TOKENS CLEARED ON STARTUP ===');
    } catch (error) {
      console.error('Failed to load auth tokens:', error);
    }
  }

  saveAuthTokens() {
    try {
      // Convert Map to object for JSON serialization
      const data = {};
      this.authTokens.forEach((value, key) => {
        data[key] = value;
      });
      writeFileSync(this.authTokensFile, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('Failed to save auth tokens:', error);
    }
  }

  generateToken(user) {
    const token = crypto.randomBytes(32).toString('hex');
    const entry = {
      user,
      expires: Date.now() + (7 * 24 * 60 * 60 * 1000)
    };
    this.authTokens.set(token, entry);
    this.saveAuthTokens(); // Persist to file
    console.log('=== GENERATE TOKEN ===');
    console.log('Token:', token.substring(0, 16) + '...');
    console.log('User ID:', user.id);
    console.log('Total tokens:', this.authTokens.size);
    return token;
  }

  validateToken(token) {
    console.log('=== VALIDATE TOKEN ===');
    console.log('Looking for token:', token?.substring(0, 16) + '...');
    console.log('Total stored tokens:', this.authTokens.size);
    
    if (!token) {
      console.log('No token provided');
      return null;
    }
    
    const data = this.authTokens.get(token);
    console.log('Token found in storage:', !!data);
    
    if (!data) {
      console.log('Token not found in storage');
      return null;
    }
    
    if (Date.now() > data.expires) {
      console.log('Token expired');
      this.authTokens.delete(token);
      this.saveAuthTokens();
      return null;
    }
    
    console.log('Valid user found:', data.user?.id);
    return data.user;
  }

  // Helper function to extract userId from request
  getUserIdFromRequest(req) {
    // Parse cookies
    const cookies = {};
    const cookieHeader = req.headers.cookie;
    if (cookieHeader) {
      cookieHeader.split(';').forEach(cookie => {
        const parts = cookie.trim().split('=');
        if (parts.length === 2) {
          cookies[parts[0]] = decodeURIComponent(parts[1]);
        }
      });
    }
    
    // Try auth token first
    const token = cookies.auth_token;
    if (token) {
      const data = this.authTokens.get(token);
      if (data?.user?.id) return String(data.user.id);
    }
    
    // Try session
    if (req.session?.passport?.user?.id) {
      return String(req.session.passport.user.id);
    }
    
    // Try query/body params
    if (req.query.localUserId) return String(req.query.localUserId);
    if (req.query.userId) return String(req.query.userId);
    if (req.body?.localUserId) return String(req.body.localUserId);
    if (req.body?.userId) return String(req.body.userId);
    
    return null;
  }

  setupPassport() {
    const clientID = process.env.DISCORD_CLIENT_ID;
    const clientSecret = process.env.DISCORD_CLIENT_SECRET;
    const callbackURL = `${process.env.DASHBOARD_URL || `http://localhost:${this.port}`}/auth/discord/callback`;

    if (!clientID || !clientSecret) {
      logger.warn('WebServer', 'Discord OAuth2 credentials not configured. Dashboard login will be disabled.');
      return;
    }

    passport.serializeUser((user, done) => {
      done(null, {
        id: user.id,
        username: user.username,
        discriminator: user.discriminator,
        avatar: user.avatar,
        accessToken: user.accessToken,
        refreshToken: user.refreshToken
      });
    });

    passport.deserializeUser(async (serialized, done) => {
      try {
        done(null, serialized);
      } catch (error) {
        done(error, null);
      }
    });

    passport.use(new Strategy({
      clientID,
      clientSecret,
      callbackURL,
      scope: ['identify', 'guilds'],
      prompt: 'none',
      state: false  // Disable state verification since we use our own token auth
    }, (accessToken, refreshToken, profile, done) => {
      console.log('Passport Strategy called!');
      console.log('Profile:', profile?.id);
      profile.accessToken = accessToken;
      profile.refreshToken = refreshToken;
      return done(null, profile);
    }));

    this.app.use(passport.initialize());
    this.app.use(passport.session());

    this.app.get('/auth/discord', (req, res, next) => {
      console.log('=== OAUTH START ===');
      console.log('Current URL:', req.originalUrl);
      console.log('Session ID:', req.sessionID);
      console.log('User authenticated:', req.isAuthenticated());
      
      const ip = req.ip || req.connection.remoteAddress;
      
      if (this.isRateLimited(ip)) {
        console.log('OAuth rate limited for IP:', ip);
        return res.redirect('/dashboard?error=rate_limited');
      }
      
      next();
    }, passport.authenticate('discord'));
    console.log('OAuth route /auth/discord registered');

    this.app.get('/auth/discord/callback',
      (req, res, next) => {
        console.log('=== OAUTH CALLBACK ===');
        console.log('Query:', req.query);
        
        const ip = req.ip || req.connection.remoteAddress;
        
        if (this.isRateLimited(ip)) {
          console.log('OAuth callback rate limited for IP:', ip);
          return res.redirect('/dashboard?error=rate_limited');
        }
        
        next();
      },
      passport.authenticate('discord', { failureRedirect: '/?error=auth_failed' }),
      (req, res) => {
        console.log('OAuth callback - User:', req.user?.id);
        
        // Generate auth token
        const token = this.generateToken(req.user);
        console.log('Generated token:', token.substring(0, 10) + '...');
        
        // Set cookie
        res.setHeader('Set-Cookie', `auth_token=${token}; Path=/; Max-Age=604800; SameSite=Lax`);
        console.log('Cookie set!');
        
        res.redirect('/dashboard');
      }
    );

    this.app.get('/auth/logout', (req, res) => {
      // Parse cookies
      const cookies = {};
      const cookieHeader = req.headers.cookie;
      if (cookieHeader) {
        cookieHeader.split(';').forEach(cookie => {
          const parts = cookie.trim().split('=');
          if (parts.length === 2) {
            cookies[parts[0]] = decodeURIComponent(parts[1]);
          }
        });
      }
      
      const token = cookies.auth_token;
      if (token) {
        this.authTokens.delete(token);
        this.saveAuthTokens();
      }
      
      res.setHeader('Set-Cookie', 'auth_token=; Path=/; Max-Age=0');
      res.redirect('/');
    });

    this.app.get('/auth/user', (req, res) => {
      // Parse cookies manually
      const cookies = {};
      const cookieHeader = req.headers.cookie;
      if (cookieHeader) {
        cookieHeader.split(';').forEach(cookie => {
          const parts = cookie.trim().split('=');
          if (parts.length === 2) {
            cookies[parts[0]] = decodeURIComponent(parts[1]);
          }
        });
      }
      
      const token = cookies.auth_token;
      if (!token) {
        return res.status(401).json({ error: 'Not authenticated' });
      }
      
      const user = this.validateToken(token);
      if (!user) {
        return res.status(401).json({ error: 'Token expired' });
      }
      
      res.json(user);
    });

    this.app.get('/auth/check', (req, res) => {
      // Parse cookies manually
      const cookies = {};
      const cookieHeader = req.headers.cookie;
      console.log('=== AUTH CHECK ===');
      console.log('Cookie header:', cookieHeader);
      
      if (cookieHeader) {
        cookieHeader.split(';').forEach(cookie => {
          const parts = cookie.trim().split('=');
          if (parts.length === 2) {
            cookies[parts[0]] = decodeURIComponent(parts[1]);
          }
        });
      }
      
      const token = cookies.auth_token;
      console.log('Token from cookies:', token?.substring(0, 16) + '...');
      
      if (!token) {
        return res.json({ authenticated: false });
      }
      
      const user = this.validateToken(token);
      console.log('Final user:', user?.id);
      
      if (!user) {
        return res.json({ authenticated: false });
      }
      
      res.json({ authenticated: true, user });
    });

    this.app.get('/api/user/guilds', (req, res) => {
      const cookies = {};
      const cookieHeader = req.headers.cookie;
      console.log('=== API USER GUILDS ===');
      console.log('Cookie header:', cookieHeader);
      
      if (cookieHeader) {
        cookieHeader.split(';').forEach(cookie => {
          const parts = cookie.trim().split('=');
          if (parts.length === 2) {
            cookies[parts[0]] = decodeURIComponent(parts[1]);
          }
        });
      }
      
      const token = cookies.auth_token;
      if (!token) {
        return res.status(401).json({ error: 'Not authenticated' });
      }
      
      const data = this.authTokens.get(token);
      if (!data || Date.now() > data.expires) {
        return res.status(401).json({ error: 'Token expired or invalid' });
      }
      
      const { accessToken } = data.user;
      if (!accessToken) {
        return res.status(500).json({ error: 'No access token available' });
      }
      
      // Fetch user's guilds from Discord API
      fetch('https://discord.com/api/users/@me/guilds', {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      })
      .then(response => {
        if (!response.ok) {
          throw new Error('Failed to fetch guilds');
        }
        return response.json();
      })
      .then(guilds => {
        // Filter to only guilds where:
        // 1. The bot is in the guild
        // 2. User has MANAGE_SERVER permission
        const botGuildIds = new Set(this.client.guilds.cache.map(g => g.id));
        
        const managedGuilds = guilds.filter(guild => {
          const hasBot = botGuildIds.has(guild.id);
          const permissions = BigInt(guild.permissions);
          const canManage = (permissions & BigInt(0x8)) === BigInt(0x8); // MANAGE_SERVER = 0x8
          return hasBot && canManage;
        });
        
        console.log(`Found ${managedGuilds.length} managed guilds out of ${guilds.length} total`);
        res.json(managedGuilds);
      })
      .catch(error => {
        console.error('Error fetching guilds:', error);
        res.status(500).json({ error: error.message });
      });
    });

    logger.success('WebServer', 'Discord OAuth2 configured');
  }

  setupMiddleware() {
    // CORS middleware
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', 'http://localhost:3000');
      res.header('Access-Control-Allow-Credentials', 'true');
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

    // Cookie parser
    this.app.use((req, res, next) => {
      req.cookies = {};
      const cookieHeader = req.headers.cookie;
      if (cookieHeader) {
        cookieHeader.split(';').forEach(cookie => {
          const parts = cookie.trim().split('=');
          if (parts.length === 2) {
            const [name, value] = parts;
            req.cookies[name] = decodeURIComponent(value);
          }
        });
      }
      next();
    });

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

    // Skip track
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
        
        const newPm = new PlayerManager(player);
        this.broadcastToGuild(guildId, { type: 'state_update', data: this.getPlayerState(newPm, guildId) });
        res.json({ success: true, message: 'Skipped to next track' });
      } catch (error) {
        logger.error('WebServer', 'Error skipping track:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Previous track
    this.app.post('/api/player/:guildId/previous', this.authenticate.bind(this), async (req, res) => {
      try {
        const { guildId } = req.params;
        const player = this.client.music?.getPlayer(guildId);
        
        if (!player) {
          return res.status(404).json({ error: 'No player found' });
        }
        
        const previousTrack = await player.queue.shiftPrevious();
        if (!previousTrack) {
          return res.status(400).json({ error: 'No previous track in history' });
        }
        
        await player.play({ clientTrack: previousTrack });
        
        const { PlayerManager } = await import('#managers/PlayerManager');
        const newPm = new PlayerManager(player);
        this.broadcastToGuild(guildId, { type: 'state_update', data: this.getPlayerState(newPm, guildId) });
        res.json({ success: true, message: 'Played previous track' });
      } catch (error) {
        logger.error('WebServer', 'Error playing previous:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Shuffle player queue
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
        
        const newPm = new PlayerManager(player);
        this.broadcastToGuild(guildId, { type: 'state_update', data: this.getPlayerState(newPm, guildId) });
        res.json({ success: true, message: 'Queue shuffled' });
      } catch (error) {
        logger.error('WebServer', 'Error shuffling:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Toggle loop
    this.app.post('/api/player/:guildId/loop', this.authenticate.bind(this), async (req, res) => {
      try {
        const { guildId } = req.params;
        let { mode } = req.body;
        const player = this.client.music?.getPlayer(guildId);
        
        if (!player) {
          return res.status(404).json({ error: 'No player found' });
        }
        
        const { PlayerManager } = await import('#managers/PlayerManager');
        const pm = new PlayerManager(player);
        
        const validModes = ['off', 'track', 'queue'];
        
        if (!mode || !validModes.includes(mode)) {
          const currentIndex = validModes.indexOf(pm.repeatMode || 'off');
          mode = validModes[(currentIndex + 1) % validModes.length];
        }
        
        await player.setRepeatMode(mode);
        
        const newPm = new PlayerManager(player);
        this.broadcastToGuild(guildId, { type: 'state_update', data: this.getPlayerState(newPm, guildId) });
        res.json({ success: true, message: 'Loop mode updated', repeatMode: mode });
      } catch (error) {
        logger.error('WebServer', 'Error toggling loop:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Set volume
    this.app.post('/api/player/:guildId/volume', this.authenticate.bind(this), async (req, res) => {
      try {
        const { guildId } = req.params;
        const { volume } = req.body;
        const player = this.client.music?.getPlayer(guildId);
        
        if (!player) {
          return res.status(404).json({ error: 'No player found' });
        }
        
        const { PlayerManager } = await import('#managers/PlayerManager');
        const pm = new PlayerManager(player);
        await pm.setVolume(volume);
        this.broadcastToGuild(guildId, { type: 'state_update', data: this.getPlayerState(pm, guildId) });
        res.json({ success: true, message: 'Volume set' });
      } catch (error) {
        logger.error('WebServer', 'Error setting volume:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Seek
    this.app.post('/api/player/:guildId/seek', this.authenticate.bind(this), async (req, res) => {
      try {
        const { guildId } = req.params;
        const { position } = req.body;
        const player = this.client.music?.getPlayer(guildId);
        
        if (!player) {
          return res.status(404).json({ error: 'No player found' });
        }
        
        await player.seek(position);
        
        const { PlayerManager } = await import('#managers/PlayerManager');
        const pm = new PlayerManager(player);
        this.broadcastToGuild(guildId, { type: 'state_update', data: this.getPlayerState(pm, guildId) });
        res.json({ success: true, message: 'Seeked to position' });
      } catch (error) {
        logger.error('WebServer', 'Error seeking:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Stop
    this.app.post('/api/player/:guildId/stop', this.authenticate.bind(this), async (req, res) => {
      try {
        const { guildId } = req.params;
        const player = this.client.music?.getPlayer(guildId);
        
        if (!player) {
          return res.status(404).json({ error: 'No player found' });
        }
        
        const { PlayerManager } = await import('#managers/PlayerManager');
        const pm = new PlayerManager(player);
        await pm.stop();
        this.broadcastToGuild(guildId, { type: 'state_update', data: this.getPlayerState(pm, guildId) });
        res.json({ success: true, message: 'Playback stopped' });
      } catch (error) {
        logger.error('WebServer', 'Error stopping:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Get queue
    this.app.get('/api/player/:guildId/queue', this.authenticate.bind(this), async (req, res) => {
      try {
        const { guildId } = req.params;
        const player = this.client.music?.getPlayer(guildId);
        
        if (!player) {
          return res.json({ queue: [] });
        }
        
        const queue = player.queue.tracks.map((track, index) => ({
          title: track.info?.title || 'Unknown',
          author: track.info?.author || 'Unknown',
          duration: track.info?.duration || 0,
          artworkUrl: track.info?.artworkUrl || track.pluginInfo?.artworkUrl,
          uri: track.info?.uri,
        }));
        
        res.json({ queue });
      } catch (error) {
        logger.error('WebServer', 'Error getting queue:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Add track to queue
    this.app.post('/api/player/:guildId/queue', this.authenticate.bind(this), async (req, res) => {
      try {
        const { guildId } = req.params;
        const player = this.client.music?.getPlayer(guildId);
        
        if (!player) {
          return res.status(404).json({ error: 'No player found' });
        }
        
        const track = req.body;
        
        player.queue.add(track);
        
        const queue = player.queue.tracks.map((t, index) => ({
          title: t.info?.title || 'Unknown',
          author: t.info?.author || 'Unknown',
          duration: t.info?.duration || 0,
          artworkUrl: t.info?.artworkUrl || t.pluginInfo?.artworkUrl,
          uri: t.info?.uri,
        }));
        
        this.broadcastToGuild(guildId, { type: 'queue_update', queue });
        res.json({ success: true, queue });
      } catch (error) {
        logger.error('WebServer', 'Error adding track to queue:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Shuffle queue
    this.app.post('/api/queue/:guildId/shuffle', this.authenticate.bind(this), async (req, res) => {
      try {
        const { guildId } = req.params;
        const player = this.client.music?.getPlayer(guildId);
        
        if (!player) {
          return res.status(404).json({ error: 'No player found' });
        }
        
        const { PlayerManager } = await import('#managers/PlayerManager');
        const pm = new PlayerManager(player);
        await pm.shuffleQueue();
        
        const queue = player.queue.tracks.map((track, index) => ({
          title: track.info?.title || 'Unknown',
          author: track.info?.author || 'Unknown',
          duration: track.info?.duration || 0,
          artworkUrl: track.info?.artworkUrl || track.pluginInfo?.artworkUrl,
          uri: track.info?.uri,
        }));
        
        this.broadcastToGuild(guildId, { type: 'state_update', data: this.getPlayerState(pm, guildId) });
        this.broadcastToGuild(guildId, { type: 'queue_update', queue });
        res.json({ success: true, message: 'Queue shuffled' });
      } catch (error) {
        logger.error('WebServer', 'Error shuffling queue:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Clear queue
    this.app.delete('/api/queue/:guildId', this.authenticate.bind(this), async (req, res) => {
      try {
        const { guildId } = req.params;
        const player = this.client.music?.getPlayer(guildId);
        
        if (!player) {
          return res.status(404).json({ error: 'No player found' });
        }
        
        const { PlayerManager } = await import('#managers/PlayerManager');
        const pm = new PlayerManager(player);
        
        await pm.clearQueue();
        
        this.broadcastToGuild(guildId, { type: 'state_update', data: this.getPlayerState(pm, guildId) });
        this.broadcastToGuild(guildId, { type: 'queue_update', queue: [] });
        res.json({ success: true, message: 'Queue cleared' });
      } catch (error) {
        logger.error('WebServer', 'Error clearing queue:', error);
        res.status(500).json({ error: error.message });
      }
    });

    this.app.delete('/api/queue/:guildId/:position', this.authenticate.bind(this), async (req, res) => {
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
        
        const queue = player.queue.tracks.map((track, index) => ({
          title: track.info?.title || 'Unknown',
          author: track.info?.author || 'Unknown',
          duration: track.info?.duration || 0,
          artworkUrl: track.info?.artworkUrl || track.pluginInfo?.artworkUrl,
          uri: track.info?.uri,
        }));
        
        this.broadcastToGuild(guildId, { type: 'state_update', data: this.getPlayerState(pm, guildId) });
        this.broadcastToGuild(guildId, { type: 'queue_update', queue });
        res.json({ success: true, message: 'Track removed' });
      } catch (error) {
        logger.error('WebServer', 'Error removing track:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // ============ EMOJI MANAGEMENT ENDPOINTS ============

    // Get all emoji mappings for a guild
    this.app.get('/api/emojis/:guildId', this.authenticate.bind(this), async (req, res) => {
      try {
        const { guildId } = req.params;
        const EmojiManager = (await import('#managers/EmojiManager')).default;
        if (!this.emojiManager) {
          this.emojiManager = new EmojiManager(this.client);
        }
        const mappings = await this.emojiManager.getAllEmojis(guildId);
        res.json(mappings);
      } catch (error) {
        logger.error('WebServer', 'Error getting emoji mappings:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Get emoji categories
    this.app.get('/api/emojis/categories', this.authenticate.bind(this), async (req, res) => {
      try {
        const EmojiManager = (await import('#managers/EmojiManager')).default;
        if (!this.emojiManager) {
          this.emojiManager = new EmojiManager(this.client);
        }
        const categories = this.emojiManager.getCategories();
        res.json(categories);
      } catch (error) {
        logger.error('WebServer', 'Error getting emoji categories:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Get server emojis (all emojis in the guild)
    this.app.get('/api/emojis/:guildId/server', this.authenticate.bind(this), async (req, res) => {
      try {
        const { guildId } = req.params;
        const EmojiManager = (await import('#managers/EmojiManager')).default;
        if (!this.emojiManager) {
          this.emojiManager = new EmojiManager(this.client);
        }
        const serverEmojis = await this.emojiManager.getServerEmojis(guildId);
        res.json(serverEmojis);
      } catch (error) {
        logger.error('WebServer', 'Error getting server emojis:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Get auto-sync preview
    this.app.get('/api/emojis/:guildId/sync/preview', this.authenticate.bind(this), async (req, res) => {
      try {
        const { guildId } = req.params;
        const EmojiManager = (await import('#managers/EmojiManager')).default;
        if (!this.emojiManager) {
          this.emojiManager = new EmojiManager(this.client);
        }
        const preview = await this.emojiManager.getAutoSyncPreview(guildId);
        res.json(preview);
      } catch (error) {
        logger.error('WebServer', 'Error getting sync preview:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Auto-sync emojis
    this.app.post('/api/emojis/:guildId/sync', this.authenticate.bind(this), async (req, res) => {
      try {
        const { guildId } = req.params;
        const EmojiManager = (await import('#managers/EmojiManager')).default;
        if (!this.emojiManager) {
          this.emojiManager = new EmojiManager(this.client);
        }
        const result = await this.emojiManager.autoSyncEmojis(guildId);
        const mappings = await this.emojiManager.getAllEmojis(guildId);
        res.json({ success: true, ...result, mappings });
      } catch (error) {
        logger.error('WebServer', 'Error syncing emojis:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Create/update emoji mapping
    this.app.put('/api/emojis/:guildId', this.authenticate.bind(this), async (req, res) => {
      try {
        const { guildId } = req.params;
        const { botName, emojiId, emojiUrl, emojiName, isAnimated, fallback, category } = req.body;
        
        if (!botName) {
          return res.status(400).json({ error: 'botName is required' });
        }
        
        const EmojiManager = (await import('#managers/EmojiManager')).default;
        if (!this.emojiManager) {
          this.emojiManager = new EmojiManager(this.client);
        }
        
        const emoji = await this.emojiManager.addEmoji(guildId, botName, {
          discordName: emojiName || botName,
          emojiId: emojiId || null,
          emojiUrl: emojiUrl || null,
          isAnimated: isAnimated || false,
          fallback: fallback || this.emojiManager.getDefaultEmoji(botName),
          category: category || this.emojiManager.getCategoryForEmoji(botName)
        });
        
        res.json({ success: true, emoji });
      } catch (error) {
        logger.error('WebServer', 'Error setting emoji mapping:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Remove emoji mapping
    this.app.delete('/api/emojis/:guildId/:botName', this.authenticate.bind(this), async (req, res) => {
      try {
        const { guildId, botName } = req.params;
        
        const EmojiManager = (await import('#managers/EmojiManager')).default;
        if (!this.emojiManager) {
          this.emojiManager = new EmojiManager(this.client);
        }
        
        await this.emojiManager.removeEmoji(guildId, botName);
        res.json({ success: true, message: 'Emoji mapping removed' });
      } catch (error) {
        logger.error('WebServer', 'Error removing emoji mapping:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Reset all emojis to defaults
    this.app.post('/api/emojis/:guildId/reset', this.authenticate.bind(this), async (req, res) => {
      try {
        const { guildId } = req.params;
        const EmojiManager = (await import('#managers/EmojiManager')).default;
        if (!this.emojiManager) {
          this.emojiManager = new EmojiManager(this.client);
        }
        await this.emojiManager.resetEmojis(guildId);
        const mappings = await this.emojiManager.getAllEmojis(guildId);
        res.json({ success: true, mappings });
      } catch (error) {
        logger.error('WebServer', 'Error resetting emojis:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Get default emojis by category
    this.app.get('/api/emojis/defaults', this.authenticate.bind(this), async (req, res) => {
      try {
        const EmojiManager = (await import('#managers/EmojiManager')).default;
        if (!this.emojiManager) {
          this.emojiManager = new EmojiManager(this.client);
        }
        const defaults = this.emojiManager.getDefaultEmojisByCategory();
        res.json(defaults);
      } catch (error) {
        logger.error('WebServer', 'Error getting default emojis:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // ============ PLAYLISTS ENDPOINTS ============

    // Get all playlists for user/guild
    this.app.get('/api/playlists/:guildId', this.authenticate.bind(this), async (req, res) => {
      try {
        const { guildId } = req.params;
        
        // Parse cookies to get userId
        const cookies = {};
        const cookieHeader = req.headers.cookie;
        if (cookieHeader) {
          cookieHeader.split(';').forEach(cookie => {
            const parts = cookie.trim().split('=');
            if (parts.length === 2) {
              cookies[parts[0]] = decodeURIComponent(parts[1]);
            }
          });
        }
        
        // Also check localStorage via query param (sent by frontend)
        const localStorageUserId = req.query.localUserId;
        
        // Get userId from session first, then from auth tokens, then from query
        let userId = req.session?.passport?.user?.id;
        
        if (!userId) {
          // Get from auth token
          const token = cookies.auth_token;
          if (token) {
            const data = this.authTokens.get(token);
            if (data?.user?.id) {
              userId = data.user.id;
            }
          }
        }
        
        // Use localStorage userId if available
        if (!userId && localStorageUserId) {
          userId = localStorageUserId;
        }
        
        // Fallback to query param
        if (!userId) {
          userId = req.query.userId;
        }
        
        console.log('Loading playlists for userId:', userId);
        
        const { db } = await import('#database/DatabaseManager');
        
        // Get playlists by userId
        let playlists = userId ? db.playlists.getAllPlaylists(guildId, userId) : [];
        
        // If no playlists found and userId is null, get all playlists for this guild
        if ((!playlists || playlists.length === 0) && !userId) {
          console.log('No userId, fetching all playlists for guild');
          playlists = db.playlists.getAllPlaylists(guildId, null);
        }
        
        console.log('Found playlists:', playlists?.length || 0);
        res.json(playlists || []);
      } catch (error) {
        logger.error('WebServer', 'Error getting playlists:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Get single playlist
    this.app.get('/api/playlists/:guildId/:playlistId', this.authenticate.bind(this), async (req, res) => {
      try {
        const { guildId, playlistId } = req.params;
        
        // Get userId for access validation
        const userId = this.getUserIdFromRequest(req);
        
        const { db } = await import('#database/DatabaseManager');
        const playlist = db.playlists.getPlaylist(playlistId);
        
        if (!playlist) {
          return res.status(404).json({ error: 'Playlist not found' });
        }
        
        // Check access - user can only access their own playlists
        if (playlist.user_id !== userId) {
          return res.status(403).json({ error: 'Access denied' });
        }
        
        res.json(playlist);
      } catch (error) {
        logger.error('WebServer', 'Error getting playlist:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Create playlist
    this.app.post('/api/playlists/:guildId', this.authenticate.bind(this), async (req, res) => {
      try {
        const { guildId } = req.params;
        const { name, description, isPublic, coverImage, localUserId } = req.body;
        
        // Parse cookies to get userId from auth token
        const cookies = {};
        const cookieHeader = req.headers.cookie;
        if (cookieHeader) {
          cookieHeader.split(';').forEach(cookie => {
            const parts = cookie.trim().split('=');
            if (parts.length === 2) {
              cookies[parts[0]] = decodeURIComponent(parts[1]);
            }
          });
        }
        
        // Get userId from auth token (most reliable)
        let userId = null;
        const token = cookies.auth_token;
        if (token) {
          const data = this.authTokens.get(token);
          if (data?.user?.id) {
            userId = String(data.user.id);
          }
        }
        
        // Fallback to localStorage userId
        if (!userId && localUserId) {
          userId = String(localUserId);
        }
        
        // Fallback to session
        if (!userId && req.session?.passport?.user?.id) {
          userId = String(req.session.passport.user.id);
        }
        
        // Fallback to request body
        if (!userId && req.body.userId) {
          userId = String(req.body.userId);
        }
        
        if (!name) {
          return res.status(400).json({ error: 'Playlist name is required' });
        }
        
        if (!userId) {
          return res.status(400).json({ error: 'User ID is required' });
        }
        
        console.log('Creating playlist - userId:', userId, 'name:', name);
        
        const { db } = await import('#database/DatabaseManager');
        // Note: createPlaylist takes (userId, name, description, isPublic, coverImage) - no guildId
        const playlistId = db.playlists.createPlaylist(userId, name, description, isPublic, coverImage);
        
        const playlist = db.playlists.getPlaylist(playlistId);
        res.json({ success: true, playlist });
      } catch (error) {
        logger.error('WebServer', 'Error creating playlist:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Add track to playlist
    this.app.post('/api/playlists/:guildId/:playlistId/tracks', this.authenticate.bind(this), async (req, res) => {
      try {
        const { guildId, playlistId } = req.params;
        const { track, position } = req.body;
        
        if (!track) {
          return res.status(400).json({ error: 'Track data is required' });
        }
        
        const userId = this.getUserIdFromRequest(req);
        if (!userId) {
          return res.status(400).json({ error: 'User ID is required' });
        }
        
        const { db } = await import('#database/DatabaseManager');
        
        // If position is specified, insert at that position
        if (typeof position === 'number' && position >= 0) {
          const playlist = db.playlists.getPlaylist(playlistId);
          if (!playlist) {
            return res.status(404).json({ error: 'Playlist not found' });
          }
          
          let tracks = playlist.tracks || [];
          
          // Insert track at position
          tracks.splice(position, 0, {
            identifier: track.identifier,
            title: track.title || 'Unknown Track',
            author: track.author || 'Unknown',
            album: track.album || null,
            uri: track.uri || null,
            duration: track.duration || null,
            sourceName: track.sourceName || null,
            artworkUrl: track.artworkUrl || null,
            isExplicit: track.isExplicit || false,
            addedAt: Date.now()
          });
          
          const totalDuration = tracks.reduce((sum, t) => sum + (t.duration || 0), 0);
          
          db.playlists.exec(`
            UPDATE playlists 
            SET tracks = ?, total_duration = ?, track_count = ?, updated_at = CURRENT_TIMESTAMP 
            WHERE id = ?
          `, [JSON.stringify(tracks), totalDuration, tracks.length, playlistId]);
        } else {
          // Add to end (default behavior)
          db.playlists.addTrackToPlaylist(playlistId, userId, track);
        }
        
        const playlist = db.playlists.getPlaylist(playlistId);
        res.json({ success: true, playlist });
      } catch (error) {
        logger.error('WebServer', 'Error adding track:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Remove track from playlist
    this.app.delete('/api/playlists/:guildId/:playlistId/tracks/:trackIdentifier', this.authenticate.bind(this), async (req, res) => {
      try {
        const { guildId, playlistId, trackIdentifier } = req.params;
        
        const userId = this.getUserIdFromRequest(req);
        if (!userId) {
          return res.status(400).json({ error: 'User ID is required' });
        }
        
        const { db } = await import('#database/DatabaseManager');
        // Note: removeTrackFromPlaylist takes (playlistId, userId, trackIdentifier) - no guildId
        db.playlists.removeTrackFromPlaylist(playlistId, userId, trackIdentifier);
        
        const playlist = db.playlists.getPlaylist(playlistId);
        res.json({ success: true, playlist });
      } catch (error) {
        logger.error('WebServer', 'Error removing track:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Reorder tracks in playlist
    this.app.put('/api/playlists/:guildId/:playlistId/tracks/reorder', this.authenticate.bind(this), async (req, res) => {
      try {
        const { guildId, playlistId } = req.params;
        const { fromIndex, toIndex } = req.body;
        
        if (typeof fromIndex !== 'number' || typeof toIndex !== 'number') {
          return res.status(400).json({ error: 'fromIndex and toIndex are required' });
        }
        
        const userId = this.getUserIdFromRequest(req);
        if (!userId) {
          return res.status(400).json({ error: 'User ID is required' });
        }
        
        const { db } = await import('#database/DatabaseManager');
        // Note: reorderPlaylistTracks takes (playlistId, userId, fromIndex, toIndex) - no guildId
        const playlist = db.playlists.reorderPlaylistTracks(playlistId, userId, fromIndex, toIndex);
        
        res.json({ success: true, playlist });
      } catch (error) {
        logger.error('WebServer', 'Error reordering tracks:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Update playlist
    this.app.put('/api/playlists/:guildId/:playlistId', this.authenticate.bind(this), async (req, res) => {
      try {
        const { guildId, playlistId } = req.params;
        const { name, description, coverImage, cover_image, isPublic } = req.body;
        
        const userId = this.getUserIdFromRequest(req);
        if (!userId) {
          return res.status(400).json({ error: 'User ID is required' });
        }
        
        const { db } = await import('#database/DatabaseManager');
        const updates = {};
        if (name !== undefined) updates.name = name;
        if (description !== undefined) updates.description = description;
        if (coverImage !== undefined) updates.cover_image = coverImage;
        if (cover_image !== undefined) updates.cover_image = cover_image;
        if (isPublic !== undefined) updates.is_public = isPublic;
        
        // Note: updatePlaylist takes (playlistId, userId, updates) - no guildId
        const playlist = db.playlists.updatePlaylist(playlistId, userId, updates);
        res.json({ success: true, playlist });
      } catch (error) {
        logger.error('WebServer', 'Error updating playlist:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Delete playlist
    this.app.delete('/api/playlists/:guildId/:playlistId', this.authenticate.bind(this), async (req, res) => {
      try {
        const { guildId, playlistId } = req.params;
        
        const userId = this.getUserIdFromRequest(req);
        if (!userId) {
          return res.status(400).json({ error: 'User ID is required' });
        }
        
        const { db } = await import('#database/DatabaseManager');
        // Note: deletePlaylist takes (playlistId, userId) - no guildId
        db.playlists.deletePlaylist(playlistId, userId);
        
        res.json({ success: true, message: 'Playlist deleted' });
      } catch (error) {
        logger.error('WebServer', 'Error deleting playlist:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // ============ SETTINGS ENDPOINTS ============

    // Get guild settings
    this.app.get('/api/settings/:guildId', this.authenticate.bind(this), async (req, res) => {
      try {
        const { guildId } = req.params;
        const { db } = await import('#database/DatabaseManager');
        
        const guildDb = db.guild;
        const guild = guildDb.ensureGuild(guildId);
        
        let prefix;
        if (guild?.prefixes) {
          try {
            const prefixes = JSON.parse(guild.prefixes);
            prefix = Array.isArray(prefixes) && prefixes.length > 0 ? prefixes[0] : config.prefix;
          } catch (e) {
            prefix = config.prefix;
          }
        } else {
          prefix = config.prefix;
        }
        
        const defaultVolume = guild?.default_volume ?? config.player.defaultVolume;
        const autoPlay = guild?.auto_play === 1 || guild?.auto_play === true;
        const leaveOnEmpty = guild?.auto_disconnect !== 0 && guild?.auto_disconnect !== false;
        const is247Settings = guildDb.get247Settings(guildId);
        
        // New tier/role settings
        const djRoles = guildDb.getDjRoles(guildId);
        const tier = guildDb.getTier(guildId);
        const tierRoles = guildDb.getTierRoles(guildId);
        
        res.json({
          prefix,
          defaultVolume,
          autoPlay,
          leaveOnEmpty,
          stay247: is247Settings.enabled,
          '247TextChannel': is247Settings.textChannel,
          '247VoiceChannel': is247Settings.voiceChannel,
          djRoles,
          tier,
          allowedRoles: tierRoles.allowed,
          allowedUsers: tierRoles.allowedUsers,
          vipRoles: tierRoles.vip,
          vipUsers: tierRoles.vipUsers,
          premiumRoles: tierRoles.premium,
          premiumUsers: tierRoles.premiumUsers
        });
      } catch (error) {
        logger.error('WebServer', 'Error getting settings:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Update guild settings
    this.app.put('/api/settings/:guildId', this.authenticate.bind(this), async (req, res) => {
      try {
        const { guildId } = req.params;
        const { prefix, defaultVolume, djRoles, autoPlay, leaveOnEmpty, stay247, textChannelId, voiceChannelId, tier, allowedRoles, allowedUsers, vipRoles, vipUsers, premiumRoles, premiumUsers } = req.body;
        const { db } = await import('#database/DatabaseManager');
        
        const guildDb = db.guild;
        
        if (prefix !== undefined) guildDb.setPrefixes(guildId, JSON.stringify([prefix]));
        if (defaultVolume !== undefined) guildDb.setDefaultVolume(guildId, parseInt(defaultVolume));
        
        if (djRoles !== undefined) {
          guildDb.setDjRoles(guildId, djRoles);
        }
        
        if (autoPlay !== undefined) {
          guildDb.ensureGuild(guildId);
          guildDb.exec("UPDATE guilds SET auto_play = ? WHERE id = ?", [autoPlay ? 1 : 0, guildId]);
        }
        if (leaveOnEmpty !== undefined) {
          guildDb.ensureGuild(guildId);
          guildDb.exec("UPDATE guilds SET auto_disconnect = ? WHERE id = ?", [leaveOnEmpty ? 1 : 0, guildId]);
        }
        
        if (stay247 !== undefined) {
          guildDb.set247Mode(guildId, stay247, voiceChannelId || null, textChannelId || null);
        }
        
        // Tier and role settings
        if (tier !== undefined) {
          guildDb.setTier(guildId, tier);
        }
        if (allowedRoles !== undefined) {
          guildDb.setAllowedRoles(guildId, allowedRoles);
        }
        if (allowedUsers !== undefined) {
          guildDb.setAllowedUsers(guildId, allowedUsers);
        }
        if (vipRoles !== undefined) {
          guildDb.setVipRoles(guildId, vipRoles);
        }
        if (vipUsers !== undefined) {
          guildDb.setVipUsers(guildId, vipUsers);
        }
        if (premiumRoles !== undefined) {
          guildDb.setPremiumRoles(guildId, premiumRoles);
        }
        if (premiumUsers !== undefined) {
          guildDb.setPremiumUsers(guildId, premiumUsers);
        }
        
        res.json({ success: true, message: 'Settings updated' });
      } catch (error) {
        logger.error('WebServer', 'Error updating settings:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Get guild roles (for DJ role selection)
    this.app.get('/api/guild/:guildId/roles', this.authenticate.bind(this), async (req, res) => {
      try {
        const { guildId } = req.params;
        const guild = this.client.guilds.cache.get(guildId);
        
        if (!guild) {
          return res.status(404).json({ error: 'Guild not found' });
        }
        
        const roles = guild.roles.cache.map(role => ({
          id: role.id,
          name: role.name,
          color: role.hexColor,
          position: role.position
        })).sort((a, b) => b.position - a.position);
        
        res.json(roles);
      } catch (error) {
        logger.error('WebServer', 'Error getting guild roles:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Get guild channels (for 24/7 mode selection)
    this.app.get('/api/guild/:guildId/channels', this.authenticate.bind(this), async (req, res) => {
      try {
        const { guildId } = req.params;
        const guild = this.client.guilds.cache.get(guildId);
        
        if (!guild) {
          return res.status(404).json({ error: 'Guild not found' });
        }
        
        const voiceChannels = guild.channels.cache
          .filter(c => c.type === 2) // Voice
          .map(c => ({ id: c.id, name: c.name, type: 'voice' }));
        
        const textChannels = guild.channels.cache
          .filter(c => c.type === 0) // Text
          .map(c => ({ id: c.id, name: c.name, type: 'text' }));
        
        res.json({ voiceChannels, textChannels });
      } catch (error) {
        logger.error('WebServer', 'Error getting guild channels:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Get guild members (for user tier selection)
    this.app.get('/api/guild/:guildId/members', this.authenticate.bind(this), async (req, res) => {
      try {
        const { guildId } = req.params;
        const guild = this.client.guilds.cache.get(guildId);
        
        if (!guild) {
          return res.status(404).json({ error: 'Guild not found' });
        }
        
        // Fetch all members from the guild
        try {
          await guild.members.fetch();
        } catch (e) {
          // Ignore fetch errors, use cached members
        }
        
        const members = guild.members.cache.map(member => ({
          id: member.user.id,
          username: member.user.username,
          discriminator: member.user.discriminator,
          avatar: member.user.displayAvatarURL({ size: 32 }),
          displayName: member.displayName
        })).sort((a, b) => a.username.localeCompare(b.username));
        
        res.json(members);
      } catch (error) {
        logger.error('WebServer', 'Error getting guild members:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Search tracks from music sources
    this.app.get('/api/search', this.authenticate.bind(this), async (req, res) => {
      try {
        const { query, source = 'all' } = req.query;
        
        if (!query || query.trim().length < 2) {
          return res.status(400).json({ error: 'Query must be at least 2 characters' });
        }
        
        // Map source to lavalink search identifier
        const sourceMap = {
          youtube: 'ytsearch',
          spotify: 'spsearch',
          soundcloud: 'scsearch',
          apple: 'amsearch',
          deezer: 'dzsearch',
          all: null
        };
        
        const searchSource = sourceMap[source] || sourceMap.all;
        const searchQuery = searchSource ? `${searchSource}:${query}` : query;
        
        // Use the music client's search functionality
        const playerManager = this.client.music;
        if (!playerManager) {
          return res.status(500).json({ error: 'Music system not available' });
        }
        
        // Get a player node for searching
        let node = null;
        if (playerManager.nodes && playerManager.nodes.size > 0) {
          node = playerManager.nodes.values().next().value;
        } else if (playerManager.getNode) {
          node = await playerManager.getNode();
        }
        if (!node) {
          return res.status(500).json({ error: 'No music nodes available' });
        }
        
        const searchResult = await node.search(searchQuery, null);
        
        if (!searchResult || !searchResult.tracks) {
          return res.json({ results: [] });
        }
        
        const results = searchResult.tracks.map((track, index) => ({
          source: detectSource(track.uri),
          identifier: track.identifier,
          title: track.title,
          author: track.author,
          duration: track.duration,
          durationFormatted: formatDuration(track.duration),
          uri: track.uri,
          artworkUrl: track.artworkUrl || track.thumbnail || null,
          isExplicit: track.isExplicit || false,
          sourceName: track.sourceName || detectSource(track.uri)
        }));
        
        res.json({ results });
      } catch (error) {
        logger.error('WebServer', 'Error searching tracks:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Helper function to detect source from URI
    function detectSource(uri) {
      if (!uri) return 'youtube';
      if (uri.includes('spotify.com')) return 'spotify';
      if (uri.includes('youtube.com') || uri.includes('youtu.be')) return 'youtube';
      if (uri.includes('soundcloud.com')) return 'soundcloud';
      if (uri.includes('music.apple.com')) return 'apple';
      if (uri.includes('deezer.com')) return 'deezer';
      return 'youtube';
    }

    // Helper function to format duration
    function formatDuration(ms) {
      if (!ms) return '0:00';
      const seconds = Math.floor(ms / 1000);
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = seconds % 60;
      return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    }

    // Get playlist details (full with tracks)
    this.app.get('/api/playlists/:playlistId/details', this.authenticate.bind(this), async (req, res) => {
      try {
        const { playlistId } = req.params;
        const userId = this.getUserIdFromRequest(req);
        
        const { db } = await import('#database/DatabaseManager');
        const playlist = db.playlists.getPlaylist(playlistId);
        
        if (!playlist) {
          return res.status(404).json({ error: 'Playlist not found' });
        }
        
        // Check access
        if (playlist.user_id !== userId && !playlist.is_public) {
          return res.status(403).json({ error: 'Access denied' });
        }
        
        // Format track durations
        if (playlist.tracks && Array.isArray(playlist.tracks)) {
          playlist.tracks = playlist.tracks.map(track => ({
            ...track,
            durationFormatted: formatDuration(track.duration)
          }));
        }
        
        res.json(playlist);
      } catch (error) {
        logger.error('WebServer', 'Error getting playlist details:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Update playlist details (name, description, cover, isPublic)
    this.app.put('/api/playlists/:playlistId/details', this.authenticate.bind(this), async (req, res) => {
      try {
        const { playlistId } = req.params;
        const { name, description, coverImage, isPublic } = req.body;
        const userId = this.getUserIdFromRequest(req);
        
        if (!userId) {
          return res.status(400).json({ error: 'User ID is required' });
        }
        
        const { db } = await import('#database/DatabaseManager');
        
        const updates = {};
        if (name !== undefined) updates.name = name;
        if (description !== undefined) updates.description = description;
        if (coverImage !== undefined) updates.cover_image = coverImage;
        if (isPublic !== undefined) updates.is_public = isPublic;
        
        const playlist = db.playlists.updatePlaylist(playlistId, userId, updates);
        res.json({ success: true, playlist });
      } catch (error) {
        logger.error('WebServer', 'Error updating playlist details:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // ============ SPOTIFY & YOUTUBE MUSIC INTEGRATION ============

    // Import Spotify playlist to bot playlist
    this.app.post('/api/playlists/:guildId/import/spotify', this.authenticate.bind(this), async (req, res) => {
      try {
        const { guildId } = req.params;
        const { playlistUrl, targetPlaylistId } = req.body;
        const { db } = await import('#database/DatabaseManager');
        const { spotifyManager } = await import('#utils/SpotifyManager');
        
        const userId = req.session.userId || req.user?.id;
        
        if (!playlistUrl) {
          return res.status(400).json({ error: 'Spotify playlist URL is required' });
        }
        
        const parsed = spotifyManager.parseSpotifyUrl(playlistUrl);
        if (!parsed || parsed.type !== 'playlist') {
          return res.status(400).json({ error: 'Invalid Spotify playlist URL' });
        }
        
        const spotifyTracks = await spotifyManager.fetchPlaylistTracks(parsed.id, 100);
        if (!spotifyTracks || spotifyTracks.length === 0) {
          return res.status(404).json({ error: 'No tracks found in Spotify playlist' });
        }
        
        let playlist;
        if (targetPlaylistId) {
          playlist = db.playlists.getPlaylist(targetPlaylistId);
          if (!playlist || playlist.user_id !== userId) {
            return res.status(403).json({ error: 'Playlist not found or access denied' });
          }
        } else {
          const playlistName = `Spotify Import ${new Date().toLocaleDateString()}`;
          const playlistId = db.playlists.createPlaylist(userId, playlistName, `Imported from Spotify`, false, null);
          playlist = db.playlists.getPlaylist(playlistId);
        }
        
        let addedCount = 0;
        for (const track of spotifyTracks) {
          try {
            const searchResult = await this.client.music.search(`${track.name} ${track.artist}`, { source: 'ytsearch' });
            if (searchResult?.tracks?.length > 0) {
              const lavalinkTrack = searchResult.tracks[0];
              db.playlists.addTrackToPlaylist(playlist.id, userId, {
                identifier: lavalinkTrack.identifier,
                title: track.name,
                author: track.artist,
                uri: lavalinkTrack.uri,
                artworkUrl: lavalinkTrack.artworkUrl || track.albumCoverUrl,
                duration: lavalinkTrack.duration || track.duration,
                source: 'youtube'
              });
              addedCount++;
            }
          } catch (e) {
            logger.warn('WebServer', `Failed to add track ${track.name}:`, e.message);
          }
        }
        
        playlist = db.playlists.getPlaylist(playlist.id);
        res.json({ success: true, playlist, imported: addedCount, total: spotifyTracks.length });
      } catch (error) {
        logger.error('WebServer', 'Error importing Spotify playlist:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Search YouTube Music playlist
    this.app.get('/api/search/ytmusic', this.authenticate.bind(this), async (req, res) => {
      try {
        const { query } = req.query;
        
        if (!query || query.trim().length < 2) {
          return res.status(400).json({ error: 'Query must be at least 2 characters' });
        }
        
        // Search YouTube Music for playlists
        const searchQuery = `ytmsearch:${query} playlist`;
        const searchResult = await this.client.music.search(searchQuery, { source: 'ytsearch' });
        
        if (!searchResult?.playlists?.length) {
          return res.json({ playlists: [] });
        }
        
        const playlists = searchResult.playlists.map(p => ({
          id: p.id,
          title: p.info?.title || p.title,
          author: p.info?.author || p.author,
          url: p.info?.uri || `https://music.youtube.com/playlist?list=${p.id}`,
          artworkUrl: p.info?.artworkUrl || p.artworkUrl,
          trackCount: p.tracks?.length || 0,
          source: 'youtube'
        }));
        
        res.json({ playlists });
      } catch (error) {
        logger.error('WebServer', 'Error searching YouTube Music:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Import YouTube Music playlist
    this.app.post('/api/playlists/:guildId/import/ytmusic', this.authenticate.bind(this), async (req, res) => {
      try {
        const { guildId } = req.params;
        const { playlistId, playlistName, targetPlaylistId } = req.body;
        const { db } = await import('#database/DatabaseManager');
        
        const userId = req.session.userId || req.user?.id;
        
        if (!playlistId) {
          return res.status(400).json({ error: 'YouTube Music playlist ID is required' });
        }
        
        // Load the YouTube Music playlist
        const loadResult = await this.client.music.search(`https://music.youtube.com/playlist?list=${playlistId}`, { source: 'ytsearch' });
        
        if (!loadResult?.tracks?.length) {
          return res.status(404).json({ error: 'No tracks found in YouTube Music playlist' });
        }
        
        let playlist;
        if (targetPlaylistId) {
          playlist = db.playlists.getPlaylist(targetPlaylistId);
          if (!playlist || playlist.user_id !== userId) {
            return res.status(403).json({ error: 'Playlist not found or access denied' });
          }
        } else {
          const name = playlistName || `YT Music Import ${new Date().toLocaleDateString()}`;
          const newPlaylistId = db.playlists.createPlaylist(userId, name, `Imported from YouTube Music`, false, null);
          playlist = db.playlists.getPlaylist(newPlaylistId);
        }
        
        let addedCount = 0;
        for (const track of loadResult.tracks) {
          try {
            db.playlists.addTrackToPlaylist(playlist.id, userId, {
              identifier: track.identifier,
              title: track.info?.title,
              author: track.info?.author,
              uri: track.info?.uri,
              artworkUrl: track.info?.artworkUrl,
              duration: track.info?.duration,
              source: 'youtube'
            });
            addedCount++;
          } catch (e) {
            logger.warn('WebServer', `Failed to add track ${track.info?.title}:`, e.message);
          }
        }
        
        playlist = db.playlists.getPlaylist(playlist.id);
        res.json({ success: true, playlist, imported: addedCount, total: loadResult.tracks.length });
      } catch (error) {
        logger.error('WebServer', 'Error importing YouTube Music playlist:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // ============ STATS ENDPOINTS ============

    // Get guild stats
    this.app.get('/api/stats/:guildId', this.authenticate.bind(this), async (req, res) => {
      try {
        const { guildId } = req.params;
        const { db } = await import('#database/DatabaseManager');
        const guildDb = db.guild;
        
        // Get play count
        const totalPlays = guildDb.getPlayCount ? guildDb.getPlayCount() : 0;
        
        // Get unique users
        const history = guildDb.getTrackHistory ? guildDb.getTrackHistory(1000) : [];
        const uniqueUsers = new Set(history.map(h => h.requesterId).filter(Boolean)).size;
        
        // Get top songs
        const songCounts = {};
        history.forEach(h => {
          const key = `${h.title}-${h.author}`;
          songCounts[key] = (songCounts[key] || 0) + 1;
        });
        
        const topSongs = Object.entries(songCounts)
          .map(([key, count]) => {
            const [title, author] = key.split('-');
            return { title, author, playCount: count };
          })
          .sort((a, b) => b.playCount - a.playCount)
          .slice(0, 10);
        
        // Get top genres (from source)
        const sourceCounts = {};
        history.forEach(h => {
          let source = 'Unknown';
          if (h.uri?.includes('spotify.com')) source = 'Spotify';
          else if (h.uri?.includes('youtube.com') || h.uri?.includes('youtu.be')) source = 'YouTube';
          else if (h.uri?.includes('soundcloud.com')) source = 'SoundCloud';
          else if (h.uri?.includes('music.apple.com')) source = 'Apple Music';
          else if (h.uri?.includes('deezer.com')) source = 'Deezer';
          
          sourceCounts[source] = (sourceCounts[source] || 0) + 1;
        });
        
        const topGenre = Object.entries(sourceCounts)
          .sort((a, b) => b[1] - a[1])[0]?.[0] || 'Unknown';
        
        // Bot uptime
        const uptime = this.client.uptime || 0;
        
        res.json({
          totalPlays,
          uniqueUsers,
          topGenre,
          uptime,
          topSongs,
          historyCount: history.length
        });
      } catch (error) {
        logger.error('WebServer', 'Error getting stats:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Get bot global stats
    this.app.get('/api/stats', this.authenticate.bind(this), async (req, res) => {
      try {
        const { DatabaseManager } = await import('#database/DatabaseManager');
        
        let totalPlays = 0;
        let totalUsers = new Set();
        let guildCount = this.client.guilds.cache.size;
        let playerCount = this.client.music?.players?.size || 0;
        
        // Aggregate stats from all guilds
        for (const guild of this.client.guilds.cache.values()) {
          try {
            const guildDb = DatabaseManager.getGuildDb(guild.id);
            if (guildDb.getPlayCount) {
              totalPlays += guildDb.getPlayCount();
            }
            const history = guildDb.getTrackHistory ? guildDb.getTrackHistory(100) : [];
            history.forEach(h => {
              if (h.requesterId) totalUsers.add(h.requesterId);
            });
          } catch (e) {
            // Skip guilds with DB errors
          }
        }
        
        res.json({
          totalPlays,
          uniqueUsers: totalUsers.size,
          guilds: guildCount,
          players: playerCount,
          uptime: this.client.uptime || 0,
          botPing: this.client.ws.ping
        });
      } catch (error) {
        logger.error('WebServer', 'Error getting global stats:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // ============ END STATS ENDPOINTS ============

    // Serve dashboard with auto-connect support
    this.app.get('/', (req, res) => {
      res.sendFile(join(__dirname, 'public', 'index.html'));
    });
    
    // Dashboard route
    this.app.get('/dashboard', (req, res) => {
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

