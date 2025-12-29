import { logger } from "#utils/logger";
import { EventUtils } from "#utils/EventUtils";
import { VoiceChannelStatus } from "#utils/VoiceChannelStatus";

export default {
	name: "playerDestroy",
	once: false,
	async execute(player,reason) {
		try {
			try {
				await VoiceChannelStatus.clearStatus(player.manager?.client, player.voiceChannelId);
			} catch (statusError) {
				logger.debug('PlayerDestroy', `VoiceChannel status clear failed: ${statusError.message}`);
			}
			logger.info(
				"playerDestroy",
				`🎵 Player destroyed for guild: ${player.guildId},reason : ${reason}`,
			);
		} catch (error) {
			logger.error("PlayerDestroy", "Error in Pla event:", error);
		}
	},
};
