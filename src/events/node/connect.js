import { logger } from '#utils/logger';

export default {
	name: "connect",
	once: false,
	async execute(node, musicManager, client) {
		try {
			logger.success('LavalinkNode', `✅ Lavalink Node #${node.id} connected successfully`);
			logger.info('LavalinkNode', `🌐 Node: ${node.options.host}:${node.options.port}`);

			// Auto-restore player sessions when node connects
			// Delay slightly to ensure node is fully ready
			setTimeout(async () => {
				await musicManager.restorePlayerSessions();
			}, 3000);
		} catch (error) {
			logger.error('LavalinkNode', 'Error in node connect event handler:', error);
		}
	}
};