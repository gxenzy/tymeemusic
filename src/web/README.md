# Tymee Music Web Dashboard

A web-based music player dashboard for controlling the Discord bot remotely, similar to Spotify's interface.

## Features

- 🎵 Real-time music player controls (play, pause, skip, previous)
- 🔊 Volume control with slider
- 📊 Progress bar with seek functionality
- 🔁 Loop modes (off, track, queue)
- 🔀 Queue shuffling
- 📋 Queue management and display
- 🌐 WebSocket support for real-time updates
- 🔐 API key authentication

## Setup

### Environment Variables

Add these to your `.env` file:

```env
# Web Dashboard Configuration
WEB_PORT=3000                    # Port for the web server (default: 3000)
WEB_API_KEY=your-secret-api-key   # API key for authentication (change this!)
```

### Starting the Bot

The web server will automatically start when the bot is ready. Simply start the bot as usual:

```bash
npm start
# or
npm run dev
```

The dashboard will be available at `http://localhost:3000` (or your configured port).

## Usage

1. **Get Your Guild ID**: 
   - Enable Developer Mode in Discord
   - Right-click on your server → Copy Server ID

2. **Get Your API Key**:
   - Check your `.env` file for `WEB_API_KEY`
   - Or check the bot logs when it starts

3. **Access the Dashboard**:
   - Open `http://localhost:3000` in your browser
   - Enter your API Key and Guild ID
   - Click "Connect"

4. **Control Music**:
   - Use the player controls to play, pause, skip tracks
   - Adjust volume with the slider
   - Click on the progress bar to seek
   - View and manage the queue

## API Endpoints

All API endpoints require authentication via the `X-API-Key` header or `apiKey` query parameter.

### GET `/api/players`
Get all active players (guilds with music playing)

### GET `/api/player/:guildId`
Get player state for a specific guild

### POST `/api/player/:guildId/play`
Resume playback

### POST `/api/player/:guildId/pause`
Pause playback

### POST `/api/player/:guildId/skip`
Skip to next track

### POST `/api/player/:guildId/previous`
Play previous track

### POST `/api/player/:guildId/seek`
Seek to position (body: `{ position: number }` - milliseconds)

### POST `/api/player/:guildId/volume`
Set volume (body: `{ volume: number }` - 0-100)

### POST `/api/player/:guildId/shuffle`
Shuffle the queue

### POST `/api/player/:guildId/loop`
Set loop mode (body: `{ mode: 'off' | 'track' | 'queue' }`)

### GET `/api/player/:guildId/queue`
Get the current queue

### DELETE `/api/player/:guildId/queue/:position`
Remove a track from the queue

## WebSocket Connection

The dashboard uses WebSocket for real-time updates. Connect to:

```
ws://localhost:3000?guildId=YOUR_GUILD_ID&apiKey=YOUR_API_KEY
```

The server will send `state_update` messages whenever the player state changes.

## Security Notes

- **Change the default API key** in production
- Consider adding IP whitelisting for production use
- Use HTTPS/WSS in production environments
- The API key should be kept secret and not shared

## Troubleshooting

- **Can't connect**: Check that the bot is running and the web server started
- **401 Unauthorized**: Verify your API key matches the one in `.env`
- **404 Not Found**: Make sure a player exists for the specified guild ID
- **WebSocket disconnects**: Check your network connection and firewall settings

