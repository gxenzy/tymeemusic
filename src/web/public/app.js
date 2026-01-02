class MusicDashboard {
  constructor() {
    console.log("=== MUSIC DASHBOARD INITIALIZING ===");
    this.apiKey = "MTQ1Mzk3NDM1MjY5NjQ0Mjk1MQ"; // Default API key from config
    this.guildId = "";
    this.socket = null; // Socket.IO client
    this.socketToken = null;
    this.lastRealtimeAt = 0;
    this.pollInterval = null;
    this.pollWatchdogInterval = null;
    this.playerState = null;
    this.queue = [];
    this.positionUpdateInterval = null;
    // Snapshot-based timekeeping for progress:
    // positionAtSnapshotMs: player position reported by the server at snapshot time
    // snapshotReceivedAtMs: local time when that snapshot was received
    this.positionAtSnapshotMs = 0;
    this.snapshotReceivedAtMs = 0;
    // Hydration/loading flags (prevents "stale player + empty queue" on navigation)
    this.isHydrating = false;
    // Progress bar scrubbing state
    this.isScrubbing = false;
    this.scrubDesiredPositionMs = null;
    this.scrubLastSentPositionMs = null;
    this.scrubSendTimeout = null;
    this._boundScrubMove = null;
    this._boundScrubUp = null;
    this.user = null;
    this.servers = [];
    this.currentPage = "home";
    this.emojiMappings = [];
    this.serverEmojis = [];
    // Dashboard-local emoji resolution cache:
    // botName -> { emoji_id, emoji_url, is_animated, is_available, fallback, category, bot_name }
    this.emojiMap = new Map();
    // If user opens a shared playlist link: /dashboard?playlist=<id>
    // We will NOT auto-select a random guild. We'll wait until the user selects a server,
    // then auto-open the playlist.
    this.pendingPlaylistId =
      new URLSearchParams(window.location.search).get("playlist") || null;
    // Local theme (dashboard-only). Persisted in localStorage.
    // Local theme (dashboard-only). Persisted in localStorage.
    this.themeKey = "dashboard_theme";
    this.theme = localStorage.getItem(this.themeKey) || "default";
    this.userDropdownOpen = false;
    this.applyTheme(this.theme);
    this.initializeElements();
    this.attachEventListeners();
    // Initialize user dropdown (includes theme selector)
    this.setupUserDropdown();
    // Servers page status cache: guildId -> { active, playing, paused, queueSize, voiceChannel }
    this.serverStatusMap = new Map();
    // Auto-refresh Servers page statuses
    this.serverStatusInterval = null;
    // Prevent race conditions when switching guild + navigating pages quickly
    this.serverSwitchInFlight = null;
    // Small delay to let inline auth script complete

    // Initial state is "Loading..."
    if (this.statusText) this.statusText.textContent = "⌛ Loading...";

    setTimeout(() => {
      this.checkAuth();
    }, 50);
  }
  initializeElements() {
    this.authSection = document.getElementById("authSection");
    this.userSection = document.getElementById("userSection");
    this.loginBtn = document.getElementById("loginBtn");
    this.logoutBtn = document.getElementById("logoutBtn");
    this.userAvatar = document.getElementById("userAvatar");
    this.userName = document.getElementById("userName");
    // User Dropdown Elements
    this.userDropdownContainer = document.getElementById("userDropdownContainer");
    this.userDropdownTrigger = document.getElementById("userDropdownTrigger");
    this.userDropdownMenu = document.getElementById("userDropdownMenu");
    this.userDropdownName = document.getElementById("userDropdownName");
    this.serverSelector = document.getElementById("serverSelector");
    this.serverList = document.getElementById("serverList");
    this.navBar = document.getElementById("navBar");
    this.connectionStatus = document.getElementById("connectionStatus");
    this.statusText = document.getElementById("statusText");
    this.mainContent = document.getElementById("mainContent");
    this.loginRequired = document.getElementById("loginRequired");
    this.loginRequiredBtn = document.getElementById("loginRequiredBtn");
    this.errorDisplay = document.getElementById("errorDisplay");
    this.errorMessage = document.getElementById("errorMessage");
    this.pages = {
      servers: document.getElementById("serverSelector"),
      home: document.getElementById("homePage"),
      player: document.getElementById("playerPage"),
      queue: document.getElementById("queuePage"),
      playlists: document.getElementById("playlistsPage"),
      settings: document.getElementById("settingsPage"),
      emojis: document.getElementById("emojisPage"),
      stats: document.getElementById("statsPage"),
      radio: document.getElementById("radioPage"),
    };
    // Homepage Stats
    this.statServers = document.getElementById("stat-servers");
    this.statUsers = document.getElementById("stat-users");
    this.statTracks = document.getElementById("stat-tracks");
    this.albumArt = document.getElementById("albumArt");
    this.noArtwork = document.getElementById("noArtwork");
    this.trackTitle = document.getElementById("trackTitle");
    this.trackArtist = document.getElementById("trackArtist");
    this.guildName = document.getElementById("guildName");
    this.progressBar = document.getElementById("progressBar");
    this.progressFill = document.getElementById("progressFill");
    this.currentTime = document.getElementById("currentTime");
    this.totalTime = document.getElementById("totalTime");
    this.playPauseBtn = document.getElementById("playPauseBtn");
    this.previousBtn = document.getElementById("previousBtn");
    this.nextBtn = document.getElementById("nextBtn");
    this.shuffleBtn = document.getElementById("shuffleBtn");
    this.lastRealtimeAt = 0; // Fixed some duplicate IDs
    this.repeatBtn = document.getElementById("repeatBtn");
    this.volumeSlider = document.getElementById("volumeSlider");
    this.volumeValue = document.getElementById("volumeValue");
    this.volumeIcon = document.getElementById("volumeIcon");
    this.queueList = document.getElementById("queueList");
    this.queueCount = document.getElementById("queueCount");
    this.emojiMappingsContainer = document.getElementById("emojiMappings");
    this.emojiCategoryBtns = document.querySelectorAll(".category-btn");
    // Premium Utility elements
    this.sleepTimerBtn = document.getElementById("sleepTimerBtn");
    this.sleepTimerStatus = document.getElementById("sleepTimerStatus");
    this.sleepTimerMenu = document.getElementById("sleepTimerMenu");
    this.lyricsBtn = document.getElementById("lyricsBtn");
    this.lyricsModal = document.getElementById("lyricsModal");
    this.lyricsTitle = document.getElementById("lyricsTitle");
    this.lyricsContent = document.getElementById("lyricsContent");
    this.lyricsLangSelect = document.getElementById("lyricsLangSelect");
    this.translateLyricsBtn = document.getElementById("translateLyricsBtn");
  }
  async checkAuth() {
    console.log("=== FRONTEND AUTH CHECK (APP) ===");
    // Try to verify with server first
    try {
      console.log("Verifying auth with server...");
      const response = await fetch("/auth/check", {
        credentials: "same-origin",
      });
      console.log("Response status:", response.status);
      const data = await response.json();
      console.log("Full API response:", JSON.stringify(data));
      if (data.authenticated && data.user) {
        this.user = data.user;
        localStorage.setItem("dashboard_user", JSON.stringify(data.user));
        localStorage.setItem("dashboard_auth", "true");
        if (this.user?.id) {
          localStorage.setItem("dashboard_user_id", this.user.id);
        }
        console.log("User from API:", this.user.username);
        this.showUserSection();
        await this.loadUserServers();
        // If user opened a shared playlist link, do NOT auto-select a random server.
        // We will route them to the Servers page and auto-open after they select a server.
        if (this.pendingPlaylistId) {
          this.showDashboard();
          return;
        }
        this.showDashboard();
        return;
      } else {
        // Server says not authenticated - clear any stale localStorage data
        console.log("Server rejected auth - clearing localStorage");
        localStorage.removeItem("dashboard_user");
        localStorage.removeItem("dashboard_auth");
        localStorage.removeItem("dashboard_user_id");
        this.showLoginRequired();
        return;
      }
    } catch (error) {
      console.error("Auth check failed:", error);
    }
    // Network error - show login (don't use stale localStorage)
    console.log("Network error - showing login screen");
    this.showLoginRequired();
  }
  showUserSection() {
    console.log("=== SHOWING USER SECTION ===");
    this.authSection.classList.add("hidden");
    this.userSection.classList.remove("hidden");
    this.loginRequired.classList.add("hidden");
    if (this.user) {
      this.userAvatar.src = `https://cdn.discordapp.com/avatars/${this.user.id}/${this.user.avatar}.png?size=64`;
      this.userName.textContent = `${this.user.username}#${this.user.discriminator || "0"}`;
      if (this.userDropdownName) {
        this.userDropdownName.textContent = this.user.username;
      }
    }
    // Show navigation only after login
    if (this.navBar) this.navBar.classList.remove("hidden");
  }
  showLoginRequired() {
    console.log("=== SHOWING LOGIN REQUIRED ===");
    this.loginRequired.classList.remove("hidden");
    this.navBar.classList.add("hidden");
    this.serverSelector.classList.add("hidden");
    this.userSection.classList.add("hidden");
    this.authSection.classList.remove("hidden");
    // Maintain the landing page background for aesthetic
    this.showPage("home");
    this.hideAppLoader();
  }
  showDashboard() {
    console.log("=== SHOWING DASHBOARD ===");
    this.loginRequired.classList.add("hidden");
    // If we have a guildId, go to player. Otherwise, go to servers selection.
    if (this.guildId) {
      this.showPage("player");
    } else {
      this.showPage("servers");
    }
    this.hideAppLoader();
  }
  hideAppLoader() {
    const loader = document.getElementById("appLoader");
    if (loader) {
      loader.classList.add("hidden");
      // Remove from DOM after transition to free memory
      setTimeout(() => loader.remove(), 600);
    }
  }
  showPage(pageName) {
    console.log("=== SHOWING PAGE:", pageName, "===");
    this.currentPage = pageName;
    // Hide all "pages"
    // RBAC Check for restricted pages
    if ((pageName === "settings" || pageName === "emojis") && this.guildId) {
      if (!this.isGuildOwner(this.guildId)) {
        console.warn("Access denied: User is not the owner or bot developer", this.guildId);
        this.showToast("🔒 Restricted: Only the Server Owner or Bot Developer can access this page.", "error");
        // Redirect to a safe page (player)
        pageName = "player";
        this.currentPage = "player";
      }
    }
    Object.values(this.pages).forEach((page) => {
      if (page) page.classList.add("hidden");
    });
    // Special handling for login items
    this.loginRequired?.classList.add("hidden");
    // Show only the requested page
    if (this.pages[pageName]) {
      this.pages[pageName].classList.remove("hidden");
    }
    // Nav visibility rule:
    // ONLY show nav if the user is logged in AND a server is selected
    if (this.user && this.guildId) {
      this.navBar.classList.remove("hidden");
      this.connectionStatus.classList.remove("hidden");
    } else {
      this.navBar.classList.add("hidden");
      this.connectionStatus.classList.add("hidden");
    }
    // Highlight active nav tab
    document.querySelectorAll(".nav-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.page === pageName);
    });
    // Load data for specific pages
    if (pageName === "home") {
      this.loadHomePageStats();
    } else if (pageName === "playlists" && this.guildId) {
      this.loadPlaylists();
    } else if (pageName === "settings" && this.guildId) {
      this.loadSettings();
    } else if (pageName === "stats" && this.guildId) {
      this.loadStats();
    } else if (pageName === "emojis" && this.guildId) {
      this.loadServerEmojis();
      this.loadEmojiMappings();
    } else if (pageName === "servers") {
      this.loadUserServers();
    }
    // Redirect if guild is required but missing
    const pagesRequiringGuild = ["player", "queue", "playlists", "settings", "stats", "emojis", "radio"];
    if (pagesRequiringGuild.includes(pageName) && !this.guildId) {
      console.log("Guild not selected, redirecting to server selector");
      this.showPage("servers");
    }
  }
  // ============ SHARED PLAYLIST LINKS ============
  // Logged-in users only:
  // then auto-open the playlist (no random guild auto-selection).
  async openSharedPlaylist(playlistId) {
    try {
      if (!playlistId) {
        this.pendingPlaylistId = null;
        this.showDashboard();
        return;
      }
      if (!this.guildId) {
        // User hasn't selected a server yet. Ensure we're on the Servers page.
        this.showPage("servers");
        return;
      }
      // Use the details endpoint which supports access checks server-side.
      const resp = await fetch(
        `/api/playlists/${encodeURIComponent(playlistId)}/details`,
        {
          headers: { "X-API-Key": this.apiKey },
        },
      );
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        alert(err.error || "Failed to open shared playlist.");
        this.pendingPlaylistId = null;
        // Keep the user in the dashboard; if they have a guild selected, go to playlists list
        // otherwise go to servers.
        if (this.guildId) this.showPage("playlists");
        else this.showPage("servers");
        return;
      }
      this.currentPlaylist = await resp.json();
      this.pendingPlaylistId = null;
      // Clear the shared playlist URL param so refresh doesn't re-open it
      try {
        const url = new URL(window.location.href);
        url.searchParams.delete("playlist");
        window.history.replaceState({}, document.title, url.toString());
      } catch (e) {
        console.warn("Failed to clear ?playlist param:", e);
      }
      // Navigate to playlists page + show details view
      this.showPage("playlists");
      this.showPlaylistDetails();
    } catch (e) {
      console.error("Failed to open shared playlist:", e);
      alert("Failed to open shared playlist.");
      this.pendingPlaylistId = null;
      this.showDashboard();
    }
  }
  async loadUserServers() {
    try {
      console.log("Loading user servers...");
      // Parse cookies for auth
      const cookies = document.cookie.split(";").reduce((acc, cookie) => {
        const [name, value] = cookie.trim().split("=");
        if (name && value) acc[name] = decodeURIComponent(value);
        return acc;
      }, {});
      const response = await fetch("/api/user/guilds", {
        headers: {
          Authorization: `Bearer ${cookies.auth_token || ""}`,
        },
      });
      console.log("Response status:", response.status);
      if (!response.ok) {
        // If API fails, just show empty server list
        console.log("Failed to load servers, showing empty state");
        this.serverList.innerHTML =
          "<p>No managed servers found. Make sure the bot is in your server and you have Manage Server permission.</p>";
        // IMPORTANT:
        // Server selector is now a first-class page ("servers") and should only be shown via showPage("servers").
        if (this.currentPage === "servers") {
          this.serverSelector.classList.remove("hidden");
        }
        return;
      }
      const data = await response.json();
      this.servers = Array.isArray(data) ? data : [];
      console.log("Servers loaded:", this.servers.length);
      if (this.servers.length === 0) {
        this.serverList.innerHTML =
          "<p>No managed servers found. Make sure the bot is in your server and you have Manage Server permission.</p>";
      } else {
        // Fetch live player statuses for these guilds and then render
        await this.loadServerStatuses();
        this.renderServerList();
      }
      // IMPORTANT:
      // Server selector is now a first-class page ("servers") and should only be shown via showPage("servers").
      // Prevent unexpected jumps if user is just landing
      if (this.currentPage === "servers" && this.currentPage !== "landing") {
        this.serverSelector.classList.remove("hidden");
      }
    } catch (error) {
      console.error("Failed to load servers:", error);
      // Still show server selector but with error message
      this.serverList.innerHTML =
        "<p>Failed to load servers. Click login to refresh.</p>";
      // IMPORTANT:
      // Server selector is now a first-class page ("servers") and should only be shown via showPage("servers").
      // Prevent unexpected jumps if user is just landing
      if (this.currentPage === "servers" && this.currentPage !== "landing") {
        this.serverSelector.classList.remove("hidden");
      }
    }
  }
  renderServerList() {
    console.log("=== RENDER SERVER LIST ===");
    console.log("Servers count:", this.servers.length);
    console.log("Server list element:", this.serverList);
    if (this.servers.length === 0) {
      console.log("No servers to render");
      this.serverList.innerHTML =
        "<p>No managed servers found. Make sure the bot is in your server and you have Manage Server permission.</p>";
      return;
    }
    this.serverList.innerHTML = this.servers
      .map((server) => {
        const status = this.serverStatusMap?.get(server.id) || null;

        // Determine role badge (Admin vs Member)
        const canManage = server.canManage !== false; // Default true if undefined (legacy)
        const roleBadge = canManage
          ? `<span class="role-badge admin">Admin</span>`
          : `<span class="role-badge member">Member</span>`;

        const badge = (() => {
          if (!status || status.active === false) {
            return `<span class="server-badge disconnected">Offline</span>`;
          }
          if (status.playing && !status.paused) {
            return `<span class="server-badge playing">Playing</span>`;
          }
          if (status.paused) {
            return `<span class="server-badge paused">Paused</span>`;
          }
          return `<span class="server-badge connected">Connected</span>`;
        })();
        const voice = status?.voiceChannel?.name
          ? `<span class="server-sub">${this.escapeHtml(status.voiceChannel.name)}</span>`
          : `<span class="server-sub">Not in voice</span>`;
        const queue =
          typeof status?.queueSize === "number"
            ? `<span class="server-sub">Queue: ${status.queueSize}</span>`
            : "";
        const selectedClass = this.guildId === server.id ? " selected" : "";
        return `
            <div class="server-item${selectedClass}" data-guild-id="${server.id}">
                ${server.icon
            ? `<img src="https://cdn.discordapp.com/icons/${server.id}/${server.icon}.png?size=64" alt="${server.name}" class="server-icon">`
            : `<div class="server-icon-placeholder">${server.name.charAt(0)}</div>`
          }
                <div class="server-meta">
                  <div class="server-meta-top">
                    <span class="server-name">${this.escapeHtml(server.name)}</span>
                    ${roleBadge}
                    ${badge}
                  </div>
                  <div class="server-meta-bottom">
                    ${voice}
                    ${queue}
                  </div>
                  <div class="server-card-actions">
                    <button class="action-btn small" onclick="event.stopPropagation(); dashboard.selectServerAndGo('${server.id}', 'player')" title="Open Player">🎵 Player</button>
                    <button class="action-btn small" onclick="event.stopPropagation(); dashboard.selectServerAndGo('${server.id}', 'queue')" title="Open Queue">📋 Queue</button>
                    <button class="action-btn small" onclick="event.stopPropagation(); dashboard.selectServerAndGo('${server.id}', 'playlists')" title="Open Playlists">📝 Playlists</button>
                  </div>
                </div>
            </div>
        `;
      })
      .join("");
    console.log("Rendered HTML:", this.serverList.innerHTML);
    const items = this.serverList.querySelectorAll(".server-item");
    console.log("Server items found:", items.length);
    // Use event delegation on the server list container
    this.serverList.onclick = (e) => {
      const item = e.target.closest(".server-item");
      if (item) {
        const guildId = item.dataset.guildId;
        console.log("=== SERVER CLICKED (delegation) ===", guildId);
        this.selectServer(guildId);
      }
    };
    // Also attach direct click handlers as backup
    items.forEach((item, index) => {
      console.log(
        `Attaching click to server item ${index}:`,
        item.dataset.guildId,
      );
      item.style.cursor = "pointer";
      item.addEventListener("click", (e) => {
        e.stopPropagation();
        console.log("=== SERVER CLICKED (direct) ===", item.dataset.guildId);
        this.selectServer(item.dataset.guildId);
      });
    });
    console.log("Click handlers attached successfully");
  }
  async selectServer(guildId, options = {}) {
    console.log("=== SELECT SERVER CALLED ===", guildId);
    if (!guildId) {
      console.error("ERROR: guildId is undefined or empty!");
      alert("Error: Could not select server. Please try again.");
      return;
    }
    this.guildId = guildId;
    console.log("guildId set to:", this.guildId);
    // Highlight selection on Servers page immediately (if we're on it)
    if (this.currentPage === "servers") {
      this.renderServerList();
    }
    // Put UI into a loading state (prevents "stuck player" and "empty queue" flashes)
    this.setHydratingState(true, "Loading server state...");
    // IMPORTANT: Close previous Socket.IO connection (prevents cross-guild state leakage)
    if (this.socket) {
      try {
        this.socket.removeAllListeners();
        this.socket.disconnect();
      } catch (e) {
        console.warn("Error closing previous Socket.IO connection:", e);
      } finally {
        this.socket = null;
      }
    }
    this.stopPolling();
    this.stopPollingWatchdog();
    // Stop any local position tick from the previous guild
    this.stopPositionUpdates();
    // Reset state to prevent leakage between servers
    this.playerState = null;
    this.queue = [];
    this.updateUI();
    this.updateQueueUI();
    // After choosing a guild, switch to the main dashboard pages
    // Visibility is controlled by showPage() now (server selector is a first-class page).
    this.loginRequired.classList.add("hidden");
    const server = this.servers.find((s) => s.id === guildId);
    if (server) {
      this.guildName.textContent = server.name;
      console.log("Selected server:", server.name);

      // Update RBAC permissions for the new server
      this.updateSidebarAccess();
    } else {
      this.guildName.textContent = "Unknown Server";
      console.warn("Server not found in servers list");
    }
    // If user arrived via a shared playlist link (?playlist=...), auto-open it after server selection.
    if (this.pendingPlaylistId) {
      await this.openSharedPlaylist(this.pendingPlaylistId);
      return;
    }
    // Initial hydration: always pull fresh snapshots first
    await this.hydrateGuildState("selectServer");
    console.log("=== LOADING SERVER EMOJIS ===");
    await this.loadServerEmojis();
    console.log("=== LOADING EMOJI MAPPINGS ===");
    await this.loadEmojiMappings();
    // Apply emoji mappings to dashboard UI immediately
    this.applyDashboardEmojis();
    console.log("=== CONNECTING SOCKET.IO ===");
    await this.connectSocketIo();
    this.updateConnectionStatus(Boolean(this.socket?.connected));
    // Only navigate to Player automatically when NOT called as part of a chained navigation
    // (e.g., selectServerAndGo -> Queue/Playlists). This prevents page flicker/override.
    if (!options || options.navigateToPlayer !== false) {
      console.log("=== SHOWING PLAYER PAGE ===");
      this.showPage("player");
    }
  }
  // Helper to avoid race conditions when quickly switching guilds then navigating to a page.
  // Example: server card quick actions (Player/Queue/Playlists).
  async selectServerAndGo(guildId, pageName = "player") {
    // If already on this guild, just navigate
    if (this.guildId === guildId) {
      this.showPage(pageName);
      return;
    }
    // Serialize switches: keep only the latest switch request
    const run = async () => {
      await this.selectServer(guildId, { navigateToPlayer: false });
      this.showPage(pageName);
    };
    // If a previous switch is in flight, replace it with the new one
    this.serverSwitchInFlight = run();
    try {
      await this.serverSwitchInFlight;
    } finally {
      // Clear if we're still pointing at the same promise
      if (this.serverSwitchInFlight) this.serverSwitchInFlight = null;
    }
  }
  // ===== Servers page: status =====
  async loadServerStatuses() {
    try {
      const response = await fetch("/api/players", {
        headers: { "X-API-Key": this.apiKey },
      });
      if (!response.ok) {
        return;
      }
      const data = await response.json().catch(() => ({}));
      const players = Array.isArray(data.players) ? data.players : [];
      // Normalize into a map keyed by guildId
      this.serverStatusMap = new Map();
      for (const p of players) {
        if (!p?.guildId) continue;
        this.serverStatusMap.set(p.guildId, {
          active: true,
          playing: Boolean(p.isPlaying),
          paused: Boolean(p.isPaused),
          queueSize: typeof p.queueSize === "number" ? p.queueSize : 0,
          voiceChannel: p.voiceChannel || null,
        });
      }
      // Ensure every managed server has an entry (inactive if not present)
      for (const s of this.servers || []) {
        if (!this.serverStatusMap.has(s.id)) {
          this.serverStatusMap.set(s.id, { active: false });
        }
      }
    } catch (e) {
      console.warn("Failed to load server statuses:", e);
    }
  }
  startServersAutoRefresh() {
    if (this.serverStatusInterval) return;
    this.serverStatusInterval = setInterval(async () => {
      if (this.currentPage !== "servers") return;
      await this.loadServerStatuses();
      this.renderServerList();
    }, 7000);
  }
  stopServersAutoRefresh() {
    if (this.serverStatusInterval) {
      clearInterval(this.serverStatusInterval);
      this.serverStatusInterval = null;
    }
  }
  showServerSelector() {
    console.log("=== SHOWING SERVER SELECTOR ===");
    // Close Socket.IO and stop ticking/polling so nothing keeps updating from the previous guild
    if (this.socket) {
      try {
        this.socket.removeAllListeners();
        this.socket.disconnect();
      } catch (e) {
        console.warn("Error closing Socket.IO while returning to servers:", e);
      } finally {
        this.socket = null;
      }
    }
    this.stopPolling();
    this.stopPollingWatchdog();
    this.stopPositionUpdates();
    // Clear guild selection and UI state
    this.guildId = null;
    this.playerState = null;
    this.queue = [];
    this.updateUI();
    this.updateQueueUI();
    // Route Servers navigation through the unified page router
    this.showPage("servers");
    return;
  }
  attachEventListeners() {
    this.loginBtn?.addEventListener("click", () => {
      window.location.href = "/auth/discord";
    });
    this.loginRequiredBtn?.addEventListener("click", () => {
      window.location.href = "/auth/discord";
    });
    this.logoutBtn?.addEventListener("click", () => {
      localStorage.removeItem("dashboard_user");
      localStorage.removeItem("dashboard_auth");
      window.location.href = "/auth/logout";
    });
    document.querySelectorAll(".nav-btn").forEach((btn) => {
      btn.addEventListener("click", () => this.showPage(btn.dataset.page));
    });
    this.playPauseBtn.addEventListener("click", () => this.togglePlayPause());
    this.previousBtn.addEventListener("click", () => this.previous());
    this.nextBtn.addEventListener("click", () => this.skip());
    this.shuffleBtn.addEventListener("click", () => this.shuffle());
    this.repeatBtn.addEventListener("click", () => this.toggleRepeat());
    this.volumeSlider.addEventListener("input", (e) =>
      this.setVolume(e.target.value),
    );
    // Progress interactions:
    // - Click-to-seek (instant UI + server seek)
    // - Drag scrubbing (instant UI while dragging + debounced server seeks)
    this.progressBar.addEventListener("click", (e) => this.seek(e));
    this.progressBar.addEventListener("mousedown", (e) => this.startScrub(e));
    this.progressBar.addEventListener("touchstart", (e) => this.startScrub(e), {
      passive: false,
    });
    // Default volume slider in settings
    document
      .getElementById("defaultVolumeSlider")
      ?.addEventListener("input", (e) => {
        const value = e.target.value;
        document.getElementById("defaultVolumeValue").textContent = value + "%";
      });
    document
      .getElementById("shuffleQueueBtn")
      ?.addEventListener("click", () => this.shuffleQueue());
    document
      .getElementById("clearQueueBtn")
      ?.addEventListener("click", () => this.clearQueue());
    // Playlist event listeners
    document
      .getElementById("createPlaylistBtn")
      ?.addEventListener("click", () => this.openCreatePlaylistModal());
    // Emoji management event listeners
    document
      .getElementById("syncServerBtn")
      ?.addEventListener("click", () => this.syncServerEmojis());
    document
      .getElementById("autoMatchBtn")
      ?.addEventListener("click", () => this.autoMatchEmojis());
    document
      .getElementById("syncPreviewBtn")
      ?.addEventListener("click", () => this.showSyncPreview());
    document
      .getElementById("resetEmojisBtn")
      ?.addEventListener("click", () => this.resetEmojis());
    document
      .getElementById("addMappingBtn")
      ?.addEventListener("click", () => this.addEmojiMapping());
    document
      .getElementById("emojiCategoryFilter")
      ?.addEventListener("change", (e) => {
        this.renderEmojiMappings(e.target.value);
      });
    document.getElementById("mappingSearch")?.addEventListener("input", (e) => {
      const category =
        document.getElementById("emojiCategoryFilter")?.value || "all";
      this.renderEmojiMappings(category);
    });
    // Server emoji filters
    document.querySelectorAll(".filter-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        document
          .querySelectorAll(".filter-btn")
          .forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        const search = document.getElementById("emojiSearch")?.value || "";
        this.renderServerEmojis(btn.dataset.filter, search);
      });
    });
    document.getElementById("emojiSearch")?.addEventListener("input", (e) => {
      const activeFilter =
        document.querySelector(".filter-btn.active")?.dataset.filter || "all";
      this.renderServerEmojis(activeFilter, e.target.value);
    });
    // Select from server button
    document
      .getElementById("selectFromServerBtn")
      ?.addEventListener("click", () => this.openEmojiPicker());
    // Settings event listeners
    document
      .getElementById("saveSettingsBtn")
      ?.addEventListener("click", () => this.saveSettings());
    document.querySelectorAll(".settings-tab").forEach((btn) => {
      btn.addEventListener("click", () => {
        document
          .querySelectorAll(".settings-tab")
          .forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        document
          .querySelectorAll(".settings-tab-content")
          .forEach((content) => content.classList.add("hidden"));
        document
          .getElementById(`settings-${btn.dataset.tab}`)
          ?.classList.remove("hidden");
      });
    });
    this.setupKeyboardShortcuts();
  }

  setupKeyboardShortcuts() {
    document.addEventListener("keydown", (e) => {
      // Ignore if typing in input/textarea
      if (
        e.target.tagName === "INPUT" ||
        e.target.tagName === "TEXTAREA" ||
        e.target.isContentEditable
      ) {
        return;
      }

      switch (e.key.toLowerCase()) {
        case " ":
          e.preventDefault();
          this.togglePlayPause();
          break;
        case "arrowright":
        case "n":
          this.skip();
          break;
        case "arrowleft":
        case "p":
          this.previous();
          break;
        case "m":
          this.toggleMute();
          break;
        case "s":
          this.shuffle();
          break;
        case "r":
          this.toggleRepeat();
          break;
      }
    });
  }

  toggleMute() {
    if (!this.playerState) return;
    // Use slider value as source of truth
    const current = parseInt(this.volumeSlider.value, 10);

    if (current > 0) {
      this.preMuteVolume = current;
      this.setVolume(0);
      this.volumeSlider.value = 0;
      const valDisplay = document.getElementById("defaultVolumeValue");
      if (valDisplay) valDisplay.textContent = "0%";
    } else {
      const restore = this.preMuteVolume || 50;
      this.setVolume(restore);
      this.volumeSlider.value = restore;
      const valDisplay = document.getElementById("defaultVolumeValue");
      if (valDisplay) valDisplay.textContent = restore + "%";
    }
  }
  async connectSocketIo() {
    // Requires Socket.IO client to be available globally as `io`
    if (typeof window.io !== "function") {
      console.error(
        "Socket.IO client not found. Ensure /socket.io/socket.io.js is loaded.",
      );
      return;
    }
    // Fetch (or reuse) a socket token from the server. This endpoint must exist server-side.
    if (!this.socketToken) {
      try {
        const res = await fetch("/auth/socket-token", {
          credentials: "same-origin",
        });
        if (res.ok) {
          const data = await res.json().catch(() => ({}));
          this.socketToken = data.token || null;
        } else {
          console.warn("Failed to fetch socket token:", res.status);
        }
      } catch (e) {
        console.warn("Error fetching socket token:", e);
      }
    }
    // Close any existing socket (defensive)
    if (this.socket) {
      try {
        this.socket.removeAllListeners();
        this.socket.disconnect();
      } catch (e) {
        console.warn("Error closing existing Socket.IO before reconnect:", e);
      } finally {
        this.socket = null;
      }
    }
    const intendedGuildId = this.guildId;
    this.socket = window.io({
      path: "/socket.io",
      transports: ["websocket"],
      auth: {
        token: this.socketToken,
      },
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 800,
      reconnectionDelayMax: 5000,
    });
    // Connection lifecycle
    this.socket.on("connect", async () => {
      console.log("Socket.IO connected:", this.socket.id);
      if (this.guildId !== intendedGuildId) return;
      // Join the guild room and ask for a fresh snapshot
      this.socket.emit("guild:join", this.guildId);
      // Start watchdog/poll fallback
      this.lastRealtimeAt = Date.now();
      this.startPollingWatchdog();
      // As a safety net, pull HTTP snapshot as well (handles any missed state)
      Promise.allSettled([this.loadPlayerState(), this.loadQueue()]);
    });
    this.socket.on("disconnect", (reason) => {
      console.log("Socket.IO disconnected:", reason);
      this.stopPositionUpdates();
      this.updateConnectionStatus(false);
      // Start polling quickly on disconnect
      this.startPolling();
    });
    this.socket.on("connect_error", (err) => {
      console.warn("Socket.IO connect_error:", err?.message || err);
      this.updateConnectionStatus(false);
      // Token might be expired; clear so we refetch next time
      if (
        String(err?.message || "")
          .toLowerCase()
          .includes("authentication")
      ) {
        this.socketToken = null;
      }
      this.startPolling();
    });
    // Core realtime events
    this.socket.on("player:state", (payload) => {
      if (this.guildId !== intendedGuildId) return;
      this.lastRealtimeAt = Date.now();
      // Normalize to the existing UI expectations where possible
      // payload: { isPlaying, isPaused, volume, position, currentTrack, repeat, shuffle, queue }
      const normalized = {
        isPlaying: Boolean(payload?.isPlaying),
        isPaused: Boolean(payload?.isPaused),
        volume: payload?.volume,
        position: payload?.position ?? 0,
        currentTrack: payload?.currentTrack || null,
        repeat: payload?.repeat,
        shuffle: payload?.shuffle,
      };
      this.playerState = normalized;
      // Snapshot-based timekeeping (prevents stuck 0:00 when realtime pauses)
      this.positionAtSnapshotMs = Number(normalized.position || 0);
      this.snapshotReceivedAtMs = Date.now();
      // Queue is delivered with the snapshot
      this.queue = Array.isArray(payload?.queue) ? payload.queue : [];
      this.updateQueueUI();
      // Start local ticking using snapshot base
      this.startPositionUpdates();
      this.updateUI();
      // If we were hydrating, consider it done once we receive the authoritative socket snapshot
      this.setHydratingState(false);

      // If polling is active, stop it because realtime is healthy again
      this.stopPolling();
    });
    this.socket.on("player:update", (evt) => {
      if (this.guildId !== intendedGuildId) return;
      this.lastRealtimeAt = Date.now();
      // Some updates may not include state; pull snapshot for correctness.
      Promise.allSettled([this.loadPlayerState(), this.loadQueue()]);
    });
    this.socket.on("queue:update", (evt) => {
      if (this.guildId !== intendedGuildId) return;
      this.lastRealtimeAt = Date.now();
      // queue:update from backend contains { queue } on actions; trust if present
      if (Array.isArray(evt?.queue)) {
        this.queue = evt.queue;
        this.updateQueueUI();
      } else {
        // fallback to HTTP to avoid drift
        this.loadQueue();
      }
    });
    this.socket.on("error", (evt) => {
      console.warn("Socket.IO server error event:", evt);
    });

    // ============ PERMISSION SYSTEM WEBSOCKET HANDLERS ============
    this.socket.on("permission_request", (data) => {
      if (this.guildId !== intendedGuildId) return;
      // Show permission request popup only if current user is the session owner
      if (this.user?.id === data.ownerId) {
        this.showPermissionRequest(data);
      }
    });

    this.socket.on("permission_response", (data) => {
      if (this.guildId !== intendedGuildId) return;
      // Show notification if current user is the requester
      if (this.user?.id === data.requesterId) {
        this.handlePermissionResponse(data);
      }
    });

    this.socket.on("session_owner_changed", (data) => {
      if (this.guildId !== intendedGuildId) return;
      this.currentSession = data;
      this.updateSessionOwnerUI();
    });

    // We consider "connected" once socket connects; until then show disconnected
    this.updateConnectionStatus(false);
  }
  startPollingWatchdog() {
    if (this.pollWatchdogInterval) return;
    this.pollWatchdogInterval = setInterval(() => {
      // Only watchdog when a guild is selected
      if (!this.guildId) return;
      const now = Date.now();
      const age = now - (this.lastRealtimeAt || 0);
      // If no realtime updates for a while, fallback to polling.
      if (age > 15000) {
        this.startPolling();
      } else {
        // realtime seems healthy; stop polling if it was started
        this.stopPolling();
      }
    }, 3000);
  }
  stopPollingWatchdog() {
    if (this.pollWatchdogInterval) {
      clearInterval(this.pollWatchdogInterval);
      this.pollWatchdogInterval = null;
    }
  }
  startPolling() {
    if (this.pollInterval) return;
    this.pollInterval = setInterval(() => {
      if (!this.guildId) return;
      Promise.allSettled([this.loadPlayerState(), this.loadQueue()]);
    }, 4000);
  }
  stopPolling() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }
  async loadPlayerState() {
    console.log("=== LOAD PLAYER STATE ===");
    console.log("Guild ID:", this.guildId);
    console.log("API Key:", this.apiKey);
    try {
      const response = await fetch(`/api/player/${this.guildId}`, {
        headers: { "X-API-Key": this.apiKey },
      });
      console.log("Player state response status:", response.status);
      console.log("Player state response ok:", response.ok);
      if (response.ok) {
        this.playerState = await response.json();
        console.log("Player state loaded:", this.playerState);
        // Snapshot-based timekeeping baseline for local progress calculation
        this.positionAtSnapshotMs = Number(this.playerState?.position || 0);
        this.snapshotReceivedAtMs = Date.now();
        this.updateUI();
      } else {
        const error = await response.json();
        console.error("Error loading player state:", error);
      }
    } catch (error) {
      console.error("Error loading player state:", error);
    }
  }
  async loadQueue() {
    console.log("=== LOAD QUEUE ===");
    console.log("Guild ID:", this.guildId);
    try {
      const response = await fetch(`/api/player/${this.guildId}/queue`, {
        headers: { "X-API-Key": this.apiKey },
      });
      console.log("Queue response status:", response.status);
      console.log("Queue response ok:", response.ok);
      if (response.ok) {
        const data = await response.json();
        console.log("Queue data:", data);
        this.queue = data.queue || [];
        this.updateQueueUI();
      } else {
        const error = await response.json();
        console.error("Error loading queue:", error);
      }
    } catch (error) {
      console.error("Error loading queue:", error);
    }
  }
  updateUI() {
    if (!this.playerState) return;
    const {
      currentTrack,
      isPlaying,
      isPaused,
      volume,
      repeatMode,
      position,
      guildName,
    } = this.playerState;
    if (currentTrack) {
      this.trackTitle.textContent = currentTrack.title;
      this.trackArtist.textContent = currentTrack.author;
      if (currentTrack.artworkUrl) {
        this.albumArt.src = currentTrack.artworkUrl;
        this.albumArt.classList.remove("hidden");
        this.noArtwork.classList.add("hidden");
      } else {
        this.albumArt.classList.add("hidden");
        this.noArtwork.classList.remove("hidden");
      }
    } else {
      this.trackTitle.textContent = "No track playing";
      this.trackArtist.textContent = "Unknown Artist";
      this.albumArt.classList.add("hidden");
      this.noArtwork.classList.remove("hidden");
    }
    this.guildName.textContent = guildName || "";
    // Use mapped emojis for controls (render custom emojis as <img> when available)
    this.playPauseBtn.innerHTML =
      isPlaying && !isPaused
        ? this.getEmojiHtml("pause")
        : this.getEmojiHtml("play");
    // Repeat button active state + icon based on mode
    this.repeatBtn.classList.toggle(
      "active",
      repeatMode !== "off" && repeatMode !== "none",
    );
    const repeatKey = repeatMode === "track" ? "loop_track" : "loop";
    this.repeatBtn.innerHTML = this.getEmojiHtml(repeatKey);
    // Shuffle button icon + active state
    this.shuffleBtn.classList.toggle("active", this.playerState.shuffle);
    this.shuffleBtn.innerHTML = this.getEmojiHtml("shuffle");
    // Volume
    this.volumeSlider.value = volume;
    this.volumeValue.textContent = `${volume}%`;
    const volKey = volume > 50 ? "volume_up" : volume > 0 ? "volume_down" : "volume_mute";
    this.volumeIcon.innerHTML = this.getEmojiHtml(volKey);
    // Update status bar
    if (this.connectionStatus && this.statusText) {
      // Robust connection check: explicitly connected OR has voice channel OR has active track/queue
      const isConnected =
        this.playerState.isConnected ||
        !!this.playerState.voiceChannel?.id ||
        (Array.isArray(this.queue) && this.queue.length > 0) ||
        !!currentTrack;

      if (isConnected) {
        this.connectionStatus.classList.remove("error", "disconnected");
        this.connectionStatus.classList.add("success", "connected");

        // Detailed status text
        if (isPlaying && !isPaused) {
          this.statusText.textContent = `🟢 Playing: ${currentTrack?.title || "Music"}`;
        } else if (isPaused) {
          this.statusText.textContent = "🟠 Paused";
        } else {
          this.statusText.textContent = "🟢 Connected";
        }
      } else {
        this.connectionStatus.classList.remove("success", "connected");
        this.connectionStatus.classList.add("error", "disconnected");
        this.statusText.textContent = "🔴 Disconnected";
      }
    }
    this.updateProgress();
    this.updateSleepTimerUI();
  }
  updateSleepTimerUI() {
    if (!this.sleepTimerStatus) return;
    if (this.playerState?.sleepEnd) {
      const remaining = Math.max(0, Math.floor((this.playerState.sleepEnd - Date.now()) / 1000));
      if (remaining > 0) {
        const mins = Math.floor(remaining / 60);
        const secs = remaining % 60;
        this.sleepTimerStatus.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
        this.sleepTimerBtn.classList.add("active");
        if (!this.sleepTimerInterval) {
          this.sleepTimerInterval = setInterval(() => this.updateSleepTimerUI(), 1000);
        }
      } else {
        this.sleepTimerStatus.textContent = "Off";
        this.sleepTimerBtn.classList.remove("active");
        if (this.sleepTimerInterval) {
          clearInterval(this.sleepTimerInterval);
          this.sleepTimerInterval = null;
        }
      }
    } else {
      this.sleepTimerStatus.textContent = "Off";
      this.sleepTimerBtn.classList.remove("active");
      if (this.sleepTimerInterval) {
        clearInterval(this.sleepTimerInterval);
        this.sleepTimerInterval = null;
      }
    }
  }
  toggleSleepMenu() {
    this.sleepTimerMenu.classList.toggle("hidden");
  }
  async setSleepTimer(minutes) {
    this.sleepTimerMenu.classList.add("hidden");
    const res = await this.apiCall("POST", `/api/player/${this.guildId}/sleep`, { minutes });
    if (res && res.expireAt) {
      this.playerState.sleepEnd = res.expireAt;
      this.updateSleepTimerUI();
    }
  }
  async showLyrics() {
    this.lyricsModal.classList.remove("hidden");
    this.lyricsTitle.textContent = this.playerState?.currentTrack?.title || "Fetching lyrics...";
    this.lyricsContent.textContent = "Loading...";
    try {
      const response = await fetch(`/api/player/${this.guildId}/lyrics`, {
        headers: { "X-API-Key": this.apiKey }
      });
      const data = await response.json();
      if (data.error) {
        this.lyricsContent.textContent = `❌ ${data.error}`;
      } else {
        this.lyricsTitle.textContent = `${data.title} - ${data.artist}`;
        this.lyricsContent.textContent = data.text || data.lyrics || "No lyrics content found.";
      }
    } catch (err) {
      this.lyricsContent.textContent = "❌ Failed to load lyrics.";
    }
  }
  async translateLyrics() {
    if (!this.lyricsContent.textContent || this.lyricsContent.textContent === "Loading...") return;

    const targetLang = this.lyricsLangSelect?.value || "en";
    const originalText = this.lyricsContent.textContent;

    this.translateLyricsBtn.disabled = true;
    this.translateLyricsBtn.textContent = "⌛ Translating...";

    try {
      const response = await fetch(`/api/player/${this.guildId}/lyrics/translate?text=${encodeURIComponent(originalText)}&to=${targetLang}`, {
        headers: { "X-API-Key": this.apiKey }
      });
      const data = await response.json();

      if (data.translated) {
        // We could swap the content or append it. Let's swap for now but maybe keep original in a hidden area?
        // Benefit of swapping: simpler UI.
        this.lyricsContent.textContent = data.translated;
        this.showToast(`✅ Translated to ${this.lyricsLangSelect.options[this.lyricsLangSelect.selectedIndex].text}`);
      } else if (data.error) {
        this.showToast(`❌ Translation error: ${data.error}`, "error");
      }
    } catch (err) {
      console.error("Translation failed:", err);
      this.showToast("❌ Failed to translate lyrics.", "error");
    } finally {
      this.translateLyricsBtn.disabled = false;
      this.translateLyricsBtn.textContent = "🌐 Translate";
    }
  }
  closeModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.classList.add("hidden");
  }
  updateProgress() {
    // Always render based on the real DOM element (#progressFill) and
    // the latest playerState values. This prevents “stuck at 0:00” UI
    // when state_update and the local ticker drift.
    const currentTrack = this.playerState?.currentTrack;
    if (!currentTrack) {
      this.progressFill.style.width = "0%";
      this.currentTime.textContent = "0:00";
      this.totalTime.textContent = "0:00";
      return;
    }
    const duration = Number(currentTrack.duration || 0);
    const isStream = Boolean(currentTrack.isStream);
    let position = Number(this.playerState?.position || 0);
    if (!isStream && duration > 0) {
      // Clamp position to sane range
      position = Math.max(0, Math.min(position, duration));
      const progress = (position / duration) * 100;
      this.progressFill.style.width = `${progress}%`;
      this.currentTime.textContent = this.formatTime(position);
      this.totalTime.textContent = this.formatTime(duration);
      return;
    }
    // Streams / unknown duration
    this.progressFill.style.width = "100%";
    this.currentTime.textContent = this.formatTime(position);
    this.totalTime.textContent = "LIVE";
  }
  updateQueueUI() {
    this.queueCount.textContent = this.queue.length;
    if (this.queue.length === 0) {
      this.queueList.innerHTML =
        '<p class="empty-queue">No tracks in queue</p>';
      return;
    }
    this.queueList.innerHTML = this.queue
      .map(
        (track, index) => `
            <div class="queue-item" data-position="${index + 1}">
                ${track.artworkUrl
            ? `<img src="${track.artworkUrl}" alt="${track.title}" class="queue-item-artwork">`
            : '<div class="queue-item-artwork-placeholder">♪</div>'
          }
                <div class="queue-item-info">
                    <div class="queue-item-title">${this.escapeHtml(track.title)}</div>
                    <div class="queue-item-artist">${this.escapeHtml(track.author || "Unknown")}</div>
                </div>
                <div class="queue-item-duration">${this.formatTime(track.duration)}</div>
                <button class="queue-item-remove" data-index="${index}">❌</button>
            </div>
        `,
      )
      .join("");
    this.queueList.querySelectorAll(".queue-item-remove").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.removeFromQueue(parseInt(btn.dataset.index));
      });
    });
  }
  async removeFromQueue(index) {
    if (!await this.ensurePermission("remove from queue")) return;
    await this.apiCall("DELETE", `/api/queue/${this.guildId}/${index}`);
    await this.loadQueue();
  }
  startPositionUpdates() {
    // Always clear any previous ticking interval first.
    this.stopPositionUpdates();
    // If we don't have a baseline yet, initialize it now.
    if (!this.snapshotReceivedAtMs) {
      this.positionAtSnapshotMs = Number(this.playerState?.position || 0);
      this.snapshotReceivedAtMs = Date.now();
    }
    this.positionUpdateInterval = setInterval(() => {
      // If there is no active track, stop ticking to avoid stale UI.
      if (!this.playerState?.currentTrack) {
        this.stopPositionUpdates();
        return;
      }
      // Streams should not tick.
      if (this.playerState.currentTrack.isStream) {
        this.updateProgress();
        return;
      }
      // Keep snapshot baseline aligned when paused or not playing.
      if (!this.playerState?.isPlaying || this.playerState?.isPaused) {
        // When paused, keep baseline anchored to the current known position.
        this.positionAtSnapshotMs = Number(this.playerState.position || 0);
        this.snapshotReceivedAtMs = Date.now();
        this.updateProgress();
        return;
      }
      // Compute position from snapshot baseline (prevents drift + "stuck at 0:00")
      const now = Date.now();
      const elapsed = Math.max(0, now - (this.snapshotReceivedAtMs || now));
      const base = Number(this.positionAtSnapshotMs || 0);
      let computed = base + elapsed;
      // Clamp at duration.
      const duration = Number(this.playerState.currentTrack.duration || 0);
      if (duration > 0 && computed > duration) computed = duration;
      // Write computed position back so updateProgress uses it consistently.
      this.playerState.position = computed;
      this.updateProgress();
    }, 250);
  }
  stopPositionUpdates() {
    if (this.positionUpdateInterval) {
      clearInterval(this.positionUpdateInterval);
      this.positionUpdateInterval = null;
    }
  }
  async seek(e) {
    if (
      !this.playerState?.currentTrack ||
      this.playerState.currentTrack.isStream
    )
      return;

    // Permission check
    if (!await this.ensurePermission("seek track")) return;

    // If we are actively scrubbing, ignore click events to avoid double seeks.
    if (this.isScrubbing) return;
    // Click-to-seek flash feedback
    try {
      this.progressBar.classList.add("seeking");
      setTimeout(() => {
        try {
          this.progressBar.classList.remove("seeking");
        } catch (_) {
          // ignore
        }
      }, 250);
    } catch (_) {
      // ignore
    }
    const desired = this._computeSeekPositionFromEvent(e);
    if (desired == null) return;
    // Optimistic UI update (prevents lag/stale baseline)
    this._applyOptimisticSeek(desired);
    // Send seek and then resync from server
    try {
      await this.apiCall("POST", `/api/player/${this.guildId}/seek`, {
        position: desired,
      });
      this.loadPlayerState();
    } catch (error) {
      this.loadPlayerState();
    }
  }
  _getClientXFromEvent(e) {
    if (!e) return null;
    // Touch
    if (e.touches && e.touches.length > 0) return e.touches[0].clientX;
    if (e.changedTouches && e.changedTouches.length > 0)
      return e.changedTouches[0].clientX;
    // Mouse
    return typeof e.clientX === "number" ? e.clientX : null;
  }
  _computeSeekPositionFromEvent(e) {
    const clientX = this._getClientXFromEvent(e);
    if (clientX == null) return null;
    const rect = this.progressBar.getBoundingClientRect();
    const x = clientX - rect.left;
    const percent = Math.max(0, Math.min(1, x / rect.width));
    const duration = Number(this.playerState?.currentTrack?.duration || 0);
    if (!duration || duration <= 0) return 0;
    return Math.floor(percent * duration);
  }
  _applyOptimisticSeek(positionMs) {
    const pos = Math.max(0, Number(positionMs || 0));
    if (!this.playerState) this.playerState = {};
    this.playerState.position = pos;
    // Reset baseline so the ticker continues from the seeked position
    this.positionAtSnapshotMs = pos;
    this.snapshotReceivedAtMs = Date.now();
    // Update progress UI immediately
    this.updateProgress();
  }
  startScrub(e) {
    if (
      !this.playerState?.currentTrack ||
      this.playerState.currentTrack.isStream
    ) {
      return;
    }
    // Only left click for mouse
    if (e && e.type === "mousedown" && e.button !== 0) return;
    // Prevent page scrolling on touch while scrubbing
    if (e && e.type === "touchstart") {
      try {
        e.preventDefault();
      } catch (_) { }
    }
    this.isScrubbing = true;
    // Stop time ticker while dragging so it doesn't fight the scrub position
    this.stopPositionUpdates();
    // Bind move/up handlers once
    if (!this._boundScrubMove)
      this._boundScrubMove = (ev) => this.scrubMove(ev);
    if (!this._boundScrubUp) this._boundScrubUp = (ev) => this.endScrub(ev);
    window.addEventListener("mousemove", this._boundScrubMove);
    window.addEventListener("mouseup", this._boundScrubUp);
    window.addEventListener("touchmove", this._boundScrubMove, {
      passive: false,
    });
    window.addEventListener("touchend", this._boundScrubUp);
    // Apply initial position
    const desired = this._computeSeekPositionFromEvent(e);
    if (desired != null) {
      this.scrubDesiredPositionMs = desired;
      this._applyOptimisticSeek(desired);
      this._scheduleScrubSeekSend(true);
    }
  }
  scrubMove(e) {
    if (!this.isScrubbing) return;
    // Prevent scrolling while scrubbing on touch
    if (e && e.type === "touchmove") {
      try {
        e.preventDefault();
      } catch (_) { }
    }
    const desired = this._computeSeekPositionFromEvent(e);
    if (desired == null) return;
    this.scrubDesiredPositionMs = desired;
    this._applyOptimisticSeek(desired);
    // Debounced seek sends
    this._scheduleScrubSeekSend(false);
  }
  endScrub(e) {
    if (!this.isScrubbing) return;
    this.isScrubbing = false;
    window.removeEventListener("mousemove", this._boundScrubMove);
    window.removeEventListener("mouseup", this._boundScrubUp);
    window.removeEventListener("touchmove", this._boundScrubMove);
    window.removeEventListener("touchend", this._boundScrubUp);
    // Flush final seek immediately
    this._scheduleScrubSeekSend(true);
    // Restart ticking
    this.startPositionUpdates();
    // Resync state after final seek (reduces drift)
    Promise.resolve()
      .then(() => this.loadPlayerState())
      .catch(() => { });
  }
  _scheduleScrubSeekSend(immediate) {
    const desired = Number(this.scrubDesiredPositionMs);
    if (!Number.isFinite(desired)) return;
    // Avoid spamming identical seeks
    if (this.scrubLastSentPositionMs === desired && !immediate) return;
    if (this.scrubSendTimeout) {
      clearTimeout(this.scrubSendTimeout);
      this.scrubSendTimeout = null;
    }
    const send = () => {
      this.scrubSendTimeout = null;
      this.scrubLastSentPositionMs = desired;
      this.apiCall("POST", `/api/player/${this.guildId}/seek`, {
        position: desired,
      });
    };
    if (immediate) send();
    else this.scrubSendTimeout = setTimeout(send, 150);
  }
  isGuildOwner(guildId) {
    // Bot owners/developers bypass all guild-level restrictions
    if (this.user?.isBotOwner) return true;

    if (!this.servers || !guildId) return false;
    const server = this.servers.find(s => s.id === guildId);
    return server ? !!server.owner : false;
  }
  updateSidebarAccess() {
    // Visually lock/hide buttons for non-owners
    const isOwner = this.isGuildOwner(this.guildId);
    const settingsBtn = document.querySelector('[data-page="settings"]');
    const emojisBtn = document.querySelector('[data-page="emojis"]');
    if (settingsBtn) {
      settingsBtn.style.opacity = isOwner ? "1" : "0.5";
      settingsBtn.style.cursor = isOwner ? "pointer" : "not-allowed";
      // Optional: add lock icon
    }
    if (emojisBtn) {
      emojisBtn.style.opacity = isOwner ? "1" : "0.5";
      emojisBtn.style.cursor = isOwner ? "pointer" : "not-allowed";
    }
  }
  async ensurePermission(action = "control") {
    const perm = await this.checkPlayerPermission();
    if (perm.allowed) return true;

    // Permission required
    const ownerName = perm.sessionOwner?.tag || "the session owner";
    this.showToast(`🔒 Permission required from ${ownerName}`, "error");

    // Show overlay or prompt
    // For now, simpler prompt
    if (confirm(`This session is owned by ${ownerName}. Do you want to request permission to control the player?`)) {
      this.requestPlayerPermission(action);
    }
    return false;
  }

  async togglePlayPause() {
    if (!await this.ensurePermission("toggle playback")) return;
    const endpoint = this.playerState?.isPaused ? "play" : "pause";
    await this.apiCall("POST", `/api/player/${this.guildId}/${endpoint}`);
  }
  async previous() {
    if (!await this.ensurePermission("play previous track")) return;
    await this.apiCall("POST", `/api/player/${this.guildId}/previous`);
  }
  async skip() {
    if (!await this.ensurePermission("skip track")) return;
    await this.apiCall("POST", `/api/player/${this.guildId}/skip`);
  }
  async shuffle() {
    if (!await this.ensurePermission("shuffle queue")) return;
    await this.apiCall("POST", `/api/player/${this.guildId}/shuffle`);
  }
  async toggleRepeat() {
    if (!await this.ensurePermission("change loop mode")) return;
    const modes = ["none", "track", "queue"];
    const currentMode = this.playerState?.repeatMode || "none";
    const currentIndex = modes.indexOf(currentMode);
    const nextMode = modes[(currentIndex + 1) % modes.length];
    await this.apiCall("POST", `/api/player/${this.guildId}/loop`, {
      mode: nextMode,
    });
  }
  async setVolume(volume) {
    // Debounce permission check for volume to avoid spam
    if (!this._lastVolPermCheck || Date.now() - this._lastVolPermCheck > 5000) {
      const perm = await this.checkPlayerPermission();
      this._lastVolPermCheck = Date.now();
      if (!perm.allowed) {
        this.showToast(`🔒 Permission required from session owner`, "error");
        return; // Don't prompt for volume slide to avoid interrupting UI
      }
    }

    this.volumeValue.textContent = `${volume}%`;
    this.volumeIcon.textContent = volume > 50 ? "🔊" : volume > 0 ? "🔉" : "🔇";
    await this.apiCall("POST", `/api/player/${this.guildId}/volume`, {
      volume: parseInt(volume),
    });
  }
  async shuffleQueue() {
    if (!await this.ensurePermission("shuffle queue")) return;
    await this.apiCall("POST", `/api/queue/${this.guildId}/shuffle`);
    await this.loadQueue();
  }
  async clearQueue() {
    if (!await this.ensurePermission("clear queue")) return;
    await this.apiCall("POST", `/api/queue/${this.guildId}/clear`);
    await this.loadQueue();
  }
  async removeFromQueue(index) {
    if (!await this.ensurePermission("remove from queue")) return;
    await this.apiCall("DELETE", `/api/queue/${this.guildId}/${index}`);
    await this.loadQueue();
  }
  async apiCall(method, url, body = null) {
    try {
      const options = {
        method,
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": this.apiKey
        }
      };
      if (body) options.body = JSON.stringify(body);
      const response = await fetch(url, options);
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || `Request failed: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error("API Call failed:", error);
      this.showToast("❌ " + error.message);
      throw error;
    }
  }
  async startRadio(station) {
    if (!this.guildId) return alert("Please select a server first");
    const stations = {
      lofi: "https://www.youtube.com/watch?v=jfKfPfyJRdk",
      rock: "https://www.youtube.com/watch?v=hTWKbfoikeg",
      pop: "https://www.youtube.com/playlist?list=PLMC9KNkIncKvYin_USF1qoJQnIyMAfRxl",
      edm: "https://www.youtube.com/watch?v=mAKsZ26SabQ",
      jazz: "https://www.youtube.com/watch?v=f_mS3W3606M",
      hiphop: "https://www.youtube.com/watch?v=MWN-P6_4-iY",
      gaming: "https://www.youtube.com/watch?v=BTYAsjAVa3I",
      kpop: "https://www.youtube.com/playlist?list=PL4fGSI1pDJn6jWqs706AuE3k58W_LToGO"
    };
    const url = stations[station];
    if (!url) return;
    await this.apiCall("POST", `/api/player/${this.guildId}/play`, {
      query: url
    });
    this.showPage("playerPage");
    this.showToast(`📻 Starting ${station} radio...`);
  }
  // Placeholder for consolidated emoji logic to follow
  async loadServerEmojis() {
    console.log("=== LOADING SERVER EMOJIS ===");
    document.getElementById("serverEmojisGrid").innerHTML = `
        <div class="loading-state">
            <div class="spinner-small"></div>
            <p>Loading server emojis...</p>
        </div>
    `;
    try {
      const response = await fetch(`/api/emojis/${this.guildId}/server`, {
        headers: { "X-API-Key": this.apiKey },
      });
      if (response.ok) {
        this.serverEmojis = await response.json();
        this.renderServerEmojis();
      } else {
        document.getElementById("serverEmojisGrid").innerHTML =
          '<p class="error">Failed to load server emojis</p>';
      }
    } catch (error) {
      console.error("Failed to load server emojis:", error);
      document.getElementById("serverEmojisGrid").innerHTML =
        '<p class="error">Failed to load server emojis</p>';
    }
  }
  renderServerEmojis(filter = "all", search = "") {
    const grid = document.getElementById("serverEmojisGrid");
    // If no emojis loaded, fetch them
    if (!this.serverEmojis || this.serverEmojis.length === 0) {
      this.loadServerEmojis().then(() => {
        // After loading, render with the loaded emojis
        this._renderServerEmojisFiltered(filter, search);
      });
      return;
    }
    this._renderServerEmojisFiltered(filter, search);
  }
  _renderServerEmojisFiltered(filter = "all", search = "") {
    const grid = document.getElementById("serverEmojisGrid");
    if (!this.serverEmojis || this.serverEmojis.length === 0) {
      grid.innerHTML =
        '<p class="no-emojis">No emojis found in this server</p>';
      return;
    }
    let filtered = this.serverEmojis;
    // Apply filter
    if (filter === "animated") {
      filtered = filtered.filter((e) => e.isAnimated);
    } else if (filter === "static") {
      filtered = filtered.filter((e) => !e.isAnimated);
    }
    // Apply search
    if (search) {
      const searchLower = search.toLowerCase();
      filtered = filtered.filter((e) =>
        e.name.toLowerCase().includes(searchLower),
      );
    }
    if (filtered.length === 0) {
      grid.innerHTML = '<p class="no-emojis">No emojis match your search</p>';
      return;
    }
    grid.innerHTML = filtered
      .map(
        (emoji) => `
            <div class="server-emoji-item" data-emoji-id="${emoji.id}" data-emoji-name="${emoji.name}" data-emoji-url="${emoji.url}" data-is-animated="${emoji.isAnimated}" onclick="dashboard.selectServerEmoji(this)">
                ${emoji.isAnimated
            ? `<img src="${emoji.url}" alt="${emoji.name}">`
            : emoji.url
              ? `<img src="${emoji.url}" alt="${emoji.name}">`
              : emoji.name
          }
            </div>
        `,
      )
      .join("");
  }
  selectServerEmoji(element) {
    // Remove selection from others
    document
      .querySelectorAll(".server-emoji-item")
      .forEach((el) => el.classList.remove("selected"));
    // Add selection to clicked element
    element.classList.add("selected");
    // Populate the emoji input
    const emojiId = element.dataset.emojiId;
    const emojiName = element.dataset.emojiName;
    const emojiUrl = element.dataset.emojiUrl;
    const isAnimated = element.dataset.isAnimated === "true";
    document.getElementById("newEmoji").value = `<:${emojiName}:${emojiId}>`;
    document.getElementById("newEmoji").dataset.emojiId = emojiId;
    document.getElementById("newEmoji").dataset.emojiUrl = emojiUrl;
    document.getElementById("newEmoji").dataset.emojiName = emojiName;
    document.getElementById("newEmoji").dataset.isAnimated = isAnimated;
    this.updateEmojiPreview();
  }
  openEmojiPicker() {
    const modalGrid = document.getElementById("modalEmojiGrid");
    modalGrid.innerHTML = '<p class="loading">Loading server emojis...</p>';
    document.getElementById("emojiPickerModal").classList.remove("hidden");
    // Load server emojis into modal
    if (this.serverEmojis && this.serverEmojis.length > 0) {
      this.renderModalEmojis(this.serverEmojis);
    } else {
      this.loadServerEmojisForModal();
    }
  }
  async loadServerEmojisForModal() {
    try {
      const response = await fetch(`/api/emojis/${this.guildId}/server`, {
        headers: { "X-API-Key": this.apiKey },
      });
      if (response.ok) {
        this.serverEmojis = await response.json();
        this.renderModalEmojis(this.serverEmojis);
      } else {
        document.getElementById("modalEmojiGrid").innerHTML =
          '<p class="error">Failed to load emojis</p>';
      }
    } catch (error) {
      console.error("Failed to load server emojis for modal:", error);
      document.getElementById("modalEmojiGrid").innerHTML =
        '<p class="error">Failed to load emojis</p>';
    }
  }
  renderModalEmojis(emojis) {
    const modalGrid = document.getElementById("modalEmojiGrid");
    if (!emojis || emojis.length === 0) {
      modalGrid.innerHTML = '<p class="no-emojis">No emojis in this server</p>';
      return;
    }
    modalGrid.innerHTML = emojis
      .map(
        (emoji) => `
            <div class="server-emoji-item" data-emoji-id="${emoji.id}" data-emoji-name="${emoji.name}" data-emoji-url="${emoji.url}" data-is-animated="${emoji.isAnimated}" onclick="dashboard.selectModalEmoji(this)">
                ${emoji.isAnimated
            ? `<img src="${emoji.url}" alt="${emoji.name}">`
            : emoji.url
              ? `<img src="${emoji.url}" alt="${emoji.name}">`
              : emoji.name
          }
            </div>
        `,
      )
      .join("");
  }
  selectModalEmoji(element) {
    // Remove selection from others
    document
      .querySelectorAll("#modalEmojiGrid .server-emoji-item")
      .forEach((el) => el.classList.remove("selected"));
    // Add selection to clicked element
    element.classList.add("selected");
    // Populate the emoji input
    const emojiId = element.dataset.emojiId;
    const emojiName = element.dataset.emojiName;
    const emojiUrl = element.dataset.emojiUrl;
    const isAnimated = element.dataset.isAnimated === "true";
    document.getElementById("newEmoji").value = `<:${emojiName}:${emojiId}>`;
    document.getElementById("newEmoji").dataset.emojiId = emojiId;
    document.getElementById("newEmoji").dataset.emojiUrl = emojiUrl;
    document.getElementById("newEmoji").dataset.emojiName = emojiName;
    document.getElementById("newEmoji").dataset.isAnimated = isAnimated;
    // Close modal
    this.closeEmojiPicker();
  }
  closeEmojiPicker() {
    document.getElementById("emojiPickerModal").classList.add("hidden");
  }
  async loadEmojiMappings() {
    console.log("=== LOAD EMOJI MAPPINGS ===");
    this.emojiMappingsContainer.innerHTML = `
        <div class="loading-state">
            <div class="spinner-small"></div>
            <p>Loading emoji mappings...</p>
        </div>
    `;
    try {
      const response = await fetch(`/api/emojis/${this.guildId}`, {
        headers: { "X-API-Key": this.apiKey },
      });

      const data = response.ok ? await response.json() : [];
      const dbMappings = Array.isArray(data) ? data : [];
      const defaults = await this.loadDefaultEmojis();

      // Merge: Start with ALL defaults, overlay DB values, then add extra DB-only values
      const merged = defaults.map(def => {
        const custom = dbMappings.find(m => (m.bot_name || m.botName) === (def.bot_name || def.botName));
        return custom ? { ...def, ...custom } : def;
      });

      // Add custom ones from DB that aren't in defaults
      dbMappings.forEach(m => {
        const name = m.bot_name || m.botName;
        if (!merged.find(d => (d.bot_name || d.botName) === name)) {
          merged.push(m);
        }
      });

      this.emojiMappings = merged;

      // Build emoji lookup map
      this.emojiMap = new Map();
      for (const m of this.emojiMappings) {
        if (!m) continue;
        const key = m.bot_name || m.botName;
        this.emojiMap.set(key, m);
      }

      this.renderEmojiMappings("all");
      this.applyDashboardEmojis();
    } catch (error) {
      console.error("Failed to load emoji mappings:", error);
      this.emojiMappings = this.getHardcodedDefaults();
      this.renderEmojiMappings("all");
    }
  }

  async loadDefaultEmojis() {
    if (this.cachedDefaults) return this.cachedDefaults;
    try {
      const resp = await fetch("/api/emojis/defaults", { headers: { "X-API-Key": this.apiKey } });
      if (!resp.ok) throw new Error("API Error");
      const data = await resp.json();
      // Flatten
      const flat = [];
      for (const [catName, emojis] of Object.entries(data)) {
        for (const e of emojis) {
          flat.push({
            bot_name: e.botName,
            fallback: e.fallback,
            category: catName,
            description: e.description
          });
        }
      }
      this.cachedDefaults = flat;
      console.log("Loaded defaults:", flat.length);
      return flat;
    } catch (e) {
      console.error("Failed to load defaults, using fallback:", e);
      return this.getHardcodedDefaults();
    }
  }

  getHardcodedDefaults() {
    return [
      { bot_name: "play", fallback: "▶️", category: "player_controls" },
      { bot_name: "pause", fallback: "⏸️", category: "player_controls" },
      { bot_name: "skip", fallback: "⏭️", category: "player_controls" },
      { bot_name: "previous", fallback: "⏮️", category: "player_controls" },
      { bot_name: "shuffle", fallback: "🔀", category: "player_controls" },
      { bot_name: "repeat", fallback: "🔁", category: "player_controls" },
      { bot_name: "stop", fallback: "⏹️", category: "player_controls" },
      { bot_name: "queue", fallback: "📋", category: "player_controls" },
      { bot_name: "playing", fallback: "🎵", category: "now_playing" },
      { bot_name: "music", fallback: "🎶", category: "now_playing" },
      { bot_name: "live", fallback: "🔴", category: "now_playing" },
      { bot_name: "sp", fallback: "🟢", category: "voice_status" },
      { bot_name: "idle", fallback: "🟡", category: "voice_status" },
      { bot_name: "dnd", fallback: "🔴", category: "voice_status" },
      { bot_name: "offline", fallback: "⚫", category: "voice_status" },
      { bot_name: "error", fallback: "❌", category: "actions" },
      { bot_name: "success", fallback: "✅", category: "actions" },
      { bot_name: "warning", fallback: "⚠️", category: "actions" },
      { bot_name: "info", fallback: "ℹ️", category: "actions" },
      { bot_name: "bassboost", fallback: "🎸", category: "filters" },
      { bot_name: "filters", fallback: "🎛️", category: "filters" },
      // Generic Bot/Service Emojis
      { bot_name: "groovy", fallback: "🎵", category: "custom" },
      { bot_name: "rhythm", fallback: "🎶", category: "custom" },
      { bot_name: "carl-bot", fallback: "🤖", category: "custom" },
      { bot_name: "parrot", fallback: "🦜", category: "custom" },
      { bot_name: "verify", fallback: "✅", category: "custom" },
    ];
  }

  updateEmojiPreview() {
    const statusEmoji = document.getElementById("preview-status-emoji");
    const playBtn = document.getElementById("preview-play-btn");
    const skipBtn = document.getElementById("preview-skip-btn");
    const prevBtn = document.getElementById("preview-prev-btn");
    const stopBtn = document.getElementById("preview-stop-btn");

    if (statusEmoji) statusEmoji.innerHTML = this.getEmojiHtml("playing");
    if (playBtn) playBtn.innerHTML = this.getEmojiHtml("pause");
    if (skipBtn) skipBtn.innerHTML = this.getEmojiHtml("skip");
    if (prevBtn) prevBtn.innerHTML = this.getEmojiHtml("previous");
    if (stopBtn) stopBtn.innerHTML = this.getEmojiHtml("stop");
  }

  getEmojiHtml(botName) {
    const mapping = this.emojiMap?.get(botName) || this.emojiMappings?.find(m => (m.bot_name || m.botName) === botName);
    if (mapping && (mapping.emoji_id || mapping.emojiId)) {
      return `<img src="${mapping.emoji_url || mapping.emojiUrl}" alt="${botName}" style="width: 20px; height: 20px; vertical-align: middle;">`;
    }
    return mapping ? (mapping.fallback || mapping.emojiName || "❓") : "❓";
  }
  renderEmojiMappings(category) {
    let mappings = this.emojiMappings || [];
    if (!Array.isArray(mappings)) {
      mappings = [];
    }
    // Filter by category
    if (category !== "all") {
      mappings = mappings.filter((m) => m && m.category === category);
    }
    // Search filter
    const searchInput = document.getElementById("mappingSearch");
    if (searchInput && searchInput.value) {
      const searchLower = searchInput.value.toLowerCase();
      mappings = mappings.filter(
        (m) => m && m.bot_name.toLowerCase().includes(searchLower),
      );
    }
    const container = document.getElementById("emojiMappings");
    if (!container) return;

    if (!mappings || mappings.length === 0) {
      container.innerHTML = '<p class="no-emojis">No emoji mappings found</p>';
      return;
    }

    // Update live preview whenever mappings are re-rendered
    this.updateEmojiPreview();
    container.innerHTML = mappings
      .map((mapping) => {
        if (!mapping) return "";
        const emojiDisplay =
          mapping.emoji_id && mapping.is_available
            ? `<span class="custom-emoji"><img src="${mapping.emoji_url || ""}" alt="${mapping.bot_name}"></span>`
            : `<span class="fallback-emoji">${mapping.fallback || "❓"}</span>`;
        return `
                <div class="emoji-mapping-row" data-bot-name="${mapping.bot_name || "unknown"}">
                    <span class="emoji-display">${emojiDisplay}</span>
                    <div class="mapping-info">
                        <span class="bot-name">${mapping.bot_name || "unknown"}</span>
                        <span class="mapping-category">${mapping.category || "general"}</span>
                    </div>
                    <div class="mapping-actions">
                        <button class="edit-btn" onclick="dashboard.editEmojiMapping('${mapping.bot_name}')" title="Edit">✏️</button>
                        <button class="delete-btn" onclick="dashboard.deleteEmojiMapping('${mapping.bot_name}')" title="Delete">🗑️</button>
                    </div>
                </div>
            `;
      })
      .join("");
  }
  async editEmojiMapping(botName) {
    const mapping = this.emojiMap?.get(botName);
    if (!mapping) return;
    const newEmoji = prompt(
      `Edit emoji for "${botName}":\nEnter custom emoji (paste from server or type Unicode)`,
      mapping.fallback || "",
    );
    if (newEmoji !== null) {
      try {
        const response = await fetch(`/api/emojis/${this.guildId}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "X-API-Key": this.apiKey,
          },
          body: JSON.stringify({
            botName,
            fallback: newEmoji,
          }),
        });
        if (response.ok) {
          await this.loadEmojiMappings();
          this.showToast("✅ Emoji mapping updated!");
        } else {
          const error = await response.json();
          alert("Failed to update emoji: " + (error.error || "Unknown error"));
        }
      } catch (error) {
        console.error("Error updating emoji:", error);
        alert("Error updating emoji: " + error.message);
      }
    }
  }
  async deleteEmojiMapping(botName) {
    if (!confirm(`Delete emoji mapping for "${botName}"?`)) return;
    try {
      const response = await fetch(`/api/emojis/${this.guildId}/${botName}`, {
        method: "DELETE",
        headers: { "X-API-Key": this.apiKey },
      });
      if (response.ok) {
        await this.loadEmojiMappings();
      } else {
        const error = await response.json();
        alert("Failed to delete emoji: " + (error.error || "Unknown error"));
      }
    } catch (error) {
      console.error("Error deleting emoji:", error);
      alert("Error deleting emoji: " + error.message);
    }
  }
  async addEmojiMapping() {
    const botName = document.getElementById("newBotName").value.trim();
    const emojiInput = document.getElementById("newEmoji");
    const category = document.getElementById("newEmojiCategory").value;
    if (!botName) {
      alert("Please enter a bot function name");
      return;
    }
    let emojiId = emojiInput.dataset.emojiId;
    let emojiUrl = emojiInput.dataset.emojiUrl;
    let emojiName = emojiInput.dataset.emojiName;
    let isAnimated = emojiInput.dataset.isAnimated === "true";
    let emoji = emojiInput.value;
    if (!emoji) {
      alert("Please select or enter an emoji");
      return;
    }
    try {
      const response = await fetch(`/api/emojis/${this.guildId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": this.apiKey,
        },
        body: JSON.stringify({
          botName,
          emojiId: emojiId || null,
          emojiUrl: emojiUrl || null,
          emojiName: emojiName || emoji,
          isAnimated,
          fallback: emoji,
          category,
        }),
      });
      if (response.ok) {
        // Clear form
        document.getElementById("newBotName").value = "";
        document.getElementById("newEmoji").value = "";
        delete emojiInput.dataset.emojiId;
        delete emojiInput.dataset.emojiUrl;
        delete emojiInput.dataset.emojiName;
        delete emojiInput.dataset.isAnimated;
        await this.loadEmojiMappings();
      } else {
        const error = await response.json();
        alert("Failed to add emoji: " + (error.error || "Unknown error"));
      }
    } catch (error) {
      console.error("Error adding emoji:", error);
      alert("Error adding emoji: " + error.message);
    }
  }
  async showSyncPreview() {
    try {
      const response = await fetch(`/api/emojis/${this.guildId}/sync/preview`, {
        headers: { "X-API-Key": this.apiKey },
      });
      if (response.ok) {
        const preview = await response.json();
        this.renderSyncPreview(preview);
        document.getElementById("syncPreviewModal").classList.remove("hidden");
      } else {
        alert("Failed to load sync preview");
      }
    } catch (error) {
      console.error("Error loading sync preview:", error);
      alert("Error loading sync preview: " + error.message);
    }
  }
  renderSyncPreview(preview) {
    const list = document.getElementById("syncPreviewList");
    if (!preview || preview.length === 0) {
      list.innerHTML = '<p class="no-emojis">No new emojis to sync</p>';
      return;
    }
    // Filter to only unmapped emojis
    const unmapped = preview.filter((p) => !p.isMapped);
    if (unmapped.length === 0) {
      list.innerHTML =
        '<p class="no-emojis">All server emojis are already mapped</p>';
      return;
    }
    list.innerHTML = unmapped
      .map(
        (item) => `
            <div class="sync-preview-item">
                <span class="server-emoji">${item.emojiUrl ? `<img src="${item.emojiUrl}" alt="${item.emojiName}">` : item.emojiName}</span>
                <div class="suggestion">
                    <div class="emoji-name">:${item.emojiName}:</div>
                    <div class="bot-function">→ ${item.suggestedBotName} (${item.category})</div>
                </div>
            </div>
        `,
      )
      .join("");
  }
  closeSyncPreview() {
    document.getElementById("syncPreviewModal").classList.add("hidden");
  }
  async applySync() {
    try {
      const response = await fetch(`/api/emojis/${this.guildId}/sync`, {
        method: "POST",
        headers: { "X-API-Key": this.apiKey },
      });
      if (response.ok) {
        const result = await response.json();
        this.showToast(
          `✅ Sync complete! ${result.synced} mapped, ${result.skipped} skipped.`,
        );
        this.closeSyncPreview();
        await this.loadEmojiMappings();
        await this.loadServerEmojis();
      } else {
        const error = await response.json();
        this.showToast(`❌ Sync failed: ${error.error || "Unknown error"}`, "error");
      }
    } catch (error) {
      console.error("Error syncing emojis:", error);
      this.showToast("❌ Error syncing emojis: " + error.message, "error");
    }
  }

  async autoMatchEmojis() {
    if (
      !confirm(
        "This will auto-map all unmapped server emojis based on name similarity. Continue?",
      )
    ) {
      return;
    }
    await this.applySync();
  }

  async syncServerEmojis() {
    const btn = document.getElementById("syncServerBtn");
    const original = btn.textContent;
    btn.textContent = "Syncing...";
    btn.disabled = true;

    try {
      const response = await fetch(`/api/emojis/${this.guildId}/sync/server`, {
        method: "POST",
        headers: { "X-API-Key": this.apiKey }
      });

      if (response.ok) {
        this.showToast("✅ Server emojis synced!");
        await this.loadServerEmojis();
      } else {
        const err = await response.json();
        this.showToast("❌ " + (err.error || "Sync failed"), "error");
      }
    } catch (e) {
      console.error(e);
      this.showToast("❌ Network error", "error");
    } finally {
      btn.textContent = original;
      btn.disabled = false;
    }
  }
  async resetEmojis() {
    if (
      !confirm(
        "Are you sure you want to reset ALL emoji mappings to defaults? This cannot be undone.",
      )
    ) {
      return;
    }
    try {
      const response = await fetch(`/api/emojis/${this.guildId}/reset`, {
        method: "POST",
        headers: { "X-API-Key": this.apiKey },
      });
      if (response.ok) {
        await this.loadEmojiMappings();
        await this.loadServerEmojis();
      } else {
        const error = await response.json();
        alert("Reset failed: " + (error.error || "Unknown error"));
      }
    } catch (error) {
      console.error("Error resetting emojis:", error);
      alert("Error resetting emojis: " + error.message);
    }
  }
  async loadStats() {
    document.getElementById("topSongsList").innerHTML = `
        <div class="loading-state">
            <div class="spinner-small"></div>
            <p>Loading statistics...</p>
        </div>
    `;
    document.getElementById("sourceDistribution").innerHTML = `
        <div class="loading-state">
            <div class="spinner-small"></div>
            <p>Loading source data...</p>
        </div>
    `;
    try {
      const response = await fetch(`/api/stats/${this.guildId}`, {
        headers: { "X-API-Key": this.apiKey },
      });
      const stats = await response.json();
      document.getElementById("totalPlays").textContent = (
        stats.totalPlays || 0
      ).toLocaleString();
      document.getElementById("uniqueUsers").textContent = (
        stats.uniqueUsers || 0
      ).toLocaleString();
      document.getElementById("topGenre").textContent = stats.topGenre || "N/A";
      document.getElementById("botUptime").textContent = this.formatUptime(
        stats.uptime || 0,
      );
      document.getElementById("historyCount").textContent = (
        stats.historyCount || 0
      ).toLocaleString();
      // Top songs
      if (stats.topSongs && stats.topSongs.length > 0) {
        document.getElementById("topSongsList").innerHTML = stats.topSongs
          .map(
            (song, i) => `
                    <div class="top-song-item">
                        <span class="top-song-rank">#${i + 1}</span>
                        <span class="top-song-title">${this.escapeHtml(song.title)}</span>
                        <span class="top-song-artist">${this.escapeHtml(song.author || "Unknown")}</span>
                        <span class="top-song-plays">${song.playCount} plays</span>
                    </div>
                `,
          )
          .join("");
      } else {
        document.getElementById("topSongsList").innerHTML =
          '<p class="loading-stats">No statistics available yet. Start playing music to see stats!</p>';
      }
      // Source distribution
      const sourceData = stats.sourceDistribution || {};
      const sources = Object.entries(sourceData).filter(
        ([_, count]) => count > 0,
      );
      if (sources.length > 0) {
        const maxCount = Math.max(...sources.map(([_, count]) => count));
        document.getElementById("sourceDistribution").innerHTML = sources
          .sort((a, b) => b[1] - a[1])
          .map(
            ([name, count]) => `
                    <div class="source-bar">
                        <span class="source-name">${name}</span>
                        <div class="source-bar-bg">
                          <div class="source-bar-fill" style="width: ${(count / maxCount) * 100
              }%">
                          </div>
                        </div>
                        <span class="source-count">${count}</span>
                    </div>
                `,
          )
          .join("");
      } else {
        document.getElementById("sourceDistribution").innerHTML =
          '<p class="loading-stats">No source data available</p>';
      }
    } catch (error) {
      console.error("Failed to load stats:", error);
      document.getElementById("topSongsList").innerHTML =
        '<p class="error">Failed to load statistics</p>';
    }
  }
  // ============ PLAYLIST FUNCTIONS ============
  async loadPlaylists() {
    const container = document.getElementById("playlistsList");
    container.innerHTML = `
        <div class="loading-state">
            <div class="spinner-small"></div>
            <p>Loading playlists...</p>
        </div>
    `;
    // Get userId from localStorage (stored by inline auth script)
    let userId = localStorage.getItem("dashboard_user_id");
    // Also try this.user object
    if (!userId) {
      userId =
        this.user?.id ||
        this.user?.discordId ||
        this.user?.userId ||
        this.user?._id;
    }
    if (!userId && this.user) {
      userId = this.user.id || this.user.discordId;
    }
    console.log(
      "loadPlaylists - userId:",
      userId,
      "this.user:",
      JSON.stringify(this.user),
    );
    try {
      // Include localUserId in query params for server to use
      const url = userId
        ? `/api/playlists/${this.guildId}?userId=${encodeURIComponent(String(userId))}&localUserId=${encodeURIComponent(String(userId))}`
        : `/api/playlists/${this.guildId}`;
      console.log("Fetching playlists from:", url);
      const response = await fetch(url, {
        headers: { "X-API-Key": this.apiKey },
      });
      if (response.ok) {
        const data = await response.json();
        console.log("Loaded playlists:", data);
        this.playlists = data;
        this.renderPlaylists();
      } else {
        const error = await response.json();
        console.error("Error loading playlists:", error);
        container.innerHTML =
          '<p class="error">Failed to load playlists: ' +
          (error.error || "Unknown error") +
          "</p>";
      }
    } catch (error) {
      console.error("Failed to load playlists:", error);
      container.innerHTML = '<p class="error">Failed to load playlists</p>';
    }
  }
  renderPlaylists() {
    const container = document.getElementById("playlistsList");
    if (!this.playlists || this.playlists.length === 0) {
      container.innerHTML =
        '<p class="empty-playlists">No playlists found. Create your first playlist!</p>';
      return;
    }
    container.innerHTML = this.playlists
      .map(
        (playlist) => `
            <div class="playlist-card">
                <div class="playlist-card-content" onclick="dashboard.viewPlaylist('${playlist.id}')">
                    <div class="playlist-name">${this.escapeHtml(playlist.name)}</div>
                    <div class="playlist-info">
                        ${playlist.trackCount || 0} tracks • ${playlist.isPublic ? "Public" : "Private"}
                    </div>
                </div>
                <div class="playlist-card-actions">
                    <button class="action-btn small" onclick="event.stopPropagation(); dashboard.copyPlaylistLink('${playlist.id}')" title="Copy Share Link">🔗</button>
                    <button class="action-btn small" onclick="event.stopPropagation(); dashboard.togglePlaylistPrivacy('${playlist.id}', ${!playlist.isPublic})" title="${playlist.isPublic ? "Make Private" : "Make Public"}">${playlist.isPublic ? "🔓" : "🔒"}</button>
                </div>
            </div>
        `,
      )
      .join("");
  }
  openCreatePlaylistModal() {
    document.getElementById("createPlaylistModal").classList.remove("hidden");
    // Reset fields
    document.getElementById("newPlaylistName").value = "";
    document.getElementById("newPlaylistDescription").value = "";
    document.getElementById("newPlaylistPublic").checked = false;
    document.getElementById("importPlaylistUrl").value = "";
    // Default to create tab
    this.switchPlaylistTab("create");
  }

  switchPlaylistTab(tab) {
    this.currentPlaylistTab = tab;

    // Update tab buttons
    document.querySelectorAll(".modal-tab").forEach(btn => {
      if (btn.dataset.tab === tab) btn.classList.add("active");
      else btn.classList.remove("active");
    });

    // Toggle content visibility
    if (tab === "create") {
      document.getElementById("playlist-tab-create").classList.remove("hidden");
      document.getElementById("playlist-tab-import").classList.add("hidden");
      document.getElementById("createPlaylistConfirmBtn").textContent = "Create Playlist";
    } else {
      document.getElementById("playlist-tab-create").classList.add("hidden");
      document.getElementById("playlist-tab-import").classList.remove("hidden");
      document.getElementById("createPlaylistConfirmBtn").textContent = "Import Playlist";
    }
  }

  async handlePlaylistSubmit() {
    if (this.currentPlaylistTab === "import") {
      await this.submitImportPlaylist();
    } else {
      await this.submitCreatePlaylist();
    }
  }

  async submitCreatePlaylist() {
    const name = document.getElementById("newPlaylistName").value.trim();
    const description = document.getElementById("newPlaylistDescription").value.trim();
    const isPublic = document.getElementById("newPlaylistPublic").checked;

    if (!name) {
      this.showToast("⚠️ Please enter a playlist name", "error");
      return;
    }

    // Get userId
    let userId = localStorage.getItem("dashboard_user_id") || this.user?.id || this.user?.userId;

    try {
      const response = await fetch(`/api/playlists/${this.guildId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": this.apiKey,
        },
        body: JSON.stringify({
          name,
          description,
          isPublic,
          userId: String(userId),
        }),
      });

      if (response.ok) {
        this.closeModal("createPlaylistModal");
        this.showToast("✅ Playlist created successfully!");
        await this.loadPlaylists();
      } else {
        const error = await response.json();
        this.showToast(`❌ ${error.error || "Failed to create playlist"}`, "error");
      }
    } catch (error) {
      console.error("Failed to create playlist:", error);
      this.showToast("❌ Network error while creating playlist", "error");
    }
  }

  async submitImportPlaylist() {
    const url = document.getElementById("importPlaylistUrl").value.trim();
    if (!url) {
      this.showToast("⚠️ Please enter a playlist URL", "error");
      return;
    }

    const confirmBtn = document.getElementById("createPlaylistConfirmBtn");
    const originalText = confirmBtn.textContent;
    confirmBtn.textContent = "Importing...";
    confirmBtn.disabled = true;

    try {
      // Determine import type roughly
      let endpoint = `/api/playlists/${this.guildId}/import/spotify`;
      if (url.includes("youtube.com") || url.includes("youtu.be")) {
        // Assume YouTube logic (might need specific endpoint if exists, but we'll use spotify for now as placeholder or need to check if we have a generic import)
        // Wait, the backend has /import/spotify. Does it have /import/youtube?
        // Let's assume we reuse the logic or it handles it. 
        // Use generic import if available, otherwise default to spotify import structure which might handle both in backend
        endpoint = `/api/playlists/${this.guildId}/import/spotify`;
      }

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": this.apiKey,
        },
        body: JSON.stringify({
          playlistUrl: url,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        this.closeModal("createPlaylistModal");
        this.showToast(`✅ Imported ${data.imported || 0} tracks!`);
        await this.loadPlaylists();
      } else {
        const error = await response.json();
        this.showToast(`❌ ${error.error || "Failed to import playlist"}`, "error");
      }
    } catch (error) {
      console.error("Import failed:", error);
      this.showToast("❌ Import failed: " + error.message, "error");
    } finally {
      confirmBtn.textContent = originalText;
      confirmBtn.disabled = false;
    }
  }
  async openAddToPlaylistModal(track = null) {
    const currentTrack = this.playerState?.currentTrack;

    // If no track passed and no current track, or current track is empty/invalid
    if (!track && (!currentTrack || !currentTrack.title)) {
      this.showToast("⚠️ Nothing is playing", "error");
      return;
    }

    // Determine the track to add
    this.trackToAdd = track || currentTrack;

    // Open modal
    document.getElementById("addToPlaylistModal").classList.remove("hidden");
    const container = document.getElementById("addToPlaylistList");
    container.innerHTML = '<div class="loader-spinner"></div>';

    // Load playlists if needed
    if (!this.playlists || this.playlists.length === 0) {
      await this.loadPlaylists();
    }

    // Render list
    if (!this.playlists || this.playlists.length === 0) {
      container.innerHTML = `
            <div class="empty-state">
                <p>No playlists found.</p>
                <button onclick="dashboard.openCreatePlaylistModal(); dashboard.closeModal('addToPlaylistModal')" class="action-btn small">Create New</button>
            </div>
        `;
      return;
    }

    container.innerHTML = this.playlists.map(p => `
        <div class="playlist-select-item" onclick="dashboard.handleAddCurrentTrackToPlaylist('${p.id}')">
            <div class="playlist-select-info">
                <span class="playlist-select-name">${this.escapeHtml(p.name)}</span>
                <span class="playlist-select-meta">${p.trackCount || 0} tracks • ${p.isPublic ? "Public" : "Private"}</span>
            </div>
            <div class="playlist-select-action">
                <span>➕</span>
            </div>
        </div>
    `).join("");
  }

  async handleAddCurrentTrackToPlaylist(playlistId) {
    if (!this.trackToAdd) return;

    // Close modal
    this.closeModal("addToPlaylistModal");

    // Call existing addTrack method
    await this.addTrackToPlaylist(playlistId, this.trackToAdd);

    this.trackToAdd = null;
  }

  async viewPlaylist(playlistId) {
    try {
      const response = await fetch(
        `/api/playlists/${this.guildId}/${playlistId}`,
        {
          headers: { "X-API-Key": this.apiKey },
        },
      );
      if (response.ok) {
        this.currentPlaylist = await response.json();
        this.showPlaylistDetails();
      } else {
        alert("Failed to load playlist");
      }
    } catch (error) {
      console.error("Failed to load playlist:", error);
      alert("Failed to load playlist: " + error.message);
    }
  }
  showPlaylistsList() {
    document.getElementById("playlistsList").classList.remove("hidden");
    document.getElementById("playlistDetailsView").classList.add("hidden");
    document.getElementById("backToPlaylistsBtn").classList.add("hidden");
    document.getElementById("playlistsPageTitle").textContent = "My Playlists";
    document.getElementById("createPlaylistBtn").classList.remove("hidden");
  }
  showPlaylistDetails() {
    document.getElementById("playlistsList").classList.add("hidden");
    document.getElementById("playlistDetailsView").classList.remove("hidden");
    document.getElementById("backToPlaylistsBtn").classList.remove("hidden");
    document.getElementById("playlistsPageTitle").textContent = "";
    document.getElementById("createPlaylistBtn").classList.add("hidden");
    this.renderPlaylistDetails();
  }
  formatDuration(ms) {
    if (!ms) return "0:00";
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
  }
  formatDate(timestamp) {
    if (!timestamp) return "";
    const date = new Date(timestamp);
    const now = new Date();
    const diffTime = Math.abs(now - date);
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    if (diffDays < 1) return "Today";
    if (diffDays < 2) return "Yesterday";
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    return date.toLocaleDateString();
  }
  renderPlaylistDetails() {
    if (!this.currentPlaylist) return;
    const playlist = this.currentPlaylist;
    // Update header
    document.getElementById("playlistTitle").textContent = playlist.name;
    document.getElementById("playlistDescription").textContent =
      playlist.description || "";
    document.getElementById("playlistCreator").textContent = "Created by You";
    document.getElementById("playlistTrackCount").textContent =
      `${playlist.track_count || playlist.tracks?.length || 0} songs`;
    document.getElementById("playlistDuration").textContent =
      this.formatDuration(playlist.total_duration);
    // Update cover
    const coverEl = document.getElementById("playlistCover");
    if (playlist.cover_image) {
      coverEl.innerHTML = `<img src="${playlist.cover_image}" alt="${this.escapeHtml(playlist.name)}">`;
    } else {
      coverEl.innerHTML = '<span class="playlist-cover-placeholder">♪</span>';
    }
    // Clear search results when viewing playlist
    document.getElementById("playlistSearchResults").classList.add("hidden");
    document.getElementById("playlistSearchResults").innerHTML = "";
    // Render tracks
    const tracksList = document.getElementById("playlistTracksList");
    const tracks = playlist.tracks || [];
    if (tracks.length > 0) {
      tracksList.innerHTML = tracks
        .map(
          (track, index) => `
                <div class="playlist-track-item" data-index="${index}">
                    <div class="track-num">${index + 1}</div>
                    <div class="track-play-hover" onclick="dashboard.playPlaylistTrack(${index})">▶</div>
                    <div class="track-main-info">
                        <div class="track-artwork">
                            ${track.artworkUrl || track.artwork_url ? `<img src="${track.artworkUrl || track.artwork_url}" alt="">` : '<span class="artwork-placeholder">♪</span>'}
                        </div>
                        <div class="track-text-info">
                            <span class="track-title-text">${this.escapeHtml(track.title || "Unknown")}</span>
                            <span class="track-artist-text">${this.escapeHtml(track.author || "Unknown")}</span>
                        </div>
                    </div>
                    <div class="track-album-text">${this.escapeHtml(track.album || "-")}</div>
                    <div class="track-duration-text">${this.formatDuration(track.duration)}</div>
                    <div class="track-actions">
                        <button class="track-action-btn" onclick="dashboard.playPlaylistTrack(${index})" title="Play Now">▶</button>
                        <button class="track-action-btn" onclick="dashboard.addTrackToQueue('${track.uri || track.identifier}')" title="Add to queue">📥</button>
                        <button class="track-action-btn" onclick="dashboard.removeTrackFromPlaylist('${track.identifier}')" title="Remove from playlist">🗑️</button>
                    </div>
                </div>
            `,
        )
        .join("");
    } else {
      tracksList.innerHTML = '<p class="empty-tracks">No tracks in this playlist yet. Add some below!</p>';
    }
  }
  async playPlaylist(shuffle = false) {
    if (!this.currentPlaylist || !this.guildId) return;
    const clearQueue = confirm("Do you want to clear the current queue before playing this playlist?");
    try {
      const response = await fetch(`/api/playlists/${this.guildId}/${this.currentPlaylist.id}/play`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": this.apiKey,
        },
        body: JSON.stringify({
          shuffle,
          clearQueue,
          voiceChannelId: this.playerState?.voiceChannel?.id || null, // Might need to prompt if null
          textChannelId: this.playerState?.textChannel?.id || null,
        }),
      });
      if (response.ok) {
        const data = await response.json();
        this.showPage("playerPage");
        this.showToast(`🎶 Playing playlist: ${this.currentPlaylist.name}`);
      } else {
        const error = await response.json();
        alert("Failed to play playlist: " + (error.error || "Unknown error"));
      }
    } catch (error) {
      console.error("Error playing playlist:", error);
      alert("Error playing playlist: " + error.message);
    }
  }
  shufflePlaylist() {
    this.playPlaylist(true);
  }
  async playPlaylistTrack(index) {
    if (!this.currentPlaylist || !this.currentPlaylist.tracks) return;
    const track = this.currentPlaylist.tracks[index];
    if (track) {
      this.playTrack(track.uri || track.identifier);
    }
  }
  async addTrackToQueue(identifier) {
    try {
      const response = await fetch(`/api/player/${this.guildId}/play`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": this.apiKey,
        },
        body: JSON.stringify({
          query: identifier,
          userId: this.user?.id || localStorage.getItem("dashboard_user_id"),
        }),
      });
      if (response.ok) {
        this.showToast("✅ Added to queue");
      } else {
        const error = await response.json();
        alert("Failed to add to queue: " + (error.error || "Unknown error"));
      }
    } catch (error) {
      console.error("Error adding to queue:", error);
    }
  }
  showToast(message, type = "success") {
    // Simple toast implementation or use existing if any
    console.log("Toast:", message, type);
    // You could add a DOM element for toasts
    const toast = document.createElement("div");
    toast.className = `toast-notification ${type === "error" ? "error" : ""}`;
    toast.textContent = message;

    // Remove default icon if error (handled by CSS ::before) or just let CSS handle it
    // Actually our CSS adds ::before content ALWAYS. 
    // We can conditionally remove the ::before in CSS or just rely on the .error override I added.

    document.body.appendChild(toast);
    setTimeout(() => {
      toast.classList.add("show");
      setTimeout(() => {
        toast.classList.remove("show");
        setTimeout(() => toast.remove(), 300);
      }, 3000);
    }, 100);
  }
  formatDuration(ms) {
    if (!ms || isNaN(ms)) return "0:00";
    const seconds = Math.floor((ms / 1000) % 60);
    const minutes = Math.floor((ms / (1000 * 60)) % 60);
    const hours = Math.floor((ms / (1000 * 60 * 60)));
    const s = seconds < 10 ? "0" + seconds : seconds;
    if (hours > 0) {
      const m = minutes < 10 ? "0" + minutes : minutes;
      return `${hours}:${m}:${s}`;
    }
    return `${minutes}:${s}`;
  }
  escapeHtml(text) {
    if (!text) return "";
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
  renderPlaylistDetails() {
    if (!this.currentPlaylist) return;
    const p = this.currentPlaylist;
    // const isOwner = p.userId === (this.user?.id || localStorage.getItem("dashboard_user_id"));
    // Update Header Info
    const nameEl = document.getElementById("playlistName");
    if (nameEl) nameEl.textContent = p.name;
    const descEl = document.getElementById("playlistDescription");
    if (descEl) descEl.textContent = p.description || "No description";
    const countEl = document.getElementById("playlistTrackCount");
    if (countEl) countEl.textContent = `${p.tracks ? p.tracks.length : 0} tracks`;
    const durationEl = document.getElementById("playlistDuration");
    if (durationEl) {
      const duration = p.tracks ? p.tracks.reduce((acc, t) => acc + (t.info?.length || 0), 0) : 0;
      durationEl.textContent = this.formatDuration(duration);
    }
    const creatorEl = document.getElementById("playlistCreator");
    if (creatorEl) creatorEl.textContent = `Created by: ${p.ownerName || 'Unknown'}`;
    // Cover Image
    const coverImg = document.getElementById("playlistCover");
    if (coverImg) {
      coverImg.src = p.cover_image || "https://cdn.discordapp.com/embed/avatars/0.png";
    }
    // Controls
    const playBtn = document.getElementById("playPlaylistBtn");
    if (playBtn) playBtn.onclick = () => this.playPlaylist(false);
    const shuffleBtn = document.getElementById("shufflePlaylistBtn");
    if (shuffleBtn) shuffleBtn.onclick = () => this.shufflePlaylist();
    // Tracks List
    const list = document.getElementById("playlistTracksList");
    if (list) {
      list.innerHTML = "";
      if (!p.tracks || p.tracks.length === 0) {
        list.innerHTML = '<p class="empty-state">No tracks in this playlist.</p>';
      } else {
        p.tracks.forEach((track, index) => {
          const div = document.createElement("div");
          div.className = "playlist-track-item";
          div.innerHTML = `
                    <div class="track-index">${index + 1}</div>
                    <div class="track-info">
                        <div class="track-title">${this.escapeHtml(track.info?.title || track.title || "Unknown")}</div>
                        <div class="track-artist">${this.escapeHtml(track.info?.author || track.author || "Unknown")}</div>
                    </div>
                    <div class="track-duration">${this.formatDuration(track.info?.length || 0)}</div>
                    <div class="track-actions">
                        <button class="action-btn small" onclick="dashboard.playPlaylistTrack(${index})">▶️</button>
                        <button class="action-btn small" onclick="dashboard.removeTrackFromPlaylist(${index})">🗑️</button>
                    </div>
                `;
          list.appendChild(div);
        });
      }
    }
  }
  async searchTracksForPlaylist() {
    const query = document.getElementById("playlistSearchInput").value.trim();
    const source = document.getElementById("playlistSearchSource").value || "youtube";
    const type = "track";

    if (!query) {
      this.showToast("⚠️ Please enter a search query", "error");
      return;
    }

    const resultsContainer = document.getElementById("playlistSearchResults");
    resultsContainer.classList.remove("hidden");
    resultsContainer.innerHTML = '<p class="empty-playlists">Searching...</p>';

    try {
      const response = await fetch(
        `/api/search?query=${encodeURIComponent(query)}&source=${source}&type=${type}`,
        {
          headers: { "X-API-Key": this.apiKey },
        },
      );
      if (response.ok) {
        const data = await response.json();
        const results = data.results || [];

        if (results.length === 0) {
          resultsContainer.innerHTML = '<p class="empty-playlists">No results found. Try a different search.</p>';
          return;
        }

        let html = '<h5 class="search-results-section">Tracks</h5>';
        html += results.map(track => `
          <div class="search-result-item" data-track='${JSON.stringify(track).replace(/'/g, "&#39;")}'>
              <img class="search-result-artwork" src="${track.artworkUrl || "https://via.placeholder.com/48"}" alt="">
              <div class="search-result-info">
                  <div class="search-result-title">${this.escapeHtml(track.title)}</div>
                  <div class="search-result-artist">${this.escapeHtml(track.author)}</div>
              </div>
              <span class="search-result-source">${track.sourceName || track.source}</span>
              <button class="search-result-add" onclick="dashboard.addSearchResultToPlaylist(this)">+ Add</button>
          </div>
        `).join("");

        resultsContainer.innerHTML = html;
      } else {
        const error = await response.json();
        resultsContainer.innerHTML = `<p class="empty-playlists">Search failed: ${error.error || "Unknown error"}</p>`;
      }
    } catch (error) {
      console.error("Search failed:", error);
      resultsContainer.innerHTML = '<p class="empty-playlists">Search failed. Please try again.</p>';
    }
  }

  addSearchResultToPlaylist(button) {
    const trackItem = button.closest(".search-result-item");
    const track = JSON.parse(trackItem.dataset.track.replace(/&#39;/g, "'"));
    if (!this.currentPlaylist) {
      this.showToast("⚠️ No playlist selected", "error");
      return;
    }
    // Add track to end of playlist
    this.addTrackToPlaylist(this.currentPlaylist.id, track);
  }

  async addTrackToPlaylist(playlistId, track, position = null) {
    try {
      const response = await fetch(
        `/api/playlists/${this.guildId}/${playlistId}/tracks`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-API-Key": this.apiKey,
          },
          body: JSON.stringify({ track, position }),
        },
      );
      if (response.ok) {
        this.currentPlaylist = await response.json();
        this.renderPlaylistDetails();
        // Hide search results after adding
        document.getElementById("playlistSearchResults").classList.add("hidden");
        document.getElementById("playlistSearchInput").value = "";
        this.showToast("✅ Track added to playlist");
      } else {
        const error = await response.json();
        this.showToast(`❌ Failed to add track: ${error.error || "Unknown error"}`, "error");
      }
    } catch (error) {
      console.error("Failed to add track:", error);
      this.showToast(`❌ Failed to add track: ${error.message}`, "error");
    }
  }
  async playPlaylist() {
    if (
      !this.currentPlaylist ||
      !this.currentPlaylist.tracks ||
      this.currentPlaylist.tracks.length === 0
    )
      return;
    // Clear queue and add all tracks from playlist
    try {
      await fetch(`/api/queue/${this.guildId}`, {
        method: "DELETE",
        headers: { "X-API-Key": this.apiKey },
      });
      for (const track of this.currentPlaylist.tracks) {
        await fetch(`/api/player/${this.guildId}/queue`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-API-Key": this.apiKey,
          },
          body: JSON.stringify(track),
        });
      }
      // Start playing
      await fetch(`/api/player/${this.guildId}/play`, {
        method: "POST",
        headers: { "X-API-Key": this.apiKey },
      });
    } catch (error) {
      console.error("Failed to play playlist:", error);
    }
  }
  async shufflePlaylist() {
    if (
      !this.currentPlaylist ||
      !this.currentPlaylist.tracks ||
      this.currentPlaylist.tracks.length === 0
    )
      return;
    // Shuffle tracks and add to queue
    const shuffledTracks = [...this.currentPlaylist.tracks].sort(
      () => Math.random() - 0.5,
    );
    try {
      await fetch(`/api/queue/${this.guildId}`, {
        method: "DELETE",
        headers: { "X-API-Key": this.apiKey },
      });
      for (const track of shuffledTracks) {
        await fetch(`/api/player/${this.guildId}/queue`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-API-Key": this.apiKey,
          },
          body: JSON.stringify(track),
        });
      }
      // Start playing
      await fetch(`/api/player/${this.guildId}/play`, {
        method: "POST",
        headers: { "X-API-Key": this.apiKey },
      });
    } catch (error) {
      console.error("Failed to shuffle playlist:", error);
    }
  }
  async playPlaylistTrack(index) {
    if (
      !this.currentPlaylist ||
      !this.currentPlaylist.tracks ||
      !this.currentPlaylist.tracks[index]
    )
      return;
    const track = this.currentPlaylist.tracks[index];
    try {
      // Add all tracks up to and including this track
      const tracksToAdd = this.currentPlaylist.tracks.slice(0, index + 1);
      await fetch(`/api/queue/${this.guildId}`, {
        method: "DELETE",
        headers: { "X-API-Key": this.apiKey },
      });
      for (const t of tracksToAdd) {
        await fetch(`/api/player/${this.guildId}/queue`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-API-Key": this.apiKey,
          },
          body: JSON.stringify(t),
        });
      }
      // Start playing
      await fetch(`/api/player/${this.guildId}/play`, {
        method: "POST",
        headers: { "X-API-Key": this.apiKey },
      });
    } catch (error) {
      console.error("Failed to play track:", error);
    }
  }
  async addPlaylistTrackToQueue(index) {
    if (
      !this.currentPlaylist ||
      !this.currentPlaylist.tracks ||
      !this.currentPlaylist.tracks[index]
    )
      return;
    const track = this.currentPlaylist.tracks[index];
    try {
      await fetch(`/api/player/${this.guildId}/queue`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": this.apiKey,
        },
        body: JSON.stringify(track),
      });
      await this.loadQueue();
    } catch (error) {
      console.error("Failed to add track to queue:", error);
    }
  }
  async removeTrackFromPlaylist(trackIdentifier) {
    if (
      !this.currentPlaylist ||
      !confirm("Remove this track from the playlist?")
    )
      return;
    try {
      const response = await fetch(
        `/api/playlists/${this.guildId}/${this.currentPlaylist.id}/tracks/${trackIdentifier}`,
        {
          method: "DELETE",
          headers: { "X-API-Key": this.apiKey },
        },
      );
      if (response.ok) {
        const data = await response.json();
        this.currentPlaylist = data.playlist || data;
        this.renderPlaylistDetails();
        await this.loadPlaylists();
      } else {
        const error = await response.json();
        alert("Failed to remove track: " + (error.error || "Unknown error"));
      }
    } catch (error) {
      console.error("Failed to remove track:", error);
    }
  }
  showPlaylistMoreOptions() {
    const options = [];
    options.push({
      label: "Edit Details",
      action: () => this.editPlaylistDetails(),
    });
    if (this.currentPlaylist?.cover_image) {
      options.push({
        label: "Remove Cover",
        action: () => this.removePlaylistCover(),
      });
    }
    options.push({
      label: "Delete Playlist",
      action: () => this.deletePlaylist(this.currentPlaylist.id),
    });
    // For now just use alert, in a full implementation this would be a dropdown
    alert("Options: Edit Details, Delete Playlist");
  }
  async editPlaylistDetails() {
    const newName = prompt("Playlist name:", this.currentPlaylist.name);
    if (newName === null) return;
    const newDescription = prompt(
      "Description:",
      this.currentPlaylist.description || "",
    );
    if (newDescription === null) return;
    try {
      const response = await fetch(
        `/api/playlists/${this.guildId}/${this.currentPlaylist.id}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "X-API-Key": this.apiKey,
          },
          body: JSON.stringify({
            name: newName,
            description: newDescription,
          }),
        },
      );
      if (response.ok) {
        const data = await response.json();
        this.currentPlaylist = data.playlist || data;
        this.renderPlaylistDetails();
        await this.loadPlaylists();
      } else {
        const error = await response.json();
        alert("Failed to update playlist: " + (error.error || "Unknown error"));
      }
    } catch (error) {
      console.error("Failed to update playlist:", error);
    }
  }
  async removePlaylistCover() {
    try {
      const response = await fetch(
        `/api/playlists/${this.guildId}/${this.currentPlaylist.id}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "X-API-Key": this.apiKey,
          },
          body: JSON.stringify({ cover_image: null }),
        },
      );
      if (response.ok) {
        const data = await response.json();
        this.currentPlaylist = data.playlist || data;
        this.renderPlaylistDetails();
      }
      if (response.ok) {
        this.currentPlaylist = await response.json();
        this.renderPlaylistDetails();
      }
    } catch (error) {
      console.error("Failed to remove cover:", error);
    }
  }
  async loadPlaylistToQueue() {
    if (!this.currentPlaylist || !this.currentPlaylist.tracks) return;
    // Add all tracks to queue
    for (const track of this.currentPlaylist.tracks) {
      try {
        await fetch(`/api/player/${this.guildId}/queue`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-API-Key": this.apiKey,
          },
          body: JSON.stringify(track),
        });
      } catch (error) {
        console.error("Failed to add track to queue:", error);
      }
    }
    await this.loadQueue();
    alert(`Added ${this.currentPlaylist.tracks.length} tracks to queue!`);
  }
  async copyPlaylistLink(playlistId) {
    const url = `${window.location.origin}/dashboard?playlist=${playlistId}`;
    try {
      await navigator.clipboard.writeText(url);
      this.showToast("🔗 Playlist link copied to clipboard!");
    } catch (err) {
      console.error("Failed to copy link:", err);
      // Fallback
      prompt("Copy this link:", url);
    }
  }
  async togglePlaylistPrivacy(playlistId, isPublic) {
    try {
      const response = await fetch(
        `/api/playlists/${this.guildId}/${playlistId}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "X-API-Key": this.apiKey,
          },
          body: JSON.stringify({ isPublic: isPublic }),
        },
      );
      if (response.ok) {
        this.showToast(isPublic ? "🔓 Playlist is now Public" : "🔒 Playlist is now Private");
        await this.loadPlaylists();
      } else {
        const error = await response.json();
        this.showToast("❌ Failed to update privacy: " + (error.error || "Unknown error"), "error");
      }
    } catch (error) {
      console.error("Error updating privacy:", error);
      this.showToast("❌ Network error", "error");
    }
  }
  async deletePlaylist(playlistId) {
    if (!confirm("Are you sure you want to delete this playlist? This cannot be undone.")) return;
    try {
      const response = await fetch(
        `/api/playlists/${this.guildId}/${playlistId}`,
        {
          method: "DELETE",
          headers: { "X-API-Key": this.apiKey },
        },
      );
      if (response.ok) {
        this.showToast("🗑️ Playlist deleted successfully");
        await this.loadPlaylists();
      } else {
        const error = await response.json();
        this.showToast("❌ Failed to delete playlist: " + (error.error || "Unknown error"), "error");
      }
    } catch (error) {
      console.error("Failed to delete playlist:", error);
      this.showToast("❌ Network error", "error");
    }
  }
  // ============ SETTINGS FUNCTIONS ============
  async loadSettings() {
    // Check if guild is selected
    if (!this.guildId) {
      console.log("No guild selected, skipping settings load");
      return;
    }
    try {
      const response = await fetch(`/api/settings/${this.guildId}`, {
        headers: { "X-API-Key": this.apiKey },
      });
      if (response.ok) {
        const settings = await response.json();
        this.renderSettings(settings);
        // Theme selector is local-only; render it whenever settings load.
        this.renderThemeSelector();
      }
    } catch (error) {
      console.error("Failed to load settings:", error);
    }
  }
  renderSettings(settings) {
    document.getElementById("prefixInput").value = settings.prefix || ".";
    document.getElementById("defaultVolumeSlider").value =
      settings.defaultVolume || 100;
    document.getElementById("defaultVolumeValue").textContent =
      (settings.defaultVolume || 100) + "%";
    // Set checkbox states and toggle classes
    const autoPlay = settings.autoPlay || false;
    document.getElementById("autoPlayCheck").checked = autoPlay;
    document
      .getElementById("autoPlayCheck")
      .closest(".toggle-label")
      .classList.toggle("checked", autoPlay);
    const leaveOnEmpty = settings.leaveOnEmpty !== false;
    document.getElementById("leaveOnEmptyCheck").checked = leaveOnEmpty;
    document
      .getElementById("leaveOnEmptyCheck")
      .closest(".toggle-label")
      .classList.toggle("checked", leaveOnEmpty);
    const stay247 = settings.stay247 || false;
    document.getElementById("stay247Check").checked = stay247;
    document
      .getElementById("stay247Check")
      .closest(".toggle-label")
      .classList.toggle("checked", stay247);
    // Show/hide 247 channel section
    this.toggle247Channels();
    // Load roles and users for all selects
    this.loadAllRoleSelects();
    this.loadAllUserSelects();
    // Render DJ roles (multi-select)
    this.renderRoleTags(
      "djRolesTags",
      settings.djRoles || [],
      "djRolesSelect",
      "djRoles",
    );
    // Render tier settings
    const tier = settings.tier || "free";
    document.querySelectorAll('input[name="tier"]').forEach((radio) => {
      radio.checked = radio.value === tier;
    });
    // Render role tags
    this.renderRoleTags(
      "allowedRolesTags",
      settings.allowedRoles || [],
      "allowedRolesSelect",
      "allowedRoles",
    );
    this.renderRoleTags(
      "vipRolesTags",
      settings.vipRoles || [],
      "vipRolesSelect",
      "vipRoles",
    );
    this.renderRoleTags(
      "premiumRolesTags",
      settings.premiumRoles || [],
      "premiumRolesSelect",
      "premiumRoles",
    );
    // Render user tags
    this.renderUserTags(
      "allowedUsersTags",
      settings.allowedUsers || [],
      "allowedUsersSelect",
      "allowedUsers",
    );
    this.renderUserTags(
      "vipUsersTags",
      settings.vipUsers || [],
      "vipUsersSelect",
      "vipUsers",
    );
    this.renderUserTags(
      "premiumUsersTags",
      settings.premiumUsers || [],
      "premiumUsersSelect",
      "premiumUsers",
    );
    // Load 24/7 channels
    this.loadGuildChannels();
    document.getElementById("247VoiceChannelSelect").value =
      settings["247VoiceChannel"] || "";
    settings["247TextChannel"] || "";
    // Add click listener to save button
    const saveBtn = document.getElementById("saveSettingsBtn");
    if (saveBtn) {
      saveBtn.onclick = () => this.saveSettings();
    }

    this.updatePremiumUI(settings.isPremium);
  }

  updatePremiumUI(isPremium) {
    // 24/7 Toggle
    const stay247Check = document.getElementById("stay247Check");
    const mode247Lock = document.getElementById("mode247Lock");

    if (stay247Check && mode247Lock) {
      const mode247Label = stay247Check.closest("label");

      if (isPremium) {
        stay247Check.disabled = false;
        // mode247Label.classList.remove("disabled"); 
        mode247Lock.classList.add("hidden");
      } else {
        stay247Check.disabled = true;
        stay247Check.checked = false;
        if (mode247Label) mode247Label.classList.remove("checked");
        // mode247Label.classList.add("disabled");
        mode247Lock.classList.remove("hidden");
      }
    }

    // Feature List in Premium Tab
    const feat247 = document.getElementById("feat-247-status");
    const featAutoplay = document.getElementById("feat-autoplay-status");

    if (isPremium) {
      if (feat247) {
        feat247.classList.remove("inactive");
        feat247.classList.add("active");
        feat247.innerHTML = "<span>✅</span> 24/7 Mode";
      }
      if (featAutoplay) {
        featAutoplay.classList.remove("inactive");
        featAutoplay.classList.add("active");
        featAutoplay.innerHTML = "<span>✅</span> Smart Autoplay";
      }
    } else {
      if (feat247) {
        feat247.classList.add("inactive");
        feat247.classList.remove("active");
        feat247.innerHTML = "<span>❌</span> 24/7 Mode";
      }
      if (featAutoplay) {
        featAutoplay.classList.add("inactive");
        featAutoplay.classList.remove("active");
        featAutoplay.innerHTML = "<span>❌</span> Smart Autoplay";
      }
    }
  }
  toggle247Channels() {
    const section = document.getElementById("247ChannelsSection");
    const isChecked = document.getElementById("stay247Check").checked;
    if (isChecked) {
      section.classList.remove("hidden");
    } else {
      section.classList.add("hidden");
    }
  }
  handleToggleClick(event, checkboxId) {
    const checkbox = document.getElementById(checkboxId);
    const label = event.currentTarget;
    if (checkbox && label) {
      checkbox.checked = !checkbox.checked;
      label.classList.toggle("checked", checkbox.checked);
      // Trigger change event for any listeners
      checkbox.dispatchEvent(new Event("change", { bubbles: true }));
      // Special handling for 247 toggle
      if (checkboxId === "stay247Check") {
        this.toggle247Channels();
      }
    }
    return true;
  }
  async loadAllUserSelects() {
    if (!this.guildId) return;
    try {
      const response = await fetch(`/api/guild/${this.guildId}/members`, {
        headers: { "X-API-Key": this.apiKey },
      });
      if (response.ok) {
        const members = await response.json();
        // Update all user select dropdowns
        const selects = [
          "allowedUsersSelect",
          "vipUsersSelect",
          "premiumUsersSelect",
        ];
        selects.forEach((selectId) => {
          const select = document.getElementById(selectId);
          if (select) {
            const currentValue = select.value;
            select.innerHTML = '<option value="">Select a user...</option>';
            members.forEach((member) => {
              const option = document.createElement("option");
              option.value = member.id;
              option.textContent = `${member.username}#${member.discriminator}`;
              if (member.avatar) {
                option.dataset.avatar = member.avatar;
              }
              select.appendChild(option);
            });
            select.value = currentValue;
          }
        });
      }
    } catch (error) {
      console.error("Failed to load members:", error);
    }
  }
  renderUserTags(containerId, users, selectId, settingsKey) {
    const container = document.getElementById(containerId);
    container.innerHTML = "";
    container.dataset.users = JSON.stringify(users);
    users.forEach((user) => {
      const tag = document.createElement("div");
      tag.className = "user-tag";
      tag.dataset.userId = user.id || user;
      const userName = user.username
        ? `${user.username}#${user.discriminator || "0"}`
        : user;
      const avatarUrl = user.avatar
        ? user.avatar
        : "https://cdn.discordapp.com/embed/avatars/0.png";
      tag.innerHTML = `
                <img src="${avatarUrl}" alt="">
                <span>${userName}</span>
                <span class="remove" onclick="dashboard.removeUser('${containerId}', '${user.id || user}')">&times;</span>
            `;
      container.appendChild(tag);
    });
  }
  addAllowedUser() {
    const select = document.getElementById("allowedUsersSelect");
    const userId = select.value;
    if (!userId) return;
    const container = document.getElementById("allowedUsersTags");
    const users = JSON.parse(container.dataset.users || "[]");
    if (!users.find((u) => (u.id || u) === userId)) {
      const userName = select.options[select.selectedIndex].text;
      const [username, discriminator] = userName.split("#");
      users.push({ id: userId, username, discriminator: discriminator || "" });
      this.renderUserTags(
        "allowedUsersTags",
        users,
        "allowedUsersSelect",
        "allowedUsers",
      );
    }
    select.value = "";
  }
  addVipUser() {
    const select = document.getElementById("vipUsersSelect");
    const userId = select.value;
    if (!userId) return;
    const container = document.getElementById("vipUsersTags");
    const users = JSON.parse(container.dataset.users || "[]");
    if (!users.find((u) => (u.id || u) === userId)) {
      const userName = select.options[select.selectedIndex].text;
      const [username, discriminator] = userName.split("#");
      users.push({ id: userId, username, discriminator: discriminator || "" });
      this.renderUserTags("vipUsersTags", users, "vipUsersSelect", "vipUsers");
    }
    select.value = "";
  }
  addPremiumUser() {
    const select = document.getElementById("premiumUsersSelect");
    const userId = select.value;
    if (!userId) return;
    const container = document.getElementById("premiumUsersTags");
    const users = JSON.parse(container.dataset.users || "[]");
    if (!users.find((u) => (u.id || u) === userId)) {
      const userName = select.options[select.selectedIndex].text;
      const [username, discriminator] = userName.split("#");
      users.push({ id: userId, username, discriminator: discriminator || "" });
      this.renderUserTags(
        "premiumUsersTags",
        users,
        "premiumUsersSelect",
        "premiumUsers",
      );
    }
    select.value = "";
  }
  removeUser(containerId, userId) {
    const container = document.getElementById(containerId);
    const users = JSON.parse(container.dataset.users || "[]");
    const filtered = users.filter((u) => (u.id || u) !== userId);
    let newSelectId = "";
    if (containerId === "allowedUsersTags") newSelectId = "allowedUsersSelect";
    else if (containerId === "vipUsersTags") newSelectId = "vipUsersSelect";
    else if (containerId === "premiumUsersTags")
      newSelectId = "premiumUsersSelect";
    this.renderUserTags(
      containerId,
      filtered,
      newSelectId,
      containerId.replace("Tags", ""),
    );
  }
  async loadAllRoleSelects() {
    try {
      const response = await fetch(`/api/guild/${this.guildId}/roles`, {
        headers: { "X-API-Key": this.apiKey },
      });
      if (response.ok) {
        const roles = await response.json();
        // Update all role select dropdowns
        const selects = [
          "djRolesSelect",
          "allowedRolesSelect",
          "vipRolesSelect",
          "premiumRolesSelect",
        ];
        selects.forEach((selectId) => {
          const select = document.getElementById(selectId);
          if (select) {
            const currentValue = select.value;
            select.innerHTML =
              '<option value="">Select a role to add...</option>';
            roles.forEach((role) => {
              const option = document.createElement("option");
              option.value = role.id;
              option.textContent = role.name;
              if (role.color && role.color !== "#000000") {
                option.style.color = role.color;
              }
              select.appendChild(option);
            });
            select.value = currentValue;
          }
        });
      }
    } catch (error) {
      console.error("Failed to load roles:", error);
    }
  }
  renderRoleTags(containerId, roles, selectId, settingsKey) {
    const container = document.getElementById(containerId);
    container.innerHTML = "";
    // Store current roles in data attribute for tracking
    container.dataset.roles = JSON.stringify(roles);
    roles.forEach((role) => {
      const tag = document.createElement("div");
      tag.className = "role-tag";
      tag.dataset.roleId = role.id || role;
      tag.innerHTML = `
                <span class="role-name">${role.name || role}</span>
                <span class="remove" onclick="dashboard.removeRole('${containerId}', '${role.id || role}')">&times;</span>
            `;
      container.appendChild(tag);
    });
  }
  addDjRole() {
    const select = document.getElementById("djRolesSelect");
    const roleId = select.value;
    if (!roleId) return;
    const container = document.getElementById("djRolesTags");
    const roles = JSON.parse(container.dataset.roles || "[]");
    if (!roles.find((r) => (r.id || r) === roleId)) {
      const roleName = select.options[select.selectedIndex].text;
      roles.push({ id: roleId, name: roleName });
      this.renderRoleTags("djRolesTags", roles, "djRolesSelect", "djRoles");
    }
    select.value = "";
  }
  addAllowedRole() {
    const select = document.getElementById("allowedRolesSelect");
    const roleId = select.value;
    if (!roleId) return;
    const container = document.getElementById("allowedRolesTags");
    const roles = JSON.parse(container.dataset.roles || "[]");
    if (!roles.find((r) => (r.id || r) === roleId)) {
      const roleName = select.options[select.selectedIndex].text;
      roles.push({ id: roleId, name: roleName });
      this.renderRoleTags(
        "allowedRolesTags",
        roles,
        "allowedRolesSelect",
        "allowedRoles",
      );
    }
    select.value = "";
  }
  addVipRole() {
    const select = document.getElementById("vipRolesSelect");
    const roleId = select.value;
    if (!roleId) return;
    const container = document.getElementById("vipRolesTags");
    const roles = JSON.parse(container.dataset.roles || "[]");
    if (!roles.find((r) => (r.id || r) === roleId)) {
      const roleName = select.options[select.selectedIndex].text;
      roles.push({ id: roleId, name: roleName });
      this.renderRoleTags("vipRolesTags", roles, "vipRolesSelect", "vipRoles");
    }
    select.value = "";
  }
  addPremiumRole() {
    const select = document.getElementById("premiumRolesSelect");
    const roleId = select.value;
    if (!roleId) return;
    const container = document.getElementById("premiumRolesTags");
    const roles = JSON.parse(container.dataset.roles || "[]");
    if (!roles.find((r) => (r.id || r) === roleId)) {
      const roleName = select.options[select.selectedIndex].text;
      roles.push({ id: roleId, name: roleName });
      this.renderRoleTags(
        "premiumRolesTags",
        roles,
        "premiumRolesSelect",
        "premiumRoles",
      );
    }
    select.value = "";
  }
  removeRole(containerId, roleId) {
    const container = document.getElementById(containerId);
    const roles = JSON.parse(container.dataset.roles || "[]");
    const filtered = roles.filter((r) => (r.id || r) !== roleId);
    this.renderRoleTags(
      containerId,
      filtered,
      containerId.replace("Tags", "Select"),
      containerId.replace("Tags", ""),
    );
  }
  updateTierDisplay() {
    // This can be used to show/hide tier-specific options if needed
    console.log("Tier changed");
  }
  async loadGuildChannels() {
    const voiceSelect = document.getElementById("247VoiceChannelSelect");
    const textSelect = document.getElementById("247TextChannelSelect");
    voiceSelect.innerHTML = '<option value="">None</option>';
    textSelect.innerHTML = '<option value="">None</option>';
    try {
      const response = await fetch(`/api/guild/${this.guildId}/channels`, {
        headers: { "X-API-Key": this.apiKey },
      });
      if (response.ok) {
        const { voiceChannels, textChannels } = await response.json();
        voiceChannels.forEach((channel) => {
          const option = document.createElement("option");
          option.value = channel.id;
          option.textContent = channel.name;
          voiceSelect.appendChild(option);
        });
        textChannels.forEach((channel) => {
          const option = document.createElement("option");
          option.value = channel.id;
          option.textContent = "#" + channel.name;
          textSelect.appendChild(option);
        });
      }
    } catch (error) {
      console.error("Failed to load channels:", error);
    }
  }
  async saveSettings() {
    // Check if guild is selected
    if (!this.guildId) {
      alert("Please select a server first");
      return;
    }
    const getRoleIds = (containerId) => {
      const container = document.getElementById(containerId);
      const roles = JSON.parse(container.dataset.roles || "[]");
      return roles.map((r) => r.id || r);
    };
    const getUserIds = (containerId) => {
      const container = document.getElementById(containerId);
      const users = JSON.parse(container.dataset.users || "[]");
      return users.map((u) => u.id || u);
    };
    const settings = {
      prefix: document.getElementById("prefixInput").value,
      defaultVolume: parseInt(
        document.getElementById("defaultVolumeSlider").value,
      ),
      djRoles: getRoleIds("djRolesTags"),
      autoPlay: document.getElementById("autoPlayCheck").checked,
      leaveOnEmpty: document.getElementById("leaveOnEmptyCheck").checked,
      stay247: document.getElementById("stay247Check").checked,
      textChannelId: document.getElementById("247TextChannelSelect").value,
      voiceChannelId: document.getElementById("247VoiceChannelSelect").value,
      tier:
        document.querySelector('input[name="tier"]:checked')?.value || "free",
      allowedRoles: getRoleIds("allowedRolesTags"),
      vipRoles: getRoleIds("vipRolesTags"),
      premiumRoles: getRoleIds("premiumRolesTags"),
      allowedUsers: getUserIds("allowedUsersTags"),
      vipUsers: getUserIds("vipUsersTags"),
      premiumUsers: getUserIds("premiumUsersTags"),
    };
    try {
      const response = await fetch(`/api/settings/${this.guildId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": this.apiKey,
        },
        body: JSON.stringify(settings),
      });
      if (response.ok) {
        this.showToast("✅ Settings saved successfully!");
      } else {
        const error = await response.json();
        this.showToast("❌ Failed to save: " + (error.error || "Unknown error"), "error");
      }
    } catch (error) {
      console.error("Failed to save settings:", error);
      this.showToast("❌ Failed to save settings: " + error.message, "error");
    }
  }
  closeModal(modalId) {
    document.getElementById(modalId).classList.add("hidden");
  }
  async apiCall(method, endpoint, body = null) {
    try {
      const options = {
        method,
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": this.apiKey,
        },
      };
      if (body) options.body = JSON.stringify(body);
      const response = await fetch(endpoint, options);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Request failed");
      }
      return await response.json();
    } catch (error) {
      console.error("API call failed:", error);
      alert(`Error: ${error.message}`);
    }
  }
  updateConnectionStatus(connected) {
    this.connectionStatus.classList.remove("hidden");
    this.connectionStatus.classList.toggle("connected", connected);
    this.connectionStatus.classList.toggle("disconnected", !connected);
    this.statusText.textContent = connected
      ? "🟢 Connected"
      : "🔴 Disconnected";
  }
  formatTime(ms) {
    if (!ms || ms < 0) return "0:00";
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
    }
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  }
  setupUserDropdown() {
    const trigger = document.getElementById("userDropdownTrigger");
    const menu = document.getElementById("userDropdownMenu");
    const container = document.getElementById("userDropdownContainer");

    if (!trigger || !menu) return;

    trigger.addEventListener("click", (e) => {
      e.stopPropagation();
      menu.classList.toggle("hidden");
      container.classList.toggle("active");
    });

    document.addEventListener("click", (e) => {
      if (!container.contains(e.target)) {
        menu.classList.add("hidden");
        container.classList.remove("active");
      }
    });

    const swatches = menu.querySelectorAll(".theme-swatch");
    swatches.forEach(swatch => {
      swatch.addEventListener("click", (e) => {
        e.stopPropagation();
        const theme = swatch.dataset.theme;
        this.applyTheme(theme);
      });
    });

    this.updateThemeSwatches(this.theme);
  }

  updateThemeSwatches(activeTheme) {
    const swatches = document.querySelectorAll(".theme-swatch");
    swatches.forEach(swatch => {
      if (swatch.dataset.theme === activeTheme) {
        swatch.classList.add("active");
      } else {
        swatch.classList.remove("active");
      }
    });
  }
  // Hydrate player + queue snapshots (HTTP) to prevent stale UI on navigation/reconnect.
  async hydrateGuildState(reason = "manual") {
    if (!this.guildId) return;
    // Avoid overlapping hydrations
    if (this.isHydrating) return;
    this.isHydrating = true;
    this.setHydratingState(true, "Syncing player...");
    try {
      await Promise.allSettled([this.loadPlayerState(), this.loadQueue()]);
    } finally {
      this.isHydrating = false;
      // We don't necessarily clear hydrating here because a socket snapshot may arrive after.
      // Clearing happens on socket 'player:state' as the authoritative snapshot.
      // Still, if socket isn't connected, clear after HTTP completes.
      if (!this.socket || !this.socket.connected) {
        this.setHydratingState(false);
      }
    }
  }
  // Simple UI loading state to avoid "empty queue" flashes and stale player display.
  setHydratingState(isHydrating, message = "Loading...") {
    this.isHydrating = Boolean(isHydrating);
    // Queue loading placeholder
    if (this.queueList) {
      if (this.isHydrating) {
        this.queueList.innerHTML = `
            <div class="loading-state">
                <div class="spinner-small"></div>
                <p>${this.escapeHtml(message)}</p>
            </div>
        `;
      } else if (!this.queue?.length) {
        // Only restore empty message if queue is truly empty
        this.queueList.innerHTML = `<p class="empty-queue">No tracks in queue</p>`;
      }
    }
    // Connection status text hint (optional)
    if (this.statusText) {
      if (this.isHydrating) {
        this.statusText.textContent = "Syncing…";
      }
    }
  }
  formatUptime(ms) {
    if (!ms) return "0s";
    const seconds = Math.floor((ms / 1000) % 60);
    const minutes = Math.floor((ms / (1000 * 60)) % 60);
    const hours = Math.floor((ms / (1000 * 60 * 60)) % 24);
    const days = Math.floor(ms / (1000 * 60 * 60 * 24));

    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (parts.length === 0) parts.push(`${seconds}s`); // Less than a minute

    return parts.join(" ");
  }
  escapeHtml(text) {
    if (!text) return "";
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }
  // ============ LOCAL THEME (Dashboard-only) ============
  applyTheme(themeName) {
    const t = themeName || "default";
    this.theme = t;
    if (t === "default") {
      delete document.documentElement.dataset.theme;
    } else {
      document.documentElement.dataset.theme = t;
    }
    try {
      localStorage.setItem(this.themeKey, t);
    } catch (e) {
      // ignore
    }
    this.updateThemeSwatches(t);
  }
  // ============ DASHBOARD EMOJI RESOLUTION ============
  // Dashboard UI should rely on Emoji Management mappings.
  // We render custom emojis as unicode fallback in UI buttons (textContent), since
  // the current UI uses textContent for icons. (If you later want full custom emoji rendering,
  // switch buttons to innerHTML and return <img> or <:name:id> accordingly.)
  getEmojiText(botName) {
    // Try mapped emoji first
    const mapped = this.emojiMap?.get(botName);
    if (mapped) {
      if (mapped.fallback) return mapped.fallback;
    }
    // Provide sensible hardcoded defaults as final fallback
    const defaults = {
      play: "▶️",
      pause: "⏸️",
      stop: "⏹️",
      skip: "⏭️",
      previous: "⏮️",
      shuffle: "🔀",
      loop: "🔁",
      loop_track: "🔂",
      volume_up: "🔊",
      volume_down: "🔉",
      volume_mute: "🔇",
      success: "✅",
      error: "❌",
      warning: "⚠️",
      info: "ℹ️",
      loading: "⏳",
      queue: "📋",
      now_playing: "🎵",
    };
    return defaults[botName] || "❓";
  }
  getEmojiHtml(botName) {
    const mapped = this.emojiMap?.get(botName);
    if (mapped && mapped.emoji_url && mapped.is_available && mapped.emoji_id) {
      const alt = mapped.discord_name || mapped.bot_name || botName;
      return `<img class="ui-emoji" src="${mapped.emoji_url}" alt="${this.escapeHtml(alt)}" />`;
    }
    return this.escapeHtml(this.getEmojiText(botName));
  }
  applyDashboardEmojis() {
    // Update icons on the dashboard immediately based on current state
    // Player controls
    if (this.playPauseBtn && this.playerState) {
      const isPlaying = this.playerState.isPlaying;
      const isPaused = this.playerState.isPaused;
      this.playPauseBtn.innerHTML =
        isPlaying && !isPaused
          ? this.getEmojiHtml("pause")
          : this.getEmojiHtml("play");
    } else if (this.playPauseBtn) {
      this.playPauseBtn.innerHTML = this.getEmojiHtml("play");
    }
    if (this.previousBtn)
      this.previousBtn.innerHTML = this.getEmojiHtml("previous");
    if (this.nextBtn) this.nextBtn.innerHTML = this.getEmojiHtml("skip");
    if (this.shuffleBtn)
      this.shuffleBtn.innerHTML = this.getEmojiHtml("shuffle");
    if (this.repeatBtn && this.playerState) {
      const repeatMode = this.playerState.repeatMode;
      const repeatKey = repeatMode === "track" ? "loop_track" : "loop";
      this.repeatBtn.innerHTML = this.getEmojiHtml(repeatKey);
    } else if (this.repeatBtn) {
      this.repeatBtn.innerHTML = this.getEmojiHtml("loop");
    }
    // Volume icon
    if (this.volumeIcon && this.volumeSlider) {
      const volume = parseInt(this.volumeSlider.value || "0", 10);
      const volKey =
        volume > 50 ? "volume_up" : volume > 0 ? "volume_down" : "volume_mute";
      this.volumeIcon.innerHTML = this.getEmojiHtml(volKey);
    }
  }
  // ============ SPOTIFY & YOUTUBE MUSIC IMPORT ============
  // Moved to consolidated submitImportPlaylist() method

  // ============ SETTINGS FUNCTIONS (CONTINUED) ============
  addDjRole() {
    this._addRole("djRolesSelect", "djRolesTags", "djRoles");
  }
  addAllowedRole() {
    this._addRole("allowedRolesSelect", "allowedRolesTags", "allowedRoles");
  }
  addVipRole() {
    this._addRole("vipRolesSelect", "vipRolesTags", "vipRoles");
  }
  addPremiumRole() {
    this._addRole("premiumRolesSelect", "premiumRolesTags", "premiumRoles");
  }
  _addRole(selectId, containerId, settingsKey) {
    const select = document.getElementById(selectId);
    if (!select) return;
    const roleId = select.value;
    if (!roleId) return;
    const container = document.getElementById(containerId);
    if (!container) return;
    const roles = JSON.parse(container.dataset.roles || "[]");
    if (!roles.find((r) => r.id === roleId)) {
      const roleName = select.options[select.selectedIndex].text;
      roles.push({ id: roleId, name: roleName });
      this.renderRoleTags(containerId, roles, selectId, settingsKey);
    }
    select.value = "";
  }
  async loadAllRoleSelects() {
    if (!this.guildId) return;
    try {
      const response = await fetch(`/api/guild/${this.guildId}/roles`, {
        headers: { "X-API-Key": this.apiKey },
      });
      if (response.ok) {
        const roles = await response.json();
        const selects = [
          "djRolesSelect",
          "allowedRolesSelect",
          "vipRolesSelect",
          "premiumRolesSelect",
        ];
        selects.forEach((selectId) => {
          const select = document.getElementById(selectId);
          if (select) {
            const currentValue = select.value;
            select.innerHTML = '<option value="">Select a role...</option>';
            roles.forEach((role) => {
              const option = document.createElement("option");
              option.value = role.id;
              option.textContent = role.name;
              option.style.color = role.color;
              select.appendChild(option);
            });
            select.value = currentValue;
          }
        });
      }
    } catch (error) {
      console.error("Failed to load roles:", error);
    }
  }
  renderRoleTags(containerId, roles, selectId, settingsKey) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.dataset.roles = JSON.stringify(roles);
    container.innerHTML = roles
      .map(
        (role) => `
            <div class="role-tag" data-id="${role.id}">
                <span class="role-name" style="${role.color ? "color: " + role.color : ""}">${this.escapeHtml(
          role.name || role.id,
        )}</span>
                <span class="remove" onclick="dashboard.removeRoleTag('${containerId}', '${role.id}')">&times;</span>
            </div>
        `,
      )
      .join("");
  }
  removeRoleTag(containerId, roleId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    let roles = JSON.parse(container.dataset.roles || "[]");
    roles = roles.filter((r) => r.id !== roleId);
    this.renderRoleTags(containerId, roles, null, null);
  }
  updateTierDisplay() {
    const tier =
      document.querySelector('input[name="tier"]:checked')?.value || "free";
    // Optional: Add visual feedback for selected tier card if needed
  }
  async saveSettings() {
    if (!this.guildId) return;
    const btn = document.getElementById("saveSettingsBtn");
    const originalText = btn.textContent;
    btn.textContent = "Saving...";
    btn.disabled = true;
    try {
      // Gather settings
      const settings = {
        prefix: document.getElementById("prefixInput").value,
        defaultVolume: parseInt(
          document.getElementById("defaultVolumeSlider").value,
        ),
        autoPlay: document.getElementById("autoPlayCheck").checked,
        leaveOnEmpty: document.getElementById("leaveOnEmptyCheck").checked,
        stay247: document.getElementById("stay247Check").checked,
        "247TextChannel": document.getElementById("247TextChannelSelect").value,
        "247VoiceChannel": document.getElementById("247VoiceChannelSelect")
          .value,
        djRoles: JSON.parse(
          document.getElementById("djRolesTags").dataset.roles || "[]",
        ),
        tier:
          document.querySelector('input[name="tier"]:checked')?.value || "free",
        allowedRoles: JSON.parse(
          document.getElementById("allowedRolesTags").dataset.roles || "[]",
        ),
        allowedUsers: JSON.parse(
          document.getElementById("allowedUsersTags").dataset.users || "[]",
        ),
        vipRoles: JSON.parse(
          document.getElementById("vipRolesTags").dataset.roles || "[]",
        ),
        vipUsers: JSON.parse(
          document.getElementById("vipUsersTags").dataset.users || "[]",
        ),
        premiumRoles: JSON.parse(
          document.getElementById("premiumRolesTags").dataset.roles || "[]",
        ),
        premiumUsers: JSON.parse(
          document.getElementById("premiumUsersTags").dataset.users || "[]",
        ),
      };
      const response = await fetch(`/api/settings/${this.guildId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": this.apiKey,
        },
        body: JSON.stringify(settings),
      });
      if (response.ok) {
        this.showToast("✅ Settings saved successfully!");
      } else {
        const error = await response.json();
        alert("Failed to save settings: " + (error.error || "Unknown error"));
      }
    } catch (error) {
      console.error("Failed to save settings:", error);
      alert("Failed to save settings: " + error.message);
    } finally {
      btn.textContent = originalText;
      btn.disabled = false;
    }
  }
  async loadGuildChannels() {
    if (!this.guildId) return;
    try {
      const response = await fetch(`/api/guild/${this.guildId}/channels`, {
        headers: { "X-API-Key": this.apiKey },
      });
      if (response.ok) {
        const data = await response.json();
        const textSelect = document.getElementById("247TextChannelSelect");
        const voiceSelect = document.getElementById("247VoiceChannelSelect");
        if (textSelect) {
          const current = textSelect.value;
          textSelect.innerHTML = '<option value="">None</option>';
          data.textChannels.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c.id;
            opt.textContent = '#' + c.name;
            textSelect.appendChild(opt);
          });
          textSelect.value = current; // Restore selection if valid
        }
        if (voiceSelect) {
          const current = voiceSelect.value;
          voiceSelect.innerHTML = '<option value="">None</option>';
          data.voiceChannels.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c.id;
            opt.textContent = '🔊 ' + c.name;
            voiceSelect.appendChild(opt);
          });
          voiceSelect.value = current;
        }
      }
    } catch (error) {
      console.error("Failed to load channels:", error);
    }
  }
  updateLivePreview() {
    // Update the live preview card with current emoji mappings
    const updateEl = (id, botName) => {
      const el = document.getElementById(id);
      if (el) {
        el.innerHTML = this.getEmojiHtml(botName);
      }
    };
    updateEl("preview-prev-btn", "previous");
    updateEl("preview-play-btn", "play");
    updateEl("preview-skip-btn", "skip");
    updateEl("preview-stop-btn", "stop");
    // Status emoji (voice channel status)
    const statusEmoji = this.getEmojiHtml("now_playing");
    const statusEl = document.getElementById("preview-status-emoji");
    if (statusEl) statusEl.innerHTML = statusEmoji;
  }
  async loadHomePageStats() {
    try {
      const response = await fetch("/api/stats");
      const data = await response.json();
      // API returns: guilds, uniqueUsers, totalPlays, players, uptime
      if (this.statServers) this.statServers.textContent = `${data.guilds || 0}+`;
      if (this.statUsers) this.statUsers.textContent = `${data.uniqueUsers || 0}+`;
      if (this.statTracks) this.statTracks.textContent = `${data.totalPlays?.toLocaleString() || '0'}+`;
    } catch (error) {
      console.error("Error loading homepage stats:", error);
    }
  }

  async loadStats() {
    if (!this.guildId) return;
    try {
      const response = await fetch(`/api/stats/${this.guildId}`, {
        headers: { "X-API-Key": this.apiKey }
      });
      if (!response.ok) return;
      const data = await response.json();

      // Update individual counters
      if (document.getElementById("totalPlays")) document.getElementById("totalPlays").textContent = data.totalPlays || 0;
      if (document.getElementById("uniqueUsers")) document.getElementById("uniqueUsers").textContent = data.uniqueUsers || 0;
      if (document.getElementById("topGenre")) document.getElementById("topGenre").textContent = data.topGenre || "N/A";
      if (document.getElementById("botUptime")) document.getElementById("botUptime").textContent = this.formatUptime(data.uptime || 0);
      if (document.getElementById("historyCount")) document.getElementById("historyCount").textContent = data.historyCount || 0;

      // Render Top Songs
      const topSongsList = document.getElementById("topSongsList");
      if (topSongsList) {
        if (!data.topSongs || data.topSongs.length === 0) {
          topSongsList.innerHTML = '<p class="empty-playlists">No data available yet.</p>';
        } else {
          topSongsList.innerHTML = data.topSongs.map((song, index) => `
            <div class="stat-item">
              <span class="stat-rank">#${index + 1}</span>
              <div class="stat-info">
                <span class="stat-title">${this.escapeHtml(song.title)}</span>
                <span class="stat-author">${this.escapeHtml(song.author)}</span>
              </div>
              <span class="stat-count">${song.playCount} plays</span>
            </div>
          `).join("");
        }
      }

      // Render Source Distribution
      const sourceDist = document.getElementById("sourceDistribution");
      if (sourceDist && data.sourceDistribution) {
        sourceDist.innerHTML = Object.entries(data.sourceDistribution)
          .filter(([_, count]) => count > 0)
          .map(([source, count]) => `
            <div class="distribution-item">
              <span class="source-name">${source}</span>
              <div class="source-bar-container">
                <div class="source-bar" style="width: ${(count / (data.totalPlays || 1) * 100).toFixed(1)}%"></div>
              </div>
              <span class="source-count">${count}</span>
            </div>
          `).join("");
      }

      // If user has admin/manage perms, load global stats too
      this.loadGlobalStats();
    } catch (error) {
      console.error("Failed to load stats:", error);
    }
  }

  async loadGlobalStats() {
    try {
      const response = await fetch(`/api/stats`, {
        headers: { "X-API-Key": this.apiKey }
      });
      if (!response.ok) return;
      const data = await response.json();

      const section = document.getElementById("globalStatsSection");
      if (section) section.classList.remove("hidden");

      if (document.getElementById("globalGuilds")) document.getElementById("globalGuilds").textContent = data.guilds || 0;
      if (document.getElementById("globalPlayers")) document.getElementById("globalPlayers").textContent = data.players || 0;
      if (document.getElementById("globalPlays")) document.getElementById("globalPlays").textContent = data.totalPlays || 0;
      if (document.getElementById("globalUsers")) document.getElementById("globalUsers").textContent = data.uniqueUsers || 0;
    } catch (error) {
      // Quietly fail global stats if it fails
    }
  }

  // ============ PLAYER PERMISSION SYSTEM ============

  // Store current session data
  currentSession = null;
  currentPermissionRequest = null;

  /**
   * Show permission request popup (for session owners)
   */
  showPermissionRequest(request) {
    this.currentPermissionRequest = request;

    // Play notification sound
    this.playNotificationSound();

    // Update modal content
    const avatarEl = document.getElementById("permRequesterAvatar");
    const nameEl = document.getElementById("permRequesterName");
    const actionEl = document.getElementById("permAction");

    if (avatarEl) {
      avatarEl.src = request.requesterAvatar || "https://cdn.discordapp.com/embed/avatars/0.png";
    }
    if (nameEl) {
      nameEl.textContent = request.requesterTag || "Unknown User";
    }
    if (actionEl) {
      actionEl.textContent = request.action || "control the player";
    }

    // Show modal
    const modal = document.getElementById("permissionRequestModal");
    if (modal) {
      modal.classList.remove("hidden");
    }

    // Setup button handlers
    const approveBtn = document.getElementById("approvePermissionBtn");
    const denyBtn = document.getElementById("denyPermissionBtn");

    if (approveBtn) {
      approveBtn.onclick = () => this.respondToPermissionRequest(true);
    }
    if (denyBtn) {
      denyBtn.onclick = () => this.respondToPermissionRequest(false);
    }

    // Auto-hide after 60 seconds
    setTimeout(() => {
      if (this.currentPermissionRequest?.id === request.id) {
        this.hidePermissionRequest();
      }
    }, 60000);
  }

  /**
   * Hide permission request modal
   */
  hidePermissionRequest() {
    const modal = document.getElementById("permissionRequestModal");
    if (modal) {
      modal.classList.add("hidden");
    }
    this.currentPermissionRequest = null;
  }

  /**
   * Handle permission response (for requesters)
   */
  handlePermissionResponse(response) {
    if (response.status === "approved") {
      this.showPermissionNotification("approved");
      this.showToast("✅ Permission granted! You can now control the player.");
    } else if (response.status === "denied") {
      this.showPermissionNotification("denied");
      this.showToast("❌ Permission denied by session owner.", "error");
    }
  }

  /**
   * Show permission notification popup
   */
  showPermissionNotification(type) {
    const notificationId = type === "approved" ? "permissionApprovedNotification" : "permissionDeniedNotification";
    const notification = document.getElementById(notificationId);

    if (notification) {
      notification.classList.remove("hidden");
      this.playNotificationSound();

      // Hide after 3 seconds
      setTimeout(() => {
        notification.classList.add("hidden");
      }, 3000);
    }
  }

  /**
   * Request permission to control player
   */
  async requestPlayerPermission(action = "control") {
    if (!this.guildId || !this.user) {
      this.showToast("⚠️ Please login and select a server first.", "error");
      return false;
    }

    try {
      const response = await fetch(`/api/player/${this.guildId}/request-permission`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": this.apiKey
        },
        body: JSON.stringify({
          userId: this.user.id,
          userTag: this.user.username || this.user.tag,
          action
        })
      });

      if (!response.ok) {
        const error = await response.json();
        this.showToast(`⚠️ ${error.error || "Failed to request permission"}`, "error");
        return false;
      }

      const data = await response.json();
      this.showToast("🔔 Permission request sent! Waiting for session owner...");
      return true;
    } catch (error) {
      console.error("Error requesting permission:", error);
      this.showToast("❌ Failed to request permission.", "error");
      return false;
    }
  }

  /**
   * Respond to a permission request (for session owners)
   */
  async respondToPermissionRequest(approved) {
    if (!this.currentPermissionRequest || !this.guildId) return;

    try {
      const response = await fetch(`/api/player/${this.guildId}/respond-permission`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": this.apiKey
        },
        body: JSON.stringify({
          requestId: this.currentPermissionRequest.id,
          approved,
          responderId: this.user.id
        })
      });

      this.hidePermissionRequest();

      if (response.ok) {
        this.showToast(approved ? "✅ Permission granted" : "❌ Permission denied");
      } else {
        const error = await response.json();
        this.showToast(`⚠️ ${error.error || "Failed to respond"}`, "error");
      }
    } catch (error) {
      console.error("Error responding to permission:", error);
      this.hidePermissionRequest();
    }
  }

  /**
   * Check if current user can control the player
   */
  async checkPlayerPermission() {
    if (!this.guildId || !this.user) return { allowed: true };

    try {
      const response = await fetch(
        `/api/player/${this.guildId}/can-control?userId=${this.user.id}`,
        { headers: { "X-API-Key": this.apiKey } }
      );

      if (!response.ok) return { allowed: false, reason: "Unable to verify permissions" };

      return await response.json();
    } catch (error) {
      console.error("Error checking permission:", error);
      return { allowed: false, reason: "Error verifying permissions" };
    }
  }

  /**
   * Load and update session owner UI
   */
  async updateSessionOwnerUI() {
    const badge = document.getElementById("sessionOwnerBadge");
    if (!badge) return;

    try {
      const response = await fetch(`/api/player/${this.guildId}/session`, {
        headers: { "X-API-Key": this.apiKey }
      });

      if (!response.ok) {
        badge.classList.add("hidden");
        return;
      }

      const { session } = await response.json();
      this.currentSession = session;

      if (session && this.user?.id === session.ownerId) {
        badge.classList.remove("hidden");
      } else {
        badge.classList.add("hidden");
      }
    } catch (error) {
      badge.classList.add("hidden");
    }
  }

  /**
   * Play notification sound
   */
  playNotificationSound() {
    try {
      const audio = document.getElementById("notificationSound");
      if (audio) {
        audio.currentTime = 0;
        audio.play().catch(() => { });
      }
    } catch (e) {
      // Ignore audio errors
    }
  }
}
document.addEventListener("DOMContentLoaded", () => {
  console.log("=== DOMContentLoaded - Creating Dashboard ===");
  try {
    window.dashboard = new MusicDashboard();
    console.log("Dashboard created successfully");
  } catch (error) {
    console.error("ERROR creating dashboard:", error);
    alert("Error creating dashboard: " + error.message);
  }
});