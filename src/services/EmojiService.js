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

export class EmojiService {
  constructor() {
    this.cache = new Map();
  }

  getEmoji(guildId, key, guild = null, client = null) {
    const cacheKey = `${guildId}:${key}`;
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
      emojiStr = DEFAULT_EMOJIS[key] || "❓";
    }

    this.cache.set(cacheKey, emojiStr);
    return emojiStr;
  }

  getEmojiObject(guildId, key, guild = null, client = null) {
    const emojiStr = this.getEmoji(guildId, key, guild, client);
    const match = emojiStr.match(/^<a?:(.+):(\d+)>$/);
    if (match) {
      return { name: match[1], id: match[2], str: emojiStr };
    }
    return { name: key, id: null, str: emojiStr };
  }

  formatCustomEmoji(name, id) {
    return `<:${name}:${id}>`;
  }

  parseEmoji(emojiStr) {
    if (!emojiStr) return null;
    const match = emojiStr.match(/^<a?:(.+):(\d+)>$/);
    if (match) {
      return { name: match[1], id: match[2], animated: emojiStr.startsWith("<a:") };
    }
    return null;
  }

  findServerEmoji(guild, key) {
    const searchNames = this.getSearchNames(key);
    return guild.emojis.cache.find(e =>
      searchNames.some(name =>
        e.name.toLowerCase().includes(name.toLowerCase()) ||
        e.name.toLowerCase() === name.toLowerCase()
      )
    );
  }

  findBotEmoji(client, key) {
    const searchNames = this.getSearchNames(key);
    return client.emojis.cache.find(e =>
      searchNames.some(name =>
        e.name.toLowerCase().includes(name.toLowerCase()) ||
        e.name.toLowerCase() === name.toLowerCase()
      )
    );
  }

  getSearchNames(key) {
    const names = {
      music: ["music", "nowplaying", "np", "🎵"],
      play: ["play", "resume", "▶️"],
      pause: ["pause", "paused", "⏸️"],
      stop: ["stop", "⏹️"],
      previous: ["previous", "prev", "back", "⏮️"],
      next: ["next", "skip", "forward", "⏭️"],
      shuffle: ["shuffle", "random", "🔀"],
      loop: ["loop", "repeat", "🔁"],
      volume: ["volume", "vol", "🔊"],
      seek_forward: ["forward", "seekforward", "⏩"],
      seek_back: ["rewind", "seekback", "⏪"],
      favorite: ["favorite", "fav", "love", "heart", "❤️"],
      effects: ["effects", "equalizer", "eq", "fx", "🎛️"],
      filter: ["filter", "funnel", "🔧"],
      move: ["move", "swap", "🔀"],
      misc: ["misc", "more", "🔘"],
      artist: ["artist", "singer", "microphone", "🎤"],
      status: ["status", "stats", "📊"],
      off: ["off", "disabled", "❌"],
      track: ["track", "song", "🔂"],
      queue: ["queue", "list", "playlist", "📋"],
      voice: ["voice", "channel", "speaker", "🔈"],
      idle: ["idle", "sleep", "💤"],
      check: ["check", "success", "✅"],
      info: ["info", "information", "ℹ️"],
      cross: ["cross", "error", "fail", "❌"],
      add: ["add", "plus", "➕"],
      reset: ["reset", "reload", "refresh", "🔄"],
      folder: ["folder", "📁"],
      openfolder: ["openfolder", "open", "folderopen", "📂"],
      right: ["right", "next", "▶️"],
      left: ["left", "previous", "back", "◀️"],
      loading: ["loading", "loading", "hourglass", "⏳"],
      sp: ["spotify", "sp", "🎵"],
      yt: ["youtube", "yt", "📺"],
      am: ["apple", "applemusic", "am", "🍎"],
      sc: ["soundcloud", "sc", "🔊"],
      dz: ["deezer", "dz", "🎧"]
    };
    return names[key] || [key];
  }

  setEmoji(guildId, key, emojiStr) {
    const parsed = this.parseEmoji(emojiStr);
    if (!parsed) {
      throw new Error("Invalid emoji format. Use custom emoji format <:name:id>");
    }

    db.emoji.setEmoji(guildId, key, parsed.id, parsed.name);
    this.clearCache(guildId);
    return parsed;
  }

  removeEmoji(guildId, key) {
    db.emoji.removeEmoji(guildId, key);
    this.clearCache(guildId);
  }

  syncEmojis(guildId, guild) {
    let synced = 0;
    const keys = Object.keys(DEFAULT_EMOJIS);

    for (const key of keys) {
      const existing = db.emoji.getEmoji(guildId, key);
      if (!existing) {
        const serverEmoji = this.findServerEmoji(guild, key);
        if (serverEmoji) {
          db.emoji.setEmoji(guildId, key, serverEmoji.id, serverEmoji.name);
          synced++;
        }
      }
    }

    this.clearCache(guildId);
    return synced;
  }

  resetEmojis(guildId) {
    db.emoji.clearAllEmojis(guildId);
    this.clearCache(guildId);
  }

  getAllEmojis(guildId, guild = null, client = null) {
    const emojis = {};
    const keys = Object.keys(DEFAULT_EMOJIS);

    for (const key of keys) {
      emojis[key] = this.getEmoji(guildId, key, guild, client);
    }

    return emojis;
  }

  getEmojiList(guildId, guild = null, client = null) {
    const dbEmojis = db.emoji.getAllEmojis(guildId);
    const list = [];

    for (const row of dbEmojis) {
      list.push({
        key: row.emoji_key,
        emoji: this.formatCustomEmoji(row.emoji_name, row.emoji_id),
        name: row.emoji_name
      });
    }

    return list;
  }

  getMissingEmojis(guildId, guild) {
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
            default: DEFAULT_EMOJIS[key]
          });
        }
      }
    }

    return missing;
  }

  clearCache(guildId) {
    for (const key of this.cache.keys()) {
      if (key.startsWith(`${guildId}:`)) {
        this.cache.delete(key);
      }
    }
  }

  clearAllCache() {
    this.cache.clear();
  }
}

export const emojiService = new EmojiService();
export default emojiService;
