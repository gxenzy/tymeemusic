import { EmbedBuilder } from 'discord.js';
import { PlayerManager } from '#managers/PlayerManager';

export class DiscordPlayerEmbed {
  // pm: PlayerManager, guild: Guild object (optional), currentPosition: ms (optional), client: discord client (optional)
  static createPlayerEmbed(pm, guild, currentPosition = null, client = null) {
    const track = pm.currentTrack;
    const player = pm.player;
    const position = currentPosition !== null ? currentPosition : (player?.position ?? pm.position ?? 0);
    const duration = track?.info?.duration || 0;
    const isStream = track?.info?.isStream || duration === 0;
    const progress = isStream ? 1 : (duration > 0 ? Math.min(Math.max(0, position) / duration, 1) : 0);
    
    // Peach color theme (#FFCBA4 - soft peach)
    const peachColor = 0xFFCBA4;
    const darkPeach = 0xE8A87C;
    
    // Get server emojis with fallbacks (prefer guild, then bot client emojis)
    const emojis = this.getEmojis(guild, client);
    
    const embed = new EmbedBuilder()
      .setColor(peachColor)
      .setTimestamp();
    
    if (track) {
      const artworkUrl = track.info?.artworkUrl || track.pluginInfo?.artworkUrl;
      if (artworkUrl) {
        embed.setThumbnail(artworkUrl);
      }
      
      // Modern header with custom emoji
      embed.setAuthor({
        name: `${emojis.music} Now Playing`,
        iconURL: 'https://cdn.discordapp.com/emojis/837570776794009610.png' // Default music icon
      });
      
      // Main track info - Modern styling
      const title = this.escapeMarkdown(track.info?.title || 'Unknown');
      const artist = this.escapeMarkdown(track.info?.author || 'Unknown Artist');

      // Requester display (prefer mention if id available)
      const requester = track.requester ? (track.requester.id ? `<@${track.requester.id}>` : (track.requester.username || track.requester.tag || 'Unknown')) : 'Unknown';
      
      embed.setDescription(
        `**${title}**\n` +
        `${emojis.artist} ${artist}\n\n` +
        `**Requested by:** ${requester}`
      );
      
      // Modern progress bar with peach theme
      const progressBar = this.createModernProgressBar(progress, 35);
      const currentTime = this.formatTime(position);
      const totalTime = isStream ? '🔴 LIVE' : this.formatTime(duration);
      
      embed.addFields({
        name: '\u200b',
        value: `\`${currentTime}\` ${progressBar} \`${totalTime}\``,
        inline: false,
      });
      
      // Modern status info with custom emojis
      embed.addFields(
        {
          name: `${emojis.status} Status`,
          value: pm.isPaused ? `${emojis.paused} Paused` : `${emojis.playing} Playing`,
          inline: true,
        },
        {
          name: `${emojis.volume} Volume`,
          value: `${pm.volume}%`,
          inline: true,
        },
        {
          name: `${emojis.loop} Loop`,
          value: pm.repeatMode === 'off' ? `${emojis.off} Off` : 
                pm.repeatMode === 'track' ? `${emojis.track} Track` : `${emojis.queue} Queue`,
          inline: true,
        },
        {
          name: `${emojis.queue} Queue`,
          value: `${pm.queueSize} track${pm.queueSize !== 1 ? 's' : ''}`,
          inline: true,
        },
        {
          name: `${emojis.music} Requested`,
          value: track.requester ? (track.requester.username ? track.requester.username : `<@${track.requester.id}>`) : 'Unknown',
          inline: true,
        },
        {
          name: `${emojis.voice} Channel`,
          value: pm.voiceChannelId ? 
            `<#${pm.voiceChannelId}>` : 'Not connected',
          inline: true,
        }
      );
      
      // Footer with source and modern styling
      const source = track.info?.sourceName || 'Unknown';
      const sourceEmoji = this.getSourceEmoji(source, guild);
      embed.setFooter({ 
        text: `${sourceEmoji} ${source.toUpperCase()} • TymeeMusic`,
        iconURL: guild?.iconURL() || undefined
      });
    } else {
      embed.setDescription(`${emojis.idle} No track is currently playing.`);
    }
    
    return embed;
  }
  
