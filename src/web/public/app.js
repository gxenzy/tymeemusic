class MusicDashboard {
    constructor() {
        this.apiKey = '';
        this.guildId = '';
        this.ws = null;
        this.playerState = null;
        this.queue = [];
        this.positionUpdateInterval = null;
        
        this.initializeElements();
        this.attachEventListeners();
    }

    initializeElements() {
        // Inputs
        this.apiKeyInput = document.getElementById('apiKeyInput');
        this.guildIdInput = document.getElementById('guildIdInput');
        this.connectBtn = document.getElementById('connectBtn');
        
        // Status
        this.connectionStatus = document.getElementById('connectionStatus');
        this.statusText = document.getElementById('statusText');
        this.mainContent = document.getElementById('mainContent');
        
        // Check for auto-connect parameters in URL
        this.checkAutoConnect();
        
        // Player elements
        this.albumArt = document.getElementById('albumArt');
        this.noArtwork = document.getElementById('noArtwork');
        this.trackTitle = document.getElementById('trackTitle');
        this.trackArtist = document.getElementById('trackArtist');
        this.guildName = document.getElementById('guildName');
        
        // Progress
        this.progressBar = document.getElementById('progressBar');
        this.progressFill = document.getElementById('progressFill');
        this.progressHandle = document.getElementById('progressHandle');
        this.currentTime = document.getElementById('currentTime');
        this.totalTime = document.getElementById('totalTime');
        
        // Controls
        this.playPauseBtn = document.getElementById('playPauseBtn');
        this.playIcon = document.getElementById('playIcon');
        this.pauseIcon = document.getElementById('pauseIcon');
        this.previousBtn = document.getElementById('previousBtn');
        this.nextBtn = document.getElementById('nextBtn');
        this.shuffleBtn = document.getElementById('shuffleBtn');
        this.repeatBtn = document.getElementById('repeatBtn');
        
        // Volume
        this.volumeSlider = document.getElementById('volumeSlider');
        this.volumeValue = document.getElementById('volumeValue');
        
        // Queue
        this.queueList = document.getElementById('queueList');
        this.queueCount = document.getElementById('queueCount');
        this.refreshQueueBtn = document.getElementById('refreshQueueBtn');
    }

    checkAutoConnect() {
        const urlParams = new URLSearchParams(window.location.search);
        const apiKey = urlParams.get('apiKey');
        const guildId = urlParams.get('guildId');
        
        // Default values from config
        const defaultApiKey = 'MTQ1Mzk3NDM1MjY5NjQ0Mjk1MQ';
        const defaultGuildId = '1386498859471077426';
        
        // Use URL params or defaults
        const finalApiKey = apiKey || defaultApiKey;
        const finalGuildId = guildId || defaultGuildId;
        
        if (finalApiKey && finalGuildId) {
            this.apiKeyInput.value = finalApiKey;
            this.guildIdInput.value = finalGuildId;
            
            // Hide input fields and show auto-connect status
            const authSection = document.querySelector('.auth-section');
            if (authSection) {
                authSection.style.display = 'none';
            }
            
            // Show auto-connect message
            const header = document.querySelector('.header-content');
            if (header) {
                const autoConnectMsg = document.createElement('div');
                autoConnectMsg.className = 'auto-connect-msg';
                autoConnectMsg.textContent = '🔗 Auto-connecting...';
                autoConnectMsg.style.cssText = 'color: var(--accent); font-weight: 500;';
                header.appendChild(autoConnectMsg);
            }
            
            // Auto-connect after a short delay
            setTimeout(() => {
                this.connect();
            }, 500);
        }
    }

    attachEventListeners() {
        this.connectBtn.addEventListener('click', () => this.connect());
        
        this.playPauseBtn.addEventListener('click', () => this.togglePlayPause());
        this.previousBtn.addEventListener('click', () => this.previous());
        this.nextBtn.addEventListener('click', () => this.skip());
        this.shuffleBtn.addEventListener('click', () => this.shuffle());
        this.repeatBtn.addEventListener('click', () => this.toggleRepeat());
        
        this.volumeSlider.addEventListener('input', (e) => this.setVolume(e.target.value));
        
        this.progressBar.addEventListener('click', (e) => this.seek(e));
        this.progressBar.addEventListener('mousemove', (e) => this.updateProgressHandle(e));
        
        this.refreshQueueBtn.addEventListener('click', () => this.loadQueue());
        
        // Allow Enter key to connect
        this.apiKeyInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.connect();
        });
        this.guildIdInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.connect();
        });
    }

    async connect() {
        this.apiKey = this.apiKeyInput.value.trim();
        this.guildId = this.guildIdInput.value.trim();
        
        if (!this.apiKey || !this.guildId) {
            alert('Please enter both API Key and Guild ID');
            return;
        }
        
        this.connectBtn.disabled = true;
        this.connectBtn.textContent = 'Connecting...';
        
        try {
            // Test API connection first
            const response = await fetch(`/api/player/${this.guildId}?apiKey=${this.apiKey}`);
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to connect');
            }
            
            // Connect WebSocket
            this.connectWebSocket();
            
            // Load initial data
            await this.loadPlayerState();
            await this.loadQueue();
            
            this.updateConnectionStatus(true);
            this.mainContent.classList.remove('hidden');
            
        } catch (error) {
            alert(`Connection failed: ${error.message}`);
            this.updateConnectionStatus(false);
        } finally {
            this.connectBtn.disabled = false;
            this.connectBtn.textContent = 'Connect';
        }
    }

    connectWebSocket() {
        // WebSocket connection - use ws:// for local development, wss:// for production
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
            // Attempt to reconnect after 3 seconds
            setTimeout(() => {
                if (this.apiKey && this.guildId) {
                    this.connectWebSocket();
                }
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

    updateUI() {
        if (!this.playerState) return;
        
        const { currentTrack, isPlaying, isPaused, volume, repeatMode, position, guildName } = this.playerState;
        
        // Update track info
        if (currentTrack) {
            this.trackTitle.textContent = currentTrack.title;
            this.trackArtist.textContent = currentTrack.author;
            
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
            this.albumArt.style.display = 'none';
            this.noArtwork.style.display = 'flex';
        }
        
        this.guildName.textContent = guildName || '';
        
        // Update play/pause button
        if (isPlaying && !isPaused) {
            this.playIcon.classList.add('hidden');
            this.pauseIcon.classList.remove('hidden');
        } else {
            this.playIcon.classList.remove('hidden');
            this.pauseIcon.classList.add('hidden');
        }
        
        // Update repeat button
        this.repeatBtn.classList.toggle('active', repeatMode !== 'off');
        
        // Update volume
        this.volumeSlider.value = volume;
        this.volumeValue.textContent = `${volume}%`;
        
        // Update progress
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
            this.queueList.innerHTML = '<p class="empty-queue">No tracks in queue</p>';
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
                </div>
            `;
        }).join('');
    }

    startPositionUpdates() {
        // Update position every second
        this.positionUpdateInterval = setInterval(() => {
            if (this.playerState && this.playerState.isPlaying && !this.playerState.isPaused) {
                // Estimate position (will be updated by WebSocket)
                if (this.playerState.currentTrack && !this.playerState.currentTrack.isStream) {
                    this.playerState.position += 1000;
                    const duration = this.playerState.currentTrack.duration;
                    if (this.playerState.position > duration) {
                        this.playerState.position = duration;
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

    updateProgressHandle(e) {
        if (!this.playerState || !this.playerState.currentTrack) return;
        
        const rect = this.progressBar.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const percent = Math.max(0, Math.min(100, (x / rect.width) * 100));
        this.progressHandle.style.left = `${percent}%`;
    }

    seek(e) {
        if (!this.playerState || !this.playerState.currentTrack || this.playerState.currentTrack.isStream) return;
        
        const rect = this.progressBar.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const percent = Math.max(0, Math.min(1, x / rect.width));
        const duration = this.playerState.currentTrack.duration;
        const position = Math.floor(percent * duration);
        
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
        await this.loadQueue();
    }

    async toggleRepeat() {
        const modes = ['off', 'track', 'queue'];
        const currentMode = this.playerState?.repeatMode || 'off';
        const currentIndex = modes.indexOf(currentMode);
        const nextMode = modes[(currentIndex + 1) % modes.length];
        
        await this.apiCall('POST', `/api/player/${this.guildId}/loop`, { mode: nextMode });
    }

    async setVolume(volume) {
        this.volumeValue.textContent = `${volume}%`;
        await this.apiCall('POST', `/api/player/${this.guildId}/volume`, { volume: parseInt(volume) });
    }

    async apiCall(method, endpoint, body = null) {
        try {
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
        } catch (error) {
            console.error('API call failed:', error);
            alert(`Error: ${error.message}`);
        }
    }

    updateConnectionStatus(connected) {
        this.connectionStatus.classList.remove('hidden');
        this.connectionStatus.classList.remove('connected', 'disconnected');
        this.connectionStatus.classList.add(connected ? 'connected' : 'disconnected');
        this.statusText.textContent = connected ? 'Connected' : 'Disconnected';
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
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Initialize dashboard when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new MusicDashboard();
});

