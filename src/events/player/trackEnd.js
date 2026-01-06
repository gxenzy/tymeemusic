import { logger } from "#utils/logger";
import { EventUtils } from "#utils/EventUtils";
import { VoiceChannelStatus } from "#utils/VoiceChannelStatus";
import { db } from "#database/DatabaseManager";

export default {
  name: "trackEnd",
  once: false,
  async execute(player, track, payload, musicManager, client) {
    try {
      const endReason = payload.reason || 'FINISHED';

      if (player.queue.tracks.length === 0) {
        await VoiceChannelStatus.clearStatus(client, player.voiceChannelId);
      }

      logger.debug('TrackEnd', `Track ended in guild ${player.guildId}:`, {
        track: track?.info?.title || 'Unknown',
        reason: endReason,
        guildId: player.guildId
      });

      const messageId = player.get('nowPlayingMessageId');
      const channelId = player.get('nowPlayingChannelId');
      const stuckWarningId = player.get('stuckWarningMessageId');
      const errorMessageId = player.get('errorMessageId');
      const stuckTimeoutId = player.get('stuckTimeoutId');

      EventUtils.clearPlayerTimeout(player, 'stuckTimeoutId');

      // ⚠️ CRITICAL: Handle the 'Hanging Embed' at the end of the queue.
      // If this is the last track and autoplay is OFF, we MUST force a deep cleanup.
      const isQueueEmpty = player.queue.tracks.length === 0;
      const isAutoplayOff = !player.get('autoplayEnabled');

      if (endReason === 'STOPPED' || endReason === 'CLEANUP' || (isQueueEmpty && isAutoplayOff && endReason === 'FINISHED')) {
        await EventUtils.forceCleanupPlayerUI(client, player);
      }

      if (stuckWarningId && channelId) {
        try {
          const channel = client.channels.cache.get(channelId);
          const warningMessage = await channel?.messages.fetch(stuckWarningId).catch(() => null);
          if (warningMessage) {
            await warningMessage.delete().catch(() => { });
          }
        } catch (cleanupError) {
          logger.debug('TrackEnd', 'Error cleaning up stuck warning message:', cleanupError);
        }
      }

      if (errorMessageId && channelId) {
        try {
          const channel = client.channels.cache.get(channelId);
          const errorMessage = await channel?.messages.fetch(errorMessageId).catch(() => null);
          if (errorMessage) {
            await errorMessage.delete().catch(() => { });
          }
        } catch (cleanupError) {
          logger.debug('TrackEnd', 'Error cleaning up error message:', cleanupError);
        }
      }

      // 🛑 HARD RESET: Kill the UI heartbeat from physical memory
      EventUtils.clearHeartbeat(player.guildId);

      player.set('stuckWarningMessageId', null);
      player.set('errorMessageId', null);
      player.set('stuckTimeoutId', null);

      if (endReason === 'FINISHED' && track?.info) {
        logger.info('TrackEnd', `Track completed: "${track.info.title}" by ${track.info.author} in guild ${player.guildId}`);

        // Log to history
        try {
          // track.requester might be object or ID.
          const requester = track.requester;
          const userId = (typeof requester === 'string') ? requester : (requester?.id || null);

          if (userId) {
            // Async log (fire and forget)
            db.playlistsV2.logPlay(track, userId, player.guildId);
          } else {
            logger.debug('TrackEnd', 'Skipping history log - no requester ID');
          }
        } catch (dbError) {
          logger.error('PlaylistsV2', 'Failed to log play history', dbError);
        }
      }

      // Update web dashboard
      if (client.webServer) {
        client.webServer.updatePlayerState(player.guildId);
      }

    } catch (error) {
      logger.error('TrackEnd', 'Error in trackEnd event:', error);
    }
  }
};