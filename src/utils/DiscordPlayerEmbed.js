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

      // Main track info - Modern styling - Prioritize Original Metadata
      const title = this.escapeMarkdown(track.requester?.originalTitle || track.userData?.originalTitle || track.info?.title || 'Unknown');
      const artist = this.escapeMarkdown(track.requester?.originalAuthor || track.userData?.originalAuthor || track.info?.author || 'Unknown Artist');

      // Requester display (prefer mention if id available)
      const requester = track.requester ? (track.requester.id ? `<@${track.requester.id}>` : (track.requester.username || track.requester.tag || 'Unknown')) : 'Unknown';

      embed.setDescription(
        `**${title}**\n` +
        `${emojis.artist} ${artist}\n\n` +
        `**Requested by:** ${requester}`
      );

      // Modern progress bar with animated theme
      // FIX: Calculate timescale for synchronous embed as well
      const fm = pm.player?.filterManager;
      const ts = fm?.timescale || fm?.filters?.timescale || fm?.data?.timescale || {};
      const speed = ts.speed || 1.0;
      const rate = ts.rate || 1.0;
      const effectiveTimescale = speed * rate;

      const currentTime = this.formatTime(position / effectiveTimescale);
      const totalTime = isStream ? '🔴 LIVE' : this.formatTime(duration / effectiveTimescale);

      // Try to get animated progress bar, fallback to modern if needed
      let progressBar;
      if (client?.emojiManager && guild?.id) {
        // We can't await here easily since createPlayerEmbed is static sync
        // So we use a simplified version or just use the sync one for now 
        // but I'll make createPlayerEmbedAsync eventually.
        // For now, let's keep it sync and use the refined Unicode one 
        // until we refactor the caller to handle async.
        progressBar = this.createModernProgressBar(progress, 30);
      } else {
        progressBar = this.createModernProgressBar(progress, 30);
      }

      embed.addFields({
        name: '\u200b',
        value: `\`${currentTime}\` ${progressBar} \`${totalTime}\``,
        inline: false,
      });

      // Modern status info with custom emojis
      const statusValue = pm.isPaused ? `${emojis.paused} Paused` : `${emojis.playing} Playing`;
      const volumeValue = `🔊 ${pm.volume}%`;
      const loopValue = pm.repeatMode === 'off' ? '❌ Off' :
        pm.repeatMode === 'track' ? '🔂 Track' : '🔁 Queue';

      embed.addFields(
        {
          name: '\u200b',
          value: `${statusValue}  •  ${volumeValue}  •  ${loopValue}  •  📋 ${pm.queueSize} tracks`,
          inline: false,
        }
      );

      // Footer with source and modern styling
      const source = track.requester?.originalSource || track.userData?.originalSource || track.info?.sourceName || 'Unknown';
      const sourceEmoji = this.getSourceEmoji(source, guild, client);
      embed.setFooter({
        text: `${source.toUpperCase()} • TymeeMusic`,
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

  static async createAnimatedProgressBar(guildId, emojiManager, progress, length = 25) {
    if (!emojiManager) {
      // Fallback to simple modern progress bar if emojiManager is missing
      return this.createModernProgressBar(progress, length);
    }

    const emojis = await emojiManager.getPlayerEmojis(guildId);
    const filled = Math.round(progress * length);
    const emptyCount = Math.max(0, length - filled - 1);

    // Beautiful animated progress bar
    return emojis.pb_start +
      emojis.pb_filled.repeat(filled) +
      emojis.pb_head +
      emojis.pb_empty.repeat(emptyCount) +
      emojis.pb_end;
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

  static async createPlayerEmbedAsync(pm, guild, currentPosition = null, client = null, trackOverride = null) {
    const track = trackOverride || pm.currentTrack;
    const player = pm.player;
    const position = currentPosition !== null ? currentPosition : (player?.position ?? pm.position ?? 0);
    const duration = track?.info?.duration || 0;
    const isStream = track?.info?.isStream || duration === 0;
    const progress = isStream ? 1 : (duration > 0 ? Math.min(Math.max(0, position) / duration, 1) : 0);

    const emojis = client?.emojiManager ? await client.emojiManager.getPlayerEmojis(guild?.id) : this.getEmojis(guild, client);
    const artworkUrl = track?.info?.artworkUrl || track?.pluginInfo?.artworkUrl;

    const embed = new EmbedBuilder()
      .setColor(0x00ffa3) // Mint green
      .setTimestamp();

    if (track) {
      embed.setAuthor({
        name: 'NOW PLAYING',
        iconURL: 'https://cdn.discordapp.com/emojis/1154566050630733854.gif?size=96'
      });

      if (artworkUrl) {
        embed.setThumbnail(artworkUrl);
      }

      const title = this.escapeMarkdown(track.requester?.originalTitle || track.userData?.originalTitle || track.info?.title || 'Unknown');
      const artist = this.escapeMarkdown(track.requester?.originalAuthor || track.userData?.originalAuthor || track.info?.author || 'Unknown Artist');
      const requester = track.requester ? (track.requester.id ? `<@${track.requester.id}>` : (track.requester.username || track.requester.tag || 'Unknown')) : 'System';

      embed.setTitle(title);

      // Resolve proper URL to display (prefer original Spotify URI if available)
      let displayUri = track.requester?.originalUri || track.userData?.originalUri || track.info?.uri;
      if (displayUri && (displayUri.startsWith('http') || displayUri.startsWith('https'))) {
        embed.setURL(displayUri);
      } else {
        embed.setURL(null);
      }

      embed.setDescription(
        `**Artist:** ${artist}\n` +
        `**Requested by:** ${requester}`
      );

      // Calculate effective timescale for duration
      // FIX: Access filter data directly if filterManager exists
      const fm = pm.player?.filterManager;
      const ts = fm?.timescale || fm?.filters?.timescale || fm?.data?.timescale || {};
      const speed = ts.speed || 1.0;
      const rate = ts.rate || 1.0;
      const effectiveTimescale = speed * rate;

      const currentTime = this.formatTime(position / effectiveTimescale);
      const totalTime = isStream ? '🔴 LIVE' : this.formatTime(duration / effectiveTimescale);

      const progressBar = await this.createAnimatedProgressBar(guild?.id, client?.emojiManager, progress, 25);

      embed.addFields({
        name: '\u200b',
        value: `\`${currentTime}\` ${progressBar} \`${totalTime}\``,
        inline: false,
      });

      const statusValue = pm.isPaused ? `${emojis.paused} Paused` : `${emojis.playing} Playing`;
      const volumeValue = `🔊 ${pm.volume}%`;
      const loopValue = pm.repeatMode === 'off' ? '❌ Off' :
        pm.repeatMode === 'track' ? '🔂 Track' : '🔁 Queue';

      // Advanced status row (premium feel)
      const autoplay = player.get('autoplayEnabled') ? '✅' : '❌';
      const sleepEnd = player.get('sleepTimerEnd');
      let sleepText = '';
      if (sleepEnd) {
        const remaining = Math.max(0, Math.floor((sleepEnd - Date.now()) / 1000));
        if (remaining > 0) {
          sleepText = `  •  💤 <t:${Math.floor(sleepEnd / 1000)}:R>`;
        }
      }

      embed.addFields(
        {
          name: '\u200b',
          value: `${statusValue}  •  ${volumeValue}  •  ${loopValue}  •  📋 ${pm.queueSize} tracks`,
          inline: false,
        },
        {
          name: '\u200b',
          value: `📻 Radio: ${autoplay}${sleepText}`,
          inline: false,
        }
      );

      // Next Track Preview
      const nextTracks = player.queue.tracks;
      if (nextTracks && nextTracks.length > 0) {
        const next = nextTracks[0];
        // Ensure next track URL is also valid
        let nextUri = next.requester?.originalUri || next.userData?.originalUri || next.info?.uri || '';

        let nextValue = '';
        if (nextUri && (nextUri.startsWith('http') || nextUri.startsWith('https'))) {
          nextValue = `[${this.escapeMarkdown(next.info.title)}](${nextUri})`;
        } else {
          nextValue = `**${this.escapeMarkdown(next.info.title)}**`;
        }

        embed.addFields({
          name: 'Next Up',
          value: nextValue,
          inline: false
        });
      }

      const source = track.requester?.originalSource || track.userData?.originalSource || track.info?.sourceName || 'Unknown';
      const isSpotify = source.toLowerCase() === 'spotify' || (track.info?.uri?.includes('spotify.com'));

      const footerText = isSpotify ? `SPOTIFY • TymeeMusic` : `${source.toUpperCase()} • TymeeMusic`;

      embed.setFooter({
        text: footerText,
        iconURL: isSpotify ? 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/19/Spotify_logo_without_text.svg/1024px-Spotify_logo_without_text.svg.png' : (guild?.iconURL() || undefined)
      });

      // If Spotify, we can also set the color to Spotify green
      if (isSpotify) {
        embed.setColor(0x1DB954); // Spotify Green
      }
    } else {
      embed.setDescription(`${emojis.idle} No track is currently playing.`);
    }

    return embed;
  }
}

