import { EmbedBuilder } from 'discord.js';
import { PlayerManager } from '#managers/PlayerManager';

export class DiscordPlayerEmbed {
  static createPlayerEmbed(pm, guild, currentPosition = null) {
    const track = pm.currentTrack;
    // Get position from player directly to ensure it's current
    const player = pm.player;
    // Use provided position or get from player, with fallback
    const position = currentPosition !== null ? currentPosition : (player?.position ?? pm.position ?? 0);
    const duration = track?.info?.duration || 0;
    const isStream = track?.info?.isStream || duration === 0;
    const progress = isStream ? 1 : (duration > 0 ? Math.min(Math.max(0, position) / duration, 1) : 0);
    
    const embed = new EmbedBuilder()
      .setColor(0x1db954) // Spotify green (#1db954)
      .setTimestamp();
    
    if (track) {
      const artworkUrl = track.info?.artworkUrl || track.pluginInfo?.artworkUrl;
      if (artworkUrl) {
        // Use thumbnail for artwork (Discord embed best practice)
        embed.setThumbnail(artworkUrl);
      }
      
      // Spotify-like header
      embed.setAuthor({
        name: '🎵 Now Playing',
      });
      
      // Main track info - Spotify style (bold title, regular artist)
      const title = this.escapeMarkdown(track.info?.title || 'Unknown');
      const artist = this.escapeMarkdown(track.info?.author || 'Unknown Artist');
      
      embed.setDescription(
        `**${title}**\n` +
        `${artist}`
      );
      
      // Enhanced progress bar - Spotify style with better formatting
      const progressBar = this.createSpotifyProgressBar(progress, 35);
      const currentTime = this.formatTime(position);
      const totalTime = isStream ? 'LIVE' : this.formatTime(duration);
      
      // Spotify-style progress display
      embed.addFields({
        name: '\u200b',
        value: `\`${currentTime}\` ${progressBar} \`${totalTime}\``,
        inline: false,
      });
      
      // Compact status info - Spotify style (cleaner layout)
      const statusIcon = pm.isPaused ? '⏸️' : '▶️';
      const volumeIcon = pm.volume === 0 ? '🔇' : pm.volume < 50 ? '🔉' : '🔊';
      const repeatIcon = pm.repeatMode === 'off' ? '🔁' : 
                        pm.repeatMode === 'track' ? '🔂' : '🔁';
      
      embed.addFields(
        {
          name: `${statusIcon} Status`,
          value: pm.isPaused ? 'Paused' : 'Playing',
          inline: true,
        },
        {
          name: `${volumeIcon} Volume`,
          value: `${pm.volume}%`,
          inline: true,
        },
        {
          name: `${repeatIcon} Loop`,
          value: pm.repeatMode === 'off' ? 'Off' : 
                pm.repeatMode === 'track' ? 'Track' : 'Queue',
          inline: true,
        },
        {
          name: '📋 Queue',
          value: `${pm.queueSize} track${pm.queueSize !== 1 ? 's' : ''}`,
          inline: true,
        },
        {
          name: '🔊 Channel',
          value: pm.voiceChannelId ? 
            `<#${pm.voiceChannelId}>` : 'Not connected',
          inline: true,
        },
        {
          name: '\u200b',
          value: '\u200b',
          inline: true,
        }
      );
      
      // Footer with source - Spotify style
      const source = track.info?.sourceName || 'Unknown';
      embed.setFooter({ 
        text: `Tymee Music • ${source.toUpperCase()}`,
        iconURL: guild?.iconURL() || undefined
      });
    } else {
      embed.setDescription('No track is currently playing.');
    }
    
    return embed;
  }
  
  static createProgressBar(progress, length = 20) {
    const filled = Math.round(progress * length);
    const empty = length - filled;
    
    return '▰'.repeat(filled) + '▱'.repeat(empty);
  }
  
  static createSpotifyProgressBar(progress, length = 35) {
    if (progress <= 0) {
      return '○' + '▬'.repeat(length - 1);
    }
    if (progress >= 1) {
      return '▬'.repeat(length - 1) + '●';
    }
    
    const filled = Math.round(progress * length);
    const empty = length - filled;
    
    // Spotify-style progress bar with circular indicator
    if (filled === 0) {
      return '○' + '▬'.repeat(length - 1);
    }
    if (filled >= length) {
      return '▬'.repeat(length - 1) + '●';
    }
    
    // Place indicator at the progress point (smooth positioning)
    const beforeIndicator = Math.max(0, filled - 1);
    const afterIndicator = Math.max(0, empty);
    
    return '▬'.repeat(beforeIndicator) + '●' + '▬'.repeat(afterIndicator);
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
      .replace(/\*/g, '\\*')
      .replace(/_/g, '\\_')
      .replace(/~/g, '\\~')
      .replace(/`/g, '\\`')
      .replace(/\|/g, '\\|')
      .replace(/\n/g, ' ');
  }
}

