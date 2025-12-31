# Emoji Management System & Web Dashboard - Implementation Guide

## Overview
This implementation adds comprehensive emoji management and a full-featured web dashboard to the Tymee Music Bot.

## Part 1: Custom Emoji Management System

### Features
- **Auto-Detection**: Automatically detects and maps custom emojis from Discord servers
- **Fallback System**: Unicode emojis as fallback when custom emojis are unavailable
- **Caching**: In-memory + Redis caching for fast emoji resolution
- **Slash Commands**: `/emoji manage|view|sync` for full emoji control
- **Integration**: Seamless integration with music player controls and embeds

### Files Created/Modified

#### Database Schema
- `src/database/schemas/EmojiMapping.js` - MongoDB schema for emoji mappings

#### Emoji Manager
- `src/managers/EmojiManager.js` - Core emoji management class
- `src/config/emojiConfig.js` - Default emoji configurations
- `src/events/discord/guild/EmojiEvents.js` - Event handlers
- `src/commands/developer/emoji.js` - Slash commands
- `src/utils/PlayerEmojiControls.js` - Player controls with emojis

### Usage

#### Slash Commands
```
/emoji manage add <bot_name> <emoji>  - Add custom emoji mapping
/emoji manage remove <bot_name>       - Remove emoji mapping
/emoji manage set-fallback <name> <emoji>  - Set fallback emoji
/emoji view list [category]           - List emoji mappings
/emoji view defaults                  - Show default emojis
/emoji sync refresh                   - Force sync with server
/emoji sync reset                     - Reset to defaults
```

#### Bot Name Reference
Available internal emoji names:
- **Playback**: play, pause, stop, skip, previous, shuffle, loop, queue, now_playing
- **Filters**: bassboost, equalizer, boost, soft, bass, deepbass, superbass, flat, warm, metal, oldschool, classical, electronic, hiphop, jazz, pop, reggae, rock, gaming, nightcore, vaporwave, vocals, bright, treble, reset
- **Status**: playing, loading, error, success, warning, info, search, music, playlist, volume_up, volume_down, volume_mute, repeat_one, forward, rewind, seek, replay
- **Navigation**: home, back, forward_nav, refresh, settings, help
- **Actions**: add, remove, delete, edit, save, cancel, confirm, upload, download, search, filter, sort, move, bump

---

## Part 2: Web Dashboard

### Features
- **Discord OAuth2**: Secure login with Discord accounts
- **Server Selection**: Choose which server to manage
- **Real-time Updates**: WebSocket for live player state
- **Full Player Controls**: Play, pause, skip, volume, seek, shuffle, loop
- **Queue Management**: View, remove, shuffle, clear queue
- **Playlist Management**: Create, edit, load playlists
- **Server Settings**: Configure prefix, DJ roles, volume, filters
- **Emoji Management**: View and edit emoji mappings
- **Statistics**: View play history, top songs, user stats

### Files Created/Modified

#### Backend
- `src/web/auth/oauth2.js` - Discord OAuth2 authentication
- `src/web/socket/WebSocketManager.js` - WebSocket for real-time updates
- `src/web/routes/api.js` - REST API endpoints
- `src/web/routes/emojis.js` - Emoji API endpoints
- `src/web/middleware/security.js` - Security middleware

#### Frontend
- `src/web/public/index.html` - Dashboard HTML
- `src/web/public/app.js` - Dashboard JavaScript
- `src/web/public/styles.css` - Dashboard styles

### Accessing the Dashboard

1. Start the bot with dashboard enabled
2. Navigate to `http://localhost:3000` (or your configured port)
3. Click "Login with Discord"
4. Authorize the application
5. Select a server to manage
6. Use the navigation bar to switch between pages

### Dashboard Pages

1. **Player** - Music playback controls with album art
2. **Queue** - View and manage the music queue
3. **Playlists** - Create and load playlists
4. **Settings** - Configure server settings
5. **Emojis** - Manage custom emoji mappings
6. **Statistics** - View usage statistics

---

## Environment Variables

### Required for Dashboard
```env
DISCORD_CLIENT_ID=your_client_id
DISCORD_CLIENT_SECRET=your_client_secret
DASHBOARD_URL=http://localhost:3000
SESSION_SECRET=your_session_secret
JWT_SECRET=your_jwt_secret
DASHBOARD_PORT=3000
```

