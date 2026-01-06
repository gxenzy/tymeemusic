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
    const userData = track?.userData || track?.requester || {};
    const originalSource = userData.originalSource?.toLowerCase() || '';
    const originalUri = userData.originalUri?.toLowerCase() || '';

    if (originalSource.includes('spotify') || originalUri.includes('spotify.com')) {
      return 'sp';
    }

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
   * Resolve an emoji key to actual Discord emoji (custom or unicode)
   * @param {string} emojiKey - The emoji key (sp, yt, play, etc.)
   * @param {Object} guild - Discord guild object
   * @param {Object} emojiManager - Optional EmojiManager instance
   * @returns {string} - Resolved emoji string
   */
  static async resolveEmoji(emojiKey, guild, emojiManager = null) {
    // First check emojiManager for custom emoji mapping
    if (emojiManager && guild) {
      try {
        const emojiData = await emojiManager.getEmoji(guild.id, emojiKey);
        if (emojiData && emojiData.id && emojiData.available) {
          // Return custom emoji format
          return emojiData.animated
            ? `<a:${emojiData.name}:${emojiData.id}>`
            : `<:${emojiData.name}:${emojiData.id}>`;
        }
      } catch (error) {
        logger.debug('VoiceChannelStatus', `EmojiManager lookup failed for ${emojiKey}: ${error.message}`);
      }
    }

    // Fallback: Check if custom emoji exists in guild
    if (guild) {
      // Try finding by exact name match
      let serverEmoji = guild.emojis.cache.find(e =>
        e.name.toLowerCase() === emojiKey.toLowerCase()
      );

      if (serverEmoji) {
        return serverEmoji.toString();
      }

      // Try finding by partial name match
      serverEmoji = guild.emojis.cache.find(e =>
        e.name.toLowerCase().includes(emojiKey.toLowerCase()) ||
        emojiKey.toLowerCase().includes(e.name.toLowerCase())
      );

      if (serverEmoji) {
        return serverEmoji.toString();
      }
    }

    // Fallback to unicode emoji from config
    const unicodeEmoji = emoji[emojiKey] || emoji.music || '🎵';
    return unicodeEmoji;
  }

  /**
   * Format the "Requested by" status message
   * @param {string} username - The username who requested the song
   * @param {Object} guild - Discord guild object
   * @param {Object} emojiManager - Optional EmojiManager instance
   * @returns {Promise<string>} - Formatted status string
   */
  static async formatRequestedBy(username, guild, emojiManager = null) {
    const playEmoji = await this.resolveEmoji('play', guild, emojiManager);
    return `${playEmoji} **Requested by ${username}**`;
  }

  /**
   * Format the "Now Playing" status message
   * @param {Object} track - The track object
   * @param {Object} guild - Discord guild object
   * @param {Object} emojiManager - Optional EmojiManager instance
   * @returns {Promise<string>} - Formatted status string
   */
  static async formatNowPlaying(track, guild, emojiManager = null) {
    const sourceKey = this.getSourceKey(track);
    const sourceEmoji = await this.resolveEmoji(sourceKey, guild, emojiManager);
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
   * @param {Object} guild - Discord guild object (needed for custom emojis)
   * @param {Object} emojiManager - Optional EmojiManager instance
   */
  static async setRequestedBy(client, channelId, username, guild = null, emojiManager = null) {
    const status = await this.formatRequestedBy(username, guild, emojiManager);
    return this.setStatus(client, channelId, status);
  }

  /**
   * Set "Now Playing" status with track info
   * @param {Client} client - Discord client
   * @param {string} channelId - Voice channel ID
   * @param {Object} track - Track object
   * @param {Object} guild - Discord guild object (needed for custom emojis)
   * @param {Object} emojiManager - Optional EmojiManager instance
   */
  static async setNowPlaying(client, channelId, track, guild = null, emojiManager = null) {
    const status = await this.formatNowPlaying(track, guild, emojiManager);
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

