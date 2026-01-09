import { LavalinkManager, Player } from "lavalink-client";
import axios from 'axios';
import { logger } from "#utils/logger";
import { config } from "#config/config";
import { db } from "#database/DatabaseManager";

// Inject helper methods into Lavalink Player prototype
Player.prototype.getCurrentLyrics = async function () {
  const track = this.queue.current;
  if (!track) return null;

  // Clean up title for better search results
  const rawTitle = (track.info.title || '').trim();
  const cleanTitle = rawTitle
    .replace(/\s*[\[\(].*?[\]\)]\s*/g, '') // Remove [anything] or (anything)
    .replace(/\s*[-–—]\s*Official.*$/i, '') // Remove "- Official Video" etc.
    .replace(/\s*(Official|Video|Audio|Lyrics|HD|HQ|4K|MV)$/gi, '')
    .trim();
  const rawArtist = (track.info.author || '').trim();
  const cleanArtist = rawArtist
    .replace(/\s*[-–—]\s*Topic$/i, '') // Remove "- Topic" from YouTube
    .replace(/VEVO$/i, '')
    .trim();
  const duration = Math.floor((track.info.duration || 0) / 1000);

  // Multiple search term variations to try
  const searchTerms = [
    { title: cleanTitle, artist: cleanArtist },
    { title: rawTitle, artist: cleanArtist },
    { title: cleanTitle, artist: '' },
  ];

  // Try multiple lyrics sources
  for (const { title, artist } of searchTerms) {
    if (!title) continue;

    // 1. LRCLIB - Best for synchronized lyrics
    try {
      logger.debug(`[Player] Fetching lyrics from LRCLIB for: ${title} by ${artist}`);
      const lrcResponse = await axios.get(`https://lrclib.net/api/get`, {
        params: {
          artist_name: artist || '',
          track_name: title,
          duration: duration > 0 ? duration : undefined
        },
        timeout: 5000
      }).catch(() => null);

      if (lrcResponse?.data && (lrcResponse.data.plainLyrics || lrcResponse.data.syncedLyrics)) {
        const data = lrcResponse.data;
        const lyricsResult = {
          title: data.trackName || title,
          artist: data.artistName || artist,
          text: data.plainLyrics || data.syncedLyrics || '',
          sourceName: 'LRCLIB',
          provider: 'LRCLIB',
          image: track.info.artworkUrl,
          lines: []
        };

        if (data.syncedLyrics) {
          const lrcLines = data.syncedLyrics.split('\n');
          lrcLines.forEach(line => {
            const match = line.match(/\[(\d+):(\d+\.?\d*)\](.*)/);
            if (match) {
              const minutes = parseInt(match[1], 10);
              const seconds = parseFloat(match[2]);
              const timestamp = (minutes * 60 + seconds) * 1000;
              lyricsResult.lines.push({
                timestamp: Math.floor(timestamp),
                line: match[3].trim()
              });
            }
          });
        }

        if (lyricsResult.text || lyricsResult.lines.length > 0) return lyricsResult;
      }
    } catch (error) {
      logger.debug(`[Player] LRCLIB error: ${error.message}`);
    }

    // 2. Lyrics.ovh - Simple and reliable
    try {
      logger.debug(`[Player] Fetching from lyrics.ovh for: ${artist} - ${title}`);
      const ovhResponse = await axios.get(`https://api.lyrics.ovh/v1/${encodeURIComponent(artist || 'Unknown')}/${encodeURIComponent(title)}`, {
        timeout: 5000
      }).catch(() => null);

      if (ovhResponse?.data?.lyrics) {
        return {
          text: ovhResponse.data.lyrics,
          title: title,
          artist: artist,
          sourceName: 'Lyrics.ovh',
          provider: 'Lyrics.ovh',
          image: track.info.artworkUrl,
          lines: []
        };
      }
    } catch (error) {
      logger.debug(`[Player] lyrics.ovh error: ${error.message}`);
    }

    // 3. Lyrist API fallback
    try {
      logger.debug(`[Player] Fetching from Lyrist for: ${title}`);
      const lyristResponse = await axios.get(`https://lyrist.vercel.app/api/${encodeURIComponent(title)}/${encodeURIComponent(artist)}`, {
        timeout: 5000
      }).catch(() => null);

      if (lyristResponse?.data?.lyrics) {
        return {
          text: lyristResponse.data.lyrics,
          title: lyristResponse.data.title || title,
          artist: lyristResponse.data.artist || artist,
          sourceName: 'Lyrist',
          provider: 'Lyrist API',
          image: lyristResponse.data.image || track.info.artworkUrl,
          lines: []
        };
      }
    } catch (error) {
      logger.debug(`[Player] Lyrist error: ${error.message}`);
    }
  }

  // 4. Last resort - search LRCLIB without duration
  try {
    const searchQuery = `${cleanTitle} ${cleanArtist}`.trim();
    logger.debug(`[Player] Searching LRCLIB for: ${searchQuery}`);
    const searchResponse = await axios.get(`https://lrclib.net/api/search`, {
      params: { q: searchQuery },
      timeout: 5000
    }).catch(() => null);

    if (searchResponse?.data?.[0]) {
      const best = searchResponse.data[0];
      if (best.plainLyrics || best.syncedLyrics) {
        return {
          title: best.trackName || cleanTitle,
          artist: best.artistName || cleanArtist,
          text: best.plainLyrics || best.syncedLyrics || '',
          sourceName: 'LRCLIB Search',
          provider: 'LRCLIB',
          image: track.info.artworkUrl,
          lines: []
        };
      }
    }
  } catch (error) {
    logger.debug(`[Player] LRCLIB search error: ${error.message}`);
  }

  // Last search variation: Just the title
  try {
    const searchResponse = await axios.get(`https://lrclib.net/api/search`, {
      params: { q: cleanTitle },
      timeout: 5000
    }).catch(() => null);

    if (searchResponse?.data?.[0]) {
      const best = searchResponse.data[0];
      return {
        title: best.trackName || cleanTitle,
        artist: best.artistName || cleanArtist,
        text: best.plainLyrics || best.syncedLyrics || '',
        sourceName: 'LRCLIB (Title Search)',
        provider: 'LRCLIB',
        image: track.info.artworkUrl,
        lines: []
      };
    }
  } catch (e) { }

  return null;
};


