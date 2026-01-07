# Investigation: Stats & Playlists Functional Review

## Audio Filters Time Sync
- **Issue**: Progress bar doesn't stay in sync when `speed` or `timescale` filters are applied.
- **Fix**: Added `timescale` property to `getPlayerState` in `src/web/server.js`. The frontend `app.js` already has logic to use `this.playerState.timescale || 1` in `computedPosition`.
- **Status**: ✅ Verified.

## "Recently Played" System Playlist
- **Issue**: "Recently Played" wasn't populating or showing tracks.
- **Root Cause**: `HISTORY_LIMIT` was set to 10 in `User.js`, and `PlaylistsV2.js` had incomplete logic for merging local and legacy history.
- **Fix**: 
  - Increased `HISTORY_LIMIT` to 100 in `User.js`.
  - Updated `getRecentlyPlayedTracks` in `PlaylistsV2.js` to correctly query the `play_history` table.
  - Fixed `getPlaylist` in `PlaylistsV2.js` to handle `system_recent_USERID` dynamically.
- **Status**: ✅ Fixed.

## "Your Top Tracks" & "Discover Weekly"
- **Issue**: Smart playlists were stubs and didn't return tracks.
- **Fix**: 
  - Implemented `generateSmartPlaylist` in `PlaylistsV2.js` to analyze both local and legacy history.
  - Implemented dynamic track fetching for `system_top_USERID` and `system_discover_USERID` in `getPlaylist`.
- **Status**: ✅ Implemented.

## Radio Menu ("Mixed For You")
- **Issue**: Non-functional or inaccurate radio stations.
- **Fix**: 
  - Created a new `Radio` page in the dashboard UI.
  - Implemented `getRadioTracks` in `PlaylistsV2.js` with 'mixed', 'artist', and 'discovery' modes.
  - Added `/api/radio/play` backend endpoint and `playRadio` frontend method.
  - Added premium styling for Radio cards in `styles.css`.
- **Status**: ✅ Implemented.

## Track Fetching Accuracy
- **Issue**: Inaccurate tracks (covers/live) and lost metadata.
- **Fix**:
  - Improved `TrackResolver.js` search query logic (added threshold for aggressive filtering).
  - Ensured `originalTitle` and `originalAuthor` are preserved in `userData` during `enrichTrack`.
  - Configured `lavalink-client` to use `useUnresolvedData: true`.
  - Added robust Spotify fallback fetching via direct API when Lavalink fails.
- **Status**: ✅ Improved.

## Admin Settings & Clear Statistics
- **Issue**: Reset statistics button was missing server-side implementation; requested more admin suggestions.
- **Fix**:
  - Implemented `clearGuildStats` in `Stats.js` and hooked up to `DELETE /api/stats/:guildId/clear`.
  - Added "Force Player Reset" admin control for troubleshooting.
  - Improved Admin UI with a dedicated grid for data and debugging.
- **Status**: ✅ Enhanced.

---

## Session 2 Fixes (January 2026)

### Audio Filters Time Sync - Progress Bar Stuck at 0:00
- **Issue**: The progress bar was stuck at 0:00 and not updating when music plays, especially with speed/slow filters.
- **Root Cause**: The `computedPosition` getter was **completely missing** from `app.js`. This getter is essential for calculating the current playback position based on the snapshot + elapsed time with timescale adjustments.
- **Fix**: 
  - Restored the `computedPosition` getter in `MusicDashboard` class.
  - The getter correctly handles: scrubbing state, paused state, timescale (playback speed), and duration clamping.
- **Status**: ✅ Fixed.

### Visualizer Not Visible / Not Animating
- **Issue**: Visualizer only appeared after refresh. Also, the animation wouldn't trigger when music played.
- **Root Cause**: 
  1. The `visualizer.setState()` method was never being called when playback state changed.
  2. The canvas had a `hidden` class that wasn't being removed.
- **Fix**:
  - Added `if (this.visualizer) this.visualizer.setState(isPlaying && !isPaused);` in the `updateUI` method.
  - Removed unnecessary visualizer modes ('bars', 'wave') - only 'aura' and 'particles' remain.
  - Canvas is now explicitly made visible during initialization.
- **Status**: ✅ Fixed.

### "Add to Playlist" Button
- **Issue**: Clicking the button showed "Save Queue as Playlist" instead of showing a playlist selection modal.
- **Root Cause**: The button's onclick called `saveQueueToPlaylist()` instead of a proper `openAddToPlaylistModal()` method.
- **Fix**:
  - Implemented `openAddToPlaylistModal()` method that:
    - Fetches user's playlists
    - Displays a modal with a clickable list of playlists
    - Allows adding the current track to any selected playlist
  - Implemented `addCurrentTrackToPlaylist(playlistId)` method for the actual API call.
  - Added CSS styles for `.playlist-select-list` and `.playlist-select-item`.
- **Status**: ✅ Fixed.

### "Select a Server" Text Gradient Not Changing with Theme
- **Issue**: The gradient text wasn't adapting to the selected theme.
- **Root Cause**: `.text-gradient` was using `var(--gradient-primary)` which doesn't exist.
- **Fix**: Updated `.text-gradient` to use: `linear-gradient(135deg, var(--accent) 0%, var(--accent-hover) 50%, var(--progress-fill-secondary) 100%)`.
- **Status**: ✅ Fixed.

