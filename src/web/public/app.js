class MusicDashboard {
    constructor() {
        this.apiKey = '';
        this.guildId = '';
        this.ws = null;
        this.playerState = null;
        this.queue = [];
        this.positionUpdateInterval = null;
        this.guilds = [];
        this.playlists = [];
        this.history = [];
        this.activeFilters = new Set();
        this.currentSearchResults = [];
        
        this.initializeElements();
        this.attachEventListeners();
        this.loadGuilds();
    }

    initializeElements() {
        this.guildSelect = document.getElementById('guildSelect');
        this.connectionStatus = document.getElementById('connectionStatus');
        this.statusText = document.getElementById('statusText');
        
        this.albumArt = document.getElementById('albumArt');
        this.noArtwork = document.getElementById('noArtwork');
        this.trackTitle = document.getElementById('trackTitle');
        this.trackArtist = document.getElementById('trackArtist');
        this.trackAlbum = document.getElementById('trackAlbum');
        
        this.progressBar = document.getElementById('progressBar');
        this.progressFill = document.getElementById('progressFill');
        this.progressHandle = document.getElementById('progressHandle');
        this.currentTime = document.getElementById('currentTime');
        this.totalTime = document.getElementById('totalTime');
        
        this.playPauseBtn = document.getElementById('playPauseBtn');
        this.playIcon = document.getElementById('playIcon');
        this.pauseIcon = document.getElementById('pauseIcon');
        this.previousBtn = document.getElementById('previousBtn');
        this.nextBtn = document.getElementById('nextBtn');
        this.shuffleBtn = document.getElementById('shuffleBtn');
        this.repeatBtn = document.getElementById('repeatBtn');
        
        this.volumeSlider = document.getElementById('volumeSlider');
        this.muteBtn = document.getElementById('muteBtn');
        
        this.queueList = document.getElementById('queueList');
        this.queueCount = document.getElementById('queueCount');
        
        this.searchInput = document.getElementById('searchInput');
        this.searchResults = document.getElementById('searchResults');
        
        this.toastContainer = document.getElementById('toastContainer');
        this.createPlaylistModal = document.getElementById('createPlaylistModal');
    }

    attachEventListeners() {
        this.guildSelect.addEventListener('change', (e) => this.selectGuild(e.target.value));
        
        this.playPauseBtn.addEventListener('click', () => this.togglePlayPause());
        this.previousBtn.addEventListener('click', () => this.previous());
        this.nextBtn.addEventListener('click', () => this.skip());
        this.shuffleBtn.addEventListener('click', () => this.shuffle());
        this.repeatBtn.addEventListener('click', () => this.toggleRepeat());
        
        this.volumeSlider.addEventListener('input', (e) => this.setVolume(e.target.value));
        this.muteBtn.addEventListener('click', () => this.toggleMute());
        
        document.querySelectorAll('.preset-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.setVolume(e.target.dataset.volume));
        });
        
        this.progressBar.addEventListener('click', (e) => this.seek(e));
        this.progressBar.addEventListener('mousemove', (e) => this.updateProgressHandle(e));
        
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', (e) => this.switchTab(e));
        });
        
        document.getElementById('shuffleQueueBtn').addEventListener('click', () => this.shuffleQueue());
        document.getElementById('clearQueueBtn').addEventListener('click', () => this.clearQueue());
        document.getElementById('saveQueueBtn').addEventListener('click', () => this.showSaveQueueModal());
        
        document.querySelectorAll('.filter-btn[data-filter]').forEach(btn => {
            btn.addEventListener('click', (e) => this.toggleFilter(e.target.dataset.filter));
        });
        
        document.getElementById('resetFilterBtn').addEventListener('click', () => this.resetFilters());
        
        document.getElementById('createPlaylistBtn').addEventListener('click', () => this.openModal());
        document.getElementById('closeModal').addEventListener('click', () => this.closeModal());
        document.getElementById('cancelPlaylistBtn').addEventListener('click', () => this.closeModal());
        document.getElementById('confirmPlaylistBtn').addEventListener('click', () => this.createPlaylist());
        
        document.getElementById('searchBtn').addEventListener('click', () => this.search());
        this.searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.search();
        });
        
        document.getElementById('saveSettingsBtn').addEventListener('click', () => this.saveSettings());
        
        document.getElementById('syncEmojiBtn').addEventListener('click', () => this.syncEmojis());
        
        document.getElementById('clearHistoryBtn').addEventListener('click', () => this.clearHistory());
        
        document.getElementById('settingsBtn').addEventListener('click', () => {
            this.switchTab({ target: { dataset: { tab: 'settings' } } });
        });
        
        this.createPlaylistModal.addEventListener('click', (e) => {
            if (e.target === this.createPlaylistModal) this.closeModal();
        });
    }

    async loadGuilds() {
        try {
            const response = await fetch('/api/players?apiKey=' + this.getApiKey());
            if (response.ok) {
                const data = await response.json();
                this.guilds = data.players || [];
                this.populateGuildSelect();
            }
        } catch (error) {
            console.error('Error loading guilds:', error);
            this.showToast('Failed to load servers', 'error');
        }
    }

    populateGuildSelect() {
        const currentValue = this.guildSelect.value;
        this.guildSelect.innerHTML = '<option value="">Select a server...</option>';
        
        this.guilds.forEach(player => {
            const option = document.createElement('option');
            option.value = player.guildId;
            option.textContent = player.guildName;
            this.guildSelect.appendChild(option);
        });
        
        if (currentValue && this.guilds.find(g => g.guildId === currentValue)) {
            this.guildSelect.value = currentValue;
        }
    }

    getApiKey() {
        return this.apiKey || 'MTQ1Mzk3NDM1MjY5NjQ0Mjk1MQ';
    }

    async selectGuild(guildId) {
        if (!guildId) {
            this.disconnect();
            return;
        }
        
        this.guildId = guildId;
        const player = this.guilds.find(p => p.guildId === guildId);
        
        if (player) {
            document.getElementById('guildName').textContent = player.guildName;
        }
        
        await this.connect();
        this.updateStats();
    }

    async connect() {
        if (!this.guildId) return;
        
        this.apiKey = this.getApiKey();
        
        try {
            const response = await fetch(`/api/player/${this.guildId}?apiKey=${this.apiKey}`);
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to connect');
            }
            
            this.connectWebSocket();
            await this.loadPlayerState();
            await this.loadQueue();
            await this.loadPlaylists();
            await this.loadHistory();
            await this.loadSettings();
            
            this.updateConnectionStatus(true);
            this.showStats();
            
        } catch (error) {
            this.showToast(`Connection failed: ${error.message}`, 'error');
            this.updateConnectionStatus(false);
        }
    }

    connectWebSocket() {
        if (this.ws) {
            this.ws.close();
        }
        
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}?guildId=${this.guildId}&apiKey=${this.apiKey}`;
        
        this.ws = new WebSocket(wsUrl);
        
        this.ws.onopen = () => {
            console.log('WebSocket connected');
        };
        
        this.ws.onmessage = (event) => {
            const message = JSON.parse(event.data);
            this.handleWebSocketMessage(message);
        };
        
        this.ws.onclose = () => {
            console.log('WebSocket disconnected');
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
            this.updateQueueUI();
            this.updateStats();
        }
    }

    async loadPlayerState() {
        try {
            const response = await fetch(`/api/player/${this.guildId}?apiKey=${this.apiKey}`);
            if (response.ok) {
                this.playerState = await response.json();
                this.updateUI();
            }
        } catch (error) {
            console.error('Error loading player state:', error);
        }
    }

    async loadQueue() {
        try {
            const response = await fetch(`/api/player/${this.guildId}/queue?apiKey=${this.apiKey}`);
            if (response.ok) {
                const data = await response.json();
                this.queue = data.queue || [];
                this.updateQueueUI(data.current);
            }
        } catch (error) {
            console.error('Error loading queue:', error);
        }
    }

    async loadPlaylists() {
        try {
            const response = await fetch(`/api/playlists?apiKey=${this.apiKey}`);
            if (response.ok) {
                this.playlists = await response.json();
                this.updatePlaylistsUI();
            }
        } catch (error) {
            console.error('Error loading playlists:', error);
        }
    }

    async loadHistory() {
        this.historyList = document.getElementById('historyList');
        this.historyList.innerHTML = `
            <div class="empty-state">
                <span class="empty-icon">📜</span>
                <p>Loading history...</p>
            </div>
        `;
        
        try {
            const response = await fetch(`/api/player/${this.guildId}/history?apiKey=${this.apiKey}`);
            if (response.ok) {
                const data = await response.json();
                this.history = data.history || [];
                this.updateHistoryUI();
            }
        } catch (error) {
            console.error('Error loading history:', error);
            this.historyList.innerHTML = `
                <div class="empty-state">
                    <span class="empty-icon">📜</span>
                    <p>No history yet</p>
                    <span class="empty-hint">Played tracks will appear here</span>
                </div>
            `;
        }
    }

    async loadSettings() {
        try {
            const response = await fetch(`/api/guild/${this.guildId}/settings?apiKey=${this.apiKey}`);
            if (response.ok) {
                const settings = await response.json();
                document.getElementById('settingPrefix').value = settings.prefixes?.[0] || '!';
                document.getElementById('settingVolume').value = settings.default_volume || 100;
                document.getElementById('settingVolumeValue').textContent = (settings.default_volume || 100) + '%';
                document.getElementById('setting247').checked = settings.stay_247 || false;
                document.getElementById('settingAutoDisconnect').checked = settings.auto_disconnect !== false;
            }
        } catch (error) {
            console.error('Error loading settings:', error);
        }
    }

    updateUI() {
        if (!this.playerState) return;
        
        const { currentTrack, isPlaying, isPaused, volume, repeatMode, position } = this.playerState;
        
        if (currentTrack) {
            this.trackTitle.textContent = currentTrack.title;
            this.trackArtist.textContent = currentTrack.author;
            this.trackAlbum.textContent = currentTrack.album || '';
            
            if (currentTrack.artworkUrl) {
                this.albumArt.src = currentTrack.artworkUrl;
                this.albumArt.style.display = 'block';
                this.noArtwork.style.display = 'none';
            } else {
                this.albumArt.style.display = 'none';
                this.noArtwork.style.display = 'flex';
            }
        } else {
            this.trackTitle.textContent = 'No track playing';
            this.trackArtist.textContent = 'Unknown Artist';
            this.trackAlbum.textContent = '';
            this.albumArt.style.display = 'none';
            this.noArtwork.style.display = 'flex';
        }
        
        if (isPlaying && !isPaused) {
            this.playIcon.classList.add('hidden');
            this.pauseIcon.classList.remove('hidden');
        } else {
            this.playIcon.classList.remove('hidden');
            this.pauseIcon.classList.add('hidden');
        }
        
        this.repeatBtn.classList.toggle('active', repeatMode !== 'off');
        this.volumeSlider.value = volume;
        
        this.updateProgress();
        this.updateStats();
    }

    updateProgress() {
        if (!this.playerState || !this.playerState.currentTrack) {
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
            this.progressHandle.style.left = `${progress}%`;
        } else {
            this.progressFill.style.width = '100%';
            this.progressHandle.style.left = '100%';
        }
        
        this.currentTime.textContent = this.formatTime(position);
        this.totalTime.textContent = currentTrack.isStream ? 'LIVE' : this.formatTime(duration);
    }

    updateQueueUI(currentTrack) {
        this.queueCount.textContent = this.queue.length;
        
        if (this.queue.length === 0) {
            this.queueList.innerHTML = `
                <div class="empty-queue">
                    <span class="empty-icon">📋</span>
                    <p>No tracks in queue</p>
                    <span class="empty-hint">Use /play in Discord or search below to add songs</span>
                </div>
            `;
            return;
        }
        
        this.queueList.innerHTML = this.queue.map((track, index) => {
            const isActive = currentTrack && track.title === currentTrack.title;
            return `
                <div class="queue-item ${isActive ? 'active' : ''}" data-position="${index + 1}">
                    <img src="${track.artworkUrl || ''}" alt="${track.title}" class="queue-item-artwork" onerror="this.style.display='none'">
                    <div class="queue-item-info">
                        <div class="queue-item-title">${this.escapeHtml(track.title)}</div>
                        <div class="queue-item-artist">${this.escapeHtml(track.author)}</div>
                    </div>
                    <div class="queue-item-duration">${this.formatTime(track.duration)}</div>
                    <div class="queue-item-actions">
                        <button class="queue-action-btn" data-action="play" data-position="${index + 1}" title="Play Now">▶️</button>
                        <button class="queue-action-btn" data-action="remove" data-position="${index + 1}" title="Remove">🗑️</button>
                        <button class="queue-action-btn" data-action="bump" data-position="${index + 1}" title="Bump to Front">⬆️</button>
                    </div>
                </div>
            `;
        }).join('');
        
        this.queueList.querySelectorAll('.queue-action-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const action = btn.dataset.action;
                const position = parseInt(btn.dataset.position);
                this.handleQueueAction(action, position);
            });
        });
    }

    updatePlaylistsUI() {
        const grid = document.getElementById('playlistsGrid');
        
        if (this.playlists.length === 0) {
            grid.innerHTML = `
                <div class="empty-state">
                    <span class="empty-icon">📁</span>
                    <p>No playlists yet</p>
                    <span class="empty-hint">Create a playlist to save your favorite tracks</span>
                </div>
            `;
            return;
        }
        
        grid.innerHTML = this.playlists.map(playlist => `
            <div class="playlist-card" data-name="${playlist.name}">
                <span class="playlist-icon">🎵</span>
                <div class="playlist-name">${this.escapeHtml(playlist.name)}</div>
                <div class="playlist-info">${playlist.trackCount || 0} tracks</div>
            </div>
        `).join('');
        
        grid.querySelectorAll('.playlist-card').forEach(card => {
            card.addEventListener('click', () => this.loadPlaylist(card.dataset.name));
        });
    }

    updateHistoryUI() {
        const list = document.getElementById('historyList');
        
        if (this.history.length === 0) {
            list.innerHTML = `
                <div class="empty-state">
                    <span class="empty-icon">📜</span>
                    <p>No history yet</p>
                    <span class="empty-hint">Played tracks will appear here</span>
                </div>
            `;
            return;
        }
        
        list.innerHTML = this.history.slice(0, 50).map((track, index) => `
            <div class="queue-item" data-position="${index + 1}">
                <img src="${track.artworkUrl || ''}" alt="${track.title}" class="queue-item-artwork" onerror="this.style.display='none'">
                <div class="queue-item-info">
                    <div class="queue-item-title">${this.escapeHtml(track.title)}</div>
                    <div class="queue-item-artist">${this.escapeHtml(track.author)}</div>
                </div>
                <div class="queue-item-duration">${this.formatTime(track.duration)}</div>
            </div>
        `).join('');
    }

    showStats() {
        document.getElementById('statsGrid').style.display = 'grid';
    }

    updateStats() {
        if (!this.playerState) return;
        
        document.getElementById('statPlaying').textContent = this.playerState.currentTrack ? '1' : '0';
        document.getElementById('statQueue').textContent = this.playerState.queueSize || 0;
        document.getElementById('statVolume').textContent = this.playerState.volume + '%';
        document.getElementById('statLoop').textContent = this.playerState.repeatMode || 'Off';
    }

    switchTab(e) {
        e.preventDefault();
        const tab = e.target.closest('.nav-item');
        if (!tab) return;
        
        document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
        
        tab.classList.add('active');
        const tabId = tab.dataset.tab + '-tab';
        document.getElementById(tabId)?.classList.add('active');
    }

    handleQueueAction(action, position) {
        switch (action) {
            case 'play':
                this.apiCall('POST', `/api/player/${this.guildId}/seek`, { position: 0 });
                break;
            case 'remove':
                this.apiCall('DELETE', `/api/player/${this.guildId}/queue/${position}`);
                this.loadQueue();
                break;
            case 'bump':
                this.bumpTrack(position);
                break;
        }
    }

    async bumpTrack(position) {
        try {
            await this.apiCall('POST', `/api/player/${this.guildId}/bump`, { position });
            this.loadQueue();
            this.showToast('Track moved to front', 'success');
        } catch (error) {
            this.showToast('Failed to bump track', 'error');
        }
    }

    async toggleFilter(filter) {
        if (this.activeFilters.has(filter)) {
            this.activeFilters.delete(filter);
        } else {
            this.activeFilters.add(filter);
        }
        
        document.querySelectorAll(`.filter-btn[data-filter="${filter}"]`).forEach(btn => {
            btn.classList.toggle('active', this.activeFilters.has(filter));
        });
        
        try {
            await this.apiCall('POST', `/api/player/${this.guildId}/filter`, { 
                filters: Array.from(this.activeFilters) 
            });
        } catch (error) {
            this.showToast('Failed to apply filter', 'error');
        }
    }

    async resetFilters() {
        this.activeFilters.clear();
        document.querySelectorAll('.filter-btn[data-filter]').forEach(btn => {
            btn.classList.remove('active');
        });
        
        try {
            await this.apiCall('POST', `/api/player/${this.guildId}/filter`, { filters: [] });
            this.showToast('Filters reset', 'success');
        } catch (error) {
            this.showToast('Failed to reset filters', 'error');
        }
    }

    async search() {
        const query = this.searchInput.value.trim();
        if (!query) return;
        
        this.searchResults.innerHTML = `
            <div class="search-hint">
                <span>⏳</span>
                <p>Searching...</p>
            </div>
        `;
        
        try {
            const response = await fetch(`/api/search?q=${encodeURIComponent(query)}&apiKey=${this.apiKey}`);
            if (response.ok) {
                this.currentSearchResults = await response.json();
                this.displaySearchResults();
            } else {
                throw new Error('Search failed');
            }
        } catch (error) {
            console.error('Search error:', error);
            this.searchResults.innerHTML = `
                <div class="search-hint">
                    <span>❌</span>
                    <p>No results found</p>
                </div>
            `;
        }
    }

    displaySearchResults() {
        if (this.currentSearchResults.length === 0) {
            this.searchResults.innerHTML = `
                <div class="search-hint">
                    <span>🔍</span>
                    <p>No results found</p>
                </div>
            `;
            return;
        }
        
        this.searchResults.innerHTML = this.currentSearchResults.map(track => `
            <div class="search-result-item" data-uri="${track.uri}">
                <img src="${track.artworkUrl || ''}" alt="${track.title}" class="search-result-artwork" onerror="this.style.display='none'">
                <div class="search-result-info">
                    <div class="search-result-title">${this.escapeHtml(track.title)}</div>
                    <div class="search-result-artist">${this.escapeHtml(track.author)}</div>
                </div>
                <div class="search-result-duration">${this.formatTime(track.duration)}</div>
                <button class="search-result-add" data-uri="${track.uri}">Add</button>
            </div>
        `).join('');
        
        this.searchResults.querySelectorAll('.search-result-add').forEach(btn => {
            btn.addEventListener('click', () => this.addToQueue(btn.dataset.uri));
        });
    }

    async addToQueue(uri) {
        try {
            await this.apiCall('POST', `/api/player/${this.guildId}/play`, { query: uri });
            this.showToast('Added to queue', 'success');
            this.loadQueue();
        } catch (error) {
            this.showToast('Failed to add to queue', 'error');
        }
    }

    async saveSettings() {
        const settings = {
            prefix: document.getElementById('settingPrefix').value,
            default_volume: parseInt(document.getElementById('settingVolume').value),
            stay_247: document.getElementById('setting247').checked,
            auto_disconnect: document.getElementById('settingAutoDisconnect').checked
        };
        
        try {
            await this.apiCall('PUT', `/api/guild/${this.guildId}/settings`, settings);
            this.showToast('Settings saved', 'success');
        } catch (error) {
            this.showToast('Failed to save settings', 'error');
        }
    }

    async syncEmojis() {
        try {
            await this.apiCall('POST', `/api/emoji/sync`, { guildId: this.guildId });
            this.showToast('Emojis synced', 'success');
            this.loadEmojis();
        } catch (error) {
            this.showToast('Failed to sync emojis', 'error');
        }
    }

    async loadEmojis() {
        try {
            const response = await fetch(`/api/emoji?apiKey=${this.apiKey}&guildId=${this.guildId}`);
            if (response.ok) {
                const emojis = await response.json();
                const grid = document.getElementById('emojiGrid');
                grid.innerHTML = Object.entries(emojis).map(([key, emoji]) => `
                    <div class="emoji-card" data-key="${key}">
                        <div class="emoji-display">${emoji}</div>
                        <div class="emoji-key">${key}</div>
                        <div class="emoji-name">Custom</div>
                    </div>
                `).join('');
            }
        } catch (error) {
            console.error('Error loading emojis:', error);
        }
    }

    async clearHistory() {
        try {
            await this.apiCall('DELETE', `/api/player/${this.guildId}/history`);
            this.history = [];
            this.updateHistoryUI();
            this.showToast('History cleared', 'success');
        } catch (error) {
            this.showToast('Failed to clear history', 'error');
        }
    }

    openModal() {
        this.createPlaylistModal.classList.add('active');
        document.getElementById('playlistNameInput').focus();
    }

    closeModal() {
        this.createPlaylistModal.classList.remove('active');
        document.getElementById('playlistNameInput').value = '';
    }

    async createPlaylist() {
        const name = document.getElementById('playlistNameInput').value.trim();
        if (!name) {
            this.showToast('Please enter a playlist name', 'warning');
            return;
        }
        
        try {
            await this.apiCall('POST', '/api/playlist/create', { name, guildId: this.guildId });
            this.showToast('Playlist created', 'success');
            this.closeModal();
            this.loadPlaylists();
        } catch (error) {
            this.showToast('Failed to create playlist', 'error');
        }
    }

    async loadPlaylist(name) {
        try {
            await this.apiCall('POST', '/api/playlist/load', { name, guildId: this.guildId });
            this.showToast(`Loading "${name}"`, 'success');
            this.loadQueue();
        } catch (error) {
            this.showToast('Failed to load playlist', 'error');
        }
    }

    async showSaveQueueModal() {
        if (this.queue.length === 0) {
            this.showToast('Queue is empty', 'warning');
            return;
        }
        this.openModal();
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
        await this.loadQueue();
    }

    async shuffleQueue() {
        await this.shuffle();
    }

    async clearQueue() {
        if (this.queue.length === 0) return;
        try {
            await this.apiCall('DELETE', `/api/player/${this.guildId}/queue`);
            this.queue = [];
            this.updateQueueUI();
            this.showToast('Queue cleared', 'success');
        } catch (error) {
            this.showToast('Failed to clear queue', 'error');
        }
    }

    async toggleRepeat() {
        const modes = ['off', 'track', 'queue'];
        const currentMode = this.playerState?.repeatMode || 'off';
        const currentIndex = modes.indexOf(currentMode);
        const nextMode = modes[(currentIndex + 1) % modes.length];
        
        await this.apiCall('POST', `/api/player/${this.guildId}/loop`, { mode: nextMode });
    }

    async setVolume(volume) {
        this.volumeSlider.value = volume;
        await this.apiCall('POST', `/api/player/${this.guildId}/volume`, { volume: parseInt(volume) });
    }

    async toggleMute() {
        if (this.volumeSlider.value > 0) {
            this.previousVolume = this.volumeSlider.value;
            this.setVolume(0);
        } else {
            this.setVolume(this.previousVolume || 100);
        }
    }

    async seek(e) {
        if (!this.playerState || !this.playerState.currentTrack || this.playerState.currentTrack.isStream) return;
        
        const rect = this.progressBar.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const percent = Math.max(0, Math.min(1, x / rect.width));
        const duration = this.playerState.currentTrack.duration;
        const position = Math.floor(percent * duration);
        
        await this.apiCall('POST', `/api/player/${this.guildId}/seek`, { position });
    }

    updateProgressHandle(e) {
        if (!this.playerState || !this.playerState.currentTrack) return;
        
        const rect = this.progressBar.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const percent = Math.max(0, Math.min(100, (x / rect.width) * 100));
        this.progressHandle.style.left = `${percent}%`;
    }

    updateConnectionStatus(connected) {
        this.connectionStatus.classList.remove('connected', 'disconnected');
        this.connectionStatus.classList.add(connected ? 'connected' : 'disconnected');
        this.statusText.textContent = connected ? 'Connected' : 'Disconnected';
    }

    disconnect() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.playerState = null;
        this.queue = [];
        this.updateConnectionStatus(false);
        this.trackTitle.textContent = 'No track playing';
        this.trackArtist.textContent = 'Unknown Artist';
        this.albumArt.style.display = 'none';
        this.noArtwork.style.display = 'flex';
        this.progressFill.style.width = '0%';
        this.queueList.innerHTML = '';
        document.getElementById('statsGrid').style.display = 'none';
    }

    async apiCall(method, endpoint, body = null) {
        const options = {
            method,
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': this.apiKey,
            },
        };
        
        if (body) {
            options.body = JSON.stringify(body);
        }
        
        const response = await fetch(endpoint, options);
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Request failed');
        }
        
        return await response.json();
    }

    showToast(message, type = 'info') {
        const icons = {
            success: '✅',
            error: '❌',
            warning: '⚠️',
            info: 'ℹ️'
        };
        
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `
            <span class="toast-icon">${icons[type] || icons.info}</span>
            <span class="toast-message">${message}</span>
        `;
        
        this.toastContainer.appendChild(toast);
        
        setTimeout(() => {
            toast.style.animation = 'slideIn 0.3s ease reverse';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
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

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new MusicDashboard();
});
