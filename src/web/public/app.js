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

    // Initialize visualizer
    this.visualizer = new AudioVisualizer(this.visualizerCanvas);
    if (this.visualizer) this.visualizer.updateColor(this.theme);

    // Add click handler to cycle visualizer modes
    if (this.visualizerCanvas) {
      this.visualizerCanvas.addEventListener('click', () => {
        this.cycleVisualizerMode();
      });
      this.visualizerCanvas.style.cursor = 'pointer';
      this.visualizerCanvas.title = 'Click to change visualizer mode';
    }

    // Global click listener to close suggestions
    document.addEventListener('click', (e) => {
      const container = document.getElementById('searchSuggestions');
      const input = document.getElementById('unifiedSearchInput');
      if (container && !container.classList.contains('hidden')) {
        if (!container.contains(e.target) && e.target !== input) {
          container.classList.add('hidden');
        }
      }
    });
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

    // Initialize keyboard shortcuts
    this.setupKeyboardShortcuts();

    // Load track history from localStorage
    this.loadHistoryFromStorage();
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
      search: document.getElementById("searchPage"),
      playlistDetails: document.getElementById("playlistDetailsView"),
    };
    // Debug check
    Object.entries(this.pages).forEach(([name, el]) => {
      if (!el) console.warn(`Page element not found: ${name}`);
    });
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
    this.visualizerCanvas = document.getElementById("visualizerCanvas");
    this.idlePlayerView = document.getElementById("idlePlayerView");
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
    } else {
      console.error(`Page "${pageName}" not registered in this.pages!`);
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
      this.loadLikedSongsCount(); // Update system playlists counts
    } else if (pageName === "settings" && this.guildId) {
      this.loadSettings();
    } else if (pageName === "stats" && this.guildId) {
      this.loadStats();
    } else if (pageName === "emojis" && this.guildId) {
      this.loadServerEmojis();
      this.loadEmojiMappings();
    } else if (pageName === "servers") {
      this.loadUserServers();
    } else if (pageName === "player" && this.guildId) {
      this.loadFilters();
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
  filterPlaylistsDebounced() {
    if (this.filterTimeout) clearTimeout(this.filterTimeout);
    this.filterTimeout = setTimeout(() => {
      this.filterPlaylists();
    }, 300);
  }

  filterPlaylists() {
    const query = document.getElementById("playlistsFilterInput").value.toLowerCase().trim();
    if (!query) {
      this.renderPlaylists(); // Reset to all
      return;
    }

    const filtered = this.playlists.filter(p =>
      p.name.toLowerCase().includes(query) ||
      (p.description && p.description.toLowerCase().includes(query)) ||
      (p.ownerName && p.ownerName.toLowerCase().includes(query))
    );

    this.renderPlaylists(filtered);
  }

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
      // Use the v2 endpoint
      const resp = await fetch(
        `/api/v2/playlists/${encodeURIComponent(playlistId)}`,
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
      const data = await resp.json();
      this.currentPlaylist = data.playlist || data;
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
        const hasBot = server.hasBot !== false; // Default true if undefined to be safe, but API returns it now

        // If bot is not in guild, show Invite UI
        if (!hasBot) {
          return `
            <div class="server-item server-item-invite" data-guild-id="${server.id}">
                <div class="server-icon-wrapper grayscale">
                    ${server.icon
              ? `<img src="https://cdn.discordapp.com/icons/${server.id}/${server.icon}.png?size=64" alt="${server.name}" class="server-icon">`
              : `<div class="server-icon-placeholder">${server.name.charAt(0)}</div>`
            }
                </div>
                <div class="server-meta">
                  <div class="server-meta-top">
                    <span class="server-name">${this.escapeHtml(server.name)}</span>
                  </div>
                  <div class="server-meta-bottom">
                    <span class="server-sub error-text">Bot not added</span>
                  </div>
                  <div class="server-card-actions">
                    <a href="https://discord.com/oauth2/authorize?client_id=YOUR_BOT_ID_HERE&permissions=8&scope=bot%20applications.commands" target="_blank" class="action-btn small invite-btn" onclick="event.stopPropagation()"><i class="ph ph-plus-circle"></i> Invite Bot</a>
                  </div>
                </div>
            </div>
        `;
        }

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
                    <button class="action-btn small" onclick="event.stopPropagation(); dashboard.selectServerAndGo('${server.id}', 'player')" title="Open Player"><i class="ph ph-play-circle"></i> Player</button>
                    <button class="action-btn small" onclick="event.stopPropagation(); dashboard.selectServerAndGo('${server.id}', 'queue')" title="Open Queue"><i class="ph ph-list-numbers"></i> Queue</button>
                    <button class="action-btn small" onclick="event.stopPropagation(); dashboard.selectServerAndGo('${server.id}', 'playlists')" title="Open Playlists"><i class="ph ph-music-notes"></i> Playlists</button>
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

    // Aggressive visibility fix:
    const serverSelector = document.getElementById("serverSelector");
    if (serverSelector) {
      serverSelector.classList.remove("hidden");
      serverSelector.style.display = "block";
    }
    // Hide main content explicitly if needed
    document.querySelectorAll(".page").forEach(p => {
      if (p.id !== 'serverSelector') p.classList.add("hidden");
    });

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
      btn.addEventListener("click", () => {
        if (btn.dataset.page) {
          this.showPage(btn.dataset.page);
        }
      });
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
    // Note: addToPlaylistBtn onclick is defined in HTML calling openAddToPlaylistModal()

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

      console.log("player:state received:", payload);

      // Normalize to the existing UI expectations where possible
      const normalized = {
        isPlaying: Boolean(payload?.isPlaying),
        isPaused: Boolean(payload?.isPaused),
        isConnected: Boolean(payload?.isConnected ?? (payload?.voiceChannel || payload?.currentTrack)),
        volume: payload?.volume ?? 100,
        position: payload?.position ?? 0,
        currentTrack: payload?.currentTrack || null,
        repeatMode: payload?.repeatMode || payload?.repeat || "off",
        shuffle: payload?.shuffle,
        activeFilterName: payload?.activeFilterName || null,
        queueSize: payload?.queueSize ?? 0,
        voiceChannel: payload?.voiceChannel || null,
        guildName: payload?.guildName || this.playerState?.guildName || "",
      };

      this.playerState = normalized;

      // Snapshot-based timekeeping (prevents stuck 0:00 when realtime pauses)
      this.positionAtSnapshotMs = Number(normalized.position || 0);
      this.snapshotReceivedAtMs = Date.now();

      // Queue is delivered with the snapshot
      this.queue = Array.isArray(payload?.queue) ? payload.queue : [];
      this.updateQueueUI();

      // Start/stop local ticking based on state
      if (normalized.isPlaying && !normalized.isPaused && normalized.currentTrack) {
        this.startPositionUpdates();
      } else {
        this.stopPositionUpdates();
      }

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

    // Handle 'player:state' - this is what the server actually sends via Socket.IO mapping
    this.socket.on("player:state", (evt) => {
      if (this.guildId !== intendedGuildId) return;
      this.lastRealtimeAt = Date.now();

      const payload = evt?.data || evt;
      console.log("state_update received:", payload);

      // Normalize to the existing UI expectations
      const normalized = {
        isPlaying: Boolean(payload?.isPlaying),
        isPaused: Boolean(payload?.isPaused),
        isConnected: Boolean(payload?.isConnected),
        volume: payload?.volume ?? 100,
        position: payload?.position ?? 0,
        currentTrack: payload?.currentTrack || null,
        repeatMode: payload?.repeatMode || "off",
        shuffle: payload?.shuffle,
        activeFilterName: payload?.activeFilterName || null,
        timescale: payload?.timescale || payload?.filters?.timescale || 1.0,
        queueSize: payload?.queueSize ?? 0,
        voiceChannel: payload?.voiceChannel || null,
        guildName: payload?.guildName || this.playerState?.guildName || "",
      };

      console.log(`[DEBUG] player:state Normalized Timescale: ${normalized.timescale}`);
      console.log(`[DEBUG] player:state Payload Timescale: ${payload?.timescale}`);
      console.log(`[DEBUG] player:state Payload Filters.Timescale: ${payload?.filters?.timescale}`);

      this.playerState = normalized;

      // Update snapshot-based timekeeping
      this.positionAtSnapshotMs = Number(normalized.position || 0);
      this.snapshotReceivedAtMs = Date.now();

      // Queue update if included
      if (Array.isArray(payload?.queue)) {
        this.queue = payload.queue;
        this.updateQueueUI();
      }

      // Start/stop position updates based on playing state
      if (normalized.isPlaying && !normalized.isPaused && normalized.currentTrack) {
        this.startPositionUpdates();
      } else {
        this.stopPositionUpdates();
      }

      this.updateUI();
      this.setHydratingState(false);
      this.stopPolling();
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

  /**
   * Compute the current playback position based on snapshot + elapsed time.
   * Takes timescale (speed) into account for accurate progress when filters are active.
   */
  get computedPosition() {
    // If scrubbing, return the scrub position for instant UI feedback
    if (this.isScrubbing && this.scrubDesiredPositionMs !== null) {
      return this.scrubDesiredPositionMs;
    }

    // If paused or not playing, return the static position
    if (!this.playerState?.isPlaying || this.playerState?.isPaused) {
      return this.positionAtSnapshotMs || this.playerState?.position || 0;
    }

    // Calculate elapsed time since last snapshot
    const elapsedMs = Date.now() - (this.snapshotReceivedAtMs || Date.now());

    // Get timescale (playback speed) - default to 1.0
    const timescale = this.playerState?.timescale || 1.0;

    // Apply timescale to elapsed time for accurate speed-adjusted position
    const adjustedElapsed = elapsedMs * timescale;

    // Compute current position
    const computed = (this.positionAtSnapshotMs || 0) + adjustedElapsed;

    // Clamp to track duration if available
    const duration = this.playerState?.currentTrack?.duration || Infinity;
    return Math.min(computed, duration);
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
        if (response.status === 404) {
          console.warn("No player found (404). Resetting UI.");
          this.playerState = {
            isPlaying: false,
            isPaused: false,
            isConnected: false,
            currentTrack: null,
            position: 0,
            duration: 0
          };
          this.updateUI();
        } else {
          const error = await response.json();
          console.error("Error loading player state:", error);
        }
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
      volume = 100,
      repeatMode,
      position,
      guildName,
      activeFilterName,
    } = this.playerState;
    if (currentTrack) {
      const displayTitle = currentTrack.requester?.originalTitle || currentTrack.userData?.originalTitle || currentTrack.title;
      const displayAuthor = currentTrack.requester?.originalAuthor || currentTrack.userData?.originalAuthor || currentTrack.author;

      this.trackTitle.textContent = displayTitle;
      this.trackArtist.textContent = displayAuthor;

      const artwork = this.resolveArtwork(currentTrack);
      this.albumArt.src = artwork;
      this.albumArt.classList.remove("hidden");
      this.noArtwork.classList.add("hidden");

      // Hide idle view when playing
      if (this.idlePlayerView) this.idlePlayerView.classList.add("hidden");

      // Enable ticker if playing, disable if paused
      if (isPlaying && !isPaused) {
        this.startPositionUpdates();
      } else {
        this.stopPositionUpdates();
      }
    } else {
      this.trackTitle.textContent = "Not Playing";
      this.trackArtist.textContent = "-";
      this.albumArt.src = "";
      this.albumArt.classList.add("hidden");
      this.noArtwork.classList.remove("hidden");
      this.progressFill.style.width = "0%";
      this.currentTime.textContent = "0:00";
      this.totalTime.textContent = "0:00";
      this.stopPositionUpdates();

      // Show idle view when not playing
      if (this.idlePlayerView) this.idlePlayerView.classList.remove("hidden");
    }
    this.guildName.textContent = guildName || "";
    // Use mapped emojis for controls (render custom emojis as <img> when available)
    this.playPauseBtn.innerHTML =
      isPlaying && !isPaused
        ? this.getEmojiHtml("pause")
        : this.getEmojiHtml("play");

    // Update visualizer state
    if (this.visualizer) {
      this.visualizer.setState(isPlaying && !isPaused);
    }
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
      const isConnected = this.playerState.isConnected === true;
      const displayTitle = currentTrack ? (currentTrack.requester?.originalTitle || currentTrack.userData?.originalTitle || currentTrack.title) : "Music";
      let newText = "";

      if (isConnected && currentTrack) {
        this.connectionStatus.classList.remove("error", "disconnected");
        this.connectionStatus.classList.add("success", "connected");

        if (isPlaying && !isPaused) {
          newText = `🟢 Playing: ${displayTitle}`;
        } else if (isPaused) {
          newText = "🟠 Paused";
        } else {
          newText = "🟢 Ready to play";
        }
      } else if (isConnected) {
        this.connectionStatus.classList.remove("error", "disconnected");
        this.connectionStatus.classList.add("success", "connected");
        newText = "🟢 Ready to play";
      } else {
        this.connectionStatus.classList.add("disconnected");
        this.connectionStatus.classList.remove("connected", "success");
        newText = "🔴 Disconnected / Idle";
        this.trackTitle.textContent = "Not Playing";
        this.trackArtist.textContent = "";
        this.albumArt.classList.add("hidden");
        this.noArtwork.classList.remove("hidden");
        this.stopPositionUpdates();
      }

      if (this.statusText.textContent !== newText) {
        this.statusText.classList.add("status-updating");
        setTimeout(() => {
          this.statusText.textContent = newText;
          this.statusText.classList.remove("status-updating");
        }, 300);
      }
    }
    this.updateProgress();
    this.updateSleepTimerUI();

    // Update visualizer state based on playback
    if (this.visualizer) {
      this.visualizer.setState(isPlaying && !isPaused);
    }

    // Update like button state when track changes
    if (currentTrack && this._lastTrackIdForLike !== (currentTrack.identifier || currentTrack.uri)) {
      this._lastTrackIdForLike = currentTrack.identifier || currentTrack.uri;
      this.updateLikeButtonState();

      // Add to track history when track changes
      this.addToHistory(currentTrack);
    }

    // Update filter UI if active filter changed and we're on player page
    if (this.currentPage === "player" && this.lastRenderedFilterName !== activeFilterName) {
      if (this.renderFilters(this.availableFilters, this.activeFilters, activeFilterName)) {
        this.lastRenderedFilterName = activeFilterName;
      }
    }
  }
  // --- Local Position Ticker (for smooth UI) ---
  startPositionUpdates() {
    if (this.positionUpdateInterval) return;
    // Update progress bar every 200ms for smooth movement
    this.positionUpdateInterval = setInterval(() => {
      this.updateProgress();
    }, 200);
  }

  stopPositionUpdates() {
    if (this.positionUpdateInterval) {
      clearInterval(this.positionUpdateInterval);
      this.positionUpdateInterval = null;
    }
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
        this.lyricsContent.innerHTML = `<i class="ph ph-x-circle"></i> ${data.error}`;
      } else {
        this.lyricsTitle.textContent = `${data.title} - ${data.artist}`;
        this.lyricsContent.textContent = data.text || data.lyrics || "No lyrics content found.";
      }
    } catch (err) {
      this.lyricsContent.innerHTML = '<i class="ph ph-x-circle"></i> Failed to load lyrics.';
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
        this.showToast(`Translated to ${this.lyricsLangSelect.options[this.lyricsLangSelect.selectedIndex].text}`);
      } else if (data.error) {
        this.showToast(`Translation error: ${data.error}`, "error");
      }
    } catch (err) {
      console.error("Translation failed:", err);
      this.showToast("Failed to translate lyrics.", "error");
    } finally {
      this.translateLyricsBtn.disabled = false;
      this.translateLyricsBtn.innerHTML = '<i class="ph ph-globe"></i> Translate';
    }
  }
  closeModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.classList.add("hidden");
  }

  formatTime(ms) {
    if (!ms || isNaN(ms) || ms < 0) return "0:00";
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const hours = Math.floor(minutes / 60);
    const displayMinutes = minutes % 60;

    if (hours > 0) {
      return `${hours}:${displayMinutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
    }
    return `${displayMinutes}:${seconds.toString().padStart(2, "0")}`;
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
    let position = Number(this.computedPosition || 0);
    if (!isStream && duration > 0) {
      // Clamp position to sane range
      position = Math.max(0, Math.min(position, duration));
      const timescale = this.playerState?.timescale || 1.0;
      // For the progress bar width, we compare "virtual" position vs original duration
      // (because computedPosition returns the position within the source file).
      const progress = (position / duration) * 100;
      this.progressFill.style.width = `${progress}%`;

      // For the text display, the user wants "real time", so we adjust by the speed.
      // e.g. Nightcore (1.5x) -> Track finishes faster -> Show shorter duration.
      this.currentTime.textContent = this.formatTime(position / timescale);
      this.totalTime.textContent = this.formatTime(duration / timescale);

      // Add visual speed indicator if speed is not 1.0
      const speedIndicator = document.getElementById("speedIndicator");
      if (Math.abs(timescale - 1.0) > 0.01) {
        if (!speedIndicator) {
          const span = document.createElement("span");
          span.id = "speedIndicator";
          span.className = "text-xs text-muted ml-1";
          this.totalTime.parentNode.appendChild(span);
          span.textContent = `(${timescale.toFixed(2)}x)`;
        } else {
          speedIndicator.textContent = `(${timescale.toFixed(2)}x)`;
          speedIndicator.classList.remove("hidden");
        }
      } else if (speedIndicator) {
        speedIndicator.classList.add("hidden");
      }
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
        (track, index) => {
          const artwork = this.resolveArtwork(track);
          return `
            <div class="queue-item" data-index="${index}" draggable="true">
                <span class="queue-item-drag-handle" title="Drag to reorder"><i class="ph ph-dots-six-vertical"></i></span>
                ${artwork
              ? `<img src="${artwork}" alt="${this.escapeHtml(track.title)}" class="queue-item-artwork">`
              : '<div class="queue-item-artwork-placeholder"><i class="ph ph-music-note"></i></div>'
            }
                <div class="queue-item-info">
                    <div class="queue-item-title">${this.escapeHtml(track.requester?.originalTitle || track.userData?.originalTitle || track.title)}</div>
                    <div class="queue-item-artist">${this.escapeHtml(track.requester?.originalAuthor || track.userData?.originalAuthor || track.author || "Unknown")}</div>
                </div>
                <div class="queue-item-duration">${this.formatTime(track.duration)}</div>
                <button class="queue-item-remove" data-index="${index}" title="Remove from queue"><i class="ph ph-x"></i></button>
            </div>
        `;
        }
      )
      .join("");

    // Setup remove buttons
    this.queueList.querySelectorAll(".queue-item-remove").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.removeFromQueue(parseInt(btn.dataset.index));
      });
    });

    // Setup drag and drop
    this.setupQueueDragAndDrop();
  }

  setupQueueDragAndDrop() {
    const queueItems = this.queueList.querySelectorAll('.queue-item[draggable="true"]');
    let draggedItem = null;
    let draggedIndex = -1;

    queueItems.forEach((item) => {
      item.addEventListener('dragstart', (e) => {
        draggedItem = item;
        draggedIndex = parseInt(item.dataset.index);
        item.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', draggedIndex);
      });

      item.addEventListener('dragend', () => {
        item.classList.remove('dragging');
        queueItems.forEach(i => {
          i.classList.remove('drag-over');
          i.classList.remove('drag-over-bottom');
        });
        draggedItem = null;
        draggedIndex = -1;
      });

      item.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (!draggedItem || draggedItem === item) return;

        const rect = item.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;

        queueItems.forEach(i => {
          i.classList.remove('drag-over');
          i.classList.remove('drag-over-bottom');
        });

        if (e.clientY < midY) {
          item.classList.add('drag-over');
        } else {
          item.classList.add('drag-over-bottom');
        }
      });

      item.addEventListener('dragleave', () => {
        item.classList.remove('drag-over');
        item.classList.remove('drag-over-bottom');
      });

      item.addEventListener('drop', async (e) => {
        e.preventDefault();
        if (!draggedItem || draggedItem === item) return;

        const fromIndex = draggedIndex;
        let toIndex = parseInt(item.dataset.index);

        const rect = item.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        if (e.clientY > midY && toIndex < this.queue.length - 1) {
          toIndex++;
        }

        // Adjust for the removal of the dragged item
        if (fromIndex < toIndex) {
          toIndex--;
        }

        if (fromIndex !== toIndex) {
          await this.moveQueueTrack(fromIndex, toIndex);
        }

        queueItems.forEach(i => {
          i.classList.remove('drag-over');
          i.classList.remove('drag-over-bottom');
        });
      });
    });
  }

  async moveQueueTrack(from, to) {
    if (!await this.ensurePermission("reorder queue")) return;

    try {
      const response = await this.apiCall("POST", `/api/queue/${this.guildId}/move`, { from, to });
      if (response && response.success) {
        this.showToast("Track moved");
      }
    } catch (error) {
      console.error("Error moving track:", error);
      this.showToast("Failed to move track", "error");
    }
    await this.loadQueue();
  }

  async shuffleQueue() {
    if (!await this.ensurePermission("shuffle queue")) return;
    await this.apiCall("POST", `/api/queue/${this.guildId}/shuffle`);
    this.showToast("🔀 Queue shuffled");
    await this.loadQueue();
  }

  async clearQueue() {
    if (!await this.ensurePermission("clear queue")) return;

    this.showConfirmModal("Clear Queue", "Are you sure you want to clear the entire queue?", async () => {
      await this.apiCall("DELETE", `/api/queue/${this.guildId}`);
      this.showToast("🗑️ Queue cleared");
      await this.loadQueue();
    });
  }

  async saveQueueToPlaylist() {
    if (!this.queue || this.queue.length === 0) {
      this.showToast("❌ Queue is empty", "error");
      return;
    }

    const playlistName = prompt("Enter a name for your new playlist:", `My Queue - ${new Date().toLocaleDateString()}`);
    if (!playlistName || !playlistName.trim()) {
      return;
    }

    // Get user ID
    const userId = this.getUserId();
    if (!userId) {
      this.showToast("❌ Please log in to create playlists", "error");
      return;
    }

    try {
      this.showToast("💾 Creating playlist from queue...");

      // Use v2 API to import queue directly
      const response = await fetch(`/api/v2/playlists/import/queue`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": this.apiKey
        },
        body: JSON.stringify({
          guildId: this.guildId,
          name: playlistName.trim(),
          localUserId: userId
        })
      });

      if (response.ok) {
        const data = await response.json();
        this.showToast(`✅ Playlist "${playlistName}" created with ${data.imported || 0} tracks!`, "success");

        // Refresh playlists if on playlists page
        if (this.currentPage === "playlists") {
          await this.loadPlaylists();
        }
      } else {
        const error = await response.json();
        this.showToast(`❌ ${error.error || "Failed to create playlist"}`, "error");
      }
    } catch (error) {
      console.error("Error saving queue to playlist:", error);
      this.showToast("❌ Failed to save queue", "error");
    }
  }
  async shuffleQueue() {
    if (!await this.ensurePermission("shuffle queue")) return;
    await this.apiCall("POST", `/api/queue/${this.guildId}/shuffle`);
    await this.loadQueue();
  }
  async clearQueue() {
    if (!await this.ensurePermission("clear queue")) return;
    await this.apiCall("DELETE", `/api/queue/${this.guildId}`);
    await this.loadQueue();
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
      // Write computed position back so updateProgress uses it consistently.
      this.playerState.position = this.computedPosition;
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
    return server ? (server.owner === true || server.isAdmin === true) : false;
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

    // Show custom modal
    this.showConfirmModal(
      "Permission Required",
      `This session is owned by ${ownerName}. Do you want to request permission to control the player?`,
      () => {
        this.requestPlayerPermission(action);
      }
    );
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
    if (!this.guildId) {
      this.showToast('Please select a server first', 'error');
      return;
    }
    if (!await this.ensurePermission("change loop mode")) return;
    const modes = ["off", "track", "queue"];
    // Map 'none' to 'off' for compatibility
    let currentMode = this.playerState?.repeatMode || "off";
    if (currentMode === "none") currentMode = "off";

    const currentIndex = modes.indexOf(currentMode);
    // Safety check if mode is unknown
    const baseIndex = currentIndex === -1 ? 0 : currentIndex;
    const nextMode = modes[(baseIndex + 1) % modes.length];

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

      let data;
      const contentType = response.headers.get("content-type");
      if (contentType && contentType.indexOf("application/json") !== -1) {
        data = await response.json();
      } else {
        const text = await response.text();
        // If not OK, use text as error message; otherwise we can't parse success data
        if (!response.ok) {
          throw new Error(text || `Request failed: ${response.status}`);
        }
        // If OK but not JSON, just return empty object or text
        return { success: true, message: text };
      }

      if (!response.ok) {
        throw new Error(data.error || `Request failed: ${response.status}`);
      }
      return data;
    } catch (error) {
      console.error("API Call failed:", error);
      this.showToast("❌ " + error.message);
      throw error;
    }
  }
  async startRadio(station) {
    if (!this.guildId) return alert("Please select a server first");

    let url = "";
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

    if (station === "personalized") {
      if (!this.trackHistory || this.trackHistory.length === 0) {
        this.showToast("📻 Play some songs first to unlock your personalized mix!", "info");
        return;
      }

      // Find most frequent artist in history
      const artists = this.trackHistory
        .map(t => t.author)
        .filter(a => a && a !== "Unknown");

      if (artists.length === 0) {
        this.showToast("📻 Not enough history for a personalized mix yet.", "info");
        return;
      }

      const frequency = {};
      let maxFreq = 0;
      let topArtist = "";

      artists.forEach(a => {
        frequency[a] = (frequency[a] || 0) + 1;
        if (frequency[a] > maxFreq) {
          maxFreq = frequency[a];
          topArtist = a;
        }
      });

      this.showToast(`📻 Crafting a mix based on your love for ${topArtist}...`);

      // Use new Radio API
      await this.playRadio('artist', topArtist);
      return;
    } else {
      // url = stations[station]; // Legacy URL approach
      // Use new Radio API "mixed" which falls back to random if no seed, 
      // OR we can implement specific genre radios in the backend later.
      // For now, let's map these simple stations to 'mixed' with a seed if possible
      // or just treat them as play queries if they are URLs.

      url = stations[station];

      if (url) {
        // If it's a direct URL, just play it using standard play endpoint
        await this.apiCall("POST", `/api/player/${this.guildId}/play`, {
          query: url,
          source: 'ytsearch'
        });
        this.showPage("player");
        this.showToast(`📻 Starting ${station} radio...`);
        return;
      }
    }

    if (!url) return;
    url = stations[station];
    // Legacy fallback if code reaches here (shouldn't for handled cases)
    if (url) {
      await this.apiCall("POST", `/api/player/${this.guildId}/play`, {
        query: url
      });
      this.showPage("player");
      this.showToast(`📻 Starting ${station} radio...`);
    }
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
    if (!botName) return "❓";
    // 1. Try direct map (usually for custom Discord emojis)
    const mapped = this.emojiMap?.get(botName);
    if (mapped && mapped.emoji_url && mapped.emoji_id) {
      const alt = mapped.discord_name || mapped.bot_name || botName;
      return `<img class="ui-emoji" src="${mapped.emoji_url}" alt="${this.escapeHtml(alt)}" />`;
    }
    // 2. Try array find (backup)
    const found = this.emojiMappings?.find(m => (m.bot_name || m.botName) === botName);
    if (found && (found.emoji_url || found.emojiUrl)) {
      return `<img class="ui-emoji" src="${found.emoji_url || found.emojiUrl}" alt="${botName}" />`;
    }
    // 3. Fallback to text emoji
    return this.escapeHtml(this.getEmojiText(botName));
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
          `Sync complete! ${result.synced} mapped, ${result.skipped} skipped.`,
        );
        this.closeSyncPreview();
        await this.loadEmojiMappings();
        await this.loadServerEmojis();
      } else {
        const error = await response.json();
        this.showToast(`Sync failed: ${error.error || "Unknown error"}`, "error");
      }
    } catch (error) {
      console.error("Error syncing emojis:", error);
      this.showToast("Error syncing emojis: " + error.message, "error");
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
        this.showToast("Server emojis synced!");
        await this.loadServerEmojis();
      } else {
        const err = await response.json();
        this.showToast((err.error || "Sync failed"), "error");
      }
    } catch (e) {
      console.error(e);
      this.showToast("Network error", "error");
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
  // ============ PLAYLIST FUNCTIONS (v2.0) ============

  getUserId() {
    return localStorage.getItem("dashboard_user_id") || this.user?.id || this.user?.userId || this.user?._id;
  }

  async loadPlaylists() {
    // Cancel previous fetch
    if (this.playlistsAbortController) {
      this.playlistsAbortController.abort();
    }
    this.playlistsAbortController = new AbortController();
    const signal = this.playlistsAbortController.signal;

    const container = document.getElementById("playlistsList");
    // Show loading if we don't have playlists cached or switch implies it?
    // We'll show a loading spinner only if we don't have data, effectively.
    if (!this.playlists || this.playlists.length === 0) {
      container.innerHTML = `
            <div class="loading-state">
                <div class="spinner-small"></div>
                <p>Loading playlists...</p>
            </div>
        `;
    }

    // Get userId
    let userId = localStorage.getItem("dashboard_user_id");
    if (!userId) {
      userId = this.user?.id || this.user?.discordId || this.user?.userId || this.user?._id;
    }
    // Fallback if user object isn't fully ready but we have auth
    if (!userId && this.user) userId = this.user.id;

    console.log("loadPlaylists v2 - userId:", userId);

    try {
      // Use v2 API endpoint with includePublic=true
      const url = `/api/v2/playlists?userId=${encodeURIComponent(String(userId || ''))}&guildId=${this.guildId}&includePublic=true`;
      console.log("Fetching playlists from:", url);

      const response = await fetch(url, {
        headers: { "X-API-Key": this.apiKey },
        signal
      });

      if (response.ok) {
        const data = await response.json();
        console.log("Loaded playlists v2:", data);
        // v2 API returns { success: true, playlists: [...], count: n }
        this.playlists = data.playlists || data || [];
        this.renderPlaylists();
      } else {
        const error = await response.json();
        console.error("Error loading playlists:", error);
        container.innerHTML = `<p class="error">Failed to load playlists: ${error.error || "Unknown error"}</p>`;
      }
    } catch (error) {
      if (error.name === 'AbortError') return;
      console.error("Failed to load playlists:", error);
      container.innerHTML = '<p class="error">Failed to load playlists</p>';
    } finally {
      if (this.playlistsAbortController && this.playlistsAbortController.signal === signal) {
        this.playlistsAbortController = null;
      }
    }
  }

  renderPlaylists() {
    const container = document.getElementById("playlistsList");
    if (!container) return;

    const userId = this.getUserId();
    const tab = this.playlistTab || 'my';

    let filtered = [];
    if (!this.playlists) this.playlists = [];

    if (tab === 'my') {
      filtered = this.playlists.filter(p => String(p.user_id) === String(userId));
    } else {
      // Public playlists: Include ALL public playlists (mine + others)
      filtered = this.playlists.filter(p => (p.is_public === 1 || p.is_public === true));
    }

    if (filtered.length === 0) {
      container.innerHTML = `
            <div class="empty-state">
                <span class="empty-icon">🎵</span>
                <p>${tab === 'my' ? "You have no playlists." : "No public playlists found."}</p>
                ${tab === 'my' ? `<button onclick="dashboard.openCreatePlaylistModal()" class="action-btn small">Create New Playlist</button>` : ''}
            </div>
        `;
      return;
    }

    let html = filtered.map(p => {
      let coverHtml = '';
      if (p.cover_url) {
        coverHtml = `<img src="${p.cover_url}" class="playlist-card-img" alt="${this.escapeHtml(p.name)}">`;
      } else if (p.collageArtworks && p.collageArtworks.length > 0) {
        const imgs = p.collageArtworks.slice(0, 4).map(src => `<img src="${src}">`).join('');
        coverHtml = `<div class="playlist-card-collage c-${Math.min(p.collageArtworks.length, 4)}">${imgs}</div>`;
      } else {
        coverHtml = `<div class="playlist-card-placeholder">♪</div>`;
      }

      return `
            <div class="playlist-card" onclick="dashboard.openPlaylist('${p.id}')">
                <div class="playlist-card-cover">
                    ${coverHtml}
                    <div class="playlist-card-overlay">
                        <button class="action-btn small play-btn" onclick="event.stopPropagation(); dashboard.playPlaylist(false, '${p.id}')">▶</button>
                    </div>
                </div>
                <div class="playlist-card-info">
                    <div class="playlist-card-title" title="${this.escapeHtml(p.name)}">${this.escapeHtml(p.name)}</div>
                    <div class="playlist-card-meta">${p.track_count || 0} tracks • ${p.ownerName || 'Unknown'}</div>
                </div>
            </div>
        `;
    }).join("");

    if (tab === 'my') {
      const createCard = `
        <div class="playlist-card create-new" onclick="dashboard.openCreatePlaylistModal()">
            <div class="playlist-card-cover">
                <div class="playlist-card-placeholder create-icon">
                    <i class="ph ph-plus-circle"></i>
                </div>
            </div>
            <div class="playlist-card-info">
                <div class="playlist-card-title">Create New</div>
                <div class="playlist-card-meta">Start a fresh mix</div>
            </div>
        </div>
      `;
      html = createCard + html;
    }

    container.innerHTML = html;
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
    const userId = this.getUserId();
    if (!userId) {
      this.showToast("❌ Please log in to create playlists", "error");
      this.closeModal("createPlaylistModal");
      return;
    }

    const confirmBtn = document.getElementById("createPlaylistConfirmBtn");
    const originalText = confirmBtn.textContent;
    confirmBtn.textContent = "Creating...";
    confirmBtn.disabled = true;

    try {
      // Use v2 API endpoint
      const response = await fetch(`/api/v2/playlists`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": this.apiKey,
        },
        body: JSON.stringify({
          name,
          description,
          isPublic,
          guildId: this.guildId,
          localUserId: userId
        }),
      });

      if (response.ok) {
        const data = await response.json();
        this.closeModal("createPlaylistModal");
        this.showToast("✅ Playlist created successfully!");
        await this.loadPlaylists();
      } else {
        const error = await response.json();
        this.showToast(`${error.error || "Failed to create playlist"}`, "error");
      }
    } catch (error) {
      console.error("Failed to create playlist:", error);
      this.showToast("Network error while creating playlist", "error");
    } finally {
      confirmBtn.textContent = originalText;
      confirmBtn.disabled = false;
    }
  }

  async submitImportPlaylist() {
    const url = document.getElementById("importPlaylistUrl").value.trim();
    if (!url) {
      this.showToast("Please enter a playlist URL", "error");
      return;
    }

    const confirmBtn = document.getElementById("createPlaylistConfirmBtn");
    const originalText = confirmBtn.textContent;
    confirmBtn.textContent = "Importing...";
    confirmBtn.disabled = true;

    try {
      // Determine import type and use v2 endpoints
      let endpoint;
      let bodyData = { url, guildId: this.guildId, localUserId: this.getUserId() };

      if (url.includes("youtube.com") || url.includes("youtu.be")) {
        endpoint = `/api/v2/playlists/import/youtube`;
      } else if (url.includes("spotify.com")) {
        endpoint = `/api/v2/playlists/import/spotify`;
      } else {
        // Try YouTube as default for unknown links
        endpoint = `/api/v2/playlists/import/youtube`;
      }

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": this.apiKey,
        },
        body: JSON.stringify(bodyData),
      });

      if (response.ok) {
        const data = await response.json();
        this.closeModal("createPlaylistModal");
        this.showToast(`Imported ${data.imported || 0} of ${data.total || 0} tracks!`);
        await this.loadPlaylists();
      } else {
        const error = await response.json();
        this.showToast(`${error.error || "Failed to import playlist"}`, "error");
      }
    } catch (error) {
      console.error("Import failed:", error);
      this.showToast("Import failed: " + error.message, "error");
    } finally {
      confirmBtn.textContent = originalText;
      confirmBtn.disabled = false;
    }
  }
  async openAddToPlaylistModal(track = null) {
    const currentTrack = this.playerState?.currentTrack;

    // If no track passed and no current track, or current track is empty/invalid
    if (!track && (!currentTrack || !currentTrack.title)) {
      this.showToast("Nothing is playing", "error");
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
      const userId = this.getUserId();
      const query = userId ? `?userId=${encodeURIComponent(userId)}` : "";

      // Use v2 API endpoint
      const response = await fetch(`/api/v2/playlists/${playlistId}${query}`, {
        headers: { "X-API-Key": this.apiKey },
      });

      if (response.ok) {
        const data = await response.json();
        // v2 returns { success: true, playlist: {...} }
        this.currentPlaylist = data.playlist || data;
        this.showPlaylistDetails();
      } else {
        const error = await response.json();
        this.showToast(`❌ ${error.error || "Failed to load playlist"}`, "error");
      }
    } catch (error) {
      console.error("Failed to load playlist:", error);
      this.showToast("❌ Failed to load playlist: " + error.message, "error");
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
    return this.formatTime(ms);
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

  async openPlaylist(id) {
    if (!id) return;
    try {
      // DEBUG: Alert start
      // alert("Opening playlist: " + id);

      // Fetch fresh details with tracks
      const userId = this.getUserId();
      const query = userId ? `?userId=${encodeURIComponent(userId)}` : "";
      const response = await fetch(`/api/v2/playlists/${id}${query}`, {
        headers: { "X-API-Key": this.apiKey }
      });

      if (response.ok) {
        const data = await response.json();
        // alert("Playlist data loaded");
        this.currentPlaylist = data.playlist || data;

        // Ensure tracks are populated
        if (!this.currentPlaylist.tracks) this.currentPlaylist.tracks = [];

        this.renderPlaylistDetails();

        // alert("Playlist rendered, showing page...");
        this.showPage("playlistDetails");

        // Force check visibility
        const page = document.getElementById("playlistDetailsView");
        if (page && page.classList.contains("hidden")) {
          // alert("Page still hidden! Forcing remove hidden.");
          page.classList.remove("hidden");
        }
      } else {
        const error = await response.json();
        this.showToast(`❌ ${error.error || "Failed to load playlist"}`, "error");
        // alert("Failed: " + (error.error || "Unknown"));
      }
    } catch (error) {
      console.error("Failed to open playlist:", error);
      // alert("Error opening playlist: " + error.message);
    }
  }

  /**
   * Open a system playlist (liked, recent, top, discover)
   */
  async openSystemPlaylist(type) {
    const userId = this.getUserId();
    if (!userId) {
      this.showToast("Please log in to view history", "error");
      return;
    }

    const systemId = `system_${type}_${userId}`;
    this.showToast(`Loading your ${type} tracks...`, "info");
    await this.openPlaylist(systemId);
  }

  /**
   * Start a radio session
   */
  async playRadio(type, seed = null) {
    if (!this.guildId) {
      this.showToast("Please select a server first", "error");
      return;
    }

    if (type === 'artist' && (!seed || seed.trim() === '')) {
      this.showToast("Please enter an artist name", "error");
      return;
    }

    try {
      this.showToast(`📻 Starting ${type} radio...`, "info");
      const response = await fetch(`/api/radio/play`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": this.apiKey,
        },
        body: JSON.stringify({
          type,
          seed,
          guildId: this.guildId
        }),
      });

      if (response.ok) {
        const text = await response.text();
        let data;
        try {
          data = JSON.parse(text);
        } catch (e) {
          throw new Error(`Server Error: ${text.substring(0, 50)}...`);
        }

        if (data.success) {
          this.showToast(`✅ Radio started! Playing ${data.trackCount} tracks.`, "success");
          this.showPage("player"); // Added this line back from original logic
          // Update stats or view if needed
        } else {
          this.showToast(`❌ ${data.error || "Failed to start radio"}`, "error");
        }
      } else {
        const error = await response.json();
        this.showToast(`❌ ${error.error || "Failed to start radio"}`, "error");
      }
    } catch (error) {
      console.error("Error playing radio:", error);
      this.showToast("❌ Connection error", "error");
    }
  }



  async playPlaylist(shuffle = false, playlistId = null, startIndex = 0) {
    // If playlistId is provided, use it. Otherwise use currentPlaylist.id
    const targetId = playlistId || this.currentPlaylist?.id;
    if (!targetId || !this.guildId) return;

    // Debounce: Prevent double-clicks from causing race conditions
    const now = Date.now();
    const lastPlayTime = this._lastPlaylistPlayTime || 0;
    if (now - lastPlayTime < 3000) {
      console.log('playPlaylist debounced - too soon after last call');
      return;
    }
    this._lastPlaylistPlayTime = now;

    // Fix: Removed blocking confirm() dialog which caused 'Duplicate Queue' bug
    // by defaulting to 'false' (append) when blocked.
    // Standard behavior for "Play" is to Replace Queue.
    const clearQueue = true;

    console.log(`playPlaylist called: id=${targetId}, shuffle=${shuffle}, startIndex=${startIndex}, clearQueue=${clearQueue}`);

    try {
      this.showToast("🎵 Loading playlist...", "success");
      const response = await fetch(`/api/v2/playlists/${targetId}/play`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": this.apiKey,
        },
        body: JSON.stringify({
          guildId: this.guildId,
          shuffle,
          startIndex,
          clearQueue,
          localUserId: this.getUserId()
        }),
      });

      if (response.ok) {
        const data = await response.json();
        this.showPage("player");
        // Update player info immediately if needed
        this.showToast(`🎶 Playing ${data.tracksQueued || 0} tracks from "${data.playlist?.name || 'playlist'}"${shuffle ? ' (shuffled)' : ''}`);
      } else {
        const error = await response.json();
        this.showToast(`❌ ${error.error || "Failed to play playlist"}`, "error");
        // Reset debounce on error so user can retry
        this._lastPlaylistPlayTime = 0;
      }
    } catch (error) {
      console.error("Error playing playlist:", error);
      this.showToast("❌ Error playing playlist: " + error.message, "error");
      // Reset debounce on error so user can retry
      this._lastPlaylistPlayTime = 0;
    }
  }

  shufflePlaylist() {
    this.playPlaylist(true);
  }

  // Drag and Drop State
  draggedTrackIndex = null;

  handleTrackDragStart(e) {
    const item = e.target.closest('.playlist-track-item');
    if (!item) return;

    this.draggedTrackIndex = parseInt(item.dataset.index);
    item.classList.add('dragging');
    e.dataTransfer.setData('text/plain', this.draggedTrackIndex);
    e.dataTransfer.effectAllowed = 'move';
  }

  handleTrackDragOver(e) {
    e.preventDefault();
    const item = e.target.closest('.playlist-track-item');
    if (!item) return;

    item.classList.add('drag-over');
    e.dataTransfer.dropEffect = 'move';
  }

  handleTrackDragLeave(e) {
    const item = e.target.closest('.playlist-track-item');
    if (item) {
      item.classList.remove('drag-over');
    }
  }

  async handleTrackDrop(e) {
    e.preventDefault();
    const item = e.target.closest('.playlist-track-item');
    document.querySelectorAll('.playlist-track-item').forEach(el => {
      el.classList.remove('dragging', 'drag-over');
    });

    if (!item || !this.currentPlaylist || this.draggedTrackIndex === null) return;

    const toIndex = parseInt(item.dataset.index);
    const fromIndex = this.draggedTrackIndex;

    if (fromIndex === toIndex) return;

    await this.reorderPlaylistTracks(fromIndex, toIndex);
    this.draggedTrackIndex = null;
  }

  async reorderPlaylistTracks(fromIndex, toIndex) {
    if (!this.currentPlaylist || !this.guildId) return;

    try {
      // Use v2 API endpoint
      const response = await fetch(`/api/v2/playlists/${this.currentPlaylist.id}/tracks/reorder`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": this.apiKey
        },
        body: JSON.stringify({ from: fromIndex, to: toIndex, localUserId: this.getUserId() })
      });

      if (response.ok) {
        const data = await response.json();
        this.currentPlaylist = data.playlist || data;
        this.renderPlaylistDetails();
        this.showToast("✅ Track order updated");
      } else {
        const error = await response.json();
        this.showToast(`❌ ${error.error || "Failed to reorder track"}`, "error");
      }
    } catch (error) {
      console.error("Failed to reorder tracks:", error);
      this.showToast("❌ Connection error", "error");
    }
  }

  async addTrackToQueue(identifier, mode = "queue") {
    try {
      const response = await fetch(`/api/player/${this.guildId}/play`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": this.apiKey,
        },
        body: JSON.stringify({
          query: identifier,
          mode: mode,
          userId: this.getUserId(),
        }),
      });

      if (response.ok) {
        this.showToast(mode === "queue" ? "✅ Added to queue" : "🚀 Playing now");
        return true;
      } else {
        const error = await response.json();

        // If player not found (404), our backend now tries to auto-create it if possible, 
        // but if that fails or it's a legacy version, we handle it here.
        if (response.status === 404 || error.error?.includes("No player found")) {
          console.log("No player found, attempting to start one...");
          const startResponse = await fetch(`/api/play/${this.guildId}`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-API-Key": this.apiKey,
            },
            body: JSON.stringify({
              query: identifier,
              userId: this.getUserId()
            }),
          });

          if (startResponse.ok) {
            this.showToast("✅ Started player and added track");
            return true;
          } else {
            const startError = await startResponse.json();
            this.showToast(`❌ ${startError.error || "Failed to start player"}`, "error");
            return false;
          }
        }

        this.showToast(`❌ ${error.error || "Failed to add to queue"}`, "error");
        return false;
      }
    } catch (error) {
      console.error("Error adding to queue:", error);
      this.showToast("❌ Connection error", "error");
      return false;
    }
  }
  showToast(message, type = "success") {
    // Strip common emoji prefixes for clean icon-only display
    const emojiPatterns = [
      /^[✅❌⚠️🔒🔓🔗🎶📻🗑️💾🚀🎵🎉🎤⏩⏪]+ ?/,
      /^[✔️❗❓🟢🟠🔴⚡💥🔥🌟⭐📋📎🔔💡🎧🎹🎸🎺🎷🎼🎤🎬🎬]+ ?/
    ];

    let cleanMessage = message;
    for (const pattern of emojiPatterns) {
      cleanMessage = cleanMessage.replace(pattern, '');
    }

    // Determine icon based on type
    const iconMap = {
      success: '<i class="ph ph-check-circle"></i>',
      error: '<i class="ph ph-x-circle"></i>',
      warning: '<i class="ph ph-warning"></i>',
      info: '<i class="ph ph-info"></i>'
    };

    console.log("Toast:", cleanMessage, type);

    const toast = document.createElement("div");
    toast.className = `toast-notification ${type}`;
    toast.innerHTML = `${iconMap[type] || iconMap.info} <span>${this.escapeHtml(cleanMessage)}</span>`;

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
    return this.formatTime(ms);
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
    try {
      if (!this.currentPlaylist) return;
      const p = this.currentPlaylist;
      // const isOwner = p.userId === (this.user?.id || localStorage.getItem("dashboard_user_id"));
      // Update Header Info
      const titleEl = document.getElementById("playlistTitle");
      if (titleEl) titleEl.textContent = p.name;
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
      // Cover/Collage Image
      const coverContainer = document.getElementById("playlistCover");
      if (coverContainer) {
        if (p.cover_url) {
          coverContainer.innerHTML = `<img src="${p.cover_url}" class="playlist-cover-img" alt="Playlist Cover">`;
          coverContainer.classList.remove('collage');
        } else if (p.collageArtworks && p.collageArtworks.length > 0) {
          let collageHtml = '';
          const count = p.collageArtworks.length;
          if (count >= 4) {
            collageHtml = p.collageArtworks.slice(0, 4).map(url => `<img src="${url}" alt="Track Art">`).join('');
            coverContainer.classList.add('collage-4');
            coverContainer.classList.remove('collage-2', 'collage-1');
          } else if (count >= 2) {
            collageHtml = p.collageArtworks.slice(0, 2).map(url => `<img src="${url}" alt="Track Art">`).join('');
            coverContainer.classList.add('collage-2');
            coverContainer.classList.remove('collage-4', 'collage-1');
          } else {
            collageHtml = `<img src="${p.collageArtworks[0]}" alt="Track Art">`;
            coverContainer.classList.add('collage-1');
            coverContainer.classList.remove('collage-4', 'collage-2');
          }
          coverContainer.innerHTML = collageHtml;
          coverContainer.classList.add('collage');
        } else {
          coverContainer.innerHTML = `<span class="playlist-cover-placeholder">♪</span>`;
          coverContainer.classList.remove('collage', 'collage-4', 'collage-2', 'collage-1');
        }
      }
      // Controls
      const playBtn = document.getElementById("playlistPlayBtn");
      if (playBtn) playBtn.onclick = () => this.playPlaylist(false);
      const shuffleBtn = document.getElementById("playlistShuffleBtn");
      if (shuffleBtn) shuffleBtn.onclick = () => this.shufflePlaylist();
      // Tracks List
      const list = document.getElementById("playlistTracksList");
      if (list) {
        list.innerHTML = "";
        if (!p.tracks || p.tracks.length === 0) {
          list.innerHTML = `
          <div class="empty-playlist">
            <span class="empty-icon">🎵</span>
            <p>This playlist is empty</p>
            <button class="action-btn" onclick="document.getElementById('playlistSearchInput').focus()">Add some tracks below</button>
          </div>
        `;
        } else {
          p.tracks.forEach((track, index) => {
            const div = document.createElement("div");
            div.className = "playlist-track-item";
            div.draggable = true;
            div.dataset.index = index;

            // Drag events
            div.ondragstart = (e) => this.handleTrackDragStart(e);
            div.ondragover = (e) => this.handleTrackDragOver(e);
            div.ondragleave = (e) => this.handleTrackDragLeave(e);
            div.ondrop = (e) => this.handleTrackDrop(e);

            const artwork = this.resolveArtwork(track);

            div.innerHTML = `
                    <div class="track-col-num">
                        <span class="track-num">${index + 1}</span>
                        <div class="track-play-hover" onclick="dashboard.playPlaylistTrack(${index})">▶</div>
                    </div>
                    <div class="track-col-title">
                        <div class="track-main-info">
                            <div class="track-artwork">
                                <img src="${artwork}" alt="Art" onerror="this.src='https://placehold.co/40x40/2d2d2d/fff.png?text=♪'">
                            </div>
                            <div class="track-text-info">
                                <span class="track-title-text">${this.escapeHtml(track.info?.title || track.title || "Unknown")}</span>
                                <span class="track-artist-text">${this.escapeHtml(track.info?.author || track.author || "Unknown")}</span>
                            </div>
                        </div>
                    </div>
                    <div class="track-col-album">
                        <span class="track-album-text">${this.escapeHtml(track.info?.sourceName || track.sourceName || "-")}</span>
                    </div>
                    <div class="track-col-duration">
                        <span class="track-duration-text">${this.formatDuration(track.info?.length || 0)}</span>
                    </div>
                    <div class="track-col-actions">
                        <div class="track-actions">
                            <button class="track-more-btn" onclick="event.stopPropagation(); dashboard.showTrackMoreOptions(${index}, event)" title="More options">
                                <i class="ph ph-dots-three-vertical"></i>
                            </button>
                        </div>
                    </div>
                `;
            list.appendChild(div);
          });
        }
      }

      // Render collaborators section for owner
      this.renderCollaboratorsSection();
    } catch (err) {
      console.error("Error rendering playlist details:", err);
    }
  }
  searchTracksForPlaylistDebounced() {
    if (this.plSearchTimeout) clearTimeout(this.plSearchTimeout);
    const query = document.getElementById("playlistSearchInput").value.trim();

    if (!query) {
      const resultsContainer = document.getElementById("playlistSearchResults");
      if (resultsContainer) {
        resultsContainer.innerHTML = '';
        resultsContainer.classList.add("hidden");
      }
      return;
    }

    this.plSearchTimeout = setTimeout(() => {
      this.searchTracksForPlaylist();
    }, 500);
  }

  async searchTracksForPlaylist() {
    const query = document.getElementById("playlistSearchInput").value.trim();
    const source = document.getElementById("playlistSearchSource").value || "all";
    const type = "track";

    if (!query) return;

    const resultsContainer = document.getElementById("playlistSearchResults");
    if (resultsContainer) {
      resultsContainer.classList.remove("hidden");
      resultsContainer.innerHTML = '<div class="loading-state"><div class="spinner-small"></div><p>Searching...</p></div>';
    }

    try {
      const response = await fetch(
        `/api/search?query=${encodeURIComponent(query)}&source=${source}&type=${type}`,
        {
          headers: { "X-API-Key": this.apiKey },
        },
      );
      if (response.ok) {
        const data = await response.json();
        const results = data.results || data.tracks || [];

        resultsContainer.innerHTML = '';

        if (results.length === 0) {
          resultsContainer.innerHTML = '<p class="empty-playlists">No results found. Try a different search.</p>';
          return;
        }

        // Use the same card-based grid as main search
        const grid = document.createElement('div');
        grid.className = 'results-grid';
        resultsContainer.appendChild(grid);

        results.forEach(track => {
          const card = document.createElement('div');
          card.className = 'search-card';
          card.dataset.track = JSON.stringify(track);

          const artwork = this.resolveArtwork(track);
          const imgId = `pl-search-img-${Math.random().toString(36).substr(2, 9)}`;

          // Spotify Cover Logic
          const isSpotifyResult = (track.source === 'spotify' || track.source === 'spsearch' || (track.uri && track.uri.includes('spotify')));
          if (isSpotifyResult && artwork.includes('placehold.co') && track.uri) {
            let spotifyUrl = track.uri;
            if (spotifyUrl.startsWith('spotify:')) {
              const parts = spotifyUrl.split(':');
              if (parts.length >= 3) {
                spotifyUrl = `https://open.spotify.com/${parts[1]}/${parts[2]}`;
              }
            }
            fetch(`/api/utils/spotify-cover?url=${encodeURIComponent(spotifyUrl)}`)
              .then(r => r.json())
              .then(d => {
                if (d.thumbnail_url) {
                  const img = document.getElementById(imgId);
                  if (img) img.src = d.thumbnail_url;
                }
              }).catch(() => { });
          }

          // YouTube Cover Logic - extract video ID and use YouTube thumbnail
          const isYouTubeResult = (track.source === 'youtube' || track.source === 'ytsearch' || (track.uri && (track.uri.includes('youtube.com') || track.uri.includes('youtu.be'))));
          if (isYouTubeResult && artwork.includes('placehold.co') && track.uri) {
            let videoId = null;
            try {
              const url = new URL(track.uri);
              if (url.hostname.includes('youtu.be')) {
                videoId = url.pathname.slice(1);
              } else if (url.searchParams.has('v')) {
                videoId = url.searchParams.get('v');
              }
            } catch (e) {
              // Try regex fallback
              const match = track.uri.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
              if (match) videoId = match[1];
            }
            if (videoId) {
              // Use YouTube's thumbnail API
              setTimeout(() => {
                const img = document.getElementById(imgId);
                if (img && img.src.includes('placehold.co')) {
                  img.src = `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
                }
              }, 100);
            }
          }

          const title = track.title || 'Unknown Title';
          const author = track.author || 'Unknown Artist';
          const duration = this.formatDuration(track.duration || track.length || 0);

          card.innerHTML = `
            <div class="search-card-image-wrapper">
              <img id="${imgId}" src="${artwork}" class="search-card-image" loading="lazy" 
                   onerror="this.src='https://placehold.co/200x200/2d2d2d/fff.png?text=♪'" alt="${this.escapeHtml(title)}">
              <div class="search-card-overlay">
                <button class="search-card-action add-to-playlist-btn" title="Add to Playlist">+</button>
              </div>
              <div class="search-source-badge">${track.source || 'unknown'}</div>
            </div>
            <div class="search-card-content">
              <div class="search-card-title" title="${this.escapeHtml(title)}">${this.escapeHtml(title)}</div>
              <div class="search-card-artist" title="${this.escapeHtml(author)}">${this.escapeHtml(author)} • ${duration}</div>
            </div>
          `;

          // Add click listener to the add button
          const addBtn = card.querySelector('.add-to-playlist-btn');
          addBtn.onclick = (e) => {
            e.stopPropagation();
            this.addSearchResultToPlaylist(addBtn);
          };

          grid.appendChild(card);
        });

      } else {
        const error = await response.json();
        resultsContainer.innerHTML = `<p class="error-text">Search failed: ${error.error || "Unknown error"}</p>`;
      }
    } catch (error) {
      console.error("Search error:", error);
      resultsContainer.innerHTML = `<p class="error-text">Search failed: ${error.message}</p>`;
    }
  }

  addSearchResultToPlaylist(button) {
    // Support both old list-style and new card-style search results
    const trackItem = button.closest(".search-card") || button.closest(".search-result-item");
    if (!trackItem || !trackItem.dataset.track) {
      this.showToast("⚠️ Could not find track data", "error");
      return;
    }
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
      // Use v2 API endpoint
      const response = await fetch(`/api/v2/playlists/${playlistId}/tracks`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": this.apiKey,
        },
        body: JSON.stringify({ track, localUserId: this.getUserId() }),
      });

      if (response.ok) {
        const data = await response.json();
        console.log("addTrackToPlaylist response:", data);

        if (data.addedCount === 0) {
          this.showToast(data.message || "Track already in playlist", "warning");
        } else {
          this.showToast("✅ Track added to playlist");
        }

        // Re-fetch the playlist to get complete data with artwork
        try {
          const playlistResponse = await fetch(`/api/v2/playlists/${playlistId}?userId=${this.getUserId()}`, {
            headers: { "X-API-Key": this.apiKey }
          });
          if (playlistResponse.ok) {
            const fetchedData = await playlistResponse.json();
            console.log("Re-fetched playlist - raw response:", JSON.stringify(fetchedData, null, 2));

            // Extract the actual playlist object from various possible formats
            let extractedPlaylist = null;

            if (fetchedData.playlist && typeof fetchedData.playlist === 'object') {
              extractedPlaylist = fetchedData.playlist;
              console.log("Extracted from fetchedData.playlist");
            } else if (fetchedData.id && fetchedData.tracks) {
              extractedPlaylist = fetchedData;
              console.log("fetchedData is the playlist itself");
            } else if (fetchedData.success && fetchedData.playlist) {
              extractedPlaylist = fetchedData.playlist;
              console.log("Extracted from success response");
            } else {
              console.warn("Unexpected response format, using as-is:", fetchedData);
              extractedPlaylist = fetchedData;
            }

            this.currentPlaylist = extractedPlaylist;
          } else {
            console.log("Re-fetch failed, using data.playlist");
            this.currentPlaylist = data.playlist || data;
          }
        } catch (e) {
          console.error("Re-fetch error:", e);
          this.currentPlaylist = data.playlist || data;
        }

        // Ensure tracks array exists - final safety check
        if (!this.currentPlaylist.tracks && this.currentPlaylist.playlist?.tracks) {
          console.log("Current playlist was wrapper, extracting inner playlist");
          this.currentPlaylist = this.currentPlaylist.playlist;
        }

        if (!this.currentPlaylist.tracks) {
          console.warn("Playlist still has no tracks array, setting empty");
          this.currentPlaylist.tracks = [];
        }

        console.log("Final currentPlaylist id:", this.currentPlaylist.id);
        console.log("Final currentPlaylist name:", this.currentPlaylist.name);
        console.log("Final tracks count:", this.currentPlaylist.tracks?.length || 0);
        this.renderPlaylistDetails();
        // Don't hide search results - let user add more tracks
      } else {
        const error = await response.json();
        this.showToast(`❌ Failed to add track: ${error.error || "Unknown error"}`, "error");
      }
    } catch (error) {
      console.error("Failed to add track:", error);
      this.showToast(`❌ Failed to add track: ${error.message}`, "error");
    }
  }
  // Legacy duplicates removed to fix player issues
  // playPlaylist and shufflePlaylist are already defined above using V2 API
  // Selected track for modal
  selectedPlayTrackIndex = null;

  playPlaylistTrack(index) {
    if (!this.currentPlaylist || !this.currentPlaylist.tracks) return;
    const track = this.currentPlaylist.tracks[index];
    if (!track) return;

    this.selectedPlayTrackIndex = index;

    // Update Modal Info
    const title = track.info?.title || track.title || "Unknown Track";
    document.getElementById('playOptionsTrackTitle').textContent = title;

    this.showModal('playOptionsModal');
  }

  async confirmPlayNow() {
    this.closeModal('playOptionsModal');
    if (this.selectedPlayTrackIndex === null) return;

    // Play NOW matches the old generic Play behavior: Replace Queue
    // Play NOW: Play single track (Replace Queue)
    const track = this.currentPlaylist.tracks[this.selectedPlayTrackIndex];
    if (!track) return;

    console.log(`Playing now (Single): ${track.info?.title}`);
    const identifier = track.uri || track.info?.uri || track.url || track.identifier;

    if (identifier) {
      // Send 'play' mode to force queue replacement
      await this.addTrackToQueue(identifier, "play");
    }
    this.showPage("player");
  }

  // Search Debounce
  searchTimeout = null;
  searchTracksForPlaylistDebounced() {
    if (this.searchTimeout) clearTimeout(this.searchTimeout);
    const input = document.getElementById("playlistSearchInput");
    const query = input.value.trim();

    if (!query) {
      document.getElementById("playlistSearchResults").classList.add("hidden");
      document.getElementById("playlistSearchResults").innerHTML = "";
      document.getElementById("playlistTracksList").classList.remove("hidden");
      return;
    }

    document.getElementById("playlistTracksList").classList.add("hidden");

    this.searchTimeout = setTimeout(() => {
      this.searchTracksForPlaylist();
    }, 500);
  }

  playlistTab = 'my'; // 'my' or 'public'

  switchPlaylistViewTab(tab) {
    this.playlistTab = tab;
    // Update active tab UI 
    document.querySelectorAll('.playlist-tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(`pl-tab-${tab}`)?.classList.add('active');

    this.renderPlaylists();
  }

  async confirmPlayNext() {
    this.closeModal('playOptionsModal');
    if (this.selectedPlayTrackIndex === null) return;

    const track = this.currentPlaylist.tracks[this.selectedPlayTrackIndex];
    if (!track) return;

    const identifier = track.uri || track.info?.uri || track.url || track.identifier;
    if (identifier) {
      await this.addTrackToQueue(identifier, "next");
    }
  }

  async confirmAddToQueue() {
    this.closeModal('playOptionsModal');
    if (this.selectedPlayTrackIndex === null) return;

    const track = this.currentPlaylist.tracks[this.selectedPlayTrackIndex];
    if (!track) return;

    const identifier = track.uri || track.info?.uri || track.url || track.identifier;
    if (identifier) {
      await this.addTrackToQueue(identifier, "queue");
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
    const identifier = track.uri || track.info?.uri || track.url || track.identifier;

    if (identifier) {
      await this.addTrackToQueue(identifier);
    } else {
      this.showToast("❌ Could not resolve track identifier", "error");
    }
  }

  createPlaylistCard(p) {
    // Logic extracted for reuse
    let coverHtml = '';
    if (p.cover_url) {
      coverHtml = `< img src = "${p.cover_url}" alt = "${this.escapeHtml(p.name)}" > `;
    } else if (p.collageArtworks && p.collageArtworks.length > 0) {
      const count = p.collageArtworks.length;
      let collageImgs = '';
      let collageClass = 'collage-1';
      if (count >= 4) {
        collageImgs = p.collageArtworks.slice(0, 4).map(url => `< img src = "${url}" > `).join('');
        collageClass = 'collage-4';
      } else if (count >= 2) {
        collageImgs = p.collageArtworks.slice(0, 2).map(url => `< img src = "${url}" > `).join('');
        collageClass = 'collage-2';
      } else {
        collageImgs = `< img src = "${p.collageArtworks[0]}" > `;
        collageClass = 'collage-1';
      }
      coverHtml = `< div class="playlist-cover-collage ${collageClass}" > ${collageImgs}</div > `;
    } else {
      coverHtml = `< span class="playlist-cover-placeholder" >♪</span > `;
    }

    return `
  < div class="playlist-card" onclick = "dashboard.openPlaylist('${p.id}')" >
            <div class="playlist-cover ${!p.cover_url && (!p.collageArtworks || p.collageArtworks.length === 0) ? 'placeholder' : ''}">
                ${coverHtml}
            </div>
            <div class="playlist-info">
                <div class="playlist-name">${this.escapeHtml(p.name)}</div>
                <div class="playlist-meta">
                    <span>${p.track_count} tracks</span>
                    <span class="dot">•</span>
                    <span>${p.ownerName || 'Unknown'}</span>
                </div>
                ${p.is_public ? '<span class="playlist-badge public">Public</span>' : '<span class="playlist-badge private">Private</span>'}
            </div>
        </div >
  `;
  }


  async removeTrackFromPlaylist(index) {
    console.error("!!! removeTrackFromPlaylist CALLED with index:", index);
    if (!this.currentPlaylist) {
      this.showToast("❌ No playlist selected", "error");
      return;
    }

    // Removed blocking confirm() to fix browser popup blocker issues
    // if (!confirm("Are you sure you want to remove this track from the playlist?")) return;

    try {
      const userId = this.getUserId();
      if (!userId) {
        this.showToast("❌ Not logged in", "error");
        return;
      }

      const position = index + 1;
      const url = `/api/v2/playlists/${this.currentPlaylist.id}/tracks/position/${position}?userId=${encodeURIComponent(userId)}`;

      console.log("Removing track at position:", position, "from playlist:", this.currentPlaylist.id);

      const response = await fetch(url, {
        method: "DELETE",
        headers: { "X-API-Key": this.apiKey },
      });

      if (response.ok) {
        const data = await response.json();
        console.log("Remove track response:", data);
        this.currentPlaylist = data.playlist || data;
        this.renderPlaylistDetails();
        this.showToast("✅ Track removed from playlist");
        await this.loadPlaylists();
      } else {
        const error = await response.json();
        console.error("Remove track error:", error);
        this.showToast(`❌ ${error.error || "Failed to remove track"} `, "error");
      }
    } catch (error) {
      console.error("Failed to remove track:", error);
      this.showToast("❌ Failed to remove track", "error");
    }
  }
  showPlaylistMoreOptions() {
    console.log("showPlaylistMoreOptions called");

    // Remove existing context menu if any
    const existing = document.querySelector('.context-menu-overlay');
    if (existing) existing.remove();

    if (!this.currentPlaylist || !this.currentPlaylist.id) {
      this.showToast("❌ No playlist selected", "error");
      return;
    }

    const btn = document.getElementById("playlistMoreBtn");
    if (!btn) return;

    const rect = btn.getBoundingClientRect();

    const overlay = document.createElement('div');
    overlay.className = 'context-menu-overlay';
    overlay.style.zIndex = "10000"; // Ensure it's on top
    overlay.onclick = () => overlay.remove();

    const menu = document.createElement('div');
    menu.className = 'context-menu';

    // Improved positioning logic
    const top = rect.bottom + 8;
    const right = window.innerWidth - rect.right;

    menu.style.top = `${top}px`;
    menu.style.right = `${right}px`;
    menu.style.position = "fixed"; // Use fixed to match viewport coords of rect
    menu.style.zIndex = "10001";

    const isPublic = !!(this.currentPlaylist.is_public || this.currentPlaylist.isPublic);

    const options = [
      {
        label: "Edit Details",
        action: () => this.editPlaylistDetails(),
        icon: "pencil-simple"
      },
      {
        label: isPublic ? "Make Private" : "Make Public",
        action: () => this.togglePlaylistPrivacy(this.currentPlaylist.id, !isPublic),
        icon: isPublic ? "lock" : "globe"
      }
    ];

    if (this.currentPlaylist.cover_image || this.currentPlaylist.cover_url) {
      options.push({
        label: "Remove Cover",
        action: () => this.removePlaylistCover(),
        icon: "image-break"
      });
    }

    options.push({
      label: "Delete Playlist",
      action: () => this.deletePlaylist(this.currentPlaylist.id),
      danger: true,
      icon: "trash"
    });

    options.forEach(opt => {
      const item = document.createElement('div');
      item.className = `context-menu-item ${opt.danger ? 'danger' : ''}`;
      // Use Phosphor icons if possible, otherwise fallback to emoji
      const iconHtml = opt.icon.includes('-') || opt.icon.length > 2
        ? `<i class="ph ph-${opt.icon}"></i>`
        : `<span>${opt.icon}</span>`;

      item.innerHTML = `${iconHtml} ${opt.label}`;
      item.onclick = (e) => {
        e.stopPropagation();
        opt.action();
        overlay.remove();
      };
      menu.appendChild(item);
    });

    overlay.appendChild(menu);
    document.body.appendChild(overlay);
  }

  showTrackMoreOptions(index, event) {
    if (!this.currentPlaylist || !this.currentPlaylist.tracks || !this.currentPlaylist.tracks[index]) return;

    const track = this.currentPlaylist.tracks[index];
    const rect = event.currentTarget.getBoundingClientRect();

    // Remove existing
    const existing = document.querySelector('.context-menu-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.className = 'context-menu-overlay';
    overlay.style.zIndex = "10000";
    overlay.onclick = () => overlay.remove();

    const menu = document.createElement('div');
    menu.className = 'context-menu';

    const top = rect.bottom + 8;
    const right = window.innerWidth - rect.right;

    menu.style.top = `${top}px`;
    menu.style.right = `${right}px`;
    menu.style.position = "fixed";
    menu.style.zIndex = "10001";

    const options = [
      {
        label: "Add to Queue",
        action: () => this.addPlaylistTrackToQueue(index),
        icon: "plus-circle"
      },
      {
        label: "Play Next",
        action: () => this.playNext(track),
        icon: "skip-forward-circle"
      },
      {
        label: "Remove from Playlist",
        action: () => this.removeTrackFromPlaylist(index),
        danger: true,
        icon: "x-circle"
      }
    ];

    options.forEach(opt => {
      const item = document.createElement('div');
      item.className = `context-menu-item ${opt.danger ? 'danger' : ''}`;
      const iconHtml = `<i class="ph ph-${opt.icon}"></i>`;
      item.innerHTML = `${iconHtml} ${opt.label}`;
      item.onclick = (e) => {
        e.stopPropagation();
        opt.action();
        overlay.remove();
      };
      menu.appendChild(item);
    });

    overlay.appendChild(menu);
    document.body.appendChild(overlay);
  }

  async playNext(track) {
    const identifier = track.uri || track.info?.uri || track.url || track.identifier;
    if (identifier) {
      await this.addTrackToQueue(identifier, "next");
    }
  }


  async removePlaylistCover() {
    try {
      // Use v2 API endpoint
      const response = await fetch(`/ api / v2 / playlists / ${this.currentPlaylist.id} `, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": this.apiKey,
        },
        // Use coverUrl for v2
        body: JSON.stringify({ coverUrl: null, localUserId: this.getUserId() }),
      });

      if (response.ok) {
        const data = await response.json();
        this.currentPlaylist = data.playlist || data;
        this.renderPlaylistDetails();
      } else {
        const error = await response.json();
        this.showToast(`❌ Failed to remove cover: ${error.error || "Unknown error"} `, "error");
      }
    } catch (error) {
      console.error("Failed to remove cover:", error);
      this.showToast("❌ Network error", "error");
    }
  }
  async loadPlaylistToQueue() {
    if (!this.currentPlaylist || !this.currentPlaylist.tracks || this.currentPlaylist.tracks.length === 0) return;

    // Show a loading indicator if possible, or just log
    console.log(`Adding ${this.currentPlaylist.tracks.length} tracks to queue in bulk...`);

    try {
      // Use bulk add for performance
      const response = await fetch(`/api/player/${this.guildId}/queue`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": this.apiKey,
        },
        body: JSON.stringify(this.currentPlaylist.tracks),
      });

      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

      await this.loadQueue();

      // Auto-start if nothing is playing
      if (!this.currentState || !this.currentState.playing) {
        // POST to /play without body will resume or start first track from queue
        await fetch(`/api/player/${this.guildId}/play`, {
          method: "POST",
          headers: {
            "X-API-Key": this.apiKey,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({}) // Empty body to trigger "resume or start" logic
        }).catch(() => { });
      }

      alert(`Added ${this.currentPlaylist.tracks.length} tracks to queue!`);
    } catch (error) {
      console.error("Failed to bulk add tracks to queue:", error);
      alert("Failed to add tracks to queue. Check console for details.");
    }
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
  // --- Playlist Actions (Edit / Delete) ---

  // --- Modal Helpers ---
  showModal(id) {
    const modal = document.getElementById(id);
    if (modal) {
      modal.classList.remove('hidden');
    }
  }

  closeModal(id) {
    const modal = document.getElementById(id);
    if (modal) {
      modal.classList.add('hidden');
    }
  }

  showInputModal(title, label, defaultValue, onConfirm) {
    document.getElementById('genericInputTitle').textContent = title;
    document.getElementById('genericInputLabel').textContent = label;
    const input = document.getElementById('genericInputValue');
    input.value = defaultValue || "";

    const btn = document.getElementById('genericInputConfirmBtn');
    // Remove old listeners
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);

    newBtn.onclick = () => {
      const val = input.value.trim();
      if (val) {
        this.closeModal('genericInputModal');
        onConfirm(val);
      } else {
        this.showToast("Value cannot be empty", "error");
      }
    };
    // Enter key support
    input.onkeydown = (e) => {
      if (e.key === 'Enter') newBtn.click();
    };

    this.showModal('genericInputModal');
    input.focus();
  }

  showConfirmModal(title, text, onConfirm) {
    document.getElementById('genericConfirmTitle').textContent = title;
    document.getElementById('genericConfirmText').textContent = text;

    const btn = document.getElementById('genericConfirmBtn');
    // Remove old listeners
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);

    newBtn.onclick = () => {
      this.closeModal('genericConfirmModal');
      onConfirm();
    };

    this.showModal('genericConfirmModal');
  }

  editPlaylistDetails() {
    console.log("editPlaylistDetails called for:", this.currentPlaylist?.id);
    if (!this.currentPlaylist) return;

    // Check if modal exists
    const modal = document.getElementById('editPlaylistModal');
    const inputName = document.getElementById('editPlaylistName');
    const inputDesc = document.getElementById('editPlaylistDescription');

    if (!modal || !inputName) {
      console.error("Edit Modal elements not found!");
      return;
    }

    // Populate and show modal
    console.log("Populating edit modal");
    inputName.value = this.currentPlaylist.name || "";
    if (inputDesc) {
      inputDesc.value = this.currentPlaylist.description || "";
    }

    this.showModal('editPlaylistModal');
    inputName.focus();
  }

  async savePlaylistDetails() {
    console.log("savePlaylistDetails called");
    const inputName = document.getElementById('editPlaylistName');
    const inputDesc = document.getElementById('editPlaylistDescription');

    if (!inputName || !this.currentPlaylist) return;

    const newName = inputName.value.trim();
    const newDesc = inputDesc ? inputDesc.value.trim() : (this.currentPlaylist.description || "");

    console.log(`Saving details: name="${newName}", desc="${newDesc}"`);

    if (!newName) {
      this.showToast("Name cannot be empty", "error");
      return;
    }

    this.closeModal('editPlaylistModal');

    // Always update if name OR description changed
    if (newName !== this.currentPlaylist.name || newDesc !== (this.currentPlaylist.description || "")) {
      await this.updatePlaylistDetails(newName, newDesc);
    }
  }

  async updatePlaylistDetails(newName, newDescription) {
    try {
      this.showToast("💾 Updating playlist...", "info");
      const response = await fetch(`/api/v2/playlists/${this.currentPlaylist.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": this.apiKey,
        },
        body: JSON.stringify({
          name: newName,
          description: newDescription,
          localUserId: this.getUserId()
        }),
      });

      if (response.ok) {
        const data = await response.json();
        this.currentPlaylist = data.playlist || data;
        this.showToast("✅ Playlist updated successfully", "success");
        this.renderPlaylistDetails();
        this.loadPlaylists(); // Refresh sidebar
      } else {
        const error = await response.json();
        this.showToast(`❌ ${error.error || "Update failed"}`, "error");
      }
    } catch (error) {
      console.error("Error updating playlist:", error);
      this.showToast("❌ Error updating playlist", "error");
    }
  }

  // Delete Playlist
  deletePlaylist(id) {
    console.log("deletePlaylist called for:", id);
    // If id is not passed (called from menu), use current
    const playlistId = id || this.currentPlaylist?.id;
    if (!playlistId) return;

    this.pendingDeleteId = playlistId;

    const modal = document.getElementById('deleteConfirmModal');
    const btn = document.getElementById('confirmDeleteBtn');

    if (!modal || !btn) {
      // Fallback
      console.log("Delete modal not found, using raw confirm");
      if (confirm("Are you sure you want to delete this playlist?")) {
        this.performDeletePlaylist(playlistId);
      }
      return;
    }

    // Setup confirm button
    // We use a one-time wrapper to avoid stacking listeners
    console.log("Showing delete confirmation modal");
    btn.onclick = () => {
      this.performDeletePlaylist(playlistId);
      this.closeModal('deleteConfirmModal');
    };

    this.showModal('deleteConfirmModal');
  }

  async performDeletePlaylist(id) {
    console.log("performDeletePlaylist executing for:", id);
    try {
      const response = await fetch(`/api/v2/playlists/${id}?userId=${this.getUserId()}`, {
        method: "DELETE",
        headers: { "X-API-Key": this.apiKey },
      });

      if (response.ok) {
        this.showToast("🗑️ Playlist deleted", "success");
        if (this.currentPlaylist && this.currentPlaylist.id === id) {
          this.currentPlaylist = null;
          this.showPage("playlists");
        }
        this.loadPlaylists();
      } else {
        const error = await response.json();
        this.showToast(`❌ ${error.error || "Delete failed"}`, "error");
      }
    } catch (error) {
      console.error("Error deleting playlist:", error);
      this.showToast("❌ Error deleting playlist", "error");
    }
  }

  async togglePlaylistPrivacy(playlistId, isPublic) {
    try {
      // Use v2 API endpoint
      const response = await fetch(`/api/v2/playlists/${playlistId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": this.apiKey,
        },
        body: JSON.stringify({ isPublic: isPublic, localUserId: this.getUserId() }),
      });

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



  async saveQueueToPlaylist() {
    if (!this.guildId) return;
    if (!this.queue || this.queue.length === 0) {
      this.showToast("⚠️ Queue is empty", "error");
      return;
    }

    this.showInputModal(
      "Save Queue as Playlist",
      "Playlist Name",
      `Queue Backup - ${new Date().toLocaleDateString()}`,
      async (name) => {
        try {
          const response = await fetch(`/api/v2/playlists/import/queue`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-API-Key": this.apiKey,
            },
            body: JSON.stringify({
              guildId: this.guildId,
              name: name,
              localUserId: this.getUserId()
            }),
          });

          if (response.ok) {
            const data = await response.json();
            this.showToast(`✅ Saved ${data.total} tracks to playlist "${name}"`);
            await this.loadPlaylists();
          } else {
            const error = await response.json();
            this.showToast(`❌ Failed to save queue: ${error.error || "Unknown error"}`, "error");
          }
        } catch (error) {
          console.error("Error saving queue:", error);
          this.showToast("❌ Network error", "error");
        }
      }
    );
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
        await this.renderSettings(settings);
        // Theme selector is local-only; render it whenever settings load.
        // Theme selector is local-only; render it whenever settings load.
        if (this.renderThemeSelector) this.renderThemeSelector(); // Legacy check

        // Initialize local settings controls
        const shortcutsCheck = document.getElementById('keyboardShortcutsCheck');
        if (shortcutsCheck) {
          shortcutsCheck.checked = localStorage.getItem('shortcuts_enabled') !== 'false';
        }
      }
    } catch (error) {
      console.error("Failed to load settings:", error);
    }
  }
  async renderSettings(settings) {
    // Show/hide Admin tab for bot owners
    const adminTab = document.getElementById("adminSettingsTab");
    if (adminTab) {
      if (this.user?.isBotOwner) {
        adminTab.classList.remove("hidden");
      } else {
        adminTab.classList.add("hidden");
      }
    }

    document.getElementById("prefixInput").value = settings.prefix || ".";
    document.getElementById("defaultVolumeSlider").value =
      settings.defaultVolume || 100;
    document.getElementById("defaultVolumeValue").textContent =
      (settings.defaultVolume || 100) + "%";
    // Set checkbox states and toggle classes with defensive checks
    const updateToggle = (id, value) => {
      const el = document.getElementById(id);
      if (el) {
        el.checked = value;
      }
    };

    updateToggle("autoPlayCheck", settings.autoPlay === true);
    updateToggle("leaveOnEmptyCheck", settings.leaveOnEmpty === true);
    updateToggle("stay247Check", settings.stay247 === true);
    // Show/hide 247 channel section
    this.toggle247Channels();
    // Load roles and users for all selects - AWAIT them so values can be set correctly
    await this.loadAllRoleSelects();
    await this.loadAllUserSelects();
    await this.loadGuildChannels();
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
    // Load 24/7 channels values
    document.getElementById("247VoiceChannelSelect").value =
      settings["247VoiceChannel"] || "";
    document.getElementById("247TextChannelSelect").value =
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
        mode247Lock.classList.add("hidden");
      } else {
        stay247Check.disabled = true;
        stay247Check.checked = false;
        const parent = stay247Check.closest(".toggle-label") || stay247Check.closest(".big-toggle");
        if (parent) parent.classList.remove("checked");
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
        feat247.innerHTML = '<span><i class="ph ph-check-circle"></i></span> 24/7 Mode';
      }
      if (featAutoplay) {
        featAutoplay.classList.remove("inactive");
        featAutoplay.classList.add("active");
        featAutoplay.innerHTML = '<span><i class="ph ph-check-circle"></i></span> Smart Autoplay';
      }
    } else {
      if (feat247) {
        feat247.classList.add("inactive");
        feat247.classList.remove("active");
        feat247.innerHTML = '<span><i class="ph ph-x-circle"></i></span> 24/7 Mode';
      }
      if (featAutoplay) {
        featAutoplay.classList.add("inactive");
        featAutoplay.classList.remove("active");
        featAutoplay.innerHTML = '<span><i class="ph ph-x-circle"></i></span> Smart Autoplay';
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

  async loadAllUserSelects() {
    if (!this.guildId) return;
    try {
      const response = await fetch(`/api/guild/${this.guildId}/members`, {
        headers: { "X-API-Key": this.apiKey },
      });
      if (!response.ok) return;

      const members = await response.json();
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
            const tag = member.discriminator && member.discriminator !== "0"
              ? `${member.username}#${member.discriminator}`
              : member.username;
            option.textContent = tag;
            if (member.avatar) option.dataset.avatar = member.avatar;
            select.appendChild(option);
          });
          select.value = currentValue;
        }
      });
    } catch (error) {
      console.error("Failed to load members:", error);
    }
  }

  renderUserTags(containerId, users, selectId, settingsKey) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.dataset.users = JSON.stringify(users);
    container.innerHTML = users
      .map((user) => {
        const userId = user.id || user;
        const userName = user.username
          ? `${user.username}${user.discriminator && user.discriminator !== "0" ? "#" + user.discriminator : ""}`
          : userId;
        const avatarUrl = user.avatar || "https://cdn.discordapp.com/embed/avatars/0.png";
        return `
          <div class="user-tag" data-id="${userId}">
            <img src="${avatarUrl}" alt="">
            <span>${this.escapeHtml(userName)}</span>
            <span class="remove" onclick="dashboard.removeUserTag('${containerId}', '${userId}')">&times;</span>
          </div>
        `;
      }).join("");
  }

  addAllowedUser() { this._addUser("allowedUsersSelect", "allowedUsersTags", "allowedUsers"); }
  addVipUser() { this._addUser("vipUsersSelect", "vipUsersTags", "vipUsers"); }
  addPremiumUser() { this._addUser("premiumUsersSelect", "premiumUsersTags", "premiumUsers"); }

  _addUser(selectId, containerId, settingsKey) {
    const select = document.getElementById(selectId);
    if (!select || !select.value) return;
    const userId = select.value;
    const container = document.getElementById(containerId);
    if (!container) return;
    const users = JSON.parse(container.dataset.users || "[]");
    if (!users.find((u) => (u.id || u) === userId)) {
      const userName = select.options[select.selectedIndex].text;
      const [username, discriminator] = userName.split("#");
      users.push({ id: userId, username, discriminator: discriminator || "0" });
      this.renderUserTags(containerId, users, selectId, settingsKey);
    }
    select.value = "";
  }

  removeUserTag(containerId, userId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const users = JSON.parse(container.dataset.users || "[]");
    const filtered = users.filter((u) => (u.id || u) !== userId);
    this.renderUserTags(containerId, filtered, null, null);
  }

  async loadAllRoleSelects() {
    if (!this.guildId) return;
    try {
      const response = await fetch(`/api/guild/${this.guildId}/roles`, {
        headers: { "X-API-Key": this.apiKey },
      });
      if (!response.ok) return;

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
          select.innerHTML = '<option value="">Select a role to add...</option>';
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
    } catch (error) {
      console.error("Failed to load roles:", error);
    }
  }

  renderRoleTags(containerId, roles, selectId, settingsKey) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.dataset.roles = JSON.stringify(roles);
    container.innerHTML = roles
      .map((role) => `
        <div class="role-tag" data-id="${role.id || role}">
          <span class="role-name">${this.escapeHtml(role.name || role)}</span>
          <span class="remove" onclick="dashboard.removeRoleTag('${containerId}', '${role.id || role}')">&times;</span>
        </div>
      `).join("");
  }

  addDjRole() { this._addRole("djRolesSelect", "djRolesTags", "djRoles"); }
  addAllowedRole() { this._addRole("allowedRolesSelect", "allowedRolesTags", "allowedRoles"); }
  addVipRole() { this._addRole("vipRolesSelect", "vipRolesTags", "vipRoles"); }
  addPremiumRole() { this._addRole("premiumRolesSelect", "premiumRolesTags", "premiumRoles"); }

  _addRole(selectId, containerId, settingsKey) {
    const select = document.getElementById(selectId);
    if (!select || !select.value) return;
    const roleId = select.value;
    const container = document.getElementById(containerId);
    if (!container) return;
    const roles = JSON.parse(container.dataset.roles || "[]");
    if (!roles.find((r) => (r.id || r) === roleId)) {
      const roleName = select.options[select.selectedIndex].text;
      roles.push({ id: roleId, name: roleName });
      this.renderRoleTags(containerId, roles, selectId, settingsKey);
    }
    select.value = "";
  }

  removeRoleTag(containerId, roleId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const roles = JSON.parse(container.dataset.roles || "[]");
    const filtered = roles.filter((r) => (r.id || r) !== roleId);
    this.renderRoleTags(containerId, filtered, null, null);
  }

  updateTierDisplay() {
    // Current tier logic
  }

  async loadGuildChannels() {
    if (!this.guildId) return;
    try {
      const response = await fetch(`/api/guild/${this.guildId}/channels`, {
        headers: { "X-API-Key": this.apiKey },
      });
      if (!response.ok) return;

      const { voiceChannels, textChannels } = await response.json();
      const voiceSelect = document.getElementById("247VoiceChannelSelect");
      const textSelect = document.getElementById("247TextChannelSelect");

      if (voiceSelect) {
        const cur = voiceSelect.value;
        voiceSelect.innerHTML = '<option value="">None</option>';
        voiceChannels.forEach(c => {
          const opt = document.createElement("option");
          opt.value = c.id;
          opt.textContent = "🔊 " + c.name; // Keep standard emoji for Select option as icons don't render inside <option>
          voiceSelect.appendChild(opt);
        });
        voiceSelect.value = cur;
      }

      if (textSelect) {
        const cur = textSelect.value;
        textSelect.innerHTML = '<option value="">None</option>';
        textChannels.forEach(c => {
          const opt = document.createElement("option");
          opt.value = c.id;
          opt.textContent = "#" + c.name;
          textSelect.appendChild(opt);
        });
        textSelect.value = cur;
      }
    } catch (error) {
      console.error("Failed to load channels:", error);
    }
  }

  async saveSettings() {
    if (!this.guildId) return;
    const btn = document.getElementById("saveSettingsBtn");
    if (!btn) return;
    const originalText = btn.textContent;
    btn.textContent = "Saving...";
    btn.disabled = true;

    try {
      const getRoleIds = (id) => JSON.parse(document.getElementById(id)?.dataset.roles || "[]").map(r => r.id || r);
      const getUserIds = (id) => JSON.parse(document.getElementById(id)?.dataset.users || "[]").map(u => u.id || u);

      const settings = {
        prefix: document.getElementById("prefixInput")?.value || ".",
        defaultVolume: parseInt(document.getElementById("defaultVolumeSlider")?.value || "100"),
        autoPlay: document.getElementById("autoPlayCheck")?.checked,
        leaveOnEmpty: document.getElementById("leaveOnEmptyCheck")?.checked,
        stay247: document.getElementById("stay247Check")?.checked,
        textChannelId: document.getElementById("247TextChannelSelect")?.value,
        voiceChannelId: document.getElementById("247VoiceChannelSelect")?.value,
        tier: document.querySelector('input[name="tier"]:checked')?.value || "free",
        djRoles: getRoleIds("djRolesTags"),
        allowedRoles: getRoleIds("allowedRolesTags"),
        vipRoles: getRoleIds("vipRolesTags"),
        premiumRoles: getRoleIds("premiumRolesTags"),
        allowedUsers: getUserIds("allowedUsersTags"),
        vipUsers: getUserIds("vipUsersTags"),
        premiumUsers: getUserIds("premiumUsersTags"),
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
        this.showToast("Settings saved successfully!");
      } else {
        const error = await response.json();
        this.showToast("Failed: " + (error.error || "Unknown"), "error");
      }
    } catch (error) {
      console.error("Save error:", error);
      this.showToast("Connection error", "error");
    } finally {
      btn.textContent = originalText;
      btn.disabled = false;
    }
  }

  async deploySlashCommands() {
    if (!confirm("Are you sure you want to deploy slash commands globally? This can take up to 1 hour to propagate to all servers.")) {
      return;
    }

    const btn = document.getElementById("deployCommandsBtn");
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Deploying...";

    try {
      const response = await fetch("/api/admin/deploy-commands", {
        method: "POST",
        headers: {
          "X-API-Key": this.apiKey,
          "Content-Type": "application/json"
        }
      });

      const data = await response.json();
      if (response.ok) {
        this.showToast(`${data.message}`);
      } else {
        this.showToast(`${data.error || "Failed to deploy commands"}`, "error");
      }
    } catch (error) {
      console.error("Failed to deploy commands:", error);
      this.showToast("Network error while deploying commands", "error");
    } finally {
      btn.disabled = false;
      btn.textContent = originalText;
    }
  }
  closeModal(modalId) {
    document.getElementById(modalId).classList.add("hidden");
  }
  async updateSetting(key, value) {
    if (!this.guildId) {
      this.showToast("❌ Select a server first", "error");
      return;
    }

    try {
      console.log(`Updating setting ${key} to ${value} for guild ${this.guildId}`);
      const response = await this.apiCall('PUT', `/api/settings/${this.guildId}`, {
        [key]: value
      });

      if (response && response.success) {
        this.showToast(`✅ ${key} updated`, 'success');
        // Update local state if needed
      }
    } catch (error) {
      console.error(`Failed to update setting ${key}:`, error);
      this.showToast(`❌ Failed to update ${key}`, 'error');
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
    if (!ms || isNaN(ms) || ms < 0) return "0:00";
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = Math.floor(totalSeconds % 60);

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
    // Sync visualizer color with theme
    if (this.visualizer) {
      this.visualizer.updateColor(t);
    }
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
    const icons = {
      play: '<i class="ph ph-play"></i>',
      pause: '<i class="ph ph-pause"></i>',
      stop: '<i class="ph ph-stop"></i>',
      skip: '<i class="ph ph-skip-forward"></i>',
      previous: '<i class="ph ph-skip-back"></i>',
      shuffle: '<i class="ph ph-shuffle"></i>',
      loop: '<i class="ph ph-repeat"></i>',
      loop_track: '<i class="ph ph-repeat-once"></i>',
      volume_up: '<i class="ph ph-speaker-high"></i>',
      volume_down: '<i class="ph ph-speaker-low"></i>',
      volume_mute: '<i class="ph ph-speaker-slash"></i>',
      success: '<i class="ph ph-check-circle"></i>',
      error: '<i class="ph ph-x-circle"></i>',
      warning: '<i class="ph ph-warning"></i>',
      info: '<i class="ph ph-info"></i>',
      loading: '<i class="ph ph-spinner ph-spin"></i>',
      queue: '<i class="ph ph-list-numbers"></i>',
      now_playing: '<i class="ph ph-music-note"></i>',
    };
    return icons[botName] || this.getEmojiText(botName);
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

  // ============ SETTINGS FUNCTIONS ============
  // Functions moved to consolidated area above
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

  /**
   * Audio Filters Logic
   */
  async loadFilters() {
    if (!this.guildId) return;
    const grid = document.getElementById("filtersGrid");
    if (!grid) return;

    try {
      const response = await fetch(`/api/player/${this.guildId}/filters`, {
        headers: { "X-API-Key": this.apiKey }
      });
      if (!response.ok) return;

      const data = await response.json();
      this.availableFilters = data.available;
      this.activeFilters = data.active;
      this.lastRenderedFilterName = data.activeFilterName;
      this.renderFilters(data.available, data.active, data.activeFilterName);
    } catch (error) {
      console.error("Error loading filters:", error);
      grid.innerHTML = '<p class="error-text">Failed to load filters.</p>';
    }
  }

  async applyFilter(filterName) {
    if (!this.guildId) return;

    // Check permission first
    if (!await this.ensurePermission(`apply ${filterName} filter`)) return;

    // Optimistic UI update
    const prevActive = this.lastRenderedFilterName;
    this.lastRenderedFilterName = filterName;
    this.renderFilters(this.availableFilters, this.activeFilters, filterName);

    try {
      const response = await fetch(`/api/player/${this.guildId}/filters/${filterName}`, {
        method: "POST",
        headers: { "X-API-Key": this.apiKey }
      });

      if (response.ok) {
        this.showToast(`✅ Filter applied: ${filterName}`);
      } else {
        // Rollback
        this.lastRenderedFilterName = prevActive;
        this.renderFilters(this.availableFilters, this.activeFilters, prevActive);
        const error = await response.json();
        this.showToast(`❌ ${error.error || "Failed to apply filter"}`, "error");
      }
    } catch (error) {
      // Rollback
      this.lastRenderedFilterName = prevActive;
      this.renderFilters(this.availableFilters, this.activeFilters, prevActive);
      console.error("Error applying filter:", error);
      this.showToast("❌ Connection error", "error");
    }
  }

  async resetFilters() {
    if (!this.guildId) return;

    // Check permission
    if (!await this.ensurePermission("reset filters")) return;

    // Optimistic UI update
    const prevActive = this.lastRenderedFilterName;
    this.lastRenderedFilterName = null;
    this.renderFilters(this.availableFilters, this.activeFilters, null);

    try {
      const response = await fetch(`/api/player/${this.guildId}/filters`, {
        method: "DELETE",
        headers: { "X-API-Key": this.apiKey }
      });

      if (response.ok) {
        this.showToast("✅ All filters reset");
      } else {
        // Rollback
        this.lastRenderedFilterName = prevActive;
        this.renderFilters(this.availableFilters, this.activeFilters, prevActive);
        const error = await response.json();
        this.showToast(`❌ ${error.error || "Failed to reset filters"}`, "error");
      }
    } catch (error) {
      // Rollback
      this.lastRenderedFilterName = prevActive;
      this.renderFilters(this.availableFilters, this.activeFilters, prevActive);
      console.error("Error resetting filters:", error);
      this.showToast("❌ Connection error", "error");
    }
  }

  renderFilters(available, active, activeFilterName) {
    const grid = document.getElementById("filtersGrid");
    if (!grid || !available) return false;

    const filterIcons = {
      pop: '<i class="ph ph-microphone-stage"></i>', rock: '<i class="ph ph-guitar"></i>', electronic: '<i class="ph ph-piano-keys"></i>', jazz: '<i class="ph ph-music-note"></i>', classical: '<i class="ph ph-music-notes"></i>',
      hiphop: '<i class="ph ph-speaker-high"></i>', reggae: '<i class="ph ph-leaf"></i>', bassboost: '<i class="ph ph-speaker-slash"></i>', superbass: '<i class="ph ph-lightning"></i>', deepbass: '<i class="ph ph-waves"></i>',
      vocals: '<i class="ph ph-microphone"></i>', treble: '<i class="ph ph-speaker-low"></i>', bright: '<i class="ph ph-sparkle"></i>', gaming: '<i class="ph ph-game-controller"></i>', nightcore: '<i class="ph ph-lightning-slash"></i>',
      vaporwave: '<i class="ph ph-sun-horizon"></i>', boost: '<i class="ph ph-rocket"></i>', soft: '<i class="ph ph-cloud"></i>', flat: '<i class="ph ph-minus"></i>', warm: '<i class="ph ph-fire"></i>',
      metal: '<i class="ph ph-skull"></i>', oldschool: '<i class="ph ph-cassette-tape"></i>'
    };

    const filterNames = Object.keys(available).filter(name => typeof available[name] !== 'function');

    grid.innerHTML = filterNames.map(name => {
      const isActive = name === activeFilterName;
      return `
        <div class="filter-card ${isActive ? 'active' : ''}" onclick="dashboard.applyFilter('${name}')">
          <span class="filter-icon">${filterIcons[name] || '<i class="ph ph-sliders"></i>'}</span>
          <span class="filter-name">${name}</span>
          ${isActive ? '<span class="active-badge">Active</span>' : ''}
        </div>
      `;
    }).join('');

    return true;
  }


  // ==========================================
  // UNIFIED SEARCH SYSTEM
  // ==========================================

  setSearchSource(source) {
    this.currentSearchSource = source;
    this.updateSearchFiltersUI();
    this.triggerSearchIfReady();
  }

  setSearchType(type) {
    this.currentSearchType = type; // 'track' or 'playlist'
    this.updateSearchFiltersUI();
    this.triggerSearchIfReady();
  }

  updateSearchFiltersUI() {
    document.querySelectorAll('.filter-tag').forEach(btn => {
      if (btn.dataset.source) {
        btn.classList.toggle('active', btn.dataset.source === (this.currentSearchSource || 'all'));
      }
      if (btn.dataset.type) {
        btn.classList.toggle('active', btn.dataset.type === (this.currentSearchType || 'track'));
      }
    });
  }

  triggerSearchIfReady() {
    const query = document.getElementById('unifiedSearchInput').value;
    if (query && query.trim().length >= 2) {
      this.performUnifiedSearch();
    }
  }

  async performUnifiedSearch() {
    // Cancel previous search if active
    if (this.searchAbortController) {
      this.searchAbortController.abort();
    }
    this.searchAbortController = new AbortController();
    const signal = this.searchAbortController.signal;

    const input = document.getElementById('unifiedSearchInput');
    const query = input.value.trim();
    const container = document.getElementById('searchResultsContainer');

    if (!query || query.length < 2) {
      this.showToast('Please enter at least 2 characters', 'error');
      return;
    }

    if (!this.guildId) {
      this.showToast('Please select a server first', 'error');
      this.showPage('servers');
      return;
    }

    // Default to track if undefined
    const type = this.currentSearchType || 'track';
    const source = this.currentSearchSource || 'all';

    // Show loading
    container.innerHTML = `
      <div class="loading-state">
        <div class="spinner-small"></div>
        <span>Searching ${source} for ${type}s...</span>
      </div>
    `;

    try {
      const response = await fetch(`/api/search?query=${encodeURIComponent(query)}&source=${source}&type=${type}`, {
        headers: {
          'X-API-Key': this.apiKey,
          'Authorization': `Bearer ${this.socketToken}`
        },
        signal
      });

      const data = await response.json();

      let items = [];
      if (type === 'playlist') {
        items = data.playlists || [];
      } else {
        items = data.results || [];
      }

      if (items.length > 0) {
        this.renderUnifiedSearchResults(items, type);
      } else {
        container.innerHTML = `
          <div class="empty-search-state">
            <div class="search-icon-large" style="font-size: 3rem"><i class="ph ph-x-circle"></i></div>
            <h3>No results found</h3>
            <p>Try a different keyword or source.</p>
          </div>
        `;
      }
    } catch (error) {
      if (error.name === 'AbortError') return; // Ignore cancelled requests

      console.error('Search error:', error);
      container.innerHTML = `
        <div class="empty-search-state">
          <div class="search-icon-large" style="color: var(--danger)"><i class="ph ph-warning-circle"></i></div>
          <h3>Search Failed</h3>
          <p>${error.message || 'Could not fetch results'}</p>
        </div>
      `;
    } finally {
      if (this.searchAbortController && this.searchAbortController.signal === signal) {
        this.searchAbortController = null;
      }
    }
  }

  resolveArtwork(item) {
    if (!item) return "https://placehold.co/200x200/2d2d2d/fff.png?text=Music";

    let artwork = item.artworkUrl || item.thumbnail || item.info?.artworkUrl || item.pluginInfo?.artworkUrl;

    // Check if it's a YouTube track and needs a thumbnail fallback
    const uri = item.uri || item.info?.uri || "";
    const identifier = item.identifier || item.info?.identifier || "";

    if ((!artwork || artwork.includes('placehold.co')) && (uri.includes('youtube.com') || uri.includes('youtu.be') || identifier.length === 11)) {
      const vid = identifier.length === 11 ? identifier : (uri.match(/(?:v=|youtu\.be\/|v\/)([^&?]+)/)?.[1]);
      if (vid) return `https://img.youtube.com/vi/${vid}/hqdefault.jpg`;
    }

    // Spotify Fallback
    if (item.source === 'spotify' || item.source === 'spsearch') {
      if (!artwork || artwork.includes('placehold.co')) return 'https://placehold.co/300x300/1DB954/FFFFFF?text=Spotify';
    }

    // SoundCloud Fallback
    if (item.source === 'soundcloud' || item.source === 'scsearch') {
      if (!artwork || artwork.includes('placehold.co')) return 'https://placehold.co/300x300/ff5500/FFFFFF?text=SoundCloud';
    }

    // Playlists
    if (item.trackCount !== undefined || item.tracks || (item.url && item.url.includes('playlist'))) {
      if (!artwork || artwork.includes('placehold.co')) return 'https://placehold.co/300x300/6366f1/FFFFFF?text=Playlist';
    }

    return artwork || "https://placehold.co/200x200/2d2d2d/fff.png?text=Music";
  }

  renderUnifiedSearchResults(results, type) {
    const container = document.getElementById('searchResultsContainer');
    container.innerHTML = '<div class="results-grid"></div>';
    const grid = container.querySelector('.results-grid');

    results.forEach(item => {
      const card = document.createElement('div');
      card.className = 'search-card';

      const artwork = this.resolveArtwork(item);
      const imgId = `artwork-${Math.random().toString(36).substr(2, 9)}`;

      // Async fetch official cover for Spotify if using placeholder
      const isSpotifyResult = (item.source === 'spotify' || item.source === 'spsearch' || (item.uri && item.uri.includes('spotify')));
      if (isSpotifyResult && artwork.includes('placehold.co') && item.uri) {
        // Convert spotify:track:ID to https://open.spotify.com/track/ID for oEmbed
        let spotifyUrl = item.uri;
        if (spotifyUrl.startsWith('spotify:')) {
          const parts = spotifyUrl.split(':');
          if (parts.length >= 3) {
            spotifyUrl = `https://open.spotify.com/${parts[1]}/${parts[2]}`;
          }
        }

        fetch(`/api/utils/spotify-cover?url=${encodeURIComponent(spotifyUrl)}`)
          .then(r => r.json())
          .then(d => {
            console.log("[SpotifyCover] Fetched:", d);
            if (d.thumbnail_url) {
              const img = document.getElementById(imgId);
              if (img) img.src = d.thumbnail_url;
            }
          }).catch((e) => { console.error("[SpotifyCover] Error:", e); });
      }

      const title = item.title || 'Unknown Title';
      const author = item.author || 'Unknown Artist';
      const uri = (item.uri || item.url || '').replace(/'/g, "\\'");

      let actionButtons = '';

      if (type === 'playlist') {
        actionButtons = `
            <button class="search-card-action" onclick="dashboard.playUnifiedTrack('${uri}', 'play_now')" title="Play Now">
              <i class="ph ph-play"></i>
            </button>
            <button class="search-card-action" onclick="dashboard.addToQueueUnified('${uri}')" title="Add to Queue">
              <i class="ph ph-plus"></i>
            </button>
         `;
      } else {
        actionButtons = `
            <button class="search-card-action" onclick="dashboard.playUnifiedTrack('${uri}', 'play_now')" title="Play Now">
              <i class="ph ph-play"></i>
            </button>
            <button class="search-card-action" onclick="dashboard.playNext('${uri}')" title="Play Next">
              <i class="ph ph-skip-forward"></i>
            </button>
            <button class="search-card-action" onclick="dashboard.addToQueueUnified('${uri}')" title="Add to Queue">
              <i class="ph ph-plus"></i>
            </button>
         `;
      }

      card.innerHTML = `
        <div class="search-card-image-wrapper">
          <img id="${imgId}" src="${artwork}" class="search-card-image" loading="lazy" alt="${title}">
          <div class="search-card-overlay">
            ${actionButtons}
          </div>
          <div class="search-source-badge">${item.source || 'unknown'}</div>
        </div>
        <div class="search-card-content">
          <div class="search-card-title" title="${title}">${title}</div>
          <div class="search-card-artist" title="${author}">
            ${author} ${type === 'playlist' ? `• ${item.trackCount} tracks` : ''}
          </div>
        </div>
      `;
      grid.appendChild(card);
    });
  }

  async playUnifiedTrack(uri, mode = 'play_now') {
    if (!this.guildId) return;

    this.showToast(mode === 'play_now' ? 'Playing now...' : 'Starting playback...');
    try {
      await this.apiCall('POST', `/api/player/${this.guildId}/play`, {
        query: uri,
        mode: mode
      });
      this.showPage('player');
    } catch (error) {
      this.showToast(`Failed to play: ${error.message}`, 'error');
    }
  }

  async addToQueueUnified(uri) {
    if (!this.guildId) return;

    try {
      const btn = event.target.closest('button');
      const originalContent = btn.innerHTML;
      btn.innerHTML = '...';
      btn.disabled = true;

      await this.apiCall('POST', `/api/player/${this.guildId}/play`, {
        query: uri,
        mode: 'queue'
      });

      this.showToast('Added to queue', 'success');

      // Reset button
      setTimeout(() => {
        btn.innerHTML = originalContent;
        btn.disabled = false;
      }, 1000);
    } catch (error) {
      this.showToast(`Failed to add: ${error.message}`, 'error');
    }
  }

  async playNext(uri) {
    if (!this.guildId) return;
    if (!await this.ensurePermission("add play next")) return;

    try {
      const btn = event?.target?.closest('button');
      let originalContent = '';
      if (btn) {
        originalContent = btn.innerHTML;
        btn.innerHTML = '...';
        btn.disabled = true;
      }

      const response = await this.apiCall('POST', `/api/queue/${this.guildId}/playnext`, {
        query: uri,
        source: this.currentSearchSource || 'ytsearch'
      });

      if (response && response.success) {
        this.showToast(`${response.track?.title || 'Track'} will play next`, 'success');
      } else {
        this.showToast('Added to play next', 'success');
      }

      // Reset button
      if (btn) {
        setTimeout(() => {
          btn.innerHTML = originalContent;
          btn.disabled = false;
        }, 1000);
      }
    } catch (error) {
      this.showToast(`Failed to add: ${error.message}`, 'error');
    }
  }

  // --- Search Suggestions ---
  handleSearchInput(event) {
    const query = event.target.value.trim();
    const container = document.getElementById('searchSuggestions');

    if (this.suggestionTimeout) clearTimeout(this.suggestionTimeout);

    if (query.length < 2) {
      if (container) {
        container.classList.add('hidden');
        container.innerHTML = '';
      }
      return;
    }

    this.suggestionTimeout = setTimeout(() => {
      this.fetchSearchSuggestions(query);
    }, 450);
  }

  async fetchSearchSuggestions(query) {
    if (!query) return;
    const container = document.getElementById('searchSuggestions');
    if (!container) return;

    if (this.suggestionAbortController) {
      this.suggestionAbortController.abort();
    }
    this.suggestionAbortController = new AbortController();
    const signal = this.suggestionAbortController.signal;

    try {
      const encoded = encodeURIComponent(query);
      const source = this.currentSearchSource || 'all';
      const type = 'track'; // Suggestions always track for now

      const response = await fetch(`/api/search?query=${encoded}&source=${source}&type=${type}`, {
        headers: {
          'X-API-Key': this.apiKey
        },
        signal
      });

      if (!response.ok) return;

      const data = await response.json();
      const results = data.tracks || data.results || [];

      if (results && results.length > 0) {
        this.renderSearchSuggestions(results.slice(0, 5));
      } else {
        container.classList.add('hidden');
      }
    } catch (e) {
      if (e.name !== 'AbortError') {
        // console.error('Suggestion error:', e); 
        container.classList.add('hidden');
      }
    }
  }

  renderSearchSuggestions(items) {
    const container = document.getElementById('searchSuggestions');
    if (!container) return;

    container.innerHTML = '';
    container.classList.remove('hidden');

    items.forEach(item => {
      const div = document.createElement('div');
      div.className = 'suggestion-item';
      const artwork = this.resolveArtwork(item);
      const title = item.title || 'Unknown';
      const author = item.author || 'Unknown';

      div.innerHTML = `
            <img src="${artwork}" class="suggestion-thumb" loading="lazy" onerror="this.src='https://placehold.co/40x40/1e1e24/FFF?text=♪'">
            <div class="suggestion-info">
              <div class="suggestion-title">${this.escapeHtml ? this.escapeHtml(title) : title}</div>
              <div class="suggestion-meta">${this.escapeHtml ? this.escapeHtml(author) : author}</div>
            </div>
          `;

      div.onclick = (e) => {
        e.stopPropagation();
        // Play immediately
        this.playUnifiedTrack(item.uri);
        container.classList.add('hidden');
        this.showToast(`Selected: ${title}`, 'success');
      };

      container.appendChild(div);
    });
  }

  escapeHtml(text) {
    if (!text) return text;
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // ============ LIKE BUTTON FUNCTIONALITY ============

  async toggleLikeCurrentTrack() {
    const currentTrack = this.playerState?.currentTrack;
    if (!currentTrack) {
      this.showToast('No track playing', 'error');
      return;
    }

    const userId = this.getUserId();
    if (!userId) {
      this.showToast('Please log in to like songs', 'error');
      return;
    }

    const track = currentTrack;
    const trackId = track.identifier || track.uri;
    const likeBtn = document.getElementById('likeBtn');
    const likeIcon = document.getElementById('likeIcon');

    try {
      // Check current state
      const isCurrentlyLiked = likeBtn?.classList.contains('liked');

      if (isCurrentlyLiked) {
        // Unlike
        const res = await fetch(`/api/v2/playlists/liked/tracks/${encodeURIComponent(trackId)}?userId=${userId}`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json', 'X-API-Key': this.apiKey },
          credentials: 'include'
        });

        if (res.ok) {
          likeBtn?.classList.remove('liked');
          if (likeIcon) likeIcon.innerHTML = '<i class="ph ph-heart"></i>';
          this.showToast('Removed from Liked Songs', 'info');
        }
      } else {
        // Like
        const res = await fetch(`/api/v2/playlists/liked/tracks?userId=${userId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-API-Key': this.apiKey },
          credentials: 'include',
          body: JSON.stringify({
            localUserId: userId,
            track: {
              identifier: trackId,
              title: track.title,
              author: track.author,
              uri: track.uri,
              duration: track.duration,
              artworkUrl: track.artworkUrl
            }
          })
        });

        if (res.ok) {
          likeBtn?.classList.add('liked');
          if (likeIcon) likeIcon.innerHTML = '<i class="ph-fill ph-heart"></i>';
          this.showToast('Added to Liked Songs', 'success');
        }
      }
    } catch (e) {
      console.error('Error toggling like:', e);
      this.showToast('Failed to update liked status', 'error');
    }
  }

  async updateLikeButtonState() {
    const currentTrack = this.playerState?.currentTrack;
    if (!currentTrack) return;

    const userId = this.getUserId();
    if (!userId) return;

    const track = currentTrack;
    const trackId = track.identifier || track.uri;
    const likeBtn = document.getElementById('likeBtn');
    const likeIcon = document.getElementById('likeIcon');

    try {
      const res = await fetch(`/api/v2/playlists/liked/check/${encodeURIComponent(trackId)}?userId=${userId}`, {
        headers: { 'X-API-Key': this.apiKey },
        credentials: 'include'
      });
      if (res.ok) {
        const data = await res.json();
        if (data.isLiked) {
          likeBtn?.classList.add('liked');
          if (likeIcon) likeIcon.innerHTML = '<i class="ph-fill ph-heart"></i>';
        } else {
          likeBtn?.classList.remove('liked');
          if (likeIcon) likeIcon.innerHTML = '<i class="ph ph-heart"></i>';
        }
      }
    } catch (e) {
      // Ignore - just default to unliked
    }
  }

  /**
   * Open modal to add current track to a playlist (not save entire queue)
   */
  async openAddToPlaylistModal() {
    const currentTrack = this.playerState?.currentTrack;
    if (!currentTrack) {
      this.showToast('No track is currently playing', 'error');
      return;
    }

    const userId = this.getUserId();
    if (!userId) {
      this.showToast('Please log in to add tracks to playlists', 'error');
      return;
    }

    // Fetch user's playlists
    try {
      const res = await fetch(`/api/v2/playlists?userId=${userId}`, {
        headers: { 'X-API-Key': this.apiKey },
        credentials: 'include'
      });

      if (!res.ok) throw new Error('Failed to load playlists');

      const data = await res.json();
      const playlists = data.playlists || data || [];

      if (playlists.length === 0) {
        this.showToast('No playlists found. Create one first!', 'info');
        this.showPage('playlists');
        return;
      }

      // Create and show the modal
      const modalHtml = `
        <div id="addToPlaylistSelectModal" class="popup-overlay" onclick="if(event.target===this) dashboard.closeModal('addToPlaylistSelectModal')">
          <div class="popup-content small">
            <div class="popup-header">
              <h3><i class="ph ph-plus-circle"></i> Add to Playlist</h3>
              <button class="popup-close" onclick="dashboard.closeModal('addToPlaylistSelectModal')">
                <i class="ph ph-x"></i>
              </button>
            </div>
            <div class="popup-body">
              <p class="popup-description">Select a playlist to add this track to:</p>
              <div class="playlist-select-list">
                ${playlists.map(p => `
                  <div class="playlist-select-item" onclick="dashboard.addCurrentTrackToPlaylist('${p.id}')">
                    <i class="ph ph-music-notes-plus"></i>
                    <span>${this.escapeHtml(p.name)}</span>
                    <span class="playlist-track-count">${p.trackCount || p.track_count || 0} tracks</span>
                  </div>
                `).join('')}
              </div>
              <div class="modal-actions" style="margin-top: 16px;">
                <button class="action-btn secondary" onclick="dashboard.closeModal('addToPlaylistSelectModal'); dashboard.openCreatePlaylistModal();">
                  <i class="ph ph-plus"></i> Create New Playlist
                </button>
              </div>
            </div>
          </div>
        </div>
      `;

      // Remove existing modal if present
      document.getElementById('addToPlaylistSelectModal')?.remove();

      // Add modal to page
      document.body.insertAdjacentHTML('beforeend', modalHtml);

    } catch (e) {
      console.error('Error loading playlists:', e);
      this.showToast('Failed to load playlists', 'error');
    }
  }

  /**
   * Add the currently playing track to a specific playlist
   */
  async addCurrentTrackToPlaylist(playlistId) {
    const currentTrack = this.playerState?.currentTrack;
    if (!currentTrack) {
      this.showToast('No track is currently playing', 'error');
      return;
    }

    const userId = this.getUserId();
    if (!userId) {
      this.showToast('Please log in first', 'error');
      return;
    }

    try {
      const trackData = {
        identifier: currentTrack.identifier || currentTrack.uri,
        title: currentTrack.requester?.originalTitle || currentTrack.userData?.originalTitle || currentTrack.title,
        author: currentTrack.requester?.originalAuthor || currentTrack.userData?.originalAuthor || currentTrack.author,
        uri: currentTrack.uri,
        duration: currentTrack.duration,
        artworkUrl: currentTrack.artworkUrl || currentTrack.artwork,
        sourceName: currentTrack.sourceName
      };

      const res = await fetch(`/api/v2/playlists/${playlistId}/tracks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': this.apiKey
        },
        credentials: 'include',
        body: JSON.stringify({ track: trackData, userId })
      });

      if (res.ok) {
        this.showToast('Track added to playlist!', 'success');
        this.closeModal('addToPlaylistSelectModal');
      } else {
        const err = await res.json();
        throw new Error(err.error || 'Failed to add track');
      }
    } catch (e) {
      console.error('Error adding track to playlist:', e);
      this.showToast(`Failed: ${e.message}`, 'error');
    }
  }

  renderPlaylistDetails(playlist) {
    if (!playlist) return;

    // Update Header Info
    const titleEl = document.getElementById('playlistTitle');
    const descEl = document.getElementById('playlistDescription');
    const creatorEl = document.getElementById('playlistCreator');
    const countEl = document.getElementById('playlistTrackCount');
    const durationEl = document.getElementById('playlistDuration');
    const coverEl = document.getElementById('playlistCover');

    if (titleEl) titleEl.textContent = playlist.name;
    if (descEl) descEl.textContent = playlist.description || '';
    if (creatorEl) creatorEl.textContent = playlist.ownerName || (playlist.owner === this.getUserId() ? 'You' : 'System');

    const tracks = playlist.tracks || [];
    if (countEl) countEl.textContent = `${tracks.length} song${tracks.length !== 1 ? 's' : ''}`;

    const totalDuration = tracks.reduce((acc, t) => acc + (t.info?.length || t.duration || 0), 0);
    if (durationEl) durationEl.textContent = this.formatTime(totalDuration); // Assuming formatTime handles ms

    // Update Cover
    if (coverEl) {
      // Use first track artwork or default
      const artwork = tracks[0]?.info?.artworkUrl || tracks[0]?.artworkUrl;
      if (artwork) {
        coverEl.innerHTML = `<img src="${artwork}" alt="Playlist Cover" class="playlist-cover-img">`;
      } else {
        coverEl.innerHTML = `<span class="playlist-cover-placeholder"><i class="ph ph-music-note"></i></span>`;
        // Set dynamic background color based on type if system playlist
        if (playlist.isSystemPlaylist) {
          // Apply specific classes or styles based on type
          coverEl.className = `playlist-cover ${playlist.systemType || ''}`;
        }
      }
    }

    // Render Tracks
    const listEl = document.getElementById('playlistTracksList');
    if (listEl) {
      if (tracks.length === 0) {
        listEl.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon"><i class="ph ph-music-notes-simple"></i></div>
                    <h3>This playlist is empty</h3>
                    <p>Add some songs to get started!</p>
                </div>
            `;
      } else {
        listEl.innerHTML = tracks.map((track, index) => {
          const updatedTrack = track.info || track; // Handle different structures
          const title = this.escapeHtml(updatedTrack.title || 'Unknown Title');
          const author = this.escapeHtml(updatedTrack.author || 'Unknown Artist');
          const duration = this.formatTime(updatedTrack.length || updatedTrack.duration || 0);
          const album = this.escapeHtml(updatedTrack.album || '-');
          const trackId = updatedTrack.identifier || updatedTrack.uri;
          const artwork = updatedTrack.artworkUrl || 'https://placehold.co/40x40/2f3136/FFF?text=Music';

          return `
                <div class="track-row" ondblclick="dashboard.playPlaylistTrack('${index}')">
                    <div class="track-col-num">
                        <span class="track-num">${index + 1}</span>
                        <button class="track-play-btn" onclick="dashboard.playPlaylistTrack('${index}')"><i class="ph ph-play"></i></button>
                    </div>
                    <div class="track-col-title">
                        <img src="${artwork}" class="track-thumb" loading="lazy" onerror="this.src='https://placehold.co/40x40/2f3136/FFF?text=Music'">
                        <div class="track-info">
                            <div class="track-name" title="${title}">${title}</div>
                            <div class="track-artist" title="${author}">${author}</div>
                        </div>
                    </div>
                    <div class="track-col-album">${album}</div>
                    <div class="track-col-duration">${duration}</div>
                    <div class="track-col-actions">
                        <button class="action-btn icon-only small" onclick="dashboard.removeTrackFromPlaylist('${index}')" title="Remove from playlist">
                            <i class="ph ph-trash"></i>
                        </button>
                    </div>
                </div>
                `;
        }).join('');
      }
    }
  }

  // ============ PLAYLIST ACTIONS ============

  async openPlaylist(id) {
    if (!id) return;

    // Check if it's a system playlist ID
    if (id.startsWith('system_')) {
      const parts = id.split('_');
      // Format: system_type_userId
      if (parts.length >= 2) {
        return this.openSystemPlaylist(parts[1]);
      }
    }

    try {
      this.showToast('Loading playlist...', 'info');
      const userId = this.getUserId();
      const res = await fetch(`/api/v2/playlists/${id}?userId=${userId}`, {
        headers: { 'X-API-Key': this.apiKey },
        credentials: 'include'
      });

      const data = await res.json();
      if (data.success && data.playlist) {
        this.currentPlaylist = data.playlist;
        this.renderPlaylistDetails(data.playlist);
        this.showPage('playlistDetails');
      } else {
        throw new Error(data.error || 'Playlist not found');
      }
    } catch (e) {
      this.showToast(`Failed to open playlist: ${e.message}`, 'error');
    }
  }

  async playPlaylist(shuffle = false, playlistId = null) {
    if (!this.guildId) {
      this.showToast('Select a server to play music', 'error');
      return;
    }

    const id = playlistId || (this.currentPlaylist ? this.currentPlaylist.id : null);
    if (!id) return;

    this.showToast('Starting playlist...', 'info');
    try {
      const userId = this.getUserId();
      await this.apiCall('POST', `/api/v2/playlists/${id}/play`, {
        guildId: this.guildId,
        userId: userId,
        shuffle: shuffle,
        clearQueue: true
      });
      this.showPage('player');
    } catch (e) {
      // Error is displayed by apiCall
    }
  }

  async playPlaylistTrack(index) {
    if (!this.currentPlaylist || !this.currentPlaylist.tracks[index]) return;
    const track = this.currentPlaylist.tracks[index];
    // Updated: handle track structure differences
    const uri = track.info?.uri || track.uri;

    if (!uri) {
      this.showToast('Track URI missing', 'error');
      return;
    }

    this.playUnifiedTrack(uri);
  }

  async removeTrackFromPlaylist(index) {
    if (!this.currentPlaylist) return;
    const indexNum = parseInt(index);
    if (isNaN(indexNum)) return;

    const track = this.currentPlaylist.tracks[indexNum];
    if (!track) return;

    const userId = this.getUserId();

    if (this.currentPlaylist.isSystemPlaylist) {
      if (this.currentPlaylist.systemType === 'liked') {
        // Unlike logic
        const trackId = track.identifier || track.uri || track.info?.identifier;
        try {
          const res = await fetch(`/api/v2/playlists/liked/tracks/${encodeURIComponent(trackId)}?userId=${userId}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json', 'X-API-Key': this.apiKey },
            credentials: 'include'
          });
          if (res.ok) {
            this.showToast('Removed from Liked Songs', 'success');
            // Refresh
            this.openSystemPlaylist('liked');
          } else {
            this.showToast('Failed to remove track', 'error');
          }
        } catch (e) {
          this.showToast('Error removing track', 'error');
        }
      } else {
        this.showToast('This playlist is managed automatically', 'info');
      }
    } else {
      // Regular playlist
      try {
        // Note: backend expects position to be 1-indexed probably? Or 0-indexed?
        // Route: app.delete('/api/v2/playlists/:id/tracks/position/:position'
        // Verify backend logic... usually arrays are 0-indexed but user input might be 1.
        // Logic in PlaylistManager.removeTrackAtPosition uses `splice(position, 1)`. So 0-indexed.

        await this.apiCall('DELETE', `/api/v2/playlists/${this.currentPlaylist.id}/tracks/position/${indexNum}`);
        this.showToast('Track removed', 'success');
        // Refresh
        this.openPlaylist(this.currentPlaylist.id);
      } catch (e) {
        // handled by apiCall
      }
    }
  }

  async shufflePlaylist() {
    this.playPlaylist(true);
  }

  showPlaylistMoreOptions() {
    if (!this.currentPlaylist) return;

    // Simple menu or just toast for now if not implemented fully
    if (this.currentPlaylist.isSystemPlaylist) {
      this.showToast('System Playlist options unavailable', 'info');
    } else {
      // Could show modal for Edit/Delete
      if (confirm(`Delete playlist "${this.currentPlaylist.name}"?`)) {
        this.deleteCurrentPlaylist();
      }
    }
  }

  async deleteCurrentPlaylist() {
    if (!this.currentPlaylist) return;
    try {
      const userId = this.getUserId();
      await this.apiCall('DELETE', `/api/v2/playlists/${this.currentPlaylist.id}?userId=${userId}`);
      this.showToast('Playlist deleted', 'success');
      this.showPage('playlists');
      this.loadPlaylists();
    } catch (e) {
      // handled
    }
  }

  async openSystemPlaylist(type) {
    const userId = this.getUserId();
    if (!userId) {
      this.showToast('Please log in to view your library', 'error');
      return;
    }

    try {
      this.showToast(`Loading ${type === 'liked' ? 'Liked Songs' : type}...`, 'info');

      const res = await fetch(`/api/v2/playlists/system/${type}?userId=${userId}`, {
        headers: { 'X-API-Key': this.apiKey },
        credentials: 'include'
      });
      if (!res.ok) throw new Error('Failed to load playlist');

      const data = await res.json();
      if (!data.success || !data.playlist) {
        throw new Error('Playlist not found');
      }

      // Store the playlist and show details view
      this.currentPlaylist = data.playlist;
      this.renderPlaylistDetails(data.playlist);
      this.showPage('playlistDetails');
    } catch (e) {
      console.error('Error opening system playlist:', e);
      this.showToast(`Failed to load ${type} playlist`, 'error');
    }
  }

  async loadLikedSongsCount() {
    const userId = this.getUserId();
    if (!userId) return;

    try {
      const res = await fetch(`/api/v2/playlists/system/liked?userId=${userId}`, {
        headers: { 'X-API-Key': this.apiKey },
        credentials: 'include'
      });
      if (res.ok) {
        const data = await res.json();
        const countEl = document.getElementById('likedSongsCount');
        if (countEl && data.playlist) {
          const count = data.playlist.track_count || data.playlist.tracks?.length || 0;
          countEl.textContent = `${count} song${count !== 1 ? 's' : ''}`;
        }
      }
    } catch (e) {
      // Ignore - count will stay at default
    }
  }

  // ============================================
  // COLLABORATIVE PLAYLISTS UI
  // ============================================

  async loadCollaborators(playlistId) {
    const userId = this.getUserId();
    if (!userId) return [];

    try {
      const res = await fetch(`/api/v2/playlists/${playlistId}/collaborators?userId=${userId}`, {
        headers: { 'X-API-Key': this.apiKey },
        credentials: 'include'
      });
      if (res.ok) {
        const data = await res.json();
        return data.collaborators || [];
      }
    } catch (e) {
      console.error('Error loading collaborators:', e);
    }
    return [];
  }

  openInviteCollaboratorModal() {
    if (!this.currentPlaylist) {
      this.showToast('No playlist selected', 'error');
      return;
    }

    // Check if user is the owner
    const userId = this.getUserId();
    const isOwner = this.currentPlaylist.user_id === userId || this.currentPlaylist.userId === userId;
    if (!isOwner) {
      this.showToast('Only playlist owners can invite collaborators', 'error');
      return;
    }

    // Show modal
    const modal = document.getElementById('inviteCollaboratorModal');
    if (modal) {
      modal.classList.remove('hidden');
      // Clear previous input
      const input = document.getElementById('collaboratorIdInput');
      if (input) input.value = '';
    } else {
      // Fallback: prompt
      const collaboratorId = prompt('Enter the Discord User ID of the person you want to invite:');
      if (collaboratorId) {
        this.inviteCollaborator(collaboratorId);
      }
    }
  }

  async inviteCollaborator(collaboratorId, role = 'editor') {
    if (!this.currentPlaylist || !collaboratorId) return;

    const userId = this.getUserId();
    const playlistId = this.currentPlaylist.id;

    try {
      this.showToast('Inviting collaborator...', 'info');

      const res = await fetch(`/api/v2/playlists/${playlistId}/collaborators`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': this.apiKey
        },
        credentials: 'include',
        body: JSON.stringify({
          collaboratorId,
          role,
          localUserId: userId
        })
      });

      if (res.ok) {
        const data = await res.json();
        this.showToast('✅ Collaborator invited!', 'success');

        // Refresh collaborators list
        this.renderCollaboratorsSection();

        // Close modal if open
        this.closeModal('inviteCollaboratorModal');
      } else {
        const error = await res.json();
        this.showToast(`❌ ${error.error || 'Failed to invite'}`, 'error');
      }
    } catch (e) {
      console.error('Error inviting collaborator:', e);
      this.showToast('❌ Connection error', 'error');
    }
  }

  async removeCollaborator(collaboratorId) {
    if (!this.currentPlaylist || !collaboratorId) return;

    if (!confirm('Are you sure you want to remove this collaborator?')) return;

    const userId = this.getUserId();
    const playlistId = this.currentPlaylist.id;

    try {
      const res = await fetch(`/api/v2/playlists/${playlistId}/collaborators/${collaboratorId}?userId=${userId}`, {
        method: 'DELETE',
        headers: { 'X-API-Key': this.apiKey },
        credentials: 'include'
      });

      if (res.ok) {
        this.showToast('✅ Collaborator removed', 'success');
        this.renderCollaboratorsSection();
      } else {
        const error = await res.json();
        this.showToast(`❌ ${error.error || 'Failed to remove'}`, 'error');
      }
    } catch (e) {
      console.error('Error removing collaborator:', e);
      this.showToast('❌ Connection error', 'error');
    }
  }

  async toggleCollaborativeMode(enabled) {
    if (!this.currentPlaylist) return;

    const userId = this.getUserId();
    const playlistId = this.currentPlaylist.id;

    try {
      const res = await fetch(`/api/v2/playlists/${playlistId}/collaborative`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': this.apiKey
        },
        credentials: 'include',
        body: JSON.stringify({
          enabled,
          localUserId: userId
        })
      });

      if (res.ok) {
        const data = await res.json();
        this.currentPlaylist = data.playlist || this.currentPlaylist;
        this.currentPlaylist.is_collaborative = enabled;
        this.showToast(enabled ? '✅ Collaborative mode enabled' : '🔒 Collaborative mode disabled', 'success');
      } else {
        const error = await res.json();
        this.showToast(`❌ ${error.error || 'Failed to toggle'}`, 'error');
      }
    } catch (e) {
      console.error('Error toggling collaborative mode:', e);
      this.showToast('❌ Connection error', 'error');
    }
  }

  async renderCollaboratorsSection() {
    if (!this.currentPlaylist) return;

    const container = document.getElementById('collaboratorsSection');
    if (!container) return;

    const userId = this.getUserId();
    const isOwner = this.currentPlaylist.user_id === userId || this.currentPlaylist.userId === userId;

    if (!isOwner) {
      container.classList.add('hidden');
      return;
    }

    container.classList.remove('hidden');

    // Load collaborators
    const collaborators = await this.loadCollaborators(this.currentPlaylist.id);
    const isCollaborative = this.currentPlaylist.is_collaborative || this.currentPlaylist.isCollaborative;

    container.innerHTML = `
      <div class="collaborators-header">
        <h5><i class="ph ph-users"></i> Collaborators</h5>
        <label class="toggle-switch small">
          <input type="checkbox" id="collaborativeToggle" ${isCollaborative ? 'checked' : ''} 
                 onchange="dashboard.toggleCollaborativeMode(this.checked)">
          <span class="toggle-slider"></span>
        </label>
      </div>
      <div class="collaborators-list" ${!isCollaborative ? 'style="opacity: 0.5; pointer-events: none;"' : ''}>
        ${collaborators.length === 0 ?
        '<p class="empty-text">No collaborators yet</p>' :
        collaborators.map(c => `
            <div class="collaborator-item">
              <div class="collaborator-avatar">
                <img src="https://cdn.discordapp.com/avatars/${c.user_id}/placeholder.png" 
                     onerror="this.src='https://placehold.co/40x40/2d2d2d/fff.png?text=👤'" alt="Avatar">
              </div>
              <div class="collaborator-info">
                <span class="collaborator-name">${c.username || c.user_id}</span>
                <span class="collaborator-role">${c.role || 'editor'}</span>
              </div>
              <button class="collaborator-remove icon-btn small danger" 
                      onclick="dashboard.removeCollaborator('${c.user_id}')" title="Remove">
                <i class="ph ph-x"></i>
              </button>
            </div>
          `).join('')
      }
      </div>
      <button class="action-btn small" onclick="dashboard.openInviteCollaboratorModal()" 
              ${!isCollaborative ? 'disabled' : ''}>
        <i class="ph ph-user-plus"></i> Invite
      </button>
    `;
  }

  // ============================================
  // SHARE TRACK FUNCTIONALITY
  // ============================================

  async shareCurrentTrack() {
    const currentTrack = this.playerState?.currentTrack;
    if (!currentTrack) {
      this.showToast('No track playing', 'error');
      return;
    }

    const track = currentTrack;
    // Normalized info
    const info = track.info || track;
    let shareUrl = info.uri || '';
    const source = info.sourceName || 'unknown';
    const identifier = info.identifier;

    // Handle spotify: URIs
    if (shareUrl && shareUrl.startsWith('spotify:')) {
      const parts = shareUrl.split(':');
      if (parts.length >= 3) {
        shareUrl = `https://open.spotify.com/${parts[1]}/${parts[2]}`;
      }
    }

    // Intelligent URL Reconstruction if URI is missing or local
    if ((!shareUrl || !shareUrl.startsWith('http')) && identifier) {
      if (source === 'spotify') {
        shareUrl = `https://open.spotify.com/track/${identifier}`;
      } else if (source === 'youtube') {
        shareUrl = `https://youtu.be/${identifier}`;
      }
    }

    try {
      if (shareUrl && shareUrl.startsWith('http')) {
        await navigator.clipboard.writeText(shareUrl);
        let niceSource = (source.charAt(0).toUpperCase() + source.slice(1)) || 'Link';
        if (shareUrl.includes('spotify')) niceSource = 'Spotify';
        if (shareUrl.includes('youtu')) niceSource = 'YouTube';

        this.showToast(`${niceSource} link copied!`, 'success');
      } else {
        // Fallback: Try to force a link if identifier exists
        let fallbackUrl = '';
        if (identifier) {
          if (source === 'spotify') fallbackUrl = `https://open.spotify.com/track/${identifier}`;
          else if (source === 'youtube') fallbackUrl = `https://youtu.be/${identifier}`;
        }

        if (fallbackUrl) {
          await navigator.clipboard.writeText(fallbackUrl);
          this.showToast(`Link copied: ${fallbackUrl}`, 'success');
        } else {
          // Last resort: just text
          const text = `${info.title} - ${info.author}`;
          await navigator.clipboard.writeText(text);
          this.showToast(`Track info copied (No direct link available)`, 'info');
        }
      }
    } catch (e) {
      console.error('Share failed:', e);
      this.showToast('Could not copy to clipboard', 'error');
    }
  }


  // ============================================
  // TRACK HISTORY PANEL
  // ============================================

  trackHistory = [];
  maxHistorySize = 20;

  addToHistory() {
    const currentTrack = this.playerState?.currentTrack;
    if (!currentTrack) return;

    const track = {
      title: currentTrack.title,
      author: currentTrack.author,
      uri: currentTrack.uri,
      artworkUrl: currentTrack.artworkUrl,
      duration: currentTrack.duration,
      playedAt: new Date().toISOString()
    };

    // Prevent immediate duplicates
    if (this.trackHistory.length > 0) {
      const last = this.trackHistory[0];
      if (last.uri === track.uri || (last.title === track.title && last.author === track.author)) {
        return;
      }
    }

    this.trackHistory.unshift(track);
    if (this.trackHistory.length > 50) this.trackHistory.pop();

    localStorage.setItem('tymee_history', JSON.stringify(this.trackHistory));
    this.renderHistoryList();
  }

  loadHistoryFromStorage() {
    try {
      const saved = localStorage.getItem('tymee_history'); // Changed key from 'trackHistory' to 'tymee_history'
      if (saved) {
        this.trackHistory = JSON.parse(saved);
      }
    } catch (e) { /* ignore */ }
  }

  toggleHistoryPanel() {
    const panel = document.getElementById('historyPanel');
    if (!panel) return;

    const isHidden = panel.classList.contains('hidden');

    if (isHidden) {
      panel.classList.remove('hidden');
      this.renderHistoryList();
    } else {
      panel.classList.add('hidden');
    }
  }

  renderHistoryList() {
    const list = document.getElementById('historyList');
    if (!list) return;

    if (this.trackHistory.length === 0) {
      list.innerHTML = `
        <div class="empty-state">
          <i class="ph ph-music-notes-simple"></i>
          <p>No history yet</p>
        </div>
      `;
      return;
    }

    list.innerHTML = this.trackHistory.map((track, index) => {
      const artwork = track.artworkUrl || 'https://placehold.co/50x50/2d2d2d/fff.png?text=♪';
      const timeAgo = this.formatTimeAgo(track.playedAt);

      return `
        <div class="history-item" onclick="dashboard.replayFromHistory(${index})">
          <img src="${artwork}" alt="Art" class="history-artwork" 
               onerror="this.src='https://placehold.co/50x50/2d2d2d/fff.png?text=♪'">
          <div class="history-info">
            <span class="history-title">${this.escapeHtml(track.title || 'Unknown')}</span>
            <span class="history-artist">${this.escapeHtml(track.author || 'Unknown')} • ${timeAgo}</span>
          </div>
          <button class="icon-btn small" title="Play again">
            <i class="ph ph-play-circle"></i>
          </button>
        </div>
      `;
    }).join('');
  }

  formatTimeAgo(timestamp) {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  }

  async replayFromHistory(index) {
    const track = this.trackHistory[index];
    if (!track) return;

    const identifier = track.uri || track.identifier;
    if (identifier) {
      this.showToast(`🔄 Replaying: ${track.title}`, 'info');
      await this.addTrackToQueue(identifier, 'play');
      this.toggleHistoryPanel(); // Close panel
    }
  }

  // ============================================
  // KEYBOARD SHORTCUTS HELP
  // ============================================

  showShortcutsHelp() {
    const modal = document.getElementById('shortcutsModal');
    if (modal) {
      modal.classList.remove('hidden');
    }
  }

  toggleShortcuts(enabled) {
    localStorage.setItem('shortcuts_enabled', enabled);
    const msg = enabled ? "Keyboard shortcuts enabled" : "Keyboard shortcuts disabled";
    this.showToast(msg, "info");
  }

  setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      // Check for user setting (to be implemented), default to true
      const shortcutsEnabled = localStorage.getItem('shortcuts_enabled') !== 'false';
      if (!shortcutsEnabled) return;

      // Don't trigger if typing in input
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) {
        return;
      }

      // Explicitly IGNORE browser refresh keys to allow default behavior
      // F5, Ctrl+R, Ctrl+F5, Ctrl+Shift+R
      if (
        e.key === 'F5' ||
        (e.ctrlKey && e.key === 'r') ||
        (e.metaKey && e.key === 'r') ||
        (e.ctrlKey && e.shiftKey && e.key === 'R') || // Case sensitive for Shift? usually 'R' or 'r' works
        (e.ctrlKey && e.key === 'F5')
      ) {
        return;
      }

      // Prevent default for our shortcuts ONLY if handled
      const handled = this.handleKeyboardShortcut(e);
      if (handled) {
        e.preventDefault();
      }
    });
  }

  handleKeyboardShortcut(e) {
    const key = e.key.toLowerCase();

    // Playback controls
    if (key === ' ' || key === 'spacebar') {
      this.togglePlayPause();
      return true;
    }
    if (key === 'arrowright' && !e.shiftKey) {
      this.skipTrack();
      return true;
    }
    if (key === 'arrowleft' && !e.shiftKey) {
      this.previousTrack();
      return true;
    }
    if (key === 'arrowright' && e.shiftKey) {
      this.seekForward(10000);
      return true;
    }
    if (key === 'arrowleft' && e.shiftKey) {
      this.seekBackward(10000);
      return true;
    }

    // Volume controls
    if (key === 'arrowup') {
      this.adjustVolume(10);
      return true;
    }
    if (key === 'arrowdown') {
      this.adjustVolume(-10);
      return true;
    }
    if (key === 'm') {
      // Toggle Mute (only if no modifiers)
      if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        this.toggleMute();
        return true;
      }
    }

    // Queue controls
    if (key === 'r') {
      this.toggleRepeat();
      return true;
    }
    if (key === 's' && !e.ctrlKey && !e.metaKey) {
      this.shuffleQueue();
      return true;
    }
    if (key === 'l') {
      this.toggleLikeCurrentTrack();
      return true;
    }

    // Navigation
    if (key === '1') {
      this.showPage('player');
      return true;
    }
    if (key === '2') {
      this.showPage('search');
      return true;
    }
    if (key === '3') {
      this.showPage('playlists');
      return true;
    }
    if (key === '?') {
      this.showShortcutsHelp();
      return true;
    }

    return false;
  }

  async seekForward(ms) {
    if (!this.playerState?.position) return;
    const newPos = Math.min(this.playerState.position + ms, this.playerState.currentTrack?.duration || 0);
    await this.seek(newPos);
    this.showToast(`⏩ +${ms / 1000}s`, 'info');
  }

  async seekBackward(ms) {
    if (!this.playerState?.position) return;
    const newPos = Math.max(this.playerState.position - ms, 0);
    await this.seek(newPos);
    this.showToast(`⏪ -${ms / 1000}s`, 'info');
  }

  adjustVolume(delta) {
    const slider = document.getElementById('volumeSlider');
    if (!slider) return;
    const newVal = Math.max(0, Math.min(100, parseInt(slider.value) + delta));
    slider.value = newVal;
    this.setVolume(newVal);
  }

  toggleMute() {
    const slider = document.getElementById('volumeSlider');
    if (!slider) return;

    if (parseInt(slider.value) > 0) {
      this._savedVolume = slider.value;
      slider.value = 0;
      this.setVolume(0);
      this.showToast('🔇 Muted', 'info');
    } else {
      slider.value = this._savedVolume || 50;
      this.setVolume(parseInt(slider.value));
      this.showToast('🔊 Unmuted', 'info');
    }
  }

  // ============================================
  // AUDIO VISUALIZER CONTROLS
  // ============================================

  cycleVisualizerMode() {
    console.log("Cycling visualizer mode...");
    if (!this.visualizer) {
      console.warn("Visualizer instance not found in cycleVisualizerMode");
      return;
    }

    const newMode = this.visualizer.cycleMode();
    console.log("New visualizer mode:", newMode);
    const modeNames = {
      aura: '🌟 Aura',
      bars: '📊 Bars',
      wave: '🌊 Wave',
      particles: '✨ Particles'
    };

    this.showToast(`Visualizer: ${modeNames[newMode] || newMode}`, 'info');
  }

  // --- ADMIN ACTIONS ---
  async clearGuildStats() {
    if (!this.guildId) return;
    if (!confirm('Are you sure you want to clear all statistics for this server? This cannot be undone.')) return;

    try {
      this.showToast('Clearing statistics...', 'info');
      const res = await this.apiCall('DELETE', `/api/stats/${this.guildId}/clear`);
      if (res && res.success) {
        this.showToast('Statistics cleared successfully', 'success');
        // Refresh stats page
        if (typeof this.loadStats === 'function') this.loadStats();
      }
    } catch (e) {
      this.showToast('Failed to clear stats', 'error');
    }
  }

  async resetPlayerState() {
    if (!this.guildId) return;
    if (!confirm('This will force a player reset and reconnect. Playback may be interrupted. Continue?')) return;

    try {
      this.showToast('Resetting player...', 'info');
      const res = await this.apiCall('POST', `/api/player/${this.guildId}/reset`);
      if (res && res.success) {
        this.showToast('Player reset successfully', 'success');
      }
    } catch (e) {
      this.showToast('Failed to reset player', 'error');
    }
  }
}

