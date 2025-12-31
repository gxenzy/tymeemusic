import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from 'discord.js';
import { PlayerManager } from '#managers/PlayerManager';

export class ModernPlayerEmbed {
  static createModernPlayer(pm, guild, currentPosition = null) {
    const track = pm.currentTrack;
    const player = pm.player;
    const position = currentPosition !== null ? currentPosition : (player?.position ?? pm.position ?? 0);
    const duration = track?.info?.duration || 0;
    const isStream = track?.info?.isStream || duration === 0;
    const progress = isStream ? 1 : (duration > 0 ? Math.min(Math.max(0, position) / duration, 1) : 0);

    // Theme colors - Deep navy/midnight blue with neon pink accent
    const colors = {
      primary: '#FF007F', // Neon pink
      secondary: '#E0E0E0', // Light gray
      dark: '#0A0E27', // Deep navy
      darkSecondary: '#1A1F3A', // Midnight blue with purple tint
      success: '#00D26A', // Green for badges
      muted: '#808080', // Muted white/gray
      glow: '#FF007F' // Neon pink glow
    };

    const embed = new EmbedBuilder()
      .setColor(colors.primary)
      .setTimestamp();

    if (track) {
      const artworkUrl = track.info?.artworkUrl || track.pluginInfo?.artworkUrl;
      
      // Use landscape artwork as banner with overlay
      if (artworkUrl) {
        embed.setImage(artworkUrl);
      }

      // Top section: App header with verification
      embed.setAuthor({
        name: '✅ TymeeMusic',
        iconURL: guild?.iconURL(),
      });

      // Now Playing badge
      const currentTime = this.formatTime(position);
      const totalTime = isStream ? 'LIVE' : this.formatTime(duration);
      
      // Main content with title and artist overlaid on artwork
      const title = this.escapeMarkdown(track.info?.title || 'Unknown');
      const artist = this.escapeMarkdown(track.info?.author || 'Unknown Artist');
      
      // Description with overlay info
      embed.setDescription(
        `**${title}**\n` +
        `${artist}\n` +
        `🎵 Requested by <@${pm.currentTrack?.requester?.id || 'Unknown'}>`
      );

      // Progress bar with neon pink gradient
      const progressBar = this.createNeonProgressBar(progress, 35, colors.primary);
      
      // Progress section with time on both sides
      embed.addFields({
        name: '\u200b',
        value: `\`${currentTime}\` ${progressBar} \`${totalTime}\``,
        inline: false,
      });

      // Status indicators
      const statusInfo = [];
      statusInfo.push(`${pm.isPaused ? '⏸️ Paused' : '▶️ Playing'}`);
      statusInfo.push(`🔊 ${pm.volume}%`);
      statusInfo.push(`🔁 ${pm.repeatMode === 'off' ? 'Off' : pm.repeatMode}`);
      statusInfo.push(`📋 Queue: ${pm.queueSize}`);
      
      embed.addFields({
        name: 'Status',
        value: statusInfo.join(' • '),
        inline: false,
      });

      // Queue info
      if (pm.queueSize > 0) {
        const nextTrack = player.queue.tracks[0];
        if (nextTrack) {
          embed.addFields({
            name: 'Up Next',
            value: `**${nextTrack.info?.title || 'Unknown'}**\n${nextTrack.info?.author || 'Unknown Artist'}`,
            inline: false,
          });
        }
      } else {
        embed.addFields({
          name: 'Queue',
          value: 'Queue is empty. Use `/play` to add songs.',
          inline: false,
        });
      }

      // Footer with verification and source
      const source = track.info?.sourceName || 'Unknown';
      embed.setFooter({ 
        text: `✅ Verified • ${source.toUpperCase()}`,
        iconURL: guild?.iconURL(),
      });
    } else {
      embed.setDescription('No track is currently playing.\n\nUse `/play` to start music!');
      embed.setFooter({ 
        text: '✅ TymeeMusic • Ready to play',
      });
    }

    return embed;
  }

  static createControlButtons(pm) {
    const track = pm.currentTrack;
    
    // First row: Main controls
    const row1 = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('player_prev')
          .setEmoji('⏮️')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(pm.isPaused ? 'player_play' : 'player_pause')
          .setEmoji(pm.isPaused ? '▶️' : '⏸️')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('player_next')
          .setEmoji('⏭️')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('player_stop')
          .setEmoji('⏹️')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId('player_queue')
          .setEmoji('📋')
          .setStyle(ButtonStyle.Secondary)
      );

    // Second row: Additional controls
    const row2 = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('player_loop')
          .setEmoji('🔁')
          .setStyle(pm.repeatMode === 'off' ? ButtonStyle.Secondary : ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('player_shuffle')
          .setEmoji('🔀')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('player_mute')
          .setEmoji('🔇')
          .setStyle(pm.volume === 0 ? ButtonStyle.Primary : ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('player_vol_up')
          .setEmoji('🔊')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('player_vol_down')
          .setEmoji('🔉')
          .setStyle(ButtonStyle.Secondary)
      );

    return [row1, row2];
  }

  static createNeonProgressBar(progress, length = 35, color = '#FF007F') {
    if (progress <= 0) {
      return '⬜' + '⬛'.repeat(length - 1);
    }
    if (progress >= 1) {
      return '▪️'.repeat(length);
    }

    const filled = Math.round(progress * length);
    const empty = length - filled;

    // Create gradient effect with unicode
    const gradientFill = '▪️';
    const emptyBar = '⬜';

    const beforeIndicator = filled - 1;
    const afterIndicator = Math.max(0, length - filled - 1);

    return gradientFill.repeat(Math.max(0, beforeIndicator)) + '🔶' + emptyBar.repeat(afterIndicator);
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
