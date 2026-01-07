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
</p>

# 🎵 TymeeMusic

**TymeeMusic** is a powerful and feature-rich Discord music bot, forked and modified from [Yukihana](https://github.com/OpenUwU/yukihana) by [Bre4d777](https://github.com/bre4d777). This open-source version brings enhanced features and customization options for premium audio experiences on Discord.

---

## ⭐ What's New in TymeeMusic

### 🎯 v1.4 - Stability & Accuracy Update (Latest)
- **Playlist Playback Fix:** Spotify tracks now resolve correctly - no more 30-minute compilations!
- **Restored Core Commands:** `t!p` and all slash commands fully working
- **Access Tiers Fixed:** Premium/tier features restored
- **Real-time Filter Sync:** Track duration updates correctly with speed filters (Nightcore, Vaporwave)
- **UI Improvements:** Mobile layout fixes, theme color corrections, premium preloader

### ✨ Auto-Update Voice Channel Status
- **Real-time Status Updates:** Voice channel status automatically updates when music plays
- **Request Tracking:** Shows `:play: Requested by username` when someone requests music
- **Now Playing Display:** Displays `:sp: | Song - Artist` when music starts playing
- **Source Detection:** Automatically detects and shows source emoji (Spotify `:sp:`, YouTube `:yt:`, Apple Music `:am:`, SoundCloud `:sc:`, Deezer `:dz:`)

### 🔒 Security & Permissions (v1.3)
- **Robust Permission System:** Backend-enforced permissions for all player controls.
- **Request/Approval Flow:** Users can request control from session owners in real-time.
- **Secure Handling:** Strict validation prevents unauthorized access.

### 🎛️ Web Dashboard
- **Browser Control:** Manage music playback from a web interface
- **Real-time Updates:** See current track, queue, and player status
- **Interactive Controls:** Play, pause, skip, and adjust volume
- **Keyboard Shortcuts:** Control playback with Space (Play/Pause), M (Mute), Arrows (Seek/Volume), S (Shuffle), R (Repeat)

---


## ✨ Key Features

### 🎶 Music Playback
- **Multi-Platform Support:** Stream music from YouTube, Spotify, Apple Music, and SoundCloud
- **High-Quality Audio:** Powered by Lavalink for superior sound quality
- **Audio Filters:** Enhance your listening experience with filters like bassboost, nightcore, vaporwave, and more
- **Voice Channel Status:** Real-time updates showing what's playing in your voice channel

### 📋 Queue Management
- **Advanced Controls:** Shuffle, clear, remove, and move tracks with ease
- **History Tracking:** Keep track of previously played songs
- **Queue Limits:** Free (25 songs) and Premium (100 songs) tiers
- **Bump to Front:** Move songs to the top of the queue instantly

### 🎨 Customization
- **Custom Playlists:** Create and manage personal playlists
- **User Prefixes:** Premium users can set custom command prefixes
- **24/7 Mode:** Keep bot in your voice channel 24/7
- **Interactive Embeds:** Beautiful player cards with progress bars and control buttons

### 🚀 Performance
- **Hybrid Sharding:** Scalable architecture for handling multiple servers
- **Optimized Database:** Fast data access with Better-SQLite3
- **Auto-Reconnection:** Reliable connection management with automatic recovery

## 🛠️ Technologies Used

- **[Discord.js](https://discord.js.org/)** - Discord API library
- **[discord-hybrid-sharding](https://github.com/meister03/discord-hybrid-sharding)** - Advanced sharding system
- **[Lavalink](https://github.com/lavalink-devs/Lavalink)** - Audio streaming server
- **[lavalink-client](https://github.com/Tomato6966/lavalink-client)** - Lavalink client implementation
- **[Better-SQLite3](https://github.com/WiseSource/better-sqlite3)** - Fast SQLite database

## 📦 Setup Instructions

### Prerequisites
- Node.js v16.9.0 or higher
- A Discord Bot Token ([Get one here](https://discord.com/developers/applications))
- A running Lavalink server

### Installation

1. **Clone repository:**
   ```bash
   git clone https://github.com/gxenzy/tymeemusic.git
   cd tymeemusic
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure environment variables:**

   Create a `.env` file in the project root:
   ```bash
   cp .env.example .env
   ```

   Edit `.env` with your configuration:
   ```env
   # Required
   DISCORD_TOKEN=your_bot_token_here
   CLIENT_ID=your_client_id_here
   OWNER_IDS=your_user_id_here

   # Lavalink Configuration
   LAVALINK_HOST=localhost
   LAVALINK_PORT=2333
   LAVALINK_PASSWORD=youshallnotpass

   # Optional: Spotify Integration
   SPOTIFY_CLIENT_ID=your_spotify_client_id
   SPOTIFY_CLIENT_SECRET=your_spotify_client_secret

   # Optional: Last.fm Integration (for autoplay and recommendations)
   LASTFM_API_KEY=your_lastfm_api_key
   ```

4. **Set up Lavalink:**

   Download and configure Lavalink:
   - Download latest Lavalink.jar from [Lavalink Releases](https://github.com/lavalink-devs/Lavalink/releases)
   - Create an `application.yml` configuration file
   - Start Lavalink: `java -jar Lavalink.jar`

   Ensure Lavalink is running and accessible before starting the bot.

5. **Start bot:**

   For production:
   ```bash
   npm start
   ```

   For development (with hot-reloading):
   ```bash
   npm run dev
   ```

## 📝 Configuration Guide

### Environment Variables

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `DISCORD_TOKEN` | Your Discord bot token | ✅ Yes | - |
| `CLIENT_ID` | Discord application client ID | ✅ Yes | - |
| `PREFIX` | Command prefix | ❌ No | `.` |
| `OWNER_IDS` | Comma-separated owner user IDs | ✅ Yes | - |
| `LAVALINK_HOST` | Lavalink server host | ✅ Yes | `localhost` |
| `LAVALINK_PORT` | Lavalink server port | ✅ Yes | `2333` |
| `LAVALINK_PASSWORD` | Lavalink server password | ✅ Yes | - |
| `SPOTIFY_CLIENT_ID` | Spotify API client ID | ❌ No | - |
| `SPOTIFY_CLIENT_SECRET` | Spotify API client secret | ❌ No | - |
| `LASTFM_API_KEY` | Last.fm API key | ❌ No | - |
| `WEB_PORT` | Web dashboard port | ❌ No | `3000` |
| `WEB_API_KEY` | Web dashboard API key | ❌ No | Generated automatically |

### Voice Channel Status Emojis

To enable custom voice channel status emojis, add these emojis to your Discord server:
- `:play:` - Play emoji (shown when music is requested)
- `:sp:` - Spotify emoji (for Spotify tracks)
- `:yt:` - YouTube emoji (for YouTube tracks)
- `:am:` - Apple Music emoji
- `:sc:` - SoundCloud emoji
- `:dz:` - Deezer emoji

You can also modify the emoji names in `src/utils/VoiceChannelStatus.js` to match your server's emojis.

## 🎯 Commands

### Music Commands
- `play <song>` - Play a song or add it to queue
- `pause` - Pause current track
- `resume` - Resume playback
- `skip` - Skip to next song
- `stop` - Stop playback and clear queue
- `queue` - Display current queue
- `nowplaying` - Show currently playing track
- `volume <0-100>` - Set volume
- `seek <time>` - Seek to a specific position
- `forward/reverse <time>` - Forward or rewind by time

### Queue Management
- `shuffle` - Shuffle queue
- `clear` - Clear entire queue
- `remove <position>` - Remove a song from queue
- `move <from> <to>` - Move a song in queue
- `bump <position>` - Move song to front of queue
- `loop <off/track/queue>` - Set repeat mode

### Playlist Commands
- `playlist create <name>` - Create a new playlist
- `playlist add <name>` - Add current song to playlist
- `playlist play <name>` - Play a saved playlist
- `playlist list` - List your playlists
- `playlist info <name>` - View playlist details
- `playlist remove <name>` - Delete a playlist

### Filter Commands
- `filter bassboost` - Apply bassboost effect
- `filter deepbass` - Apply deep bass effect
- `filter superbass` - Apply super bass effect
- `filter nightcore` - Apply nightcore effect
- `filter vaporwave` - Apply vaporwave effect
- `filter metal` - Apply metal effect
- `filter oldschool` - Apply oldschool effect
- `filter classical/jazz/pop/rock/hiphop/reggae/electronic` - Genre-specific filters
- `filter boost/flat/soft/warm` - Audio enhancement filters
- `filter vocals` - Vocal isolation
- `filter reset` - Remove all filters

### Settings Commands
- `prefix <new_prefix>` - Change command prefix (Premium)
- `stay247` - Enable/disable 24/7 mode
- `musiccard` - Toggle music card display
- `volume <amount>` - Set default volume

## 📄 Example .env File

Here's a complete example of a configured `.env` file:

```env
# ====================================
# DISCORD BOT CONFIGURATION
# ====================================
DISCORD_TOKEN=
CLIENT_ID=1031120600858624000
PREFIX=!
OWNER_IDS=owner,owner

# ====================================
# LAVALINK CONFIGURATION
# ====================================
LAVALINK_HOST=localhost
LAVALINK_PORT=2333
LAVALINK_PASSWORD=youshallnotpass
LAVALINK_SECURE=false

# ====================================
# SPOTIFY API
# ====================================
SPOTIFY_CLIENT_ID=
SPOTIFY_CLIENT_SECRET=

# ====================================
# LAST.FM API (Optional) [required for recommendations and autoplay]
# ====================================
LASTFM_API_KEY=

# ====================================
# BOT STATUS CONFIGURATION
# ====================================
STATUS_TEXT=!help | TymeeMusic 🎵
STATUS_TYPE=online

# ====================================
# WEB DASHBOARD
# ====================================
WEB_PORT=3000
WEB_API_KEY=MTQ1Mzk3NDM1MjY5NjQ0Mjk1MQ

# ====================================
# WEBHOOK LOGGING (Optional)
# ====================================
WEBHOOK_ENABLED=true
WEBHOOK_URL=https://discord.com/api/webhooks/123456789/abcdefghijklmnopqrstuvwxyz
WEBHOOK_USERNAME=TymeeMusic Logger
WEBHOOK_AVATAR_URL=https://i.imgur.com/yourimage.png
WEBHOOK_INFO_ENABLED=true
WEBHOOK_SUCCESS_ENABLED=true
WEBHOOK_WARNING_ENABLED=true
WEBHOOK_ERROR_ENABLED=true
WEBHOOK_DEBUG_ENABLED=false

# ====================================
# ASSETS (required or some some cmds will fail)
# ====================================
DEFAULT_TRACK_ARTWORK=https://i.imgur.com/track-artwork.jpg
DEFAULT_THUMBNAIL=https://i.imgur.com/thumbnail.jpg
HELP_THUMBNAIL=https://i.imgur.com/help-thumbnail.jpg

# ====================================
# EXTERNAL LINKS
# ====================================
SUPPORT_SERVER_URL=https://discord.gg/yourinvite

# ====================================
# ENVIRONMENT
# ====================================
NODE_ENV=production
DEBUG=false
```

> **⚠️ Security Warning:** Never commit your `.env` file to version control! Always keep your tokens and API keys private.

## 🚨 Important Notes

- **Open Source:** This is a fork of Yukihana, modified and enhanced by the community.
- **Under Development:** This project is actively being developed. Expect potential bugs and breaking changes.
- **Report Issues:** Found a bug? Please report it on [GitHub Issues](https://github.com/gxenzy/tymeemusic/issues).
- **Public Hosting:** Hosting a public instance without permission is prohibited.
- **Credits:** Original credits to [Bre4d777](https://github.com/bre4d777) for Yukihana.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request. For major changes, please open an issue first to discuss what you would like to change.

## 👥 Credits

**Original Project:** [Yukihana](https://github.com/OpenUwU/yukihana) by [Bre4d777](https://github.com/bre4d777)

**TymeeMusic:** Forked and enhanced for improved features and customization

---

<p align="center">
  Made with ❤️ by the <a href="https://github.com/gxenzy/tymeemusic">TymeeMusic</a> Community
</p>

<p align="center">
  <a href="https://discord.gg/YOUR_SERVER">Support Server</a> •
  <a href="https://github.com/gxenzy/tymeemusic/issues">Report Bug</a> •
  <a href="https://github.com/gxenzy/tymeemusic/issues">Request Feature</a>
</p>