/**
 * Premium Audio Visualizer for Dashboard
 * Multiple visualization modes: aura, bars, wave, particles
 */
class AudioVisualizer {
  constructor(canvas) {
    if (!canvas) return;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.isPlaying = false;
    this.energy = 0.5;
    this.baseHue = 240; // Default Indigo/Blue
    this.pulse = 0;
    this.mode = 'aura'; // 'aura', 'bars', 'wave', 'particles'
    this.bars = [];
    this.particles = [];
    this.wavePoints = [];

    // Initialize bars
    for (let i = 0; i < 32; i++) {
      this.bars.push({ height: 0, targetHeight: 0, velocity: 0 });
    }

    // Initialize particles
    for (let i = 0; i < 30; i++) {
      this.particles.push({
        x: Math.random(),
        y: Math.random(),
        size: Math.random() * 3 + 1,
        speed: Math.random() * 0.5 + 0.2,
        angle: Math.random() * Math.PI * 2
      });
    }

    this.resize();
    window.addEventListener('resize', () => this.resize());

    // Ensure canvas is visible immediately
    this.canvas.classList.remove('hidden');

    this.animate();
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    this.canvas.width = rect.width * window.devicePixelRatio;
    this.canvas.height = rect.height * window.devicePixelRatio;
    this.ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
  }