Player.prototype.translateLyrics = async function (text, targetLang = 'en') {
  try {
    if (!text) return null;
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;
    const response = await axios.get(url, { timeout: 5000 });

    if (response.data && response.data[0]) {
      // Google Translate returns an array of chunks
      const translated = response.data[0].map(x => x[0]).join('');
      return translated;
    }
    return null;
  } catch (error) {
    logger.error(`[Player] Lyrics translation error: ${error.message}`);
    return null;
  }
};

Player.prototype.setSleepTimer = function (minutes, client) {
  if (this.sleepTimer) {
    clearTimeout(this.sleepTimer);
    this.sleepTimer = null;
    this.sleepTimeoutAt = null;
    this.set('sleepTimerEnd', null);
  }

  if (minutes <= 0) {
    if (client && this.webServer) client.webServer.updatePlayerState(this.guildId);
    return null;
  }

  const ms = minutes * 60000;
  const expireAt = Date.now() + ms;
  this.sleepTimeoutAt = expireAt;
  this.set('sleepTimerEnd', expireAt);

  this.sleepTimer = setTimeout(async () => {
    try {
      if (!this.connected) return;

      logger.info(`[Player] Sleep timer expired for guild ${this.guildId}. Stopping playback.`);

      const channelId = this.textChannelId;
      await this.stopPlaying();

      // Clear queue on sleep timer expire to be "fully" functional (stop everything)
      if (this.queue) this.queue.clear();

      if (channelId && client) {
        const channel = client.channels.cache.get(channelId);
        if (channel) {
          channel.send({
            content: `🔔 **Sleep timer expired!** The music has been stopped and queue cleared. Goodnight! 💤`,
            flags: 4096 // Suppress notifications if possible, or just standard
          }).catch(() => { });
        }
      }

      this.sleepTimer = null;
      this.sleepTimeoutAt = null;
      this.set('sleepTimerEnd', null);

      if (client && client.webServer) client.webServer.updatePlayerState(this.guildId);
    } catch (error) {
      logger.error(`[Player] Error in sleep timer: ${error.message}`);
    }
  }, ms);

  if (client && client.webServer) client.webServer.updatePlayerState(this.guildId);
  return expireAt;
};

