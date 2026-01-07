---
description: Master implementation plan for TymeeMusic Dashboard
---

# TymeeMusic Dashboard - Implementation Plan

## Overview
This document tracks all features, bugs, and improvements for the TymeeMusic web dashboard and Discord bot integration.

**Last Updated**: 2026-01-06 (Session 8)

---

## 🎯 Priority Levels
- **P0**: Critical - Breaks core functionality
- **P1**: High - Important features/bugs
- **P2**: Medium - Nice to have improvements
- **P3**: Low - Minor enhancements

---

## 📋 Feature Categories

### 1. Music Player Permission System (P0)
**Status**: ✅ COMPLETE

**Requirements**:
- [x] Track who started the current music session (session owner)
- [x] Require permission from session owner for player controls
- [x] Implement permission request popup with sound notification
- [x] Session owner receives real-time notification when permission is requested
- [x] Exempt roles: Owner, VIP, Premium
- [x] Apply same permission logic to Discord chat commands
- [x] WebSocket events for permission requests/responses

---

### 2. Dashboard Login/Refresh Bug (P0)
**Status**: ✅ COMPLETE

**Fixes Applied**:
- [x] Add loading state during auth check
- [x] Hide navigation until server is selected
- [x] Fix CSS visibility states
- [x] Add smooth transition instead of flicker

---

### 3. Theme Selection UI Redesign (P1)
**Status**: ✅ COMPLETE

**Fixes Applied**:
- [x] Move theme selector below profile avatar (dropdown)
- [x] Add smooth gradient transitions
- [x] Fix background gradient application for all themes
- [x] Add hover animations
- [x] Compact design

---

### 4. Stats Page - Data Fetching (P1)
**Status**: ✅ COMPLETE

**Fixes Applied**:
- [x] Implement proper stats collection in backend
- [x] Add database tracking for plays, unique users
- [x] Calculate uptime from process start time
- [x] Create stats aggregation endpoint

---

### 5. Playlist System Overhaul (P1)
**Status**: ✅ 100% COMPLETE

**Features Implemented**:
- [x] Create/Edit/Delete playlists
- [x] Copy share link
- [x] Lock/Public toggle per playlist
- [x] Import from Spotify
- [x] Import from YouTube Music
- [x] Search tracks across platforms
- [x] Add tracks to playlist
- [x] Remove tracks from playlist
- [x] Reorder tracks (drag & drop)
- [x] Play button → Add to queue seamlessly
- [x] Playlist artwork
- [x] WebSocket import progress events (`playlist:import_progress`)
- [x] Import from Queue (`/api/v2/playlists/import/queue`)

**Remaining (Phase 6 - Optional)**:
- [x] Collaborative playlists UI ✅ Done (Session 6)
- [x] Smart playlists (auto-generated) ✅ Done (Session 8)
- [ ] Button-based Discord interactions


---

### 6. Emoji Management Fixes (P1)
**Status**: ✅ COMPLETE

**Fixes Applied**:
- [x] Remove old Live Discord Preview
- [x] Split Auto-Sync button into two buttons
- [x] Fix emoji category fetching from emojiConfig.js
- [x] Fix emoji picker modal z-index/positioning

---

### 7. Server Settings Redesign (P2)
**Status**: ✅ COMPLETE

**Features Implemented**:
- [x] Modern, formal layout design
- [x] Toast notifications for save actions
- [x] Clearly explain Premium features
- [x] Section: General, DJ Roles, Permissions, 24/7 Mode, Premium
- [x] Consistent styling with dashboard theme

---

### 8. Unified Search & Discovery System (P1)
**Status**: ✅ COMPLETE

**Features Implemented**:
- [x] Universal search bar (Spotify, YouTube, SoundCloud)
- [x] Predictive search/Autosuggestions
- [x] Tabbed results view (Tracks, Albums, Artists, Playlists)
- [x] Recent search history
- [x] "Add to Queue" and "Play Now" actions directly from search
- [x] Filter by source (Spotify/YouTube/etc)

---

### 9. Audio Filter System (P1)
**Status**: ✅ COMPLETE

**Features Implemented**:
- [x] Dashboard filter UI with genre presets
- [x] Discord button menu filter selector
- [x] Reset All button - **CRITICAL FIX**: Clear `equalizerBands` array
- [x] Real-time filter sync across dashboard/Discord
- [x] Nightcore, Vaporwave, Bassboost, and 20+ more filters

**Technical Discovery**:
- `lavalink-client` stores EQ bands separately in `filterManager.equalizerBands[]`
- Must clear this array in addition to `data` object for true reset
- Fixed persistent filter bug caused by library sync loop

