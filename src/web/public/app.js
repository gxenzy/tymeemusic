class MusicDashboard {
    constructor() {
        console.log('=== MUSIC DASHBOARD INITIALIZING ===');
        this.apiKey = 'MTQ1Mzk3NDM1MjY5NjQ0Mjk1MQ'; // Default API key from config
        this.guildId = '';
        this.ws = null;
        this.playerState = null;
        this.queue = [];
        this.positionUpdateInterval = null;
        this.user = null;
        this.servers = [];
        this.currentPage = 'player';
        this.emojiMappings = [];
        this.serverEmojis = [];

        this.initializeElements();
        this.attachEventListeners();
        
        // Small delay to let inline auth script complete
        setTimeout(() => {
            this.checkAuth();
        }, 100);
    }

    initializeElements() {
        this.authSection = document.getElementById('authSection');
        this.userSection = document.getElementById('userSection');
        this.loginBtn = document.getElementById('loginBtn');
        this.logoutBtn = document.getElementById('logoutBtn');
        this.userAvatar = document.getElementById('userAvatar');
        this.userName = document.getElementById('userName');
        
        this.serverSelector = document.getElementById('serverSelector');
        this.serverList = document.getElementById('serverList');
        
        this.navBar = document.getElementById('navBar');
        this.connectionStatus = document.getElementById('connectionStatus');
        this.statusText = document.getElementById('statusText');
        this.mainContent = document.getElementById('mainContent');
        
        this.loginRequired = document.getElementById('loginRequired');
        this.loginRequiredBtn = document.getElementById('loginRequiredBtn');
        this.errorDisplay = document.getElementById('errorDisplay');
        this.errorMessage = document.getElementById('errorMessage');
        
        this.pages = {
            player: document.getElementById('playerPage'),
            queue: document.getElementById('queuePage'),
            playlists: document.getElementById('playlistsPage'),
            settings: document.getElementById('settingsPage'),
            emojis: document.getElementById('emojisPage'),
            stats: document.getElementById('statsPage')
        };
        
        this.albumArt = document.getElementById('albumArt');
        this.noArtwork = document.getElementById('noArtwork');
        this.trackTitle = document.getElementById('trackTitle');
        this.trackArtist = document.getElementById('trackArtist');
        this.guildName = document.getElementById('guildName');
        
        this.progressBar = document.getElementById('progressBar');
        this.progressFill = document.getElementById('progressFill');
        this.currentTime = document.getElementById('currentTime');
        this.totalTime = document.getElementById('totalTime');
        
        this.playPauseBtn = document.getElementById('playPauseBtn');
        this.previousBtn = document.getElementById('previousBtn');
        this.nextBtn = document.getElementById('nextBtn');
        this.shuffleBtn = document.getElementById('shuffleBtn');
        this.repeatBtn = document.getElementById('repeatBtn');
        
        this.volumeSlider = document.getElementById('volumeSlider');
        this.volumeValue = document.getElementById('volumeValue');
        this.volumeIcon = document.getElementById('volumeIcon');
        
        this.queueList = document.getElementById('queueList');
        this.queueCount = document.getElementById('queueCount');
        
        this.emojiMappingsContainer = document.getElementById('emojiMappings');
        this.emojiCategoryBtns = document.querySelectorAll('.category-btn');
    }

    async checkAuth() {
        console.log('=== FRONTEND AUTH CHECK (APP) ===');
        
        // Try to verify with server first
        try {
            console.log('Verifying auth with server...');
            const response = await fetch('/auth/check', { credentials: 'same-origin' });
            console.log('Response status:', response.status);
            const data = await response.json();
            console.log('Full API response:', JSON.stringify(data));
            
            if (data.authenticated && data.user) {
                this.user = data.user;
                localStorage.setItem('dashboard_user', JSON.stringify(data.user));
                localStorage.setItem('dashboard_auth', 'true');
                
                if (this.user?.id) {
                    localStorage.setItem('dashboard_user_id', this.user.id);
                }
                
                console.log('User from API:', this.user.username);
                this.showUserSection();
                await this.loadUserServers();
                this.showDashboard();
                return;
            } else {
                // Server says not authenticated - clear any stale localStorage data
                console.log('Server rejected auth - clearing localStorage');
                localStorage.removeItem('dashboard_user');
                localStorage.removeItem('dashboard_auth');
                localStorage.removeItem('dashboard_user_id');
                this.showLoginRequired();
                return;
            }
        } catch (error) {
            console.error('Auth check failed:', error);
        }
        
        // Network error - show login (don't use stale localStorage)
        console.log('Network error - showing login screen');
        this.showLoginRequired();
    }
    
    showUserSection() {
        console.log('=== SHOWING USER SECTION ===');
        this.authSection.classList.add('hidden');
        this.userSection.classList.remove('hidden');
        this.loginRequired.classList.add('hidden');
        
        if (this.user) {
            this.userAvatar.src = `https://cdn.discordapp.com/avatars/${this.user.id}/${this.user.avatar}.png?size=64`;
            this.userName.textContent = `${this.user.username}#${this.user.discriminator || '0'}`;
        }
    }

    showLoginRequired() {
        console.log('=== SHOWING LOGIN REQUIRED ===');
        this.loginRequired.classList.remove('hidden');
        this.navBar.classList.add('hidden');
        this.serverSelector.classList.add('hidden');
        this.userSection.classList.add('hidden');
        this.authSection.classList.remove('hidden');
        Object.values(this.pages).forEach(page => page?.classList.add('hidden'));
    }

    showDashboard() {
        console.log('=== SHOWING DASHBOARD ===');
        this.loginRequired.classList.add('hidden');
        this.navBar.classList.remove('hidden');
        this.serverSelector.classList.remove('hidden');
        this.showPage('player');
    }

    showPage(pageName) {
        console.log('=== SHOWING PAGE:', pageName, '===');
        this.currentPage = pageName;
        
        Object.values(this.pages).forEach(page => {
            if (page) page.classList.add('hidden');
        });
        
        if (this.pages[pageName]) {
            this.pages[pageName].classList.remove('hidden');
        }
        
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.page === pageName);
        });
        
        // Check if guild is selected for pages that require it
        const pagesRequiringGuild = ['playlists', 'settings', 'stats', 'emojis'];
        if (pagesRequiringGuild.includes(pageName) && !this.guildId) {
            console.log('Guild not selected, showing message');
            alert('Please select a server first to access this page');
            this.showPage('player');
            return;
        }
        
        // Load data for specific pages
        if (pageName === 'playlists') {
            this.loadPlaylists();
        } else if (pageName === 'settings') {
            this.loadSettings();
        } else if (pageName === 'stats') {
            this.loadStats();
        } else if (pageName === 'emojis') {
            this.loadServerEmojis();
            this.loadEmojiMappings();
        }
    }

    async loadUserServers() {
        try {
            console.log('Loading user servers...');
            
            // Parse cookies for auth
            const cookies = document.cookie.split(';').reduce((acc, cookie) => {
                const [name, value] = cookie.trim().split('=');
                if (name && value) acc[name] = decodeURIComponent(value);
                return acc;
            }, {});
            
            const response = await fetch('/api/user/guilds', {
                headers: {
                    'Authorization': `Bearer ${cookies.auth_token || ''}`
                }
            });
            
            console.log('Response status:', response.status);
            
            if (!response.ok) {
                // If API fails, just show empty server list
                console.log('Failed to load servers, showing empty state');
                this.serverList.innerHTML = '<p>No managed servers found. Make sure the bot is in your server and you have Manage Server permission.</p>';
                this.serverSelector.classList.remove('hidden');
                return;
            }
            
            const data = await response.json();
            this.servers = Array.isArray(data) ? data : [];
            console.log('Servers loaded:', this.servers.length);
            
            if (this.servers.length === 0) {
                this.serverList.innerHTML = '<p>No managed servers found. Make sure the bot is in your server and you have Manage Server permission.</p>';
            } else {
                this.renderServerList();
            }
            
            this.serverSelector.classList.remove('hidden');
        } catch (error) {
            console.error('Failed to load servers:', error);
            // Still show server selector but with error message
            this.serverList.innerHTML = '<p>Failed to load servers. Click login to refresh.</p>';
            this.serverSelector.classList.remove('hidden');
        }
    }

    renderServerList() {
        console.log('=== RENDER SERVER LIST ===');
        console.log('Servers count:', this.servers.length);
        console.log('Server list element:', this.serverList);
        
        if (this.servers.length === 0) {
            console.log('No servers to render');
            this.serverList.innerHTML = '<p>No managed servers found. Make sure the bot is in your server and you have Manage Server permission.</p>';
            return;
        }
        
        this.serverList.innerHTML = this.servers.map(server => `
            <div class="server-item" data-guild-id="${server.id}">
                ${server.icon 
                    ? `<img src="https://cdn.discordapp.com/icons/${server.id}/${server.icon}.png?size=64" alt="${server.name}" class="server-icon">`
                    : `<div class="server-icon-placeholder">${server.name.charAt(0)}</div>`
                }
                <span class="server-name">${this.escapeHtml(server.name)}</span>
            </div>
        `).join('');

        console.log('Rendered HTML:', this.serverList.innerHTML);
        
        const items = this.serverList.querySelectorAll('.server-item');
        console.log('Server items found:', items.length);
        
        // Use event delegation on the server list container
        this.serverList.onclick = (e) => {
            const item = e.target.closest('.server-item');
            if (item) {
                const guildId = item.dataset.guildId;
                console.log('=== SERVER CLICKED (delegation) ===', guildId);
                this.selectServer(guildId);
            }
        };
        
        // Also attach direct click handlers as backup
        items.forEach((item, index) => {
            console.log(`Attaching click to server item ${index}:`, item.dataset.guildId);
            item.style.cursor = 'pointer';
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                console.log('=== SERVER CLICKED (direct) ===', item.dataset.guildId);
                this.selectServer(item.dataset.guildId);
            });
        });
        
        console.log('Click handlers attached successfully');
    }

    async selectServer(guildId) {
        console.log('=== SELECT SERVER CALLED ===', guildId);
        
        if (!guildId) {
            console.error('ERROR: guildId is undefined or empty!');
            alert('Error: Could not select server. Please try again.');
            return;
        }
        
        this.guildId = guildId;
        console.log('guildId set to:', this.guildId);
        
        this.serverSelector.classList.add('hidden');
        this.navBar.classList.remove('hidden');
        this.loginRequired.classList.add('hidden');
        
        const server = this.servers.find(s => s.id === guildId);
        if (server) {
            this.guildName.textContent = server.name;
            console.log('Selected server:', server.name);
        } else {
            this.guildName.textContent = 'Unknown Server';
            console.warn('Server not found in servers list');
        }
        
        console.log('=== LOADING PLAYER STATE ===');
        await this.loadPlayerState();
        
        console.log('=== LOADING QUEUE ===');
        await this.loadQueue();
        
        console.log('=== LOADING SERVER EMOJIS ===');
        await this.loadServerEmojis();
        
        console.log('=== LOADING EMOJI MAPPINGS ===');
        await this.loadEmojiMappings();
        
        console.log('=== CONNECTING WEBSOCKET ===');
        this.connectWebSocket();
        
        this.updateConnectionStatus(true);
        
        console.log('=== SHOWING PLAYER PAGE ===');
        this.showPage('player');
    }
    
    showServerSelector() {
        console.log('=== SHOWING SERVER SELECTOR ===');
        
        // Disconnect websocket
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.close();
            this.ws = null;
        }
        
        // Reset state
        this.guildId = null;
        
        // Show server selector, hide other sections
        this.serverSelector.classList.remove('hidden');
        this.navBar.classList.add('hidden');
        this.loginRequired.classList.add('hidden');
        
        // Hide all pages
        document.getElementById('playerPage').classList.add('hidden');
        document.getElementById('queuePage').classList.add('hidden');
        document.getElementById('playlistsPage').classList.add('hidden');
        document.getElementById('settingsPage').classList.add('hidden');
        document.getElementById('emojisPage').classList.add('hidden');
        document.getElementById('statsPage').classList.add('hidden');
        
        // Hide connection status
        this.connectionStatus.classList.add('hidden');
        
        // Reload servers to refresh the list
        this.loadUserServers();
    }

    attachEventListeners() {
        this.loginBtn?.addEventListener('click', () => {
            window.location.href = '/auth/discord';
        });
        
        this.loginRequiredBtn?.addEventListener('click', () => {
            window.location.href = '/auth/discord';
        });
        
        this.logoutBtn?.addEventListener('click', () => {
            localStorage.removeItem('dashboard_user');
            localStorage.removeItem('dashboard_auth');
            window.location.href = '/auth/logout';
        });
        
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.addEventListener('click', () => this.showPage(btn.dataset.page));
        });
        
        this.playPauseBtn.addEventListener('click', () => this.togglePlayPause());
        this.previousBtn.addEventListener('click', () => this.previous());
        this.nextBtn.addEventListener('click', () => this.skip());
        this.shuffleBtn.addEventListener('click', () => this.shuffle());
        this.repeatBtn.addEventListener('click', () => this.toggleRepeat());
        
        this.volumeSlider.addEventListener('input', (e) => this.setVolume(e.target.value));
        this.progressBar.addEventListener('click', (e) => this.seek(e));
        
        // Default volume slider in settings
        document.getElementById('defaultVolumeSlider')?.addEventListener('input', (e) => {
            const value = e.target.value;
            document.getElementById('defaultVolumeValue').textContent = value + '%';
        });
        
        document.getElementById('shuffleQueueBtn')?.addEventListener('click', () => this.shuffleQueue());
        document.getElementById('clearQueueBtn')?.addEventListener('click', () => this.clearQueue());
        
        // Playlist event listeners
        document.getElementById('createPlaylistBtn')?.addEventListener('click', () => this.openCreatePlaylistModal());
        
        // Emoji management event listeners
        document.getElementById('syncAllBtn')?.addEventListener('click', () => this.syncAllEmojis());
        document.getElementById('syncPreviewBtn')?.addEventListener('click', () => this.showSyncPreview());
        document.getElementById('resetEmojisBtn')?.addEventListener('click', () => this.resetEmojis());
        document.getElementById('addMappingBtn')?.addEventListener('click', () => this.addEmojiMapping());
        document.getElementById('emojiCategoryFilter')?.addEventListener('change', (e) => {
            this.renderEmojiMappings(e.target.value);
        });
        document.getElementById('mappingSearch')?.addEventListener('input', (e) => {
            const category = document.getElementById('emojiCategoryFilter')?.value || 'all';
            this.renderEmojiMappings(category);
        });
        
        // Server emoji filters
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const search = document.getElementById('emojiSearch')?.value || '';
                this.renderServerEmojis(btn.dataset.filter, search);
            });
        });
        
        document.getElementById('emojiSearch')?.addEventListener('input', (e) => {
            const activeFilter = document.querySelector('.filter-btn.active')?.dataset.filter || 'all';
            this.renderServerEmojis(activeFilter, e.target.value);
        });
        
        // Select from server button
        document.getElementById('selectFromServerBtn')?.addEventListener('click', () => this.openEmojiPicker());
        
        // Settings event listeners
        document.getElementById('saveSettingsBtn')?.addEventListener('click', () => this.saveSettings());
        document.querySelectorAll('.settings-tab').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.settings-tab').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                document.querySelectorAll('.settings-tab-content').forEach(content => content.classList.add('hidden'));
                document.getElementById(`settings-${btn.dataset.tab}`)?.classList.remove('hidden');
            });
        });
    }

    connectWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}?guildId=${this.guildId}&apiKey=${this.apiKey}`;
        
        this.ws = new WebSocket(wsUrl);
        
        this.ws.onopen = () => {
            console.log('WebSocket connected');
            this.startPositionUpdates();
        };
        
        this.ws.onmessage = (event) => {
            const message = JSON.parse(event.data);
            this.handleWebSocketMessage(message);
        };
        
        this.ws.onclose = () => {
            console.log('WebSocket disconnected');
            this.stopPositionUpdates();
            setTimeout(() => {
                if (this.guildId) this.connectWebSocket();
            }, 3000);
        };
        
        this.ws.onerror = (error) => {
            console.error('WebSocket error:', error);
        };
    }

    handleWebSocketMessage(message) {
        if (message.type === 'state_update') {
            this.playerState = message.data;
            this.updateUI();
        } else if (message.type === 'queue_update') {
            this.queue = message.queue || [];
            this.updateQueueUI();
        }
    }

    async loadPlayerState() {
        console.log('=== LOAD PLAYER STATE ===');
        console.log('Guild ID:', this.guildId);
        console.log('API Key:', this.apiKey);
        
        try {
            const response = await fetch(`/api/player/${this.guildId}`, {
                headers: { 'X-API-Key': this.apiKey }
            });
            
            console.log('Player state response status:', response.status);
            console.log('Player state response ok:', response.ok);
            
            if (response.ok) {
                this.playerState = await response.json();
                console.log('Player state loaded:', this.playerState);
                this.updateUI();
            } else {
                const error = await response.json();
                console.error('Error loading player state:', error);
            }
        } catch (error) {
            console.error('Error loading player state:', error);
        }
    }

    async loadQueue() {
        console.log('=== LOAD QUEUE ===');
        console.log('Guild ID:', this.guildId);
        
        try {
            const response = await fetch(`/api/player/${this.guildId}/queue`, {
                headers: { 'X-API-Key': this.apiKey }
            });
            
            console.log('Queue response status:', response.status);
            console.log('Queue response ok:', response.ok);
            
            if (response.ok) {
                const data = await response.json();
                console.log('Queue data:', data);
                this.queue = data.queue || [];
                this.updateQueueUI();
            } else {
                const error = await response.json();
                console.error('Error loading queue:', error);
            }
        } catch (error) {
            console.error('Error loading queue:', error);
        }
    }

    updateUI() {
        if (!this.playerState) return;
        
        const { currentTrack, isPlaying, isPaused, volume, repeatMode, position, guildName } = this.playerState;
        
        if (currentTrack) {
            this.trackTitle.textContent = currentTrack.title;
            this.trackArtist.textContent = currentTrack.author;
            
            if (currentTrack.artworkUrl) {
                this.albumArt.src = currentTrack.artworkUrl;
                this.albumArt.classList.remove('hidden');
                this.noArtwork.classList.add('hidden');
            } else {
                this.albumArt.classList.add('hidden');
                this.noArtwork.classList.remove('hidden');
            }
        } else {
            this.trackTitle.textContent = 'No track playing';
            this.trackArtist.textContent = 'Unknown Artist';
            this.albumArt.classList.add('hidden');
            this.noArtwork.classList.remove('hidden');
        }
        
        this.guildName.textContent = guildName || '';
        
        this.playPauseBtn.textContent = (isPlaying && !isPaused) ? '⏸️' : '▶️';
        this.repeatBtn.classList.toggle('active', repeatMode !== 'off');
        this.shuffleBtn.classList.toggle('active', this.playerState.shuffle);
        
        this.volumeSlider.value = volume;
        this.volumeValue.textContent = `${volume}%`;
        this.volumeIcon.textContent = volume > 50 ? '🔊' : (volume > 0 ? '🔉' : '🔇');
        
        this.updateProgress();
    }

    updateProgress() {
        if (!this.playerState?.currentTrack) {
            this.progressFill.style.width = '0%';
            this.currentTime.textContent = '0:00';
            this.totalTime.textContent = '0:00';
            return;
        }
        
        const { position, currentTrack } = this.playerState;
        const duration = currentTrack.duration || 0;
        
        if (duration > 0 && !currentTrack.isStream) {
            const progress = (position / duration) * 100;
            this.progressFill.style.width = `${progress}%`;
        } else {
            this.progressFill.style.width = '100%';
        }
        
        this.currentTime.textContent = this.formatTime(position);
        this.totalTime.textContent = currentTrack.isStream ? 'LIVE' : this.formatTime(duration);
    }

    updateQueueUI() {
        this.queueCount.textContent = this.queue.length;
        
        if (this.queue.length === 0) {
            this.queueList.innerHTML = '<p class="empty-queue">No tracks in queue</p>';
            return;
        }
        
        this.queueList.innerHTML = this.queue.map((track, index) => `
            <div class="queue-item" data-position="${index + 1}">
                ${track.artworkUrl 
                    ? `<img src="${track.artworkUrl}" alt="${track.title}" class="queue-item-artwork">`
                    : '<div class="queue-item-artwork-placeholder">♪</div>'
                }
                <div class="queue-item-info">
                    <div class="queue-item-title">${this.escapeHtml(track.title)}</div>
                    <div class="queue-item-artist">${this.escapeHtml(track.author || 'Unknown')}</div>
                </div>
                <div class="queue-item-duration">${this.formatTime(track.duration)}</div>
                <button class="queue-item-remove" data-index="${index}">❌</button>
            </div>
        `).join('');
        
        this.queueList.querySelectorAll('.queue-item-remove').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.removeFromQueue(parseInt(btn.dataset.index));
            });
        });
    }

    async removeFromQueue(index) {
        await this.apiCall('DELETE', `/api/queue/${this.guildId}/${index}`);
        await this.loadQueue();
    }

    startPositionUpdates() {
        this.positionUpdateInterval = setInterval(() => {
            if (this.playerState?.isPlaying && !this.playerState?.isPaused) {
                if (this.playerState?.currentTrack && !this.playerState.currentTrack.isStream) {
                    this.playerState.position += 1000;
                    if (this.playerState.position > this.playerState.currentTrack.duration) {
                        this.playerState.position = this.playerState.currentTrack.duration;
                    }
                    this.updateProgress();
                }
            }
        }, 1000);
    }

    stopPositionUpdates() {
        if (this.positionUpdateInterval) {
            clearInterval(this.positionUpdateInterval);
            this.positionUpdateInterval = null;
        }
    }

    seek(e) {
        if (!this.playerState?.currentTrack || this.playerState.currentTrack.isStream) return;
        
        const rect = this.progressBar.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const percent = Math.max(0, Math.min(1, x / rect.width));
        const position = Math.floor(percent * this.playerState.currentTrack.duration);
        
        this.apiCall('POST', `/api/player/${this.guildId}/seek`, { position });
    }

    async togglePlayPause() {
        const endpoint = this.playerState?.isPaused ? 'play' : 'pause';
        await this.apiCall('POST', `/api/player/${this.guildId}/${endpoint}`);
    }

    async previous() {
        await this.apiCall('POST', `/api/player/${this.guildId}/previous`);
    }

    async skip() {
        await this.apiCall('POST', `/api/player/${this.guildId}/skip`);
    }

    async shuffle() {
        await this.apiCall('POST', `/api/player/${this.guildId}/shuffle`);
    }

    async toggleRepeat() {
        const modes = ['none', 'track', 'queue'];
        const currentMode = this.playerState?.repeatMode || 'none';
        const currentIndex = modes.indexOf(currentMode);
        const nextMode = modes[(currentIndex + 1) % modes.length];
        
        await this.apiCall('POST', `/api/player/${this.guildId}/loop`, { mode: nextMode });
    }

    async setVolume(volume) {
        this.volumeValue.textContent = `${volume}%`;
        this.volumeIcon.textContent = volume > 50 ? '🔊' : (volume > 0 ? '🔉' : '🔇');
        await this.apiCall('POST', `/api/player/${this.guildId}/volume`, { volume: parseInt(volume) });
    }

    async shuffleQueue() {
        await this.apiCall('POST', `/api/queue/${this.guildId}/shuffle`);
        await this.loadQueue();
    }

    async clearQueue() {
        await this.apiCall('DELETE', `/api/queue/${this.guildId}`);
        await this.loadQueue();
    }

    async removeFromQueue(index) {
        await this.apiCall('DELETE', `/api/queue/${this.guildId}/${index}`);
        await this.loadQueue();
    }

    async loadEmojiMappings() {
        this.emojiMappingsContainer.innerHTML = '<p class="loading-emojis">Loading emoji mappings...</p>';
        
        try {
            const response = await fetch(`/api/emojis/${this.guildId}`, {
                headers: { 'X-API-Key': this.apiKey }
            });
            
            if (!response.ok) {
                throw new Error(`API error: ${response.status}`);
            }
            
            const data = await response.json();
            this.emojiMappings = Array.isArray(data) ? data : [];
            
            if (this.emojiMappings.length === 0) {
                // Load default emojis if none exist
                this.emojiMappings = this.getDefaultEmojiMappings();
            }
            
            this.renderEmojiMappings('all');
        } catch (error) {
            console.error('Failed to load emoji mappings:', error);
            this.emojiMappings = this.getDefaultEmojiMappings();
            this.renderEmojiMappings('all');
        }
    }

    getDefaultEmojiMappings() {
        return [
            { botName: 'groovy', fallback: '🎵', category: 'music' },
            { botName: 'rhythm', fallback: '🎶', category: 'music' },
            { botName: 'carl-bot', fallback: '🤖', category: 'utility' },
            { botName: 'dynamica', fallback: '💥', category: 'effects' },
            { botName: 'parrot', fallback: '🦜', category: 'fun' },
            { botName: 'ticket-tool', fallback: '🎫', category: 'moderation' },
            { botName: 'tickets', fallback: '📨', category: 'moderation' },
            { botName: 'mute', fallback: '🔇', category: 'moderation' },
            { botName: 'ban', fallback: '🔨', category: 'moderation' },
            { botName: 'kick', fallback: '🦶', category: 'moderation' },
            { botName: 'warn', fallback: '⚠️', category: 'moderation' },
            { botName: 'verify', fallback: '✅', category: 'verification' },
            { botName: 'starboard', fallback: '⭐', category: 'social' },
            { botName: 'levelup', fallback: '📈', category: 'levels' }
        ];
    }

    renderEmojiMappings(category) {
        let mappings = this.emojiMappings || [];
        
        if (!Array.isArray(mappings)) {
            mappings = [];
        }
        
        if (category !== 'all') {
            mappings = mappings.filter(m => m && m.category === category);
        }
        
        if (!mappings || mappings.length === 0) {
            this.emojiMappingsContainer.innerHTML = '<p class="no-emojis">No emoji mappings found. Click "Reset" to restore defaults.</p>';
            return;
        }
        
        this.emojiMappingsContainer.innerHTML = mappings.map(emoji => {
            if (!emoji) return '';
            const emojiDisplay = emoji.emojiId && emoji.isAvailable
                ? `<span class="custom-emoji"><img src="${emoji.emojiUrl}" alt="${emoji.botName}"></span>`
                : `<span class="fallback-emoji">${emoji.fallback || '❓'}</span>`;
            
            return `
                <div class="emoji-mapping-item" data-bot-name="${emoji.botName || 'unknown'}">
                    <span class="emoji-preview">${emojiDisplay}</span>
                    <span class="emoji-name">${emoji.botName || 'unknown'}</span>
                    <span class="emoji-category">${emoji.category || 'general'}</span>
                    <button class="emoji-edit-btn" data-bot-name="${emoji.botName || 'unknown'}">✏️</button>
                </div>
            `;
        }).join('');
        
        this.emojiMappingsContainer.querySelectorAll('.emoji-edit-btn').forEach(btn => {
            btn.addEventListener('click', () => this.editEmojiMapping(btn.dataset.botName));
        });
    }

    async loadServerEmojis() {
        console.log('=== LOADING SERVER EMOJIS ===');
        try {
            const response = await fetch(`/api/emojis/${this.guildId}/server`, {
                headers: { 'X-API-Key': this.apiKey }
            });
            
            if (response.ok) {
                this.serverEmojis = await response.json();
                this.renderServerEmojis();
            } else {
                document.getElementById('serverEmojisGrid').innerHTML = '<p class="error">Failed to load server emojis</p>';
            }
        } catch (error) {
            console.error('Failed to load server emojis:', error);
            document.getElementById('serverEmojisGrid').innerHTML = '<p class="error">Failed to load server emojis</p>';
        }
    }

    renderServerEmojis(filter = 'all', search = '') {
        const grid = document.getElementById('serverEmojisGrid');
        
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

    _renderServerEmojisFiltered(filter = 'all', search = '') {
        const grid = document.getElementById('serverEmojisGrid');
        
        if (!this.serverEmojis || this.serverEmojis.length === 0) {
            grid.innerHTML = '<p class="no-emojis">No emojis found in this server</p>';
            return;
        }
        
        let filtered = this.serverEmojis;
        
        // Apply filter
        if (filter === 'animated') {
            filtered = filtered.filter(e => e.isAnimated);
        } else if (filter === 'static') {
            filtered = filtered.filter(e => !e.isAnimated);
        }
        
        // Apply search
        if (search) {
            const searchLower = search.toLowerCase();
            filtered = filtered.filter(e => e.name.toLowerCase().includes(searchLower));
        }
        
        if (filtered.length === 0) {
            grid.innerHTML = '<p class="no-emojis">No emojis match your search</p>';
            return;
        }
        
        grid.innerHTML = filtered.map(emoji => `
            <div class="server-emoji-item" data-emoji-id="${emoji.id}" data-emoji-name="${emoji.name}" data-emoji-url="${emoji.url}" data-is-animated="${emoji.isAnimated}" onclick="dashboard.selectServerEmoji(this)">
                ${emoji.isAnimated 
                    ? `<img src="${emoji.url}" alt="${emoji.name}">`
                    : (emoji.url 
                        ? `<img src="${emoji.url}" alt="${emoji.name}">` 
                        : emoji.name)
                }
            </div>
        `).join('');
    }

    selectServerEmoji(element) {
        // Remove selection from others
        document.querySelectorAll('.server-emoji-item').forEach(el => el.classList.remove('selected'));
        
        // Add selection to clicked element
        element.classList.add('selected');
        
        // Populate the emoji input
        const emojiId = element.dataset.emojiId;
        const emojiName = element.dataset.emojiName;
        const emojiUrl = element.dataset.emojiUrl;
        const isAnimated = element.dataset.isAnimated === 'true';
        
        document.getElementById('newEmoji').value = `<:${emojiName}:${emojiId}>`;
        document.getElementById('newEmoji').dataset.emojiId = emojiId;
        document.getElementById('newEmoji').dataset.emojiUrl = emojiUrl;
        document.getElementById('newEmoji').dataset.emojiName = emojiName;
        document.getElementById('newEmoji').dataset.isAnimated = isAnimated;
    }

    openEmojiPicker() {
        const modalGrid = document.getElementById('modalEmojiGrid');
        modalGrid.innerHTML = '<p class="loading">Loading server emojis...</p>';
        document.getElementById('emojiPickerModal').classList.remove('hidden');
        
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
                headers: { 'X-API-Key': this.apiKey }
            });
            
            if (response.ok) {
                this.serverEmojis = await response.json();
                this.renderModalEmojis(this.serverEmojis);
            } else {
                document.getElementById('modalEmojiGrid').innerHTML = '<p class="error">Failed to load emojis</p>';
            }
        } catch (error) {
            console.error('Failed to load server emojis for modal:', error);
            document.getElementById('modalEmojiGrid').innerHTML = '<p class="error">Failed to load emojis</p>';
        }
    }

    renderModalEmojis(emojis) {
        const modalGrid = document.getElementById('modalEmojiGrid');
        
        if (!emojis || emojis.length === 0) {
            modalGrid.innerHTML = '<p class="no-emojis">No emojis in this server</p>';
            return;
        }
        
        modalGrid.innerHTML = emojis.map(emoji => `
            <div class="server-emoji-item" data-emoji-id="${emoji.id}" data-emoji-name="${emoji.name}" data-emoji-url="${emoji.url}" data-is-animated="${emoji.isAnimated}" onclick="dashboard.selectModalEmoji(this)">
                ${emoji.isAnimated 
                    ? `<img src="${emoji.url}" alt="${emoji.name}">`
                    : (emoji.url 
                        ? `<img src="${emoji.url}" alt="${emoji.name}">` 
                        : emoji.name)
                }
            </div>
        `).join('');
    }

    selectModalEmoji(element) {
        // Remove selection from others
        document.querySelectorAll('#modalEmojiGrid .server-emoji-item').forEach(el => el.classList.remove('selected'));
        
        // Add selection to clicked element
        element.classList.add('selected');
        
        // Populate the emoji input
        const emojiId = element.dataset.emojiId;
        const emojiName = element.dataset.emojiName;
        const emojiUrl = element.dataset.emojiUrl;
        const isAnimated = element.dataset.isAnimated === 'true';
        
        document.getElementById('newEmoji').value = `<:${emojiName}:${emojiId}>`;
        document.getElementById('newEmoji').dataset.emojiId = emojiId;
        document.getElementById('newEmoji').dataset.emojiUrl = emojiUrl;
        document.getElementById('newEmoji').dataset.emojiName = emojiName;
        document.getElementById('newEmoji').dataset.isAnimated = isAnimated;
        
        // Close modal
        this.closeEmojiPicker();
    }

    closeEmojiPicker() {
        document.getElementById('emojiPickerModal').classList.add('hidden');
    }

    async loadEmojiMappings() {
        console.log('=== LOAD EMOJI MAPPINGS ===');
        this.emojiMappingsContainer.innerHTML = '<p class="loading-emojis">Loading emoji mappings...</p>';
        
        try {
            const response = await fetch(`/api/emojis/${this.guildId}`, {
                headers: { 'X-API-Key': this.apiKey }
            });
            
            if (!response.ok) {
                throw new Error(`API error: ${response.status}`);
            }
            
            const data = await response.json();
            this.emojiMappings = Array.isArray(data) ? data : [];
            
            if (this.emojiMappings.length === 0) {
                // Load defaults if none exist
                this.emojiMappings = this.getDefaultEmojiMappings();
            }
            
            this.renderEmojiMappings('all');
        } catch (error) {
            console.error('Failed to load emoji mappings:', error);
            // Fallback to defaults
            this.emojiMappings = this.getDefaultEmojiMappings();
            this.renderEmojiMappings('all');
        }
    }

    getDefaultEmojiMappings() {
        return [
            { bot_name: 'play', fallback: '▶️', category: 'player_controls' },
            { bot_name: 'pause', fallback: '⏸️', category: 'player_controls' },
            { bot_name: 'skip', fallback: '⏭️', category: 'player_controls' },
            { bot_name: 'previous', fallback: '⏮️', category: 'player_controls' },
            { bot_name: 'shuffle', fallback: '🔀', category: 'player_controls' },
            { bot_name: 'repeat', fallback: '🔁', category: 'player_controls' },
            { bot_name: 'stop', fallback: '⏹️', category: 'player_controls' },
            { bot_name: 'queue', fallback: '📋', category: 'player_controls' },
            { bot_name: 'playing', fallback: '🎵', category: 'now_playing' },
            { bot_name: 'music', fallback: '🎶', category: 'now_playing' },
            { bot_name: 'live', fallback: '🔴', category: 'now_playing' },
            { bot_name: 'sp', fallback: '🟢', category: 'voice_status' },
            { bot_name: 'idle', fallback: '🟡', category: 'voice_status' },
            { bot_name: 'dnd', fallback: '🔴', category: 'voice_status' },
            { bot_name: 'offline', fallback: '⚫', category: 'voice_status' },
            { bot_name: 'error', fallback: '❌', category: 'actions' },
            { bot_name: 'success', fallback: '✅', category: 'actions' },
            { bot_name: 'warning', fallback: '⚠️', category: 'actions' },
            { bot_name: 'info', fallback: 'ℹ️', category: 'actions' },
            { bot_name: 'bassboost', fallback: '🎸', category: 'filters' },
            { bot_name: 'filters', fallback: '🎛️', category: 'filters' }
        ];
    }

    renderEmojiMappings(category) {
        let mappings = this.emojiMappings || [];
        
        if (!Array.isArray(mappings)) {
            mappings = [];
        }
        
        // Filter by category
        if (category !== 'all') {
            mappings = mappings.filter(m => m && m.category === category);
        }
        
        // Search filter
        const searchInput = document.getElementById('mappingSearch');
        if (searchInput && searchInput.value) {
            const searchLower = searchInput.value.toLowerCase();
            mappings = mappings.filter(m => m && m.bot_name.toLowerCase().includes(searchLower));
        }
        
        const container = document.getElementById('emojiMappings');
        
        if (!mappings || mappings.length === 0) {
            container.innerHTML = '<p class="no-emojis">No emoji mappings found</p>';
            return;
        }
        
        container.innerHTML = mappings.map(mapping => {
            if (!mapping) return '';
            
            const emojiDisplay = mapping.emoji_id && mapping.is_available
                ? `<span class="custom-emoji"><img src="${mapping.emoji_url || ''}" alt="${mapping.bot_name}"></span>`
                : `<span class="fallback-emoji">${mapping.fallback || '❓'}</span>`;
            
            return `
                <div class="emoji-mapping-row" data-bot-name="${mapping.bot_name || 'unknown'}">
                    <span class="emoji-display">${emojiDisplay}</span>
                    <div class="mapping-info">
                        <span class="bot-name">${mapping.bot_name || 'unknown'}</span>
                        <span class="mapping-category">${mapping.category || 'general'}</span>
                    </div>
                    <div class="mapping-actions">
                        <button class="edit-btn" onclick="dashboard.editEmojiMapping('${mapping.bot_name}')" title="Edit">✏️</button>
                        <button class="delete-btn" onclick="dashboard.deleteEmojiMapping('${mapping.bot_name}')" title="Delete">🗑️</button>
                    </div>
                </div>
            `;
        }).join('');
    }

    async editEmojiMapping(botName) {
        const mapping = this.emojiMappings.find(m => m && m.bot_name === botName);
        if (!mapping) return;
        
        const newEmoji = prompt(`Edit emoji for "${botName}":\nEnter custom emoji (paste from server or type Unicode)`, mapping.fallback || '');
        
        if (newEmoji !== null) {
            try {
                const response = await fetch(`/api/emojis/${this.guildId}`, {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'X-API-Key': this.apiKey 
                    },
                    body: JSON.stringify({
                        botName,
                        emoji: newEmoji
                    })
                });
                
                if (response.ok) {
                    await this.loadEmojiMappings();
                } else {
                    const error = await response.json();
                    alert('Failed to update emoji: ' + (error.error || 'Unknown error'));
                }
            } catch (error) {
                console.error('Error updating emoji:', error);
                alert('Error updating emoji: ' + error.message);
            }
        }
    }

    async deleteEmojiMapping(botName) {
        if (!confirm(`Delete emoji mapping for "${botName}"?`)) return;
        
        try {
            const response = await fetch(`/api/emojis/${this.guildId}/${botName}`, {
                method: 'DELETE',
                headers: { 'X-API-Key': this.apiKey }
            });
            
            if (response.ok) {
                await this.loadEmojiMappings();
            } else {
                const error = await response.json();
                alert('Failed to delete emoji: ' + (error.error || 'Unknown error'));
            }
        } catch (error) {
            console.error('Error deleting emoji:', error);
            alert('Error deleting emoji: ' + error.message);
        }
    }

    async addEmojiMapping() {
        const botName = document.getElementById('newBotName').value.trim();
        const emojiInput = document.getElementById('newEmoji');
        const category = document.getElementById('newEmojiCategory').value;
        
        if (!botName) {
            alert('Please enter a bot function name');
            return;
        }
        
        let emojiId = emojiInput.dataset.emojiId;
        let emojiUrl = emojiInput.dataset.emojiUrl;
        let emojiName = emojiInput.dataset.emojiName;
        let isAnimated = emojiInput.dataset.isAnimated === 'true';
        let emoji = emojiInput.value;
        
        if (!emoji) {
            alert('Please select or enter an emoji');
            return;
        }
        
        try {
            const response = await fetch(`/api/emojis/${this.guildId}`, {
                method: 'PUT',
                headers: { 
                    'Content-Type': 'application/json',
                    'X-API-Key': this.apiKey 
                },
                body: JSON.stringify({
                    botName,
                    emojiId: emojiId || null,
                    emojiUrl: emojiUrl || null,
                    emojiName: emojiName || emoji,
                    isAnimated,
                    fallback: emoji,
                    category
                })
            });
            
            if (response.ok) {
                // Clear form
                document.getElementById('newBotName').value = '';
                document.getElementById('newEmoji').value = '';
                delete emojiInput.dataset.emojiId;
                delete emojiInput.dataset.emojiUrl;
                delete emojiInput.dataset.emojiName;
                delete emojiInput.dataset.isAnimated;
                
                await this.loadEmojiMappings();
            } else {
                const error = await response.json();
                alert('Failed to add emoji: ' + (error.error || 'Unknown error'));
            }
        } catch (error) {
            console.error('Error adding emoji:', error);
            alert('Error adding emoji: ' + error.message);
        }
    }

    async showSyncPreview() {
        try {
            const response = await fetch(`/api/emojis/${this.guildId}/sync/preview`, {
                headers: { 'X-API-Key': this.apiKey }
            });
            
            if (response.ok) {
                const preview = await response.json();
                this.renderSyncPreview(preview);
                document.getElementById('syncPreviewModal').classList.remove('hidden');
            } else {
                alert('Failed to load sync preview');
            }
        } catch (error) {
            console.error('Error loading sync preview:', error);
            alert('Error loading sync preview: ' + error.message);
        }
    }

    renderSyncPreview(preview) {
        const list = document.getElementById('syncPreviewList');
        
        if (!preview || preview.length === 0) {
            list.innerHTML = '<p class="no-emojis">No new emojis to sync</p>';
            return;
        }
        
        // Filter to only unmapped emojis
        const unmapped = preview.filter(p => !p.isMapped);
        
        if (unmapped.length === 0) {
            list.innerHTML = '<p class="no-emojis">All server emojis are already mapped</p>';
            return;
        }
        
        list.innerHTML = unmapped.map(item => `
            <div class="sync-preview-item">
                <span class="server-emoji">${item.emojiUrl ? `<img src="${item.emojiUrl}" alt="${item.emojiName}">` : item.emojiName}</span>
                <div class="suggestion">
                    <div class="emoji-name">:${item.emojiName}:</div>
                    <div class="bot-function">→ ${item.suggestedBotName} (${item.category})</div>
                </div>
            </div>
        `).join('');
    }

    closeSyncPreview() {
        document.getElementById('syncPreviewModal').classList.add('hidden');
    }

    async applySync() {
        try {
            const response = await fetch(`/api/emojis/${this.guildId}/sync`, {
                method: 'POST',
                headers: { 'X-API-Key': this.apiKey }
            });
            
            if (response.ok) {
                const result = await response.json();
                alert(`Sync complete! ${result.synced} emojis mapped, ${result.skipped} skipped.`);
                this.closeSyncPreview();
                await this.loadEmojiMappings();
                await this.loadServerEmojis();
            } else {
                const error = await response.json();
                alert('Sync failed: ' + (error.error || 'Unknown error'));
            }
        } catch (error) {
            console.error('Error syncing emojis:', error);
            alert('Error syncing emojis: ' + error.message);
        }
    }

    async syncAllEmojis() {
        if (!confirm('This will auto-map all unmapped server emojis based on name similarity. Continue?')) {
            return;
        }
        
        await this.applySync();
    }

    async resetEmojis() {
        if (!confirm('Are you sure you want to reset ALL emoji mappings to defaults? This cannot be undone.')) {
            return;
        }
        
        try {
            const response = await fetch(`/api/emojis/${this.guildId}/reset`, {
                method: 'POST',
                headers: { 'X-API-Key': this.apiKey }
            });
            
            if (response.ok) {
                await this.loadEmojiMappings();
                await this.loadServerEmojis();
            } else {
                const error = await response.json();
                alert('Reset failed: ' + (error.error || 'Unknown error'));
            }
        } catch (error) {
            console.error('Error resetting emojis:', error);
            alert('Error resetting emojis: ' + error.message);
        }
    }

    async loadStats() {
        document.getElementById('topSongsList').innerHTML = '<p class="loading-stats">Loading statistics...</p>';
        document.getElementById('sourceDistribution').innerHTML = '<p class="loading-stats">Loading source data...</p>';
        
        try {
            const response = await fetch(`/api/stats/${this.guildId}`, {
                headers: { 'X-API-Key': this.apiKey }
            });
            const stats = await response.json();
            
            document.getElementById('totalPlays').textContent = (stats.totalPlays || 0).toLocaleString();
            document.getElementById('uniqueUsers').textContent = (stats.uniqueUsers || 0).toLocaleString();
            document.getElementById('topGenre').textContent = stats.topGenre || 'N/A';
            document.getElementById('botUptime').textContent = this.formatUptime(stats.uptime || 0);
            document.getElementById('historyCount').textContent = (stats.historyCount || 0).toLocaleString();
            
            // Top songs
            if (stats.topSongs && stats.topSongs.length > 0) {
                document.getElementById('topSongsList').innerHTML = stats.topSongs.map((song, i) => `
                    <div class="top-song-item">
                        <span class="top-song-rank">#${i + 1}</span>
                        <span class="top-song-title">${this.escapeHtml(song.title)}</span>
                        <span class="top-song-artist">${this.escapeHtml(song.author || 'Unknown')}</span>
                        <span class="top-song-plays">${song.playCount} plays</span>
                    </div>
                `).join('');
            } else {
                document.getElementById('topSongsList').innerHTML = '<p class="loading-stats">No statistics available yet. Start playing music to see stats!</p>';
            }
            
            // Source distribution (calculate from topSongs source data if available)
            const sourceData = this.calculateSourceDistribution(stats.topSongs || []);
            if (sourceData.length > 0) {
                const maxCount = Math.max(...sourceData.map(s => s.count));
                document.getElementById('sourceDistribution').innerHTML = sourceData.map(source => `
                    <div class="source-bar">
                        <span class="source-name">${source.name}</span>
                        <div class="source-bar-bg">
                            <div class="source-bar-fill" style="width: ${(source.count / maxCount) * 100}%"></div>
                        </div>
                        <span class="source-count">${source.count}</span>
                    </div>
                `).join('');
            } else {
                document.getElementById('sourceDistribution').innerHTML = '<p class="loading-stats">No source data available</p>';
            }
            
        } catch (error) {
            console.error('Failed to load stats:', error);
            document.getElementById('topSongsList').innerHTML = '<p class="error">Failed to load statistics</p>';
        }
    }

    calculateSourceDistribution(songs) {
        const sources = {};
        songs.forEach(song => {
            const uri = song.uri || '';
            let source = 'Unknown';
            if (uri.includes('spotify.com')) source = 'Spotify';
            else if (uri.includes('youtube.com') || uri.includes('youtu.be')) source = 'YouTube';
            else if (uri.includes('soundcloud.com')) source = 'SoundCloud';
            else if (uri.includes('music.apple.com')) source = 'Apple Music';
            else if (uri.includes('deezer.com')) source = 'Deezer';
            
            sources[source] = (sources[source] || 0) + 1;
        });
        
        return Object.entries(sources).map(([name, count]) => ({ name, count }));
    }

    // ============ PLAYLIST FUNCTIONS ============

    async loadPlaylists() {
        const container = document.getElementById('playlistsList');
        container.innerHTML = '<p class="empty-playlists">Loading playlists...</p>';
        
        // Get userId from localStorage (stored by inline auth script)
        let userId = localStorage.getItem('dashboard_user_id');
        
        // Also try this.user object
        if (!userId) {
            userId = this.user?.id || this.user?.discordId || this.user?.userId || this.user?._id;
        }
        if (!userId && this.user) {
            userId = this.user.id || this.user.discordId;
        }
        
        console.log('loadPlaylists - userId:', userId, 'this.user:', JSON.stringify(this.user));
        
        try {
            // Include localUserId in query params for server to use
            const url = userId 
                ? `/api/playlists/${this.guildId}?userId=${encodeURIComponent(String(userId))}&localUserId=${encodeURIComponent(String(userId))}`
                : `/api/playlists/${this.guildId}`;
            console.log('Fetching playlists from:', url);
            const response = await fetch(url, {
                headers: { 'X-API-Key': this.apiKey }
            });
            
            if (response.ok) {
                const data = await response.json();
                console.log('Loaded playlists:', data);
                this.playlists = data;
                this.renderPlaylists();
            } else {
                const error = await response.json();
                console.error('Error loading playlists:', error);
                container.innerHTML = '<p class="error">Failed to load playlists: ' + (error.error || 'Unknown error') + '</p>';
            }
        } catch (error) {
            console.error('Failed to load playlists:', error);
            container.innerHTML = '<p class="error">Failed to load playlists</p>';
        }
    }

    renderPlaylists() {
        const container = document.getElementById('playlistsList');
        
        if (!this.playlists || this.playlists.length === 0) {
            container.innerHTML = '<p class="empty-playlists">No playlists found. Create your first playlist!</p>';
            return;
        }
        
        container.innerHTML = this.playlists.map(playlist => `
            <div class="playlist-card" onclick="dashboard.viewPlaylist('${playlist.id}')">
                <div class="playlist-name">${this.escapeHtml(playlist.name)}</div>
                <div class="playlist-info">
                    ${playlist.trackCount || 0} tracks • ${playlist.isPublic ? 'Public' : 'Private'}
                </div>
            </div>
        `).join('');
    }

    openCreatePlaylistModal() {
        document.getElementById('createPlaylistModal').classList.remove('hidden');
        document.getElementById('newPlaylistName').value = '';
        document.getElementById('newPlaylistDescription').value = '';
        document.getElementById('newPlaylistPublic').checked = false;
    }

    async createPlaylist() {
        const name = document.getElementById('newPlaylistName').value.trim();
        const description = document.getElementById('newPlaylistDescription').value.trim();
        const isPublic = document.getElementById('newPlaylistPublic').checked;
        
        if (!name) {
            alert('Please enter a playlist name');
            return;
        }
        
        // Get userId from localStorage first
        let userId = localStorage.getItem('dashboard_user_id');
        
        // Also try this.user object
        if (!userId) {
            userId = this.user?.id || this.user?.discordId || this.user?.userId || this.user?._id;
        }
        if (!userId && this.user) {
            userId = this.user.id || this.user.discordId;
        }
        
        console.log('createPlaylist - userId:', userId, 'isPublic:', isPublic);
        
        try {
            const response = await fetch(`/api/playlists/${this.guildId}`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'X-API-Key': this.apiKey 
                },
                body: JSON.stringify({
                    name,
                    description,
                    isPublic,
                    userId: String(userId),
                    localUserId: String(userId)
                })
            });
            
            if (response.ok) {
                this.closeModal('createPlaylistModal');
                document.getElementById('newPlaylistName').value = '';
                document.getElementById('newPlaylistDescription').value = '';
                document.getElementById('newPlaylistPublic').checked = false;
                await this.loadPlaylists();
            } else {
                const error = await response.json();
                if (error.error && error.error.includes('already exists')) {
                    alert('A playlist with that name already exists. Please choose a different name.');
                } else {
                    alert('Failed to create playlist: ' + (error.error || 'Unknown error'));
                }
            }
        } catch (error) {
            console.error('Failed to create playlist:', error);
            alert('Failed to create playlist: ' + error.message);
        }
    }

    async viewPlaylist(playlistId) {
        try {
            const response = await fetch(`/api/playlists/${this.guildId}/${playlistId}`, {
                headers: { 'X-API-Key': this.apiKey }
            });
            
            if (response.ok) {
                this.currentPlaylist = await response.json();
                this.showPlaylistDetails();
            } else {
                alert('Failed to load playlist');
            }
        } catch (error) {
            console.error('Failed to load playlist:', error);
            alert('Failed to load playlist: ' + error.message);
        }
    }

    showPlaylistsList() {
        document.getElementById('playlistsList').classList.remove('hidden');
        document.getElementById('playlistDetailsView').classList.add('hidden');
        document.getElementById('backToPlaylistsBtn').classList.add('hidden');
        document.getElementById('playlistsPageTitle').textContent = 'My Playlists';
        document.getElementById('createPlaylistBtn').classList.remove('hidden');
    }

    showPlaylistDetails() {
        document.getElementById('playlistsList').classList.add('hidden');
        document.getElementById('playlistDetailsView').classList.remove('hidden');
        document.getElementById('backToPlaylistsBtn').classList.remove('hidden');
        document.getElementById('playlistsPageTitle').textContent = '';
        document.getElementById('createPlaylistBtn').classList.add('hidden');
        this.renderPlaylistDetails();
    }

    formatDuration(ms) {
        if (!ms) return '0:00';
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    }

    formatDate(timestamp) {
        if (!timestamp) return '';
        const date = new Date(timestamp);
        const now = new Date();
        const diffTime = Math.abs(now - date);
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        
        if (diffDays < 1) return 'Today';
        if (diffDays < 2) return 'Yesterday';
        if (diffDays < 7) return `${diffDays} days ago`;
        if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
        return date.toLocaleDateString();
    }

    renderPlaylistDetails() {
        if (!this.currentPlaylist) return;
        
        const playlist = this.currentPlaylist;
        
        // Update header
        document.getElementById('playlistTitle').textContent = playlist.name;
        document.getElementById('playlistDescription').textContent = playlist.description || '';
        document.getElementById('playlistCreator').textContent = 'Created by You';
        document.getElementById('playlistTrackCount').textContent = `${playlist.track_count || playlist.tracks?.length || 0} songs`;
        document.getElementById('playlistDuration').textContent = this.formatDuration(playlist.total_duration);
        
        // Update cover
        const coverEl = document.getElementById('playlistCover');
        if (playlist.cover_image) {
            coverEl.innerHTML = `<img src="${playlist.cover_image}" alt="${this.escapeHtml(playlist.name)}">`;
        } else {
            coverEl.innerHTML = '<span class="playlist-cover-placeholder">♪</span>';
        }
        
        // Clear search results when viewing playlist
        document.getElementById('playlistSearchResults').classList.add('hidden');
        document.getElementById('playlistSearchResults').innerHTML = '';
        
        // Render tracks
        const tracksList = document.getElementById('playlistTracksList');
        const tracks = playlist.tracks || [];
        
        if (tracks.length > 0) {
            tracksList.innerHTML = tracks.map((track, index) => `
                <div class="playlist-track-item" data-index="${index}">
                    <div class="track-num">${index + 1}</div>
                    <div class="track-play-hover">▶</div>
                    <div class="track-main-info">
                        <div class="track-artwork">
                            ${track.artworkUrl ? `<img src="${track.artworkUrl}" alt="">` : ''}
                        </div>
                        <div class="track-text-info">
                            <span class="track-title-text">${this.escapeHtml(track.title || 'Unknown')}</span>
                            <span class="track-artist-text">${this.escapeHtml(track.author || 'Unknown')}</span>
                        </div>
                        ${track.isExplicit ? '<span class="explicit-badge">E</span>' : ''}
                    </div>
                    <div class="track-album-text">${this.escapeHtml(track.album || '')}</div>
                    <div class="track-duration-text">${this.formatDuration(track.duration)}</div>
                    <div class="track-actions">
                        <button class="track-action-btn" onclick="dashboard.playPlaylistTrack(${index})" title="Play">▶</button>
                        <button class="track-action-btn" onclick="dashboard.addPlaylistTrackToQueue(${index})" title="Add to queue">📥</button>
                        <button class="track-action-btn" onclick="dashboard.removeTrackFromPlaylist('${track.identifier}')" title="Remove">🗑️</button>
                    </div>
                </div>
            `).join('');
        } else {
            tracksList.innerHTML = '<p class="empty-playlists">No tracks in this playlist. Search and add some songs!</p>';
        }
    }
    
    async searchTracksForPlaylist() {
        const query = document.getElementById('playlistSearchInput').value.trim();
        const source = document.getElementById('playlistSearchSource').value;
        
        if (!query) {
            alert('Please enter a search query');
            return;
        }
        
        const resultsContainer = document.getElementById('playlistSearchResults');
        resultsContainer.classList.remove('hidden');
        resultsContainer.innerHTML = '<p class="empty-playlists">Searching...</p>';
        
        try {
            const response = await fetch(`/api/search?query=${encodeURIComponent(query)}&source=${source}`, {
                headers: { 'X-API-Key': this.apiKey }
            });
            
            if (response.ok) {
                const data = await response.json();
                const results = data.results || [];
                
                if (results.length === 0) {
                    resultsContainer.innerHTML = '<p class="empty-playlists">No results found. Try a different search.</p>';
                    return;
                }
                
                resultsContainer.innerHTML = results.map(track => `
                    <div class="search-result-item" data-track='${JSON.stringify(track).replace(/'/g, "&#39;")}'>
                        <img class="search-result-artwork" src="${track.artworkUrl || 'https://via.placeholder.com/48'}" alt="">
                        <div class="search-result-info">
                            <div class="search-result-title">${this.escapeHtml(track.title)}</div>
                            <div class="search-result-artist">${this.escapeHtml(track.author)}</div>
                        </div>
                        <span class="search-result-duration">${track.durationFormatted || this.formatDuration(track.duration)}</span>
                        <span class="search-result-source">${track.sourceName || track.source}</span>
                        <button class="search-result-add" onclick="dashboard.addSearchResultToPlaylist(this)">+ Add</button>
                    </div>
                `).join('');
            } else {
                const error = await response.json();
                resultsContainer.innerHTML = '<p class="empty-playlists">Search failed: ' + (error.error || 'Unknown error') + '</p>';
            }
        } catch (error) {
            console.error('Search failed:', error);
            resultsContainer.innerHTML = '<p class="empty-playlists">Search failed. Please try again.</p>';
        }
    }
    
    addSearchResultToPlaylist(button) {
        const trackItem = button.closest('.search-result-item');
        const track = JSON.parse(trackItem.dataset.track.replace(/&#39;/g, "'"));
        
        if (!this.currentPlaylist) {
            alert('No playlist selected');
            return;
        }
        
        // Add track to end of playlist
        this.addTrackToPlaylist(this.currentPlaylist.id, track);
    }
    
    async addTrackToPlaylist(playlistId, track, position = null) {
        try {
            const response = await fetch(`/api/playlists/${this.guildId}/${playlistId}/tracks`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'X-API-Key': this.apiKey 
                },
                body: JSON.stringify({ track, position })
            });
            
            if (response.ok) {
                this.currentPlaylist = await response.json();
                this.renderPlaylistDetails();
                
                // Hide search results after adding
                document.getElementById('playlistSearchResults').classList.add('hidden');
                document.getElementById('playlistSearchInput').value = '';
            } else {
                const error = await response.json();
                alert('Failed to add track: ' + (error.error || 'Unknown error'));
            }
        } catch (error) {
            console.error('Failed to add track:', error);
            alert('Failed to add track: ' + error.message);
        }
    }

    async playPlaylist() {
        if (!this.currentPlaylist || !this.currentPlaylist.tracks || this.currentPlaylist.tracks.length === 0) return;
        
        // Clear queue and add all tracks from playlist
        try {
            await fetch(`/api/queue/${this.guildId}`, {
                method: 'DELETE',
                headers: { 'X-API-Key': this.apiKey }
            });
            
            for (const track of this.currentPlaylist.tracks) {
                await fetch(`/api/player/${this.guildId}/queue`, {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'X-API-Key': this.apiKey 
                    },
                    body: JSON.stringify(track)
                });
            }
            
            // Start playing
            await fetch(`/api/player/${this.guildId}/play`, {
                method: 'POST',
                headers: { 'X-API-Key': this.apiKey }
            });
        } catch (error) {
            console.error('Failed to play playlist:', error);
        }
    }

    async shufflePlaylist() {
        if (!this.currentPlaylist || !this.currentPlaylist.tracks || this.currentPlaylist.tracks.length === 0) return;
        
        // Shuffle tracks and add to queue
        const shuffledTracks = [...this.currentPlaylist.tracks].sort(() => Math.random() - 0.5);
        
        try {
            await fetch(`/api/queue/${this.guildId}`, {
                method: 'DELETE',
                headers: { 'X-API-Key': this.apiKey }
            });
            
            for (const track of shuffledTracks) {
                await fetch(`/api/player/${this.guildId}/queue`, {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'X-API-Key': this.apiKey 
                    },
                    body: JSON.stringify(track)
                });
            }
            
            // Start playing
            await fetch(`/api/player/${this.guildId}/play`, {
                method: 'POST',
                headers: { 'X-API-Key': this.apiKey }
            });
        } catch (error) {
            console.error('Failed to shuffle playlist:', error);
        }
    }

    async playPlaylistTrack(index) {
        if (!this.currentPlaylist || !this.currentPlaylist.tracks || !this.currentPlaylist.tracks[index]) return;
        
        const track = this.currentPlaylist.tracks[index];
        
        try {
            // Add all tracks up to and including this track
            const tracksToAdd = this.currentPlaylist.tracks.slice(0, index + 1);
            
            await fetch(`/api/queue/${this.guildId}`, {
                method: 'DELETE',
                headers: { 'X-API-Key': this.apiKey }
            });
            
            for (const t of tracksToAdd) {
                await fetch(`/api/player/${this.guildId}/queue`, {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'X-API-Key': this.apiKey 
                    },
                    body: JSON.stringify(t)
                });
            }
            
            // Start playing
            await fetch(`/api/player/${this.guildId}/play`, {
                method: 'POST',
                headers: { 'X-API-Key': this.apiKey }
            });
        } catch (error) {
            console.error('Failed to play track:', error);
        }
    }

    async addPlaylistTrackToQueue(index) {
        if (!this.currentPlaylist || !this.currentPlaylist.tracks || !this.currentPlaylist.tracks[index]) return;
        
        const track = this.currentPlaylist.tracks[index];
        
        try {
            await fetch(`/api/player/${this.guildId}/queue`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'X-API-Key': this.apiKey 
                },
                body: JSON.stringify(track)
            });
            await this.loadQueue();
        } catch (error) {
            console.error('Failed to add track to queue:', error);
        }
    }

    async removeTrackFromPlaylist(trackIdentifier) {
        if (!this.currentPlaylist || !confirm('Remove this track from the playlist?')) return;
        
        try {
            const response = await fetch(`/api/playlists/${this.guildId}/${this.currentPlaylist.id}/tracks/${trackIdentifier}`, {
                method: 'DELETE',
                headers: { 'X-API-Key': this.apiKey }
            });
            
            if (response.ok) {
                const data = await response.json();
                this.currentPlaylist = data.playlist || data;
                this.renderPlaylistDetails();
                await this.loadPlaylists();
            } else {
                const error = await response.json();
                alert('Failed to remove track: ' + (error.error || 'Unknown error'));
            }
        } catch (error) {
            console.error('Failed to remove track:', error);
        }
    }

    showPlaylistMoreOptions() {
        const options = [];
        options.push({ label: 'Edit Details', action: () => this.editPlaylistDetails() });
        if (this.currentPlaylist?.cover_image) {
            options.push({ label: 'Remove Cover', action: () => this.removePlaylistCover() });
        }
        options.push({ label: 'Delete Playlist', action: () => this.deletePlaylist(this.currentPlaylist.id) });
        
        // For now just use alert, in a full implementation this would be a dropdown
        alert('Options: Edit Details, Delete Playlist');
    }

    async editPlaylistDetails() {
        const newName = prompt('Playlist name:', this.currentPlaylist.name);
        if (newName === null) return;
        
        const newDescription = prompt('Description:', this.currentPlaylist.description || '');
        if (newDescription === null) return;
        
        try {
            const response = await fetch(`/api/playlists/${this.guildId}/${this.currentPlaylist.id}`, {
                method: 'PUT',
                headers: { 
                    'Content-Type': 'application/json',
                    'X-API-Key': this.apiKey 
                },
                body: JSON.stringify({
                    name: newName,
                    description: newDescription
                })
            });
            
            if (response.ok) {
                const data = await response.json();
                this.currentPlaylist = data.playlist || data;
                this.renderPlaylistDetails();
                await this.loadPlaylists();
            } else {
                const error = await response.json();
                alert('Failed to update playlist: ' + (error.error || 'Unknown error'));
            }
        } catch (error) {
            console.error('Failed to update playlist:', error);
        }
    }

    async removePlaylistCover() {
        try {
            const response = await fetch(`/api/playlists/${this.guildId}/${this.currentPlaylist.id}`, {
                method: 'PUT',
                headers: { 
                    'Content-Type': 'application/json',
                    'X-API-Key': this.apiKey 
                },
                body: JSON.stringify({ cover_image: null })
            });
            
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
            console.error('Failed to remove cover:', error);
        }
    }

    async loadPlaylistToQueue() {
        if (!this.currentPlaylist || !this.currentPlaylist.tracks) return;
        
        // Add all tracks to queue
        for (const track of this.currentPlaylist.tracks) {
            try {
                await fetch(`/api/player/${this.guildId}/queue`, {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'X-API-Key': this.apiKey 
                    },
                    body: JSON.stringify(track)
                });
            } catch (error) {
                console.error('Failed to add track to queue:', error);
            }
        }
        
        await this.loadQueue();
        alert(`Added ${this.currentPlaylist.tracks.length} tracks to queue!`);
    }

    async deletePlaylist(playlistId) {
        if (!confirm('Are you sure you want to delete this playlist?')) return;
        
        try {
            const response = await fetch(`/api/playlists/${this.guildId}/${playlistId}`, {
                method: 'DELETE',
                headers: { 'X-API-Key': this.apiKey }
            });
            
            if (response.ok) {
                await this.loadPlaylists();
            } else {
                const error = await response.json();
                alert('Failed to delete playlist: ' + (error.error || 'Unknown error'));
            }
        } catch (error) {
            console.error('Failed to delete playlist:', error);
            alert('Failed to delete playlist: ' + error.message);
        }
    }

    // ============ SETTINGS FUNCTIONS ============

    async loadSettings() {
        // Check if guild is selected
        if (!this.guildId) {
            console.log('No guild selected, skipping settings load');
            return;
        }
        
        try {
            const response = await fetch(`/api/settings/${this.guildId}`, {
                headers: { 'X-API-Key': this.apiKey }
            });
            
            if (response.ok) {
                const settings = await response.json();
                this.renderSettings(settings);
            }
        } catch (error) {
            console.error('Failed to load settings:', error);
        }
    }

    renderSettings(settings) {
        document.getElementById('prefixInput').value = settings.prefix || '.';
        document.getElementById('defaultVolumeSlider').value = settings.defaultVolume || 100;
        document.getElementById('defaultVolumeValue').textContent = (settings.defaultVolume || 100) + '%';
        
        // Set checkbox states and toggle classes
        const autoPlay = settings.autoPlay || false;
        document.getElementById('autoPlayCheck').checked = autoPlay;
        document.getElementById('autoPlayCheck').closest('.toggle-label').classList.toggle('checked', autoPlay);
        
        const leaveOnEmpty = settings.leaveOnEmpty !== false;
        document.getElementById('leaveOnEmptyCheck').checked = leaveOnEmpty;
        document.getElementById('leaveOnEmptyCheck').closest('.toggle-label').classList.toggle('checked', leaveOnEmpty);
        
        const stay247 = settings.stay247 || false;
        document.getElementById('stay247Check').checked = stay247;
        document.getElementById('stay247Check').closest('.toggle-label').classList.toggle('checked', stay247);
        
        // Show/hide 247 channel section
        this.toggle247Channels();
        
        // Load roles and users for all selects
        this.loadAllRoleSelects();
        this.loadAllUserSelects();
        
        // Render DJ roles (multi-select)
        this.renderRoleTags('djRolesTags', settings.djRoles || [], 'djRolesSelect', 'djRoles');
        
        // Render tier settings
        const tier = settings.tier || 'free';
        document.querySelectorAll('input[name="tier"]').forEach(radio => {
            radio.checked = radio.value === tier;
        });
        
        // Render role tags
        this.renderRoleTags('allowedRolesTags', settings.allowedRoles || [], 'allowedRolesSelect', 'allowedRoles');
        this.renderRoleTags('vipRolesTags', settings.vipRoles || [], 'vipRolesSelect', 'vipRoles');
        this.renderRoleTags('premiumRolesTags', settings.premiumRoles || [], 'premiumRolesSelect', 'premiumRoles');
        
        // Render user tags
        this.renderUserTags('allowedUsersTags', settings.allowedUsers || [], 'allowedUsersSelect', 'allowedUsers');
        this.renderUserTags('vipUsersTags', settings.vipUsers || [], 'vipUsersSelect', 'vipUsers');
        this.renderUserTags('premiumUsersTags', settings.premiumUsers || [], 'premiumUsersSelect', 'premiumUsers');
        
        // Load 24/7 channels
        this.loadGuildChannels();
        document.getElementById('247VoiceChannelSelect').value = settings['247VoiceChannel'] || '';
        document.getElementById('247TextChannelSelect').value = settings['247TextChannel'] || '';
    }
    
    toggle247Channels() {
        const section = document.getElementById('247ChannelsSection');
        const isChecked = document.getElementById('stay247Check').checked;
        if (isChecked) {
            section.classList.remove('hidden');
        } else {
            section.classList.add('hidden');
        }
    }
    
    handleToggleClick(event, checkboxId) {
        const checkbox = document.getElementById(checkboxId);
        const label = event.currentTarget;
        if (checkbox && label) {
            checkbox.checked = !checkbox.checked;
            label.classList.toggle('checked', checkbox.checked);
            
            // Trigger change event for any listeners
            checkbox.dispatchEvent(new Event('change', { bubbles: true }));
            
            // Special handling for 247 toggle
            if (checkboxId === 'stay247Check') {
                this.toggle247Channels();
            }
        }
        return true;
    }
    
    async loadAllUserSelects() {
        if (!this.guildId) return;
        
        try {
            const response = await fetch(`/api/guild/${this.guildId}/members`, {
                headers: { 'X-API-Key': this.apiKey }
            });
            
            if (response.ok) {
                const members = await response.json();
                
                // Update all user select dropdowns
                const selects = ['allowedUsersSelect', 'vipUsersSelect', 'premiumUsersSelect'];
                selects.forEach(selectId => {
                    const select = document.getElementById(selectId);
                    if (select) {
                        const currentValue = select.value;
                        select.innerHTML = '<option value="">Select a user...</option>';
                        members.forEach(member => {
                            const option = document.createElement('option');
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
            console.error('Failed to load members:', error);
        }
    }
    
    renderUserTags(containerId, users, selectId, settingsKey) {
        const container = document.getElementById(containerId);
        container.innerHTML = '';
        container.dataset.users = JSON.stringify(users);
        
        users.forEach(user => {
            const tag = document.createElement('div');
            tag.className = 'user-tag';
            tag.dataset.userId = user.id || user;
            const userName = user.username ? `${user.username}#${user.discriminator || '0'}` : user;
            const avatarUrl = user.avatar ? user.avatar : 'https://cdn.discordapp.com/embed/avatars/0.png';
            tag.innerHTML = `
                <img src="${avatarUrl}" alt="">
                <span>${userName}</span>
                <span class="remove" onclick="dashboard.removeUser('${containerId}', '${user.id || user}')">&times;</span>
            `;
            container.appendChild(tag);
        });
    }
    
    addAllowedUser() {
        const select = document.getElementById('allowedUsersSelect');
        const userId = select.value;
        if (!userId) return;
        
        const container = document.getElementById('allowedUsersTags');
        const users = JSON.parse(container.dataset.users || '[]');
        
        if (!users.find(u => (u.id || u) === userId)) {
            const userName = select.options[select.selectedIndex].text;
            const [username, discriminator] = userName.split('#');
            users.push({ id: userId, username, discriminator: discriminator || '' });
            this.renderUserTags('allowedUsersTags', users, 'allowedUsersSelect', 'allowedUsers');
        }
        
        select.value = '';
    }
    
    addVipUser() {
        const select = document.getElementById('vipUsersSelect');
        const userId = select.value;
        if (!userId) return;
        
        const container = document.getElementById('vipUsersTags');
        const users = JSON.parse(container.dataset.users || '[]');
        
        if (!users.find(u => (u.id || u) === userId)) {
            const userName = select.options[select.selectedIndex].text;
            const [username, discriminator] = userName.split('#');
            users.push({ id: userId, username, discriminator: discriminator || '' });
            this.renderUserTags('vipUsersTags', users, 'vipUsersSelect', 'vipUsers');
        }
        
        select.value = '';
    }
    
    addPremiumUser() {
        const select = document.getElementById('premiumUsersSelect');
        const userId = select.value;
        if (!userId) return;
        
        const container = document.getElementById('premiumUsersTags');
        const users = JSON.parse(container.dataset.users || '[]');
        
        if (!users.find(u => (u.id || u) === userId)) {
            const userName = select.options[select.selectedIndex].text;
            const [username, discriminator] = userName.split('#');
            users.push({ id: userId, username, discriminator: discriminator || '' });
            this.renderUserTags('premiumUsersTags', users, 'premiumUsersSelect', 'premiumUsers');
        }
        
        select.value = '';
    }
    
    removeUser(containerId, userId) {
        const container = document.getElementById(containerId);
        const users = JSON.parse(container.dataset.users || '[]');
        const filtered = users.filter(u => (u.id || u) !== userId);
        
        let newSelectId = '';
        if (containerId === 'allowedUsersTags') newSelectId = 'allowedUsersSelect';
        else if (containerId === 'vipUsersTags') newSelectId = 'vipUsersSelect';
        else if (containerId === 'premiumUsersTags') newSelectId = 'premiumUsersSelect';
        
        this.renderUserTags(containerId, filtered, newSelectId, containerId.replace('Tags', ''));
    }
    
    async loadAllRoleSelects() {
        try {
            const response = await fetch(`/api/guild/${this.guildId}/roles`, {
                headers: { 'X-API-Key': this.apiKey }
            });
            
            if (response.ok) {
                const roles = await response.json();
                
                // Update all role select dropdowns
                const selects = ['djRolesSelect', 'allowedRolesSelect', 'vipRolesSelect', 'premiumRolesSelect'];
                selects.forEach(selectId => {
                    const select = document.getElementById(selectId);
                    if (select) {
                        const currentValue = select.value;
                        select.innerHTML = '<option value="">Select a role to add...</option>';
                        roles.forEach(role => {
                            const option = document.createElement('option');
                            option.value = role.id;
                            option.textContent = role.name;
                            if (role.color && role.color !== '#000000') {
                                option.style.color = role.color;
                            }
                            select.appendChild(option);
                        });
                        select.value = currentValue;
                    }
                });
            }
        } catch (error) {
            console.error('Failed to load roles:', error);
        }
    }
    
    renderRoleTags(containerId, roles, selectId, settingsKey) {
        const container = document.getElementById(containerId);
        container.innerHTML = '';
        
        // Store current roles in data attribute for tracking
        container.dataset.roles = JSON.stringify(roles);
        
        roles.forEach(role => {
            const tag = document.createElement('div');
            tag.className = 'role-tag';
            tag.dataset.roleId = role.id || role;
            tag.innerHTML = `
                <span class="role-name">${role.name || role}</span>
                <span class="remove" onclick="dashboard.removeRole('${containerId}', '${role.id || role}')">&times;</span>
            `;
            container.appendChild(tag);
        });
    }
    
    addDjRole() {
        const select = document.getElementById('djRolesSelect');
        const roleId = select.value;
        if (!roleId) return;
        
        const container = document.getElementById('djRolesTags');
        const roles = JSON.parse(container.dataset.roles || '[]');
        
        if (!roles.find(r => (r.id || r) === roleId)) {
            const roleName = select.options[select.selectedIndex].text;
            roles.push({ id: roleId, name: roleName });
            this.renderRoleTags('djRolesTags', roles, 'djRolesSelect', 'djRoles');
        }
        
        select.value = '';
    }
    
    addAllowedRole() {
        const select = document.getElementById('allowedRolesSelect');
        const roleId = select.value;
        if (!roleId) return;
        
        const container = document.getElementById('allowedRolesTags');
        const roles = JSON.parse(container.dataset.roles || '[]');
        
        if (!roles.find(r => (r.id || r) === roleId)) {
            const roleName = select.options[select.selectedIndex].text;
            roles.push({ id: roleId, name: roleName });
            this.renderRoleTags('allowedRolesTags', roles, 'allowedRolesSelect', 'allowedRoles');
        }
        
        select.value = '';
    }
    
    addVipRole() {
        const select = document.getElementById('vipRolesSelect');
        const roleId = select.value;
        if (!roleId) return;
        
        const container = document.getElementById('vipRolesTags');
        const roles = JSON.parse(container.dataset.roles || '[]');
        
        if (!roles.find(r => (r.id || r) === roleId)) {
            const roleName = select.options[select.selectedIndex].text;
            roles.push({ id: roleId, name: roleName });
            this.renderRoleTags('vipRolesTags', roles, 'vipRolesSelect', 'vipRoles');
        }
        
        select.value = '';
    }
    
    addPremiumRole() {
        const select = document.getElementById('premiumRolesSelect');
        const roleId = select.value;
        if (!roleId) return;
        
        const container = document.getElementById('premiumRolesTags');
        const roles = JSON.parse(container.dataset.roles || '[]');
        
        if (!roles.find(r => (r.id || r) === roleId)) {
            const roleName = select.options[select.selectedIndex].text;
            roles.push({ id: roleId, name: roleName });
            this.renderRoleTags('premiumRolesTags', roles, 'premiumRolesSelect', 'premiumRoles');
        }
        
        select.value = '';
    }
    
    removeRole(containerId, roleId) {
        const container = document.getElementById(containerId);
        const roles = JSON.parse(container.dataset.roles || '[]');
        const filtered = roles.filter(r => (r.id || r) !== roleId);
        this.renderRoleTags(containerId, filtered, containerId.replace('Tags', 'Select'), containerId.replace('Tags', ''));
    }
    
    updateTierDisplay() {
        // This can be used to show/hide tier-specific options if needed
        console.log('Tier changed');
    }
    
    async loadGuildChannels() {
        const voiceSelect = document.getElementById('247VoiceChannelSelect');
        const textSelect = document.getElementById('247TextChannelSelect');
        
        voiceSelect.innerHTML = '<option value="">None</option>';
        textSelect.innerHTML = '<option value="">None</option>';
        
        try {
            const response = await fetch(`/api/guild/${this.guildId}/channels`, {
                headers: { 'X-API-Key': this.apiKey }
            });
            
            if (response.ok) {
                const { voiceChannels, textChannels } = await response.json();
                
                voiceChannels.forEach(channel => {
                    const option = document.createElement('option');
                    option.value = channel.id;
                    option.textContent = channel.name;
                    voiceSelect.appendChild(option);
                });
                
                textChannels.forEach(channel => {
                    const option = document.createElement('option');
                    option.value = channel.id;
                    option.textContent = '#' + channel.name;
                    textSelect.appendChild(option);
                });
            }
        } catch (error) {
            console.error('Failed to load channels:', error);
        }
    }
    
    async saveSettings() {
        // Check if guild is selected
        if (!this.guildId) {
            alert('Please select a server first');
            return;
        }
        
        const getRoleIds = (containerId) => {
            const container = document.getElementById(containerId);
            const roles = JSON.parse(container.dataset.roles || '[]');
            return roles.map(r => r.id || r);
        };
        
        const getUserIds = (containerId) => {
            const container = document.getElementById(containerId);
            const users = JSON.parse(container.dataset.users || '[]');
            return users.map(u => u.id || u);
        };
        
        const settings = {
            prefix: document.getElementById('prefixInput').value,
            defaultVolume: parseInt(document.getElementById('defaultVolumeSlider').value),
            djRoles: getRoleIds('djRolesTags'),
            autoPlay: document.getElementById('autoPlayCheck').checked,
            leaveOnEmpty: document.getElementById('leaveOnEmptyCheck').checked,
            stay247: document.getElementById('stay247Check').checked,
            textChannelId: document.getElementById('247TextChannelSelect').value,
            voiceChannelId: document.getElementById('247VoiceChannelSelect').value,
            tier: document.querySelector('input[name="tier"]:checked')?.value || 'free',
            allowedRoles: getRoleIds('allowedRolesTags'),
            vipRoles: getRoleIds('vipRolesTags'),
            premiumRoles: getRoleIds('premiumRolesTags'),
            allowedUsers: getUserIds('allowedUsersTags'),
            vipUsers: getUserIds('vipUsersTags'),
            premiumUsers: getUserIds('premiumUsersTags')
        };
        
        try {
            const response = await fetch(`/api/settings/${this.guildId}`, {
                method: 'PUT',
                headers: { 
                    'Content-Type': 'application/json',
                    'X-API-Key': this.apiKey 
                },
                body: JSON.stringify(settings)
            });
            
            if (response.ok) {
                alert('Settings saved successfully!');
            } else {
                const error = await response.json();
                alert('Failed to save settings: ' + (error.error || 'Unknown error'));
            }
        } catch (error) {
            console.error('Failed to save settings:', error);
            alert('Failed to save settings: ' + error.message);
        }
    }

    closeModal(modalId) {
        document.getElementById(modalId).classList.add('hidden');
    }

    async apiCall(method, endpoint, body = null) {
        try {
            const options = {
                method,
                headers: { 
                    'Content-Type': 'application/json',
                    'X-API-Key': this.apiKey
                }
            };
            
            if (body) options.body = JSON.stringify(body);
            
            const response = await fetch(endpoint, options);
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Request failed');
            }
            
            return await response.json();
        } catch (error) {
            console.error('API call failed:', error);
            alert(`Error: ${error.message}`);
        }
    }

    updateConnectionStatus(connected) {
        this.connectionStatus.classList.remove('hidden');
        this.connectionStatus.classList.toggle('connected', connected);
        this.connectionStatus.classList.toggle('disconnected', !connected);
        this.statusText.textContent = connected ? '🟢 Connected' : '🔴 Disconnected';
    }

    formatTime(ms) {
        if (!ms || ms < 0) return '0:00';
        const totalSeconds = Math.floor(ms / 1000);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        
        if (hours > 0) {
            return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        }
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }

    formatUptime(ms) {
        const hours = Math.floor(ms / 3600000);
        return `${hours}h`;
    }

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // ============ SPOTIFY & YOUTUBE MUSIC IMPORT ============

    openImportSpotifyModal() {
        document.getElementById('importSpotifyModal').classList.remove('hidden');
        document.getElementById('spotifyPlaylistUrl').value = '';
        document.getElementById('spotifyPlaylistUrl').focus();
    }

    openImportYTMModal() {
        document.getElementById('importYTMModal').classList.remove('hidden');
        document.getElementById('ytmSearchInput').value = '';
        document.getElementById('ytmSearchResults').innerHTML = '';
        document.getElementById('ytmSearchInput').focus();
    }

    async importFromSpotify() {
        const url = document.getElementById('spotifyPlaylistUrl').value.trim();
        if (!url) {
            alert('Please enter a Spotify playlist URL');
            return;
        }

        if (!url.includes('spotify.com/playlist/')) {
            alert('Please enter a valid Spotify playlist URL');
            return;
        }

        const btn = event.target;
        const originalText = btn.textContent;
        btn.textContent = 'Importing...';
        btn.disabled = true;

        try {
            const response = await fetch(`/api/playlists/${this.guildId}/import/spotify`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-API-Key': this.apiKey
                },
                body: JSON.stringify({
                    playlistUrl: url,
                    targetPlaylistId: this.currentPlaylist?.id || null
                })
            });

            if (response.ok) {
                const data = await response.json();
                this.closeModal('importSpotifyModal');
                alert(`Successfully imported ${data.imported} of ${data.total} tracks!`);
                
                if (this.currentPlaylist) {
                    this.currentPlaylist = data.playlist;
                    this.renderPlaylistDetails();
                }
                await this.loadPlaylists();
            } else {
                const error = await response.json();
                alert('Failed to import: ' + (error.error || 'Unknown error'));
            }
        } catch (error) {
            console.error('Failed to import Spotify playlist:', error);
            alert('Failed to import: ' + error.message);
        } finally {
            btn.textContent = originalText;
            btn.disabled = false;
        }
    }

    async searchYTMPlaylists() {
        const query = document.getElementById('ytmSearchInput').value.trim();
        if (!query) {
            document.getElementById('ytmSearchResults').innerHTML = '';
            return;
        }

        const resultsContainer = document.getElementById('ytmSearchResults');
        resultsContainer.innerHTML = '<p class="empty-playlists">Searching...</p>';

        try {
            const response = await fetch(`/api/search/ytmusic?query=${encodeURIComponent(query)}`, {
                headers: { 'X-API-Key': this.apiKey }
            });

            if (response.ok) {
                const data = await response.json();
                const playlists = data?.playlists || [];

                if (playlists.length === 0) {
                    resultsContainer.innerHTML = '<p class="empty-playlists">No playlists found. Try a different search or paste a YouTube Music playlist link.</p>';
                    return;
                }

                resultsContainer.innerHTML = playlists.map(p => `
                    <div class="ytm-playlist-result" onclick="dashboard.importFromYTM('${p.id}', '${this.escapeHtml(p.title)}')">
                        <img src="${p.artworkUrl || 'https://cdn.discordapp.com/embed/avatars/0.png'}" alt="">
                        <div class="ytm-playlist-info">
                            <div class="ytm-playlist-title">${this.escapeHtml(p.title)}</div>
                            <div class="ytm-playlist-meta">${p.trackCount || 0} tracks</div>
                        </div>
                    </div>
                `).join('');
            }
        } catch (error) {
            console.error('Failed to search YouTube Music:', error);
            resultsContainer.innerHTML = '<p class="empty-playlists">Search failed. Please try again.</p>';
        }
    }

    async importFromYTM(playlistId, playlistName) {
        const btn = event.target.closest('.ytm-playlist-result');
        if (btn) btn.disabled = true;

        try {
            const response = await fetch(`/api/playlists/${this.guildId}/import/ytmusic`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-API-Key': this.apiKey
                },
                body: JSON.stringify({
                    playlistId: playlistId,
                    playlistName: playlistName,
                    targetPlaylistId: this.currentPlaylist?.id || null
                })
            });

            if (response.ok) {
                const data = await response.json();
                this.closeModal('importYTMModal');
                alert(`Successfully imported ${data.imported} of ${data.total} tracks!`);
                
                if (this.currentPlaylist) {
                    this.currentPlaylist = data.playlist;
                    this.renderPlaylistDetails();
                }
                await this.loadPlaylists();
            } else {
                const error = await response.json();
                alert('Failed to import: ' + (error.error || 'Unknown error'));
            }
        } catch (error) {
            console.error('Failed to import YouTube Music playlist:', error);
            alert('Failed to import: ' + error.message);
        } finally {
            if (btn) btn.disabled = false;
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    console.log('=== DOMContentLoaded - Creating Dashboard ===');
    try {
        window.dashboard = new MusicDashboard();
        console.log('Dashboard created successfully');
    } catch (error) {
        console.error('ERROR creating dashboard:', error);
        alert('Error creating dashboard: ' + error.message);
    }
});
