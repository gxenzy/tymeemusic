import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';

class WebSocketManager {
    constructor(server, bot) {
        this.bot = bot;
        this.io = null;
        this.rooms = new Map();
        this.userSockets = new Map();
        this.setup(server);
    }

    setup(server) {
        this.io = new Server(server, {
            cors: {
                origin: process.env.DASHBOARD_URL || '*',
                credentials: true
            },
            path: '/socket.io'
        });

        this.io.use(async (socket, next) => {
            const token = socket.handshake.auth.token || socket.handshake.query.token;

            if (!token) {
                return next(new Error('Authentication required'));
            }

            try {
                const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
                socket.user = decoded;
                next();
            } catch (error) {
                next(new Error('Invalid token'));
            }
        });

        this.io.on('connection', (socket) => {
            console.log(`WebSocket user connected: ${socket.user?.username || 'Unknown'}`);

            if (!this.userSockets.has(socket.user.id)) {
                this.userSockets.set(socket.user.id, new Set());
            }
            this.userSockets.get(socket.user.id).add(socket.id);

            socket.on('guild:join', (guildId) => {
                socket.join(`guild:${guildId}`);

                if (!this.rooms.has(guildId)) {
                    this.rooms.set(guildId, new Set());
                }
                this.rooms.get(guildId).add(socket.id);

                this.sendGuildState(socket, guildId);
            });

            socket.on('guild:leave', (guildId) => {
                socket.leave(`guild:${guildId}`);
                this.rooms.get(guildId)?.delete(socket.id);
            });

            socket.on('player:play', async (data) => {
                await this.handlePlayerControl(socket, 'play', data);
            });

            socket.on('player:pause', async (data) => {
                await this.handlePlayerControl(socket, 'pause', data);
            });

            socket.on('player:stop', async (data) => {
                await this.handlePlayerControl(socket, 'stop', data);
            });

            socket.on('player:skip', async (data) => {
                await this.handlePlayerControl(socket, 'skip', data);
            });

            socket.on('player:volume', async (data) => {
                await this.handlePlayerControl(socket, 'volume', data);
            });

            socket.on('player:seek', async (data) => {
                await this.handlePlayerControl(socket, 'seek', data);
            });

            socket.on('player:loop', async (data) => {
                await this.handlePlayerControl(socket, 'loop', data);
            });

            socket.on('player:shuffle', async (data) => {
                await this.handlePlayerControl(socket, 'shuffle', data);
            });

            socket.on('queue:remove', async (data) => {
                await this.handleQueueAction(socket, 'remove', data);
            });

            socket.on('queue:move', async (data) => {
                await this.handleQueueAction(socket, 'move', data);
            });

            socket.on('queue:shuffle', async (data) => {
                await this.handleQueueAction(socket, 'shuffle', data);
            });

            socket.on('queue:clear', async (data) => {
                await this.handleQueueAction(socket, 'clear', data);
            });

            socket.on('playlist:load', async (data) => {
                await this.handlePlaylistAction(socket, 'load', data);
            });

            socket.on('playlist:save', async (data) => {
                await this.handlePlaylistAction(socket, 'save', data);
            });

            socket.on('disconnect', () => {
                console.log(`WebSocket user disconnected: ${socket.user?.username || 'Unknown'}`);
                this.userSockets.get(socket.user.id)?.delete(socket.id);

                for (const [guildId, sockets] of this.rooms) {
                    sockets.delete(socket.id);
                    if (sockets.size === 0) {
                        this.rooms.delete(guildId);
                    }
                }
            });
        });
    }

    async sendGuildState(socket, guildId) {
        const player = this.bot.players?.get(guildId);

        if (player) {
            try {
                // Unified state generation using the WebServer's logic
                if (this.bot.webServer && typeof this.bot.webServer.getPlayerState === 'function') {
                    // Dynamically import PlayerManager to ensure we can wrap the player
                    const { PlayerManager } = await import('../../managers/PlayerManager.js');
                    const pm = new PlayerManager(player);

                    const state = this.bot.webServer.getPlayerState(pm, guildId);
                    socket.emit('player:state', state);
                    return;
                }
            } catch (error) {
                console.error("Error generating unified player state:", error);
            }

            // Fallback if WebServer method fails or isn't available
            socket.emit('player:state', {
                isPlaying: player.playing,
                isPaused: player.paused,
                volume: player.volume,
                position: player.position,
                currentTrack: player.current,
                repeat: player.repeat,
                shuffle: player.shuffle,
                queue: player.queue || [],
                activeFilterName: player.lastFilterName || null,
                timescale: (() => {
                    const fm = player.filterManager;
                    const ts = fm?.timescale || fm?.filters?.timescale || fm?.data?.timescale || {};
                    return (ts.speed || 1.0) * (ts.rate || 1.0);
                })()
            });
        } else {
            socket.emit('player:state', { active: false });
        }
    }