### Required for Redis (Optional)
```env
REDIS_URL=redis://localhost:6379
```

---

## Installation & Setup

1. **Install Dependencies**
```bash
npm install passport passport-discord express-session socket.io express-rate-limit helmet
```

2. **Configure Environment**
Create or update `.env` with the required variables.

3. **Start the Bot**
```bash
npm start
```

4. **Access Dashboard**
Open `http://localhost:3000` in your browser.

---

## API Endpoints

### Player Controls
- `GET /api/player/:guildId` - Get player state
- `POST /api/player/:guildId/play` - Play/Resume
- `POST /api/player/:guildId/pause` - Pause
- `POST /api/player/:guildId/skip` - Skip track
- `POST /api/player/:guildId/volume` - Set volume
- `POST /api/player/:guildId/seek` - Seek to position
- `POST /api/player/:guildId/shuffle` - Toggle shuffle
- `POST /api/player/:guildId/loop` - Set loop mode

### Queue Management
- `GET /api/queue/:guildId` - Get queue
- `DELETE /api/queue/:guildId/:index` - Remove track
- `POST /api/queue/:guildId/shuffle` - Shuffle queue
- `DELETE /api/queue/:guildId` - Clear queue

### Emojis
- `GET /api/emojis/:guildId` - Get emoji mappings
- `POST /api/emojis/:guildId` - Add emoji mapping
- `DELETE /api/emojis/:guildId/:botName` - Remove mapping
- `POST /api/emojis/:guildId/sync` - Sync with server
- `POST /api/emojis/:guildId/reset` - Reset to defaults

### Playlists
- `GET /api/playlists/:guildId` - Get playlists
- `POST /api/playlists/:guildId` - Create playlist
- `POST /api/playlists/:guildId/:id/load` - Load playlist

### Statistics
- `GET /api/stats/:guildId` - Get server statistics

---

## WebSocket Events

### Client → Server
- `guild:join` - Join guild room
- `guild:leave` - Leave guild room
- `player:play/pause/stop/skip` - Player controls
- `player:volume` - Volume control
- `queue:remove/shuffle/clear` - Queue actions

### Server → Client
- `player:state` - Player state update
- `player:update` - Player action update
- `queue:update` - Queue change update
- `emoji:sync` - Emoji sync notification

---

## Customization

### Adding New Emoji Categories
Edit `src/config/emojiConfig.js`:

```javascript
module.exports = {
    categories: [
        {
            name: 'custom',
            priority: 6,
            emojis: [
                { botName: 'my_emoji', discordName: 'my_emoji', fallback: '🎯', description: 'My custom emoji' }
            ]
        }
    ]
};
```

### Styling
Modify `src/web/public/styles.css` for custom colors:
```css
:root {
    --accent: #your_color;
    --accent-hover: #your_hover_color;
}
```

---

## Troubleshooting

### Dashboard Not Loading
1. Check if port 3000 is available
2. Verify `DASHBOARD_URL` is correctly configured
3. Check console for error messages

### OAuth2 Errors
1. Verify `DISCORD_CLIENT_ID` and `DISCORD_CLIENT_SECRET`
2. Ensure redirect URI matches exactly in Discord Developer Portal
3. Check that the bot is in the server

### Emojis Not Syncing
1. Run `/emoji sync refresh` command
2. Check bot has proper permissions
3. Verify emoji exists on the server

### WebSocket Connection Failed
1. Check firewall settings
2. Verify WebSocket port is not blocked
3. Check browser console for errors

---

## Security Considerations

- All API endpoints require authentication
- OAuth2 uses secure session management
- Rate limiting prevents abuse
- Input sanitization on all inputs
- CORS properly configured
- Helmet.js for security headers

---

## Future Improvements

1. **Mobile App**: React Native or Flutter mobile app
2. **Voice Controls**: Integration with voice assistants
3. **Plugin System**: Third-party plugin support
4. **Advanced Analytics**: More detailed statistics
5. **Multi-language Support**: Internationalization
6. **Dark/Light Mode**: Theme switching
7. **Push Notifications**: Mobile notifications
8. **Playlist Sharing**: Share playlists publicly
