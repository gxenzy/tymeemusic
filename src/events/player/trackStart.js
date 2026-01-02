
import { ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } from "discord.js";
import { logger } from "#utils/logger";
import { VoiceChannelStatus } from "#utils/VoiceChannelStatus";
import { EventUtils } from "#utils/EventUtils";
import { PlayerManager } from "#managers/PlayerManager";
import { DiscordPlayerEmbed } from "#utils/DiscordPlayerEmbed";
import { updatePlayerMessageEmbed } from "#events/discord/music/Playerbuttons";
import { db } from "#database/DatabaseManager";
import MusicCard from "#structures/classes/MusicCard";

export default {
  name: "trackStart",
  once: false,
  async execute(player, track, payload, musicManager, client) {
    try {
      if (!track || !track.info) {
        logger.error('TrackStart', 'Invalid track data received:', track);
      }

      // Get guild and emoji manager for custom emoji support
      const guild = player.guildId ? client.guilds.cache.get(player.guildId) : null;
      const emojiManager = client.emojiManager || null;

      // Pass guild and emojiManager for custom emoji resolution
      await VoiceChannelStatus.setNowPlaying(client, player.voiceChannelId, track, guild, emojiManager);

      player.set('lastPlayedTrack', track);

      if (!player.get('sessionStartTime')) {
        player.set('sessionStartTime', Date.now());
        player.set('totalTracksPlayed', 0);

        // Set session owner for permission system
        if (track.requester?.id) {
          try {
            const { PlayerPermissionManager } = await import("#managers/PlayerPermissionManager");
            PlayerPermissionManager.startSession(player.guildId, track.requester);
            logger.debug('TrackStart', `Session owner set to ${track.requester.tag || track.requester.id}`);
          } catch (permError) {
            logger.debug('TrackStart', 'Error setting session owner:', permError.message);
          }
        }
      }

      const currentCount = player.get('totalTracksPlayed') || 0;
      player.set('totalTracksPlayed', currentCount + 1);

      if (track.requester?.id && track.info?.identifier) {
        try {
          db.user.addTrackToHistory(track.requester.id, track.info);
          if (db.stats) {
            db.stats.addTrackPlay(player.guildId, track.requester.id, track.info);
          }
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
          const embed = await DiscordPlayerEmbed.createPlayerEmbedAsync(pm, guild, null, client);
          const components = await createControlComponents(player.guildId, client);

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
            const components = await createControlComponents(player.guildId, client);

            message = await EventUtils.sendPlayerMessage(client, player, {
              files: [attachment],
              components,
            });
          } catch (cardError) {
            logger.error('TrackStart', 'Error creating music card:', cardError);
            const components = await createControlComponents(player.guildId, client);
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
          const components = await createControlComponents(player.guildId, client);

          message = await EventUtils.sendPlayerMessage(client, player, {
            files: [attachment],
            components,
          });
        } catch (cardError) {
          logger.error('TrackStart', 'Error creating music card:', cardError);
          const components = await createControlComponents(player.guildId, client);
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

      logger.info('TrackStart', `Track started: "${track.info.title}" by ${track.info.author} in guild ${player.guildId}`);

      if (client.webServer) {
        client.webServer.updatePlayerState(player.guildId);
      }
    } catch (error) {
      logger.error('TrackStart', 'Error in trackStart event:', error);
      try {
        const title = track?.info?.title || track?.title || 'Unknown Track';
        const author = track?.info?.author || track?.author || 'Unknown Artist';
        const components = await createControlComponents(player.guildId, client);
        const message = await EventUtils.sendPlayerMessage(client, player, {
          content: `🎵 **Now Playing**\n**${title}** by **${author}**`,
          components,
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

export async function createControlComponents(guildId, client) {
  const guild = client.guilds.cache.get(guildId);
  const playerObj = client.music?.getPlayer(guildId);
  const pm = playerObj ? new PlayerManager(playerObj) : null;
  const emojiManager = client.emojiManager;

  const resolveEmoji = async (name, fallback) => {
    if (!emojiManager || !guildId) return fallback;
    return await emojiManager.resolveButtonEmoji(guildId, name);
  };

  const similarMenu = new StringSelectMenuBuilder()
    .setCustomId('music_similar_select')
    .setPlaceholder('🎵 Similar songs selection menu')
    .setMaxValues(1)
    .addOptions([
      {
        label: 'Find similar songs',
        description: 'Suggest similar songs for current track',
        value: 'similar_search',
        emoji: '🔍'
      },
    ]);

  const protocol = client.webServer?.secure ? 'https' : 'http';
  const webPort = client.webServer?.port || 3000;
  const apiKey = client.webServer?.apiKey || 'MTQ1Mzk3NDM1MjY5NjQ0Mjk1MQ';
  const webHost = client.webServer?.host || 'localhost';
  const dashboardUrl = `${protocol}://${webHost}:${webPort}?apiKey=${apiKey}&guildId=${guildId}`;

  const infoBtnLabel = pm ? `Queue: ${pm.queueSize} tracks` : 'Queue is empty';
  const infoButton = new ButtonBuilder()
    .setCustomId('music_queue_info')
    .setLabel(infoBtnLabel)
    .setEmoji('📋')
    .setStyle(ButtonStyle.Secondary);

  const dashboardButton = new ButtonBuilder()
    .setLabel('Dashboard')
    .setEmoji('🌐')
    .setStyle(ButtonStyle.Link)
    .setURL(dashboardUrl);

  const playEmoji = pm?.isPaused ? await resolveEmoji('play', '▶️') : await resolveEmoji('pause', '⏸️');
  const playLabel = pm?.isPaused ? 'Play' : 'Pause';
  const repeatActive = pm && pm.repeatMode && pm.repeatMode !== 'off';
  const repeatStyle = repeatActive ? ButtonStyle.Danger : ButtonStyle.Secondary;

  // Primary Controls
  const controlRow1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('music_previous')
      .setEmoji(await resolveEmoji('previous', '⏮️'))
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('music_pause')
      .setEmoji(playEmoji)
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('music_skip')
      .setEmoji(await resolveEmoji('skip', '⏭️'))
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('music_stop')
      .setEmoji(await resolveEmoji('stop', '⏹️'))
      .setStyle(ButtonStyle.Danger),
  );

  // Volume & Sync
  const controlRow2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('music_shuffle')
      .setEmoji(await resolveEmoji('shuffle', '🔀'))
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('music_repeat')
      .setEmoji(await resolveEmoji('loop', '🔁'))
      .setStyle(repeatStyle),
    new ButtonBuilder()
      .setCustomId('music_volume_down')
      .setEmoji(await resolveEmoji('volume_down', '🔉'))
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('music_volume_up')
      .setEmoji(await resolveEmoji('volume_up', '🔊'))
      .setStyle(ButtonStyle.Secondary),
  );

  // Tools & More
  const controlRow3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('music_favorite')
      .setEmoji(await resolveEmoji('heart', '❤️'))
      .setLabel('Save')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('music_effects')
      .setEmoji(await resolveEmoji('fx', '🎛️'))
      .setLabel('FX')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('music_lyrics')
      .setEmoji('📝')
      .setLabel('Lyrics')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('music_misc')
      .setEmoji('⚙️')
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

  if (!messageId || !channelId) return;

  let lastPosition = -1;
  const POSITION_THRESHOLD = 1500; // 1.5s

  const intervalId = setInterval(async () => {
    try {
      if (player.queue?.current || player.playing) {
        const currentPos = player.position || 0;

        if (!player.paused && Math.abs(currentPos - lastPosition) >= POSITION_THRESHOLD) {
          await updatePlayerMessageEmbed(client, new PlayerManager(player));
          lastPosition = currentPos;
        } else if (player.paused && lastPosition !== -2) {
          await updatePlayerMessageEmbed(client, new PlayerManager(player));
          lastPosition = -2;
        }
      } else {
        clearInterval(intervalId);
        player.set('updateIntervalId', null);
      }
    } catch (error) {
      if (error.code === 10008 || error.code === 10003) {
        clearInterval(intervalId);
        player.set('updateIntervalId', null);
      }
    }
  }, 1500);

  player.set('updateIntervalId', intervalId);
}
