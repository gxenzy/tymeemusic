import { Routes } from 'discord-api-types/v10';
import { logger } from '#utils/logger';
import { emojiService } from '#services/EmojiService';

/**
 * Utility class for managing voice channel status updates
 */
export class VoiceChannelStatus {
  /**
   * Get the source emoji key based on track info
   * @param {Object} track - The track object
   * @returns {string} - The emoji key (sp, yt, am, sc, dz)
   */
  static getSourceKey(track) {
    const uri = track?.info?.uri?.toLowerCase() || '';
    const sourceName = track?.info?.sourceName?.toLowerCase() || '';

    if (uri.includes('spotify.com') || sourceName.includes('spotify')) {
      return 'sp';
    } else if (uri.includes('youtube.com') || uri.includes('youtu.be') || sourceName.includes('youtube')) {
      return 'yt';
    } else if (uri.includes('soundcloud.com') || sourceName.includes('soundcloud')) {
      return 'sc';
    } else if (uri.includes('music.apple.com') || sourceName.includes('apple')) {
      return 'am';
    } else if (uri.includes('deezer.com') || sourceName.includes('deezer')) {
      return 'dz';
    }
    return 'music';
  }

  /**
   * Get emoji string for a key, with optional guild/client for custom emojis
   * @param {string} key - Emoji key
   * @param {Guild} guild - Discord guild (optional)
   * @param {Client} client - Discord client (optional)
   * @returns {string} - Emoji string
   */
  static getEmoji(key, guild = null, client = null) {
    return emojiService.getEmoji('global', key, guild, client);
  }

  /**
   * Format the "Requested by" status message
   * @param {string} username - The username who requested the song
   * @param {Guild} guild - Discord guild (optional)
   * @param {Client} client - Discord client (optional)
   * @returns {string} - Formatted status string
   */
  static formatRequestedBy(username, guild = null, client = null) {
    const playEmoji = this.getEmoji('play', guild, client);
    return `${playEmoji} **Requested by ${username}**`;
  }

  /**
   * Format the "Now Playing" status message
   * @param {Object} track - The track object
   * @param {Guild} guild - Discord guild (optional)
   * @param {Client} client - Discord client (optional)
   * @returns {string} - Formatted status string
   */
  static formatNowPlaying(track, guild = null, client = null) {
    const sourceKey = this.getSourceKey(track);
    const sourceEmoji = this.getEmoji(sourceKey, guild, client);
    const title = track?.info?.title || 'Unknown';
    const author = track?.info?.author || 'Unknown';

    let statusText = `${sourceEmoji} **| ${title} - ${author}**`;

    if (statusText.length > 100) {
      const maxLength = 100 - sourceEmoji.length - 10;
      const truncatedText = `${title} - ${author}`.substring(0, maxLength) + '...';
      statusText = `${sourceEmoji} **| ${truncatedText}**`;
    }

    return statusText;
  }

  /**
   * Update the voice channel status
   * @param {Client} client - Discord client
   * @param {string} channelId - Voice channel ID
   * @param {string|null} status - Status text (null to clear)
   * @returns {Promise<boolean>} - Success status
   */
  static async setStatus(client, channelId, status) {
    try {
      if (!channelId) {
        logger.debug('VoiceChannelStatus', 'No channel ID provided');
        return false;
      }

      await client.rest.put(Routes.channel(channelId) + '/voice-status', {
        body: {
          status: status || null
        }
      });

      logger.debug('VoiceChannelStatus', `Updated status for channel ${channelId}: ${status || '(cleared)'}`);
      return true;
    } catch (error) {
      if (error.code === 50001 || error.code === 50013) {
        logger.debug('VoiceChannelStatus', `Missing permissions to update status in channel ${channelId}`);
      } else {
        logger.error('VoiceChannelStatus', `Failed to update status: ${error.message}`);
      }
      return false;
    }
  }

  /**
   * Set "Requested by" status
   * @param {Client} client - Discord client
   * @param {string} channelId - Voice channel ID
   * @param {string} username - Username who requested
   * @param {Guild} guild - Discord guild (optional)
   * @param {Client} clientObj - Discord client (optional, renamed to avoid conflict)
   */
  static async setRequestedBy(client, channelId, username, guild = null, clientObj = null) {
    const status = this.formatRequestedBy(username, guild, clientObj || client);
    return this.setStatus(client, channelId, status);
  }

  /**
   * Set "Now Playing" status with track info
   * @param {Client} client - Discord client
   * @param {string} channelId - Voice channel ID
   * @param {Object} track - Track object
   * @param {Guild} guild - Discord guild (optional)
   * @param {Client} clientObj - Discord client (optional, renamed to avoid conflict)
   */
  static async setNowPlaying(client, channelId, track, guild = null, clientObj = null) {
    const status = this.formatNowPlaying(track, guild, clientObj || client);
    return this.setStatus(client, channelId, status);
  }

  /**
   * Clear the voice channel status
   * @param {Client} client - Discord client
   * @param {string} channelId - Voice channel ID
   */
  static async clearStatus(client, channelId) {
    return this.setStatus(client, channelId, null);
  }
}

export default VoiceChannelStatus;

