![Header](https://raw.githubusercontent.com/OpenUwU/.github/refs/heads/main/header.jpg)

<p align="center">
  <img src="https://img.shields.io/badge/JavaScript-F7DF1E.svg?style=for-the-badge&logo=JavaScript&logoColor=black" alt="JavaScript"/>
  <img src="https://img.shields.io/badge/discord.js-5865F2.svg?style=for-the-badge&logo=discorddotjs&logoColor=white" alt="discord.js"/>
  <img src="https://img.shields.io/badge/Node.js-339933.svg?style=for-the-badge&logo=nodedotjs&logoColor=white" alt="Node.js"/>
  <img src="https://img.shields.io/badge/SQLite-003B57.svg?style=for-the-badge&logo=SQLite&logoColor=white" alt="SQLite"/>
</p>

<p align="center">
  <img src="https://img.shields.io/github/stars/gxenzy/tymeemusic?style=for-the-badge" alt="Stars"/>
  <img src="https://img.shields.io/github/forks/gxenzy/tymeemusic?style=for-the-badge" alt="Forks"/>
  <img src="https://img.shields.io/github/issues/gxenzy/tymeemusic?style=for-the-badge" alt="Issues"/>
  <img src="https://img.shields.io/github/license/gxenzy/tymeemusic?style=for-the-badge" alt="License"/>
</p>

# 🎵 TymeeMusic

**TymeeMusic** is a powerful, feature-rich Discord music bot with a web dashboard, built with performance and user experience in mind. Developed by [gxenzy](https://github.com/gxenzy), this bot brings high-quality audio streaming, an intuitive web interface, and advanced customization options to your Discord server.

---

## 📋 Table of Contents

- [What's New](#-whats-new)
- [Key Features](#-key-features)
- [Technologies](#️-technologies-used)
- [Setup Instructions](#-setup-instructions)
- [Commands](#-commands)
- [Web Dashboard](#-web-dashboard)
- [Configuration](#-configuration-guide)
- [Contributing](#-contributing)
- [Credits](#-credits)

---

## ⭐ What's New

### 🚀 v4.1 - Performance & Stability Update (Latest)

#### ⚡ Performance Optimizations
- **NodeLink Audio Server:** Lightweight JavaScript audio server replacing Java Lavalink - 70% less memory usage
- **V8 Compile Cache:** 20-50% faster startup with bytecode caching
- **Optimized Discord.js Caching:** Aggressive cache limits and auto-sweepers for reduced memory
- **Node.js V8 Flags:** Memory limits and garbage collection optimization
- **Reduced WebSocket Traffic:** Less frequent heartbeats and player updates

#### 🔧 Tier & Permission Fixes
- **Dynamic Owner Detection:** Fixed owner tier not being recognized
- **Components V2 Fallback:** Error messages no longer get stuck on "thinking..."
- **Tier Access Restored:** Premium/VIP/Owner tiers now work correctly

#### 🎵 Music Player Improvements
- **Auto-Dismiss Messages:** Player button responses auto-dismiss after 5 seconds
- **Improved Spotify Resolution:** Duration-based matching for accurate original tracks
- **YouTube Music Priority:** Prioritizes YouTube Music for better song matching
- **Smart Track Filtering:** Automatically filters out covers, remixes, and compilations

#### 📦 New Dependencies
| Package | Purpose |
|---------|---------|
| `v8-compile-cache-lib` | Faster startup via bytecode caching |
| `fast-json-stringify` | 10-20% faster JSON serialization |
| `quick-lru` | Memory-efficient LRU caching |
| `p-queue` / `p-limit` | Controlled async operations |

---

### 🎯 v1.4 - Stability & Accuracy Update
- **Playlist Playback Fix:** Spotify tracks resolve correctly
- **Restored Core Commands:** All prefix and slash commands working
- **Real-time Filter Sync:** Track duration updates with speed filters
- **UI Improvements:** Mobile layout fixes, theme corrections

### 🔒 v1.3 - Security & Permissions
- **Robust Permission System:** Backend-enforced controls
- **Request/Approval Flow:** Real-time control requests
- **Secure Handling:** Strict validation

---

## ✨ Key Features

### 🎶 Music Playback
- **Multi-Platform Support:** YouTube, Spotify, Apple Music, SoundCloud, Deezer, Tidal
- **High-Quality Audio:** Powered by NodeLink for superior sound
- **30+ Audio Filters:** Bassboost, nightcore, vaporwave, 8D, and more
- **Voice Channel Status:** Real-time "Now Playing" in voice channel name

### 📋 Queue Management
- **Advanced Controls:** Shuffle, clear, remove, move, bump to front
- **History Tracking:** Previously played songs
- **Queue Limits:** Free (25) / Premium (100) songs
- **Loop Modes:** Off, Track, Queue

### 🌐 Web Dashboard
- **Real-time Control:** Play, pause, skip, volume from your browser
- **Queue Management:** Add, remove, reorder tracks
- **Responsive Design:** Works on desktop and mobile
- **Keyboard Shortcuts:** Space (play/pause), M (mute), Arrows (seek/volume)

### 🎨 Customization
- **Custom Playlists:** Create and manage personal playlists
- **Premium Prefixes:** Custom command prefix per user
- **24/7 Mode:** Keep bot in voice channel
- **Interactive Embeds:** Beautiful player cards with controls

### 🚀 Performance
- **Hybrid Sharding:** Scales across multiple servers
- **NodeLink Audio:** Lightweight JS audio server
- **Better-SQLite3:** Fast database operations
- **Auto-Recovery:** Reconnection and session restoration

---

## 🛠️ Technologies Used

| Technology | Purpose |
|------------|---------|
| [Discord.js 14](https://discord.js.org/) | Discord API library |
| [discord-hybrid-sharding](https://github.com/meister03/discord-hybrid-sharding) | Advanced sharding |
| [NodeLink](https://nodelink.js.org/) | Lightweight audio server |
| [lavalink-client](https://github.com/Tomato6966/lavalink-client) | Audio client |
| [Better-SQLite3](https://github.com/WiseSource/better-sqlite3) | Fast SQLite database |
| [Express](https://expressjs.com/) | Web dashboard server |
| [Socket.IO](https://socket.io/) | Real-time communication |

---

## 📦 Setup Instructions

### Prerequisites
- Node.js v18.0.0 or higher
- A Discord Bot Token ([Get one here](https://discord.com/developers/applications))
- Git

### Installation

1. **Clone the repository:**
```bash
git clone https://github.com/gxenzy/tymeemusic.git
cd tymeemusic
```

2. **Install dependencies:**
```bash
npm install
cd nodelink && npm install && cd ..
```

3. **Configure environment:**
```bash
cp .env.example .env
# Edit .env with your configuration
```

4. **Start NodeLink (audio server):**
```bash
cd nodelink
npm run start
```

5. **Start the bot (new terminal):**
```bash
npm start
```

---

## 🎯 Commands

### Music
| Command | Description |
|---------|-------------|
| `play <song>` | Play a song or add to queue |
| `pause` / `resume` | Pause/resume playback |
| `skip` / `previous` | Skip or go back |
| `stop` | Stop and clear queue |
| `nowplaying` | Show current track |
| `volume <0-100>` | Set volume |
| `seek <time>` | Seek to position |

### Queue
| Command | Description |
|---------|-------------|
| `queue` | Display queue |
| `shuffle` | Shuffle queue |
| `clear` | Clear queue |
| `remove <pos>` | Remove song |
| `move <from> <to>` | Move song |
| `loop <off/track/queue>` | Set repeat |

### Filters
| Command | Description |
|---------|-------------|
| `bassboost` | Apply bass boost |
| `nightcore` | Speed up + pitch |
| `vaporwave` | Slow down |
| `8d` | 8D audio effect |
| `resetfilter` | Remove all filters |

### Playlists
| Command | Description |
|---------|-------------|
| `playlist create <name>` | Create playlist |
| `playlist add <name>` | Add current song |
| `playlist play <name>` | Play playlist |
| `playlist list` | List playlists |
| `playlist delete <name>` | Delete playlist |

---

## 🌐 Web Dashboard

Access the dashboard at `http://localhost:3000` after starting the bot.

### Features
- **Player Control:** Full playback control
- **Queue Management:** Add, remove, reorder
- **Real-time Updates:** Live player status
- **Mobile Support:** Responsive design

### Keyboard Shortcuts
| Key | Action |
|-----|--------|
| `Space` | Play/Pause |
| `M` | Mute/Unmute |
| `←` `→` | Seek backward/forward |
| `↑` `↓` | Volume up/down |
| `S` | Shuffle |
| `R` | Toggle repeat |

---

## 📝 Configuration Guide

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `DISCORD_TOKEN` | Bot token | ✅ |
| `CLIENT_ID` | Application ID | ✅ |
| `OWNER_IDS` | Owner user IDs (comma-separated) | ✅ |
| `PREFIX` | Command prefix | Default: `t!` |
| `NODELINK_HOST` | NodeLink host | Default: `localhost` |
| `NODELINK_PORT` | NodeLink port | Default: `2333` |
| `NODELINK_PASSWORD` | NodeLink password | ✅ |
| `SPOTIFY_CLIENT_ID` | Spotify API ID | Optional |
| `SPOTIFY_CLIENT_SECRET` | Spotify API secret | Optional |
| `LASTFM_API_KEY` | Last.fm API key | Optional |
| `WEB_PORT` | Dashboard port | Default: `3000` |

---

## 🤝 Contributing

Contributions are welcome! Here's how you can help:

1. **Fork** the repository
2. **Create** a feature branch (`git checkout -b feature/amazing-feature`)
3. **Commit** your changes (`git commit -m 'Add amazing feature'`)
4. **Push** to the branch (`git push origin feature/amazing-feature`)
5. **Open** a Pull Request

### Guidelines
- Follow existing code style
- Test your changes
- Update documentation if needed
- Be respectful in discussions

---

## 👏 Credits

### Development
- **[gxenzy](https://github.com/gxenzy)** - Lead Developer, TymeeMusic
- Forked from [Yukihana](https://github.com/OpenUwU/yukihana) by [Bre4d777](https://github.com/bre4d777)

### Technologies
- [NodeLink](https://nodelink.js.org/) - PerformanC & 1Lucas1.apk
- [Discord.js](https://discord.js.org/) - Discord.js Team
- [lavalink-client](https://github.com/Tomato6966/lavalink-client) - Tomato6966

### Special Thanks
- The Discord.js community
- All contributors and testers
- Everyone who uses TymeeMusic!

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

<p align="center">
  <b>Made with ❤️ by <a href="https://github.com/gxenzy">gxenzy</a></b>
</p>

<p align="center">
  <a href="https://discord.gg/XYwwyDKhec">Support Server</a> •
  <a href="https://github.com/gxenzy/tymeemusic/issues">Report Bug</a> •
  <a href="https://github.com/gxenzy/tymeemusic/issues">Request Feature</a>
</p>

<p align="center">
  ⭐ Star this repository if you find it helpful!
</p>
