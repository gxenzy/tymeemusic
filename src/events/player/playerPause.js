import { logger } from "#utils/logger";

export default {
    name: "playerPause",
    once: false,
    async execute(player, musicManager, client) {
        try {
            logger.info('PlayerPause', `Player paused in guild ${player.guildId}`);
            if (client && client.webServer) {
                client.webServer.updatePlayerState(player.guildId);
            }
        } catch (error) {
            logger.error('PlayerPause', 'Error in playerPause event:', error);
        }
    }
};
