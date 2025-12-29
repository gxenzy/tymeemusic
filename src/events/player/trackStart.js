import { VoiceChannelStatus } from "#utils/VoiceChannelStatus";
import { logger } from "#utils/logger";

export default {
  name: "trackStart",
  once: false,
  async execute(player, track, payload, musicManager, client) {
    try {
      if (!track || !track.info) {
        logger.error('TrackStart', 'Invalid track data received:', track);
      }

      try {
        await VoiceChannelStatus.setNowPlaying(client, player.voiceChannelId, track);
      } catch (statusError) {
        logger.debug('TrackStart', `VoiceChannel status update failed: ${statusError.message}`);
      }

      player.set('lastPlayedTrack', track);

      if (!player.get('sessionStartTime')) {
        player.set('sessionStartTime', Date.now());
        player.set('totalTracksPlayed', 0);
      }

      const currentCount = player.get('totalTracksPlayed') || 0;
      player.set('totalTracksPlayed', currentCount + 1);

      if (track.requester?.id && track.info?.identifier) {
        try {
          logger.debug('TrackStart', `Adding to history: ${JSON.stringify({
            userId: track.requester.id,
            trackInfo: {
              identifier: track.info.identifier,
              title: track.info.title,
              author: track.info.author,
              uri: track.info.uri,
           },
          })}`);

          db.user.addTrackToHistory(track.requester.id, track.info);
        } catch (historyError) {
          logger.error('TrackStart', 'Error adding track to history:', historyError);
        }
      }

      let message;

      // Use embed-based player for interactive dashboard-like experience
      const useEmbedPlayer = process.env.USE_EMBED_PLAYER !== 'false'; // Default to true
      
      if (useEmbedPlayer) {
        try {
          const pm = new PlayerManager(player);
          const guild = client.guilds.cache.get(player.guildId);
          const embed = DiscordPlayerEmbed.createPlayerEmbed(pm, guild);
          const components = createControlComponents(player.guildId, client);

          message = await EventUtils.sendPlayerMessage(client, player, {
            embeds: [embed],
            components,
          });
          
          // Start update interval for progress bar
          startPlayerUpdateInterval(client, player);
        } catch (embedError) {
          logger.error('TrackStart', 'Error creating embed player:', embedError);
          // Fallback to image card
          try {
            const musicCard = new MusicCard();
            const buffer = await musicCard.createMusicCard(track, player.position, player.guildId);
            const attachment = new AttachmentBuilder(buffer, { name: 'tymee-nowplaying.png' });
            const components = createControlComponents(player.guildId, client);

            message = await EventUtils.sendPlayerMessage(client, player, {
              files: [attachment],
              components,
            });
          } catch (cardError) {
            logger.error('TrackStart', 'Error creating music card:', cardError);
            const components = createControlComponents(player.guildId, client);
            message = await EventUtils.sendPlayerMessage(client, player, {
              content: `🎵 **Now Playing**\n**${track.info.title}** by **${track.info.author}**`,
              components,
            });
          }
        }
      } else {
        // Original image card method
        try {
          const musicCard = new MusicCard();
          const buffer = await musicCard.createMusicCard(track, player.position, player.guildId);
          const attachment = new AttachmentBuilder(buffer, { name: 'tymee-nowplaying.png' });
          const components = createControlComponents(player.guildId, client);

          message = await EventUtils.sendPlayerMessage(client, player, {
            files: [attachment],
            components,
          });
        } catch (cardError) {
          logger.error('TrackStart', 'Error creating music card:', cardError);
          const components = createControlComponents(player.guildId, client);
          message = await EventUtils.sendPlayerMessage(client, player, {
            content: `🎵 **Now Playing**\n**${track.info.title}** by **${track.info.author}**`,
            components,
          });
        }
      }

      if (message?.id) {
        player.set('nowPlayingMessageId', message.id);
        player.set('nowPlayingChannelId', player.textChannelId);
      }

      logger.info('TrackStart', `Track started: "${track.info.title}" by ${track.info.author} in guild ${player.guildId} (Autoplay: ${player.get('autoplayEnabled') ? 'ON' : 'OFF'})`);
      
      // Update web dashboard
      if (client.webServer) {
        client.webServer.updatePlayerState(player.guildId);
      }
    } catch (error) {
      logger.error('TrackStart', 'Error in trackStart event:', error);

      const title = track?.info?.title || track?.title || 'Unknown Track';
      const author = track?.info?.author || track?.author || 'Unknown Artist';

      try {
        if (track) {
          player.set('lastPlayedTrack', track);
        }

        const message = await EventUtils.sendPlayerMessage(client, player, {
          content: `🎵 **Now Playing**\n**${title}** by **${author}**`,
          components: createControlComponents(player.guildId, client),
        });

        if (message?.id) {
          player.set('nowPlayingMessageId', message.id);
          player.set('nowPlayingChannelId', player.textChannelId);
        }
      } catch (fallbackError) {
        logger.error('TrackStart', 'Even fallback message failed:', fallbackError);
      }
    }
  }
};

