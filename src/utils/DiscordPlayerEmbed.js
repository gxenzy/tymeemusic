import { EmbedBuilder } from 'discord.js';
import { PlayerManager } from '#managers/PlayerManager';
import { emojiService } from '#services/EmojiService';
import { DEFAULT_EMOJIS } from '#services/EmojiService';

export class DiscordPlayerEmbed {
  static createPlayerEmbed(pm, guild, currentPosition = null, client = null) {
    const track = pm.currentTrack;
    const player = pm.player;
    const position = currentPosition !== null ? currentPosition : (player?.position ?? pm.position ?? 0);
    const duration = track?.info?.duration || 0;
    const isStream = track?.info?.isStream || duration === 0;
    const progress = isStream ? 1 : (duration > 0 ? Math.min(Math.max(0, position) / duration, 1) : 0);
    
    const peachColor = 0xFFCBA4;
    const guildId = guild?.id || pm.player?.guildId || 'default';
    
    const embed = new EmbedBuilder()
      .setColor(peachColor)
      .setTimestamp();
    
    if (track) {
      const artworkUrl = track.info?.artworkUrl || track.pluginInfo?.artworkUrl;
      if (artworkUrl) {
        embed.setThumbnail(artworkUrl);
      }
      
      const displayEmoji = emojiService.getDisplayEmoji(guildId, 'music', guild);
      embed.setAuthor({
        name: `${displayEmoji} Now Playing`,
        iconURL: 'https://cdn.discordapp.com/emojis/837570776794009610.png'
      });
      
      const title = this.escapeMarkdown(track.info?.title || 'Unknown');
      const artist = this.escapeMarkdown(track.info?.author || 'Unknown Artist');

      const requester = track.requester ? (track.requester.id ? `<@${track.requester.id}>` : (track.requester.username || track.requester.tag || 'Unknown')) : 'Unknown';
      
      embed.setDescription(
        `**${title}**\n` +
        `${DEFAULT_EMOJIS.artist} ${artist}\n\n` +
        `**Requested by:** ${requester}`
      );
      
      const progressBar = this.createModernProgressBar(progress, 35);
      const currentTime = this.formatTime(position);
      const totalTime = isStream ? '🔴 LIVE' : this.formatTime(duration);
      
      embed.addFields({
        name: '\u200b',
        value: `\`${currentTime}\` ${progressBar} \`${totalTime}\``,
        inline: false,
      });
      
      const statusEmoji = emojiService.getDisplayEmoji(guildId, 'status', guild);
      const volumeEmoji = emojiService.getDisplayEmoji(guildId, 'volume', guild);
      const loopEmoji = emojiService.getDisplayEmoji(guildId, 'loop', guild);
      const offEmoji = emojiService.getDisplayEmoji(guildId, 'off', guild);
      const trackEmoji = emojiService.getDisplayEmoji(guildId, 'track', guild);
      const queueEmoji = emojiService.getDisplayEmoji(guildId, 'queue', guild);
      const musicEmoji = emojiService.getDisplayEmoji(guildId, 'music', guild);
      const voiceEmoji = emojiService.getDisplayEmoji(guildId, 'voice', guild);
      
      embed.addFields(
        {
          name: `${statusEmoji} Status`,
          value: pm.isPaused ? `${DEFAULT_EMOJIS.pause} Paused` : `${DEFAULT_EMOJIS.play} Playing`,
          inline: true,
        },
        {
          name: `${volumeEmoji} Volume`,
          value: `${pm.volume}%`,
          inline: true,
        },
        {
          name: `${loopEmoji} Loop`,
          value: pm.repeatMode === 'off' ? `${offEmoji} Off` : 
                pm.repeatMode === 'track' ? `${trackEmoji} Track` : `${queueEmoji} Queue`,
          inline: true,
        },
        {
          name: `${queueEmoji} Queue`,
          value: `${pm.queueSize} track${pm.queueSize !== 1 ? 's' : ''}`,
          inline: true,
        },
        {
          name: `${musicEmoji} Requested`,
          value: track.requester ? (track.requester.username ? track.requester.username : `<@${track.requester.id}>`) : 'Unknown',
          inline: true,
        },
        {
          name: `${voiceEmoji} Channel`,
          value: pm.voiceChannelId ? 
            `<#${pm.voiceChannelId}>` : 'Not connected',
          inline: true,
        }
      );
      
      const source = track.info?.sourceName || 'Unknown';
      const sourceDisplayEmoji = emojiService.getDisplayEmoji(guildId, source.toLowerCase(), guild) || DEFAULT_EMOJIS.music;
      embed.setFooter({ 
        text: `${sourceDisplayEmoji} ${source.toUpperCase()} • TymeeMusic`,
        iconURL: guild?.iconURL() || undefined
      });
    } else {
      embed.setDescription(`${DEFAULT_EMOJIS.idle} No track is currently playing.`);
    }
    
    return embed;
  }
  
  static createProgressBar(progress, length = 20) {
    const filled = Math.round(progress * length);
    const empty = length - filled;
    
    return '▰'.repeat(filled) + '▱'.repeat(empty);
  }
  
  static createModernProgressBar(progress, length = 35) {
    const filled = Math.floor(progress * length);
    const empty = length - filled;
    
    const filledChar = '▇';
    const emptyChar = '▇';
    
    return filledChar.repeat(filled) + ' ' + emptyChar.repeat(empty);
  }
  
  static formatTime(ms) {
    if (!ms || ms < 0) return '0:00';
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }
  
  static escapeMarkdown(text) {
    if (!text) return '';
    return text
      .replace(/(\*|_|`|~)/g, '\\$1')
      .replace(/@everyone/g, '@ everyone')
      .replace(/@&/g, '@ &')
      .replace(/#/g, '#');
  }
}

export default DiscordPlayerEmbed;