---

### 10. Music Player UI Stability (P0) 🆕
**Status**: ✅ COMPLETE (Session 5 - 2026-01-05)

**Issues Fixed**:
- [x] **Ghost Embeds**: Multiple "Now Playing" cards appearing in Discord
- [x] **Time Flickering**: Progress bar jumping between two different times
- [x] **Zombie Timers**: Update intervals continuing after track ends
- [x] **Persistent Orphans**: Embeds not deleted when queue ends or bot disconnects

**Technical Solution**:
1. **Memory-Hard Heartbeat Registry**: Moved interval timers from player properties to a physical RAM Map in `EventUtils.js`
2. **Heartbeat Tokens**: Each track start generates a unique token; old intervals self-destruct on mismatch
3. **Execution Sequence IDs**: Rapid skips only allow the final song to touch the UI
4. **Scorched Earth Cleanup**: Scan 30 messages for orphaned bot embeds before creating new

**Files Modified**:
- `src/events/player/trackStart.js` - Added execution IDs, heartbeat tokens, memory registry
- `src/events/player/trackEnd.js` - Added `EventUtils.clearHeartbeat(guildId)`
- `src/events/player/queueEnd.js` - Added `EventUtils.clearHeartbeat(guildId)`
- `src/events/player/playerDestroy.js` - Added `EventUtils.clearHeartbeat(guildId)`
- `src/utils/EventUtils.js` - Added `activeHeartbeats` Map, `clearHeartbeat()`, `registerHeartbeat()`
- `src/utils/DiscordPlayerEmbed.js` - Added PID debug info to footer (temporary)

---

## 🆕 NEW FEATURES TO IMPLEMENT

### 11. Smart Radio/AutoPlay Enhancement (P1)
**Status**: ✅ COMPLETE (Session 7)

**Requirements**:
- [x] Improve song recommendations based on user history (Personalized Station)
- [x] Fallback to trending search if history is empty
- [x] Display "Crafting Mix" notification in UI
- [x] Special gradient UI for personalized radio card

---

### 12. Listening Party Mode Sync (P2)
**Status**: ✅ COMPLETE (Session 7)

**Requirements**:
- [x] Sync playback across multiple users (via real-time WebSocket broadcast)
- [x] Shared view: everyone in same guild sees same state
- [x] Party host controls (Server DJ permissions)
- [x] Real-time position and state sync

---

### 13. Audio Visualizer Enhancement (P2)
**Status**: ✅ COMPLETE (Session 6 & 7)

**Requirements**:
- [x] Add audio visualizer to dashboard player
- [x] Multiple visualizer styles (Aura, Bars, Wave, Particles)
- [x] Toggle/Cycle styles button
- [x] Idle mode: Show "Nothing's playing" Quick Start view (Session 7)

---

### 14. Smart Queue Management (P1)
**Status**: 🔶 PARTIAL (Basic implemented)

**Implemented**:
- [x] Drag-and-drop reordering in dashboard
- [x] "Play Next" vs "Add to Queue" options
- [x] Save Queue to Playlist button
- [x] History-based playback (History Panel) ✅ Done (Session 8)


**Remaining**:
- [ ] Queue save/load as named presets
- [ ] Queue shuffle preview
- [ ] Duplicate detection

---

### 15. Discord Activity & Polish (P2)
**Status**: ✅ COMPLETE (Session 6 & 7)

**Requirements**:
- [x] Rich presence showing current track
- [x] Dashboard: Smooth status banner transitions (Session 7)
- [x] Dashboard: Queue title spacing fix (Session 7)
- [x] Dashboard: Playlist "Create New" grid item (Session 7)
- [x] Dashboard: Keyboard Shortcuts Help Modal (Session 6)

---

## ✅ Completed Sessions

### Session 1 (Initial Setup)
- [x] Basic dashboard structure
- [x] Discord OAuth integration
- [x] Server selection
- [x] Basic player controls UI
- [x] Queue display
- [x] WebSocket connection for real-time updates
- [x] Basic emoji management structure
- [x] Bot owner RBAC access to restricted pages
- [x] Live Discord Preview panel (new version)
- [x] CSS fixes for styles.css linting errors

### Session 2 (Stability)
- [x] **24/7 Mode Fixes**: Resolved crash due to composite ID mismatch in database.
- [x] **Resume Playback**: Implemented graceful shutdown and auto-resume of player sessions.
- [x] **Lyrics Engine**: Enhanced with multiple sources (LRCLIB, Lyrics.ovh) and search fallback.
- [x] **UI Polish**: Fixed duplicate emojis, 24/7 toggle visual state, and button alignment.
- [x] **Shard Manager**: Fixed process signal handling for reliable shutdowns.

