import express from "express";
import compression from "compression";
import { createServer } from "http";
import { createServer as createHttpsServer } from "https";

import { WebSocketServer } from "ws";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import passport from "passport";
import { Strategy } from "passport-discord";
import session from "express-session";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import WebSocketManager from "./socket/WebSocketManager.js";
import { logger } from "#utils/logger";
import { config } from "#config/config";
import { filters } from "#config/filters";
import { DiscordPlayerEmbed } from "#utils/DiscordPlayerEmbed";
import { EventUtils } from "#utils/EventUtils";
// NOTE:
// We previously ran BOTH a legacy raw `ws` server AND Socket.IO on the same HTTP server.
// That can cause `server.handleUpgrade()` conflicts (engine.io also uses ws internally).
// The dashboard has been migrated to Socket.IO, so we disable the legacy `ws` server
// by default to avoid double-upgrade on the same socket.
const ENABLE_LEGACY_WS = process.env.ENABLE_LEGACY_WS === "true";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function fetchWithRetry(
  url,
  options,
  { retries = 3, baseDelayMs = 350 } = {},
) {
  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, options);
      return res;
    } catch (err) {
      lastError = err;
      // Typical transient error when using VPN / flaky TLS:
      // err.cause?.code === 'UND_ERR_SOCKET' (undici)
      const causeCode = err?.cause?.code;
      const errCode = err?.code;
      const isTransient =
        causeCode === "UND_ERR_SOCKET" ||
        causeCode === "ECONNRESET" ||
        causeCode === "ETIMEDOUT" ||
        errCode === "ECONNRESET" ||
        errCode === "ETIMEDOUT";
      if (!isTransient || attempt === retries) {
        break;
      }
      const delay = baseDelayMs * Math.pow(2, attempt);
      logger.warn(
        "WebServer",
        `Discord fetch failed (${causeCode || errCode || "unknown"}), retrying in ${delay}ms (attempt ${attempt + 1}/${retries})`,
      );
      await sleep(delay);
    }
  }
  throw lastError;
}
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
    // Socket.IO manager (used by the dashboard for reliable realtime updates)
    this.socketManager = null;
    // Create server (HTTP or HTTPS)
    if (this.secure) {
      if (!config.web.sslCert || !config.web.sslKey) {
        logger.error(
          "WebServer",
          "SSL enabled but WEB_SSL_CERT or WEB_SSL_KEY not provided. Falling back to HTTP.",
        );
        this.secure = false;
      } else {
        try {
          const sslOptions = {
            key: readFileSync(config.web.sslKey, "utf8"),
            cert: readFileSync(config.web.sslCert, "utf8"),
          };
          this.server = createHttpsServer(sslOptions, this.app);
          logger.success(
            "WebServer",
            "HTTPS server configured with SSL certificates",
          );
        } catch (error) {
          logger.error(
            "WebServer",
            "Failed to load SSL certificates. Falling back to HTTP:",
            error,
          );
          this.secure = false;
        }
      }
    }
    if (!this.secure) {
      this.server = createServer(this.app);
    }
    // Legacy raw WebSocket server (disabled by default to prevent upgrade conflicts with Socket.IO/engine.io)
    this.wss = ENABLE_LEGACY_WS
      ? new WebSocketServer({ server: this.server })
      : null;
    // Socket.IO manager (used by the dashboard for reliable realtime updates)
    try {
      this.socketManager = new WebSocketManager(this.server, this.client);
    } catch (e) {
      logger.error("WebServer", "Failed to initialize Socket.IO manager:", e);
      this.socketManager = null;
    }
    // Simple token-based auth storage (persisted to file)
    this.authTokensFile = join(
      __dirname,
      "..",
      "..",
      "data",
      "auth_tokens.json",
    );
    this.authTokens = new Map();
    this.oauthAttempts = new Map();
    // Load persisted auth tokens
    this.loadAuthTokens();
    // Session for Passport (required)
    this.app.use(
      session({
        secret: process.env.SESSION_SECRET || "default-secret-change-this",
        resave: false,
        saveUninitialized: false,
        cookie: {
          secure: process.env.NODE_ENV === "production",
          httpOnly: false,
          maxAge: 7 * 24 * 60 * 60 * 1000,
          sameSite: "lax",
        },
      }),
    );
    this.setupPassport();
    this.setupMiddleware();
    this.setupRoutes();
    // Only enable legacy raw WebSocket server if explicitly requested.
    if (ENABLE_LEGACY_WS) {
      this.setupWebSocket();
    }
  }
  // Rate limiter for OAuth
  isRateLimited(ip) {
    const now = Date.now();
    const window = 60 * 1000; // 1 minute
    const maxAttempts = 5;
    const attempts = this.oauthAttempts.get(ip) || [];
    const recentAttempts = attempts.filter((t) => now - t < window);
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
      console.log("=== AUTH TOKENS CLEARED ON STARTUP ===");
    } catch (error) {
      console.error("Failed to load auth tokens:", error);
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
      console.error("Failed to save auth tokens:", error);
    }
  }
  generateToken(user) {
    const token = crypto.randomBytes(32).toString("hex");
    // Detect if user is a bot owner from config
    const isBotOwner = config.ownerIds?.includes(user.id);
    const entry = {
      user: { ...user, isBotOwner },
      expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
    };
    this.authTokens.set(token, entry);
    this.saveAuthTokens(); // Persist to file
    console.log("=== GENERATE TOKEN ===");
    console.log("Token:", token.substring(0, 16) + "...");
    console.log("User ID:", user.id, isBotOwner ? "(Bot Owner)" : "");
    console.log("Total tokens:", this.authTokens.size);
    return token;
  }
  validateToken(token) {
    console.log("=== VALIDATE TOKEN ===");
    console.log("Looking for token:", token?.substring(0, 16) + "...");
    console.log("Total stored tokens:", this.authTokens.size);
    if (!token) {
      console.log("No token provided");
      return null;
    }
    const data = this.authTokens.get(token);
    console.log("Token found in storage:", !!data);
    if (!data) {
      console.log("Token not found in storage");
      return null;
    }
    if (Date.now() > data.expires) {
      console.log("Token expired");
      this.authTokens.delete(token);
      this.saveAuthTokens();
      return null;
    }
    if (data.user && data.user.isBotOwner === undefined) {
      data.user.isBotOwner = config.ownerIds?.includes(data.user.id);
    }
    console.log("Valid user found:", data.user?.id, data.user?.isBotOwner ? "(Bot Owner)" : "");
    return data.user;
  }
  // Helper function to extract userId from request
  getUserIdFromRequest(req) {
    if (!req || !req.headers) return null;
    // Parse cookies
    const cookies = {};
    const cookieHeader = req.headers.cookie;

    if (cookieHeader) {
      cookieHeader.split(";").forEach((cookie) => {
        const parts = cookie.trim().split("=");
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

  async checkControlPermission(req, res, guildId) {
    const userId = this.getUserIdFromRequest(req);
    if (!userId) {
      res.status(401).json({ error: "Unauthorized: Please login." });
      return false;
    }
    const { PlayerPermissionManager } = await import("#managers/PlayerPermissionManager");
    const guild = this.client.guilds.cache.get(guildId);
    let member = guild?.members.cache.get(userId);
    if (!member && guild) {
      try { member = await guild.members.fetch(userId); } catch { }
    }
    const perm = PlayerPermissionManager.canControl(guildId, { id: userId }, member);
    if (!perm.allowed) {
      res.status(403).json({ error: perm.reason || "Permission denied" });
      return false;
    }
    return true;
  }
  setupPassport() {
    const clientID = process.env.DISCORD_CLIENT_ID;
    const clientSecret = process.env.DISCORD_CLIENT_SECRET;
    const callbackURL = `${process.env.DASHBOARD_URL || `http://localhost:${this.port}`}/auth/discord/callback`;
    if (!clientID || !clientSecret) {
      logger.warn(
        "WebServer",
        "Discord OAuth2 credentials not configured. Dashboard login will be disabled.",
      );
      return;
    }
    passport.serializeUser((user, done) => {
      done(null, {
        id: user.id,
        username: user.username,
        discriminator: user.discriminator,
        avatar: user.avatar,
        accessToken: user.accessToken,
        refreshToken: user.refreshToken,
      });
    });
    passport.deserializeUser(async (serialized, done) => {
      try {
        done(null, serialized);
      } catch (error) {
        done(error, null);
      }
    });
    passport.use(
      new Strategy(
        {
          clientID,
          clientSecret,
          callbackURL,
          scope: ["identify", "guilds"],
          prompt: "none",
          state: false, // Disable state verification since we use our own token auth
        },
        (accessToken, refreshToken, profile, done) => {
          console.log("Passport Strategy called!");
          console.log("Profile:", profile?.id);
          profile.accessToken = accessToken;
          profile.refreshToken = refreshToken;
          return done(null, profile);
        },
      ),
    );
    this.app.use(passport.initialize());
    this.app.use(passport.session());
    this.app.get(
      "/auth/discord",
      (req, res, next) => {
        console.log("=== OAUTH START ===");
        console.log("Current URL:", req.originalUrl);
        console.log("Session ID:", req.sessionID);
        console.log("User authenticated:", req.isAuthenticated());
        const ip = req.ip || req.connection.remoteAddress;
        if (this.isRateLimited(ip)) {
          console.log("OAuth rate limited for IP:", ip);
          return res.redirect("/dashboard?error=rate_limited");
        }
        next();
      },
      passport.authenticate("discord"),
    );
    console.log("OAuth route /auth/discord registered");
    this.app.get(
      "/auth/discord/callback",
      (req, res, next) => {
        console.log("=== OAUTH CALLBACK ===");
        console.log("Query:", req.query);
        const ip = req.ip || req.connection.remoteAddress;
        if (this.isRateLimited(ip)) {
          console.log("OAuth callback rate limited for IP:", ip);
          return res.redirect("/dashboard?error=rate_limited");
        }
        next();
      },
      passport.authenticate("discord", {
        failureRedirect: "/?error=auth_failed",
      }),
      (req, res) => {
        console.log("OAuth callback - User:", req.user?.id);
        // Generate auth token
        const token = this.generateToken(req.user);
        console.log("Generated token:", token.substring(0, 10) + "...");
        // Set cookie
        res.setHeader(
          "Set-Cookie",
          `auth_token=${token}; Path=/; Max-Age=604800; SameSite=Lax`,
        );
        console.log("Cookie set!");
        res.redirect("/dashboard");
      },
    );
    this.app.get("/auth/logout", (req, res) => {
      // Parse cookies
      const cookies = {};
      const cookieHeader = req.headers.cookie;
      if (cookieHeader) {
        cookieHeader.split(";").forEach((cookie) => {
          const parts = cookie.trim().split("=");
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
      res.setHeader("Set-Cookie", "auth_token=; Path=/; Max-Age=0");
      res.redirect("/");
    });
    this.app.get("/auth/user", (req, res) => {
      // Parse cookies manually
      const cookies = {};
      const cookieHeader = req.headers.cookie;
      if (cookieHeader) {
        cookieHeader.split(";").forEach((cookie) => {
          const parts = cookie.trim().split("=");
          if (parts.length === 2) {
            cookies[parts[0]] = decodeURIComponent(parts[1]);
          }
        });
      }
      const token = cookies.auth_token;
      if (!token) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const user = this.validateToken(token);
      if (!user) {
        return res.status(401).json({ error: "Token expired" });
      }
      res.json(user);
    });
    this.app.get("/auth/check", (req, res) => {
      // Parse cookies manually
      const cookies = {};
      const cookieHeader = req.headers.cookie;
      console.log("=== AUTH CHECK ===");
      console.log("Cookie header:", cookieHeader);
      if (cookieHeader) {
        cookieHeader.split(";").forEach((cookie) => {
          const parts = cookie.trim().split("=");
          if (parts.length === 2) {
            cookies[parts[0]] = decodeURIComponent(parts[1]);
          }
        });
      }
      const token = cookies.auth_token;
      console.log("Token from cookies:", token?.substring(0, 16) + "...");
      if (!token) {
        return res.json({ authenticated: false });
      }
      const user = this.validateToken(token);
      console.log("Final user:", user?.id);
      if (!user) {
        return res.json({ authenticated: false });
      }
      res.json({ authenticated: true, user });
    });
    // Mint a short-lived JWT for Socket.IO authentication.
    // The Socket.IO server verifies this using JWT_SECRET (see src/web/socket/WebSocketManager.js).
    this.app.get("/auth/socket-token", (req, res) => {
      // Parse cookies manually
      const cookies = {};
      const cookieHeader = req.headers.cookie;
      if (cookieHeader) {
        cookieHeader.split(";").forEach((cookie) => {
          const parts = cookie.trim().split("=");
          if (parts.length === 2) {
            cookies[parts[0]] = decodeURIComponent(parts[1]);
          }
        });
      }
      const token = cookies.auth_token;
      if (!token) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const user = this.validateToken(token);
      if (!user) {
        return res.status(401).json({ error: "Token expired" });
      }
      const secret = process.env.JWT_SECRET || "your-secret-key";
      const expiresIn = process.env.SOCKET_JWT_EXPIRES_IN || "10m";
      // Keep payload minimal; WebSocketManager expects socket.user.id at least.
      const socketJwt = jwt.sign(
        {
          id: user.id,
          username: user.username,
          discriminator: user.discriminator,
        },
        secret,
        { expiresIn },
      );
      res.json({ token: socketJwt, expiresIn });
    });
    this.app.get("/api/user/guilds", async (req, res) => {
      const cookies = {};
      const cookieHeader = req.headers.cookie;
      console.log("=== API USER GUILDS ===");
      // console.log("Cookie header:", cookieHeader);
      if (cookieHeader) {
        cookieHeader.split(";").forEach((cookie) => {
          const parts = cookie.trim().split("=");
          if (parts.length === 2) {
            cookies[parts[0]] = decodeURIComponent(parts[1]);
          }
        });
      }
      const token = cookies.auth_token;
      if (!token) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const data = this.authTokens.get(token);
      if (!data || Date.now() > data.expires) {
        return res.status(401).json({ error: "Token expired or invalid" });
      }

      // === CACHE CHECK ===
      const CACHE_DURATION = 60 * 1000; // 60 seconds
      if (data.guilds && data.guildsFetchedAt && (Date.now() - data.guildsFetchedAt < CACHE_DURATION)) {
        console.log("Serving cached guilds");
        return res.json(data.guilds);
      }
      // ===================

      const { accessToken } = data.user || {};
      if (!accessToken) {
        return res.status(500).json({ error: "No access token available" });
      }
      try {
        const response = await fetchWithRetry(
          "https://discord.com/api/users/@me/guilds",
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "User-Agent": "TymeeMusicDashboard (guild fetch)",
            },
          },
          { retries: 3, baseDelayMs: 350 },
        );
        if (!response.ok) {
          const bodyText = await response.text().catch(() => "");
          logger.warn(
            "WebServer",
            `Discord guild fetch failed: HTTP ${response.status}. Body: ${bodyText.slice(0, 200)}`,
          );
          if (response.status === 401 || response.status === 403) {
            return res.status(401).json({
              error:
                "Discord authorization expired. Please log out and log in again.",
            });
          }
          if (response.status === 429) {
            const retryAfter = JSON.parse(bodyText).retry_after || 5;
            return res.status(429).json({ error: `Rate limited. Please wait ${retryAfter}s.` });
          }
          return res.status(502).json({
            error: `Failed to fetch guilds from Discord (HTTP ${response.status})`,
          });
        }
        const guilds = await response.json();
        // Filter to guilds where user has MANAGE_GUILD or ADMINISTRATOR
        const botGuildIds = new Set(this.client.guilds.cache.map((g) => g.id));

        const managedGuilds = guilds.filter((guild) => {
          const permissions = BigInt(guild.permissions);
          const ADMIN = BigInt(0x8);
          const MANAGE_GUILD = BigInt(0x20); // 32
          const isAdmin = ((permissions & ADMIN) === ADMIN) || ((permissions & MANAGE_GUILD) === MANAGE_GUILD);
          const hasBot = botGuildIds.has(guild.id);

          // User requested: Allow access if bot is added, even if not admin.
          // Admins can see guilds without bot (to invite).
          // Non-admins can only see guilds WITH bot (to play).
          return isAdmin || hasBot;
        }).map((guild) => {
          const permissions = BigInt(guild.permissions);
          const ADMIN = BigInt(0x8);
          const MANAGE_GUILD = BigInt(0x20);
          const isAdmin = ((permissions & ADMIN) === ADMIN) || ((permissions & MANAGE_GUILD) === MANAGE_GUILD);

          return {
            ...guild,
            hasBot: botGuildIds.has(guild.id),
            isAdmin: isAdmin
          };
        });

        // === CACHE SAVE ===
        data.guilds = managedGuilds;
        data.guildsFetchedAt = Date.now();
        // ==================

        console.log(
          `Found ${managedGuilds.length} managed guilds for user.`,
        );
        res.json(managedGuilds);
      } catch (error) {
        const code = error?.cause?.code || error?.code || "unknown";
        console.error("Error fetching guilds:", error);
        logger.warn(
          "WebServer",
          `Discord guild fetch threw (code=${code}). If you're on a VPN (e.g., NordVPN), try disabling it and re-login.`,
        );
        res.status(502).json({
          error:
            "Failed to fetch guilds from Discord (network/TLS issue). If you're using a VPN, disable it and log in again.",
        });
      }
    });
    logger.success("WebServer", "Discord OAuth2 configured");
  }
  setupMiddleware() {
    // Enable Gzip Compression (huge bandwidth saving)
    this.app.use(compression());

    // CORS middleware
    this.app.use((req, res, next) => {
      res.header("Access-Control-Allow-Origin", "http://localhost:3000");
      res.header("Access-Control-Allow-Credentials", "true");
      res.header(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, DELETE, OPTIONS",
      );
      res.header(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization, X-API-Key",
      );
      if (req.method === "OPTIONS") {
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
        cookieHeader.split(";").forEach((cookie) => {
          const parts = cookie.trim().split("=");
          if (parts.length === 2) {
            const [name, value] = parts;
            req.cookies[name] = decodeURIComponent(value);
          }
        });
      }
      next();
    });
    // Static files with 1 Day Cache
    this.app.use(express.static(join(__dirname, "public"), {
      maxAge: '1d',
      etag: true,
      lastModified: true
    }));
  }
  // Authentication middleware
  authenticate(req, res, next) {
    const apiKey = req.headers["x-api-key"] || req.query.apiKey;
    if (!apiKey || apiKey !== this.apiKey) {
      return res
        .status(401)
        .json({ error: "Unauthorized. Invalid or missing API key." });
    }
    next();
  }

  // Consolidating Spotify/Artwork logic into MusicManager...
  // WebServer now delegates these to this.client.music

  setupRoutes() {
    // Helper: Send feedback to voice channel text (Chat-in-Voice) if available, else fallback
    // Feedback Rate Limiting
    const feedbackCooldowns = new Map();

    // Helper: Send feedback to voice channel text (Chat-in-Voice) if available, else fallback
    const sendFeedback = async (client, player, message) => {
      // 1. Anti-Spam Check
      const now = Date.now();
      const lastTime = feedbackCooldowns.get(player.guildId) || 0;
      if (now - lastTime < 2000) return; // 2s Cooldown
      feedbackCooldowns.set(player.guildId, now);

      if (!player || !message) return;

      // 2. Brute-force Channel Resolution
      // Just try the channels in order. First one to succeed wins.
      const candidates = [];
      if (player.voiceChannelId) candidates.push({ id: player.voiceChannelId, type: 'voice' });
      if (player.textChannelId) candidates.push({ id: player.textChannelId, type: 'text' });

      let sent = false;
      for (const candidate of candidates) {
        if (sent) break; // Already sent
        if (!candidate.id) continue;

        try {
          // Use our safe sender
          const result = await EventUtils.sendTimedMessage(client, candidate.id, message);
          if (result) {
            logger.info('WebServer', `[Feedback] Sent to ${candidate.type} channel (${candidate.id})`);
            sent = true;
          } else {
            logger.debug('WebServer', `[Feedback] Failed to send to ${candidate.type} channel (${candidate.id}) - returned null`);
          }
        } catch (err) {
          logger.debug('WebServer', `[Feedback] Exception sending to ${candidate.type} channel (${candidate.id}): ${err.message}`);
        }
      }

      if (!sent) {
        logger.warn('WebServer', `[Feedback] Could not send feedback to ANY channel for guild ${player.guildId}`);
      }
    };

    // Register Playlist v2 API routes
    import('./routes/playlistV2.js').then(({ registerPlaylistV2Routes }) => {
      registerPlaylistV2Routes(this.app, this);
    }).catch(err => {
      logger.error('WebServer', 'Failed to load Playlist v2 routes:', err);
    });

    // Health check
    this.app.get("/health", (req, res) => {
      res.json({ status: "ok", timestamp: Date.now() });
    });
    // Proxy for Spotify oEmbed (CORS bypass)
    this.app.get("/api/utils/spotify-cover", async (req, res) => {
      const url = req.query.url;
      if (!url) return res.status(400).json({ error: "Missing url" });
      try {
        // Use standard device fetch (Node 18+)
        const response = await fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`, {
          headers: {
            'User-Agent': 'TymeeMusic/1.0.0 (https://github.com/gxenzy/tymeemusic)'
          }
        });
        if (!response.ok) throw new Error("Spotify error");
        const data = await response.json();
        res.json(data);
      } catch (e) {
        console.error("Spotify Proxy Error:", e.message, "URL:", url);
        res.status(500).json({ error: "Failed to fetch cover" });
      }
    });
    // Deploy slash commands (Admin only)
    this.app.post(
      "/api/admin/deploy-commands",
      this.authenticate.bind(this),
      async (req, res) => {
        try {
          const userId = this.getUserIdFromRequest(req);
          if (!config.ownerIds.includes(userId)) {
            return res.status(403).json({ error: "Forbidden. Bot owner only." });
          }

          const commands = this.client.commandHandler.getSlashCommandsData();
          if (!commands || commands.length === 0) {
            return res
              .status(400)
              .json({ error: "No slash-enabled commands found." });
          }

          const { REST } = await import("@discordjs/rest");
          const { Routes } = await import("discord-api-types/v10");
          const rest = new REST({ version: "10" }).setToken(config.token);

          await rest.put(Routes.applicationCommands(config.clientId), {
            body: commands,
          });

          logger.success(
            "WebServer",
            `Slash commands deployed by owner (${userId})`,
          );
          res.json({
            success: true,
            message: `Successfully registered ${commands.length} slash commands globally!`,
          });
        } catch (error) {
          logger.error("WebServer", "Error deploying commands:", error);
          res.status(500).json({ error: error.message });
        }
      },
    );
    // Get all active players (guilds with music playing)
    this.app.get(
      "/api/players",
      this.authenticate.bind(this),
      async (req, res) => {
        try {
          const players = [];
          const { PlayerManager } = await import("#managers/PlayerManager");
          if (this.client.music?.lavalink) {
            const allPlayers = this.client.music.lavalink.players;
            for (const [guildId, player] of allPlayers) {
              const pm = new PlayerManager(player);
              players.push(this.getPlayerState(pm, guildId));
            }
          }
          res.json({ players });
        } catch (error) {
          logger.error("WebServer", "Error getting players:", error);
          res.status(500).json({ error: "Internal server error" });
        }
      },
    );
    // Get player state for a specific guild
    this.app.get(
      "/api/player/:guildId",
      this.authenticate.bind(this),
      async (req, res) => {
        try {
          const { guildId } = req.params;
          const player = this.client.music?.getPlayer(guildId);
          if (!player) {
            const availablePlayers = this.client.music?.lavalink?.players ? [...this.client.music.lavalink.players.keys()] : [];
            logger.warn("WebServer", `GET /api/player/${guildId} - Player not found. Available: ${availablePlayers.join(', ')}`);
            return res
              .status(404)
              .json({ error: "No player found for this guild" });
          }
          const { PlayerManager } = await import("#managers/PlayerManager");
          const pm = new PlayerManager(player);
          res.json(this.getPlayerState(pm, guildId));
        } catch (error) {
          logger.error("WebServer", "Error getting player state:", error);
          res.status(500).json({ error: "Internal server error" });
        }
      },
    );
    // Control endpoints
    this.app.post(
      "/api/player/:guildId/play",
      express.json(), // Force JSON parsing
      this.authenticate.bind(this),
      async (req, res) => {
        try {
          const { guildId } = req.params;
          if (!await this.checkControlPermission(req, res, guildId)) return;

          if (!req.body) {
            return res.status(400).json({ error: "Missing request body" });
          }

          const { query, mode, userId } = req.body;
          let player = this.client.music?.getPlayer(guildId);

          // If no player exists and we have a query, try to create one
          if (!player && query) {
            const guild = this.client.guilds.cache.get(guildId);
            const memberId = userId || this.getUserIdFromRequest(req);
            const member = guild?.members.cache.get(memberId);

            if (!member?.voice?.channelId) {
              return res.status(400).json({ error: "You must be in a voice channel to start playing!" });
            }

            logger.info("WebServer", `Auto-creating player for ${guildId} to play ${query}`);
            player = await this.client.music.createPlayer({
              guildId,
              voiceChannelId: member.voice.channelId,
              // Use the voice channel as the text channel (Chat in Voice) to avoid spamming the main #chat
              textChannelId: member.voice.channelId || guild.systemChannelId || null,
              selfDeaf: true
            });

            if (player && !player.connected) await player.connect();
          } else if (player) {
            // Correctly update textChannelId and persist it for event listeners
            const guild = this.client.guilds.cache.get(guildId);
            const memberId = userId || this.getUserIdFromRequest(req);
            const member = guild?.members.cache.get(memberId);
            if (member?.voice?.channelId) {
              player.textChannelId = member.voice.channelId;
              player.set('nowPlayingChannelId', member.voice.channelId);
            }
          }

          if (!player) return res.status(404).json({ error: "No player found and could not create one. Are you in a voice channel?" });

          const { PlayerManager } = await import("#managers/PlayerManager");
          const pm = new PlayerManager(player);
          const channelId = pm.textChannelId || player.textId;
          const channel = channelId ? this.client.channels.cache.get(channelId) : null;

          if (query) {
            const result = await this.client.music.search(query, { requester: { id: 'WebDashboard' } });
            if (!result || !result.tracks.length) return res.status(404).json({ error: "No tracks found" });

            // For single track play, only use the first track
            const firstTrack = result.tracks[0];

            if (mode === 'queue') {
              // Add all tracks (for playlist links)
              await pm.addTracks(result.tracks);
              if (!pm.isPlaying && !pm.isPaused) {
                await pm.play({ track: firstTrack });
              }
              if (channel) EventUtils.sendTimedMessage(this.client, pm.textChannelId, `➕ **Added to queue:** ${result.tracks.length} track(s) via dashboard.`);
              res.json({ success: true, message: `Added ${result.tracks.length} track(s) to queue` });
            } else if (mode === 'play_now' || mode === 'next') {
              // Add single track to top of queue (play next)
              await pm.addTracks([firstTrack], 0);
              if (channel) EventUtils.sendTimedMessage(this.client, pm.textChannelId, `⏭️ **Playing Next:** ${firstTrack.info.title} (via Dashboard)`);
              res.json({ success: true, message: "Added to play next" });
            } else {
              // Default 'play' mode: Clear queue and play single track immediately
              await pm.clearQueue();
              // Don't add to queue, just play. play() sets it as current.
              // await pm.addTracks([firstTrack]); <-- Caused duplication
              await pm.play({ track: firstTrack });
              if (channel) EventUtils.sendTimedMessage(this.client, pm.textChannelId, `🎶 **Now Playing:** ${firstTrack.info.title} via dashboard.`);
              res.json({ success: true, message: "Playing now" });
            }
          } else {
            // No query - check if we should resume or start from queue
            if (player.paused) {
              await pm.resume();
              if (channel) EventUtils.sendTimedMessage(this.client, pm.textChannelId, `▶️ **Resumed playback** via dashboard.`);
              res.json({ success: true, message: "Playback resumed" });
            } else if (!player.playing && player.queue.tracks.length > 0) {
              // Idle with tracks in queue - start playing
              await pm.play();
              if (channel) EventUtils.sendTimedMessage(this.client, pm.textChannelId, `🎶 **Started playback** from queue via dashboard.`);
              res.json({ success: true, message: "Started playing from queue" });
            } else {
              res.json({ success: true, message: "Already playing or queue empty" });
            }
          }

          this.broadcastToGuild(guildId, {
            type: "state_update",
            data: this.getPlayerState(pm, guildId),
          });
        } catch (error) {
          logger.error("WebServer", "Error in play command:", error);
          res.status(500).json({ error: error.message });
        }
      },
    );
    this.app.post(
      "/api/player/:guildId/pause",
      this.authenticate.bind(this),
      async (req, res) => {
        try {
          const { guildId } = req.params;
          if (!await this.checkControlPermission(req, res, guildId)) return;
          const player = this.client.music?.getPlayer(guildId);
          if (!player) {
            const availablePlayers = this.client.music?.lavalink?.players ? [...this.client.music.lavalink.players.keys()] : [];
            logger.warn("WebServer", `POST /pause - Player not found for ${guildId}. Available: ${availablePlayers.join(', ')}`);
            return res.status(404).json({ error: "No player found" });
          }
          const { PlayerManager } = await import("#managers/PlayerManager");
          const pm = new PlayerManager(player);
          if (!player.paused) {
            await pm.pause();
            // Silent update - feedback is via the embed state update
          }
          this.broadcastToGuild(guildId, {
            type: "state_update",
            data: this.getPlayerState(pm, guildId),
          });
          res.json({ success: true, message: "Playback paused" });
        } catch (error) {
          res.status(500).json({ error: error.message });
        }
      },
    );
    // Skip track
    this.app.post(
      "/api/player/:guildId/skip",
      this.authenticate.bind(this),
      async (req, res) => {
        try {
          const { guildId } = req.params;
          if (!await this.checkControlPermission(req, res, guildId)) return;
          const player = this.client.music?.getPlayer(guildId);
          if (!player) {
            const availablePlayers = this.client.music?.lavalink?.players ? [...this.client.music.lavalink.players.keys()] : [];
            logger.warn("WebServer", `POST /skip - Player not found for ${guildId}. Available: ${availablePlayers.join(', ')}`);
            return res.status(404).json({ error: "No player found" });
          }
          const { PlayerManager } = await import("#managers/PlayerManager");

          // DEBUG: Log skip request details
          logger.warn("WebServer", `POST /skip request received for ${guildId} from IP: ${req.ip}, UA: ${req.headers['user-agent']}`);

          const pm = new PlayerManager(player);
          await pm.skip();

          sendFeedback(this.client, player, "⏭️ **Skipped** to the next track.");

          // Skip is handled silently - trackStart event will update the UI
          this.broadcastToGuild(guildId, {
            type: "state_update",
            data: this.getPlayerState(new PlayerManager(player), guildId),
          });
          res.json({ success: true, message: "Skipped to next track" });
        } catch (error) {
          res.status(500).json({ error: error.message });
        }
      },
    );
    // Previous track
    this.app.post(
      "/api/player/:guildId/previous",
      this.authenticate.bind(this),
      async (req, res) => {
        try {
          const { guildId } = req.params;
          if (!await this.checkControlPermission(req, res, guildId)) return;
          const player = this.client.music?.getPlayer(guildId);
          if (!player) return res.status(404).json({ error: "No player found" });
          const { PlayerManager } = await import("#managers/PlayerManager");
          const pm = new PlayerManager(player);
          const ok = await pm.playPrevious();

          // Send feedback to Discord
          if (ok) {
            sendFeedback(this.client, player, "⏮️ **Playing previous track** via dashboard.");
          }

          // Feedback via UI update
          this.broadcastToGuild(guildId, {
            type: "state_update",
            data: this.getPlayerState(new PlayerManager(player), guildId),
          });
          res.json({ success: ok, message: ok ? "Played previous track" : "No previous track" });
        } catch (error) {
          res.status(500).json({ error: error.message });
        }
      },
    );
    // Shuffle player queue
    this.app.post(
      "/api/player/:guildId/shuffle",
      this.authenticate.bind(this),
      async (req, res) => {
        try {
          const { guildId } = req.params;
          if (!await this.checkControlPermission(req, res, guildId)) return;
          const player = this.client.music?.getPlayer(guildId);
          if (!player) return res.status(404).json({ error: "No player found" });
          const { PlayerManager } = await import("#managers/PlayerManager");
          const pm = new PlayerManager(player);
          await pm.shuffleQueue();
          sendFeedback(this.client, player, "🔀 **Queue shuffled** via dashboard.");
          this.broadcastToGuild(guildId, {
            type: "state_update",
            data: this.getPlayerState(new PlayerManager(player), guildId),
          });
          res.json({ success: true, message: "Queue shuffled" });
        } catch (error) {
          res.status(500).json({ error: error.message });
        }
      },
    );
    // Toggle loop
    this.app.post(
      "/api/player/:guildId/loop",
      this.authenticate.bind(this),
      async (req, res) => {
        try {
          const { guildId } = req.params;
          if (!await this.checkControlPermission(req, res, guildId)) return;
          let { mode } = req.body;
          const player = this.client.music?.getPlayer(guildId);
          if (!player) return res.status(404).json({ error: "No player found" });
          const { PlayerManager } = await import("#managers/PlayerManager");
          const pm = new PlayerManager(player);
          const validModes = ["off", "track", "queue"];
          if (!mode || !validModes.includes(mode)) {
            const currentIndex = validModes.indexOf(pm.repeatMode || "off");
            mode = validModes[(currentIndex + 1) % validModes.length];
          }
          await pm.setRepeatMode(mode);
          sendFeedback(this.client, player, `🔁 **Loop mode set to:** ${mode} via dashboard.`);
          this.broadcastToGuild(guildId, {
            type: "state_update",
            data: this.getPlayerState(new PlayerManager(player), guildId),
          });
          res.json({ success: true, message: "Loop mode updated", repeatMode: mode });
        } catch (error) {
          res.status(500).json({ error: error.message });
        }
      },
    );
    // Set volume
    this.app.post(
      "/api/player/:guildId/volume",
      this.authenticate.bind(this),
      async (req, res) => {
        try {
          const { guildId } = req.params;
          if (!await this.checkControlPermission(req, res, guildId)) return;
          const { volume } = req.body;
          const player = this.client.music?.getPlayer(guildId);
          if (!player) return res.status(404).json({ error: "No player found" });
          const { PlayerManager } = await import("#managers/PlayerManager");
          const pm = new PlayerManager(player);
          await pm.setVolume(volume);
          sendFeedback(this.client, player, `🔊 **Volume set to ${volume}%** via dashboard.`);
          this.broadcastToGuild(guildId, {
            type: "state_update",
            data: this.getPlayerState(pm, guildId),
          });
          res.json({ success: true, message: "Volume set" });
        } catch (error) {
          res.status(500).json({ error: error.message });
        }
      },
    );

    // Clear guild stats
    this.app.delete(
      "/api/stats/:guildId/clear",
      this.authenticate.bind(this),
      async (req, res) => {
        try {
          const { guildId } = req.params;
          if (!await this.checkControlPermission(req, res, guildId)) return;

          if (this.client.db && this.client.db.stats) {
            this.client.db.stats.clearGuildStats(guildId);
            res.json({ success: true, message: "Server statistics cleared" });
          } else {
            res.status(501).json({ error: "Statistics system not available" });
          }
        } catch (error) {
          res.status(500).json({ error: error.message });
        }
      }
    );
    // Seek
    this.app.post(
      "/api/player/:guildId/seek",
      this.authenticate.bind(this),
      async (req, res) => {
        try {
          const { guildId } = req.params;
          if (!await this.checkControlPermission(req, res, guildId)) return;
          const { position } = req.body;
          const player = this.client.music?.getPlayer(guildId);
          if (!player) return res.status(404).json({ error: "No player found" });
          await player.seek(position);
          const { PlayerManager } = await import("#managers/PlayerManager");
          const pm = new PlayerManager(player);
          sendFeedback(this.client, player, `⏩ **Seeked playback** to ${pm.formatDuration(position)} via dashboard.`);
          this.broadcastToGuild(guildId, {
            type: "state_update",
            data: this.getPlayerState(pm, guildId),
          });
          res.json({ success: true, message: "Seeked to position" });
        } catch (error) {
          res.status(500).json({ error: error.message });
        }
      },
    );

    this.app.post(
      "/api/player/:guildId/reset",
      this.authenticate.bind(this),
      async (req, res) => {
        try {
          const { guildId } = req.params;
          if (!await this.checkControlPermission(req, res, guildId)) return;

          const player = this.client.music?.getPlayer(guildId);
          if (player) {
            // Save state if possible
            const voiceId = player.voiceChannelId;
            const textId = player.textChannelId;

            player.destroy();

            // Wait a moment and recreate
            setTimeout(async () => {
              await this.client.music.createPlayer({
                guildId,
                voiceChannelId: voiceId,
                textChannelId: textId,
                selfDeaf: true
              });
            }, 1000);
          }

          res.json({ success: true, message: "Player reset initiated" });
        } catch (error) {
          res.status(500).json({ error: error.message });
        }
      }
    );

    this.app.get(
      "/api/player/:guildId/filters",
      this.authenticate.bind(this),
      async (req, res) => {
        try {
          const { guildId } = req.params;
          const player = this.client.music?.getPlayer(guildId);
          if (!player) return res.status(404).json({ error: "No player found" });

          res.json({
            available: filters,
            active: player.filterManager?.data || {},
            activeFilterName: player.lastFilterName || null
          });
        } catch (error) {
          res.status(500).json({ error: error.message });
        }
      }
    );

    this.app.post(
      "/api/player/:guildId/filters/:filter",
      this.authenticate.bind(this),
      async (req, res) => {
        try {
          const { guildId, filter } = req.params;
          if (!await this.checkControlPermission(req, res, guildId)) return;
          const player = this.client.music?.getPlayer(guildId);
          if (!player) return res.status(404).json({ error: "No player found" });

          const filterData = filters[filter];
          if (!filterData) return res.status(400).json({ error: "Invalid filter" });

          // Apply filters using filterManager
          if (player.filterManager) {
            // Super Nuclear Reset: Wipe every piece of internal state
            const fm = player.filterManager;
            const props = ['equalizer', 'timescale', 'karaoke', 'tremolo', 'vibrato', 'distortion', 'rotation', 'channelMix', 'lowPass'];
            props.forEach(p => {
              try {
                if (p === 'equalizer') fm[p] = [];
                else fm[p] = null;
              } catch (e) { }
            });
            if (fm.data) fm.data = {};
            // THIS IS THE KEY FIX: Clear the separate equalizerBands array!
            if (fm.equalizerBands) fm.equalizerBands = [];

            // Ensure timescale is 1.0 explicitly
            if (fm.setSpeed) await fm.setSpeed(1.0);
            if (fm.setPitch) await fm.setPitch(1.0);
            if (fm.setRate) await fm.setRate(1.0);

            // Send clear packet to Lavalink
            if (typeof player.setFilters === "function") {
              await player.setFilters({});
            } else {
              await fm.resetFilters();
            }

            if (Array.isArray(filterData)) {
              if (player.filterManager.setEQ) await player.filterManager.setEQ(filterData);
            } else {
              if (filterData.timescale) {
                const { speed, pitch, rate } = filterData.timescale;
                if (speed && player.filterManager.setSpeed) await player.filterManager.setSpeed(speed);
                if (pitch && player.filterManager.setPitch) await player.filterManager.setPitch(pitch);
                if (rate && player.filterManager.setRate) await player.filterManager.setRate(rate);
              }
              if (filterData.eq && player.filterManager.setEQ) {
                await player.filterManager.setEQ(filterData.eq);
              }
            }
          }

          player.lastFilterName = filter;

          const { PlayerManager } = await import("#managers/PlayerManager");
          const pm = new PlayerManager(player);

          sendFeedback(this.client, player, `🎛️ **Audio filter applied:** ${filter} via dashboard.`);

          // Broadcast the update immediately
          this.broadcastToGuild(guildId, {
            type: "state_update",
            data: this.getPlayerState(pm, guildId),
          });

          res.json({ success: true, message: `Filter ${filter} applied` });
        } catch (error) {
          res.status(500).json({ error: error.message });
        }
      },
    );

    this.app.delete(
      "/api/player/:guildId/filters",
      this.authenticate.bind(this),
      async (req, res) => {
        try {
          const { guildId } = req.params;
          logger.info("WebServer", `[Filters] Resetting all filters for guild: ${guildId}`);
          if (!await this.checkControlPermission(req, res, guildId)) return;
          const player = this.client.music?.getPlayer(guildId);
          if (!player) return res.status(404).json({ error: "No player found" });

          // Super Nuclear Reset for DELETE endpoint
          if (player.filterManager) {
            const fm = player.filterManager;
            const props = ['equalizer', 'timescale', 'karaoke', 'tremolo', 'vibrato', 'distortion', 'rotation', 'channelMix', 'lowPass'];
            props.forEach(p => {
              try {
                if (p === 'equalizer') fm[p] = [];
                else fm[p] = null;
              } catch (e) { }
            });
            if (fm.data) fm.data = {};
            // THIS IS THE KEY FIX: Clear the separate equalizerBands array!
            if (fm.equalizerBands) fm.equalizerBands = [];

            if (fm.setSpeed) await fm.setSpeed(1.0);
            if (fm.setPitch) await fm.setPitch(1.0);
            if (fm.setRate) await fm.setRate(1.0);

            if (typeof player.setFilters === "function") {
              await player.setFilters({});
            } else {
              await fm.resetFilters();
            }
          }

          player.lastFilterName = null;

          const { PlayerManager } = await import("#managers/PlayerManager");
          const pm = new PlayerManager(player);

          sendFeedback(this.client, player, "🎛️ **Audio filters reset** via dashboard.");

          // Broadcast the reset immediately
          this.broadcastToGuild(guildId, {
            type: "state_update",
            data: this.getPlayerState(pm, guildId),
          });

          res.json({ success: true, message: "Filters reset" });
        } catch (error) {
          res.status(500).json({ error: error.message });
        }
      },
    );
    // Stop
    this.app.post(
      "/api/player/:guildId/stop",
      this.authenticate.bind(this),
      async (req, res) => {
        try {
          const { guildId } = req.params;
          if (!await this.checkControlPermission(req, res, guildId)) return;
          const player = this.client.music?.getPlayer(guildId);
          if (!player) return res.status(404).json({ error: "No player found" });
          const { PlayerManager } = await import("#managers/PlayerManager");
          const pm = new PlayerManager(player);
          await pm.stop();
          sendFeedback(this.client, player, "⏹️ **Playback stopped** via dashboard.");
          this.broadcastToGuild(guildId, {
            type: "state_update",
            data: this.getPlayerState(pm, guildId),
          });
          res.json({ success: true, message: "Playback stopped" });
        } catch (error) {
          res.status(500).json({ error: error.message });
        }
      },
    );
    // Sleep Timer Endpoint
    this.app.post(
      "/api/player/:guildId/sleep",
      this.authenticate.bind(this),
      async (req, res) => {
        try {
          const { guildId } = req.params;
          if (!await this.checkControlPermission(req, res, guildId)) return;
          const { minutes } = req.body;
          const player = this.client.music?.getPlayer(guildId);
          if (!player) return res.status(404).json({ error: "No player found" });
          const expireAt = player.setSleepTimer(minutes, this.client);
          if (minutes > 0) sendFeedback(this.client, player, `⏰ **Sleep timer set for ${minutes} minutes** via dashboard.`);
          else sendFeedback(this.client, player, "⏰ **Sleep timer cancelled** via dashboard.");
          this.broadcastToGuild(guildId, {
            type: "state_update",
            data: this.getPlayerState(new (await import("#managers/PlayerManager")).PlayerManager(player), guildId),
          });
          res.json({ success: true, expireAt });
        } catch (error) {
          res.status(500).json({ error: error.message });
        }
      }
    );
    // Lyrics Endpoint
    this.app.get(
      "/api/player/:guildId/lyrics",
      this.authenticate.bind(this),
      async (req, res) => {
        try {
          const { guildId } = req.params;
          const player = this.client.music?.getPlayer(guildId);
          if (!player) return res.status(404).json({ error: "No player found" });
          const lyrics = await player.getCurrentLyrics();
          res.json(lyrics || { error: "No lyrics found" });
        } catch (error) {
          res.status(500).json({ error: error.message });
        }
      }
    );
    // Get queue
    this.app.get(
      "/api/player/:guildId/queue",
      this.authenticate.bind(this),
      async (req, res) => {
        try {
          const { guildId } = req.params;
          const player = this.client.music?.getPlayer(guildId);
          if (!player) {
            return res.json({ queue: [] });
          }

          logger.info('WebServer', `[QueueAPI] Fetching queue for ${guildId}. Length: ${player.queue.tracks.length}`);

          const queue = player.queue.tracks.map((track, index) => ({
            title: track.info?.title || "Unknown",
            author: track.info?.author || "Unknown",
            duration: track.info?.duration || 0,
            artworkUrl: track.info?.artworkUrl || track.pluginInfo?.artworkUrl,
            uri: track.info?.uri,
          }));
          res.json({ queue });
        } catch (error) {
          logger.error("WebServer", "Error getting queue:", error);
          res.status(500).json({ error: error.message });
        }
      },
    );
    // Add track to queue
    this.app.post(
      "/api/player/:guildId/queue",
      this.authenticate.bind(this),
      async (req, res) => {
        try {
          const { guildId } = req.params;
          if (!await this.checkControlPermission(req, res, guildId)) return;
          const player = this.client.music?.getPlayer(guildId);
          if (!player) {
            return res.status(404).json({ error: "No player found" });
          }
          const data = req.body;
          const tracksToAdd = Array.isArray(data) ? data : [data];

          // Process tracks - for Spotify tracks, search using the URI for proper resolution
          const processedTracks = [];
          for (const trackData of tracksToAdd) {
            const info = trackData.info || trackData;
            const uri = info.uri || info.identifier;

            // If it's a Spotify track, re-search to get proper encoding
            if (uri && (uri.includes('spotify.com') || info.sourceName === 'spotify')) {
              try {
                const searchResult = await this.client.music.search(uri);
                if (searchResult && searchResult.tracks && searchResult.tracks.length > 0) {
                  processedTracks.push(searchResult.tracks[0]);
                  continue;
                }
              } catch (e) {
                logger.warn("WebServer", `[QueueAPI] Failed to re-search Spotify track: ${e.message}`);
              }
            }

            // For tracks with ISRC, search using ISRC for accurate matching
            if (info.isrc || trackData.isrc) {
              const isrc = info.isrc || trackData.isrc;
              try {
                const searchResult = await this.client.music.search(`ytsearch:"${isrc}"`);
                if (searchResult && searchResult.tracks && searchResult.tracks.length > 0) {
                  // Find best duration match
                  const targetDuration = info.length || info.duration || 0;
                  let bestTrack = searchResult.tracks[0];
                  if (targetDuration > 0) {
                    for (const t of searchResult.tracks) {
                      const diff = Math.abs((t.info?.length || t.info?.duration || 0) - targetDuration);
                      if (diff < 30000) { // Within 30 seconds
                        bestTrack = t;
                        break;
                      }
                    }
                  }
                  processedTracks.push(bestTrack);
                  continue;
                }
              } catch (e) {
                logger.warn("WebServer", `[QueueAPI] ISRC search failed: ${e.message}`);
              }
            }

            // Fallback: search by title and author
            if (info.title && info.author) {
              try {
                const query = `${info.title} ${info.author}`;
                const searchResult = await this.client.music.search(query);
                if (searchResult && searchResult.tracks && searchResult.tracks.length > 0) {
                  // Find best duration match to avoid compilations
                  const targetDuration = info.length || info.duration || 0;
                  let bestTrack = searchResult.tracks[0];
                  let bestDiff = Infinity;

                  if (targetDuration > 0) {
                    for (const t of searchResult.tracks) {
                      const tDuration = t.info?.length || t.info?.duration || 0;
                      const diff = Math.abs(tDuration - targetDuration);
                      // Prefer tracks within 30s of expected duration
                      if (diff < bestDiff && diff < 60000) {
                        bestDiff = diff;
                        bestTrack = t;
                      }
                    }
                  }

                  processedTracks.push(bestTrack);
                  continue;
                }
              } catch (e) {
                logger.warn("WebServer", `[QueueAPI] Title search failed: ${e.message}`);
              }
            }

            // Last resort: add the raw track data
            processedTracks.push(trackData);
          }

          if (processedTracks.length > 0) {
            player.queue.add(processedTracks);
            logger.info("WebServer", `[QueueAPI] Added ${processedTracks.length} tracks to ${guildId}`);
          }

          const queue = player.queue.tracks.map((t, index) => ({
            title: t.info?.title || "Unknown",
            author: t.info?.author || "Unknown",
            duration: t.info?.duration || t.info?.length || 0,
            artworkUrl: t.info?.artworkUrl || t.pluginInfo?.artworkUrl,
            uri: t.info?.uri,
          }));
          this.broadcastToGuild(guildId, { type: "queue_update", queue });
          res.json({ success: true, queue });
        } catch (error) {
          logger.error("WebServer", "Error adding track to queue:", error);
          res.status(500).json({ error: error.message });
        }
      },
    );

    // Shuffle queue
    this.app.post(
      "/api/queue/:guildId/shuffle",
      this.authenticate.bind(this),
      async (req, res) => {
        try {
          const { guildId } = req.params;
          if (!await this.checkControlPermission(req, res, guildId)) return;
          const player = this.client.music?.getPlayer(guildId);
          if (!player) {
            return res.status(404).json({ error: "No player found" });
          }
          const { PlayerManager } = await import("#managers/PlayerManager");
          const pm = new PlayerManager(player);
          await pm.shuffleQueue();
          const queue = player.queue.tracks.map((track, index) => ({
            title: track.info?.title || "Unknown",
            author: track.info?.author || "Unknown",
            duration: track.info?.duration || 0,
            artworkUrl: track.info?.artworkUrl || track.pluginInfo?.artworkUrl,
            uri: track.info?.uri,
          }));
          this.broadcastToGuild(guildId, {
            type: "state_update",
            data: this.getPlayerState(pm, guildId),
          });
          this.broadcastToGuild(guildId, { type: "queue_update", queue });
          res.json({ success: true, message: "Queue shuffled" });
        } catch (error) {
          logger.error("WebServer", "Error shuffling queue:", error);
          res.status(500).json({ error: error.message });
        }
      },
    );

    // Shuffle Preview - see what the shuffled order would look like without committing
    this.app.get(
      "/api/queue/:guildId/shuffle-preview",
      this.authenticate.bind(this),
      async (req, res) => {
        try {
          const { guildId } = req.params;
          const player = this.client.music?.getPlayer(guildId);
          if (!player) {
            return res.status(404).json({ error: "No player found" });
          }
          const { PlayerManager } = await import("#managers/PlayerManager");
          const pm = new PlayerManager(player);
          const preview = pm.queue.shufflePreview();
          res.json({ success: true, preview });
        } catch (error) {
          logger.error("WebServer", "Error generating shuffle preview:", error);
          res.status(500).json({ error: error.message });
        }
      },
    );

    // Check for duplicates before adding tracks
    this.app.post(
      "/api/queue/:guildId/check-duplicates",
      this.authenticate.bind(this),
      async (req, res) => {
        try {
          const { guildId } = req.params;
          const { identifiers } = req.body; // Array of track identifiers to check

          if (!Array.isArray(identifiers)) {
            return res.status(400).json({ error: "identifiers must be an array" });
          }

          const player = this.client.music?.getPlayer(guildId);
          if (!player) {
            return res.json({ duplicates: [], allNew: true });
          }

          // Build set of existing identifiers
          const existingIds = new Set();
          if (player.queue.current?.info?.identifier) {
            existingIds.add(player.queue.current.info.identifier);
          }
          player.queue.tracks.forEach(t => {
            if (t.info?.identifier) existingIds.add(t.info.identifier);
          });

          const duplicates = identifiers.filter(id => existingIds.has(id));
          const newTracks = identifiers.filter(id => !existingIds.has(id));

          res.json({
            duplicates,
            newTracks,
            allNew: duplicates.length === 0,
            allDuplicates: newTracks.length === 0
          });
        } catch (error) {
          logger.error("WebServer", "Error checking duplicates:", error);
          res.status(500).json({ error: error.message });
        }
      },
    );

    // Clear queue
    this.app.delete(
      "/api/queue/:guildId",
      this.authenticate.bind(this),
      async (req, res) => {
        try {
          const { guildId } = req.params;
          if (!await this.checkControlPermission(req, res, guildId)) return;
          const player = this.client.music?.getPlayer(guildId);
          if (!player) {
            return res.status(404).json({ error: "No player found" });
          }
          const { PlayerManager } = await import("#managers/PlayerManager");
          const pm = new PlayerManager(player);
          await pm.clearQueue();
          this.broadcastToGuild(guildId, {
            type: "state_update",
            data: this.getPlayerState(pm, guildId),
          });
          this.broadcastToGuild(guildId, { type: "queue_update", queue: [] });
          res.json({ success: true, message: "Queue cleared" });
        } catch (error) {
          logger.error("WebServer", "Error clearing queue:", error);
          res.status(500).json({ error: error.message });
        }
      },
    );
    this.app.delete(
      "/api/queue/:guildId/:position",
      this.authenticate.bind(this),
      async (req, res) => {
        try {
          const { guildId, position } = req.params;
          if (!await this.checkControlPermission(req, res, guildId)) return;
          const pos = parseInt(position, 10);
          if (isNaN(pos) || pos < 0) {
            return res.status(400).json({ error: "Invalid position" });
          }
          const player = this.client.music?.getPlayer(guildId);
          if (!player) {
            return res.status(404).json({ error: "No player found" });
          }
          const { PlayerManager } = await import("#managers/PlayerManager");
          const pm = new PlayerManager(player);
          await pm.removeTrack(pos);
          const queue = player.queue.tracks.map((track, index) => ({
            title: track.info?.title || "Unknown",
            author: track.info?.author || "Unknown",
            duration: track.info?.duration || 0,
            artworkUrl: track.info?.artworkUrl || track.pluginInfo?.artworkUrl,
            uri: track.info?.uri,
          }));
          this.broadcastToGuild(guildId, {
            type: "state_update",
            data: this.getPlayerState(pm, guildId),
          });
          this.broadcastToGuild(guildId, { type: "queue_update", queue });
          res.json({ success: true, message: "Track removed" });
        } catch (error) {
          logger.error("WebServer", "Error removing track:", error);
          res.status(500).json({ error: error.message });
        }
      },
    );

    // Move track in queue (for drag-and-drop reordering)
    this.app.post(
      "/api/queue/:guildId/move",
      this.authenticate.bind(this),
      async (req, res) => {
        try {
          const { guildId } = req.params;
          const { from, to } = req.body;

          if (!await this.checkControlPermission(req, res, guildId)) return;

          if (typeof from !== 'number' || typeof to !== 'number') {
            return res.status(400).json({ error: "Invalid from/to positions" });
          }

          const player = this.client.music?.getPlayer(guildId);
          if (!player) {
            return res.status(404).json({ error: "No player found" });
          }

          const tracks = player.queue.tracks;
          if (from < 0 || from >= tracks.length || to < 0 || to >= tracks.length) {
            return res.status(400).json({ error: "Position out of bounds" });
          }

          // Remove track from old position and insert at new position
          const [movedTrack] = tracks.splice(from, 1);
          tracks.splice(to, 0, movedTrack);

          const queue = tracks.map((track, index) => ({
            title: track.info?.title || "Unknown",
            author: track.info?.author || "Unknown",
            duration: track.info?.duration || 0,
            artworkUrl: track.info?.artworkUrl || track.pluginInfo?.artworkUrl,
            uri: track.info?.uri,
          }));

          const { PlayerManager } = await import("#managers/PlayerManager");
          const pm = new PlayerManager(player);

          this.broadcastToGuild(guildId, {
            type: "state_update",
            data: this.getPlayerState(pm, guildId),
          });
          this.broadcastToGuild(guildId, { type: "queue_update", queue });

          const channel = this.client.channels.cache.get(player.textChannelId);
          if (channel) EventUtils.sendTimedMessage(this.client, player.textChannelId, `🔀 Track moved in queue via dashboard.`);

          res.json({ success: true, message: "Track moved", queue });
        } catch (error) {
          logger.error("WebServer", "Error moving track:", error);
          res.status(500).json({ error: error.message });
        }
      },
    );

    // Play next (insert track at position 0)
    this.app.post(
      "/api/queue/:guildId/playnext",
      this.authenticate.bind(this),
      async (req, res) => {
        try {
          const { guildId } = req.params;
          const { query, source } = req.body;

          if (!await this.checkControlPermission(req, res, guildId)) return;

          const player = this.client.music?.getPlayer(guildId);
          if (!player) {
            return res.status(404).json({ error: "No player found" });
          }

          // Search for the track
          const searchPlatform = source || "ytsearch";
          const searchQuery = query.startsWith("http") ? query : `${searchPlatform}:${query}`;
          const result = await this.client.music.lavalink.search({
            query: searchQuery,
            source: searchPlatform,
          }, player.get("requester") || { id: "dashboard", username: "Dashboard" });

          if (!result.tracks || result.tracks.length === 0) {
            return res.status(404).json({ error: "No tracks found" });
          }

          const track = result.tracks[0];

          // Insert at position 0 (play next)
          player.queue.tracks.unshift(track);

          const queue = player.queue.tracks.map((t, index) => ({
            title: t.info?.title || "Unknown",
            author: t.info?.author || "Unknown",
            duration: t.info?.duration || 0,
            artworkUrl: t.info?.artworkUrl || t.pluginInfo?.artworkUrl,
            uri: t.info?.uri,
          }));

          const { PlayerManager } = await import("#managers/PlayerManager");
          const pm = new PlayerManager(player);

          this.broadcastToGuild(guildId, {
            type: "state_update",
            data: this.getPlayerState(pm, guildId),
          });
          this.broadcastToGuild(guildId, { type: "queue_update", queue });

          const channel = this.client.channels.cache.get(player.textChannelId);
          if (channel) EventUtils.sendTimedMessage(this.client, player.textChannelId, `⏭️ **${track.info?.title}** will play next (added via dashboard).`);

          res.json({
            success: true,
            message: "Track will play next",
            track: {
              title: track.info?.title,
              author: track.info?.author,
              duration: track.info?.duration,
              artworkUrl: track.info?.artworkUrl,
            }
          });
        } catch (error) {
          logger.error("WebServer", "Error adding play next track:", error);
          res.status(500).json({ error: error.message });
        }
      },
    );
    // ============ EMOJI MANAGEMENT ENDPOINTS ============
    // Get all emoji mappings for a guild
    this.app.get(
      "/api/emojis/:guildId",
      this.authenticate.bind(this),
      async (req, res) => {
        try {
          const { guildId } = req.params;
          const EmojiManager = (await import("#managers/EmojiManager")).default;
          if (!this.emojiManager) {
            this.emojiManager = new EmojiManager(this.client);
          }
          const mappings = await this.emojiManager.getAllEmojis(guildId);
          res.json(mappings);
        } catch (error) {
          logger.error("WebServer", "Error getting emoji mappings:", error);
          res.status(500).json({ error: error.message });
        }
      },
    );
    // Get emoji categories
    this.app.get(
      "/api/emojis/categories",
      this.authenticate.bind(this),
      async (req, res) => {
        try {
          const EmojiManager = (await import("#managers/EmojiManager")).default;
          if (!this.emojiManager) {
            this.emojiManager = new EmojiManager(this.client);
          }
          const categories = this.emojiManager.getCategories();
          res.json(categories);
        } catch (error) {
          logger.error("WebServer", "Error getting emoji categories:", error);
          res.status(500).json({ error: error.message });
        }
      },
    );
    // Get server emojis (all emojis in the guild)
    this.app.get(
      "/api/emojis/:guildId/server",
      this.authenticate.bind(this),
      async (req, res) => {
        try {
          const { guildId } = req.params;
          const EmojiManager = (await import("#managers/EmojiManager")).default;
          if (!this.emojiManager) {
            this.emojiManager = new EmojiManager(this.client);
          }
          const serverEmojis = await this.emojiManager.getServerEmojis(guildId);
          res.json(serverEmojis);
        } catch (error) {
          logger.error("WebServer", "Error getting server emojis:", error);
          res.status(500).json({ error: error.message });
        }
      },
    );
    // Get auto-sync preview
    this.app.get(
      "/api/emojis/:guildId/sync/preview",
      this.authenticate.bind(this),
      async (req, res) => {
        try {
          const { guildId } = req.params;
          const EmojiManager = (await import("#managers/EmojiManager")).default;
          if (!this.emojiManager) {
            this.emojiManager = new EmojiManager(this.client);
          }
          const preview = await this.emojiManager.getAutoSyncPreview(guildId);
          res.json(preview);
        } catch (error) {
          logger.error("WebServer", "Error getting sync preview:", error);
          res.status(500).json({ error: error.message });
        }
      },
    );

    // Sync server emojis (refresh from Discord)
    this.app.post(
      "/api/emojis/:guildId/sync/server",
      this.authenticate.bind(this),
      async (req, res) => {
        try {
          const { guildId } = req.params;
          const EmojiManager = (await import("#managers/EmojiManager")).default;
          if (!this.emojiManager) {
            this.emojiManager = new EmojiManager(this.client);
          }
          await this.emojiManager.syncGuild(guildId);
          // Return the fresh list
          const serverEmojis = await this.emojiManager.getServerEmojis(guildId);
          res.json({ success: true, serverEmojis });
        } catch (error) {
          logger.error("WebServer", "Error syncing server emojis:", error);
          res.status(500).json({ error: error.message });
        }
      },
    );

    // Auto-sync emojis
    this.app.post(
      "/api/emojis/:guildId/sync",
      this.authenticate.bind(this),
      async (req, res) => {
        try {
          const { guildId } = req.params;
          const EmojiManager = (await import("#managers/EmojiManager")).default;
          if (!this.emojiManager) {
            this.emojiManager = new EmojiManager(this.client);
          }
          const result = await this.emojiManager.autoSyncEmojis(guildId);
          const mappings = await this.emojiManager.getAllEmojis(guildId);
          res.json({ success: true, ...result, mappings });
        } catch (error) {
          logger.error("WebServer", "Error syncing emojis:", error);
          res.status(500).json({ error: error.message });
        }
      },
    );
    // Create/update emoji mapping
    this.app.put(
      "/api/emojis/:guildId",
      this.authenticate.bind(this),
      async (req, res) => {
        try {
          const { guildId } = req.params;
          const {
            botName,
            emojiId,
            emojiUrl,
            emojiName,
            isAnimated,
            fallback,
            category,
          } = req.body;
          if (!botName) {
            return res.status(400).json({ error: "botName is required" });
          }
          const EmojiManager = (await import("#managers/EmojiManager")).default;
          if (!this.emojiManager) {
            this.emojiManager = new EmojiManager(this.client);
          }
          const emoji = await this.emojiManager.addEmoji(guildId, botName, {
            discordName: emojiName || botName,
            emojiId: emojiId || null,
            emojiUrl: emojiUrl || null,
            isAnimated: isAnimated || false,
            fallback: fallback || this.emojiManager.getDefaultEmoji(botName),
            category:
              category || this.emojiManager.getCategoryForEmoji(botName),
          });
          // Refresh Discord player UI if player exists
          const player = this.client.music?.getPlayer(guildId);
          if (player) {
            const { PlayerManager } = await import("#managers/PlayerManager");
            const pm = new PlayerManager(player);
            // We simulate what updatePlayerMessageEmbed does in PlayerbuttonsHandler
            const messageId = player.get('nowPlayingMessageId');
            const channelId = player.get('nowPlayingChannelId');
            if (messageId && channelId) {
              const guild = this.client.guilds.cache.get(guildId);
              const channel = guild?.channels.cache.get(channelId);
              if (channel) {
                const embed = await DiscordPlayerEmbed.createPlayerEmbedAsync(pm, guild, player.position, this.client);
                const message = await channel.messages.fetch(messageId).catch(() => null);
                if (message) await message.edit({ embeds: [embed] }).catch(() => { });
              }
            }
          }
          res.json({ success: true, emoji });
        } catch (error) {
          logger.error("WebServer", "Error setting emoji mapping:", error);
          res.status(500).json({ error: error.message });
        }
      },
    );
    // Remove emoji mapping
    this.app.delete(
      "/api/emojis/:guildId/:botName",
      this.authenticate.bind(this),
      async (req, res) => {
        try {
          const { guildId, botName } = req.params;
          const EmojiManager = (await import("#managers/EmojiManager")).default;
          if (!this.emojiManager) {
            this.emojiManager = new EmojiManager(this.client);
          }
          await this.emojiManager.removeEmoji(guildId, botName);
          res.json({ success: true, message: "Emoji mapping removed" });
        } catch (error) {
          logger.error("WebServer", "Error removing emoji mapping:", error);
          res.status(500).json({ error: error.message });
        }
      },
    );
    // Reset all emojis to defaults
    this.app.post(
      "/api/emojis/:guildId/reset",
      this.authenticate.bind(this),
      async (req, res) => {
        try {
          const { guildId } = req.params;
          const EmojiManager = (await import("#managers/EmojiManager")).default;
          if (!this.emojiManager) {
            this.emojiManager = new EmojiManager(this.client);
          }
          await this.emojiManager.resetEmojis(guildId);
          const mappings = await this.emojiManager.getAllEmojis(guildId);
          res.json({ success: true, mappings });
        } catch (error) {
          logger.error("WebServer", "Error resetting emojis:", error);
          res.status(500).json({ error: error.message });
        }
      },
    );
    // Get default emojis by category
    this.app.get(
      "/api/emojis/defaults",
      this.authenticate.bind(this),
      async (req, res) => {
        try {
          const EmojiManager = (await import("#managers/EmojiManager")).default;
          if (!this.emojiManager) {
            this.emojiManager = new EmojiManager(this.client);
          }
          const defaults = this.emojiManager.getDefaultEmojisByCategory();
          res.json(defaults);
        } catch (error) {
          logger.error("WebServer", "Error getting default emojis:", error);
          res.status(500).json({ error: error.message });
        }
      },
    );
    // ============ PLAYLISTS ENDPOINTS ============
    // Get all playlists for user/guild
    this.app.get(
      "/api/playlists/:guildId",
      this.authenticate.bind(this),
      async (req, res) => {
        try {
          const { guildId } = req.params;
          // Parse cookies to get userId
          const cookies = {};
          const cookieHeader = req.headers.cookie;
          if (cookieHeader) {
            cookieHeader.split(";").forEach((cookie) => {
              const parts = cookie.trim().split("=");
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
          console.log("Loading playlists for userId:", userId);
          const { db } = await import("#database/DatabaseManager");
          // Get playlists by userId
          let playlists = userId
            ? db.playlists.getAllPlaylists(guildId, userId)
            : [];
          // If no playlists found and userId is null, get all playlists for this guild
          if ((!playlists || playlists.length === 0) && !userId) {
            console.log("No userId, fetching all playlists for guild");
            playlists = db.playlists.getAllPlaylists(guildId, null);
          }
          console.log("Found playlists:", playlists?.length || 0);

          // Transform snake_case to camelCase for frontend
          const transformedPlaylists = (playlists || []).map(pl => ({
            ...pl,
            trackCount: pl.track_count || pl.trackCount || 0,
            isPublic: Boolean(pl.is_public || pl.isPublic),
            totalDuration: pl.total_duration || pl.totalDuration || 0,
            coverImage: pl.cover_image || pl.coverImage || null,
            createdAt: pl.created_at || pl.createdAt,
            updatedAt: pl.updated_at || pl.updatedAt,
            userId: pl.user_id || pl.userId,
          }));

          res.json(transformedPlaylists);
        } catch (error) {
          logger.error("WebServer", "Error getting playlists:", error);
          res.status(500).json({ error: error.message });
        }
      },
    );
    // Get single playlist
    this.app.get(
      "/api/playlists/:guildId/:playlistId",
      this.authenticate.bind(this),
      async (req, res) => {
        try {
          const { guildId, playlistId } = req.params;
          // Get userId for access validation
          const userId = this.getUserIdFromRequest(req);
          const { db } = await import("#database/DatabaseManager");
          const playlist = db.playlists.getPlaylist(playlistId);
          if (!playlist) {
            return res.status(404).json({ error: "Playlist not found" });
          }
          // Check access - user can only access their own playlists
          if (playlist.user_id !== userId) {
            return res.status(403).json({ error: "Access denied" });
          }

          // Transform snake_case to camelCase for frontend
          const transformedPlaylist = {
            ...playlist,
            trackCount: playlist.track_count || playlist.trackCount || 0,
            isPublic: Boolean(playlist.is_public || playlist.isPublic),
            totalDuration: playlist.total_duration || playlist.totalDuration || 0,
            coverImage: playlist.cover_image || playlist.coverImage || null,
            createdAt: playlist.created_at || playlist.createdAt,
            updatedAt: playlist.updated_at || playlist.updatedAt,
            userId: playlist.user_id || playlist.userId,
          };

          res.json(transformedPlaylist);
        } catch (error) {
          logger.error("WebServer", "Error getting playlist:", error);
          res.status(500).json({ error: error.message });
        }
      },
    );
    // Create playlist
    this.app.post(
      "/api/playlists/:guildId",
      this.authenticate.bind(this),
      async (req, res) => {
        try {
          const { guildId } = req.params;
          const { name, description, isPublic, coverImage, localUserId } =
            req.body;
          // Parse cookies to get userId from auth token
          const cookies = {};
          const cookieHeader = req.headers.cookie;
          if (cookieHeader) {
            cookieHeader.split(";").forEach((cookie) => {
              const parts = cookie.trim().split("=");
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
            return res.status(400).json({ error: "Playlist name is required" });
          }
          if (!userId) {
            return res.status(400).json({ error: "User ID is required" });
          }
          console.log("Creating playlist - userId:", userId, "name:", name);
          const { db } = await import("#database/DatabaseManager");
          // Note: createPlaylist takes (userId, name, description, isPublic, coverImage) - no guildId
          const playlistId = db.playlists.createPlaylist(
            userId,
            name,
            description,
            isPublic,
            coverImage,
          );
          const playlist = db.playlists.getPlaylist(playlistId);
          res.json({ success: true, playlist });
        } catch (error) {
          logger.error("WebServer", "Error creating playlist:", error);
          res.status(500).json({ error: error.message });
        }
      },
    );
    // Add track to playlist
    this.app.post(
      "/api/playlists/:guildId/:playlistId/tracks",
      this.authenticate.bind(this),
      async (req, res) => {
        try {
          const { guildId, playlistId } = req.params;
          const { track, position } = req.body;
          if (!track) {
            return res.status(400).json({ error: "Track data is required" });
          }
          const userId = this.getUserIdFromRequest(req);
          if (!userId) {
            return res.status(400).json({ error: "User ID is required" });
          }
          const { db } = await import("#database/DatabaseManager");
          // If position is specified, insert at that position
          if (typeof position === "number" && position >= 0) {
            const playlist = db.playlists.getPlaylist(playlistId);
            if (!playlist) {
              return res.status(404).json({ error: "Playlist not found" });
            }
            let tracks = playlist.tracks || [];
            // Insert track at position
            tracks.splice(position, 0, {
              identifier: track.identifier,
              title: track.title || "Unknown Track",
              author: track.author || "Unknown",
              album: track.album || null,
              uri: track.uri || null,
              duration: track.duration || null,
              sourceName: track.sourceName || null,
              artworkUrl: track.artworkUrl || null,
              isExplicit: track.isExplicit || false,
              addedAt: Date.now(),
            });
            const totalDuration = tracks.reduce(
              (sum, t) => sum + (t.duration || 0),
              0,
            );
            db.playlists.exec(
              `
            UPDATE playlists
            SET tracks = ?, total_duration = ?, track_count = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `,
              [
                JSON.stringify(tracks),
                totalDuration,
                tracks.length,
                playlistId,
              ],
            );
          } else {
            // Add to end (default behavior)
            db.playlists.addTrackToPlaylist(playlistId, userId, track);
          }
          const playlist = db.playlists.getPlaylist(playlistId);
          res.json({ success: true, playlist });
        } catch (error) {
          logger.error("WebServer", "Error adding track:", error);
          res.status(500).json({ error: error.message });
        }
      },
    );
    // Remove track from playlist
    this.app.delete(
      "/api/playlists/:guildId/:playlistId/tracks/:trackIdentifier",
      this.authenticate.bind(this),
      async (req, res) => {
        try {
          const { guildId, playlistId, trackIdentifier } = req.params;
          const userId = this.getUserIdFromRequest(req);
          if (!userId) {
            return res.status(400).json({ error: "User ID is required" });
          }
          const { db } = await import("#database/DatabaseManager");
          // Note: removeTrackFromPlaylist takes (playlistId, userId, trackIdentifier) - no guildId
          db.playlists.removeTrackFromPlaylist(
            playlistId,
            userId,
            trackIdentifier,
          );
          const playlist = db.playlists.getPlaylist(playlistId);
          res.json({ success: true, playlist });
        } catch (error) {
          logger.error("WebServer", "Error removing track:", error);
          res.status(500).json({ error: error.message });
        }
      },
    );
    // Reorder tracks in playlist
    this.app.put(
      "/api/playlists/:guildId/:playlistId/tracks/reorder",
      this.authenticate.bind(this),
      async (req, res) => {
        try {
          const { guildId, playlistId } = req.params;
          const { fromIndex, toIndex } = req.body;
          if (typeof fromIndex !== "number" || typeof toIndex !== "number") {
            return res
              .status(400)
              .json({ error: "fromIndex and toIndex are required" });
          }
          const userId = this.getUserIdFromRequest(req);
          if (!userId) {
            return res.status(400).json({ error: "User ID is required" });
          }
          const { db } = await import("#database/DatabaseManager");
          // Note: reorderPlaylistTracks takes (playlistId, userId, fromIndex, toIndex) - no guildId
          const playlist = db.playlists.reorderPlaylistTracks(
            playlistId,
            userId,
            fromIndex,
            toIndex,
          );
          res.json({ success: true, playlist });
        } catch (error) {
          logger.error("WebServer", "Error reordering tracks:", error);
          res.status(500).json({ error: error.message });
        }
      },
    );
    // Update playlist
    this.app.put(
      "/api/playlists/:guildId/:playlistId",
      this.authenticate.bind(this),
      async (req, res) => {
        try {
          const { guildId, playlistId } = req.params;
          const { name, description, coverImage, cover_image, isPublic } =
            req.body;
          const userId = this.getUserIdFromRequest(req);
          if (!userId) {
            return res.status(400).json({ error: "User ID is required" });
          }
          const { db } = await import("#database/DatabaseManager");
          const updates = {};
          if (name !== undefined) updates.name = name;
          if (description !== undefined) updates.description = description;
          if (coverImage !== undefined) updates.cover_image = coverImage;
          if (cover_image !== undefined) updates.cover_image = cover_image;
          if (isPublic !== undefined) updates.is_public = isPublic;
          // Note: updatePlaylist takes (playlistId, userId, updates) - no guildId
          const playlist = db.playlists.updatePlaylist(
            playlistId,
            userId,
            updates,
          );
          res.json({ success: true, playlist });
        } catch (error) {
          logger.error("WebServer", "Error updating playlist:", error);
          res.status(500).json({ error: error.message });
        }
      },
    );
    // Delete playlist
    this.app.delete(
      "/api/playlists/:guildId/:playlistId",
      this.authenticate.bind(this),
      async (req, res) => {
        try {
          const { guildId, playlistId } = req.params;
          const userId = this.getUserIdFromRequest(req);
          if (!userId) {
            return res.status(400).json({ error: "User ID is required" });
          }
          const { db } = await import("#database/DatabaseManager");
          // Note: deletePlaylist takes (playlistId, userId) - no guildId
          db.playlists.deletePlaylist(playlistId, userId);
          res.json({ success: true, message: "Playlist deleted" });
        } catch (error) {
          logger.error("WebServer", "Error deleting playlist:", error);
          res.status(500).json({ error: error.message });
        }
      },
    );
    // ============ SETTINGS ENDPOINTS ============
    // Get guild settings
    this.app.get(
      "/api/settings/:guildId",
      this.authenticate.bind(this),
      async (req, res) => {
        try {
          const { guildId } = req.params;
          const { db } = await import("#database/DatabaseManager");
          const guildDb = db.guild;
          const guild = guildDb.ensureGuild(guildId);
          let prefix;
          if (guild?.prefixes) {
            try {
              const prefixes = JSON.parse(guild.prefixes);
              prefix =
                Array.isArray(prefixes) && prefixes.length > 0
                  ? prefixes[0]
                  : config.prefix;
            } catch (e) {
              prefix = config.prefix;
            }
          } else {
            prefix = config.prefix;
          }
          const defaultVolume =
            guild?.default_volume ?? config.player.defaultVolume;
          const autoPlay = guild?.auto_play === 1 || guild?.auto_play === true;
          const leaveOnEmpty =
            guild?.auto_disconnect !== 0 && guild?.auto_disconnect !== false;
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
            "247TextChannel": is247Settings.textChannel,
            "247VoiceChannel": is247Settings.voiceChannel,
            djRoles,
            tier,
            allowedRoles: tierRoles.allowed,
            allowedUsers: tierRoles.allowedUsers,
            vipRoles: tierRoles.vip,
            vipUsers: tierRoles.vipUsers,
            premiumRoles: tierRoles.premium,
            premiumUsers: tierRoles.premiumUsers,
            isPremium: await db.isGuildPremium(guildId),
          });
        } catch (error) {
          logger.error("WebServer", "Error getting settings:", error);
          res.status(500).json({ error: error.message });
        }
      },
    );
    // Update guild settings
    this.app.put(
      "/api/settings/:guildId",
      this.authenticate.bind(this),
      async (req, res) => {
        try {
          const { guildId } = req.params;

          // Check if user has permission to manage this guild
          if (!await this.checkControlPermission(req, res, guildId)) return;
          const userId = this.getUserIdFromRequest(req);


          const {
            prefix,
            defaultVolume,
            djRoles,
            autoPlay,
            leaveOnEmpty,
            stay247,
            textChannelId,
            voiceChannelId,
            tier,
            allowedRoles,
            allowedUsers,
            vipRoles,
            vipUsers,
            premiumRoles,
            premiumUsers,
          } = req.body;

          logger.info("WebServer", `Updating settings for guild ${guildId} by user ${userId}`);
          logger.debug("WebServer", `Payload: ${JSON.stringify(req.body)}`);

          const { db } = await import("#database/DatabaseManager");
          const guildDb = db.guild;

          if (prefix !== undefined) {
            guildDb.setPrefixes(guildId, [prefix]);
            logger.debug("WebServer", `Set prefix for ${guildId} to ${prefix}`);
          }
          if (defaultVolume !== undefined) {
            guildDb.setDefaultVolume(guildId, parseInt(defaultVolume));
            logger.debug("WebServer", `Set volume for ${guildId} to ${defaultVolume}`);
          }
          if (djRoles !== undefined) {
            guildDb.setDjRoles(guildId, djRoles);
            logger.debug("WebServer", `Set DJ roles for ${guildId}: ${JSON.stringify(djRoles)}`);
          }
          if (autoPlay !== undefined) {
            guildDb.ensureGuild(guildId);
            guildDb.exec("UPDATE guilds SET auto_play = ? WHERE id = ?", [
              autoPlay ? 1 : 0,
              guildDb.getStorageId(guildId), // FIX: Use storageId
            ]);
          }
          if (leaveOnEmpty !== undefined) {
            guildDb.ensureGuild(guildId);
            guildDb.exec("UPDATE guilds SET auto_disconnect = ? WHERE id = ?", [
              leaveOnEmpty ? 1 : 0,
              guildDb.getStorageId(guildId), // FIX: Use storageId
            ]);
          }
          if (stay247 !== undefined) {
            guildDb.set247Mode(
              guildId,
              stay247,
              voiceChannelId || null,
              textChannelId || null,
            );
          }
          // Tier and role settings
          if (tier !== undefined) {
            guildDb.setTier(guildId, tier);
            logger.info("WebServer", `Set tier for ${guildId} to ${tier}`);
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

          logger.success("WebServer", `Settings successfully updated for guild ${guildId}`);
          res.json({ success: true, message: "Settings updated" });
        } catch (error) {
          logger.error("WebServer", "Error updating settings:", error);
          res.status(500).json({ error: error.message });
        }
      },
    );
    // Get guild roles (for DJ role selection)
    this.app.get(
      "/api/guild/:guildId/roles",
      this.authenticate.bind(this),
      async (req, res) => {
        try {
          const { guildId } = req.params;
          const guild = this.client.guilds.cache.get(guildId);
          if (!guild) {
            return res.status(404).json({ error: "Guild not found" });
          }
          const roles = guild.roles.cache
            .map((role) => ({
              id: role.id,
              name: role.name,
              color: role.hexColor,
              position: role.position,
            }))
            .sort((a, b) => b.position - a.position);
          res.json(roles);
        } catch (error) {
          logger.error("WebServer", "Error getting guild roles:", error);
          res.status(500).json({ error: error.message });
        }
      },
    );
    // Get guild channels (for 24/7 mode selection)
    this.app.get(
      "/api/guild/:guildId/channels",
      this.authenticate.bind(this),
      async (req, res) => {
        try {
          const { guildId } = req.params;
          const guild = this.client.guilds.cache.get(guildId);
          if (!guild) {
            return res.status(404).json({ error: "Guild not found" });
          }
          const voiceChannels = guild.channels.cache
            .filter((c) => c.type === 2) // Voice
            .map((c) => ({ id: c.id, name: c.name, type: "voice" }));
          const textChannels = guild.channels.cache
            .filter((c) => c.type === 0) // Text
            .map((c) => ({ id: c.id, name: c.name, type: "text" }));
          res.json({ voiceChannels, textChannels });
        } catch (error) {
          logger.error("WebServer", "Error getting guild channels:", error);
          res.status(500).json({ error: error.message });
        }
      },
    );
    // Get guild members (for user tier selection)
    this.app.get(
      "/api/guild/:guildId/members",
      this.authenticate.bind(this),
      async (req, res) => {
        try {
          const { guildId } = req.params;
          const guild = this.client.guilds.cache.get(guildId);
          if (!guild) {
            return res.status(404).json({ error: "Guild not found" });
          }
          // Fetch all members from the guild
          try {
            await guild.members.fetch();
          } catch (e) {
            // Ignore fetch errors, use cached members
          }
          const members = guild.members.cache
            .map((member) => ({
              id: member.user.id,
              username: member.user.username,
              discriminator: member.user.discriminator,
              avatar: member.user.displayAvatarURL({ size: 32 }),
              displayName: member.displayName,
            }))
            .sort((a, b) => a.username.localeCompare(b.username));
          res.json(members);
        } catch (error) {
          logger.error("WebServer", "Error getting guild members:", error);
          res.status(500).json({ error: error.message });
        }
      },
    );
    // Search tracks from music sources
    // Radio Endpoints
    this.app.get(
      "/api/radio/:type",
      this.authenticate.bind(this),
      async (req, res) => {
        try {
          const { type } = req.params;
          const { seed } = req.query;
          const userId = this.getUserIdFromRequest(req);

          if (!userId) return res.status(401).json({ error: "User ID not found in session" });

          const tracks = await this.client.playlistManager.db.getRadioTracks(userId, type, seed);
          res.json({ success: true, tracks });
        } catch (error) {
          logger.error("WebServer", "Error fetching radio tracks:", error);
          res.status(500).json({ error: error.message });
        }
      }
    );

    this.app.post(
      "/api/radio/play",
      this.authenticate.bind(this),
      async (req, res) => {
        try {
          const { type, seed, guildId } = req.body;
          const userId = this.getUserIdFromRequest(req);

          if (!await this.checkControlPermission(req, res, guildId)) return;

          const tracks = await this.client.playlistManager.db.getRadioTracks(userId, type, seed);
          if (!tracks || tracks.length === 0) {
            return res.status(404).json({ error: "No tracks found for this radio" });
          }

          // Generate a temporary playlist name
          const radioName = type === 'artist' ? `${seed} Radio` : (type === 'mixed' ? "Mixed For You" : "Discovery Radio");

          // We use playPlaylist but with a virtual playlist object
          const playlist = {
            id: `radio_${type}_${Date.now()}`,
            name: radioName,
            tracks: tracks,
            isSystemPlaylist: true
          };

          // Standard play logic from playPlaylist
          const player = this.client.music.getPlayer(guildId);
          if (!player) return res.status(404).json({ error: "No active player" });

          const pm = new (await import("#managers/PlayerManager")).PlayerManager(player);
          await pm.clearQueue();
          await pm.addTracks(tracks);
          await player.play();

          this.broadcastToGuild(guildId, {
            type: "state_update",
            data: this.getPlayerState(pm, guildId),
          });

          res.json({ success: true, message: `Started ${radioName}`, tracksQueued: tracks.length });
        } catch (error) {
          logger.error("WebServer", "Error playing radio:", error);
          res.status(500).json({ error: error.message });
        }
      }
    );

    this.app.get(
      "/api/search",
      this.authenticate.bind(this),
      async (req, res) => {
        try {
          const { query, source = "all", type = "track" } = req.query;
          if (!query || query.trim().length < 2) {
            return res
              .status(400)
              .json({ error: "Query must be at least 2 characters" });
          }
          // Map source to lavalink search identifier
          const sourceMap = {
            youtube: "ytsearch",
            spotify: "spsearch",
            soundcloud: "scsearch",
            apple: "amsearch",
            deezer: "dzsearch",
            all: "ytsearch", // Default to YouTube for text searches
          };

          let normalizedQuery = query;
          if (query.includes("music.youtube.com")) {
            normalizedQuery = query.replace("music.youtube.com", "www.youtube.com");
          }

          const isUrl = /^https?:\/\//.test(normalizedQuery);
          let searchOptions = { requester: { id: 'WebDashboard' } };

          if (!isUrl) {
            const mappedSource = sourceMap[source] || "ytsearch";
            searchOptions.source = mappedSource;
          }

          // Timeout promise (15 seconds for slow playlists)
          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Search timed out')), 15000)
          );

          try {
            const searchResult = await Promise.race([
              this.client.music.search(normalizedQuery, searchOptions),
              timeoutPromise
            ]);

            console.log(`[Search] Query: "${query}" | Type: ${type} | LoadType: ${searchResult?.loadType} | Tracks: ${searchResult?.tracks?.length || 0}`);

            if (!searchResult || searchResult.loadType === 'empty') {
              return res.json({ results: [], playlists: [] });
            }

            if (searchResult.loadType === 'error') {
              const msg = searchResult.exception?.message || 'Unknown Lavalink Error';
              return res.status(502).json({ error: msg });
            }

            // Handle various playlist load types
            const isPlaylistLoad = searchResult.loadType === 'playlist' ||
              searchResult.loadType === 'PLAYLIST_LOADED' ||
              (type === 'playlist' && (searchResult.playlist || searchResult.playlistInfo));

            if (type === "playlist" || isPlaylistLoad) {
              let playlists = [];

              // Case 1: Search Result returns a list of playlists (e.g. from plugin)
              if (searchResult.playlists) {
                playlists = searchResult.playlists;
              }
              // Case 2: Result IS a playlist (URL loaded)
              else if (isPlaylistLoad || searchResult.tracks?.length > 1) {
                const info = searchResult.playlistInfo || searchResult.playlist || searchResult.info;
                if (info || searchResult.tracks?.length > 0) {
                  playlists = [{
                    info: info || { title: query.startsWith('http') ? 'Loaded Playlist' : query },
                    tracks: searchResult.tracks
                  }];
                }
              }

              const formattedPlaylists = await Promise.all(playlists.map(async (p) => {
                const pInfo = p.info || p;
                const uri = pInfo.uri || pInfo.url || (normalizedQuery.startsWith('http') ? normalizedQuery : '');

                // Improved artwork detection for YouTube and others
                let artwork = pInfo.artworkUrl || pInfo.thumbnail || (p.tracks?.[0]?.artworkUrl) || (p.tracks?.[0]?.pluginInfo?.artworkUrl) || null;

                // Construct fallback for YouTube playlists specifically
                if (!artwork && (uri.includes('youtube.com') || uri.includes('youtu.be')) && p.tracks?.[0]?.identifier) {
                  artwork = `https://img.youtube.com/vi/${p.tracks[0].identifier}/hqdefault.jpg`;
                }

                // Try to get artwork for Spotify playlists if missing
                if (!artwork && uri.includes('spotify.com/playlist/')) {
                  const token = await this.client.music.getSpotifyToken();
                  if (token) {
                    try {
                      const id = uri.split('playlist/')[1]?.split('?')[0];
                      const spRes = await fetch(`https://api.spotify.com/v1/playlists/${id}`, {
                        headers: { 'Authorization': `Bearer ${token}` }
                      });
                      const spData = await spRes.json();
                      artwork = spData.images?.[0]?.url || artwork;
                    } catch (e) { }
                  }
                }

                return {
                  id: pInfo.identifier || pInfo.id || 'unknown',
                  title: pInfo.name || pInfo.title || 'Unknown Playlist',
                  author: pInfo.author || 'Unknown',
                  url: uri,
                  artworkUrl: artwork,
                  trackCount: p.tracks?.length || pInfo.trackCount || 0,
                  source: uri.includes('spotify') ? 'spotify' : 'youtube',
                };
              }));

              if (formattedPlaylists.length > 0) {
                return res.json({ results: [], playlists: formattedPlaylists });
              }
              // Fallback for when "Playlists" was requested but it loaded tracks
              if (type === 'playlist' && searchResult.tracks?.length > 0) {
                // If we got tracks but no playlist info, wrap it
                return res.json({
                  results: [], playlists: [{
                    id: 'loaded',
                    title: 'Tracks from link',
                    author: 'Unknown',
                    url: normalizedQuery,
                    artworkUrl: searchResult.tracks[0].artworkUrl || null,
                    trackCount: searchResult.tracks.length,
                    source: normalizedQuery.includes('spotify') ? 'spotify' : 'youtube'
                  }]
                });
              }
            }

            // Handle tracks
            const results = await Promise.all((searchResult.tracks || []).map(async (track, index) => {
              const uri = track.info?.uri || track.uri;
              let artworkUrl = track.artworkUrl || track.thumbnail || null;

              // Enhance Spotify tracks with real artwork if missing
              if (!artworkUrl && uri?.includes('spotify.com')) {
                artworkUrl = await this.client.music.getSpotifyArtwork(uri);
              }

              return {
                source: detectSource(uri),
                identifier: track.info?.identifier || track.identifier,
                title: track.info?.title || track.title,
                author: track.info?.author || track.author,
                duration: track.info?.duration || track.duration,
                durationFormatted: formatDuration(track.info?.duration || track.duration),
                uri: uri,
                artworkUrl: artworkUrl,
                isExplicit: track.isExplicit || false,
                sourceName: track.sourceName || detectSource(uri),
              };
            }));
            res.json({ results, playlists: [] });
          } catch (searchError) {
            logger.error("WebServer", "Search timeout or error:", searchError);
            res.status(504).json({ error: "Search timed out or failed" });
          }

        } catch (error) {
          logger.error("WebServer", "Error searching tracks:", error);
          res.status(500).json({ error: error.message });
        }
      },
    );
    // Helper function to detect source from URI
    function detectSource(uri) {
      if (!uri) return "youtube";
      if (uri.includes("spotify.com")) return "spotify";
      if (uri.includes("youtube.com") || uri.includes("youtu.be"))
        return "youtube";
      if (uri.includes("soundcloud.com")) return "soundcloud";
      if (uri.includes("music.apple.com")) return "apple";
      if (uri.includes("deezer.com")) return "deezer";
      return "youtube";
    }

    // Helper function to format duration
    function formatDuration(ms) {
      if (!ms) return "0:00";
      const seconds = Math.floor(ms / 1000);
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = seconds % 60;
      return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
    }
    // Get playlist details (full with tracks)
    this.app.get(
      "/api/playlists/:playlistId/details",
      this.authenticate.bind(this),
      async (req, res) => {
        try {
          const { playlistId } = req.params;
          const userId = this.getUserIdFromRequest(req);
          const { db } = await import("#database/DatabaseManager");
          const playlist = db.playlists.getPlaylist(playlistId);
          if (!playlist) {
            return res.status(404).json({ error: "Playlist not found" });
          }
          // Check access
          if (playlist.user_id !== userId && !playlist.is_public) {
            return res.status(403).json({ error: "Access denied" });
          }
          // Format track durations
          if (playlist.tracks && Array.isArray(playlist.tracks)) {
            playlist.tracks = playlist.tracks.map((track) => ({
              ...track,
              durationFormatted: formatDuration(track.duration),
            }));
          }
          res.json(playlist);
        } catch (error) {
          logger.error("WebServer", "Error getting playlist details:", error);
          res.status(500).json({ error: error.message });
        }
      },
    );
    // Update playlist details (name, description, cover, isPublic)
    this.app.put(
      "/api/playlists/:playlistId/details",
      this.authenticate.bind(this),
      async (req, res) => {
        try {
          const { playlistId } = req.params;
          const { name, description, coverImage, isPublic } = req.body;
          const userId = this.getUserIdFromRequest(req);
          if (!userId) {
            return res.status(400).json({ error: "User ID is required" });
          }
          const { db } = await import("#database/DatabaseManager");
          const updates = {};
          if (name !== undefined) updates.name = name;
          if (description !== undefined) updates.description = description;
          if (coverImage !== undefined) updates.cover_image = coverImage;
          if (isPublic !== undefined) updates.is_public = isPublic;
          const playlist = db.playlists.updatePlaylist(
            playlistId,
            userId,
            updates,
          );
          res.json({ success: true, playlist });
        } catch (error) {
          logger.error("WebServer", "Error updating playlist details:", error);
          res.status(500).json({ error: error.message });
        }
      },
    );
    // ============ SPOTIFY & YOUTUBE MUSIC INTEGRATION ============
    // Import Spotify playlist to bot playlist
    this.app.post(
      "/api/playlists/:guildId/import/spotify",
      this.authenticate.bind(this),
      async (req, res) => {
        try {
          const { guildId } = req.params;
          const { playlistUrl, targetPlaylistId } = req.body;
          const { db } = await import("#database/DatabaseManager");
          const { spotifyManager } = await import("#utils/SpotifyManager");
          const userId = req.session.userId || req.user?.id;
          if (!playlistUrl) {
            return res
              .status(400)
              .json({ error: "Spotify playlist URL is required" });
          }
          const parsed = spotifyManager.parseSpotifyUrl(playlistUrl);
          if (!parsed || parsed.type !== "playlist") {
            return res
              .status(400)
              .json({ error: "Invalid Spotify playlist URL" });
          }
          const spotifyTracks = await spotifyManager.fetchPlaylistTracks(
            parsed.id,
            100,
          );
          if (!spotifyTracks || spotifyTracks.length === 0) {
            return res
              .status(404)
              .json({ error: "No tracks found in Spotify playlist" });
          }
          let playlist;
          if (targetPlaylistId) {
            playlist = db.playlists.getPlaylist(targetPlaylistId);
            if (!playlist || playlist.user_id !== userId) {
              return res
                .status(403)
                .json({ error: "Playlist not found or access denied" });
            }
          } else {
            const playlistName = `Spotify Import ${new Date().toLocaleDateString()}`;
            const playlistId = db.playlists.createPlaylist(
              userId,
              playlistName,
              `Imported from Spotify`,
              false,
              null,
            );
            playlist = db.playlists.getPlaylist(playlistId);
          }
          let addedCount = 0;
          for (const track of spotifyTracks) {
            try {
              const searchResult = await this.client.music.search(
                `${track.name} ${track.artist}`,
                { source: "ytsearch" },
              );
              if (searchResult?.tracks?.length > 0) {
                const lavalinkTrack = searchResult.tracks[0];
                db.playlists.addTrackToPlaylist(playlist.id, userId, {
                  identifier: lavalinkTrack.identifier,
                  title: track.name,
                  author: track.artist,
                  uri: lavalinkTrack.uri,
                  artworkUrl: lavalinkTrack.artworkUrl || track.albumCoverUrl,
                  duration: lavalinkTrack.duration || track.duration,
                  source: "youtube",
                });
                addedCount++;
              }
            } catch (e) {
              logger.warn(
                "WebServer",
                `Failed to add track ${track.name}:`,
                e.message,
              );
            }
          }
          playlist = db.playlists.getPlaylist(playlist.id);
          res.json({
            success: true,
            playlist,
            imported: addedCount,
            total: spotifyTracks.length,
          });
        } catch (error) {
          logger.error("WebServer", "Error importing Spotify playlist:", error);
          res.status(500).json({ error: error.message });
        }
      },
    );
    // Search YouTube Music playlist
    this.app.get(
      "/api/search/ytmusic",
      this.authenticate.bind(this),
      async (req, res) => {
        try {
          const { query } = req.query;
          if (!query || query.trim().length < 2) {
            return res
              .status(400)
              .json({ error: "Query must be at least 2 characters" });
          }
          // Search YouTube Music for playlists
          const searchQuery = `ytmsearch:${query} playlist`;
          const searchResult = await this.client.music.search(searchQuery, {
            source: "ytsearch",
          });
          if (!searchResult?.playlists?.length) {
            return res.json({ playlists: [] });
          }
          const playlists = searchResult.playlists.map((p) => ({
            id: p.id,
            title: p.info?.title || p.title,
            author: p.info?.author || p.author,
            url:
              p.info?.uri || `https://music.youtube.com/playlist?list=${p.id}`,
            artworkUrl: p.info?.artworkUrl || p.artworkUrl,
            trackCount: p.tracks?.length || 0,
            source: "youtube",
          }));
          res.json({ playlists });
        } catch (error) {
          logger.error("WebServer", "Error searching YouTube Music:", error);
          res.status(500).json({ error: error.message });
        }
      },
    );
    // Import YouTube Music playlist
    this.app.post(
      "/api/playlists/:guildId/import/ytmusic",
      this.authenticate.bind(this),
      async (req, res) => {
        try {
          const { guildId } = req.params;
          const { playlistId, playlistName, targetPlaylistId } = req.body;
          const { db } = await import("#database/DatabaseManager");
          const userId = req.session.userId || req.user?.id;
          if (!playlistId) {
            return res
              .status(400)
              .json({ error: "YouTube Music playlist ID is required" });
          }
          // Load the YouTube Music playlist
          const loadResult = await this.client.music.search(
            `https://music.youtube.com/playlist?list=${playlistId}`,
            { source: "ytsearch" },
          );
          if (!loadResult?.tracks?.length) {
            return res
              .status(404)
              .json({ error: "No tracks found in YouTube Music playlist" });
          }
          let playlist;
          if (targetPlaylistId) {
            playlist = db.playlists.getPlaylist(targetPlaylistId);
            if (!playlist || playlist.user_id !== userId) {
              return res
                .status(403)
                .json({ error: "Playlist not found or access denied" });
            }
          } else {
            const name =
              playlistName ||
              `YT Music Import ${new Date().toLocaleDateString()}`;
            const newPlaylistId = db.playlists.createPlaylist(
              userId,
              name,
              `Imported from YouTube Music`,
              false,
              null,
            );
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
                source: "youtube",
              });
              addedCount++;
            } catch (e) {
              logger.warn(
                "WebServer",
                `Failed to add track ${track.info?.title}:`,
                e.message,
              );
            }
          }
          playlist = db.playlists.getPlaylist(playlist.id);
          res.json({
            success: true,
            playlist,
            imported: addedCount,
            total: loadResult.tracks.length,
          });
        } catch (error) {
          logger.error(
            "WebServer",
            "Error importing YouTube Music playlist:",
            error,
          );
          res.status(500).json({ error: error.message });
        }
      },
    );
    // ============ PLAYLIST MODIFICATION ENDPOINTS ============
    // Add track to playlist
    this.app.post(
      "/api/playlists/:guildId/:playlistId/tracks",
      this.authenticate.bind(this),
      async (req, res) => {
        try {
          const { guildId, playlistId } = req.params;
          const { track, position } = req.body;
          const userId = req.session.userId || req.user?.id;
          const { db } = await import("#database/DatabaseManager");

          if (!track) return res.status(400).json({ error: "Track is required" });

          const updatedPlaylist = db.playlists.addTrackToPlaylist(playlistId, userId, track);
          res.json(updatedPlaylist);
        } catch (error) {
          res.status(500).json({ error: error.message });
        }
      }
    );

    // Remove track from playlist
    this.app.delete(
      "/api/playlists/:guildId/:playlistId/tracks/:trackIdentifier",
      this.authenticate.bind(this),
      async (req, res) => {
        try {
          const { guildId, playlistId, trackIdentifier } = req.params;
          const userId = req.session.userId || req.user?.id;
          const { db } = await import("#database/DatabaseManager");

          const updatedPlaylist = db.playlists.removeTrackFromPlaylist(playlistId, userId, trackIdentifier);
          res.json(updatedPlaylist);
        } catch (error) {
          res.status(500).json({ error: error.message });
        }
      }
    );

    // Reorder tracks in playlist
    this.app.put(
      "/api/playlists/:guildId/:playlistId/tracks/reorder",
      this.authenticate.bind(this),
      async (req, res) => {
        try {
          const { guildId, playlistId } = req.params;
          const { fromIndex, toIndex } = req.body;
          const userId = req.session.userId || req.user?.id;
          const { db } = await import("#database/DatabaseManager");

          const updatedPlaylist = db.playlists.reorderPlaylistTracks(playlistId, userId, fromIndex, toIndex);
          res.json(updatedPlaylist);
        } catch (error) {
          res.status(500).json({ error: error.message });
        }
      }
    );

    // Play playlist
    this.app.post(
      "/api/playlists/:guildId/:playlistId/play",
      this.authenticate.bind(this),
      async (req, res) => {
        try {
          const { guildId, playlistId } = req.params;
          const {
            shuffle = false,
            clearQueue = false,
            voiceChannelId,
            textChannelId,
          } = req.body;
          const userId = this.getUserIdFromRequest(req);
          const { db } = await import("#database/DatabaseManager");
          const playlist = db.playlists.getPlaylist(playlistId);
          if (!playlist || !playlist.tracks || playlist.tracks.length === 0) {
            return res
              .status(404)
              .json({ error: "Playlist not found or empty" });
          }
          const musicManager = this.client.music;
          let player = musicManager.getPlayer(guildId);
          if (!player) {
            if (!voiceChannelId) {
              return res
                .status(400)
                .json({ error: "No player found and no voice channel provided" });
            }
            player = await musicManager.createPlayer({
              guildId,
              voiceChannelId,
              textChannelId: textChannelId || null,
            });
          }
          if (!player) {
            return res.status(500).json({ error: "Failed to create player" });
          }
          const pm = new PlayerManager(player);
          if (!pm.isConnected) await pm.connect();
          if (clearQueue) {
            pm.player.queue.tracks.splice(0, pm.player.queue.tracks.length);
          }
          let tracksToPlay = [...playlist.tracks];
          if (shuffle) {
            tracksToPlay.sort(() => Math.random() - 0.5);
          }
          // Use the search method in musicManager to get unresolved tracks
          const addedTracks = [];
          for (const track of tracksToPlay) {
            const result = await musicManager.search(
              track.uri || track.identifier,
              { requester: { id: userId, username: "Dashboard" } },
            );
            if (result && result.tracks.length > 0) {
              addedTracks.push(result.tracks[0]);
            }
          }
          if (addedTracks.length > 0) {
            await pm.addTracks(addedTracks);
            if (!pm.isPlaying && !pm.isPaused) await pm.play();
          }
          res.json({
            success: true,
            message: `Added ${addedTracks.length} tracks to queue`,
            count: addedTracks.length,
          });
        } catch (error) {
          logger.error("WebServer", "Error playing playlist:", error);
          res.status(500).json({ error: error.message });
        }
      },
    );
    // ============ GUILD & SETTINGS ENDPOINTS ============
    // Get guild roles
    this.app.get(
      "/api/guild/:guildId/roles",
      this.authenticate.bind(this),
      async (req, res) => {
        try {
          const { guildId } = req.params;
          const guild = this.client.guilds.cache.get(guildId);
          if (!guild) return res.status(404).json({ error: "Guild not found" });
          const roles = guild.roles.cache
            .filter((r) => r.name !== "@everyone")
            .map((r) => ({ id: r.id, name: r.name, color: r.hexColor }));
          res.json(roles);
        } catch (error) {
          res.status(500).json({ error: error.message });
        }
      },
    );

    // Get guild channels
    this.app.get(
      "/api/guild/:guildId/channels",
      this.authenticate.bind(this),
      async (req, res) => {
        try {
          const { guildId } = req.params;
          const guild = this.client.guilds.cache.get(guildId);
          if (!guild) return res.status(404).json({ error: "Guild not found" });
          const channels = guild.channels.cache.filter((c) =>
            [0, 2, 5].includes(c.type),
          ); // Text, Voice, Announcement
          res.json({
            textChannels: channels
              .filter((c) => [0, 5].includes(c.type))
              .map((c) => ({ id: c.id, name: c.name })),
            voiceChannels: channels
              .filter((c) => c.type === 2)
              .map((c) => ({ id: c.id, name: c.name })),
          });
        } catch (error) {
          res.status(500).json({ error: error.message });
        }
      },
    );

    // Search guild members
    this.app.get(
      "/api/guild/:guildId/members",
      this.authenticate.bind(this),
      async (req, res) => {
        try {
          const { guildId } = req.params;
          const { query } = req.query;
          const guild = this.client.guilds.cache.get(guildId);
          if (!guild) return res.status(404).json({ error: "Guild not found" });

          const members = guild.members.cache
            .filter(
              (m) =>
                !m.user.bot &&
                (m.user.username.toLowerCase().includes(query?.toLowerCase() || "") ||
                  m.displayName.toLowerCase().includes(query?.toLowerCase() || "")),
            )
            .first(20)
            .map((m) => ({
              id: m.id,
              username: m.user.username,
              discriminator: m.user.discriminator === "0" ? "0000" : m.user.discriminator,
              displayName: m.displayName,
              avatar: m.user.displayAvatarURL(),
            }));

          res.json(members);
        } catch (error) {
          res.status(500).json({ error: error.message });
        }
      },
    );

    // Get guild settings
    this.app.get(
      "/api/settings/:guildId",
      this.authenticate.bind(this),
      async (req, res) => {
        try {
          const { guildId } = req.params;
          const { db } = await import("#database/DatabaseManager");
          const row = db.guild.getGuild(guildId);
          if (!row) {
            db.guild.ensureGuild(guildId);
            return res.json({});
          }

          // Map DB columns to frontend field names
          const settings = {
            prefix: row.prefixes || ".",
            defaultVolume: row.default_volume || 100,
            autoPlay: !!row.auto_play,
            leaveOnEmpty: !!row.auto_disconnect, // If auto_disconnect is true, leaveOnEmpty is true
            stay247: !!row.stay_247,
            "247TextChannel": row.stay_247_text_channel,
            "247VoiceChannel": row.stay_247_voice_channel,
            djRoles: JSON.parse(row.dj_roles || "[]"),
            tier: row.tier || "free",
            allowedRoles: JSON.parse(row.allowed_roles || "[]"),
            allowedUsers: JSON.parse(row.allowed_users || "[]"),
            vipRoles: JSON.parse(row.vip_roles || "[]"),
            vipUsers: JSON.parse(row.vip_users || "[]"),
            premiumRoles: JSON.parse(row.premium_roles || "[]"),
            premiumUsers: JSON.parse(row.premium_users || "[]"),
          };
          res.json(settings);
        } catch (error) {
          res.status(500).json({ error: error.message });
        }
      },
    );

    // Update guild settings
    this.app.put(
      "/api/settings/:guildId",
      this.authenticate.bind(this),
      async (req, res) => {
        try {
          const { guildId } = req.params;
          const { db } = await import("#database/DatabaseManager");

          const sql = `UPDATE guilds SET
          prefixes = ?, default_volume = ?, auto_play = ?, auto_disconnect = ?, stay_247 = ?,
            stay_247_text_channel = ?, stay_247_voice_channel = ?, dj_roles = ?, tier = ?,
            allowed_roles = ?, allowed_users = ?, vip_roles = ?, vip_users = ?,
            premium_roles = ?, premium_users = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ? `;

          const storageId = db.guild.getStorageId(guildId);
          db.guild.exec(sql, [
            JSON.stringify([req.body.prefix]), // Store as array
            req.body.defaultVolume,
            req.body.autoPlay ? 1 : 0,
            !req.body.leaveOnEmpty ? 1 : 0,
            req.body.stay247 ? 1 : 0,
            req.body["247TextChannel"] || null,
            req.body["247VoiceChannel"] || null,
            JSON.stringify(req.body.djRoles || []),
            req.body.tier || "free",
            JSON.stringify(req.body.allowedRoles || []),
            JSON.stringify(req.body.allowedUsers || []),
            JSON.stringify(req.body.vipRoles || []),
            JSON.stringify(req.body.vipUsers || []),
            JSON.stringify(req.body.premiumRoles || []),
            JSON.stringify(req.body.premiumUsers || []),
            storageId,
          ]);

          res.json({ success: true });
        } catch (error) {
          logger.error("WebServer", "Error updating settings:", error);
          res.status(500).json({ error: error.message });
        }
      },
    );

    // Lyrics Translation endpoint
    this.app.get(
      "/api/player/:guildId/lyrics/translate",
      this.authenticate.bind(this),
      async (req, res) => {
        try {
          const { guildId } = req.params;
          const { text, to = "en" } = req.query;
          if (!text) return res.status(400).json({ error: "Text is required" });

          const player = this.client.music?.getPlayer(guildId);
          if (!player) return res.status(404).json({ error: "No player found" });

          const translated = await player.translateLyrics(text, to);
          res.json({ translated });
        } catch (error) {
          res.status(500).json({ error: error.message });
        }
      },
    );

    // ============ STATS ENDPOINTS ============
    // Get guild stats
    this.app.get(
      "/api/stats/:guildId",
      this.authenticate.bind(this),
      async (req, res) => {
        try {
          const { guildId } = req.params;
          const { db } = await import("#database/DatabaseManager");
          const statsRepo = db.stats;
          if (!statsRepo) {
            return res.status(500).json({ error: "Stats system not initialized" });
          }
          const guildStats = statsRepo.getGuildStats(guildId);
          const topSongs = statsRepo.getTopSongs(guildId, 10);
          const sourceData = statsRepo.getSourceDistribution(guildId);
          // Format source distribution for frontend
          const sourceDistribution = {
            YouTube: 0,
            Spotify: 0,
            SoundCloud: 0,
            "Apple Music": 0,
            Deezer: 0,
            Other: 0,
          };
          sourceData.forEach(s => {
            if (sourceDistribution[s.source] !== undefined) {
              sourceDistribution[s.source] = s.count;
            } else {
              sourceDistribution.Other += s.count;
            }
          });
          // Get top artist (rough estimate from top songs)
          const artistCounts = {};
          guildStats.history.forEach(h => {
            if (h.author) artistCounts[h.author] = (artistCounts[h.author] || 0) + 1;
          });
          const topArtists = Object.entries(artistCounts)
            .map(([name, count]) => ({ name, playCount: count }))
            .sort((a, b) => b.playCount - a.playCount)
            .slice(0, 10);
          const topGenre = Object.entries(sourceDistribution).sort((a, b) => b[1] - a[1])[0]?.[0] || "Unknown";
          res.json({
            totalPlays: guildStats.totalPlays,
            uniqueUsers: guildStats.uniqueUsers,
            topGenre,
            uptime: this.client.uptime || 0,
            topSongs: topSongs.map(s => ({
              title: s.title,
              author: s.author,
              playCount: s.playCount,
              artworkUrl: s.artwork_url,
              uri: s.uri
            })),
            topArtists,
            sourceDistribution,
            historyCount: guildStats.history.length,
          });
        } catch (error) {
          logger.error("WebServer", "Error getting stats:", error);
          res.status(500).json({ error: error.message });
        }
      },
    );
    // Get bot global stats (Public - for landing page)
    this.app.get(
      "/api/stats",
      async (req, res) => {
        try {
          const { DatabaseManager } = await import("#database/DatabaseManager");
          let totalPlays = 0;
          let totalUsers = new Set();
          let guildCount = this.client.guilds.cache.size;
          let playerCount = this.client.music?.players?.size || 0;
          const globalSongCounts = {};
          const globalArtistCounts = {};
          // Aggregate stats from all guilds
          for (const guild of this.client.guilds.cache.values()) {
            try {
              const guildDb = DatabaseManager.getGuildDb(guild.id);
              if (guildDb.getPlayCount) {
                totalPlays += guildDb.getPlayCount();
              }
              const history = guildDb.getTrackHistory
                ? guildDb.getTrackHistory(100)
                : [];
              history.forEach((h) => {
                if (h.requesterId) totalUsers.add(h.requesterId);
                const songKey = `${h.title} by ${h.author} `;
                globalSongCounts[songKey] =
                  (globalSongCounts[songKey] || 0) + 1;
                if (h.author) {
                  globalArtistCounts[h.author] =
                    (globalArtistCounts[h.author] || 0) + 1;
                }
              });
            } catch (e) {
              // Skip guilds with DB errors
            }
          }
          const topSongs = Object.entries(globalSongCounts)
            .map(([key, count]) => {
              const parts = key.split(" by ");
              return {
                title: parts[0],
                author: parts[1] || "Unknown",
                playCount: count,
              };
            })
            .sort((a, b) => b.playCount - a.playCount)
            .slice(0, 10);
          const topArtists = Object.entries(globalArtistCounts)
            .map(([name, count]) => ({ name, playCount: count }))
            .sort((a, b) => b.playCount - a.playCount)
            .slice(0, 10);
          res.json({
            totalPlays,
            uniqueUsers: totalUsers.size,
            guilds: guildCount,
            players: playerCount,
            topSongs,
            topArtists,
            uptime: this.client.uptime || 0,
            botPing: this.client.ws.ping,
          });
        } catch (error) {
          logger.error("WebServer", "Error getting global stats:", error);
          res.status(500).json({ error: error.message });
        }
      },
    );

    // ============ PLAYER PERMISSION ENDPOINTS ============
    // Get session info for a guild
    this.app.get(
      "/api/player/:guildId/session",
      this.authenticate.bind(this),
      async (req, res) => {
        try {
          const { guildId } = req.params;
          const { PlayerPermissionManager } = await import("#managers/PlayerPermissionManager");
          const session = PlayerPermissionManager.getSession(guildId);
          res.json({ session });
        } catch (error) {
          logger.error("WebServer", "Error getting session:", error);
          res.status(500).json({ error: error.message });
        }
      }
    );

    // --- RADIO API ROUTES ---
    this.app.get(
      "/api/radio/:type",
      this.authenticate.bind(this),
      async (req, res) => {
        try {
          const { type } = req.params;
          const { userId, seed, limit = 20 } = req.query;

          if (!userId) {
            return res.status(400).json({ error: "User ID is required" });
          }

          const tracks = await this.client.playlistManager.db.getRadioTracks(userId, type, seed);
          res.json({ type, tracks, count: tracks.length });
        } catch (error) {
          logger.error("WebServer", `Error fetching radio tracks for ${req.params.type}:`, error);
          // Return JSON error, NOT 500 HTML
          res.status(500).json({ error: error.message });
        }
      }
    );

    this.app.post(
      "/api/radio/play",
      this.authenticate.bind(this),
      async (req, res) => {
        try {
          const { type, seed, guildId, requesterId } = req.body;
          if (!guildId) return res.status(400).json({ error: "Guild ID is required" });

          // Use the session user if requesterId not explicit
          const userId = requesterId || (req.user ? req.user.id : null);
          if (!userId) return res.status(400).json({ error: "User unauthorized" });

          // Permission check
          if (!await this.checkControlPermission(req, res, guildId)) return;

          // 1. Get Radio Tracks
          const tracks = await this.client.playlistManager.db.getRadioTracks(userId, type, seed);
          if (!tracks || tracks.length === 0) {
            return res.status(404).json({ error: "No tracks found for this radio station. Try playing more songs first!" });
          }

          // 2. Clear Queue & Add
          // We use playlistManager to handle the queuing logic properly
          await this.client.playlistManager.addTracks(guildId, userId, tracks);

          // 3. Ensure playing
          const player = this.client.music.getPlayer(guildId);
          if (player && !player.playing && !player.paused) {
            await player.play();
          }

          res.json({ success: true, trackCount: tracks.length, message: `Started ${type} radio` });
        } catch (error) {
          logger.error("WebServer", "Error starting radio:", error);
          res.status(500).json({ error: error.message });
        }
      }
    );

    // Check if user can control player
    this.app.get(
      "/api/player/:guildId/can-control",
      this.authenticate.bind(this),
      async (req, res) => {
        try {
          const { guildId } = req.params;
          const { userId } = req.query;
          if (!userId) {
            return res.status(400).json({ error: "userId is required" });
          }
          const { PlayerPermissionManager } = await import("#managers/PlayerPermissionManager");

          // Get the guild and member for role checks
          const guild = this.client.guilds.cache.get(guildId);
          const member = guild?.members.cache.get(userId) || await guild?.members.fetch(userId).catch(() => null);

          const result = PlayerPermissionManager.canControl(guildId, { id: userId }, member);
          res.json(result);
        } catch (error) {
          logger.error("WebServer", "Error checking control permission:", error);
          res.status(500).json({ error: error.message });
        }
      },
    );

    // Request permission to control player
    this.app.post(
      "/api/player/:guildId/request-permission",
      this.authenticate.bind(this),
      async (req, res) => {
        try {
          const { guildId } = req.params;
          const { userId, userTag, action } = req.body;
          if (!userId) {
            return res.status(400).json({ error: "userId is required" });
          }
          const { PlayerPermissionManager } = await import("#managers/PlayerPermissionManager");

          const request = PlayerPermissionManager.createPermissionRequest(
            guildId,
            { id: userId, tag: userTag || "Unknown" },
            action || "control"
          );

          if (!request) {
            return res.status(400).json({ error: "No active session to request permission from" });
          }

          // Broadcast the permission request to the session owner via WebSocket
          this.broadcastToGuild(guildId, {
            type: "permission_request",
            data: request
          });

          res.json({ success: true, request });
        } catch (error) {
          logger.error("WebServer", "Error creating permission request:", error);
          res.status(500).json({ error: error.message });
        }
      },
    );

    // Respond to a permission request
    this.app.post(
      "/api/player/:guildId/respond-permission",
      this.authenticate.bind(this),
      async (req, res) => {
        try {
          const { guildId } = req.params;
          const { requestId, approved, responderId } = req.body;
          if (!requestId || approved === undefined || !responderId) {
            return res.status(400).json({ error: "requestId, approved, and responderId are required" });
          }
          const { PlayerPermissionManager } = await import("#managers/PlayerPermissionManager");

          const result = PlayerPermissionManager.respondToRequest(requestId, approved, responderId);

          if (!result) {
            return res.status(404).json({ error: "Permission request not found or expired" });
          }

          if (result.error) {
            return res.status(403).json({ error: result.error });
          }

          // Broadcast the response to the requester via WebSocket
          this.broadcastToGuild(guildId, {
            type: "permission_response",
            data: result
          });

          res.json({ success: true, result });
        } catch (error) {
          logger.error("WebServer", "Error responding to permission request:", error);
          res.status(500).json({ error: error.message });
        }
      },
    );

    // Get pending permission requests for a user (session owner)
    this.app.get(
      "/api/player/permissions/pending",
      this.authenticate.bind(this),
      async (req, res) => {
        try {
          const { ownerId } = req.query;
          if (!ownerId) {
            return res.status(400).json({ error: "ownerId is required" });
          }
          const { PlayerPermissionManager } = await import("#managers/PlayerPermissionManager");
          const requests = PlayerPermissionManager.getPendingRequestsForOwner(ownerId);
          res.json({ requests });
        } catch (error) {
          logger.error("WebServer", "Error getting pending requests:", error);
          res.status(500).json({ error: error.message });
        }
      },
    );

    // Transfer session ownership
    this.app.post(
      "/api/player/:guildId/transfer-session",
      this.authenticate.bind(this),
      async (req, res) => {
        try {
          const { guildId } = req.params;
          const { currentOwnerId, newOwnerId, newOwnerTag } = req.body;
          if (!currentOwnerId || !newOwnerId) {
            return res.status(400).json({ error: "currentOwnerId and newOwnerId are required" });
          }
          const { PlayerPermissionManager } = await import("#managers/PlayerPermissionManager");

          const success = PlayerPermissionManager.transferOwnership(
            guildId,
            { id: newOwnerId, tag: newOwnerTag || "Unknown" },
            currentOwnerId
          );

          if (!success) {
            return res.status(403).json({ error: "Cannot transfer ownership - not the current owner or no active session" });
          }

          // Broadcast the ownership change
          this.broadcastToGuild(guildId, {
            type: "session_owner_changed",
            data: PlayerPermissionManager.getSession(guildId)
          });

          res.json({ success: true });
        } catch (error) {
          logger.error("WebServer", "Error transferring session:", error);
          res.status(500).json({ error: error.message });
        }
      },
    );

    // ============ END STATS ENDPOINTS ============
    // Serve dashboard with auto-connect support
    this.app.get("/", (req, res) => {
      res.sendFile(join(__dirname, "public", "index.html"));
    });
    // Dashboard route
    this.app.get("/dashboard", (req, res) => {
      res.sendFile(join(__dirname, "public", "index.html"));
    });
    // Auto-connect route (for Discord button links)
    this.app.get("/connect", (req, res) => {
      res.sendFile(join(__dirname, "public", "index.html"));
    });
  }
  getPlayerState(pm, guildId) {
    const currentTrack = pm.currentTrack;
    const guild = this.client.guilds.cache.get(guildId);

    // Fallback for artwork
    const getArtwork = (track) => {
      if (!track) return null;
      let artwork = track.info?.artworkUrl || track.artworkUrl || track.pluginInfo?.artworkUrl;
      const uri = track.info?.uri || track.uri;

      if ((!artwork || artwork.includes('placehold.co')) && uri) {
        if (uri.includes('youtube.com') || uri.includes('youtu.be')) {
          const match = uri.match(/(?:v=|youtu\.be\/|v\/)([^&?]+)/);
          if (match && match[1]) artwork = `https://img.youtube.com/vi/${match[1]}/mqdefault.jpg`;
        }
      }
      return artwork;
    };

    return {
      guildId,
      guildName: guild?.name || "Unknown Guild",
      isPlaying: pm.isPlaying && !!currentTrack,
      isPaused: pm.paused || pm.isPaused,
      isConnected: pm.isConnected,
      volume: pm.volume,
      repeatMode: pm.repeatMode,
      activeFilterName: pm.player?.lastFilterName || null,
      timescale: (() => {
        const fm = pm.player?.filterManager;
        // Robust check for timescale data location: direct property, filters object, or data object
        const ts = fm?.timescale || fm?.filters?.timescale || fm?.data?.timescale || {};
        const speed = ts.speed || 1.0;
        const rate = ts.rate || 1.0;



        return speed * rate;
      })(),
      position: pm.position,
      currentTrack: currentTrack
        ? {
          title: currentTrack.info?.title || "Unknown",
          author: currentTrack.info?.author || "Unknown",
          duration: currentTrack.info?.duration || 0,
          uri: currentTrack.info?.uri,
          artworkUrl: getArtwork(currentTrack),
          isStream: currentTrack.info?.isStream || false,
          isSeekable:
            currentTrack.info?.isSeekable !== false &&
            !currentTrack.info?.isStream,
          requester: currentTrack.requester || currentTrack.userData || null,
          userData: currentTrack.userData || null
        }
        : null,
      queueSize: pm.queueSize,
      queue: pm.player.queue.tracks.slice(0, 50).map((track) => ({
        title: track.info?.title || "Unknown",
        author: track.info?.author || "Unknown",
        duration: track.info?.duration || 0,
        artworkUrl: getArtwork(track),
        uri: track.info?.uri,
        requester: track.requester || track.userData || null,
        userData: track.userData || null
      })),
      sleepEnd: pm.player?.get('sleepTimerEnd') || null,
      voiceChannel: pm.voiceChannelId
        ? {
          id: pm.voiceChannelId,
          name:
            guild?.channels.cache.get(pm.voiceChannelId)?.name || "Unknown",
        }
        : null,
    };
  }
  setupWebSocket() {
    this.wss.on("connection", (ws, req) => {
      const url = new URL(req.url, `http://${req.headers.host}`);
      const guildId = url.searchParams.get("guildId");
      const apiKey = url.searchParams.get("apiKey");
      if (!guildId || !apiKey || apiKey !== this.apiKey) {
        ws.close(1008, "Invalid or missing parameters");
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
            const { PlayerManager } = await import("#managers/PlayerManager");
            const pm = new PlayerManager(player);
            ws.send(
              JSON.stringify({
                type: "state_update",
                data: this.getPlayerState(pm, guildId),
              }),
            );
          }
        } catch (error) {
          logger.error("WebServer", "Error sending initial state:", error);
        }
      })();
      ws.on("close", () => {
        const guildClients = this.clients.get(guildId);
        if (guildClients) {
          guildClients.delete(ws);
          if (guildClients.size === 0) {
            this.clients.delete(guildId);
          }
        }
      });
      ws.on("error", (error) => {
        logger.error("WebServer", "WebSocket error:", error);
      });
    });
  }
  broadcastToGuild(guildId, event, data) {
    // 1. Send via Socket.IO (Dashboard realtime)
    if (this.socketManager) {
      const eventName = typeof event === "string" ? event : event.type || "state_update";
      const payload = typeof event === "string" ? data : event.data || event;

      // Map legacy event types to Socket.IO events if needed
      let ioEvent = eventName;
      if (eventName === "state_update") ioEvent = "player:state";
      if (eventName === "queue_update") ioEvent = "queue:update";

      this.socketManager.broadcastToGuild(guildId, ioEvent, payload);
    }

    // 2. Send via Legacy WebSocket (if enabled)
    if (this.wss) {
      const guildClients = this.clients.get(guildId);
      if (guildClients) {
        const legacyPayload = typeof event === "string" ? { type: event, data } : event;
        const msgStr = JSON.stringify(legacyPayload);
        guildClients.forEach((ws) => {
          if (ws.readyState === 1) ws.send(msgStr);
        });
      }
    }
  }

  broadcastToUser(userId, data) {
    if (this.socketManager) {
      const eventName = data.type || "notification";
      this.socketManager.emitToUser(userId, eventName, data);
    }
  }
  // Method to be called when player state changes
  async updatePlayerState(guildId) {
    try {
      const player = this.client.music?.getPlayer(guildId);
      // If there is no player (destroyed), push an "inactive" state + empty queue
      // so the dashboard doesn't keep showing stale "ghost" track/queue UI.
      if (!player) {
        this.broadcastToGuild(guildId, {
          type: "state_update",
          data: {
            guildId,
            guildName:
              this.client.guilds.cache.get(guildId)?.name || "Unknown Guild",
            isPlaying: false,
            isPaused: false,
            isConnected: false,
            volume: 100,
            repeatMode: "off",
            position: 0,
            currentTrack: null,
            queueSize: 0,
            voiceChannel: null,
          },
        });
        this.broadcastToGuild(guildId, { type: "queue_update", queue: [] });
        return;
      }
      const { PlayerManager } = await import("#managers/PlayerManager");
      const pm = new PlayerManager(player);
      // Always broadcast state update
      this.broadcastToGuild(guildId, {
        type: "state_update",
        data: this.getPlayerState(pm, guildId),
      });
      // Extra robustness: also broadcast the queue snapshot so the dashboard UI
      // is consistent when tracks end / queue ends (even if the frontend didn't refresh).
      const queue =
        player.queue?.tracks?.map((track) => ({
          title: track.info?.title || "Unknown",
          author: track.info?.author || "Unknown",
          duration: track.info?.duration || 0,
          artworkUrl: track.info?.artworkUrl || track.pluginInfo?.artworkUrl,
          uri: track.info?.uri,
          requester: track.requester || track.userData || null,
          userData: track.userData || null
        })) || [];
      this.broadcastToGuild(guildId, { type: "queue_update", queue });
    } catch (error) {
      logger.error("WebServer", "Error updating player state:", error);
    }
  }
  start() {
    this.server.listen(this.port, () => {
      const protocol = this.secure ? "https" : "http";
      logger.success(
        "WebServer",
        `🌐 Web dashboard running on ${protocol}://${this.host}:${this.port}`,
      );
      logger.info(
        "WebServer",
        `📝 API Key: ${this.apiKey} (set WEB_API_KEY in .env to change)`,
      );
      if (this.secure) {
        logger.info("WebServer", `🔒 HTTPS enabled with SSL certificates`);
      }
    });
  }
  stop() {
    return new Promise((resolve) => {
      // Legacy raw WebSocket server may be disabled (ENABLE_LEGACY_WS=false)
      if (this.wss) {
        this.wss.close(() => {
          this.server.close(() => {
            logger.info("WebServer", "Web server stopped");
            resolve();
          });
        });
        return;
      }
      this.server.close(() => {
        logger.info("WebServer", "Web server stopped");
        resolve();
      });
    });
  }
}