import { logger } from "#utils/logger";
import { EventUtils } from "#utils/EventUtils";
import { VoiceChannelStatus } from "#utils/VoiceChannelStatus";

export default {
	name: "playerDestroy",
	once: false,
	async execute(player, reason) {
		try {
			await VoiceChannelStatus.clearStatus(player.manager?.client, player.voiceChannelId);

			// End permission session
			try {
				const { PlayerPermissionManager } = await import("#managers/PlayerPermissionManager");
				PlayerPermissionManager.endSession(player.guildId);
			} catch (permError) {
				// Ignore permission manager errors
			}

			logger.info(
				"playerDestroy",
				`🎵 Player destroyed for guild: ${player.guildId},reason : ${reason}`,
			);

			// Notify web dashboard that player is gone
			if (player.manager?.client?.webServer) {
				player.manager.client.webServer.updatePlayerState(player.guildId);
			}
		} catch (error) {
			logger.error("PlayerDestroy", "Error in Pla event:", error);
		}
	},
};