  setState(isPlaying) {
    this.isPlaying = isPlaying;
    // Force resize check when state allows playing, just in case
    if (isPlaying) this.resize();
  }

  setMode(mode) {
    this.mode = mode;
    // Force reset filter to ensure clarity or blur as needed
    this.ctx.filter = 'none';
  }

  cycleMode() {
    // All visualizer modes available
    const modes = ['aura', 'particles', 'bars', 'wave', 'spectrum', 'orbit'];
    const idx = modes.indexOf(this.mode);
    const nextText = modes[(idx + 1) % modes.length];
    this.setMode(nextText);
    return nextText;
  }

  updateColor(theme) {
    const hueMap = {
      default: 235,   // Indigo
      peach: 15,      // Peach
      nebula: 260,    // Purple
      ocean: 180,     // Teal
      synthwave: 325, // Pink
      aurora: 145,    // Green
      emerald: 160,   // Emerald
      midnight: 220,  // Blue
      sunset: 25,     // Orange
      rose: 350       // Rose
    };
    this.baseHue = hueMap[theme] || 235;
  }

  // Simulate audio energy with pseudo-random variations
  simulateEnergy() {
    const time = Date.now() / 1000;
    // Increased base and beat intensity for better visibility
    const base = 0.6 + Math.sin(time * 2) * 0.2;
    const beat = Math.sin(time * 10) > 0.5 ? 0.5 : 0;
    const random = Math.random() * 0.2;
    return Math.min(1.5, base + beat + random); // Higher threshold for more intense glow
  }

