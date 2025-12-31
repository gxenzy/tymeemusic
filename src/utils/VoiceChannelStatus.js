import { Routes } from 'discord-api-types/v10';
import { logger } from '#utils/logger';
import { emojiService } from '#services/EmojiService';

export class VoiceChannelStatus {
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

  static getEmoji(key, guild = null, client = null, useAlternatives = false, fallbackIndex = 0) {
    if (!guild?.id) {
      return emojiService.getEmoji('global', key);
    }
    
    if (useAlternatives) {
      return emojiService.getEmojiWithFallback(guild.id, key, guild, client, fallbackIndex);
    }
    
    return emojiService.getEmoji(guild.id, key, guild, client);
  }

  static getSourceEmoji(track, guild, useAlternatives = false) {
    if (!guild?.id) {
      return emojiService.getSourceEmoji(track?.info?.sourceName);
    }
    
    return emojiService.getVoiceStatusEmoji(track, guild.id, guild);
  }

  static formatRequestedBy(username, guild = null, client = null) {
    const playEmoji = this.getEmoji('play', guild, client);
    return `${playEmoji} **Requested by ${username}**`;
  }

  static formatNowPlaying(track, guild = null, client = null) {
    if (!track || !track.info) {
      const musicEmoji = this.getEmoji('music', guild, client);
      return `${musicEmoji} **No track playing**`;
    }

    const sourceEmoji = this.getSourceEmoji(track, guild);
    const title = track.info.title || 'Unknown';
    const author = track.info.author || 'Unknown';

    let statusText = `${sourceEmoji} **| ${title} - ${author}**`;

    if (statusText.length > 100) {
      const maxLength = 100 - sourceEmoji.length - 10;
      const truncatedText = `${title} - ${author}`.substring(0, maxLength) + '...';
      statusText = `${sourceEmoji} **| ${truncatedText}**`;
    }

    return statusText;
  }

  static formatNowPlayingAdvanced(track, guild = null, client = null) {
    if (!track || !track.info) {
      const musicEmoji = this.getEmoji('music', guild, client);
      return {
        emoji: musicEmoji,
        text: 'No track playing',
        source: null
      };
    }

    const sourceEmoji = this.getSourceEmoji(track, guild, true);
    const title = track.info.title || 'Unknown';
    const author = track.info.author || 'Unknown';
    const sourceName = track.info.sourceName || 'Unknown';

    const text = `${title} - ${author}`;

    return {
      emoji: sourceEmoji,
      text: text.length > 80 ? text.substring(0, 77) + '...' : text,
      source: sourceName,
      fullText: `**${sourceEmoji} | ${title} - ${author}**`
    };
  }

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
      } else if (error.code === 50033) {
        logger.debug('VoiceChannelStatus', `Voice status not available for channel ${channelId}`);
      } else {
        logger.error('VoiceChannelStatus', `Failed to update status: ${error.message}`);
      }
      return false;
    }
  }

  static async setRequestedBy(client, channelId, username, guild = null, clientObj = null) {
    const status = this.formatRequestedBy(username, guild, clientObj || client);
    return this.setStatus(client, channelId, status);
  }

  static async setNowPlaying(client, channelId, track, guild = null, clientObj = null) {
    const status = this.formatNowPlaying(track, guild, clientObj || client);
    return this.setStatus(client, channelId, status);
  }

  static async setNowPlayingAdvanced(client, channelId, track, guild = null, clientObj = null) {
    const formatted = this.formatNowPlayingAdvanced(track, guild, clientObj || client);
    return this.setStatus(client, channelId, formatted.fullText);
  }

  static async clearStatus(client, channelId) {
    return this.setStatus(client, channelId, null);
  }

  static async updateForPlayer(client, player, guild = null) {
    if (!player || !player.voiceChannelId) {
      return false;
    }

    if (!guild && player.guildId) {
      guild = client.guilds.cache.get(player.guildId);
    }

    if (player.queue && player.queue.current) {
      return this.setNowPlaying(client, player.voiceChannelId, player.queue.current, guild, client);
    }

    return this.clearStatus(client, player.voiceChannelId);
  }
}

export default VoiceChannelStatus;
