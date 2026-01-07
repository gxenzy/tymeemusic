import { ActivityType } from "discord.js";
import { logger } from "#utils/logger";
import { config } from "#config/config";
import { db } from "#database/DatabaseManager";
import { PlayerManager } from "#managers/PlayerManager";
import fs from "fs";
import path from "path";
import { AttachmentBuilder } from "discord.js";

export default {
  name: "clientReady",
  once: true,
  async execute(client) {
    logger.info("Bot", "Scheduling database backups every 30 minutes");

    const { user, guilds } = client;
    logger.success("Bot", `Logged in as ${user.tag}`);
    logger.info("Bot", `Serving ${guilds.cache.size} guilds`);

    logger.info(
      "Bot",
      "Waiting 5 seconds for Lavalink to be ready before initializing music services...",
    );
    setTimeout(async () => {
      // Ensure Lavalink is ready
      const lavalinkReady = await waitForLavalink(client);
      if (lavalinkReady) {
        // 1. Restore previous sessions (resuming playback)
        if (client.music) {
          await client.music.restorePlayerSessions();
        }

        // 2. Initialize 24/7 Mode if enabled
        if (config.features.stay247) {
          // Note: initialize247Mode checks waitForLavalink again internally, which is fine
          await initialize247Mode(client);

          setInterval(
            () => check247Connections(client),
            config.player.stay247.checkInterval,
          );
        }
      }
    }, 5000);

    const updateStatus = () => {
      user.setActivity({
        name: config.status.name,
        type: getStatusType(config.status.type),
      });
    };

    updateStatus();
    setInterval(updateStatus, 10 * 60 * 1000);
    user.setStatus(config.status.status || "dnd");

    // Start dynamic status updates showing current playing track
    startChannelStatusUpdate(client);

  },
};

function getStatusType(type) {
  const types = {
    PLAYING: ActivityType.Playing,
    STREAMING: ActivityType.Streaming,
    LISTENING: ActivityType.Listening,
    WATCHING: ActivityType.Watching,
    COMPETING: ActivityType.Competing,
    CUSTOM: ActivityType.Custom,
  };
  return types[type] || ActivityType.Custom;
}

async function waitForLavalink(client, maxAttempts = 30) {
  logger.info("247Mode", "Checking Lavalink connection status...");

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      if (client.music && client.music.lavalink) {
        const nodes = client.music.lavalink.nodeManager.nodes;

        if (nodes) {
          logger.success(
            "247Mode",
            `Lavalink ready! ${nodes.length} node(s) connected`,
          );
          return true;
        }
      }

      logger.debug(
        "247Mode",
        `Lavalink not ready yet, attempt ${attempt}/${maxAttempts}`,
      );
      await new Promise((resolve) => setTimeout(resolve, 1000));
    } catch (error) {
      logger.warn(
        "247Mode",
        `Error checking Lavalink status (attempt ${attempt}):${error.message}`,
      );
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  logger.error("247Mode", "Lavalink failed to connect within timeout period");
  return false;
}

async function initialize247Mode(client) {
  try {
    const lavalinkReady = await waitForLavalink(client);
    if (!lavalinkReady) {
      logger.error(
        "247Mode",
        "Cannot initialize 24/7 mode - Lavalink not available",
      );
      return;
    }

    const guilds247 = db.guild.getValid247Guilds();
    logger.info(
      "247Mode",
      `Found ${guilds247.length} guilds with valid 24/7 configuration`,
    );

    if (guilds247.length === 0) {
      logger.info("247Mode", "No guilds with 24/7 mode enabled");
      return;
    }

    const connectionPromises = guilds247.map((guildData, index) => {
      return new Promise((resolve) => {
        setTimeout(async () => {
          try {
            await connect247Guild(client, guildData);
            resolve();
          } catch (error) {
            logger.error(
              "247Mode",
              `Failed to connect guild ${guildData.id}:`,
              error,
            );
            resolve();
          }
        }, index * 2000);
      });
    });

    await Promise.all(connectionPromises);
    logger.success("247Mode", "24/7 mode initialization completed");
  } catch (error) {
    logger.error("247Mode", "Failed to initialize 247 mode:", error);
  }
}

