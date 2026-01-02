---
description: Master implementation plan for TymeeMusic Dashboard
---

# TymeeMusic Dashboard - Implementation Plan

## Overview
This document tracks all features, bugs, and improvements for the TymeeMusic web dashboard and Discord bot integration.

---

## 🎯 Priority Levels
- **P0**: Critical - Breaks core functionality
- **P1**: High - Important features/bugs
- **P2**: Medium - Nice to have improvements
- **P3**: Low - Minor enhancements

---

## 📋 Feature Categories

### 1. Music Player Permission System (P0)
**Status**: 🔴 Not Started

**Requirements**:
- [ ] Track who started the current music session (session owner)
- [ ] Require permission from session owner for player controls:
  - Next/Previous track
  - Shuffle/Repeat
  - Volume changes
  - Queue modifications (add/remove/clear)
  - Stop playback
- [ ] Implement permission request popup with sound notification
- [ ] Session owner receives real-time notification when permission is requested
- [ ] Exempt roles: Owner, VIP, Premium
- [ ] Apply same permission logic to Discord chat commands
- [ ] WebSocket events for permission requests/responses

**Files to modify**:
- `src/web/public/app.js` - Frontend permission UI
- `src/web/server.js` - API endpoints for permissions
- `src/web/socket/WebSocketManager.js` - Real-time notifications
- `src/events/discord/guild/slashcmd.js` - Discord command permissions
- `src/events/discord/guild/Prefixcmd.js` - Prefix command permissions
- `src/managers/PlayerManager.js` - Session owner tracking

---

### 2. Dashboard Login/Refresh Bug (P0)
**Status**: 🔴 Not Started

**Issues**:
- [ ] Homepage flickers on login/refresh
- [ ] Navigation tabs (Player, Queue, Radio, etc.) visible before server selection
- [ ] 2-second delay before proper server selection view appears

**Root Cause**: UI renders before auth state is fully determined

**Solution**:
- [ ] Add loading state during auth check
- [ ] Hide navigation until server is selected
- [ ] Fix CSS visibility states
- [ ] Add smooth transition instead of flicker

**Files to modify**:
- `src/web/public/app.js` - Auth state management
- `src/web/public/index.html` - Initial hidden states
- `src/web/public/styles.css` - Loading states

---

### 3. Theme Selection UI Redesign (P1)
**Status**: 🔴 Not Started

**Issues**:
- [ ] Theme dropdown poorly positioned (center alignment)
- [ ] Should be below profile section on right side
- [ ] Gradient backgrounds not applying properly
- [ ] Need better interactivity and hover effects
- [ ] Less space on bar needed
- [ ] Server Settings > Dashboard Theme needs same rework

**Design Requirements**:
- [ ] Move theme selector below profile avatar (dropdown)
- [ ] Add smooth gradient transitions
- [ ] Fix background gradient application for all themes
- [ ] Add hover animations
- [ ] Compact design

**Files to modify**:
- `src/web/public/index.html` - Move theme selector
- `src/web/public/styles.css` - Theme styles, gradients
- `src/web/public/app.js` - Theme application logic

---

### 4. Stats Page - Data Fetching (P1)
**Status**: 🔴 Not Started

**Issues**:
- [ ] Total servers works
- [ ] Active players not fetching
- [ ] Total plays not fetching
- [ ] Unique users not fetching
- [ ] Bot uptime not fetching

**Solution**:
- [ ] Implement proper stats collection in backend
- [ ] Add database tracking for plays, unique users
- [ ] Calculate uptime from process start time
- [ ] Create stats aggregation endpoint

**Files to modify**:
- `src/web/server.js` - Stats API endpoint
- `src/web/public/app.js` - Stats fetching
- `src/database/repo/Stats.js` - Stats repository (create)

---

### 5. Playlist System Overhaul (P1)
**Status**: 🟡 Partial

**Current State**: Basic structure exists but incomplete

**Required Features**:
- [ ] Create/Edit/Delete playlists
- [ ] Copy share link
- [ ] Lock/Public toggle per playlist
- [ ] Public/Private tabs
- [ ] Import from Spotify
- [ ] Import from YouTube Music
- [ ] Search tracks across platforms
- [ ] Add tracks to playlist
- [ ] Remove tracks from playlist
- [ ] Reorder tracks (drag & drop)
- [ ] Play button → Add to queue seamlessly
- [ ] Playlist artwork
- [ ] Track count and duration display
- [ ] Similar UI to Spotify/YouTube playlists

**Files to modify**:
- `src/web/public/app.js` - Playlist UI logic
- `src/web/public/index.html` - Playlist HTML structure
- `src/web/public/styles.css` - Playlist styling
- `src/web/server.js` - Playlist API endpoints
- `src/database/repo/Playlist.js` - Playlist database operations

---

### 6. Emoji Management Fixes (P1)
**Status**: 🟡 Partial

**Issues**:
- [ ] Duplicate Live Discord Preview (old at top-right, new at bottom-left)
- [ ] Auto-Sync should be split into:
  - "Sync Server Emojis" (fetch from server)
  - "Auto-Match Emojis" (match names to functions)
- [ ] Default emojis not fetching from bot categories (Music Help, Voice Channel Status, Player Control, Embed, Actions, Filters)
- [ ] Cannot select custom/server/bot emojis when editing (popup blocking)

**Solution**:
- [ ] Remove old Live Discord Preview
- [ ] Split Auto-Sync button into two buttons
- [ ] Fix emoji category fetching from emojiConfig.js
- [ ] Fix emoji picker modal z-index/positioning

**Files to modify**:
- `src/web/public/index.html` - Remove duplicate preview
- `src/web/public/app.js` - Emoji sync logic
- `src/web/public/styles.css` - Modal z-index
- `src/web/server.js` - Emoji API endpoints
- `src/config/emojiConfig.js` - Default emoji categories

---

### 7. Server Settings Redesign (P2)
**Status**: 🔴 Not Started

**Issues**:
- [ ] Poor layout design
- [ ] No save confirmation messages
- [ ] Premium section purpose unclear

**Requirements**:
- [ ] Modern, formal layout design
- [ ] Toast notifications for save actions
- [ ] Clearly explain Premium features
- [ ] Section: General, DJ Roles, Permissions, 24/7 Mode, Premium
- [ ] Consistent styling with dashboard theme

**Files to modify**:
- `src/web/public/index.html` - Settings HTML
- `src/web/public/styles.css` - Settings styling
- `src/web/public/app.js` - Save confirmation toasts

---

## ✅ Completed Features

### Session 1 (Previous)
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

---

## 📅 Implementation Order

### Phase 1: Critical Fixes
1. Dashboard Login/Refresh Bug
2. Emoji Management duplicate removal
3. Theme gradient fixes

### Phase 2: Core Features
4. Music Player Permission System
5. Stats Page data fetching
6. Emoji Management full implementation

### Phase 3: Major Features
7. Playlist System overhaul
8. Server Settings redesign

### Phase 4: Polish
9. Theme Selection UI redesign
10. Final testing and bug fixes

---

## 📝 Notes
- Last updated: 2026-01-02
- Next session focus: Phase 1 (Critical Fixes)