    async handlePlayerControl(socket, action, data) {
        const { guildId } = data;

        if (!await this.checkPermission(socket.user.id, guildId)) {
            socket.emit('error', { message: 'Insufficient permissions' });
            return;
        }

        const player = this.bot.players?.get(guildId);
        if (!player) {
            socket.emit('error', { message: 'No player active' });
            return;
        }

        try {
            switch (action) {
                case 'play':
                    if (player.paused) await player.resume();
                    else if (!player.playing) await player.play();
                    break;
                case 'pause':
                    if (player.playing) await player.pause();
                    break;
                case 'stop':
                    await player.stop();
                    break;
                case 'skip':
                    await player.skip();
                    break;
                case 'volume':
                    await player.setVolume(data.volume);
                    break;
                case 'seek':
                    await player.seek(data.position);
                    break;
                case 'loop':
                    await player.setLoop(data.mode || 'none');
                    break;
                case 'shuffle':
                    await player.toggleShuffle();
                    break;
            }

            this.broadcastToGuild(guildId, 'player:update', {
                action,
                guildId,
                timestamp: Date.now()
            });
        } catch (error) {
            console.error(`Error handling player control ${action}:`, error);
            socket.emit('error', { message: error.message });
        }
    }

    async handleQueueAction(socket, action, data) {
        const { guildId } = data;

        if (!await this.checkPermission(socket.user.id, guildId)) {
            socket.emit('error', { message: 'Insufficient permissions' });
            return;
        }

        const player = this.bot.players?.get(guildId);
        if (!player) {
            socket.emit('error', { message: 'No player active' });
            return;
        }

        try {
            switch (action) {
                case 'remove':
                    if (data.index !== undefined) {
                        await player.queueRemove(data.index);
                    }
                    break;
                case 'move':
                    if (data.fromIndex !== undefined && data.toIndex !== undefined) {
                        await player.queueMove(data.fromIndex, data.toIndex);
                    }
                    break;
                case 'shuffle':
                    await player.shuffle();
                    break;
                case 'clear':
                    await player.queueClear();
                    break;
            }

            this.broadcastToGuild(guildId, 'queue:update', {
                action,
                guildId,
                queue: player.queue || [],
                timestamp: Date.now()
            });
        } catch (error) {
            console.error(`Error handling queue action ${action}:`, error);
            socket.emit('error', { message: error.message });
        }
    }

    async handlePlaylistAction(socket, action, data) {
        const { guildId } = data;

        if (!await this.checkPermission(socket.user.id, guildId)) {
            socket.emit('error', { message: 'Insufficient permissions' });
            return;
        }

        try {
            switch (action) {
                case 'load':
                    if (data.playlistId && this.bot.playlistManager) {
                        await this.bot.playlistManager.loadPlaylist(guildId, data.playlistId);
                    }
                    break;
                case 'save':
                    if (data.name && data.tracks && this.bot.playlistManager) {
                        await this.bot.playlistManager.savePlaylist(guildId, socket.user.id, data.name, data.tracks);
                    }
                    break;
            }

            this.broadcastToGuild(guildId, 'playlist:update', {
                action,
                guildId,
                timestamp: Date.now()
            });
        } catch (error) {
            console.error(`Error handling playlist action ${action}:`, error);
            socket.emit('error', { message: error.message });
        }
    }

    broadcastToGuild(guildId, event, data) {
        if (this.io) {
            this.io.to(`guild:${guildId}`).emit(event, data);
        }
    }

    broadcast(event, data) {
        if (this.io) {
            this.io.emit(event, data);
        }
    }

    async checkPermission(userId, guildId) {
        if (userId === process.env.BOT_OWNER_ID) return true;

        const guild = this.bot.guilds?.cache.get(guildId);
        if (!guild) return false;

        const member = guild.members?.cache.get(userId);
        if (!member) return false;

        return member.permissions.has('ManageGuild');
    }

    emitToUser(userId, event, data) {
        const userSocketIds = this.userSockets.get(userId);
        if (userSocketIds && this.io) {
            for (const socketId of userSocketIds) {
                const socket = this.io.sockets.sockets.get(socketId);
                if (socket) {
                    socket.emit(event, data);
                }
            }
        }
    }
}

export default WebSocketManager;
