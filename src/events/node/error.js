import { logger } from '#utils/logger';

export default {
	name: "error",
	once: false,
	async execute(node, error, payload, musicManager, client) {
		try {
			logger.error('LavalinkNode', `❌ Lavalink Node #${node.id} errored: ${error.message}`);
		} catch (error_) {
			logger.error('LavalinkNode', `Error in node error event handler: ${error_.message}`);
		}
	}
};