async function connect247Guild(client, guildData) {
  try {
    const guild = client.guilds.cache.get(guildData.id);
    if (!guild) {
      logger.warn(
        "247Mode",
        `Guild ${guildData.id} not found, removing from 24/7 list`,
      );
      db.guild.set247Mode(guildData.id, false);
      return;
    }

    const voiceChannel = guild.channels.cache.get(
      guildData.stay_247_voice_channel,
    );
    if (!voiceChannel || voiceChannel.type !== 2) {
      logger.warn(
        "247Mode",
        `Invalid voice channel for guild ${guild.name}, disabling 24/7 mode`,
      );
      db.guild.set247Mode(guild.id, false);
      return;
    }

    let textChannel = null;
    if (guildData.stay_247_text_channel) {
      textChannel = guild.channels.cache.get(guildData.stay_247_text_channel);
      if (!textChannel || (textChannel.type !== 0 && textChannel.type !== 5)) {
        logger.warn(
          "247Mode",
          `Invalid text channel for guild ${guild.name}, using voice channel as fallback`,
        );
        textChannel = voiceChannel;
      }
    } else {
      textChannel = voiceChannel;
    }

    const existingPlayer = client.music?.getPlayer(guild.id);
    if (existingPlayer && existingPlayer.voiceChannelId) {
      logger.debug(
        "247Mode",
        `Player already exists for guild ${guild.name}, updating 24/7 flags`,
      );
      existingPlayer.set("247Mode", true);
      existingPlayer.set("247VoiceChannel", voiceChannel.id);
      existingPlayer.set("247TextChannel", textChannel.id);
      return;
    }

    const botMember = guild.members.cache.get(client.user.id);
    if (!voiceChannel.permissionsFor(botMember).has(["Connect", "Speak"])) {
      logger.warn(
        "247Mode",
        `Missing permissions for voice channel ${voiceChannel.name} in guild ${guild.name}`,
      );
      return;
    }

    logger.info(
      "247Mode",
      `Connecting to 24/7 channel ${voiceChannel.name} in guild ${guild.name}`,
    );

    const player = await client.music.createPlayer({
      guildId: guild.id,
      textChannelId: textChannel.id,
      voiceChannelId: voiceChannel.id,
      selfMute: false,
      selfDeaf: true,
      volume: db.guild.getDefaultVolume(guild.id),
    });

    if (player) {
      player.set("247Mode", true);
      player.set("247VoiceChannel", voiceChannel.id);
      player.set("247TextChannel", textChannel.id);
      player.set("247LastConnected", Date.now());
    }

    logger.success(
      "247Mode",
      `Connected to 24/7 channel ${voiceChannel.name} in guild ${guild.name}`,
    );
  } catch (error) {
    logger.error(
      "247Mode",
      `Error connecting 24/7 for guild ${guildData.id}:`,
      error,
    );
  }
}

async function check247Connections(client) {
  try {
    const guilds247 = db.guild.getValid247Guilds();

    for (const guildData of guilds247) {
      try {
        await checkSingle247Connection(client, guildData);
      } catch (error) {
        logger.error("247Mode", `Error checking guild ${guildData.id}:`, error);
      }
    }
  } catch (error) {
    logger.error("247Mode", "Error in 247 connection check:", error);
  }
}

async function checkSingle247Connection(client, guildData) {
  const guild = client.guilds.cache.get(guildData.id);
  if (!guild) {
    logger.warn(
      "247Mode",
      `Guild ${guildData.id} not found, disabling 24/7 mode`,
    );
    db.guild.set247Mode(guildData.id, false);
    return;
  }

  const voiceChannel = guild.channels.cache.get(
    guildData.stay_247_voice_channel,
  );
  if (!voiceChannel || voiceChannel.type !== 2) {
    logger.warn(
      "247Mode",
      `Voice channel ${guildData.stay_247_voice_channel} no longer exists in guild ${guild.name}`,
    );
    db.guild.set247Mode(guild.id, false);
    return;
  }

  const player = client.music?.getPlayer(guild.id);

  if (
    !player ||
    !player.voiceChannelId ||
    player.voiceChannelId !== voiceChannel.id
  ) {
    logger.info(
      "247Mode",
      `Reconnecting to 24/7 channel ${voiceChannel.name} in guild ${guild.name}`,
    );

    try {
      if (
        player &&
        player.voiceChannelId &&
        player.voiceChannelId !== voiceChannel.id
      ) {
        await player.destroy();
      }

      let textChannel = guild.channels.cache.get(
        guildData.stay_247_text_channel,
      );
      if (!textChannel || (textChannel.type !== 0 && textChannel.type !== 5)) {
        textChannel = voiceChannel;
      }

      const newPlayer = await client.music.createPlayer({
        guildId: guild.id,
        textChannelId: textChannel.id,
        voiceChannelId: voiceChannel.id,
        selfMute: false,
        selfDeaf: true,
        volume: db.guild.getDefaultVolume(guild.id),
      });

      if (!newPlayer) {
        logger.error("247Mode", `Failed to create player for guild ${guild.name}`);
        return;
      }

      newPlayer.set("247Mode", true);
      newPlayer.set("247VoiceChannel", voiceChannel.id);
      newPlayer.set("247TextChannel", textChannel.id);
      newPlayer.set("247LastReconnected", Date.now());

      logger.success(
        "247Mode",
        `Reconnected to 24/7 channel ${voiceChannel.name} in guild ${guild.name}`,
      );
    } catch (error) {
      logger.error(
        "247Mode",
        `Failed to reconnect 24/7 in guild ${guild.name}:`,
        error,
      );
    }
  } else {
    player.set("247Mode", true);
    player.set("247VoiceChannel", voiceChannel.id);
    if (guildData.stay_247_text_channel) {
      player.set("247TextChannel", guildData.stay_247_text_channel);
    }
  }
}