  animate() {
    const w = this.canvas.width / window.devicePixelRatio;
    const h = this.canvas.height / window.devicePixelRatio;

    if (w <= 0 || h <= 0) {
      // Try to resize if dimensions are missing
      this.resize();
      requestAnimationFrame(() => this.animate());
      return;
    }

    const centerX = w / 2;
    const centerY = h / 2;

    this.ctx.clearRect(0, 0, w, h);

    if (this.isPlaying) {
      this.energy = this.simulateEnergy();
      this.pulse += 0.05;

      switch (this.mode) {
        case 'particles':
          this.drawParticles(w, h, centerX, centerY);
          break;
        case 'bars':
          this.drawBars(w, h);
          break;
        case 'wave':
          this.drawWave(w, h, centerX, centerY);
          break;
        case 'spectrum':
          this.drawSpectrum(w, h, centerX, centerY);
          break;
        case 'orbit':
          this.drawOrbit(w, h, centerX, centerY);
          break;
        case 'aura':
        default:
          this.drawAura(w, h, centerX, centerY);
      }
    } else {
      // Idle state: no visualization, just clear canvas
      // (The white breathing pulse was distracting)
    }

    requestAnimationFrame(() => this.animate());
  }

  drawAura(w, h, centerX, centerY) {
    // Dynamic aura pulses
    for (let i = 0; i < 4; i++) {
      const radius = Math.max(1, (w * 0.35) + Math.sin(this.pulse + i) * 30 * this.energy);
      // Increased base alpha from 0.4 to 0.6
      const alpha = (0.6 - (i * 0.1)) * Math.min(1, this.energy);

      const gradient = this.ctx.createRadialGradient(
        centerX, centerY, 0,
        centerX, centerY, radius
      );

      const hue = (this.baseHue + Math.sin(this.pulse * 0.5) * 30);
      gradient.addColorStop(0, `hsla(${hue}, 80%, 65%, ${alpha})`);
      gradient.addColorStop(0.5, `hsla(${hue + 20}, 70%, 55%, ${alpha * 0.7})`);
      gradient.addColorStop(1, `hsla(${hue}, 70%, 60%, 0)`);

      this.ctx.fillStyle = gradient;
      this.ctx.beginPath();
      this.ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
      this.ctx.fill();
    }
  }

