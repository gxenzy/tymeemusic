/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║                        TYMEE MUSIC - DISCORD PLAYER EMBED                     ║
 * ║                                                                               ║
 * ║  A premium, feature-rich Discord music player embed with:                     ║
 * ║  - Custom emoji support with dashboard management                             ║
 * ║  - Dynamic progress bars with animated emojis                                 ║
 * ║  - Rich visual design with gradient color schemes                             ║
 * ║  - Real-time status indicators and connection quality                         ║
 * ║  - Queue preview and track statistics                                         ║
 * ║  - Source-aware theming (Spotify, YouTube, etc.)                              ║
 * ║                                                                               ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */

import { EmbedBuilder, AttachmentBuilder } from 'discord.js';
import { PlayerManager } from '#managers/PlayerManager';
import MusicCard from '#structures/classes/MusicCard';

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION & CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Theme color palette for different music sources and states
 * These colors are carefully selected for optimal visibility in Discord
 */
const THEME_COLORS = {
  // Source-specific colors
  spotify: 0x1DB954,      // Spotify Green
  youtube: 0xFF0000,      // YouTube Red
  soundcloud: 0xFF5500,   // SoundCloud Orange
  deezer: 0xFEAA2D,       // Deezer Gold
  apple: 0xFC3C44,        // Apple Music Pink
  twitch: 0x9146FF,       // Twitch Purple
  bandcamp: 0x629AA9,     // Bandcamp Teal
  vimeo: 0x1AB7EA,        // Vimeo Blue

  // State colors
  playing: 0x00FFA3,      // Mint Green (Active)
  paused: 0xFFAA00,       // Amber (Paused)
  idle: 0x5865F2,         // Discord Blurple (Idle)
  error: 0xED4245,        // Discord Red (Error)
  loading: 0x5865F2,      // Discord Blurple (Loading)

  // Default/Premium themes
  default: 0x00FFA3,      // Mint Green
  premium: 0xFFCBA4,      // Peach
  neon: 0x00FFFF,         // Cyan Neon
  sunset: 0xFF6B6B,       // Coral Sunset
  ocean: 0x0077BE,        // Ocean Blue
  galaxy: 0x9B59B6,       // Galaxy Purple
  forest: 0x2ECC71,       // Forest Green
  midnight: 0x2C3E50,     // Midnight Blue
};

/**
 * Default emoji fallbacks when custom emojis are not available
 * These are used as the last resort for visual elements
 */
const DEFAULT_EMOJIS = {
  // Playback controls
  play: '▶️',
  pause: '⏸️',
  stop: '⏹️',
  skip: '⏭️',
  previous: '⏮️',
  shuffle: '🔀',
  loop: '🔁',
  loop_track: '🔂',

  // Status indicators
  playing: '🎵',
  paused: '⏸️',
  loading: '⏳',
  error: '❌',
  success: '✅',
  warning: '⚠️',
  info: 'ℹ️',

  // Volume
  volume_high: '🔊',
  volume_medium: '🔉',
  volume_low: '🔈',
  volume_mute: '🔇',

  // Progress bar (animated custom emoji names)
  pb_start: '╺',
  pb_filled: '━',
  pb_empty: '─',
  pb_head: '●',
  pb_end: '╸',
  pb_start_filled: '┣',
  pb_end_filled: '┫',

  // Sources
  source_spotify: '🟢',
  source_youtube: '🔴',
  source_soundcloud: '🟠',
  source_deezer: '🟡',
  source_apple: '🍎',
  source_twitch: '🟣',

  // UI Elements
  music: '🎵',
  artist: '🎤',
  album: '💿',
  queue: '📋',
  heart: '❤️',
  star: '⭐',
  fire: '🔥',
  sparkle: '✨',
  crown: '👑',
  trophy: '🏆',

  // Connection & Quality
  ping_good: '🟢',
  ping_medium: '🟡',
  ping_bad: '🔴',
  signal: '📶',
  globe: '🌐',
  location: '📍',

  // Time & Duration
  clock: '🕐',
  hourglass: '⏳',
  timer: '⏱️',
  calendar: '📅',

  // Features
  autoplay: '📻',
  lyrics: '📜',
  fx: '🎛️',
  sleep: '💤',
  live: '🔴',

  // Decorative
  divider: '•',
  arrow_right: '➤',
  arrow_left: '◄',
  bullet: '◦',
  diamond: '◆',
  dot: '·',
};

/**
 * Jukebox animation frames - Precisely centered for a ~31 char width
 */
const JUKEBOX_FRAMES = [
  `      ╔═══╗ ♪ ╔═══╗ ♪\n      ║███║ ♫║███║♫\n      ║\u2002(●) ║♫ ║  (O) \u2002║ ♫\n      ╚═══╝ ♪ ╚═══╝      ♪`,
  `      ╔═══╗♪  ╔═══╗    ♪\n      ║███║ ♫║███║ ♫\n      ║  (O) \u2002║ ♫║  (●) ║     ♫\n      ╚═══╝ ♪ ╚═══╝   ♪`
];

/**
 * Progress bar style configurations
 * Different visual styles for the track progress indicator
 */
const PROGRESS_BAR_STYLES = {
  classic: {
    start: '╺',
    filled: '━',
    empty: '─',
    head: '●',
    end: '╸',
    length: 25
  },
  modern: {
    start: '[',
    filled: '▪️',
    empty: '⬜',
    head: '🔶',
    end: ']',
    length: 20
  },
  neon: {
    start: '〖',
    filled: '█',
    empty: '░',
    head: '▓',
    end: '〗',
    length: 22
  },
  spotify: {
    start: '',
    filled: '▬',
    empty: '▬',
    head: '●',
    end: '',
    length: 30
  },
  minimal: {
    start: '',
    filled: '▰',
    empty: '▱',
    head: '',
    end: '',
    length: 25
  },
  blocks: {
    start: '⟦',
    filled: '■',
    empty: '□',
    head: '◈',
    end: '⟧',
    length: 20
  },
  dots: {
    start: '⟨',
    filled: '●',
    empty: '○',
    head: '◉',
    end: '⟩',
    length: 18
  },
  wave: {
    start: '≋',
    filled: '≈',
    empty: '~',
    head: '◆',
    end: '≋',
    length: 22
  },
  arrow: {
    start: '←',
    filled: '═',
    empty: '─',
    head: '◆',
    end: '→',
    length: 24
  },
  custom: {
    // Uses custom emojis from EmojiManager
    useCustom: true,
    length: 20
  }
};

/**
 * Visual decorators for embed sections
 * Unicode art and decorative elements
 */
const DECORATORS = {
  headerLine: '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
  sectionDivider: '┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄',
  boxTop: '╭──────༺♡༻──────╮',
  boxBottom: '╰──────༺♡༻──────╯',
  boxSide: '│',
  corner: {
    topLeft: '╭',
    topRight: '╮',
    bottomLeft: '╰',
    bottomRight: '╯'
  },
  arrows: {
    right: '➤',
    left: '◄',
    up: '▲',
    down: '▼'
  },
  bullets: {
    circle: '●',
    hollow: '○',
    square: '■',
    diamond: '◆',
    arrow: '➤'
  }
};

/**
 * Fancy text converters
 */