### Header Spacing Too Large
- **Issue**: The header had excessive padding on both desktop and mobile.
- **Fix**:
  - Reduced `.header` padding from `spacing-lg spacing-xl` to `spacing-sm spacing-lg`.
  - Reduced `.header-content` gap from `spacing-lg` to `spacing-sm`.
  - Reduced `.logo-wrapper` gap from 12px to 8px.
  - Reduced `.header-logo` size from 52px to 40px (32px on mobile).
  - Added mobile-specific styles to further compact the header.
- **Status**: ✅ Fixed.

### Toast Notifications Using Emojis Instead of Icons
- **Issue**: Pop-up toast messages used emoji prefixes (✅, ❌, ⚠️) instead of Phosphor icons.
- **Fix**:
  - Updated `showToast()` to automatically strip emoji prefixes using regex patterns.
  - Added icon mapping based on toast type (success, error, warning, info).
  - Toast now renders with Phosphor icon + message text.
  - Added comprehensive CSS styles for `.toast-notification` with type-specific colors.
- **Status**: ✅ Fixed.

### Keyboard Shortcuts - Ctrl+Shift+R Not Working
- **Issue**: Hard refresh (Ctrl+Shift+R) was intercepted by the keyboard shortcut handler.
- **Fix**: Explicitly added `(e.ctrlKey && e.shiftKey && e.key === 'R')` to the ignore list in `setupKeyboardShortcuts()`.
- **Status**: ✅ Fixed.

---

## Pending/Future Improvements

### Lyrics Functionality
- **Current State**: Lyrics fetching is slow and not always accurate.
- **Planned Enhancements**:
  1. Implement multiple lyrics provider fallbacks (Genius, Musixmatch, lyrics.ovh).
  2. Add AI-powered lyrics search using track audio fingerprinting.
  3. Implement lyrics display in Discord embed player.

### Server Lag/Stuttering
- **Current State**: Some lag reported during playback.
- **Already Done**: Fixed JSON parsing errors, reduced polling frequency, fixed 404 error floods.
- **Further Investigation**: May require server-side performance profiling.

---

## Session 3 Fixes (January 2026) - UI/UX & Functionality Refinement

### Audio Filters Time Sync & Progress Bar Delay
- **Issue**: Progress bar was stuttering and not syncing correctly with audio filters (speed/pitch).
- **Root Cause**: The local position ticker (`startPositionUpdates`/`stopPositionUpdates`) was missing or incorrectly implemented, relying solely on slow server polling (4s).
- **Fix**: 
  - Implemented `startPositionUpdates` to tick every 200ms using `computedPosition`.
  - Added logic to `updateUI` to start/stop the ticker based on playback state.
  - Ensured `computedPosition` accounts for `timescale` (playback speed).
- **Status**: ✅ Fixed (Smooth updates).

### Visualizer Features
- **Issue**: Particles mode broken, other modes missing, single working mode 'aura'.
- **Fix**:
  - Restored all modes: `aura`, `particles`, `bars`, `wave`.
  - Added **2 NEW MODES**: `spectrum` (circular frequency bars) and `orbit` (rotating energy rings).
  - Fixed `cycleMode` to properly rotate through all available modes.
  - Fixed `switch` case fallbacks in `draw()`.
- **Status**: ✅ Enhanced (6 modes available).

### "Add to Playlist" Button Functionality
- **Issue**: Button click did nothing or showed wrong action.
- **Root Cause**: Missing CSS for `.popup-overlay` prevented the modal from being visible.
- **Fix**: 
  - Added comprehensive CSS for `.popup-overlay`, `.popup-content`, etc.
  - Verified `openAddToPlaylistModal` logic fetches and displays playlists correctly.
- **Status**: ✅ Fixed.

### Mobile Layout & Header Sizing
- **Issue**: Header logo/text too small on mobile/desktop; horizontal scroll on player page.
- **Fix**:
  - Increased Desktop Logo to 52px, Title to 1.75rem.
  - Increased Mobile Logo to 40px, Title to 1.25rem.
  - Added `overflow-x: hidden` to player container to prevent horizontal scrolling on mobile.
  - Adjusted general header padding and gap spacing.
- **Status**: ✅ Fixed.

### Share Track Functionality
- **Issue**: Sharing resulted in a generic YouTube search URL instead of the actual track link.
- **Fix**:
  - Updated `shareCurrentTrack` to prioritize `track.uri` (Spotify/SoundCloud/YouTube direct links).
  - Added intelligent source detection (Spotify, YouTube, SoundCloud).
  - Fallback: Copies "Title - Artist" to clipboard if no URL is available (instead of a search link).
  - Improved Toast feedback ("Spotify link copied!", "Track info copied!").
- **Status**: ✅ Fixed.

### Keyboard Shortcuts Toggle
- **Issue**: No UI to disable shortcuts.
- **Fix**:
  - Added "Keyboard Shortcuts" toggle switch to General Settings in `index.html`.
  - Implemented `toggleShortcuts()` in `app.js` to save preference to `localStorage`.
  - Updated initialization to respect the saved setting on load.
- **Status**: ✅ Fixed.
