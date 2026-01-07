export default {
  server: {
    host: '0.0.0.0',
    port: 2333,
    password: 'MTQ1Mzk3NDM1MjY5NjQ0Mjk1MQ',
    useBunServer: false
  },
  cluster: {
    enabled: true, // Re-enabled cluster mode
    workers: 2, // Fixed 2 workers (good balance)
    minWorkers: 1,
    commandTimeout: 8000,
    fastCommandTimeout: 5000,
    maxRetries: 3,
    scaling: {
      maxPlayersPerWorker: 50,
      targetUtilization: 0.8,
      scaleUpThreshold: 0.85,
      scaleDownThreshold: 0.2,
      checkIntervalMs: 10000,
      idleWorkerTimeoutMs: 120000,
      queueLengthScaleUpFactor: 10
    }
  },

  logging: {
    level: 'info', // Reduced from 'debug' - less I/O overhead
    file: {
      enabled: false,
      path: 'logs',
      rotation: 'daily',
      ttlDays: 7
    },
    debug: {
      all: false,
      request: false, // Disabled for performance
      session: false,
      player: false,
      filters: false,
      sources: false,
      lyrics: false,
      youtube: false,
      'youtube-cipher': false
    }
  },
  connection: {
    logAllChecks: false,
    interval: 600000, // 10 minutes (reduced frequency)
    timeout: 15000, // 15 seconds
    thresholds: {
      bad: 1,
      average: 5
    }
  },
  maxSearchResults: 5, // Reduced from 10
  maxAlbumPlaylistLength: 100,
  playerUpdateInterval: 5000, // Increased from 2000ms - less WebSocket traffic
  trackStuckThresholdMs: 15000, // Increased for stability
  zombieThresholdMs: 120000, // Increased from 60s
  enableHoloTracks: true,

  enableTrackStreamEndpoint: false,
  resolveExternalLinks: true,
  fetchChannelInfo: true,
  filters: {
    enabled: {
      tremolo: true,
      vibrato: true,
      lowpass: true,
      highpass: true,
      rotation: true,
      karaoke: true,
      distortion: true,
      channelMix: true,
      equalizer: true,
      chorus: true,
      compressor: true,
      echo: true,
      phaser: true,
      timescale: true
    }
  },
  // YouTube is default - YouTube Music matching is via 'Music' client in youtube.clients.search
  defaultSearchSource: 'youtube',
  unifiedSearchSources: ['youtube', 'soundcloud'],

  sources: {
    deezer: {
      // arl: '',
      // decryptionKey: '',
      enabled: true
    },
    bandcamp: {
      enabled: true
    },
    soundcloud: {
      enabled: true
    },
    local: {
      enabled: true,
      basePath: './local-music/'
    },
    http: {
      enabled: true
    },
    vimeo: {
      // Note: not 100% of the songs are currently working (but most should.), because i need to code a different extractor for every year (2010, 2011, etc. not all are done)
      enabled: true,
    },
    flowery: {
      enabled: true,
      voice: 'Salli',
      translate: false,
      silence: 0,
      speed: 1.0,
      enforceConfig: false
    },
    jiosaavn: {
      enabled: true,
      playlistLoadLimit: 50,
      artistLoadLimit: 20
      // "secretKey": "38346591" // Optional, defaults to standard key
    },
    "google-tts": {
      enabled: true,
      language: 'en-US'
    },
    youtube: {
      enabled: true,
      allowItag: [], // additional itags for audio streams, e.g., [140, 141]
      targetItag: null, // force a specific itag for audio streams, overriding the quality option
      getOAuthToken: false,
      hl: 'en',
      gl: 'US',
      clients: {
        search: ['Android', 'Music'], // Added Music for better track matching
        playback: ['AndroidVR', 'TV', 'TVEmbedded', 'IOS'],
        resolve: ['AndroidVR', 'TV', 'TVEmbedded', 'IOS', 'Web'],
        settings: {
          TV: {
            refreshToken: [""] // You can use a string "token" or an array ["token1", "token2"] for rotation/fallback
          }
        }
      },
      cipher: {
        url: 'https://cipher.kikkia.dev/api',
        token: null
      }
    },
    instagram: {
      enabled: true
    },
    kwai: {
      enabled: true
    },
    twitch: {
      enabled: true
    },
    spotify: {
      enabled: true,
      clientId: '4c09aaef6abd4069b997b339c3f00738',
      clientSecret: '9cbab40cecf048ec8f4cbaf5f9b0bdc7',
      market: 'PH',
      playlistLoadLimit: 6, // Same as Lavalink for consistency
      playlistPageLoadConcurrency: 10, // How many pages to load simultaneously
      albumLoadLimit: 6, // Same as Lavalink
      albumPageLoadConcurrency: 5, // How many pages to load simultaneously
      allowExplicit: true // If true plays the explicit version of the song, If false plays the Non-Explicit version of the song. Normal songs are not affected.
    },
    applemusic: {
      enabled: true,
      mediaApiToken: 'token_here', //manually | or "token_here" to get a token automatically
      market: 'US',
      playlistLoadLimit: 0,
      albumLoadLimit: 0,
      playlistPageLoadConcurrency: 5,
      albumPageLoadConcurrency: 5,
      allowExplicit: true
    },
    tidal: {
      enabled: true,
      token: 'token_here', //manually | or "token_here" to get a token automatically, get from tidal web player devtools; using login google account
      countryCode: 'US',
      playlistLoadLimit: 2, // 0 = no limit, 1 = 50 tracks, 2 = 100 tracks, etc.
      playlistPageLoadConcurrency: 5 // How many pages to load simultaneously
    },
    pandora: {
      enabled: true,
      // Optional, setting this manually can help unblocking countries (since pandora is US only.). May need to be updated periodically.
      // fetching manually: use a vpn connected to US, go on pandora.com, open devtools, Network tab, first request to appear and copy the 2nd csrfToken= value.
      // csrfToken: ''
    },
    nicovideo: {
      enabled: true
    },
    reddit: {
      enabled: true
    },
    lastfm: {
      enabled: true
    }
  },
  lyrics: {
    fallbackSource: 'genius',
    youtube: {
      enabled: true
    },
    genius: {
      enabled: true
    },
    musixmatch: {
      enabled: true
      // signatureSecret: ''
    },
    lrclib: {
      enabled: true
    },
    applemusic: {
      enabled: true,
      advanceSearch: true // Uses YTMusic to fetch the correct title and artists instead of relying on messy YouTube video titles, improving lyrics accuracy
    }
  },
  audio: {
    quality: 'high', // high, medium, low, lowest
    encryption: 'aead_aes256_gcm_rtpsize',
    resamplingQuality: 'best' // best, medium, fastest, zero order holder, linear
  },
  routePlanner: {
    strategy: 'RotateOnBan', // RotateOnBan, RoundRobin, LoadBalance
    bannedIpCooldown: 600000, // 10 minutes
    ipBlocks: []
  },
  rateLimit: {
    enabled: true,
    global: {
      maxRequests: 1000,
      timeWindowMs: 60000 // 1 minute
    },
    perIp: {
      maxRequests: 100,
      timeWindowMs: 10000 // 10 seconds
    },
    perUserId: {
      maxRequests: 50,
      timeWindowMs: 5000 // 5 seconds
    },
    perGuildId: {
      maxRequests: 20,
      timeWindowMs: 5000 // 5 seconds
    },
    ignorePaths: [],
    ignore: {
      userIds: [],
      guildIds: [],
      ips: []
    }
  },
  dosProtection: {
    enabled: true,
    thresholds: {
      burstRequests: 50,
      timeWindowMs: 10000 // 10 seconds
    },
    mitigation: {
      delayMs: 500,
      blockDurationMs: 300000 // 5 minutes
    },
    ignore: {
      userIds: [],
      guildIds: [],
      ips: []
    }
  },
  metrics: {
    enabled: true,
    authorization: {
      type: 'Bearer', // Bearer or Basic.
      password: '' // If empty, uses server.password
    }
  },
  mix: {
    enabled: true,
    defaultVolume: 0.8,
    maxLayersMix: 5,
    autoCleanup: true
  },
  plugins: [
    /*  {
          name: 'nodelink-sample-plugin',
          source: 'local'
        } */
  ],
  pluginConfig: {}
}
