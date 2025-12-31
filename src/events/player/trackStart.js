
import { ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } from "discord.js";
import { logger } from "#utils/logger";
import { VoiceChannelStatus } from "#utils/VoiceChannelStatus";
import { EventUtils } from "#utils/EventUtils";
import { PlayerManager } from "#managers/PlayerManager";
import { DiscordPlayerEmbed } from "#utils/DiscordPlayerEmbed";
import { db } from "#database/DatabaseManager";
import { emojiService } from "#services/EmojiService";
import MusicCard from "#structures/classes/MusicCard";

export default {
  name: "trackStart",
  once: false,
  async execute(player, track, payload, musicManager, client) {
    try {
      if (!track || !track.info) {
        logger.error('TrackStart', 'Invalid track data received:', track);
      }

      await VoiceChannelStatus.setNowPlaying(client, player.voiceChannelId, track);

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

      const useEmbedPlayer = process.env.USE_EMBED_PLAYER !== 'false';

      if (useEmbedPlayer) {
        try {
          const pm = new PlayerManager(player);
          const guild = client.guilds.cache.get(player.guildId);
          const embed = DiscordPlayerEmbed.createPlayerEmbed(pm, guild, null, client);
          const components = createControlComponents(player.guildId, client);

          message = await EventUtils.sendPlayerMessage(client, player, {
            embeds: [embed],
            components,
          });

          startPlayerUpdateInterval(client, player);
        } catch (embedError) {
          logger.error('TrackStart', 'Error creating embed player:', embedError);
          try {
            const musicCard = new MusicCard();
            const buffer = await musicCard.createMusicCard(track, player.position, player.guildId, { requester: track.requester, queueSize: player.queue?.length ?? player.queueSize ?? 0 });
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
        try {
          const musicCard = new MusicCard();
          const buffer = await musicCard.createMusicCard(track, player.position, player.guildId, { requester: track.requester, queueSize: player.queue?.length ?? player.queueSize ?? 0 });
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
  const guild = client.guilds.cache.get(guildId);
  const playerObj = client.music?.getPlayer(guildId);
  const pm = playerObj ? new PlayerManager(playerObj) : null;

  const similarMenu = new StringSelectMenuBuilder()
    .setCustomId('music_similar_select')
    .setPlaceholder('Similar songs selection menu')
    .setMaxValues(1)
    .addOptions([
      {
        label: 'Find similar songs',
        description: 'Suggest similar songs for current track',
        value: 'similar_search',
      },
    ]);

  const protocol = client.webServer?.secure ? 'https' : 'http';
  const webPort = client.webServer?.port || 3000;
  const apiKey = client.webServer?.apiKey || 'MTQ1Mzk3NDM1MjY5NjQ0Mjk1MQ';
  const defaultGuildId = '1386498859471077426';
  const webHost = client.webServer?.host || 'localhost';
  const dashboardUrl = `${protocol}://${webHost}:${webPort}?apiKey=${apiKey}&guildId=${guildId || defaultGuildId}`;

  const infoBtnLabel = pm ? `Queue: ${pm.queueSize} track${pm.queueSize !== 1 ? 's' : ''}` : 'Queue is empty, use /play to add songs.';
  const infoButton = new ButtonBuilder()
    .setCustomId('music_queue_info')
    .setLabel(infoBtnLabel)
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(true);

  const dashboardButton = new ButtonBuilder()
    .setLabel('Dashboard')
    .setStyle(ButtonStyle.Link)
    .setURL(dashboardUrl);

  const playEmoji = emojiService.getEmoji(guildId, pm?.isPaused ? 'play' : 'pause', guild, client);
  const playEmojiDisplay = pm?.isPaused ? 
    emojiService.getEmoji(guildId, 'play', guild, client) : 
    emojiService.getEmoji(guildId, 'pause', guild, client);
  const playLabel = pm?.isPaused ? 'Play' : 'Pause';
  const repeatActive = pm && pm.repeatMode && pm.repeatMode !== 'off';
  const repeatStyle = repeatActive ? ButtonStyle.Danger : ButtonStyle.Secondary;

  const controlRow1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('music_stop')
      .setEmoji(emojiService.getEmoji(guildId, 'stop', guild, client))
      .setLabel('Stop')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId('music_previous')
      .setEmoji(emojiService.getEmoji(guildId, 'previous', guild, client))
      .setLabel('Previous')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('music_pause')
      .setEmoji(playEmojiDisplay)
      .setLabel(playLabel)
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('music_skip')
      .setEmoji(emojiService.getEmoji(guildId, 'next', guild, client))
      .setLabel('Next')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('music_repeat')
      .setEmoji(emojiService.getEmoji(guildId, 'loop', guild, client))
      .setLabel('Repeat')
      .setStyle(repeatStyle),
  );

  const controlRow2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('music_volume_down')
      .setEmoji(emojiService.getEmoji(guildId, 'volume', guild, client))
      .setLabel('- Vol')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('music_seek_back')
      .setEmoji(emojiService.getEmoji(guildId, 'seek_back', guild, client))
      .setLabel('-10s')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('music_shuffle')
      .setEmoji(emojiService.getEmoji(guildId, 'shuffle', guild, client))
      .setLabel('Shuffle')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('music_seek_forward')
      .setEmoji(emojiService.getEmoji(guildId, 'seek_forward', guild, client))
      .setLabel('+10s')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('music_volume_up')
      .setEmoji(emojiService.getEmoji(guildId, 'volume', guild, client))
      .setLabel('+ Vol')
      .setStyle(ButtonStyle.Secondary),
  );

  const controlRow3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('music_favorite')
      .setEmoji(emojiService.getEmoji(guildId, 'favorite', guild, client))
      .setLabel('Save')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('music_effects')
      .setEmoji(emojiService.getEmoji(guildId, 'effects', guild, client))
      .setLabel('Effects')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('music_filter')
      .setEmoji(emojiService.getEmoji(guildId, 'filter', guild, client))
      .setLabel('Filter')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('music_move')
      .setEmoji(emojiService.getEmoji(guildId, 'move', guild, client))
      .setLabel('Move')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('music_misc')
      .setEmoji(emojiService.getEmoji(guildId, 'misc', guild, client))
      .setLabel('More')
      .setStyle(ButtonStyle.Secondary),
  );

  return [
    new ActionRowBuilder().addComponents(similarMenu),
    new ActionRowBuilder().addComponents(infoButton, dashboardButton),
    controlRow1,
    controlRow2,
    controlRow3,
  ];
}

function startPlayerUpdateInterval(client, player) {
  const existingInterval = player.get('updateIntervalId');
  if (existingInterval) {
    clearInterval(existingInterval);
  }

  const messageId = player.get('nowPlayingMessageId');
  const channelId = player.get('nowPlayingChannelId');

  if (!messageId || !channelId) {
    return;
  }

  let updateCount = 0;

  logger.info('TrackStart', 'Starting 3s auto update interval via updatePlayerMessageEmbed');

  const intervalId = setInterval(async () => {
    try {
      updateCount++;

      if (player.queue?.current) {
        logger.info('TrackStart', `Update #${updateCount}: calling updatePlayerMessageEmbed`);

        await updatePlayerMessageEmbed(client, player);
      } else {
        clearInterval(intervalId);
        player.set('updateIntervalId', null);
      }
    } catch (error) {
      logger.error('TrackStart', `Interval error:`, error);
      if (error.code === 10008 || error.code === 10003) {
        clearInterval(intervalId);
        player.set('updateIntervalId', null);
      }
    }
  }, 3000);

  player.set('updateIntervalId', intervalId);
}
