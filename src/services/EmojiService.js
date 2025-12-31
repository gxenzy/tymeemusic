import { db } from "#database/DatabaseManager";
import { logger } from "#utils/logger";

export const EMOJI_KEYS = {
  music: "music",
  play: "play",
  pause: "pause",
  stop: "stop",
  previous: "previous",
  next: "next",
  shuffle: "shuffle",
  loop: "loop",
  volume: "volume",
  seek_forward: "seek_forward",
  seek_back: "seek_back",
  favorite: "favorite",
  effects: "effects",
  filter: "filter",
  move: "move",
  misc: "misc",
  artist: "artist",
  status: "status",
  off: "off",
  track: "track",
  queue: "queue",
  voice: "voice",
  idle: "idle",
  check: "check",
  info: "info",
  cross: "cross",
  add: "add",
  reset: "reset",
  folder: "folder",
  openfolder: "openfolder",
  right: "right",
  left: "left",
  loading: "loading",
  sp: "sp",
  yt: "yt",
  am: "am",
  sc: "sc",
  dz: "dz"
};

export const DEFAULT_EMOJIS = {
  music: "🎵",
  play: "▶️",
  pause: "⏸️",
  stop: "⏹️",
  previous: "⏮️",
  next: "⏭️",
  shuffle: "🔀",
  loop: "🔁",
  volume: "🔊",
  seek_forward: "⏩",
  seek_back: "⏪",
  favorite: "❤️",
  effects: "🎛️",
  filter: "🔧",
  move: "🔀",
  misc: "🔘",
  artist: "🎤",
  status: "📊",
  off: "❌",
  track: "🔂",
  queue: "📋",
  voice: "🔈",
  idle: "💤",
  check: "✅",
  info: "ℹ️",
  cross: "❌",
  add: "➕",
  reset: "🔄",
  folder: "📁",
  openfolder: "📂",
  right: "▶️",
  left: "◀️",
  loading: "⏳",
  sp: "🎵",
  yt: "📺",
  am: "🍎",
  sc: "🔊",
  dz: "🎧"
};