  static getEmojis(guild, client = null) {
    if (!guild && !client) {
      return {
        music: '🎵',
        artist: '🎤',
        status: '📊',
        paused: '⏸️',
        playing: '▶️',
        volume: '🔊',
        loop: '🔁',
        off: '❌',
        track: '🔂',
        queue: '📋',
        voice: '🔈',
        idle: '💤'
      };
    }

    // Try to find server emojis, fallback to client (bot) emojis, then to unicode defaults
    const emojiNames = {
      music: ['music', 'nowplaying', 'np', '🎵'],
      artist: ['artist', 'microphone', 'singer', '🎤'],
      status: ['status', 'stats', '📊'],
      paused: ['pause', 'paused', '⏸️'],
      playing: ['play', 'playing', 'resume', '▶️'],
      volume: ['volume', 'vol', '🔊'],
      loop: ['loop', 'repeat', '🔁'],
      off: ['off', 'disabled', '❌'],
      track: ['track', 'song', '🔂'],
      queue: ['queue', 'list', 'playlist', '📋'],
      voice: ['voice', 'channel', 'speaker', '🔈'],
      idle: ['idle', 'sleep', '💤']
    };

    const emojis = {};
    for (const [key, names] of Object.entries(emojiNames)) {
      let found = null;
      if (guild) {
        found = guild.emojis.cache.find(e => 
          names.some(name => e.name.toLowerCase().includes(name.toLowerCase()) || e.name === name)
        );
      }
      if (!found && client) {
        found = client.emojis.cache.find(e =>
          names.some(name => e.name.toLowerCase().includes(name.toLowerCase()) || e.name === name)
        );
      }
      emojis[key] = found ? `<:${found.name}:${found.id}>` : names[names.length - 1];
    }

    return emojis;
  }
  
  static getSourceEmoji(source, guild, client = null) {
    if (!guild && !client) {
      const sourceEmojis = {
        youtube: '📺',
        spotify: '🎵',
        soundcloud: '☁️',
        deezer: '🎧',
        apple: '🍎',
        twitch: '📺',
        default: '🎵'
      };
      return sourceEmojis[source?.toLowerCase()] || sourceEmojis.default;
    }

    // Try to find server emoji for source
    let emoji = null;
    if (guild) {
      emoji = guild.emojis.cache.find(e => 
        e.name.toLowerCase().includes(source?.toLowerCase()) ||
        (['youtube', 'yt'].includes(e.name.toLowerCase()) && source?.toLowerCase().includes('youtube')) ||
        (['spotify', 'sp'].includes(e.name.toLowerCase()) && source?.toLowerCase().includes('spotify'))
      );
    }

    if (!emoji && client) {
      emoji = client.emojis.cache.find(e =>
        e.name.toLowerCase().includes(source?.toLowerCase()) ||
        (['youtube', 'yt'].includes(e.name.toLowerCase()) && source?.toLowerCase().includes('youtube')) ||
        (['spotify', 'sp'].includes(e.name.toLowerCase()) && source?.toLowerCase().includes('spotify'))
      );
    }

    if (emoji) return `<:${emoji.name}:${emoji.id}>`;

    const sourceEmojis = {
      youtube: '📺',
      spotify: '🎵',
      soundcloud: '☁️',
      deezer: '🎧',
      apple: '🍎',
      twitch: '📺',
      default: '🎵'
    };
    return sourceEmojis[source?.toLowerCase()] || sourceEmojis.default;
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
    
    if (filled === 0) {
      return '○' + '▬'.repeat(length - 1);
    }
    if (filled >= length) {
      return '▬'.repeat(length - 1) + '●';
    }
    
    const beforeIndicator = Math.max(0, filled - 1);
    const afterIndicator = Math.max(0, empty);
    
    return '▬'.repeat(beforeIndicator) + '●' + '▬'.repeat(afterIndicator);
  }
  
  static createModernProgressBar(progress, length = 35) {
    if (progress <= 0) {
      return '⬜' + '⬛'.repeat(length - 1);
    }
    if (progress >= 1) {
      return '▪️'.repeat(length);
    }
    
    const filled = Math.round(progress * length);
    const empty = length - filled;
    
    // Modern peach-themed progress bar
    const filledBar = '▪️';
    const emptyBar = '⬜';
    const indicator = '🔶';
    
    if (filled === 0) {
      return indicator + emptyBar.repeat(length - 1);
    }
    if (filled >= length) {
      return filledBar.repeat(length);
    }
    
    const beforeIndicator = filled - 1;
    const afterIndicator = Math.max(0, length - filled - 1);
    
    return filledBar.repeat(beforeIndicator) + indicator + emptyBar.repeat(afterIndicator);
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

