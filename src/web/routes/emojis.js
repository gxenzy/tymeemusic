import { requireAuth, requireGuildPermission } from '../auth/oauth2.js';
import EmojiMapping from '../../../database/repo/EmojiMapping.js';

export default function setupEmojiRoutes(app) {
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

            if (req.app.get('bot')?.emojiManager) {
                await req.app.get('bot').emojiManager.updateCache(guildId);
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

            if (req.app.get('bot')?.emojiManager) {
                await req.app.get('bot').emojiManager.updateCache(guildId);
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
            if (req.app.get('bot')?.emojiManager) {
                await req.app.get('bot').emojiManager.syncGuild(guildId);
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

            if (req.app.get('bot')?.emojiManager) {
                req.app.get('bot').emojiManager.clearGuildCache(guildId);
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

            if (req.app.get('bot')?.emojiManager) {
                await req.app.get('bot').emojiManager.updateCache(guildId);
            }

            res.json({ success: true });
        } catch (error) {
            console.error('Error setting fallback:', error);
            res.status(500).json({ error: 'Failed to set fallback' });
        }
    });
}
