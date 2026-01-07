# Release v1.4

## 🎵 TymeeMusic v1.4 - Stability & Accuracy Update

This release focuses on restoring core functionality, fixing critical playback issues, and ensuring accurate track resolution from playlists.

---

## 🌟 Key Improvements

### ✅ Restored Core Playback
- **`t!p` and Slash Commands:** Fully restored to working state (reverted to stable v1.3 architecture)
- **Access Tier System:** Fixed database path resolution that was breaking premium/tier features
- **Bot Commands:** All prefix and slash commands now work correctly

### ✅ Playlist Playback Accuracy (Major Fix)
- **The Problem:** When playing Spotify playlists from the dashboard, tracks would resolve to wrong versions (30-minute compilations instead of 3-minute original songs)
- **The Solution:** Spotify tracks are now resolved using their original Spotify URI at playtime - exactly how the `t!p` command works
- **Result:** Playlist tracks now play the correct original version with accurate duration

### ✅ Real-time Filter Speed Sync
- Track duration now correctly updates when audio filters (Nightcore, Vaporwave, etc.) are applied
- Both Dashboard and Discord Embed show matching durations
- Formula: `Displayed Duration = Original Duration / (Speed × Rate)`

### ✅ UI/UX Improvements
- Mobile layout fixes for time display
- Theme color corrections for Cyberpunk, Dracula, Forest, and Royal themes
- Premium HUD-style preloader with Mintone-inspired design
- Share Track now copies the correct source link (Spotify/YouTube URL)

---

## 🐛 Bug Fixes

| Issue | Status | Notes |
|-------|--------|-------|
| `t!p` command not working | ✅ Fixed | Reverted MusicManager to v1.3 stable |
| Slash commands broken | ✅ Fixed | Database/config paths corrected |
| Access tiers not loading | ✅ Fixed | Database path resolution fixed |
| Playlist tracks playing wrong versions | ✅ Fixed | Now resolves via Spotify URI |
| 30-min compilations instead of songs | ✅ Fixed | Duration matching + proper resolution |
| `enrichTrack is not a function` error | ✅ Fixed | Removed broken enrichment code |
| Mobile time display cramped | ✅ Fixed | Added proper separator styling |
| Theme colors not applying | ✅ Fixed | Added missing CSS variables |

---

## 📂 Files Modified

### Core Fixes
- `src/managers/MusicManager.js` - Reverted to v1.3 stable, removed problematic enrichment code
- `src/managers/PlaylistManager.js` - **Key fix**: Spotify tracks now resolved via URI at playtime
- `src/structures/classes/Database.js` - Reverted to v1.3 path resolution
- `src/config/config.js` - Fixed database paths to match v1.3 format

### Database & API
- `src/database/repo/PlaylistsV2.js` - Added `identifier` and `isrc` to track retrieval
- `src/web/server.js` - Updated queue API with proper track resolution

### Frontend
- `src/web/public/app.js` - Filter speed calculations, UI improvements
- `src/web/public/styles.css` - Mobile fixes, theme definitions
- `src/web/public/index.html` - Time display separator

---

## 🔧 Technical Details

### Spotify Track Resolution Flow (New)
```
User clicks Play on Dashboard Playlist
    ↓
PlaylistManager.playPlaylist() called
    ↓
For each Spotify track:
    → Extract original Spotify URI from database
    → Call this.client.music.search(spotifyUri)
    → LavaSrc resolves to correct YouTube Music track
    → Add fully-resolved track to queue
    ↓
Playback starts with correct track (3-4 min, not 30 min)
```

### Database Path Resolution (Fixed)
```
Before (Broken): process.cwd() + 'src/' → src/src/database/data/
After (Fixed):   __dirname + '../..' + dbPath → src/database/data/
```

---

## ⚠️ Breaking Changes

- **Re-import Playlists:** Existing playlist tracks may not have ISRC data stored. For best accuracy, re-import Spotify playlists after updating.
- **Removed Functions:** `enrichTrack`, `getSpotifyToken`, `getSpotifyArtwork`, `fetchSpotifyExternal`, `_mapSpotifyTrack` have been removed from MusicManager as they were causing issues.

---

## 🔮 Future Improvements

- Drag and Drop playlist reordering
- Advanced track search within dashboard
- Localization/Language support
- Smart Playlists based on listening history

---

## 📌 Version Info

- **Version:** 1.4.0
- **Date:** January 7, 2026
- **Compatibility:** Node.js v16.9.0+, Lavalink v4+

---

Made with ❤️ by the TymeeMusic Community
