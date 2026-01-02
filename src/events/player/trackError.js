import { logger } from "#utils/logger";

/**
 * Lavalink track error logging.
 *
 * Why this exists:
 * - Your bot is rapidly skipping tracks and then destroying the player with
 *   reasons like `TrackErrorMaxTracksErroredPerTime`.
 * - That is almost always triggered by repeated *track errors* in a short window.
 * - This handler logs the underlying error/exception details so you can see
 *   the real reason (YouTube 403/429, signature errors, region blocked, etc.).
 *
 * Event name:
 * - Many Lavalink client implementations emit either `trackError` or `trackException`.
 * - This file handles `trackError`. (I also recommend keeping a `trackException` logger.)
 *
 * Signature:
 * - Varies by library version. This handler is defensive:
 *   - Common: (player, track, payload)
 *   - Sometimes: (player, payload)
 *   - Sometimes: (payload)
 */
export default {
  name: "trackError",
  once: false,

  async execute(...args) {
    try {
      let player = null;
      let track = null;
      let payload = null;

      if (args.length >= 3 && args[0] && args[1]) {
        // (player, track, payload)
        player = args[0];
        track = args[1];
        payload = args[2];
      } else if (args.length === 2 && args[0] && args[1]) {
        // (player, payload)
        player = args[0];
        payload = args[1];
        track = payload?.track || payload?.currentTrack || null;
      } else if (args.length === 1) {
        // (payload)
        payload = args[0];
        player = payload?.player || null;
        track = payload?.track || payload?.currentTrack || null;
      }

      const guildId =
        player?.guildId ||
        payload?.guildId ||
        payload?.guild ||
        "unknown";

      const nodeId =
        player?.node?.id ||
        player?.node?.name ||
        payload?.node?.id ||
        payload?.node?.name ||
        "unknown";

      const trackInfo = track?.info || track || payload?.track?.info || {};
      const title = trackInfo?.title || trackInfo?.name || "Unknown";
      const author = trackInfo?.author || trackInfo?.artist || "Unknown";
      const uri = trackInfo?.uri || trackInfo?.url || null;
      const duration = Number(trackInfo?.duration || 0) || 0;

      // Many libs put details here: payload.exception / payload.error / payload.cause
      const exception =
        payload?.exception ||
        payload?.error ||
        payload?.cause ||
        payload?.data?.exception ||
        null;

      const message =
        exception?.message ||
        payload?.message ||
        payload?.reason ||
        payload?.errorMessage ||
        "Unknown track error";

      const severity =
        exception?.severity ||
        payload?.severity ||
        payload?.level ||
        "UNKNOWN";

      const cause = exception?.cause || payload?.cause || null;

      const state = {
        isPlaying: Boolean(player?.playing ?? payload?.isPlaying),
        isPaused: Boolean(player?.paused ?? payload?.isPaused),
        position: Number(player?.position ?? payload?.position ?? 0) || 0,
        volume: Number(player?.volume ?? payload?.volume ?? 0) || 0,
        voiceChannelId: player?.voiceChannelId ?? payload?.voiceChannelId ?? null,
        textChannelId: player?.textChannelId ?? payload?.textChannelId ?? null,
      };

      logger.error("TrackError", "🚨 Track error occurred", {
        guildId,
        nodeId,
        track: { title, author, uri, duration },
        error: { message, severity, cause },
        state,
        raw: payload ?? args,
      });
    } catch (err) {
      logger.error("TrackError", "Failed to log trackError event:", err);
    }
  },
};
