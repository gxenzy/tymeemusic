import { logger } from '#utils/logger';

export default {
	name: "disconnect",
	once: false,
	async execute(node, reason, musicManager, client) {
		try {
			logger.warn('LavalinkNode', `🔌 Lavalink Node #${node.id} disconnected. Reason: ${reason}`);

			// Auto-save all player sessions when node disconnects
			await musicManager.saveAllPlayerSessions();
		} catch (error) {
			logger.error('LavalinkNode', 'Error in node disconnect event handler:', error);
		}
	}
};