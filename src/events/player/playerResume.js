import { logger } from "#utils/logger";

export default {
    name: "playerResume",
    once: false,
    async execute(player, musicManager, client) {
        try {
            logger.info('PlayerResume', `Player resumed in guild ${player.guildId}`);
            if (client && client.webServer) {
                client.webServer.updatePlayerState(player.guildId);
            }
        } catch (error) {
            logger.error('PlayerResume', 'Error in playerResume event:', error);
        }
    }
};
