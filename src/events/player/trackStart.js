
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
    // 🆔 EXECUTION SEQUENCE: Ensure only the latest track start event for this guild is processed
    const trackExecutionId = Math.random().toString(36).substring(7);
    player.set('latestTrackExecutionId', trackExecutionId);

    // 🛑 HARD RESET: Kill all memory-resident heartbeats for this guild
    EventUtils.clearHeartbeat(player.guildId);

    try {
      if (!track || !track.info) {
        logger.error('TrackStart', 'Invalid track data received:', track);
      }

      // Get guild and emoji manager for custom emoji support
      const currentGuild = player.guildId ? client.guilds.cache.get(player.guildId) : null;
      const emojiManager = client.emojiManager || null;

      // Pass guild and emojiManager for custom emoji resolution
      await VoiceChannelStatus.setNowPlaying(client, player.voiceChannelId, track, currentGuild, emojiManager);

      // 📚 HISTORY TRACKING: Maintain a rolling history for Smart Discovery
      const history = player.get('trackHistory') || [];
      if (!history.find(t => t.info?.identifier === track.info?.identifier)) {
        history.unshift(track);
        if (history.length > 5) history.pop();
        player.set('trackHistory', history);
      }
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

          // Log to playlist system history for "Recently Played" and "Top Tracks"
          if (client.playlistManager) {
            client.playlistManager.db.logPlay(track, track.requester.id, player.guildId);
          }
        } catch (historyError) {
          logger.error('TrackStart', 'Error adding track to history:', historyError);
        }
      }

      // 1. PERSISTENT MESSAGE PATTERN (Anti-Spam)
      const oldMessageId = player.get('nowPlayingMessageId');
      const oldChannelId = player.get('nowPlayingChannelId');

      let message;
      let existingMessage = null;

      if (oldMessageId && oldChannelId) {
        try {
          // AGGRESSIVE FETCH: Don't rely on cache as it causes duplicate embeds
          const oldChannel = client.channels.cache.get(oldChannelId) || await client.channels.fetch(oldChannelId).catch(() => null);
          if (oldChannel) {
            existingMessage = await oldChannel.messages.fetch(oldMessageId).catch(() => null);
          }
        } catch (e) {
          logger.debug('TrackStart', 'Failed to fetch existing message by ID');
        }
      }

      // 🕵️ GHOST HUNTER: Scan channel pins or recent messages for any leftover player embeds to adopt
      if (!existingMessage) {
        try {
          const voiceId = player.voiceChannelId;
          const targetChannelId = voiceId || player.textChannelId;
          const targetChannel = client.channels.cache.get(targetChannelId) || await client.channels.fetch(targetChannelId).catch(() => null);

          if (targetChannel && targetChannel.isTextBased()) {
            // Priority 1: Check Pinned Messages (the standard for our player)
            const pins = await targetChannel.messages.fetchPinned().catch(() => []);
            let ghostPin = pins.find(m => m.author.id === client.user.id && (m.embeds.length > 0 || m.attachments.size > 0));

            // Priority 2: Check Recent Messages (scan deeper - 20 messages)
            if (!ghostPin) {
              const recent = await targetChannel.messages.fetch({ limit: 20 }).catch(() => []);
              ghostPin = recent.find(m => m.author.id === client.user.id && (m.embeds.length > 0 || m.attachments.size > 0));
            }

            if (ghostPin) {
              logger.debug('TrackStart', `Adopting ghost embed for session: ${ghostPin.id}`);
              existingMessage = ghostPin;
              player.set('nowPlayingMessageId', ghostPin.id);
              player.set('nowPlayingChannelId', ghostPin.channel.id);
            } else {
              // 🧹 PRE-EMPTIVE CLEANUP: If we can't find one to adopt, sweep ANY leftovers before sending new
              // This acts as a physical barrier against double-embeds
              await EventUtils.forceCleanupPlayerUI(client, player, targetChannelId);
            }
          }
        } catch (pinError) {
          logger.debug('TrackStart', 'Error searching for ghost pins');
        }
      }

      const useEmbedPlayer = process.env.USE_EMBED_PLAYER !== 'false';
      const pm = new PlayerManager(player);

      let messageOptions = {};



      if (useEmbedPlayer) {
        try {
          // 🔥 DEV: Smart Hot-Reload
          if (!global.cachedDiscordPlayerEmbed || Date.now() - (global.lastEmbedReload || 0) > 10000) {
            const { DiscordPlayerEmbed: FreshClass } = await import(`../../utils/DiscordPlayerEmbed.js?v=${Date.now()}`);
            global.cachedDiscordPlayerEmbed = FreshClass;
            global.lastEmbedReload = Date.now();
          }

          const DiscordPlayerEmbed = global.cachedDiscordPlayerEmbed;
          const embed = await DiscordPlayerEmbed.createPlayerEmbedAsync(pm, currentGuild, null, client, track);
          
          // EXTRACT GENERATED IMAGE
          const files = embed.file ? [embed.file] : [];

          const components = await createControlComponents(player.guildId, client);
          messageOptions = { embeds: [embed], components, files: files, content: null };
        } catch (embedError) {
          logger.error('TrackStart', 'Error creating embed player:', embedError);
          const musicCard = new MusicCard();
          const buffer = await musicCard.createMusicCard(track, player.position, player.guildId, { requester: track.requester, queueSize: player.queue?.length ?? player.queueSize ?? 0 });
          const attachment = new AttachmentBuilder(buffer, { name: 'tymee-nowplaying.png' });
          const components = await createControlComponents(player.guildId, client);
          messageOptions = { files: [attachment], components, embeds: [], content: null };
        }
      } else {
        const musicCard = new MusicCard();
        const buffer = await musicCard.createMusicCard(track, player.position, player.guildId, { requester: track.requester, queueSize: player.queue?.length ?? player.queueSize ?? 0 });
        const attachment = new AttachmentBuilder(buffer, { name: 'tymee-nowplaying.png' });
        const components = await createControlComponents(player.guildId, client);
        messageOptions = { files: [attachment], components, embeds: [], content: null };
      }

      // 🔄 FORCE RESEND: Always delete old message and send a new one
      // This ensures the player stays at the bottom of the chat as requested
      if (existingMessage) {
        try {
          if (existingMessage.pinned) await existingMessage.unpin().catch(() => { });
          await existingMessage.delete().catch(() => { });
        } catch (cleanupError) {
          // Ignore delete errors (msg might already be gone)
        }
        existingMessage = null;
      }

      if (!existingMessage) {
        message = await EventUtils.sendPlayerMessage(client, player, messageOptions);
        
        // 🖼️ CACHE PERMANENT URL (To stop flickering in edits)
        if (message && message.embeds[0]?.image?.url && player.cachedCard) {
            player.cachedCard.url = message.embeds[0].image.url;
        }

        if (message?.id) {
          // IMMEDIATELY SAVE to prevent race condition
          player.set('nowPlayingMessageId', message.id);
          player.set('nowPlayingChannelId', message.channel.id);

          // Pin it and delete the system "pinned a message" notification
          if (message.pinnable) {
            await message.pin().catch(() => { });

            // Aggressive cleanup of the "pinned a message" notification
            setTimeout(async () => {
              try {
                const messages = await message.channel.messages.fetch({ limit: 10 });
                const systemMsg = messages.find(m => (m.type === 6 || m.type === 21) && m.author.id === client.user.id);
                if (systemMsg) await systemMsg.delete().catch(() => { });
              } catch (e) { }
            }, 1500);
          }
        }
      }

      // 🛡️ LATEST CHECK: If a newer track has already taken over, STOP here
      if (player.get('latestTrackExecutionId') !== trackExecutionId) {
        logger.debug('TrackStart', `Skipping metadata update - trackExecutionId mismatch for guild ${player.guildId}`);
        return;
      }

      // Start the update interval only if a message was successfully sent/edited
      if (message?.id) {
        startPlayerUpdateInterval(client, player);
      }

      logger.info('TrackStart', `Track started: "${track.info.title}" by ${track.info.author} in guild ${player.guildId}`);

      if (client.webServer) {
        client.webServer.updatePlayerState(player.guildId);
      }
    } catch (error) {
      logger.error('TrackStart', 'Error in trackStart event:', error);
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
  const apiKey = client.webServer?.apiKey;
  const webHost = client.webServer?.host || 'localhost';
  const dashboardUrl = `${protocol}://${webHost}:${webPort}?g=${guildId}`;

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
  // 🎟️ HEARTBEAT TOKEN: Unique identifier for this specific interval session
  const heartbeatToken = Math.random().toString(36).substring(7);
  player.set('activeHeartbeatToken', heartbeatToken);

  const messageId = player.get('nowPlayingMessageId');
  const channelId = player.get('nowPlayingChannelId');
  const trackId = player.queue?.current?.info?.identifier || player.queue?.current?.identifier;

  if (!messageId || !channelId || !trackId) return;

  let lastPosition = -1;
  const UPDATE_FREQ = 1500;

  const intervalId = setInterval(async () => {
    try {
      // 🛡️ HEARTBEAT TOKEN CHECK: If a newer heartbeat was issued (new track), kill this one.
      if (player.get('activeHeartbeatToken') !== heartbeatToken) {
        EventUtils.clearHeartbeat(player.guildId);
        return;
      }

      // 🛡️ REUSE PROTECTION: If a different message is now active, die.
      if (player.get('nowPlayingMessageId') !== messageId) {
        EventUtils.clearHeartbeat(player.guildId);
        return;
      }

      const currentTrackId = player.queue?.current?.info?.identifier || player.queue?.current?.identifier;
      if (trackId !== currentTrackId) {
        EventUtils.clearHeartbeat(player.guildId);
        return;
      }

      const currentPos = player.position || 0;
      const duration = player.queue?.current?.info?.duration || 0;

      // SAFETY: Don't update if we've exceeded the track duration (prevents ghost playing)
      if (duration > 0 && currentPos > duration + 5000) {
        EventUtils.clearHeartbeat(player.guildId);
        return;
      }

      // Optimization: Only update UI every 1.5s
      const pm = new PlayerManager(player);
      if (!player.paused && Math.abs(currentPos - lastPosition) >= UPDATE_FREQ) {
        await updatePlayerMessageEmbed(client, pm);
        lastPosition = currentPos;
      } else if (player.paused && lastPosition !== -2) {
        await updatePlayerMessageEmbed(client, pm);
        lastPosition = -2;
      }
    } catch (error) {
      if (error.code === 10008 || error.code === 10003) {
        EventUtils.clearHeartbeat(player.guildId);
      }
    }
  }, UPDATE_FREQ);

  // 📦 REGISTER: Store in physical memory map
  EventUtils.registerHeartbeat(player.guildId, intervalId);
}