  drawBars(w, h) {
    const barCount = this.bars.length;
    const barWidth = w / barCount * 0.7;
    const gap = w / barCount * 0.3;
    const maxHeight = h * 0.6;

    // Update bar heights
    for (let i = 0; i < barCount; i++) {
      const phase = i / barCount * Math.PI * 2;
      const target = (0.3 + Math.sin(this.pulse * 2 + phase) * 0.5 +
        Math.sin(this.pulse * 5 + phase * 2) * 0.2) * this.energy;

      this.bars[i].targetHeight = target * maxHeight;
      this.bars[i].height += (this.bars[i].targetHeight - this.bars[i].height) * 0.15;
    }

    // Draw bars
    for (let i = 0; i < barCount; i++) {
      const x = i * (barWidth + gap) + gap / 2;
      const barHeight = this.bars[i].height;

      const gradient = this.ctx.createLinearGradient(x, h, x, h - barHeight);
      const hue = this.baseHue + (i / barCount) * 60;
      gradient.addColorStop(0, `hsla(${hue}, 80%, 60%, 0.8)`);
      gradient.addColorStop(1, `hsla(${hue + 30}, 70%, 70%, 0.4)`);

      this.ctx.fillStyle = gradient;
      this.ctx.beginPath();
      this.ctx.roundRect(x, h - barHeight, barWidth, barHeight, [4, 4, 0, 0]);
      this.ctx.fill();
    }
  }