export class MusicManager {
  constructor(client) {
    this.client = client;
    this.initialized = false;
    this.eventsManager = null;
    this.restoring = false;
    this.init();
  }

  init() {
    try {
      this.lavalink = new LavalinkManager({
        nodes: config.nodes,
        sendToShard: (guildId, payload) => {
          if (this.client.cluster) {
            return this.client.cluster.broadcastEval(
              (client, context) => {
                const guild = client.guilds.cache.get(context.guildId);
                if (guild) {
                  guild.shard.send(context.payload);
                  return true;
                }
                return false;
              },
              { context: { guildId, payload } },
            );
          } else {
            return this.client.guilds.cache.get(guildId)?.shard?.send(payload);
          }
        },
        autoSkip: true,
        client: {
          id: config.clientId || this.client.user?.id,
          username: this.client.user?.username || "MusicBot",
        },
        autoSkipOnResolveError: true,
        emitNewSongsOnly: false,
        playerOptions: {
          maxErrorsPerTime: {
            threshold: 10_000,
            maxAmount: 3,
          },
          minAutoPlayMs: 10_000,
          applyVolumeAsFilter: false,
          clientBasedPositionUpdateInterval: 50,
          defaultSearchPlatform: "ytsearch",
          onDisconnect: {
            autoReconnect: true,
            destroyPlayer: false,
          },
          useUnresolvedData: true,
        },
        queueOptions: {
          maxPreviousTracks: 10,
        },
        autoChecks: {
          sourcesValidations: false,
          pluginValidations: false,
        },
        linksAllowed: true,
        linksBlacklist: [],
        linksWhitelist: [],
      });

      this.client.on("ready", async () => {
        logger.success(
          "MusicManager",
          `🎵 ${this.client.user.tag} music system is ready!`,
        );

        this.lavalink.init(this.client.user);
        this.initialized = true;
        logger.success("MusicManager", "Initialized successfully");
      });
    } catch (error) {
      logger.error("MusicManager", "Failed to initialize music system", error);
      logger.error(
        "MusicManager",
        "❌ FATAL ERROR INITIALIZING MUSIC SYSTEM:",
        error,
      );
      this.initialized = false;
    }
  }

