import { logger } from "#utils/logger";
import { EventUtils } from "#utils/EventUtils";
import { DatabaseManager } from "#database/DatabaseManager";

export default {
	name: "playerCreate",
	once: false,
	async execute(player) {
		try {
			logger.info(
				"PlayerCreate",
				`🎵 Player created for guild: ${player.guildId}`,
			);

			// Set default volume from guild settings
			try {
				const { db } = await import('#database/DatabaseManager');
				const guildDb = db.guild;
				const defaultVolume = guildDb.getDefaultVolume(player.guildId);
				
				if (defaultVolume && defaultVolume !== 100) {
					player.setVolume(defaultVolume);
					logger.debug("PlayerCreate", `Set default volume to ${defaultVolume} for guild ${player.guildId}`);
				}
			} catch (volError) {
				logger.warn("PlayerCreate", `Failed to set default volume for guild ${player.guildId}:`, volError.message);
			}

			// Handle 247 auto-connect check
			try {
				const { db } = await import('#database/DatabaseManager');
				const guildDb = db.guild;
				const is247Settings = guildDb.get247Settings(player.guildId);
				
				if (is247Settings.enabled && is247Settings.voiceChannel) {
					logger.info("PlayerCreate", `247 mode active for guild ${player.guildId}, ensuring connection to ${is247Settings.voiceChannel}`);
				}
				
				// Notify web dashboard
				if (player.manager?.client?.webServer) {
					player.manager.client.webServer.updatePlayerState(player.guildId);
				}
			} catch (error) {
				logger.warn("PlayerCreate", `Failed to check 247 settings for guild ${player.guildId}:`, error.message);
			}
		} catch (error) {
			logger.error("PlayerCreate", "Error in playerCreate event:", error);
		}
	},
};
