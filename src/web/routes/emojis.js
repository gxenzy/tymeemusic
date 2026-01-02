import { requireAuth, requireGuildPermission } from '../auth/oauth2.js';
import EmojiMapping from '../../../database/repo/EmojiMapping.js';

export default function setupEmojiRoutes(app) {
    async function refreshPlayerEmbed(client, guildId) {
        if (!client) return;
        const player = client.music?.getPlayer(guildId);
        if (player) {
            try {
                const { updatePlayerMessageEmbed } = await import('../../events/discord/music/Playerbuttons.js');
                const { PlayerManager } = await import('../../../managers/PlayerManager.js');
                await updatePlayerMessageEmbed(client, new PlayerManager(player));
            } catch (e) {
                console.error('Error refreshing player embed after emoji update:', e);
            }
        }
    }

    app.get('/api/emojis/:guildId', requireAuth, requireGuildPermission, async (req, res) => {
        try {
            const emojis = EmojiMapping.getAllByGuild(req.params.guildId);
            res.json(emojis);
        } catch (error) {
            console.error('Error fetching emojis:', error);
            res.status(500).json({ error: 'Failed to fetch emojis' });
        }
    });

    app.get('/api/emojis/:guildId/defaults', requireAuth, requireGuildPermission, async (req, res) => {
        try {
            const defaultEmojiConfig = await import('../../../config/emojiConfig.js');
            res.json(defaultEmojiConfig.default.categories);
        } catch (error) {
            console.error('Error fetching default emojis:', error);
            res.status(500).json({ error: 'Failed to fetch default emojis' });
        }
    });

    app.post('/api/emojis/:guildId', requireAuth, requireGuildPermission, async (req, res) => {
        const { guildId } = req.params;
        const { botName, discordName, emojiId, emojiUrl, isAnimated, fallback, category } = req.body;

        try {
            EmojiMapping.upsertMapping(guildId, botName, {
                discordName,
                emojiId,
                emojiUrl,
                isAnimated,
                fallback,
                category
            });

            const client = req.app.get('bot');
            if (client?.emojiManager) {
                await client.emojiManager.updateCache(guildId);
                // Broadcast WebSocket update
                if (req.app.get('io')) {
                    req.app.get('io').to(`guild_${guildId}`).emit('emoji:updated', { botName });
                }
                // Refresh Discord embed
                await refreshPlayerEmbed(client, guildId);
            }

            const emoji = EmojiMapping.getByGuildAndName(guildId, botName);
            res.json(emoji);
        } catch (error) {
            console.error('Error adding emoji:', error);
            res.status(500).json({ error: 'Failed to add emoji' });
        }
    });

    app.delete('/api/emojis/:guildId/:botName', requireAuth, requireGuildPermission, async (req, res) => {
        const { guildId, botName } = req.params;

        try {
            EmojiMapping.deleteByBotName(guildId, botName);

            const client = req.app.get('bot');
            if (client?.emojiManager) {
                await client.emojiManager.updateCache(guildId);
                if (req.app.get('io')) {
                    req.app.get('io').to(`guild_${guildId}`).emit('emoji:removed', { botName });
                }
                await refreshPlayerEmbed(client, guildId);
            }

            res.json({ success: true });
        } catch (error) {
            console.error('Error removing emoji:', error);
            res.status(500).json({ error: 'Failed to remove emoji' });
        }
    });

    app.post('/api/emojis/:guildId/sync', requireAuth, requireGuildPermission, async (req, res) => {
        const { guildId } = req.params;

        try {
            const client = req.app.get('bot');
            if (client?.emojiManager) {
                await client.emojiManager.syncGuild(guildId);
                if (req.app.get('io')) {
                    req.app.get('io').to(`guild_${guildId}`).emit('emoji:synced');
                }
                await refreshPlayerEmbed(client, guildId);
            }

            res.json({ success: true, message: 'Emojis synced successfully' });
        } catch (error) {
            console.error('Error syncing emojis:', error);
            res.status(500).json({ error: 'Failed to sync emojis' });
        }
    });

    app.post('/api/emojis/:guildId/reset', requireAuth, requireGuildPermission, async (req, res) => {
        const { guildId } = req.params;

        try {
            EmojiMapping.resetGuildEmojis(guildId);

            const client = req.app.get('bot');
            if (client?.emojiManager) {
                client.emojiManager.clearGuildCache(guildId);
                if (req.app.get('io')) {
                    req.app.get('io').to(`guild_${guildId}`).emit('emoji:reset');
                }
                await refreshPlayerEmbed(client, guildId);
            }

            res.json({ success: true, message: 'Emojis reset to defaults' });
        } catch (error) {
            console.error('Error resetting emojis:', error);
            res.status(500).json({ error: 'Failed to reset emojis' });
        }
    });

    app.put('/api/emojis/:guildId/:botName/fallback', requireAuth, requireGuildPermission, async (req, res) => {
        const { guildId, botName } = req.params;
        const { fallback } = req.body;

        try {
            EmojiMapping.setFallback(guildId, botName, fallback);

            const client = req.app.get('bot');
            if (client?.emojiManager) {
                await client.emojiManager.updateCache(guildId);
                if (req.app.get('io')) {
                    req.app.get('io').to(`guild_${guildId}`).emit('emoji:fallback_updated', { botName, fallback });
                }
                await refreshPlayerEmbed(client, guildId);
            }

            res.json({ success: true });
        } catch (error) {
            console.error('Error setting fallback:', error);
            res.status(500).json({ error: 'Failed to set fallback' });
        }
    });
}