const FANCY_TEXT = {
  // Double-struck (blackboard bold) font mapping
  doubleStruck: {
    'A': '𝔸', 'B': '𝔹', 'C': 'ℂ', 'D': '𝔻', 'E': '𝔼', 'F': '𝔽', 'G': '𝔾',
    'H': 'ℍ', 'I': '𝕀', 'J': '𝕁', 'K': '𝕂', 'L': '𝕃', 'M': '𝕄', 'N': 'ℕ',
    'O': '𝕆', 'P': 'ℙ', 'Q': 'ℚ', 'R': 'ℝ', 'S': '𝕊', 'T': '𝕋', 'U': '𝕌',
    'V': '𝕍', 'W': '𝕎', 'X': '𝕏', 'Y': '𝕐', 'Z': 'ℤ',
    'a': '𝕒', 'b': '𝕓', 'c': '𝕔', 'd': '𝕕', 'e': '𝕖', 'f': '𝕗', 'g': '𝕘',
    'h': '𝕙', 'i': '𝕚', 'j': '𝕛', 'k': '𝕜', 'l': '𝕝', 'm': '𝕞', 'n': '𝕟',
    'o': '𝕠', 'p': '𝕡', 'q': '𝕢', 'r': '𝕣', 's': '𝕤', 't': '𝕥', 'u': '𝕦',
    'v': '𝕧', 'w': '𝕨', 'x': '𝕩', 'y': '𝕪', 'z': '𝕫',
    '0': '𝟘', '1': '𝟙', '2': '𝟚', '3': '𝟛', '4': '𝟜', '5': '𝟝', '6': '𝟞',
    '7': '𝟟', '8': '𝟠', '9': '𝟡', ':': ':', ' ': ' '
  },
  // Small caps font mapping
  smallCaps: {
    'a': 'ᴀ', 'b': 'ʙ', 'c': 'ᴄ', 'd': 'ᴅ', 'e': 'ᴇ', 'f': 'ғ', 'g': 'ɢ',
    'h': 'ʜ', 'i': 'ɪ', 'j': 'ᴊ', 'k': 'ᴋ', 'l': 'ʟ', 'm': 'ᴍ', 'n': 'ɴ',
    'o': 'ᴏ', 'p': 'ᴘ', 'q': 'ǫ', 'r': 'ʀ', 's': 'ꜱ', 't': 'ᴛ', 'u': 'ᴜ',
    'v': 'ᴠ', 'w': 'ᴡ', 'x': 'x', 'y': 'ʏ', 'z': 'ᴢ', ' ': ' '
  }
};

/**
 * Generate audio visualizer bars (randomized)
 */
function generateVisualizer() {
  const patterns = ['lıllılı.ıllı.ılılıılıı', 'ılılı.ıllı.ılıllılıı', 'ıllıl.ılılı.ıllılıl', 'ılıllı.lıllı.ılıılı'];
  return patterns[Math.floor(Math.random() * patterns.length)];
}

/**
 * Generate volume bar visualization
 */
function generateVolumeBar(volume) {
  const bars = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];
  const level = Math.floor((volume / 100) * 8);
  let bar = '';
  for (let i = 0; i < 8; i++) {
    bar += i < level ? bars[Math.min(i, bars.length - 1)] : '▁';
  }
  return bar;
}

/**
 * Convert text to double-struck font
 */
function toDoubleStruck(text) {
  return text.split('').map(c => FANCY_TEXT.doubleStruck[c] || c).join('');
}

/**
 * Convert text to small caps
 */