export function createControlComponents(guildId, client) {
  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId('music_controls_select')
    .setPlaceholder('Select an option...')
    .addOptions([
      {
        label: 'Shuffle Queue',
        description: 'Randomize the order of songs',
        value: 'shuffle',
      },
      {
        label: 'Loop: Off',
        description: 'No repeat',
        value: 'loop_off',
      },
      {
        label: 'Loop: Track',
        description: 'Repeat current song',
        value: 'loop_track',
      },
      {
        label: 'Loop: Queue',
        description: 'Repeat entire queue',
        value: 'loop_queue',
      },
      {
        label: 'Volume -20%',
        description: 'Decrease volume',
        value: 'volume_down',
      },
      {
        label: 'Volume +20%',
        description: 'Increase volume',
        value: 'volume_up',
      },
    ]);

  // Get web server URL for dashboard button
  const webPort = process.env.WEB_PORT || 3000;
  const apiKey = process.env.WEB_API_KEY || 'MTQ1Mzk3NDM1MjY5NjQ0Mjk1MQ';
  const defaultGuildId = '1386498859471077426';
  const dashboardUrl = `http://localhost:${webPort}?apiKey=${apiKey}&guildId=${guildId || defaultGuildId}`;

  const controlButtons = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('music_previous')
        .setEmoji('⏮️')
        .setLabel('Previous')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('music_pause')
        .setEmoji('⏸️')
        .setLabel('Pause')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('music_skip')
        .setEmoji('⏭️')
        .setLabel('Next')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('music_stop')
        .setEmoji('⏹️')
        .setLabel('Stop')
        .setStyle(ButtonStyle.Danger),
    );

  // Add dashboard button row
  const dashboardButton = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setLabel('🎛️ Open Dashboard')
        .setStyle(ButtonStyle.Link)
        .setURL(dashboardUrl),
    );

  return [
    new ActionRowBuilder().addComponents(selectMenu),
    controlButtons,
    dashboardButton,
  ];
}

// Function to update player embed periodically
function startPlayerUpdateInterval(client, player) {
  // Clear any existing interval
  const existingInterval = player.get('updateIntervalId');
  if (existingInterval) {
    clearInterval(existingInterval);
  }

  const messageId = player.get('nowPlayingMessageId');
  const channelId = player.get('nowPlayingChannelId');

  if (!messageId || !channelId) return;

  // Update every 3 seconds for smoother progress updates
  const intervalId = setInterval(async () => {
    try {
      const currentPlayer = client.music?.getPlayer(player.guildId);
      if (!currentPlayer) {
        clearInterval(intervalId);
        player.set('updateIntervalId', null);
        return;
      }

      const pm = new PlayerManager(currentPlayer);
      const guild = client.guilds.cache.get(player.guildId);

      // Update if there's a current track (even if paused, to show correct time)
      if (pm.currentTrack) {
        // Get fresh position directly from Lavalink player with better fallback
        const freshPosition = currentPlayer.position ?? pm.position ?? 0;
        const freshPm = new PlayerManager(currentPlayer);

        // Create embed with current position
        const embed = DiscordPlayerEmbed.createPlayerEmbed(freshPm, guild, freshPosition);
        const components = createControlComponents(player.guildId, client);

        await EventUtils.editMessage(client, channelId, messageId, {
          embeds: [embed],
          components,
        });
      } else {
        // No track playing, stop updating
        clearInterval(intervalId);
        player.set('updateIntervalId', null);
      }
    } catch (error) {
      // Message might be deleted or inaccessible
      if (error.code === 10008 || error.code === 10003) {
        clearInterval(intervalId);
        player.set('updateIntervalId', null);
      } else {
        // Log other errors but continue
        logger.debug('TrackStart', `Error updating player embed: ${error.message}`);
      }
    }
  }, 3000); // Update every 3 seconds for smoother progress

  player.set('updateIntervalId', intervalId);
}
