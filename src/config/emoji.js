export const emoji = {
  "check": "✅",
  "info": "ℹ️",
  "cross": "❌",
  "add": "➕",
  "reset": "🔄",
  "folder": "📁",
  "openfolder": "📂",
  "music": "🎵",
  "right": "▶️",
  "left": "◀️",
  "loading": "⏳",
  // Music source emojis
  "play": "▶️",
  "sp": "🎵",
  "spotify": "🎵",
  "yt": "📺",
  "youtube": "📺",
  "am": "🍎",
  "apple": "🍎",
  "sc": "🔊",
  "soundcloud": "🔊",
  "dz": "🎧",
  "deezer": "🎧",
  get(name, fallback = '') {
    return this[name] || fallback;
  },
  getObject(name, fallback = null) {
    const emojiStr = this[name];
    if (!emojiStr) return fallback;
    const match = emojiStr.match(/^<a?:(.+):(\d+)>$/);
    if (match) {
      return { name: match[1], id: match[2] };
    }
    return fallback;
  }
};

export default emoji;