function toSmallCaps(text) {
  return text.toLowerCase().split('').map(c => FANCY_TEXT.smallCaps[c] || c).join('');
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN EMBED CLASS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * DiscordPlayerEmbed - Premium music player embed generator
 * 
 * This class provides comprehensive embed creation for the TymeeMusic bot
 * with full custom emoji support and dashboard-editable configurations.
 */
export class DiscordPlayerEmbed {

  // ═══════════════════════════════════════════════════════════════════════
  // STATIC PROPERTIES
  // ═══════════════════════════════════════════════════════════════════════

  static THEME_COLORS = THEME_COLORS;
  static DEFAULT_EMOJIS = DEFAULT_EMOJIS;
  static PROGRESS_BAR_STYLES = PROGRESS_BAR_STYLES;
  static DECORATORS = DECORATORS;

  // ═══════════════════════════════════════════════════════════════════════
  // EMOJI RESOLUTION METHODS
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Resolves an emoji from the EmojiManager or falls back to defaults
   * This is the core method for custom emoji support
   * 
   * @param {string} guildId - The guild ID to resolve emoji for
   * @param {string} emojiName - The bot name of the emoji
   * @param {Object} emojiManager - The EmojiManager instance
   * @param {string} format - Output format: 'mention', 'object', 'id', 'name'
   * @returns {Promise<string|Object>} - Resolved emoji or fallback
   */
  static async resolveEmoji(guildId, emojiName, emojiManager, format = 'mention') {
    // If no emoji manager, use default fallback
    if (!emojiManager || !guildId) {
      return DEFAULT_EMOJIS[emojiName] || '❓';
    }

    try {
      const resolved = await emojiManager.resolveEmoji(guildId, emojiName, format);
      return resolved || DEFAULT_EMOJIS[emojiName] || '❓';
    } catch (error) {
      console.error(`Error resolving emoji '${emojiName}':`, error.message);
      return DEFAULT_EMOJIS[emojiName] || '❓';
    }
  }

  /**
   * Batch resolve multiple emojis for efficiency
   * Reduces database calls when multiple emojis are needed
   * 
   * @param {string} guildId - The guild ID
   * @param {string[]} emojiNames - Array of emoji names to resolve
   * @param {Object} emojiManager - The EmojiManager instance
   * @returns {Promise<Object>} - Object mapping names to resolved emojis
   */
  static async resolveEmojis(guildId, emojiNames, emojiManager) {
    const results = {};

    if (!emojiManager || !guildId) {
      // Return all defaults if no manager
      for (const name of emojiNames) {
        results[name] = DEFAULT_EMOJIS[name] || '❓';
      }
      return results;
    }

    // Use batch resolution if available
    try {
      if (typeof emojiManager.resolveEmojis === 'function') {
        return await emojiManager.resolveEmojis(guildId, emojiNames);
      }

      // Fallback to individual resolution
      for (const name of emojiNames) {
        results[name] = await this.resolveEmoji(guildId, name, emojiManager);
      }
      return results;
    } catch (error) {
      console.error('Error batch resolving emojis:', error.message);
      for (const name of emojiNames) {
        results[name] = DEFAULT_EMOJIS[name] || '❓';
      }
      return results;
    }
  }

  /**
   * Get player-specific emojis (commonly used in player UI)
   * 
   * @param {string} guildId - The guild ID
   * @param {Object} emojiManager - The EmojiManager instance
   * @returns {Promise<Object>} - Object with all player emojis
   */
  static async getPlayerEmojis(guildId, emojiManager) {
    const emojiNames = [
      'play', 'pause', 'stop', 'skip', 'previous', 'shuffle', 'loop', 'loop_track',
      'volume_high', 'volume_medium', 'volume_low', 'volume_mute',
      'playing', 'paused', 'loading', 'error', 'success', 'warning',
      'music', 'artist', 'album', 'queue', 'heart', 'star', 'fire', 'sparkle',
      'autoplay', 'lyrics', 'fx', 'sleep', 'live',
      'pb_start', 'pb_filled', 'pb_empty', 'pb_head', 'pb_end',
      'source_spotify', 'source_youtube', 'source_soundcloud',
      'ping_good', 'ping_medium', 'ping_bad', 'signal', 'globe', 'location'
    ];

    return await this.resolveEmojis(guildId, emojiNames, emojiManager);
  }

  /**
   * Get legacy emoji format for backwards compatibility
   * 
   * @param {Object} guild - Discord guild object
   * @param {Object} client - Discord client
   * @returns {Object} - Emoji map with legacy format
   */
  static getEmojis(guild, client = null) {
    if (!guild && !client) {
      return {
        music: '🎵',
        artist: '🎤',
        status: '📊',
        paused: '⏸️',
        playing: '▶️',
        volume: '🔊',
        loop: '🔁',
        off: '❌',
        track: '🔂',
        queue: '📋',
        voice: '🔈',
        idle: '💤'
      };
    }

    const emojiNames = {
      music: ['music', 'nowplaying', 'np', '🎵'],
      artist: ['artist', 'microphone', 'singer', '🎤'],
      status: ['status', 'stats', '📊'],
      paused: ['pause', 'paused', '⏸️'],
      playing: ['play', 'playing', 'resume', '▶️'],
      volume: ['volume', 'vol', '🔊'],
      loop: ['loop', 'repeat', '🔁'],
      off: ['off', 'disabled', '❌'],
      track: ['track', 'song', '🔂'],
      queue: ['queue', 'list', 'playlist', '📋'],
      voice: ['voice', 'channel', 'speaker', '🔈'],
      idle: ['idle', 'sleep', '💤']
    };

    const emojis = {};
    for (const [key, names] of Object.entries(emojiNames)) {
      let found = null;
      if (guild) {
        found = guild.emojis.cache.find(e =>
          names.some(name => e.name.toLowerCase().includes(name.toLowerCase()) || e.name === name)
        );
      }
      if (!found && client) {
        found = client.emojis.cache.find(e =>
          names.some(name => e.name.toLowerCase().includes(name.toLowerCase()) || e.name === name)
        );
      }
      emojis[key] = found ? `<:${found.name}:${found.id}>` : names[names.length - 1];
    }

    return emojis;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // SOURCE DETECTION & THEMING
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Detect the music source from track info
   * 
   * @param {Object} track - The track object
   * @returns {string} - Source name (lowercase)
   */
  static detectSource(track) {
    if (!track?.info) return 'unknown';

    const sourceName = (
      track.requester?.originalSource ||
      track.userData?.originalSource ||
      track.info?.sourceName ||
      'unknown'
    ).toLowerCase();

    // Check URI for additional context
    const uri = track.info?.uri || '';

    if (uri.includes('spotify.com') || sourceName.includes('spotify')) return 'spotify';
    if (uri.includes('youtube.com') || uri.includes('youtu.be') || sourceName.includes('youtube')) return 'youtube';
    if (uri.includes('soundcloud.com') || sourceName.includes('soundcloud')) return 'soundcloud';
    if (uri.includes('deezer.com') || sourceName.includes('deezer')) return 'deezer';
    if (uri.includes('music.apple.com') || sourceName.includes('apple')) return 'apple';
    if (uri.includes('twitch.tv') || sourceName.includes('twitch')) return 'twitch';
    if (uri.includes('bandcamp.com') || sourceName.includes('bandcamp')) return 'bandcamp';
    if (uri.includes('vimeo.com') || sourceName.includes('vimeo')) return 'vimeo';

    return sourceName || 'unknown';
  }

  /**
   * Get the appropriate color for the current source/state
   * 
   * @param {Object} track - The track object
   * @param {Object} pm - PlayerManager instance
   * @returns {number} - Discord color value
   */
  static getThemeColor(track, pm) {
    // Priority: State colors first
    if (pm?.isPaused) return THEME_COLORS.paused;

    // Source-specific colors
    const source = this.detectSource(track);
    if (THEME_COLORS[source]) return THEME_COLORS[source];

    // Default playing color
    return THEME_COLORS.playing;
  }

  /**
   * Get the source emoji (custom or fallback)
   * 
   * @param {string} source - Source name
   * @param {Object} guild - Discord guild
   * @param {Object} client - Discord client
   * @returns {string} - Emoji string
   */
  static getSourceEmoji(source, guild, client = null) {
    if (!guild && !client) {
      const sourceEmojis = {
        youtube: '📺',
        spotify: '🎵',
        soundcloud: '☁️',
        deezer: '🎧',
        apple: '🍎',
        twitch: '📺',
        bandcamp: '🎸',
        vimeo: '🎬',
        default: '🎵'
      };
      return sourceEmojis[source?.toLowerCase()] || sourceEmojis.default;
    }

    // Try to find server emoji for source
    let emoji = null;
    const searchTerms = {
      youtube: ['youtube', 'yt'],
      spotify: ['spotify', 'sp'],
      soundcloud: ['soundcloud', 'sc'],
      deezer: ['deezer'],
      apple: ['apple', 'applemusic'],
      twitch: ['twitch'],
      bandcamp: ['bandcamp'],
      vimeo: ['vimeo']
    };

    const terms = searchTerms[source?.toLowerCase()] || [source?.toLowerCase()];

    if (guild) {
      emoji = guild.emojis.cache.find(e =>
        terms.some(term => e.name.toLowerCase().includes(term))
      );
    }

    if (!emoji && client) {
      emoji = client.emojis.cache.find(e =>
        terms.some(term => e.name.toLowerCase().includes(term))
      );
    }

    if (emoji) {
      return emoji.animated ? `<a:${emoji.name}:${emoji.id}>` : `<:${emoji.name}:${emoji.id}>`;
    }

    const sourceEmojis = {
      youtube: '📺',
      spotify: '🎵',
      soundcloud: '☁️',
      deezer: '🎧',
      apple: '🍎',
      twitch: '📺',
      bandcamp: '🎸',
      vimeo: '🎬',
      default: '🎵'
    };
    return sourceEmojis[source?.toLowerCase()] || sourceEmojis.default;
  }

  /**
   * Get source icon URL for embed footer/author
   * 
   * @param {string} source - Source name
   * @returns {string} - Icon URL
   */
  static getSourceIconUrl(source) {
    const icons = {
      spotify: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/19/Spotify_logo_without_text.svg/1024px-Spotify_logo_without_text.svg.png',
      youtube: 'https://www.youtube.com/s/desktop/12d6b690/img/favicon_144.png',
      soundcloud: 'https://a-v2.sndcdn.com/assets/images/sc-icons/favicon-2cadd14b.ico',
      deezer: 'https://e-cdns-files.dzcdn.net/img/common/favicon/icon-192.png',
      apple: 'https://music.apple.com/assets/favicon/favicon-180.png',
      twitch: 'https://static.twitchcdn.net/assets/favicon-32-e29e246c157142c94346.png',
      default: 'https://cdn.discordapp.com/emojis/837570776794009610.png'
    };
    return icons[source?.toLowerCase()] || icons.default;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // PROGRESS BAR GENERATION
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Create a classic progress bar
   * 
   * @param {number} progress - Progress value (0-1)
   * @param {number} length - Bar length in characters
   * @returns {string} - Progress bar string
   */
  static createProgressBar(progress, length = 20) {
    const filled = Math.round(progress * length);
    const empty = length - filled;
    return '▰'.repeat(filled) + '▱'.repeat(empty);
  }

  /**
   * Create a Spotify-style progress bar
   * 
   * @param {number} progress - Progress value (0-1)
   * @param {number} length - Bar length
   * @returns {string} - Spotify-style progress bar
   */
  static createSpotifyProgressBar(progress, length = 35) {
    if (progress <= 0) return '○' + '▬'.repeat(length - 1);
    if (progress >= 1) return '▬'.repeat(length - 1) + '●';

    const filled = Math.round(progress * length);
    if (filled === 0) return '○' + '▬'.repeat(length - 1);
    if (filled >= length) return '▬'.repeat(length - 1) + '●';

    const beforeIndicator = Math.max(0, filled - 1);
    const afterIndicator = Math.max(0, length - filled);

    return '▬'.repeat(beforeIndicator) + '●' + '▬'.repeat(afterIndicator);
  }

  /**
   * Create a modern progress bar with peach theme
   * 
   * @param {number} progress - Progress value (0-1)
   * @param {number} length - Bar length
   * @returns {string} - Modern progress bar
   */
  static createModernProgressBar(progress, length = 35) {
    const filledBar = '▪️';
    const emptyBar = '⬜';
    const indicator = '🔶';

    if (progress <= 0) return indicator + emptyBar.repeat(length - 1);
    if (progress >= 1) return filledBar.repeat(length);

    const filled = Math.round(progress * length);
    if (filled === 0) return indicator + emptyBar.repeat(length - 1);
    if (filled >= length) return filledBar.repeat(length);

    const beforeIndicator = filled - 1;
    const afterIndicator = Math.max(0, length - filled - 1);

    return filledBar.repeat(beforeIndicator) + indicator + emptyBar.repeat(afterIndicator);
  }

  /**
   * Create a neon-style progress bar
   * 
   * @param {number} progress - Progress value (0-1)
   * @param {number} length - Bar length
   * @returns {string} - Neon progress bar
   */
  static createNeonProgressBar(progress, length = 22) {
    const filled = Math.round(progress * length);
    const empty = length - filled;

    return '〖' + '█'.repeat(filled) + '░'.repeat(empty) + '〗';
  }

  /**
   * Create a block-style progress bar
   * 
   * @param {number} progress - Progress value (0-1)
   * @param {number} length - Bar length
   * @returns {string} - Block progress bar
   */
  static createBlockProgressBar(progress, length = 20) {
    const filled = Math.round(progress * length);
    const empty = length - filled;

    let bar = '⟦';
    for (let i = 0; i < length; i++) {
      if (i < filled - 1) bar += '■';
      else if (i === filled - 1 && filled > 0) bar += '◈';
      else bar += '□';
    }
    return bar + '⟧';
  }

  /**
   * Create a wave-style progress bar
   * 
   * @param {number} progress - Progress value (0-1)
   * @param {number} length - Bar length
   * @returns {string} - Wave progress bar
   */
  static createWaveProgressBar(progress, length = 22) {
    const filled = Math.round(progress * length);

    let bar = '≋';
    for (let i = 0; i < length; i++) {
      if (i < filled - 1) bar += '≈';
      else if (i === filled - 1 && filled > 0) bar += '◆';
      else bar += '~';
    }
    return bar + '≋';
  }

  /**
   * Create an animated progress bar using custom emojis
   * 
   * @param {string} guildId - Guild ID for emoji resolution
   * @param {Object} emojiManager - EmojiManager instance
   * @param {number} progress - Progress value (0-1)
   * @param {number} length - Bar length
   * @returns {Promise<string>} - Animated progress bar with custom emojis
   */
  static async createAnimatedProgressBar(guildId, emojiManager, progress, length = 25) {
    if (!emojiManager) {
      return this.createModernProgressBar(progress, length);
    }

    try {
      const emojis = await emojiManager.getPlayerEmojis(guildId);

      // Check if we have custom progress bar emojis
      const hasCustom = emojis.pb_start && emojis.pb_filled &&
        emojis.pb_empty && emojis.pb_head && emojis.pb_end;

      if (!hasCustom) {
        return this.createModernProgressBar(progress, length);
      }

      const filled = Math.round(progress * length);
      const emptyCount = Math.max(0, length - filled - 1);

      return emojis.pb_start +
        emojis.pb_filled.repeat(Math.max(0, filled)) +
        emojis.pb_head +
        emojis.pb_empty.repeat(emptyCount) +
        emojis.pb_end;
    } catch (error) {
      console.error('Error creating animated progress bar:', error.message);
      return this.createModernProgressBar(progress, length);
    }
  }

  /**
   * Create a progress bar with custom style selection
   * 
   * @param {number} progress - Progress value (0-1)
   * @param {string} style - Style name from PROGRESS_BAR_STYLES
   * @param {number} customLength - Optional custom length
   * @returns {string} - Progress bar in specified style
   */
  static createStyledProgressBar(progress, style = 'modern', customLength = null) {
    const styleConfig = PROGRESS_BAR_STYLES[style] || PROGRESS_BAR_STYLES.modern;
    const length = customLength || styleConfig.length;

    switch (style) {
      case 'spotify':
        return this.createSpotifyProgressBar(progress, length);
      case 'neon':
        return this.createNeonProgressBar(progress, length);
      case 'blocks':
        return this.createBlockProgressBar(progress, length);
      case 'wave':
        return this.createWaveProgressBar(progress, length);
      case 'minimal':
        return this.createProgressBar(progress, length);
      case 'modern':
      default:
        return this.createModernProgressBar(progress, length);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // TIME & DURATION FORMATTING
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Format milliseconds to human-readable time
   * 
   * @param {number} ms - Time in milliseconds
   * @returns {string} - Formatted time string (e.g., "3:45" or "1:23:45")
   */
  static formatTime(ms) {
    if (!ms || ms < 0) return '0:00';

    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  /**
   * Format duration to verbose string
   * 
   * @param {number} ms - Time in milliseconds
   * @returns {string} - Verbose duration (e.g., "1h 23m 45s")
   */
  static formatDurationVerbose(ms) {
    if (!ms || ms < 0) return '0s';

    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const parts = [];
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`);

    return parts.join(' ');
  }

  /**
   * Format relative time for display
   * 
   * @param {number} timestamp - Unix timestamp in milliseconds
   * @returns {string} - Discord timestamp format
   */
  static formatRelativeTime(timestamp) {
    return `<t:${Math.floor(timestamp / 1000)}:R>`;
  }

  /**
   * Calculate estimated end time
   * 
   * @param {number} position - Current position in ms
   * @param {number} duration - Total duration in ms
   * @param {number} speed - Playback speed multiplier
   * @returns {string} - Discord timestamp for end time
   */
  static calculateEndTime(position, duration, speed = 1.0) {
    const remaining = (duration - position) / speed;
    const endTimestamp = Date.now() + remaining;
    return `<t:${Math.floor(endTimestamp / 1000)}:t>`;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // TEXT FORMATTING & UTILITIES
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Escape markdown characters in text
   * 
   * @param {string} text - Text to escape
   * @returns {string} - Escaped text
   */
  static escapeMarkdown(text) {
    if (!text) return '';
    return text
      .replace(/\*/g, '\\*')
      .replace(/_/g, '\\_')
      .replace(/~/g, '\\~')
      .replace(/`/g, '\\`')
      .replace(/\|/g, '\\|')
      .replace(/\n/g, ' ');
  }

  /**
   * Truncate text to specified length with ellipsis
   * 
   * @param {string} text - Text to truncate
   * @param {number} maxLength - Maximum length
   * @param {string} suffix - Suffix to add if truncated
   * @returns {string} - Truncated text
   */
  static truncateText(text, maxLength = 50, suffix = '...') {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - suffix.length) + suffix;
  }

  /**
   * Create a hyperlink with safe URL handling
   * 
   * @param {string} text - Link text
   * @param {string} url - URL
   * @returns {string} - Markdown hyperlink or plain text
   */
  static createLink(text, url) {
    if (!url || (!url.startsWith('http://') && !url.startsWith('https://'))) {
      return `**${this.escapeMarkdown(text)}**`;
    }
    return `[${this.escapeMarkdown(text)}](${url})`;
  }

  /**
   * Get connection quality indicator
   * 
   * @param {number} ping - Ping in milliseconds
   * @param {Object} emojis - Emoji map
   * @returns {string} - Quality indicator emoji and text
   */
  static getConnectionQuality(ping, emojis = {}) {
    if (ping < 50) {
      return `${emojis.ping_good || '🟢'} Excellent`;
    } else if (ping < 150) {
      return `${emojis.ping_medium || '🟡'} Good`;
    } else if (ping < 300) {
      return `${emojis.ping_medium || '🟠'} Fair`;
    } else {
      return `${emojis.ping_bad || '🔴'} Poor`;
    }
  }

  /**
   * Get volume indicator emoji
   * 
   * @param {number} volume - Volume percentage (0-100)
   * @param {Object} emojis - Emoji map
   * @returns {string} - Volume emoji
   */
  static getVolumeEmoji(volume, emojis = {}) {
    if (volume === 0) return emojis.volume_mute || '🔇';
    if (volume < 33) return emojis.volume_low || '🔈';
    if (volume < 66) return emojis.volume_medium || '🔉';
    return emojis.volume_high || '🔊';
  }

  /**
   * Get repeat mode display
   * 
   * @param {string} mode - Repeat mode ('off', 'track', 'queue')
   * @param {Object} emojis - Emoji map
   * @returns {Object} - Display info with emoji and text
   */
  static getRepeatModeDisplay(mode, emojis = {}) {
    switch (mode) {
      case 'track':
        return { emoji: emojis.loop_track || '🔂', text: 'Track', active: true };
      case 'queue':
        return { emoji: emojis.loop || '🔁', text: 'Queue', active: true };
      default:
        return { emoji: '❌', text: 'Off', active: false };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // SYNCHRONOUS EMBED CREATION (Legacy Support)
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Create a player embed synchronously (legacy method)
   * Use createPlayerEmbedAsync for full custom emoji support
   * 
   * @param {Object} pm - PlayerManager instance
   * @param {Object} guild - Discord guild object
   * @param {number} currentPosition - Current track position in ms
   * @param {Object} client - Discord client
   * @returns {EmbedBuilder} - Discord embed
   */
  static createPlayerEmbed(pm, guild, currentPosition = null, client = null) {
    const track = pm.currentTrack;
    const player = pm.player;
    const position = currentPosition !== null ? currentPosition : (player?.position ?? pm.position ?? 0);
    const duration = track?.info?.duration || 0;
    const isStream = track?.info?.isStream || duration === 0;
    const progress = isStream ? 1 : (duration > 0 ? Math.min(Math.max(0, position) / duration, 1) : 0);

    // Get theme color based on source
    const themeColor = this.getThemeColor(track, pm);

    // Get emojis with legacy method
    const emojis = this.getEmojis(guild, client);

    const embed = new EmbedBuilder()
      .setColor(themeColor)
      .setTimestamp();

    if (track) {
      const artworkUrl = track.info?.artworkUrl || track.pluginInfo?.artworkUrl;
      if (artworkUrl) {
        embed.setThumbnail(artworkUrl);
      }

      // Modern header
      embed.setAuthor({
        name: `${emojis.music} Now Playing`,
        iconURL: this.getSourceIconUrl(this.detectSource(track))
      });

      // Track info - prioritize original metadata
      const title = this.escapeMarkdown(
        track.requester?.originalTitle ||
        track.userData?.originalTitle ||
        track.info?.title ||
        'Unknown'
      );
      const artist = this.escapeMarkdown(
        track.requester?.originalAuthor ||
        track.userData?.originalAuthor ||
        track.info?.author ||
        'Unknown Artist'
      );

      // Requester display
      const requester = track.requester
        ? (track.requester.id ? `<@${track.requester.id}>` : (track.requester.username || track.requester.tag || 'Unknown'))
        : 'Unknown';

      embed.setDescription(
        `**${title}**\n` +
        `${emojis.artist} ${artist}\n\n` +
        `**Requested by:** ${requester}`
      );

      // Calculate timescale
      const fm = pm.player?.filterManager;
      const ts = fm?.timescale || fm?.filters?.timescale || fm?.data?.timescale || {};
      const speed = ts.speed || 1.0;
      const rate = ts.rate || 1.0;
      const effectiveTimescale = speed * rate;

      const currentTime = this.formatTime(position / effectiveTimescale);
      const totalTime = isStream ? '🔴 LIVE' : this.formatTime(duration / effectiveTimescale);

      // Progress bar
      const progressBar = this.createModernProgressBar(progress, 30);

      embed.addFields({
        name: '\u200b',
        value: `\`${currentTime}\` ${progressBar} \`${totalTime}\``,
        inline: false,
      });

      // Status info
      const statusValue = pm.isPaused ? `${emojis.paused} Paused` : `${emojis.playing} Playing`;
      const volumeEmoji = this.getVolumeEmoji(pm.volume, emojis);
      const volumeValue = `${volumeEmoji} ${pm.volume}%`;
      const loopDisplay = this.getRepeatModeDisplay(pm.repeatMode, emojis);
      const loopValue = `${loopDisplay.emoji} ${loopDisplay.text}`;

      // Connection quality
      const botPing = client?.ws?.ping ?? 0;
      const lavaPing = player?.node?.ping ?? 0;
      const region = guild?.channels?.cache?.get(player?.voiceChannelId)?.rtcRegion || 'Auto';

      embed.addFields(
        {
          name: '\u200b',
          value: `${statusValue}  •  ${volumeValue}  •  ${loopValue}  •  📋 ${pm.queueSize} tracks`,
          inline: false,
        },
        {
          name: '\u200b',
          value: `📡 Ping: ${botPing}/${lavaPing}ms  •  📍 ${region.toUpperCase()}`,
          inline: false,
        }
      );

      // Footer with source
      const source = this.detectSource(track);
      const sourceEmoji = this.getSourceEmoji(source, guild, client);
      embed.setFooter({
        text: `${source.toUpperCase()} • TymeeMusic`,
        iconURL: guild?.iconURL() || undefined
      });
    } else {
      embed.setDescription(`${emojis.idle} No track is currently playing.`);
    }

    return embed;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // ASYNC EMBED CREATION (Full Custom Emoji Support)
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Create a premium player embed with full custom emoji support
   * This is the recommended method for creating player embeds
   * 
   * @param {Object} pm - PlayerManager instance
   * @param {Object} guild - Discord guild object
   * @param {number} currentPosition - Current track position in ms
   * @param {Object} client - Discord client
   * @param {Object} trackOverride - Optional track to use instead of current
   * @returns {Promise<EmbedBuilder>} - Discord embed
   */
  static async createPlayerEmbedAsync(pm, guild, currentPosition = null, client = null, trackOverride = null) {
    const track = trackOverride || pm.currentTrack;
    const player = pm.player;
    const position = currentPosition !== null ? currentPosition : (player?.position ?? pm.position ?? 0);
    const duration = track?.info?.duration || 0;
    const isStream = track?.info?.isStream || duration === 0;
    const progress = isStream ? 1 : (duration > 0 ? Math.min(Math.max(0, position) / duration, 1) : 0);

    // Get emojis from EmojiManager
    const emojiManager = client?.emojiManager;
    const guildId = guild?.id;
    const emojis = emojiManager && guildId
      ? await emojiManager.getPlayerEmojis(guildId)
      : this.getEmojis(guild, client);

    const artworkUrl = track?.info?.artworkUrl || track?.pluginInfo?.artworkUrl;
    const source = this.detectSource(track);
    const themeColor = this.getThemeColor(track, pm);

    // Visual decorators
    const divider = '─────────────────────────────────────';

    const embed = new EmbedBuilder()
      .setColor(themeColor)
      .setTimestamp();

    if (track) {
      // ════════════════════════════════════════════════════════════════
      // 🎵 PREPARE DATA
      // ════════════════════════════════════════════════════════════════

      const title = track.requester?.originalTitle || track.userData?.originalTitle || track.info?.title || 'Unknown';
      const fm = pm.player?.filterManager;
      const ts = fm?.timescale || fm?.filters?.timescale || fm?.data?.timescale || {};
      const effectiveTimescale = (ts.speed || 1.0) * (ts.rate || 1.0);

      const currentTime = this.formatTime(position / effectiveTimescale);
      const totalTime = isStream ? 'LIVE' : this.formatTime(duration / effectiveTimescale);

      // Target Width: 41 chars for borders
      const borderTop =    `╭───────────────༺♡༻──────────────╮`;
      const borderBottom = `╰───────────────༺♡༻──────────────╯`;

      const fancyTitle = toDoubleStruck(title);
      const fancyCurrentTime = toDoubleStruck(currentTime);
      const fancyTotalTime = toDoubleStruck(totalTime);
      const fancyVolLabel = toSmallCaps('\u2002ᴠᴏʟᴜᴍᴇ:');

      const visualizer = 'ılılı.ıllı.ılı.ıllı.ılılı.ıllı..ılılı.ıll';
      const jukeboxFrame = JUKEBOX_FRAMES[Math.floor(Math.random() * JUKEBOX_FRAMES.length)];

      // ════════════════════════════════════════════════════════════════
      // 🎨 BUILD DESCRIPTION (Custom or Strikingly Centered)
      // ════════════════════════════════════════════════════════════════

      let customTemplate = null;
      try {
        if (client?.database?.guild) {
          const settings = await client.database.guild.getMusicCardSettings(guildId);
          if (settings && settings.descriptionTemplate) {
            customTemplate = settings.descriptionTemplate;
          }
        }
      } catch (e) {
        // Silently fail to default
      }

      let description = '';

      if (customTemplate) {
        const safeTitle = track.info.title || 'Unknown Title';
        const fancyTitleStr = toDoubleStruck(safeTitle);
        const safeUrl = track.info.uri || '';
        const safeAuthor = track.info.author || 'Unknown Artist';
        const safeRequester = track.requester?.username || track.userData?.requester?.username || 'Unknown';
        const statusIcon = pm.isPaused ? '⏸️' : '▶️';

        const progressLengthCustom = 10;
        const filledLengthCustom = Math.round(progress * progressLengthCustom);
        const emptyLengthCustom = progressLengthCustom - filledLengthCustom;
        // Replicating exact progress line style used in default
        const barCustom = '━'.repeat(filledLengthCustom) + '❍' + '──────────'.substring(0, emptyLengthCustom);

        const volBar = generateVolumeBar(pm.volume);

        // Complex components
        const controls = `\u2002\u2002\u2002\u2002↻ ◁◁  ${pm.isPaused ? '▶' : '▐  ▌'}  ▷▷ ↺`;
        const volumeBox = `   ╔══════════════════════╗\n   ║      ${volBar} ${pm.volume}%   |\n   ╚══════════════════════╝`;

        description = customTemplate
          .replace(/{{title}}/g, safeTitle)
          .replace(/{{fancyTitle}}/g, fancyTitleStr)
          .replace(/{{url}}/g, safeUrl)
          .replace(/{{author}}/g, safeAuthor)
          .replace(/{{duration}}/g, toDoubleStruck(totalTime))
          .replace(/{{currentTime}}/g, toDoubleStruck(currentTime))
          .replace(/{{progressBar}}/g, barCustom)
          .replace(/{{volume}}/g, pm.volume)
          .replace(/{{volumeBar}}/g, volBar)
          .replace(/{{volumeBox}}/g, volumeBox)
          .replace(/{{requester}}/g, safeRequester)
          .replace(/{{statusIcon}}/g, statusIcon)
          .replace(/{{visualizer}}/g, visualizer)
          .replace(/{{jukebox}}/g, jukeboxFrame)
          .replace(/{{controls}}/g, controls)
          .replace(/{{borderTop}}/g, borderTop)
          .replace(/{{borderBottom}}/g, borderBottom);
      } else {
        // DEFAULT LAYOUT
        // 🛠️ DYNAMIC ALIGNMENT: Calculate padding to center titles of any length
        const titlePaddingNum = Math.max(2, Math.floor((36 - (title.length * 1.1)) / 2));
        const titlePadding = '\u2002'.repeat(titlePaddingNum);

        description = `${borderTop}\n` +
          `\u2002\u2002\u2002\u2002\u2002\u2002\u2002\u2002\u2002\u2002\u2002\u2002\u2002\u2002\u2002\u2002ɴᴏᴡ ᴘʟᴀʏɪɴɢ\n` +
          `${titlePadding}${fancyTitle}\n` +
          `\u2002\u2002\u2002\u2002\u2002\u2002\u2002\u2002\u2002\u2002\u2002${visualizer}\n\n`;

        // Progress Bar Section
        const progressLength = 24;
        const filledLength = Math.round(progress * progressLength);
        const emptyLength = progressLength - filledLength;
        const progressLine = '━'.repeat(filledLength) + '❍' + '────────────────────────'.substring(0, emptyLength);

        description += `\u2002\u2002${fancyCurrentTime}   ${progressLine}   ${fancyTotalTime}\n` +
          `\u2002\u2002\u2002\u2002\u2002\u2002\u2002\u2002\u2002\u2002↻ \u2002\u2002◁◁\u2002\u2002  ${pm.isPaused ? '\u2002\u2002▶' : '▐  ▌'}  \u2002\u2002▷▷ \u2002\u2002↺\n\n`;

        // Volume Section
        const volBar = generateVolumeBar(pm.volume);
        description += `${fancyVolLabel}\n` +
          `\u2002╔══════════════════════════╗\n` +
          `\u2002║\u2002\u2002\u2002\u2002\u2002\u2002\u2002\u2002\u2002\u2002\u2002\u2002${volBar} ${pm.volume}%\u2002\u2002\u2002\u2002\u2002\u2002\u2002\u2002\u2002\u2002║\n` +
          `\u2002╚══════════════════════════╝\n` +
          `${borderBottom}\n\n`;

        // Dual Jukebox (Centered)
        description += `${jukeboxFrame}\n\n`;
      }

      if (description.length > 4096) {
        description = description.substring(0, 4093) + '...';
      }
      embed.setDescription(description);

      // ════════════════════════════════════════════════════════════════
      // 📊 STATUS & INFO
      // ════════════════════════════════════════════════════════════════

      const autoplay = player?.get('autoplayEnabled') ? '✅' : '❌';
      const botPing = client?.ws?.ping ?? 0;
      const region = guild?.channels?.cache?.get(player?.voiceChannelId)?.rtcRegion || 'AUTO';
      const loopIcon = pm.repeatMode === 'off' ? '❌' : pm.repeatMode === 'track' ? '🔂' : '🔁';

      embed.addFields(
        {
          name: '✨ ᴘʟᴀʏᴇʀ ꜱᴛᴀᴛᴜꜱ',
          value: `${pm.isPaused ? '⏸️' : '▶️'} ${pm.isPaused ? 'Paused' : 'Playing'} ︱ 🔊 ${pm.volume}% ︱ ${loopIcon} ${pm.repeatMode.toUpperCase()} ︱ 📋 ${pm.queueSize} tracks`,
          inline: false
        },
        {
          name: '📡 ꜱᴇꜱꜱɪᴏɴ ɪɴꜰᴏ',
          value: `📻 Radio: ${autoplay} ︱ 📶 ${botPing}ms ︱ 📍 ${region.toUpperCase()}`,
          inline: false
        }
      );

      // 🖼️ GENERATE LANDSCAPE ALBUM ART (User Requested)
      try {
          const trackId = track?.info?.identifier || track?.info?.uri || 'unknown';
          let cardBuffer;

          // ⭐ 1. TRY PERMANENT CDN URL (BEST - NO FLICKER)
          // If we already sent this image once, Discord gave us a URL. Reusing it is 100% flicker-free.
          if (pm.player && pm.player.cachedCard && pm.player.cachedCard.id === trackId && pm.player.cachedCard.url) {
              embed.setImage(pm.player.cachedCard.url);
              embed.setThumbnail(null);
          } 
          // 💿 2. TRY CACHED BUFFER (FASTER - NO RE-GENERATE)
          else if (pm.player && pm.player.cachedCard && pm.player.cachedCard.id === trackId && pm.player.cachedCard.buffer) {
              cardBuffer = pm.player.cachedCard.buffer;
              const attachment = new AttachmentBuilder(cardBuffer, { name: 'album_art.png' });
              embed.setImage('attachment://album_art.png');
              embed.setThumbnail(null); 
              embed.file = attachment; 
          } 
          // 🎨 3. GENERATE FRESH
          else {
              const musicCard = new MusicCard();
              if (typeof musicCard.createLandscapeCard === 'function') {
                  cardBuffer = await musicCard.createLandscapeCard(track, guildId);
                  
                  // Save Buffer to Cache
                  if (pm.player) {
                      pm.player.cachedCard = {
                          id: trackId,
                          buffer: cardBuffer,
                          url: null // Will be populated after message send/edit
                      };
                  }

                  const attachment = new AttachmentBuilder(cardBuffer, { name: 'album_art.png' });
                  embed.setImage('attachment://album_art.png');
                  embed.setThumbnail(null); 
                  embed.file = attachment; 
              } else {
                  if (artworkUrl) embed.setThumbnail(artworkUrl);
              }
          }
      } catch (err) {

          console.error("Failed to generate landscape card", err);
          if (artworkUrl) embed.setThumbnail(artworkUrl);
      }
      embed.setTitle(null);
      embed.setAuthor(null);

      const isSpotify = source === 'spotify';
      embed.setFooter({
        text: `★ ${source.toUpperCase()} ・ TymeeMusic ☆`,
        iconURL: isSpotify ? this.getSourceIconUrl('spotify') : (guild?.iconURL() || this.getSourceIconUrl(source))
      });

      if (isSpotify) embed.setColor(THEME_COLORS.spotify);

    } else {
      // Idle State - Starry aesthetic
      embed.setAuthor({ name: '☆ ɪᴅʟᴇ ☆', iconURL: guild?.iconURL() });
      embed.setDescription(
        `★ ° . *　　　°　.　°☆\n\n` +
        `**No track is currently playing**\n\n` +
        `-# Use \`/play\` to start music ♡`
      );
      embed.setColor(THEME_COLORS.idle);
    }

    return embed;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // SPECIALIZED EMBED BUILDERS
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Create a compact/mini player embed
   * 
   * @param {Object} pm - PlayerManager instance
   * @param {Object} guild - Discord guild
   * @param {Object} client - Discord client
   * @returns {Promise<EmbedBuilder>} - Compact embed
   */
  static async createMiniPlayerEmbed(pm, guild, client = null) {
    const track = pm.currentTrack;
    const emojiManager = client?.emojiManager;
    const guildId = guild?.id;

    const emojis = emojiManager && guildId
      ? await emojiManager.getPlayerEmojis(guildId)
      : {};

    const embed = new EmbedBuilder()
      .setColor(this.getThemeColor(track, pm));

    if (track) {
      const title = this.truncateText(track.info?.title || 'Unknown', 40);
      const artist = this.truncateText(track.info?.author || 'Unknown', 30);
      const statusEmoji = pm.isPaused ? (emojis.pause || '⏸️') : (emojis.play || '▶️');

      const position = pm.player?.position || 0;
      const duration = track.info?.duration || 0;
      const progress = duration > 0 ? position / duration : 0;
      const progressBar = this.createProgressBar(progress, 15);

      embed.setDescription(
        `${statusEmoji} **${title}**\n` +
        `${emojis.artist || '🎤'} ${artist}\n` +
        `\`${this.formatTime(position)}\` ${progressBar} \`${this.formatTime(duration)}\``
      );

      if (track.info?.artworkUrl) {
        embed.setThumbnail(track.info.artworkUrl);
      }
    } else {
      embed.setDescription(`${emojis.idle || '💤'} Nothing playing`);
    }

    return embed;
  }

  /**
   * Create a queue list embed
   * 
   * @param {Object} pm - PlayerManager instance
   * @param {Object} guild - Discord guild
   * @param {Object} client - Discord client
   * @param {number} page - Page number (0-indexed)
   * @param {number} itemsPerPage - Items per page
   * @returns {Promise<EmbedBuilder>} - Queue embed
   */
  static async createQueueEmbed(pm, guild, client = null, page = 0, itemsPerPage = 10) {
    const track = pm.currentTrack;
    const queue = pm.player?.queue?.tracks || [];
    const emojiManager = client?.emojiManager;
    const guildId = guild?.id;

    const emojis = emojiManager && guildId
      ? await emojiManager.getPlayerEmojis(guildId)
      : {};

    const embed = new EmbedBuilder()
      .setColor(THEME_COLORS.default)
      .setTitle(`${emojis.queue || '📋'} Music Queue`)
      .setTimestamp();

    let description = '';

    // Current track
    if (track) {
      const statusEmoji = pm.isPaused ? (emojis.pause || '⏸️') : (emojis.play || '▶️');
      description += `**${statusEmoji} Now Playing:**\n`;
      description += `${this.createLink(this.truncateText(track.info?.title, 50), track.info?.uri)}\n`;
      description += `${emojis.artist || '🎤'} ${track.info?.author || 'Unknown'}\n\n`;
    }

    // Queue items
    if (queue.length === 0) {
      description += '*Queue is empty*';
    } else {
      const totalPages = Math.ceil(queue.length / itemsPerPage);
      const start = page * itemsPerPage;
      const end = Math.min(start + itemsPerPage, queue.length);
      const pageItems = queue.slice(start, end);

      description += `**Up Next (${queue.length} tracks):**\n`;
      pageItems.forEach((t, i) => {
        const num = start + i + 1;
        const title = this.truncateText(t.info?.title || 'Unknown', 45);
        description += `**${num}.** ${this.createLink(title, t.info?.uri)}\n`;
      });

      if (queue.length > end) {
        description += `\n*...and ${queue.length - end} more tracks*`;
      }

      embed.setFooter({
        text: `Page ${page + 1}/${totalPages} • Total Duration: ${this.calculateQueueDuration(queue)}`,
        iconURL: guild?.iconURL()
      });
    }

    embed.setDescription(description);

    if (track?.info?.artworkUrl) {
      embed.setThumbnail(track.info.artworkUrl);
    }

    return embed;
  }

  /**
   * Calculate total queue duration
   * 
   * @param {Array} queue - Queue array
   * @returns {string} - Formatted duration
   */
  static calculateQueueDuration(queue) {
    if (!queue || queue.length === 0) return '0:00';

    const totalMs = queue.reduce((acc, track) => {
      return acc + (track.info?.duration || 0);
    }, 0);

    return this.formatDurationVerbose(totalMs);
  }

  /**
   * Create an error embed
   * 
   * @param {string} title - Error title
   * @param {string} message - Error message
   * @param {Object} emojis - Emoji map
   * @returns {EmbedBuilder} - Error embed
   */
  static createErrorEmbed(title, message, emojis = {}) {
    return new EmbedBuilder()
      .setColor(THEME_COLORS.error)
      .setTitle(`${emojis.error || '❌'} ${title}`)
      .setDescription(message)
      .setTimestamp();
  }

  /**
   * Create a success embed
   * 
   * @param {string} title - Success title
   * @param {string} message - Success message
   * @param {Object} emojis - Emoji map
   * @returns {EmbedBuilder} - Success embed
   */
  static createSuccessEmbed(title, message, emojis = {}) {
    return new EmbedBuilder()
      .setColor(THEME_COLORS.playing)
      .setTitle(`${emojis.success || '✅'} ${title}`)
      .setDescription(message)
      .setTimestamp();
  }

  /**
   * Create an idle/no music embed
   * 
   * @param {Object} guild - Discord guild
   * @param {Object} client - Discord client
   * @returns {Promise<EmbedBuilder>} - Idle embed
   */
  static async createIdleEmbed(guild, client = null) {
    const emojiManager = client?.emojiManager;
    const guildId = guild?.id;

    const emojis = emojiManager && guildId
      ? await emojiManager.getPlayerEmojis(guildId)
      : {};

    return new EmbedBuilder()
      .setColor(THEME_COLORS.idle)
      .setTitle(`${emojis.idle || '💤'} Nothing Playing`)
      .setDescription(
        'Use `/play` to start playing music!\n\n' +
        '**Quick Tips:**\n' +
        `${emojis.music || '🎵'} Search by song name or paste a URL\n` +
        `${emojis.queue || '📋'} Add multiple songs to create a queue\n` +
        `${emojis.autoplay || '📻'} Enable Radio Mode for endless music`
      )
      .setTimestamp();
  }

  /**
   * Create a track added confirmation embed
   * 
   * @param {Object} track - Track that was added
   * @param {Object} pm - PlayerManager instance
   * @param {Object} guild - Discord guild
   * @param {Object} client - Discord client
   * @returns {Promise<EmbedBuilder>} - Track added embed
   */
  static async createTrackAddedEmbed(track, pm, guild = null, client = null) {
    const emojiManager = client?.emojiManager;
    const guildId = guild?.id;

    const emojis = emojiManager && guildId
      ? await emojiManager.getPlayerEmojis(guildId)
      : {};

    const source = this.detectSource(track);
    const position = pm?.queueSize || 0;

    const embed = new EmbedBuilder()
      .setColor(THEME_COLORS[source] || THEME_COLORS.playing)
      .setAuthor({
        name: `${emojis.success || '✅'} Added to Queue`,
        iconURL: this.getSourceIconUrl(source)
      })
      .setTitle(this.truncateText(track.info?.title || 'Unknown', 100))
      .setDescription(
        `${emojis.artist || '🎤'} **Artist:** ${track.info?.author || 'Unknown'}\n` +
        `⏱️ **Duration:** ${this.formatTime(track.info?.duration)}\n` +
        `📋 **Position:** #${position + 1} in queue`
      )
      .setTimestamp();

    if (track.info?.artworkUrl) {
      embed.setThumbnail(track.info.artworkUrl);
    }

    let displayUri = track.requester?.originalUri || track.info?.uri;
    if (displayUri && displayUri.startsWith('http')) {
      embed.setURL(displayUri);
    }

    return embed;
  }

  /**
   * Create a playlist added confirmation embed
   * 
   * @param {Object} playlist - Playlist info
   * @param {Array} tracks - Tracks array
   * @param {Object} pm - PlayerManager instance
   * @param {Object} guild - Discord guild
   * @param {Object} client - Discord client
   * @returns {Promise<EmbedBuilder>} - Playlist added embed
   */
  static async createPlaylistAddedEmbed(playlist, tracks, pm, guild = null, client = null) {
    const emojiManager = client?.emojiManager;
    const guildId = guild?.id;

    const emojis = emojiManager && guildId
      ? await emojiManager.getPlayerEmojis(guildId)
      : {};

    const totalDuration = tracks.reduce((acc, t) => acc + (t.info?.duration || 0), 0);

    const embed = new EmbedBuilder()
      .setColor(THEME_COLORS.playing)
      .setAuthor({
        name: `${emojis.success || '✅'} Playlist Added`,
        iconURL: guild?.iconURL()
      })
      .setTitle(this.truncateText(playlist.name || 'Playlist', 100))
      .setDescription(
        `${emojis.music || '🎵'} **Tracks:** ${tracks.length}\n` +
        `⏱️ **Total Duration:** ${this.formatDurationVerbose(totalDuration)}\n` +
        `📋 **Queue Size:** ${pm?.queueSize || tracks.length} tracks`
      )
      .setTimestamp();

    if (playlist.artworkUrl || tracks[0]?.info?.artworkUrl) {
      embed.setThumbnail(playlist.artworkUrl || tracks[0].info.artworkUrl);
    }

    // Show first few tracks
    if (tracks.length > 0) {
      const preview = tracks.slice(0, 3).map((t, i) =>
        `${i + 1}. ${this.truncateText(t.info?.title || 'Unknown', 40)}`
      ).join('\n');

      embed.addFields({
        name: 'Preview',
        value: preview + (tracks.length > 3 ? `\n*...and ${tracks.length - 3} more*` : ''),
        inline: false
      });
    }

    return embed;
  }

  /**
   * Create a now playing notification embed (ephemeral style)
   * 
   * @param {Object} track - Current track
   * @param {Object} pm - PlayerManager instance
   * @param {Object} guild - Discord guild
   * @param {Object} client - Discord client
   * @returns {Promise<EmbedBuilder>} - Now playing notification embed
   */
  static async createNowPlayingNotification(track, pm, guild = null, client = null) {
    const emojiManager = client?.emojiManager;
    const guildId = guild?.id;

    const emojis = emojiManager && guildId
      ? await emojiManager.getPlayerEmojis(guildId)
      : {};

    const source = this.detectSource(track);
    const sourceEmoji = this.getSourceEmoji(source, guild, client);

    const embed = new EmbedBuilder()
      .setColor(THEME_COLORS[source] || THEME_COLORS.playing)
      .setDescription(
        `${emojis.play || '▶️'} **Now Playing**\n\n` +
        `${sourceEmoji} ${this.createLink(
          this.truncateText(track.info?.title || 'Unknown', 50),
          track.requester?.originalUri || track.info?.uri
        )}\n` +
        `${emojis.artist || '🎤'} ${track.info?.author || 'Unknown'}\n` +
        `⏱️ ${this.formatTime(track.info?.duration)}`
      );

    if (track.info?.artworkUrl) {
      embed.setThumbnail(track.info.artworkUrl);
    }

    return embed;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // UTILITY METHODS
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Get all available progress bar styles
   * 
   * @returns {string[]} - Array of style names
   */
  static getProgressBarStyles() {
    return Object.keys(PROGRESS_BAR_STYLES);
  }

  /**
   * Get all available theme colors
   * 
   * @returns {Object} - Theme colors object
   */
  static getThemeColors() {
    return { ...THEME_COLORS };
  }

  /**
   * Get all default emojis
   * 
   * @returns {Object} - Default emojis object
   */
  static getDefaultEmojis() {
    return { ...DEFAULT_EMOJIS };
  }

  /**
   * Preview a progress bar style
   * 
   * @param {string} style - Style name
   * @param {number} progress - Progress value (0-1)
   * @returns {string} - Preview of the progress bar
   */
  static previewProgressBarStyle(style, progress = 0.5) {
    return this.createStyledProgressBar(progress, style);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export default DiscordPlayerEmbed;
