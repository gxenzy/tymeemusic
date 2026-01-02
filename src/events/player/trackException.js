import { logger } from "#utils/logger";

/**
 * Lavalink track exception / error logging.
 *
 * Goal:
 * - Capture the *real* underlying playback failure that causes rapid skipping
 *   and player destruction with reasons like `TrackErrorMaxTracksErroredPerTime`.
 *
 * Notes:
 * - Event signature varies depending on lavalink client/library version.
 * - This handler is defensive and tries to extract useful fields from whatever payload arrives.
 * - Registered by `src/structures/handlers/event-handlers/player.js` via:
 *     this.music.lavalink.on(event.name, listener)
 */
export default {
  name: "trackException",
  once: false,

  // Expected (varies): (player, track, payload) OR (player, track, exception) OR (data)
  async execute(...args) {
    try {
      // Attempt to identify player/track/payload from common shapes.
      let player = null;
      let track = null;
      let payload = null;

      // Most common: (player, track, payload)
      if (args.length >= 3 && args[0] && args[1]) {
        player = args[0];
        track = args[1];
        payload = args[2];
      } else if (args.length === 2 && args[0] && args[1]) {
        // Sometimes: (player, payload) where payload includes track
        player = args[0];
        payload = args[1];
        track = payload?.track || payload?.currentTrack || null;
      } else if (args.length === 1) {
        // Sometimes: (payload) only
        payload = args[0];
        player = payload?.player || payload?.guildId ? payload : null;
        track = payload?.track || payload?.currentTrack || null;
      }

      const guildId =
        player?.guildId ||
        player?.guild ||
        payload?.guildId ||
        payload?.guild ||
        "unknown";

      const nodeId =
        player?.node?.id ||
        player?.node?.name ||
        payload?.node?.id ||
        payload?.node?.name ||
        "unknown";

      const trackInfo = track?.info || track || {};
      const trackTitle =
        trackInfo?.title ||
        trackInfo?.name ||
        payload?.track?.info?.title ||
        "Unknown";

      const trackAuthor =
        trackInfo?.author ||
        trackInfo?.artist ||
        payload?.track?.info?.author ||
        "Unknown";

      const trackUri =
        trackInfo?.uri ||
        trackInfo?.url ||
        payload?.track?.info?.uri ||
        payload?.track?.info?.url ||
        null;

      // Lavalink exception payload commonly has: { exception: { message, severity, cause } }
      const exception =
        payload?.exception ||
        payload?.error ||
        payload?.cause ||
        payload?.data?.exception ||
        null;

      const exceptionMessage =
        exception?.message ||
        payload?.message ||
        payload?.reason ||
        payload?.errorMessage ||
        "Unknown exception";

      const severity =
        exception?.severity || payload?.severity || payload?.level || "UNKNOWN";

      const cause = exception?.cause || payload?.cause || null;

      // Extra context if the library provides it
      const state = {
        isPlaying: Boolean(player?.playing ?? payload?.isPlaying),
        isPaused: Boolean(player?.paused ?? payload?.isPaused),
        position: Number(player?.position ?? payload?.position ?? 0),
        volume: Number(player?.volume ?? payload?.volume ?? 0),
        voiceChannelId: player?.voiceChannelId ?? payload?.voiceChannelId ?? null,
        textChannelId: player?.textChannelId ?? payload?.textChannelId ?? null,
      };

      // Log a structured summary + the raw payload for deep debugging.
      logger.error("TrackException", "🚨 Track exception occurred", {
        guildId,
        nodeId,
        track: {
          title: trackTitle,
          author: trackAuthor,
          uri: trackUri,
        },
        exception: {
          message: exceptionMessage,
          severity,
          cause,
        },
        state,
        // Keep raw payload for investigation (can be large but is crucial here)
        raw: payload ?? args,
      });
    } catch (err) {
      logger.error("TrackException", "Failed to log trackException event:", err);
    }
  },
};