  drawWave(w, h, centerX, centerY) {
    this.ctx.strokeStyle = `hsla(${this.baseHue}, 80%, 60%, 0.8)`;
    this.ctx.lineWidth = 3;
    this.ctx.beginPath();

    const bufferLength = 120; // Resolution
    const spacing = w / bufferLength;

    // Move to starting point
    this.ctx.moveTo(0, h / 2);

    for (let i = 0; i < bufferLength; i++) {
      // Create an oscilloscope sine wave effect
      // Mix low frequency pulse with higher frequency variation
      const time = Date.now() / 1000;
      const x = i * spacing;

      // Simulating waveform data since we don't have real audio data here (fake visualizer)
      // In a real app, this would use analyser.getByteTimeDomainData
      const freq = (i / bufferLength) * Math.PI * 4 + this.pulse * 2;
      const amplitude = (h * 0.25) * this.energy * Math.sin(this.pulse + i * 0.1);

      const y = (h / 2) + Math.sin(freq) * amplitude * Math.sin(time * 5 + i * 0.05);

      this.ctx.lineTo(x, y);
    }

    this.ctx.stroke();

    // Mirror effect for 'Stereo' look
    this.ctx.strokeStyle = `hsla(${this.baseHue + 40}, 80%, 60%, 0.5)`;
    this.ctx.beginPath();
    this.ctx.moveTo(0, h / 2);
    for (let i = 0; i < bufferLength; i++) {
      const time = Date.now() / 1000;
      const x = i * spacing;
      const freq = (i / bufferLength) * Math.PI * 4 + this.pulse * 2 + Math.PI;
      const amplitude = (h * 0.25) * this.energy * Math.sin(this.pulse + i * 0.1);
      const y = (h / 2) + Math.sin(freq) * amplitude * Math.sin(time * 5 + i * 0.05);
      this.ctx.lineTo(x, y);
    }
    this.ctx.stroke();
  }