export const EMOJI_CATEGORIES = {
  unicode: {
    name: "Unicode Emojis",
    emojis: {
      music: ["🎵", "🎶", "🎼"],
      play: ["▶️", "►", "👟"],
      pause: ["⏸️", "⏸"],
      stop: ["⏹️", "⏹"],
      previous: ["⏮️", "⏪", "◀️"],
      next: ["⏭️", "⏩", "▶️"],
      shuffle: ["🔀", "🔄️", "🔃"],
      loop: ["🔁", "🔂", "🔄️"],
      volume: ["🔊", "🔉", "🔈", "🔅", "🔆"],
      favorite: ["❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "🤎", "💔", "❣️", "💕", "💞", "💓", "💗", "💖", "💘", "💝"],
      effects: ["🎛️", "🎚️", "🎹", "🎸", "🎻", "🥁", "🪘"],
      filter: ["🔧", "🔨", "🛠️", "⚙️", "⚙️", "🔩"],
      move: ["🔀", "🔁", "🔃", "🔄️"],
      misc: ["🔘", "⚪", "⚫", "🔵", "🔴", "🟢", "🟡", "🟠", "🟣", "🔷", "🔶"],
      artist: ["🎤", "🎧", "🎷", "🎺", "🪗", "🎸", "🎹"],
      status: ["📊", "📈", "📉", "📋", "📌", "📍"],
      off: ["❌", "⛔", "🚫", "🛑", "🔴"],
      track: ["🔂", "🔃", "🔄️", "▶️"],
      queue: ["📋", "📝", "📄", "📑", "🗂️"],
      voice: ["🔈", "🔉", "🔊", "📢", "📣", "🗣️"],
      idle: ["💤", "😴", "💤", "🌙", "🛌"],
      check: ["✅", "✔️", "☑️", "🟢", "⚪"],
      info: ["ℹ️", "📌", "📍", "🔖", "🏷️"],
      cross: ["❌", "✖️", "➖", "⛔", "🚫"],
      add: ["➕", "➕️", "✚", "💢"],
      reset: ["🔄️", "🔃", "🔁", "🔙", "🔚"],
      folder: ["📁", "📂", "🗂️", "🗃️"],
      openfolder: ["📂", "📁", "🗂️"],
      right: ["▶️", "►", "⏩", "➡️"],
      left: ["◀️", "◀", "⏪", "⬅️"],
      loading: ["⏳", "⏰", "⌛", "🕐", "🕑", "🕒", "🕓", "🕔", "🕕", "🕖", "🕗", "🕘", "🕙", "🕚", "🕛", "🔄️", "🔃"]
    }
  },
  symbols: {
    name: "Symbols",
    emojis: {
      music: ["♪", "♫", "♬", "♩", "🎼"],
      play: ["▶", "►", "▷"],
      pause: ["⏸", "⏸︎"],
      stop: ["⏹", "⏹︎"],
      previous: ["⏮", "⏪", "◀"],
      next: ["⏭", "⏩", "▶"],
      shuffle: ["🔀", "🔁"],
      loop: ["🔁", "🔂", "🔁"],
      volume: ["🔈", "🔉", "🔊", "🔉"],
      favorite: ["♡", "♥", "❤"],
      effects: ["♫", "♬"],
      filter: ["⚙", "⚙︎", "⚙️"],
      move: ["⇄", "⇅", "⇆"],
      misc: ["●", "○", "◎", "◇", "◆"],
      artist: ["♫", "♬"],
      status: ["📶", "📡"],
      off: ["○", "⚫"],
      track: ["▶", "▷"],
      queue: ["≡", "☰"],
      voice: ["📶", "📳"],
      idle: ["○", "⚪"],
      check: ["✓", "✔", "☑"],
      info: ["i", "ℹ"],
      cross: ["×", "✕", "✖"],
      add: ["+", "➕"],
      reset: ["↻", "↺"],
      folder: ["⊞", "⊟"],
      openfolder: ["⊟", "⊞"],
      right: ["→", "⇒", "➔"],
      left: ["←", "⇐", "➜"]
    }
  },
  kaomoji: {
    name: "Kaomoji",
    emojis: {
      music: ["(♪)"],
      play: ["(▶️)"],
      pause: ["(⏸️)"],
      favorite: ["(❤️)", "(^_^)", "(◕◡◕)"],
      loading: ["(⌛)", "(...)", "(⊙_⊙)"],
      idle: ["(=_=)", "(-_-)", "(⊙_⊙)"],
      check: ["(✔️)", "(^▽^)"],
      info: ["(•_•)"]
    }
  }
};

export const SOURCE_EMOJI = {
  spotify: "🎵",
  youtube: "📺",
  apple: "🍎",
  soundcloud: "🔊",
  deezer: "🎧",
  soundcloud: "☁️"
};

export class EmojiService {
  constructor() {
    this.cache = new Map();
    this.guildEmojiCache = new Map();
  }

  getEmoji(guildId, key, guild = null, client = null) {
    if (!guildId || guildId === 'global') {
      guildId = 'default';
    }
    
    const cacheKey = `${guildId}:${key}`;
    
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }
    
    let emojiStr = null;
    let source = 'default';

    const dbEmoji = db.emoji.getEmoji(guildId, key);
    if (dbEmoji) {
      emojiStr = this.formatCustomEmoji(dbEmoji.emoji_name, dbEmoji.emoji_id);
      source = 'database';
    }

    if (!emojiStr && guild) {
      const serverEmoji = this.findServerEmoji(guild, key);
      if (serverEmoji) {
        emojiStr = this.formatCustomEmoji(serverEmoji.name, serverEmoji.id);
        db.emoji.setEmoji(guildId, key, serverEmoji.id, serverEmoji.name);
        source = 'server';
      }
    }

    if (!emojiStr && client) {
      const botEmoji = this.findBotEmoji(client, key);
      if (botEmoji) {
        emojiStr = this.formatCustomEmoji(botEmoji.name, botEmoji.id);
        db.emoji.setEmoji(guildId, key, botEmoji.id, botEmoji.name);
        source = 'bot';
      }
    }

    if (!emojiStr) {
      emojiStr = DEFAULT_EMOJIS[key] || "❓";
      source = 'fallback';
    }

    this.cache.set(cacheKey, emojiStr);
    
    if (logger && logger.debug) {
      logger.debug('EmojiService', `Got emoji for ${key}: ${emojiStr} (source: ${source})`);
    }
    
    return emojiStr;
  }

  getEmojiWithFallback(guildId, key, guild = null, client = null, fallbackIndex = 0) {
    if (!guildId || guildId === 'global') {
      guildId = 'default';
    }
    
    const cacheKey = `${guildId}:${key}:${fallbackIndex}`;
    
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }
    
    let emojiStr = null;

    const dbEmoji = db.emoji.getEmoji(guildId, key);
    if (dbEmoji) {
      emojiStr = this.formatCustomEmoji(dbEmoji.emoji_name, dbEmoji.emoji_id);
    }

    if (!emojiStr && guild) {
      const serverEmoji = this.findServerEmoji(guild, key);
      if (serverEmoji) {
        emojiStr = this.formatCustomEmoji(serverEmoji.name, serverEmoji.id);
        db.emoji.setEmoji(guildId, key, serverEmoji.id, serverEmoji.name);
      }
    }

    if (!emojiStr && client) {
      const botEmoji = this.findBotEmoji(client, key);
      if (botEmoji) {
        emojiStr = this.formatCustomEmoji(botEmoji.name, botEmoji.id);
        db.emoji.setEmoji(guildId, key, botEmoji.id, botEmoji.name);
      }
    }

    if (!emojiStr) {
      const fallbacks = EMOJI_CATEGORIES.unicode.emojis[key] || 
                        EMOJI_CATEGORIES.symbols.emojis[key] || 
                        [DEFAULT_EMOJIS[key]];
      emojiStr = fallbacks[fallbackIndex % fallbacks.length] || DEFAULT_EMOJIS[key] || "❓";
    }

    this.cache.set(cacheKey, emojiStr);
    return emojiStr;
  }

  getEmojiObject(guildId, key, guild = null, client = null) {
    const emojiStr = this.getEmoji(guildId, key, guild, client);
    const match = emojiStr.match(/^<a?:(.+):(\d+)>$/);
    if (match) {
      return { name: match[1], id: match[2], str: emojiStr, type: 'custom' };
    }
    return { name: key, id: null, str: emojiStr, type: 'unicode' };
  }

  formatCustomEmoji(name, id) {
    return `<:${name}:${id}>`;
  }

  formatAnimatedEmoji(name, id) {
    return `<a:${name}:${id}>`;
  }

  parseEmoji(emojiStr) {
    if (!emojiStr) return null;
    
    const animatedMatch = emojiStr.match(/^<a:(.+):(\d+)>$/);
    if (animatedMatch) {
      return { name: animatedMatch[1], id: animatedMatch[2], animated: true };
    }
    
    const staticMatch = emojiStr.match(/^<:(.+):(\d+)>$/);
    if (staticMatch) {
      return { name: staticMatch[1], id: staticMatch[2], animated: false };
    }
    
    return null;
  }

  isValidEmoji(emojiStr) {
    return this.parseEmoji(emojiStr) !== null;
  }

  findServerEmoji(guild, key) {
    if (!guild || !guild.emojis) {
      return null;
    }
    
    const searchNames = this.getSearchNames(key);
    
    for (const name of searchNames) {
      const emoji = guild.emojis.cache.find(e => 
        e.name.toLowerCase() === name.toLowerCase() ||
        e.name.toLowerCase().includes(name.toLowerCase())
      );
      if (emoji) {
        if (logger && logger.debug) {
          logger.debug('EmojiService', `Found server emoji for ${key}: ${emoji.name} (${emoji.id})`);
        }
        return emoji;
      }
    }
    
    if (logger && logger.debug) {
      logger.debug('EmojiService', `No server emoji found for ${key}`);
    }
    return null;
  }

  findBotEmoji(client, key) {
    if (!client || !client.emojis) {
      return null;
    }
    
    const searchNames = this.getSearchNames(key);
    
    for (const name of searchNames) {
      const emoji = client.emojis.cache.find(e => 
        e.name.toLowerCase() === name.toLowerCase() ||
        e.name.toLowerCase().includes(name.toLowerCase())
      );
      if (emoji) {
        return emoji;
      }
    }
    
    return null;
  }

  getSearchNames(key) {
    const names = {
      music: ["music", "nowplaying", "np"],
      play: ["play", "resume"],
      pause: ["pause", "paused"],
      stop: ["stop"],
      previous: ["previous", "prev", "back"],
      next: ["next", "skip"],
      shuffle: ["shuffle", "random"],
      loop: ["loop", "repeat"],
      volume: ["volume", "vol"],
      seek_forward: ["forward", "seekforward"],
      seek_back: ["rewind", "seekback"],
      favorite: ["favorite", "fav", "love", "heart"],
      effects: ["effects", "equalizer", "eq", "fx"],
      filter: ["filter", "funnel"],
      move: ["move", "swap"],
      misc: ["misc", "more"],
      artist: ["artist", "singer", "microphone"],
      status: ["status", "stats"],
      off: ["off", "disabled"],
      track: ["track", "song"],
      queue: ["queue", "list", "playlist"],
      voice: ["voice", "channel", "speaker"],
      idle: ["idle", "sleep"],
      check: ["check", "success"],
      info: ["info", "information"],
      cross: ["cross", "error", "fail"],
      add: ["add", "plus"],
      reset: ["reset", "reload", "refresh"],
      folder: ["folder"],
      openfolder: ["openfolder", "open", "folderopen"],
      right: ["right", "next"],
      left: ["left", "previous", "back"],
      loading: ["loading", "hourglass"],
      sp: ["spotify", "sp"],
      yt: ["youtube", "yt"],
      am: ["apple", "applemusic", "am"],
      sc: ["soundcloud", "sc"],
      dz: ["deezer", "dz"]
    };
    return names[key] || [key];
  }

  setEmoji(guildId, key, emojiStr) {
    if (!guildId || guildId === 'global') {
      guildId = 'default';
    }
    
    const parsed = this.parseEmoji(emojiStr);
    if (!parsed) {
      throw new Error("Invalid emoji format. Use custom emoji format <:name:id> or <a:name:id> for animated");
    }

    db.emoji.setEmoji(guildId, key, parsed.id, parsed.name);
    this.clearCache(guildId);
    if (logger && logger.info) {
      logger.info('EmojiService', `Set emoji for ${key}: ${emojiStr}`);
    }
    return parsed;
  }

  removeEmoji(guildId, key) {
    if (!guildId || guildId === 'global') {
      guildId = 'default';
    }
    
    db.emoji.removeEmoji(guildId, key);
    this.clearCache(guildId);
    if (logger && logger.info) {
      logger.info('EmojiService', `Removed emoji for ${key}`);
    }
  }

  syncEmojis(guildId, guild) {
    if (!guildId || guildId === 'global') {
      guildId = 'default';
    }
    
    let synced = 0;
    let found = 0;
    const keys = Object.keys(DEFAULT_EMOJIS);

    for (const key of keys) {
      const existing = db.emoji.getEmoji(guildId, key);
      if (!existing) {
        const serverEmoji = this.findServerEmoji(guild, key);
        if (serverEmoji) {
          db.emoji.setEmoji(guildId, key, serverEmoji.id, serverEmoji.name);
          synced++;
        }
      } else {
        found++;
      }
    }

    this.clearCache(guildId);
    if (logger && logger.info) {
      logger.info('EmojiService', `Synced ${synced} emojis, ${found} already set`);
    }
    return synced;
  }

  resetEmojis(guildId) {
    if (!guildId || guildId === 'global') {
      guildId = 'default';
    }
    
    db.emoji.clearAllEmojis(guildId);
    this.clearCache(guildId);
    if (logger && logger.info) {
      logger.info('EmojiService', `Reset all emojis for guild ${guildId}`);
    }
  }

  getAllEmojis(guildId, guild = null, client = null) {
    if (!guildId || guildId === 'global') {
      guildId = 'default';
    }
    
    const emojis = {};
    const keys = Object.keys(DEFAULT_EMOJIS);

    for (const key of keys) {
      emojis[key] = this.getEmoji(guildId, key, guild, client);
    }

    return emojis;
  }

  getEmojiList(guildId, guild = null, client = null) {
    if (!guildId || guildId === 'global') {
      guildId = 'default';
    }
    
    const dbEmojis = db.emoji.getAllEmojis(guildId);
    const list = [];

    for (const row of dbEmojis) {
      list.push({
        key: row.emoji_key,
        emoji: this.formatCustomEmoji(row.emoji_name, row.emoji_id),
        name: row.emoji_name,
        id: row.emoji_id
      });
    }

    return list;
  }

  getMissingEmojis(guildId, guild) {
    if (!guildId || guildId === 'global') {
      guildId = 'default';
    }
    
    const missing = [];
    const keys = Object.keys(DEFAULT_EMOJIS);

    for (const key of keys) {
      if (!db.emoji.exists(guildId, key)) {
        const serverEmoji = this.findServerEmoji(guild, key);
        if (serverEmoji) {
          missing.push({
            key,
            suggested: this.formatCustomEmoji(serverEmoji.name, serverEmoji.id),
            name: serverEmoji.name,
            default: DEFAULT_EMOJIS[key],
            alternatives: this.getEmojiAlternatives(key)
          });
        } else {
          missing.push({
            key,
            suggested: null,
            name: null,
            default: DEFAULT_EMOJIS[key],
            alternatives: this.getEmojiAlternatives(key)
          });
        }
      }
    }

    return missing;
  }

  getEmojiAlternatives(key) {
    const alternatives = [];
    
    if (EMOJI_CATEGORIES.unicode.emojis[key]) {
      alternatives.push(...EMOJI_CATEGORIES.unicode.emojis[key]);
    }
    
    if (EMOJI_CATEGORIES.symbols.emojis[key]) {
      alternatives.push(...EMOJI_CATEGORIES.symbols.emojis[key]);
    }
    
    if (EMOJI_CATEGORIES.kaomoji.emojis[key]) {
      alternatives.push(...EMOJI_CATEGORIES.kaomoji.emojis[key]);
    }
    
    return [...new Set(alternatives)];
  }

  clearCache(guildId) {
    if (!guildId || guildId === 'global') {
      guildId = 'default';
    }
    
    for (const key of this.cache.keys()) {
      if (key.startsWith(`${guildId}:`)) {
        this.cache.delete(key);
      }
    }
  }

  clearAllCache() {
    this.cache.clear();
  }

  getSourceEmoji(sourceName, guildId = null, guild = null) {
    const sourceKey = sourceName?.toLowerCase();
    
    const sourceMapping = {
      'spotify': 'sp',
      'youtube': 'yt',
      'youtube music': 'yt',
      'apple music': 'am',
      'apple': 'am',
      'soundcloud': 'sc',
      'deezer': 'dz',
      'music': 'music'
    };
    
    const emojiKey = sourceMapping[sourceKey] || sourceKey || 'music';
    return this.getEmoji(guildId, emojiKey, guild);
  }

  getVoiceStatusEmoji(track, guildId, guild) {
    if (!track || !track.info) {
      return this.getEmoji(guildId, 'music', guild);
    }
    
    const uri = track.info.uri?.toLowerCase() || '';
    const sourceName = track.info.sourceName?.toLowerCase() || '';
    
    if (uri.includes('spotify.com') || sourceName.includes('spotify')) {
      return this.getEmojiWithFallback(guildId, 'sp', guild, null, 0);
    } else if (uri.includes('youtube.com') || uri.includes('youtu.be') || sourceName.includes('youtube')) {
      return this.getEmojiWithFallback(guildId, 'yt', guild, null, 0);
    } else if (uri.includes('soundcloud.com') || sourceName.includes('soundcloud')) {
      return this.getEmojiWithFallback(guildId, 'sc', guild, null, 0);
    } else if (uri.includes('music.apple.com') || sourceName.includes('apple')) {
      return this.getEmojiWithFallback(guildId, 'am', guild, null, 0);
    } else if (uri.includes('deezer.com') || sourceName.includes('deezer')) {
      return this.getEmojiWithFallback(guildId, 'dz', guild, null, 0);
    }
    
    return this.getEmoji(guildId, 'music', guild);
  }

  getEmojiCategories() {
    return {
      unicode: EMOJI_CATEGORIES.unicode,
      symbols: EMOJI_CATEGORIES.symbols,
      kaomoji: EMOJI_CATEGORIES.kaomoji
    };
  }

  getDisplayEmoji(guildId, key, guild = null) {
    if (!guildId || guildId === 'global') {
      guildId = 'default';
    }

    if (!guild) {
      return DEFAULT_EMOJIS[key] || "❓";
    }

    const emojiStr = this.getEmoji(guildId, key, guild, null);

    if (emojiStr && !emojiStr.startsWith('<')) {
      return emojiStr;
    }

    if (emojiStr && emojiStr.startsWith('<')) {
      const emoji = this.parseEmoji(emojiStr);
      if (emoji) {
        const guildEmoji = guild.emojis.cache.get(emoji.id);
        if (guildEmoji) {
          return emojiStr;
        }
      }
    }

    return DEFAULT_EMOJIS[key] || "❓";
  }
}

export const emojiService = new EmojiService();
export default emojiService;
