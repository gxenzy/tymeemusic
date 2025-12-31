import { requireAuth, requireGuildPermission } from '../auth/oauth2.js';

export default function setupApiRoutes(app) {
    app.get('/api/health', (req, res) => {
        res.json({ status: 'ok', timestamp: Date.now() });
    });

    app.get('/api/user', requireAuth, (req, res) => {
        res.json(req.user);
    });

    app.get('/api/user/guilds', requireAuth, async (req, res) => {
        try {
            const response = await fetch('https://discord.com/api/users/@me/guilds', {
                headers: { Authorization: `Bearer ${req.user.accessToken}` }
            });
            const guilds = await response.json();
            
            const bot = req.app.get('bot');
            const managedGuilds = guilds.filter(guild => {
                const hasBot = bot.guilds.cache.has(guild.id);
                const permissions = BigInt(guild.permissions);
                const hasManageGuild = (permissions & BigInt(0x20)) === BigInt(0x20);
                return hasBot && hasManageGuild;
            });
            
            res.json(managedGuilds);
        } catch (error) {
            console.error('Error fetching user guilds:', error);
            res.status(500).json({ error: 'Failed to fetch guilds' });
        }
    });

    app.get('/api/player/:guildId', requireAuth, requireGuildPermission, async (req, res) => {
        const player = req.app.get('bot').players?.get(req.params.guildId);
        
        if (!player) {
            return res.json({ active: false });
        }
        
        res.json({
            active: true,
            playing: player.playing,
            paused: player.paused,
            volume: player.volume,
            position: player.position,
            currentTrack: player.current,
            repeat: player.repeat,
            shuffle: player.shuffle,
            queueLength: player.queue?.length || 0
        });
    });

    app.post('/api/player/:guildId/play', requireAuth, requireGuildPermission, async (req, res) => {
        const player = req.app.get('bot').players?.get(req.params.guildId);
        if (!player) {
            return res.status(400).json({ error: 'No active player' });
        }
        
        try {
            if (player.paused) await player.resume();
            else if (!player.playing) await player.play();
            res.json({ success: true });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    app.post('/api/player/:guildId/pause', requireAuth, requireGuildPermission, async (req, res) => {
        const player = req.app.get('bot').players?.get(req.params.guildId);
        if (!player) {
            return res.status(400).json({ error: 'No active player' });
        }
        
        try {
            await player.pause();
            res.json({ success: true });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    app.post('/api/player/:guildId/skip', requireAuth, requireGuildPermission, async (req, res) => {
        const player = req.app.get('bot').players?.get(req.params.guildId);
        if (!player) {
            return res.status(400).json({ error: 'No active player' });
        }
        
        try {
            await player.skip();
            res.json({ success: true });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    app.post('/api/player/:guildId/volume', requireAuth, requireGuildPermission, async (req, res) => {
        const volume = parseInt(req.body.volume);
        if (isNaN(volume) || volume < 0 || volume > 100) {
            return res.status(400).json({ error: 'Volume must be between 0 and 100' });
        }
        
        const player = req.app.get('bot').players?.get(req.params.guildId);
        if (!player) {
            return res.status(400).json({ error: 'No active player' });
        }
        
        try {
            await player.setVolume(volume);
            res.json({ success: true, volume });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    app.post('/api/player/:guildId/seek', requireAuth, requireGuildPermission, async (req, res) => {
        const position = parseInt(req.body.position);
        if (isNaN(position) || position < 0) {
            return res.status(400).json({ error: 'Invalid position' });
        }
        
        const player = req.app.get('bot').players?.get(req.params.guildId);
        if (!player) {
            return res.status(400).json({ error: 'No active player' });
        }
        
        try {
            await player.seek(position);
            res.json({ success: true, position });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    app.post('/api/player/:guildId/shuffle', requireAuth, requireGuildPermission, async (req, res) => {
        const player = req.app.get('bot').players?.get(req.params.guildId);
        if (!player) {
            return res.status(400).json({ error: 'No active player' });
        }
        
        try {
            await player.toggleShuffle();
            res.json({ success: true, shuffle: player.shuffle });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    app.post('/api/player/:guildId/loop', requireAuth, requireGuildPermission, async (req, res) => {
        const mode = req.body.mode || 'none';
        const validModes = ['none', 'track', 'queue'];
        if (!validModes.includes(mode)) {
            return res.status(400).json({ error: 'Invalid loop mode' });
        }
        
        const player = req.app.get('bot').players?.get(req.params.guildId);
        if (!player) {
            return res.status(400).json({ error: 'No active player' });
        }
        
        try {
            await player.setLoop(mode);
            res.json({ success: true, repeat: player.repeat });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    app.get('/api/queue/:guildId', requireAuth, requireGuildPermission, async (req, res) => {
        const player = req.app.get('bot').players?.get(req.params.guildId);
        
        if (!player) {
            return res.json({ queue: [], count: 0 });
        }
        
        res.json({
            queue: player.queue || [],
            count: player.queue?.length || 0,
            repeat: player.repeat,
            shuffle: player.shuffle
        });
    });

    app.delete('/api/queue/:guildId/:index', requireAuth, requireGuildPermission, async (req, res) => {
        const player = req.app.get('bot').players?.get(req.params.guildId);
        if (!player) {
            return res.status(400).json({ error: 'No active player' });
        }
        
        const index = parseInt(req.params.index);
        if (isNaN(index) || index < 0) {
            return res.status(400).json({ error: 'Invalid index' });
        }
        
        try {
            await player.queueRemove(index);
            res.json({ success: true });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    app.post('/api/queue/:guildId/shuffle', requireAuth, requireGuildPermission, async (req, res) => {
        const player = req.app.get('bot').players?.get(req.params.guildId);
        if (!player) {
            return res.status(400).json({ error: 'No active player' });
        }
        
        try {
            await player.shuffle();
            res.json({ success: true, queue: player.queue });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    app.delete('/api/queue/:guildId', requireAuth, requireGuildPermission, async (req, res) => {
        const player = req.app.get('bot').players?.get(req.params.guildId);
        if (!player) {
            return res.status(400).json({ error: 'No active player' });
        }
        
        try {
            await player.queueClear();
            res.json({ success: true });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    app.post('/api/play/:guildId', requireAuth, requireGuildPermission, async (req, res) => {
        const { query } = req.body;
        if (!query) {
            return res.status(400).json({ error: 'Query is required' });
        }
        
        const playerManager = req.app.get('bot').playerManager;
        if (!playerManager) {
            return res.status(500).json({ error: 'Player manager not available' });
        }
        
        try {
            const guild = req.app.get('bot').guilds.cache.get(req.params.guildId);
            if (!guild) {
                return res.status(404).json({ error: 'Guild not found' });
            }
            
            const member = guild.members.cache.get(req.user.id);
            if (!member) {
                return res.status(404).json({ error: 'Member not found' });
            }
            
            const player = await playerManager.play(member.voice.channel, query, {
                member: member,
                textChannel: member.channel,
                requestedBy: req.user.id
            });
            
            res.json({ success: true, player });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });
}
