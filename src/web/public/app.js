class MusicDashboard {
    constructor() {
        this.apiKey = 'MTQ1Mzk3NDM1MjY5NjQ0Mjk1MQ'; // Default API key from config
        this.guildId = '';
        this.guildId = '';
        this.ws = null;
        this.playerState = null;
        this.queue = [];
        this.guilds = [];
        this.playlists = [];
        this.history = [];
        this.activeFilters = new Set();
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        
        this.init();
    }

    init() {
        this.cacheElements();
        this.bindEvents();
        this.loadGuilds();
    }

    cacheElements() {
        this.guildSelect = document.getElementById('guildSelect');
        this.connectionIndicator = document.getElementById('connectionIndicator');
        this.indicatorText = document.getElementById('indicatorText');
        
        this.albumArt = document.getElementById('albumArt');
        this.noArtwork = document.getElementById('noArtwork');
        this.trackTitle = document.getElementById('trackTitle');
        this.trackArtist = document.getElementById('trackArtist');
        this.trackAlbum = document.getElementById('trackAlbum');
        
        this.progressBar = document.getElementById('progressBar');
        this.progressFill = document.getElementById('progressFill');
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
        this.volumeValue = document.getElementById('volumeValue');
        this.muteBtn = document.getElementById('muteBtn');
        
        this.queueList = document.getElementById('queueList');
        this.queueCount = document.getElementById('queueCount');
        
        this.toastContainer = document.getElementById('toastContainer');
    }

    bindEvents() {
        this.guildSelect.addEventListener('change', (e) => this.selectGuild(e.target.value));
        
        this.playPauseBtn.addEventListener('click', () => this.togglePlayPause());
        this.previousBtn.addEventListener('click', () => this.previous());
        this.nextBtn.addEventListener('click', () => this.skip());
        this.shuffleBtn.addEventListener('click', () => this.shuffle());
        this.repeatBtn.addEventListener('click', () => this.toggleRepeat());
        
        this.volumeSlider.addEventListener('input', (e) => this.setVolume(e.target.value));
        this.muteBtn.addEventListener('click', () => this.toggleMute());
        
        this.progressBar.addEventListener('click', (e) => this.seek(e));
        
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', (e) => this.switchTab(e));
        });
        
        document.getElementById('shuffleQueueBtn').addEventListener('click', () => this.shuffleQueue());
        document.getElementById('clearQueueBtn').addEventListener('click', () => this.clearQueue());
        
        document.querySelectorAll('.filter-btn[data-filter]').forEach(btn => {
            btn.addEventListener('click', (e) => this.toggleFilter(e.target.dataset.filter));
        });
        
        document.getElementById('resetFiltersBtn').addEventListener('click', () => this.resetFilters());
        
        document.getElementById('createPlaylistBtn').addEventListener('click', () => this.createPlaylist());
        document.getElementById('clearHistoryBtn').addEventListener('click', () => this.clearHistory());
        
        document.getElementById('settingVolume').addEventListener('input', (e) => {
            document.getElementById('settingVolumeValue').textContent = e.target.value + '%';
        });
        
        document.getElementById('saveSettingsBtn').addEventListener('click', () => this.saveSettings());
        document.getElementById('syncEmojiBtn').addEventListener('click', () => this.syncEmojis());
        document.getElementById('closeEmojiModal').addEventListener('click', () => this.closeEmojiModal());
        document.getElementById('cancelEmojiBtn').addEventListener('click', () => this.closeEmojiModal());
        document.getElementById('saveEmojiBtn').addEventListener('click', () => this.saveEmoji());
        document.getElementById('deleteEmojiBtn').addEventListener('click', () => this.deleteEmoji());
        document.getElementById('emojiEditModal').addEventListener('click', (e) => {
            if (e.target.id === 'emojiEditModal') this.closeEmojiModal();
        });
    }

    async loadGuilds() {
        try {
            const response = await fetch('/api/players?apiKey=' + this.apiKey);
            if (response.ok) {
                const data = await response.json();
                this.guilds = data.players || [];
                this.populateGuildSelect();
            } else {
                this.showToast('Failed to load servers', 'error');
            }
        } catch (error) {
            console.error('Error loading guilds:', error);
            this.showToast('Connection failed', 'error');
        }
    }

    populateGuildSelect() {
        const currentValue = this.guildSelect.value;
        this.guildSelect.innerHTML = '<option value="">Select a server...</option>';
        
        if (this.guilds.length === 0) {
            const option = document.createElement('option');
            option.textContent = 'No servers with music';
            this.guildSelect.appendChild(option);
            return;
        }
        
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

    async selectGuild(guildId) {
        if (!guildId) {
            this.disconnect();
            return;
        }
        
        this.guildId = guildId;
        this.reconnectAttempts = 0;
        
        const player = this.guilds.find(p => p.guildId === guildId);
        if (player) {
            this.trackArtist.textContent = player.guildName;
        }
        
        await this.connect();
    }

    async connect() {
        if (!this.guildId) return;
        
        try {
            const response = await fetch(`/api/player/${this.guildId}?apiKey=${this.apiKey}`);
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to connect');
            }
            
            this.connectWebSocket();
            await this.loadPlayerState();
            await this.loadQueue();
            await this.loadSettings();
            await this.loadFilters();
            await this.loadPlaylists();
            await this.loadHistory();
            await this.loadEmojis();
            await this.loadSettings();
            await this.loadFilters();
            await this.loadPlaylists();
            await this.loadHistory();
            await this.loadEmojis();
            
            this.setConnected(true);
            this.showToast('Connected to server', 'success');
            
        } catch (error) {
            console.error('Connection error:', error);
            this.setConnected(false);
            this.showToast(error.message || 'Connection failed', 'error');
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
            this.reconnectAttempts = 0;
            this.setConnected(true);
        };
        
        this.ws.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                this.handleWebSocketMessage(message);
            } catch (error) {
                console.error('WebSocket message error:', error);
            }
        };
        
        this.ws.onclose = () => {
            console.log('WebSocket disconnected');
            this.setConnected(false);
            
            if (this.reconnectAttempts < this.maxReconnectAttempts) {
                this.reconnectAttempts++;
                const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
                setTimeout(() => {
                    if (this.guildId) {
                        this.connectWebSocket();
                    }
                }, delay);
            }
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

    async loadSettings() {
        if (!this.guildId) return;

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

    async loadFilters() {
        try {
            const response = await fetch(`/api/filters?apiKey=${this.apiKey}`);
            if (response.ok) {
                const filters = await response.json();
                this.updateFiltersUI(filters);
            }
        } catch (error) {
            console.error('Error loading filters:', error);
        }
    }

    updateFiltersUI(filters) {
        // Clear existing filter buttons and regenerate them
        const filterGroups = document.querySelectorAll('.filter-group');

        filterGroups.forEach(group => {
            const title = group.querySelector('h3').textContent.toLowerCase().trim();
            const buttonContainer = group.querySelector('.filter-buttons');

            if (!buttonContainer) return;

            buttonContainer.innerHTML = '';

            let filterList = [];
            if (title === 'bass') {
                filterList = filters.bass || [];
            } else if (title === 'effects') {
                filterList = filters.special ? filters.special.slice(0, 4) : []; // nightcore, vaporwave, metal, oldschool
            } else if (title === 'genre') {
                filterList = filters.genres || [];
            } else if (title === 'enhancement') {
                filterList = filters.special ? filters.special.slice(4) : []; // boost, flat, soft, warm
            } else if (title === 'special') {
                filterList = filters.special ? [filters.special[0]] : []; // gaming
            }

            filterList.forEach(filter => {
                const button = document.createElement('button');
                button.className = 'filter-btn';
                button.setAttribute('data-filter', filter);
                button.textContent = this.formatFilterName(filter);
                button.addEventListener('click', () => this.toggleFilter(filter));
                buttonContainer.appendChild(button);
            });
        });

        // Re-bind reset filters button
        document.getElementById('resetFiltersBtn').addEventListener('click', () => this.resetFilters());
    }

    formatFilterName(filter) {
        return filter.split(/(?=[A-Z])/).join(' ').replace(/\b\w/g, l => l.toUpperCase());
    }

    async loadPlaylists() {
        if (!this.guildId) return;
        
        try {
            const response = await fetch(`/api/playlists?apiKey=${this.apiKey}&guildId=${this.guildId}`);
            if (response.ok) {
                this.playlists = await response.json();
                this.updatePlaylistsUI();
            }
        } catch (error) {
            console.error('Error loading playlists:', error);
        }
    }

    async loadHistory() {
        if (!this.guildId) return;
        
        try {
            const response = await fetch(`/api/player/${this.guildId}/history?apiKey=${this.apiKey}`);
            if (response.ok) {
                const data = await response.json();
                this.history = data.history || [];
                this.updateHistoryUI();
            }
        } catch (error) {
            console.error('Error loading history:', error);
        }
    }

    async loadEmojis() {
        if (!this.guildId) return;
        
        try {
            const response = await fetch(`/api/emoji?apiKey=${this.apiKey}&guildId=${this.guildId}`);
            if (response.ok) {
                const emojis = await response.json();
                const grid = document.getElementById('emojiGrid');
                
                if (Object.keys(emojis).length === 0) {
                    grid.innerHTML = '<div class="empty-message">No custom emojis set. Click an emoji key to set a custom emoji.</div>';
                    return;
                }
                
                grid.innerHTML = Object.entries(emojis).map(([key, emoji]) => `
                    <div class="emoji-item" data-key="${key}" data-emoji="${emoji}">
                        <span class="emoji-preview">${emoji}</span>
                        <div class="emoji-key">${key}</div>
                        <div class="emoji-name">${emoji}</div>
                    </div>
                `).join('');
                
                grid.querySelectorAll('.emoji-item').forEach(item => {
                    item.addEventListener('click', () => this.openEmojiModal(item.dataset.key, item.dataset.emoji));
                });
            }
        } catch (error) {
            console.error('Error loading emojis:', error);
        }
    }

    updatePlaylistsUI() {
        const list = document.getElementById('playlistsList');
        
        if (this.playlists.length === 0) {
            list.innerHTML = '<div class="empty-message">No playlists yet</div>';
            return;
        }
        
        list.innerHTML = this.playlists.map(playlist => `
            <div class="playlist-item" data-name="${playlist.name}">
                <span class="playlist-icon">📁</span>
                <div class="playlist-info">
                    <div class="playlist-name">${this.escapeHtml(playlist.name)}</div>
                    <div class="playlist-count">${playlist.trackCount || 0} tracks</div>
                </div>
            </div>
        `).join('');
        
        list.querySelectorAll('.playlist-item').forEach(item => {
            item.addEventListener('click', () => this.loadPlaylist(item.dataset.name));
        });
    }

    async loadPlaylist(name) {
        if (!this.guildId) return;
        
        try {
            await this.apiCall('POST', '/api/playlist/load', { name, guildId: this.guildId });
            this.showToast(`Loading "${name}"`, 'success');
            await this.loadQueue();
        } catch (error) {
            this.showToast('Failed to load playlist', 'error');
        }
    }

    updateHistoryUI() {
        const list = document.getElementById('historyList');
        
        if (this.history.length === 0) {
            list.innerHTML = '<div class="empty-message">No history yet</div>';
            return;
        }
        
        list.innerHTML = this.history.slice(0, 50).map(track => `
            <div class="history-item">
                <img src="${track.artworkUrl || ''}" alt="${track.title}" class="history-item-artwork" onerror="this.style.display='none'">
                <div class="history-item-info">
                    <div class="history-item-title">${this.escapeHtml(track.title || 'Unknown')}</div>
                    <div class="history-item-artist">${this.escapeHtml(track.author || 'Unknown Artist')}</div>
                </div>
                <div class="history-item-duration">${this.formatTime(track.duration || 0)}</div>
            </div>
        `).join('');
    }

    updateUI() {
        if (!this.playerState) {
            this.trackTitle.textContent = 'No track playing';
            this.trackArtist.textContent = 'Select a server to start';
            this.trackAlbum.textContent = '';
            this.albumArt.style.display = 'none';
            this.noArtwork.style.display = 'flex';
            this.progressFill.style.width = '0%';
            this.currentTime.textContent = '0:00';
            this.totalTime.textContent = '0:00';
            return;
        }
        
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
        this.volumeValue.textContent = volume + '%';
        
        this.updateProgress();
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
            this.progressFill.style.width = progress + '%';
        } else {
            this.progressFill.style.width = '100%';
        }
        
        this.currentTime.textContent = this.formatTime(position);
        this.totalTime.textContent = currentTrack.isStream ? 'LIVE' : this.formatTime(duration);
    }

    updateQueueUI(currentTrack) {
        this.queueCount.textContent = this.queue.length;
        
        if (this.queue.length === 0) {
            this.queueList.innerHTML = '<div class="empty-message">No tracks in queue</div>';
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
                        <button class="queue-item-btn" data-action="play" data-position="${index + 1}" title="Play">▶️</button>
                        <button class="queue-item-btn" data-action="remove" data-position="${index + 1}" title="Remove">🗑️</button>
                    </div>
                </div>
            `;
        }).join('');
        
        this.queueList.querySelectorAll('.queue-item-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const action = btn.dataset.action;
                const position = parseInt(btn.dataset.position);
                this.handleQueueAction(action, position);
            });
        });
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
                this.seekToTrack(position);
                break;
            case 'remove':
                this.removeTrack(position);
                break;
        }
    }

    async seekToTrack(position) {
        try {
            await this.apiCall('POST', `/api/player/${this.guildId}/seek`, { position: 0 });
        } catch (error) {
            this.showToast('Failed to play track', 'error');
        }
    }

    async removeTrack(position) {
        try {
            await this.apiCall('DELETE', `/api/player/${this.guildId}/queue/${position}`);
            this.loadQueue();
            this.showToast('Track removed', 'success');
        } catch (error) {
            this.showToast('Failed to remove track', 'error');
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

    async createPlaylist() {
        const name = prompt('Enter playlist name:');
        if (!name || !name.trim()) {
            this.showToast('Please enter a playlist name', 'warning');
            return;
        }
        
        try {
            await this.apiCall('POST', '/api/playlist/create', { name, guildId: this.guildId, userId: 'dashboard' });
            this.showToast('Playlist created', 'success');
            await this.loadPlaylists();
        } catch (error) {
            this.showToast('Failed to create playlist: ' + error.message, 'error');
        }
    }

    async clearHistory() {
        if (!confirm('Clear all history?')) return;
        
        try {
            await this.apiCall('DELETE', `/api/player/${this.guildId}/history`);
            this.showToast('History cleared', 'success');
        } catch (error) {
            this.showToast('Failed to clear history', 'error');
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
            await this.apiCall('POST', '/api/emoji/sync', { guildId: this.guildId });
            await this.loadEmojis();
            this.showToast('Emojis synced', 'success');
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
                
                if (Object.keys(emojis).length === 0) {
                    grid.innerHTML = '<div class="empty-message">No custom emojis set. Click an emoji key to set a custom emoji.</div>';
                    return;
                }
                
                grid.innerHTML = Object.entries(emojis).map(([key, emoji]) => `
                    <div class="emoji-item" data-key="${key}" data-emoji="${emoji}">
                        <span class="emoji-preview">${emoji}</span>
                        <div class="emoji-key">${key}</div>
                        <div class="emoji-name">${emoji}</div>
                    </div>
                `).join('');
                
                grid.querySelectorAll('.emoji-item').forEach(item => {
                    item.addEventListener('click', () => this.openEmojiModal(item.dataset.key, item.dataset.emoji));
                });
            }
        } catch (error) {
            console.error('Error loading emojis:', error);
        }
    }
    
    openEmojiModal(key, currentEmoji) {
        this.currentEmojiKey = key;
        document.getElementById('emojiEditPreview').textContent = currentEmoji || '🎵';
        document.getElementById('emojiEditCurrent').textContent = `Current: ${key}`;
        document.getElementById('emojiEditInput').value = '';
        document.getElementById('emojiEditModal').classList.add('active');
    }
    
    closeEmojiModal() {
        document.getElementById('emojiEditModal').classList.remove('active');
        this.currentEmojiKey = null;
    }
    
    async saveEmoji() {
        const emojiValue = document.getElementById('emojiEditInput').value.trim();
        
        try {
            if (emojiValue) {
                await this.apiCall('POST', '/api/emoji/add', { 
                    guildId: this.guildId, 
                    key: this.currentEmojiKey, 
                    emoji: emojiValue 
                });
            } else {
                await this.apiCall('POST', '/api/emoji/remove', { 
                    guildId: this.guildId, 
                    key: this.currentEmojiKey 
                });
            }
            
            this.closeEmojiModal();
            await this.loadEmojis();
            this.showToast('Emoji updated', 'success');
        } catch (error) {
            this.showToast('Failed to update emoji', 'error');
        }
    }
    
    async deleteEmoji() {
        try {
            await this.apiCall('POST', '/api/emoji/remove', { 
                guildId: this.guildId, 
                key: this.currentEmojiKey 
            });
            
            this.closeEmojiModal();
            await this.loadEmojis();
            this.showToast('Emoji reset to default', 'success');
        } catch (error) {
            this.showToast('Failed to reset emoji', 'error');
        }
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
        this.showToast('Queue shuffled', 'success');
    }

    async shuffleQueue() {
        await this.shuffle();
    }

    async clearQueue() {
        if (this.queue.length === 0) return;
        if (!confirm('Clear all tracks from queue?')) return;
        
        try {
            for (let i = this.queue.length; i > 0; i--) {
                await this.apiCall('DELETE', `/api/player/${this.guildId}/queue/${i}`);
            }
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
        this.volumeValue.textContent = volume + '%';
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

    setConnected(connected) {
        this.connectionIndicator.classList.toggle('connected', connected);
        this.indicatorText.textContent = connected ? 'Connected' : 'Disconnected';
    }

    disconnect() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.playerState = null;
        this.queue = [];
        this.setConnected(false);
        this.trackTitle.textContent = 'No track playing';
        this.trackArtist.textContent = 'Select a server to start';
        this.albumArt.style.display = 'none';
        this.noArtwork.style.display = 'flex';
        this.progressFill.style.width = '0%';
        this.queueList.innerHTML = '<div class="empty-message">No tracks in queue</div>';
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
