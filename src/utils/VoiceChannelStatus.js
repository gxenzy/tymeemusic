import { Routes } from 'discord-api-types/v10';
import { logger } from '#utils/logger';
import emoji from '#config/emoji';

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
    return 'music'; // fallback
  }

  /**
   * Get actual emoji for source
   * @param {string} sourceKey - The source key (sp, yt, am, sc, dz)
   * @returns {string} - Discord-compatible emoji
   */
  static getSourceEmoji(sourceKey) {
    const emojis = {
      'sp': '🎵',
      'yt': '🎶',
      'sc': '🎵',
      'am': '🎵',
      'dz': '🎵',
      'music': '🎵'
    };
    return emojis[sourceKey] || '🎵';
  }

  /**
   * Format the "Requested by" status message
   * @param {string} username - The username who requested the song
   * @returns {string} - Formatted status string
   */
  static formatRequestedBy(username) {
    return `🎵 **Requested by ${username}**`;
  }

  /**
   * Format "Now Playing" status message
   * @param {Object} track - The track object
   * @returns {string} - Formatted status string
   */
  static formatNowPlaying(track) {
    const sourceKey = this.getSourceKey(track);
    const sourceEmoji = this.getSourceEmoji(sourceKey);
    const title = track?.info?.title || 'Unknown';
    const author = track?.info?.author || 'Unknown';
    
    let statusText = `${sourceEmoji} | ${title} - ${author}**`;

    if (statusText.length > 100) {
      const maxLength = 100 - sourceEmoji.length - 3;
      const truncatedText = `${title} - ${author}`.substring(0, maxLength) + '...';
      statusText = `${sourceEmoji} | ${truncatedText}**`;
    }
    
    return statusText;
  }

  /**
   * Format the "Now Playing" status message
   * @param {Object} track - The track object
   * @returns {string} - Formatted status string
   */
  static formatNowPlaying(track) {
    const sourceKey = this.getSourceKey(track);
    const sourceEmoji = `:${sourceKey}:`;
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

      // Use Discord REST API to set voice channel status
      // PUT /channels/{channel.id}/voice-status
      await client.rest.put(Routes.channel(channelId) + '/voice-status', {
        body: {
          status: status || null
        }
      });

      logger.debug('VoiceChannelStatus', `Updated status for channel ${channelId}: ${status || '(cleared)'}`);
      return true;
    } catch (error) {
      // Error code 50001 = Missing Access, 50013 = Missing Permissions
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
   */
  static async setRequestedBy(client, channelId, username) {
    const status = this.formatRequestedBy(username);
    return this.setStatus(client, channelId, status);
  }

  /**
   * Set "Now Playing" status with track info
   * @param {Client} client - Discord client
   * @param {string} channelId - Voice channel ID
   * @param {Object} track - Track object
   */
  static async setNowPlaying(client, channelId, track) {
    const status = this.formatNowPlaying(track);
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