  drawParticles(w, h, centerX, centerY) {
    // Distinct dark mode without drawing Aura
    // Just a subtle background glow
    const bgGradient = this.ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, w / 1.5);
    bgGradient.addColorStop(0, `hsla(${this.baseHue}, 50%, 10%, 0.4)`);
    bgGradient.addColorStop(1, `hsla(${this.baseHue}, 50%, 5%, 0)`);
    this.ctx.fillStyle = bgGradient;
    this.ctx.fillRect(0, 0, w, h);

    // Update and draw particles
    for (const p of this.particles) {
      // Move particles
      p.angle += 0.01 + this.energy * 0.03; // Faster movement with energy

      const spiralBase = w * 0.1;
      // Spiral movement
      const radius = spiralBase + (Math.sin(this.pulse * 0.5 + p.angle) * w * 0.3) + (p.x * 50);

      const x = centerX + Math.cos(p.angle * p.speed) * radius;
      const y = centerY + Math.sin(p.angle * p.speed) * radius;

      const hue = this.baseHue + (p.angle * 20) % 360; // Colorful
      const alpha = 0.6 + Math.min(1, this.energy) * 0.4;

      // Draw particle
      this.ctx.fillStyle = `hsla(${hue}, 90%, 70%, ${alpha})`;
      this.ctx.beginPath();
      this.ctx.arc(x, y, p.size * (1 + this.energy), 0, Math.PI * 2);
      this.ctx.fill();
    }
  }

  /**
   * Spectrum visualizer - circular frequency bars
   */
  drawSpectrum(w, h, centerX, centerY) {
    const barCount = 64;
    const minRadius = w * 0.15;
    const maxBarLength = w * 0.25;

    for (let i = 0; i < barCount; i++) {
      const angle = (i / barCount) * Math.PI * 2 - Math.PI / 2;
      const freq = (Math.sin(this.pulse * 3 + i * 0.3) + 1) * 0.5;
      const barLength = (0.3 + freq * 0.7) * maxBarLength * this.energy;

      const x1 = centerX + Math.cos(angle) * minRadius;
      const y1 = centerY + Math.sin(angle) * minRadius;
      const x2 = centerX + Math.cos(angle) * (minRadius + barLength);
      const y2 = centerY + Math.sin(angle) * (minRadius + barLength);

      const hue = this.baseHue + (i / barCount) * 60;
      const alpha = 0.6 + freq * 0.4;

      this.ctx.strokeStyle = `hsla(${hue}, 80%, 60%, ${alpha})`;
      this.ctx.lineWidth = 3;
      this.ctx.lineCap = 'round';
      this.ctx.beginPath();
      this.ctx.moveTo(x1, y1);
      this.ctx.lineTo(x2, y2);
      this.ctx.stroke();
    }

    // Center glow
    const centerGlow = this.ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, minRadius);
    centerGlow.addColorStop(0, `hsla(${this.baseHue}, 70%, 60%, ${0.4 * this.energy})`);
    centerGlow.addColorStop(1, `hsla(${this.baseHue}, 70%, 60%, 0)`);
    this.ctx.fillStyle = centerGlow;
    this.ctx.beginPath();
    this.ctx.arc(centerX, centerY, minRadius, 0, Math.PI * 2);
    this.ctx.fill();
  }

  /**
   * Orbit visualizer - orbiting energy rings
   */
  drawOrbit(w, h, centerX, centerY) {
    const orbits = 4;
    const baseRadius = w * 0.12;
    const maxRadius = w * 0.4;

    // Draw orbital rings
    for (let i = 0; i < orbits; i++) {
      const radius = baseRadius + ((maxRadius - baseRadius) / orbits) * i;
      const speed = 0.5 + i * 0.3;
      const alpha = (0.3 + this.energy * 0.3) * (1 - i / orbits * 0.5);

      this.ctx.strokeStyle = `hsla(${this.baseHue + i * 25}, 70%, 60%, ${alpha * 0.5})`;
      this.ctx.lineWidth = 1;
      this.ctx.beginPath();
      this.ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
      this.ctx.stroke();

      // Orbiting dots
      const dotCount = 3 + i;
      for (let d = 0; d < dotCount; d++) {
        const dotAngle = this.pulse * speed + (d / dotCount) * Math.PI * 2;
        const wobble = Math.sin(this.pulse * 2 + d) * 5 * this.energy;
        const dx = centerX + Math.cos(dotAngle) * (radius + wobble);
        const dy = centerY + Math.sin(dotAngle) * (radius + wobble);
        const dotSize = 4 + this.energy * 3;

        const dotGradient = this.ctx.createRadialGradient(dx, dy, 0, dx, dy, dotSize * 3);
        dotGradient.addColorStop(0, `hsla(${this.baseHue + i * 25 + d * 10}, 80%, 70%, ${0.8 * this.energy})`);
        dotGradient.addColorStop(1, `hsla(${this.baseHue + i * 25}, 70%, 60%, 0)`);

        this.ctx.fillStyle = dotGradient;
        this.ctx.beginPath();
        this.ctx.arc(dx, dy, dotSize * 3, 0, Math.PI * 2);
        this.ctx.fill();

        this.ctx.fillStyle = `hsla(${this.baseHue + i * 25 + d * 10}, 80%, 80%, ${0.9})`;
        this.ctx.beginPath();
        this.ctx.arc(dx, dy, dotSize, 0, Math.PI * 2);
        this.ctx.fill();
      }
    }

    // Center pulse
    const pulseSize = w * 0.08 + Math.sin(this.pulse * 3) * 5 * this.energy;
    const centerPulse = this.ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, pulseSize);
    centerPulse.addColorStop(0, `hsla(${this.baseHue}, 80%, 70%, ${0.6 * this.energy})`);
    centerPulse.addColorStop(0.5, `hsla(${this.baseHue + 20}, 70%, 60%, ${0.3 * this.energy})`);
    centerPulse.addColorStop(1, `hsla(${this.baseHue}, 70%, 60%, 0)`);
    this.ctx.fillStyle = centerPulse;
    this.ctx.beginPath();
    this.ctx.arc(centerX, centerY, pulseSize, 0, Math.PI * 2);
    this.ctx.fill();
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