// Function to auto-update channel status with current song
function startChannelStatusUpdate(client) {
  let currentPlayerIndex = 0;

  // Update every 30 seconds
  setInterval(async () => {
    try {
      logger.debug('ChannelStatus', 'Starting status update check...');

      // Get all players that are currently playing
      const activePlayers = [];

      // Use the correct path to access players
      const players = client.music?.lavalink?.players;
      if (!players) {
        logger.debug('ChannelStatus', 'No players collection found');
        return;
      }

      logger.debug('ChannelStatus', `Found ${players.size || 0} total players`);

      for (const [guildId, player] of players) {
        try {
          const pm = new PlayerManager(player);
          logger.debug('ChannelStatus', `Player ${guildId}: playing=${pm.isPlaying}, hasTrack=${!!pm.currentTrack}, paused=${pm.isPaused}`);

          if (pm.isPlaying && pm.currentTrack && !pm.isPaused) {
            activePlayers.push({
              guildId,
              player,
              pm,
              track: pm.currentTrack
            });
            logger.debug('ChannelStatus', `Added active player for guild ${guildId}`);
          }
        } catch (playerError) {
          logger.warn('ChannelStatus', `Error processing player for guild ${guildId}: ${playerError.message}`);
        }
      }

      logger.debug('ChannelStatus', `Found ${activePlayers.length} active players`);

      if (activePlayers.length === 0) {
        // No active players, reset status to default
        client.user.setActivity({
          name: config.status.name,
          type: getStatusType(config.status.type),
        });
        currentPlayerIndex = 0; // Reset index
        return;
      }

      // Rotate through active players
      if (currentPlayerIndex >= activePlayers.length) {
        currentPlayerIndex = 0;
      }

      const currentPlayer = activePlayers[currentPlayerIndex];
      const track = currentPlayer.track;
      const sourceName = track.info.sourceName?.toLowerCase() || 'music';

      // Get platform emoji
      const platformEmoji = getPlatformEmoji(sourceName);

      // Create status text with better formatting
      const title = track.info.title || 'Unknown Track';
      const author = track.info.author || 'Unknown Artist';

      // Format: "emoji Song Title - Artist"
      const fullText = `${title} - ${author}`;

      // Truncate if too long, but keep it readable
      const maxLength = 50 - platformEmoji.length - 3; // Account for emoji and spaces
      const truncatedText = fullText.length > maxLength
        ? fullText.substring(0, maxLength - 3) + '...'
        : fullText;

      // Actually set the activity to show the current track
      const statusText = `${platformEmoji} ${truncatedText}`;
      client.user.setActivity({
        name: statusText,
        type: ActivityType.Listening,
      });

      logger.debug('ChannelStatus', `Updated status to: ${statusText}`);

      // Move to next player for next update
      currentPlayerIndex = (currentPlayerIndex + 1) % activePlayers.length;

    } catch (error) {
      logger.error('ChannelStatus', 'Error updating channel status:', error);
      // Fallback to default status
      try {
        client.user.setActivity({
          name: config.status.name,
          type: getStatusType(config.status.type),
        });
      } catch (fallbackError) {
        logger.error('ChannelStatus', 'Error setting fallback status:', fallbackError);
      }
    }
  }, 30000); // Update every 30 seconds
}

// Helper function to get platform emoji
function getPlatformEmoji(sourceName) {
  const emojiMap = {
    'youtube': '📺',
    'spotify': '🎵',
    'soundcloud': '☁️',
    'applemusic': '🍎',
    'deezer': '🎧',
    'tidal': '🌊',
    'bandcamp': '🎸',
    'twitch': '📺',
    'radio': '📻',
    'local': '💿',
    'http': '🌐',
    'unknown': '🎵'
  };

  return emojiMap[sourceName] || emojiMap.unknown;
}