### Session 3 (Audio Filters)
- [x] **Audio Filter Reset Fix**: Discovered and fixed critical bug where `equalizerBands[]` was not being cleared, causing filters to persist. Applied "Super Nuclear Reset" across all filter reset paths.
- [x] **PlayerbuttonsHandler Fix**: Fixed syntax errors in music_filters_select handler caused by incomplete try/catch structure.
- [x] **Deep Library Analysis**: Analyzed `lavalink-client` v2.5.7 internal structure to understand filter state management.

### Session 4 (Playlist Polish)
- [x] **Playlist UI Fixes**: Fixed playlist cover generation (added collage view), updated track list UI to be cleaner.
- [x] **Track Removal Bug**: Fixed track removal using incorrect index (switched to 1-based positioning to match backend).
- [x] **Playlist Metadata**: Enriched playlist owner name in API responses.
- [x] **Toggle Switches**: Standardized toggle switch HTML/CSS for better interactivity and visual consistency.

### Session 5 (Ghost Embeds - 2026-01-05)
- [x] **Ghost Embed Elimination**: Fixed multiple "Now Playing" cards and time flickering
- [x] **Memory-Hard Heartbeat Registry**: Moved timers to RAM Map for reliable cleanup
- [x] **Heartbeat Tokens**: Each track gets unique token; old intervals self-destruct
- [x] **Execution Sequences**: Rapid skips only allow final song to update UI
- [x] **Scorched Earth**: Aggressive 30-message scan for orphan embeds
- [x] **PID Debugging**: Added process ID to embed footer for zombie detection

### Session 8 (Dashboard Functionality & Bug Fixes - 2026-01-06) 🆕
- [x] **Audio Filter Time Sync**: Fixed progress bar drift when speed/slow filters are active.
- [x] **Visualizer Visibility**: Boosted energy simulation and alpha levels for better display.
- [x] **Button Error Fixes**: Fixed "Like," "Share," and "History" buttons using incorrect state property.
- [x] **System Playlists**: Fixed "Recently Played" and "Top Tracks" population via logPlay integration.
- [x] **Admin: Clear Stats**: Added backend API and frontend button for resetting server statistics.
- [x] **Add to Playlist Navigation**: Fixed navigation when clicks occurred in search results.
- [x] **Visualizer Size Boost**: Increased canvas size from 360px to 540px for desktop visibility.
- [x] **Track Duration Speed Sync**: Fixed backend calculation to support Nightcore/Vaporwave rates (Session 9).
- [x] **Mobile UI Fixes**: Fixed time display layout on small screens (Session 9).
- [x] **Discord Embed Sync**: Updated embeds to match Real-Time Dashboard duration (Session 9).

### Session 6 (Session Resume & Player Fixes - 2026-01-06)
---

## 📅 Implementation Order

### Phase 1: Critical Fixes ✅ COMPLETE
1. ~~Dashboard Login/Refresh Bug~~
2. ~~Emoji Management duplicate removal~~
3. ~~Theme gradient fixes~~
4. ~~Audio Filter Reset Bug~~
5. ~~Ghost Embed / Time Flickering Bug~~ 🆕

### Phase 2: Core Features ✅ COMPLETE
6. ~~Music Player Permission System~~
7. ~~Stats Page data fetching~~
8. ~~Emoji Management full implementation~~
9. ~~Audio Filters Dashboard~~

### Phase 3: Major Features ✅ COMPLETE
10. ~~Playlist System overhaul~~ (95% Complete)
11. ~~Server Settings redesign~~
12. ~~Unified Search & Discovery System~~

### Phase 4: Enhancement Features 🔶 IN PROGRESS
13. Smart Queue Management (Partial)
14. Smart Radio/AutoPlay Enhancement
15. Audio Visualizer
16. Listening Party Mode
17. Discord Activity Integration

---

## 📝 Notes
- Last updated: 2026-01-06
- Next session focus: Smart Radio Enhancement or Clean up PID debug from embed footer
- **Key Technical Insight**: Session resume requires saving both `encoded` AND `info` for tracks; `lavalink.utils.buildTrack()` needs both to work correctly
- **Key Technical Insight**: `lavalink-client` stores EQ in `equalizerBands[]` separately from `data` object
- **Key Technical Insight**: Player UI timers must be stored in a Memory Map, not player properties, for reliable cleanup