  formatMS_HHMMSS(ms) {
    if (!ms || ms === 0) return "0:00";

    const seconds = Math.floor(ms / 1000);
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, "0")}:${remainingSeconds.toString().padStart(2, "0")}`;
    }
    return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
  }

  async createPlayer(options) {
    if (!this.initialized) {
      logger.error("MusicManager", "Cannot create player – not initialized");
      return null;
    }

    try {
      logger.debug(
        "MusicManager",
        `🔧 DEBUG: createPlayer called with options: ${JSON.stringify(options)}`,
      );

      const { guildId, textId, voiceId } = this.parsePlayerOptions(options);

      logger.debug(
        "MusicManager",
        `🔧 DEBUG: Parsed options: ${JSON.stringify({ guildId, textId, voiceId })}`,
      );

      if (!guildId || !textId || !voiceId) {
        logger.error("MusicManager", "Missing IDs for player creation", {
          guildId,
          textId,
          voiceId,
        });
        logger.debug("MusicManager", "❌ DEBUG: Missing required IDs");
        return null;
      }

      const existing = this.lavalink.getPlayer(guildId);
      if (existing) {
        logger.debug(
          "MusicManager",
          `Player already exists for guild ${guildId}`,
        );
        logger.debug(
          "MusicManager",
          "🔧 DEBUG: Player already exists, returning existing",
        );
        return existing;
      }

      let playerVolume = 100;
      try {
        if (db) {
          playerVolume = db.guild.getDefaultVolume(guildId);
          logger.debug(
            "MusicManager",
            `🔧 DEBUG: Got default volume from database: ${playerVolume}`,
          );
          logger.debug(
            "MusicManager",
            `Using default volume ${playerVolume} for guild ${guildId}`,
          );
        } else {
          logger.debug(
            "MusicManager",
            "⚠️ DEBUG: Database or getDefaultVolume method not available, using fallback",
          );
          logger.warn(
            "MusicManager",
            "Database not available, using fallback volume 100",
          );
        }
      } catch (error) {
        logger.debug(
          "MusicManager",
          `❌ DEBUG: Error getting default volume: ${error.message}`,
        );
        logger.warn(
          "MusicManager",
          `Failed to get default volume for guild ${guildId}, using 100: ${error.message}`,
        );
        playerVolume = 100;
      }

      if (isNaN(playerVolume) || playerVolume < 1 || playerVolume > 100) {
        logger.debug(
          "MusicManager",
          `⚠️ DEBUG: Invalid volume, resetting to 100: ${playerVolume}`,
        );
        logger.warn(
          "MusicManager",
          `Invalid volume ${playerVolume}, using 100`,
        );
        playerVolume = 100;
      }

      logger.debug(
        "MusicManager",
        `🔧 DEBUG: Final volume to use: ${playerVolume}`,
      );
      logger.info(
        "MusicManager",
        `Creating player for guild ${guildId} with default volume ${playerVolume}`,
      );

      const playerConfig = {
        guildId: guildId,
        voiceChannelId: voiceId,
        textChannelId: textId,
        selfDeaf: true,
        selfMute: false,
        volume: playerVolume,
        instaUpdateFiltersFix: true,
        applyVolumeAsFilter: false,
      };

      logger.debug(
        "MusicManager",
        `🔧 DEBUG: Player config: ${JSON.stringify(playerConfig)}`,
      );

      const player = await this.lavalink.createPlayer(playerConfig);

      if (!player) {
        logger.debug(
          "MusicManager",
          "❌ DEBUG: Lavalink createPlayer returned null/undefined",
        );
        logger.error(
          "MusicManager",
          `Failed to create player for guild ${guildId}`,
        );
        return null;
      }

      logger.debug(
        "MusicManager",
        "🔧 DEBUG: Player created successfully, attempting connection",
      );

      if (!player.connected) {
        logger.debug(
          "MusicManager",
          "🔧 DEBUG: Player not connected, connecting...",
        );
        await player.connect();
        logger.debug("MusicManager", "🔧 DEBUG: Player connected");
      }

      logger.success(
        "MusicManager",
        `Player created and connected successfully for guild ${guildId} with default volume ${playerVolume}`,
      );
      logger.debug(
        "MusicManager",
        "✅ DEBUG: Player creation completed successfully",
      );
      return player;
    } catch (error) {
      logger.debug(
        "MusicManager",
        `❌ DEBUG: Error in createPlayer: ${error.message}`,
      );
      logger.error(
        "MusicManager",
        `Error creating player for guild ${options?.guildId || "unknown"}: ${error.message}`,
      );
      logger.error("MusicManager", `Full error stack: ${error.stack}`);
      return null;
    }
  }

  async search(query, options = {}) {
    if (!this.initialized) {
      logger.error("MusicManager", "Cannot search – not initialized");
      return null;
    }

    try {
      // For direct URLs, don't default to spsearch - let lavasrc handle it
      // For search queries, default to spsearch
      const isUrl = /^https?:\/\//.test(query);
      const { source, requester } = options;
      const finalSource = source || (isUrl ? undefined : "spsearch");

      const node = this.lavalink.nodeManager.leastUsedNodes("memory")[0];

      if (!node) {
        logger.error("MusicManager", "No available Lavalink nodes found");
        return null;
      }

      logger.debug("MusicManager", `Searching with query: ${query.substring(0, 100)}, source: ${finalSource || 'auto-detect'}`);

      const searchParams = finalSource
        ? { query, source: finalSource }
        : { query };

      const searchResult = await node.search(searchParams, requester);

      if (!searchResult || searchResult.loadType === "error") {
        logger.warn("MusicManager", `Search failed or returned error for query: ${query.substring(0, 100)} (loadType: ${searchResult?.loadType})`);
        return searchResult;
      }

      if (!searchResult.tracks?.length && searchResult.loadType !== "playlist") {
        logger.debug("MusicManager", `No tracks found for query: ${query.substring(0, 100)}, loadType: ${searchResult.loadType}`);
        return searchResult; // Return even if empty so caller can handle it
      }

      logger.debug("MusicManager", `Search successful: ${searchResult.tracks?.length || 0} tracks, loadType: ${searchResult.loadType}`);
      return searchResult;

    } catch (error) {
      logger.error("MusicManager", `Search error for query "${query.substring(0, 100)}": ${error.message}`, error);
      return null;
    }
  }

  getPlayer(guildId) {
    if (!this.initialized) {
      logger.warn(
        "MusicManager",
        "Attempted to get player before initialization.",
      );
      return undefined;
    }
    return this.lavalink.getPlayer(guildId);
  }

  getDefaultVolume(guildId) {
    try {
      return db.guild.getDefaultVolume(guildId);
    } catch (error) {
      logger.warn(
        "MusicManager",
        `Failed to get default volume for guild ${guildId}: ${error.message}`,
      );
      return 100;
    }
  }

  setDefaultVolume(guildId, volume) {
    try {
      db.guild.setDefaultVolume(guildId, volume);
      logger.success(
        "MusicManager",
        `Default volume set to ${volume} for guild ${guildId}`,
      );
      return true;
    } catch (error) {
      logger.error(
        "MusicManager",
        `Failed to set default volume for guild ${guildId}: ${error.message}`,
      );
      return false;
    }
  }
  async is247ModeEnabled(guildId) {
    const settings = db.guild.get247Settings(guildId);
    if (settings.enabled === true) {
      return true;
    } else {
      return false;
    }
  }

  async getSpotifyToken() {
    try {
      if (!config.spotify?.clientId || !config.spotify?.clientSecret) return null;

      const auth = Buffer.from(`${config.spotify.clientId}:${config.spotify.clientSecret}`).toString('base64');
      const response = await axios.post('https://accounts.spotify.com/api/token', 'grant_type=client_credentials', {
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        timeout: 5000
      }).catch(() => null);

      return response?.data?.access_token || null;
    } catch (error) {
      logger.debug(`[MusicManager] Failed to get Spotify token: ${error.message}`);
      return null;
    }
  }

  async getSpotifyArtwork(uri) {
    try {
      if (!uri) return null;
      const url = `https://open.spotify.com/oembed?url=${encodeURIComponent(uri)}`;
      const response = await axios.get(url, { timeout: 3000 }).catch(() => null);
      return response?.data?.thumbnail_url || null;
    } catch (error) {
      logger.debug(`[MusicManager] Failed to fetch Spotify artwork: ${error.message}`);
      return null;
    }
  }

  parsePlayerOptions(options) {
    const guildId = options.guildId;
    const voiceId = options.voiceChannelId || options.voiceChannel?.id;
    let textId = options.textChannelId || options.textChannel?.id;

    if (!textId && guildId) {
      const guild = this.client.guilds.cache.get(guildId);
      if (guild) {
        const defaultChannel = guild.channels.cache
          .filter(c => (c.type === 0 || c.type === 5) && c.permissionsFor(this.client.user).has(['SendMessages', 'ViewChannel']))
          .first();
        textId = defaultChannel?.id;
      }
    }

    if (guildId && voiceId && textId) {
      return { guildId, textId, voiceId };
    }

    logger.error(
      "MusicManager",
      "Invalid options for player creation - missing required IDs",
      { guildId, voiceId, textId }
    );
    return {};
  }
  async saveAllPlayerSessions() {
    logger.info("MusicManager", "Saving all player sessions...");
    let savedCount = 0;

    // Check if lavalink is ready
    if (!this.lavalink) {
      logger.warn("MusicManager", "Cannot save sessions: Lavalink not initialized");
      return 0;
    }

    if (!this.lavalink.players || this.lavalink.players.size === 0) {
      logger.info("MusicManager", "No active players to save.");
      return 0;
    }

    logger.info("MusicManager", `Found ${this.lavalink.players.size} players in manager.`);

    for (const [guildId, player] of this.lavalink.players) {
      // Only save if playing something or has queue
      if (!player.queue.current && player.queue.tracks.length === 0) {
        logger.debug("MusicManager", `Skipping guild ${guildId}: No current track or queue.`);
        continue;
      }

      try {
        logger.info("MusicManager", `Preparing session for guild ${guildId} (${player.queue.tracks.length} tracks in queue)`);

        let currentTrackData = null;
        if (player.queue.current) {
          const c = player.queue.current;
          currentTrackData = {
            encoded: c.encoded || null,
            info: c.info || null
          };
        }

        const sessionData = {
          guildId,
          voiceChannelId: player.voiceChannelId || player.voiceId,
          textChannelId: player.textChannelId || player.textId,
          volume: player.volume,
          loop: player.repeatMode,
          paused: player.paused,
          // Capture the current position so we can resume accurately
          position: player.position || 0,
          current: currentTrackData,
          // Save both encoded and info for queue tracks
          queue: player.queue.tracks.map(t => {
            if (typeof t === 'string') return { encoded: t };
            return {
              encoded: t.encoded || null,
              info: t.info || null
            };
          }),
        };

        // Use the db instance imported in file
        db.playerSession.saveSession(guildId, sessionData);
        savedCount++;
      } catch (error) {
        logger.error("MusicManager", `Failed to save session for guild ${guildId}`, error);
      }
    }

    logger.success("MusicManager", `Saved ${savedCount} player sessions to database.`);
    return savedCount;
  }

  async restorePlayerSessions() {
    if (this.restoring) {
      logger.debug("MusicManager", "Session restoration already in progress, skipping duplicate call.");
      return 0;
    }

    this.restoring = true;
    let restoredCount = 0;
    try {
      logger.info("MusicManager", "Starting player session restoration process...");
      const sessions = db.playerSession.getAllSessions();

      if (!sessions || sessions.length === 0) {
        logger.info("MusicManager", "No player sessions found in database to restore.");
        return 0;
      }

      logger.info("MusicManager", `Found ${sessions.length} sessions in database. Attempting to restore...`);

      for (const session of sessions) {
        const { guildId, data } = session;

        // Check if guild exists in this client/shard
        const guild = this.client.guilds.cache.get(guildId);
        if (!guild) continue; // Not managed by this shard

        try {
          const voiceChannel = guild.channels.cache.get(data.voiceChannelId);
          if (!voiceChannel) {
            logger.warn("MusicManager", `Voice channel not found for restoring session in ${guild.name}`);
            db.playerSession.deleteSession(guildId);
            continue;
          }

          // Create player
          const player = await this.createPlayer({
            guildId,
            voiceChannelId: data.voiceChannelId,
            textChannelId: data.textChannelId,
            volume: data.volume || 100,
            selfDeaf: true,
            selfMute: false
          });

          if (!player) continue;

          // Restore connected state
          if (!player.connected) {
            await player.connect();
            logger.info('MusicManager', `[SessionRestore] Connected player for guild ${guild.name}`);
          }

          // Wait for voice state to stabilize
          await new Promise(r => setTimeout(r, 2000));

          // Add current track first, then queue, then start playback
          if (data.current) {
            try {
              // Check if we have track info (required for restoration)
              // NOTE: We intentionally do NOT use encoded tracks for restoration
              // because encoded tracks are backend-specific (NodeLink vs Lavalink)
              // and cannot be decoded across different backends.
              if (data.current.info && (data.current.info.title || data.current.info.uri)) {
                // Create an unresolved track that will be searched and resolved by the current backend
                const unresolvedData = {
                  title: data.current.info.title || 'Unknown',
                  author: data.current.info.author || 'Unknown',
                  duration: data.current.info.duration || data.current.info.length || 0,
                  uri: data.current.info.uri,
                  identifier: data.current.info.identifier,
                  sourceName: data.current.info.sourceName || 'youtube',
                  artworkUrl: data.current.info.artworkUrl || '',
                  isSeekable: true,
                  isStream: false
                };

                const builder = this.lavalink.utils.buildUnresolvedTrack || this.lavalink.utils.buildUnresolved;
                if (typeof builder === 'function') {
                  const unresolvedTrack = builder.call(this.lavalink.utils, unresolvedData, { id: 'restored' });
                  if (unresolvedTrack) {
                    await player.queue.add(unresolvedTrack);
                    logger.info('MusicManager', `[SessionRestore] Added current track (unresolved) to queue: ${unresolvedData.title}`);
                  }
                } else {
                  logger.warn('MusicManager', `[SessionRestore] No buildUnresolvedTrack function available, skipping current track`);
                }
              } else {
                logger.warn('MusicManager', `[SessionRestore] Current track has no usable info, skipping`);
              }
            } catch (addError) {
              logger.warn('MusicManager', `[SessionRestore] Failed to add current track: ${addError.message}`);
            }
          }

          // Add rest of queue
          if (data.queue && Array.isArray(data.queue) && data.queue.length > 0) {
            let restoredQueueCount = 0;
            logger.info('MusicManager', `[SessionRestore] Attempting to restore ${data.queue.length} tracks...`);

            for (const t of data.queue) {
              try {
                // Always use unresolved tracks for restoration (encoded tracks are backend-specific)
                if (t.info && (t.info.title || t.info.uri)) {
                  const unresolvedData = {
                    title: t.info.title || 'Unknown',
                    author: t.info.author || 'Unknown',
                    duration: t.info.duration || t.info.length || 0,
                    uri: t.info.uri || `ytsearch:${t.info.title} ${t.info.author}`,
                    identifier: t.info.identifier || t.info.uri,
                    sourceName: t.info.sourceName || 'youtube',
                    artworkUrl: t.info.artworkUrl || '',
                    isSeekable: true,
                    isStream: false
                  };

                  // Try to build an unresolved track
                  const builder = this.lavalink.utils.buildUnresolvedTrack || this.lavalink.utils.buildUnresolved;
                  if (typeof builder === 'function') {
                    const unresolvedTrack = builder.call(this.lavalink.utils, unresolvedData, { id: 'restored' });
                    if (unresolvedTrack) {
                      await player.queue.add(unresolvedTrack);
                      restoredQueueCount++;
                    }
                  } else {
                    // Fallback: Add raw track object with proper structure
                    await player.queue.add({
                      info: unresolvedData,
                      requester: { id: 'restored' }
                    });
                    restoredQueueCount++;
                  }
                }
              } catch (err) {
                logger.warn('MusicManager', `[SessionRestore] Failed to restore a track: ${err.message}`);
              }
            }

            logger.info('MusicManager', `[SessionRestore] Successfully restored ${restoredQueueCount}/${data.queue.length} tracks.`);
            logger.info('MusicManager', `[SessionRestore] Final player.queue.tracks.length = ${player.queue.tracks.length}`);

            if (player.queue.tracks.length > 0) {
              logger.info('MusicManager', `[SessionRestore] First track in queue: ${player.queue.tracks[0]?.info?.title || 'unknown'}`);
            }
          }

          // Restore loop mode
          if (data.loop) {
            player.setRepeatMode(data.loop);
          }

          // Start playback if we have tracks
          if (player.queue.tracks.length > 0) {
            try {
              logger.info('MusicManager', `[SessionRestore] Starting playback with ${player.queue.tracks.length} tracks in queue...`);

              // If we have a stored position, pass it directly to play()
              const playOptions = {};
              if (data.position && data.position > 0) {
                playOptions.position = data.position;
                logger.info('MusicManager', `[SessionRestore] Resuming at position: ${data.position}ms`);
              }

              // Manually resolve the first track if it's unresolved to ensure position works correctly
              const firstTrack = player.queue.tracks[0];
              if (firstTrack && !firstTrack.encoded) {
                logger.info('MusicManager', `[SessionRestore] Resolving first track before playback to ensure stability...`);
                try {
                  // If it's an unresolved track from lavalink-client, it should have a resolve method
                  if (typeof firstTrack.resolve === 'function') {
                    const resolved = await firstTrack.resolve(player).catch(() => null);
                    if (resolved) {
                      player.queue.tracks[0] = resolved;
                      logger.success('MusicManager', `[SessionRestore] First track resolved: ${resolved.info.title}`);
                    }
                  }
                } catch (resolveErr) {
                  logger.warn('MusicManager', `[SessionRestore] Failed to manually resolve first track: ${resolveErr.message}`);
                }
              }

              // Small extra delay before playing after potential resolution
              await new Promise(r => setTimeout(r, 500));

              await player.play(playOptions);

              // Restore paused state if needed
              if (data.paused) {
                await player.pause();
                logger.info('MusicManager', `[SessionRestore] Restored paused state`);
              }
            } catch (playError) {
              logger.error('MusicManager', `[SessionRestore] Failed to start playback: ${playError.message}`);
            }
          }

          // Delete session data so we don't restore it again on next crash/restart loop
          db.playerSession.deleteSession(guildId);

          // Force dashboard update immediately
          if (this.client.webServer) {
            this.client.webServer.updatePlayerState(guildId);
          }

          restoredCount++;
          logger.success("MusicManager", `Restored session for guild ${guild.name}`);

          // Tiny delay to prevent rate limits if many guilds
          await new Promise(r => setTimeout(r, 1000));

        } catch (error) {
          logger.error("MusicManager", `Failed to restore session for guild ${guildId}`, error);
        }
      }
    } finally {
      this.restoring = false;
    }
    return restoredCount;
  }
}
