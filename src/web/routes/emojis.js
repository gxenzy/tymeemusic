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

    // Get all player-specific emojis (resolved)
    app.get('/api/emojis/:guildId/player', requireAuth, requireGuildPermission, async (req, res) => {
        try {
            const client = req.app.get('bot');
            if (!client?.emojiManager) {
                return res.status(503).json({ error: 'Emoji manager not available' });
            }

            const playerEmojis = await client.emojiManager.getPlayerEmojis(req.params.guildId);
            res.json(playerEmojis);
        } catch (error) {
            console.error('Error fetching player emojis:', error);
            res.status(500).json({ error: 'Failed to fetch player emojis' });
        }
    });

    // Get server emojis available for mapping
    app.get('/api/emojis/:guildId/server', requireAuth, requireGuildPermission, async (req, res) => {
        try {
            const client = req.app.get('bot');
            if (!client?.emojiManager) {
                return res.status(503).json({ error: 'Emoji manager not available' });
            }

            const serverEmojis = await client.emojiManager.getServerEmojis(req.params.guildId);
            res.json(serverEmojis);
        } catch (error) {
            console.error('Error fetching server emojis:', error);
            res.status(500).json({ error: 'Failed to fetch server emojis' });
        }
    });

    // Preview auto-sync results
    app.get('/api/emojis/:guildId/preview-sync', requireAuth, requireGuildPermission, async (req, res) => {
        try {
            const client = req.app.get('bot');
            if (!client?.emojiManager) {
                return res.status(503).json({ error: 'Emoji manager not available' });
            }

            const preview = await client.emojiManager.getAutoSyncPreview(req.params.guildId);
            res.json(preview);
        } catch (error) {
            console.error('Error previewing sync:', error);
            res.status(500).json({ error: 'Failed to preview sync' });
        }
    });

    // Auto-sync emojis from server
    app.post('/api/emojis/:guildId/auto-sync', requireAuth, requireGuildPermission, async (req, res) => {
        const { guildId } = req.params;

        try {
            const client = req.app.get('bot');
            if (!client?.emojiManager) {
                return res.status(503).json({ error: 'Emoji manager not available' });
            }

            const result = await client.emojiManager.autoSyncEmojis(guildId);

            if (req.app.get('io')) {
                req.app.get('io').to(`guild_${guildId}`).emit('emoji:auto_synced', result);
            }
            await refreshPlayerEmbed(client, guildId);

            res.json({
                success: true,
                synced: result.synced,
                skipped: result.skipped,
                message: `Synced ${result.synced} emojis, skipped ${result.skipped}`
            });
        } catch (error) {
            console.error('Error auto-syncing emojis:', error);
            res.status(500).json({ error: 'Failed to auto-sync emojis' });
        }
    });

    // Bulk update multiple emojis
    app.post('/api/emojis/:guildId/bulk', requireAuth, requireGuildPermission, async (req, res) => {
        const { guildId } = req.params;
        const { mappings } = req.body; // Array of { botName, discordName, emojiId, emojiUrl, isAnimated, fallback, category }

        if (!Array.isArray(mappings)) {
            return res.status(400).json({ error: 'Mappings must be an array' });
        }

        try {
            let updated = 0;
            let failed = 0;

            for (const mapping of mappings) {
                try {
                    EmojiMapping.upsertMapping(guildId, mapping.botName, {
                        discordName: mapping.discordName,
                        emojiId: mapping.emojiId,
                        emojiUrl: mapping.emojiUrl,
                        isAnimated: mapping.isAnimated,
                        fallback: mapping.fallback,
                        category: mapping.category
                    });
                    updated++;
                } catch (e) {
                    failed++;
                    console.error(`Failed to update emoji ${mapping.botName}:`, e.message);
                }
            }

            const client = req.app.get('bot');
            if (client?.emojiManager) {
                await client.emojiManager.updateCache(guildId);
                if (req.app.get('io')) {
                    req.app.get('io').to(`guild_${guildId}`).emit('emoji:bulk_updated', { updated, failed });
                }
                await refreshPlayerEmbed(client, guildId);
            }

            res.json({ success: true, updated, failed });
        } catch (error) {
            console.error('Error bulk updating emojis:', error);
            res.status(500).json({ error: 'Failed to bulk update emojis' });
        }
    });

    // Get emoji categories info
    app.get('/api/emojis/categories', requireAuth, async (req, res) => {
        try {
            const client = req.app.get('bot');
            if (client?.emojiManager) {
                const categories = client.emojiManager.getCategories();
                res.json(categories);
            } else {
                const defaultEmojiConfig = await import('../../config/emojiConfig.js');
                const categories = defaultEmojiConfig.default.categories.map(c => ({
                    name: c.name,
                    description: c.description || c.name,
                    emojiCount: c.emojis.length
                }));
                res.json(categories);
            }
        } catch (error) {
            console.error('Error fetching categories:', error);
            res.status(500).json({ error: 'Failed to fetch categories' });
        }
    });

    // Get default emojis by category
    app.get('/api/emojis/defaults-by-category', requireAuth, async (req, res) => {
        try {
            const client = req.app.get('bot');
            if (client?.emojiManager) {
                const defaults = client.emojiManager.getDefaultEmojisByCategory();
                res.json(defaults);
            } else {
                const defaultEmojiConfig = await import('../../config/emojiConfig.js');
                const categorized = {};
                for (const category of defaultEmojiConfig.default.categories) {
                    categorized[category.name] = category.emojis.map(e => ({
                        botName: e.botName,
                        fallback: e.fallback,
                        description: e.description
                    }));
                }
                res.json(categorized);
            }
        } catch (error) {
            console.error('Error fetching defaults by category:', error);
            res.status(500).json({ error: 'Failed to fetch defaults' });
        }
    });
}
