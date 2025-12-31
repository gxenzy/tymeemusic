import { StringSelectMenuBuilder, ActionRowBuilder } from 'discord.js';
import { config } from '#config/config';
import filters from '#config/filters';
import { logger } from '#utils/logger';
import { db } from '#database/DatabaseManager';

export async function handleButtonInteraction(interaction, pm, client) {
  const { customId } = interaction;
  let response = '';

  try {
    switch (customId) {
      case 'music_previous': {
        const ok = await pm.playPrevious();
        response = ok ? '⏮️ Playing previous track.' : '❌ No previous track available.';
        break;
      }

      case 'music_pause': {
        if (pm.isPaused) {
          await pm.resume();
          response = '▶️ Music resumed.';
        } else {
          await pm.pause();
          response = '⏸️ Music paused.';
        }
        break;
      }

      case 'music_skip': {
        const cur = pm.currentTrack;
        const title = cur?.info?.title || 'Unknown Track';
        await pm.skip();
        response = `⏭️ Skipped: ${title}`;
        break;
      }

      case 'music_stop': {
        await pm.stop();
        response = '⏹️ Music stopped and queue cleared.';
        break;
      }

      case 'music_shuffle': {
        if (pm.queueSize <= 1) {
          response = '❌ Not enough tracks in queue to shuffle.';
        } else {
          await pm.shuffleQueue();
          response = `🔀 Shuffled ${pm.queueSize} tracks.`;
        }
        break;
      }

      case 'music_repeat': {
        const nextMode = pm.repeatMode === 'off' ? 'queue' : pm.repeatMode === 'queue' ? 'track' : 'off';
        await pm.setRepeatMode(nextMode);
        response = `🔁 Repeat mode set to: ${nextMode}`;
        break;
      }

      case 'music_volume_down': {
        const newV = Math.max(0, pm.volume - 10);
        await pm.setVolume(newV);
        response = `🔉 Volume set to ${newV}%`;
        break;
      }

      case 'music_volume_up': {
        const newV = Math.min(100, pm.volume + 10);
        await pm.setVolume(newV);
        response = `🔊 Volume set to ${newV}%`;
        break;
      }

      case 'music_seek_back': {
        if (!pm.isSeekable) {
          response = '❌ This track is not seekable.';
        } else {
          const step = config.seekStep || 10000;
          const newPos = Math.max(0, pm.position - step);
          await pm.seek(newPos);
          response = `⏪ Seeked back to ${pm.formatDuration(newPos)}`;
        }
        break;
      }

      case 'music_seek_forward': {
        if (!pm.isSeekable) {
          response = '❌ This track is not seekable.';
        } else if (!pm.currentTrack?.info?.duration) {
          response = '❌ Cannot seek on this track.';
        } else {
          const step = config.seekStep || 10000;
          const newPos = Math.min(pm.currentTrack.info.duration, pm.position + step);
          await pm.seek(newPos);
          response = `⏩ Seeked forward to ${pm.formatDuration(newPos)}`;
        }
        break;
      }

      case 'music_favorite': {
        try {
          const t = pm.currentTrack;
          if (!t || !t.info) {
            response = '❌ No track is currently playing.';
            break;
          }
          const userId = interaction.user.id;
          let playlists = db.playlists.getUserPlaylists(userId);
          let fav = playlists.find(p => p.name === 'My Favorites');
          if (!fav) {
            fav = db.playlists.createPlaylist(userId, 'My Favorites', 'Auto-created favorites playlist');
            playlists = db.playlists.getUserPlaylists(userId);
          }
          const info = { identifier: t.info.identifier, title: t.info.title, author: t.info.author, uri: t.info.uri, duration: t.info.duration, sourceName: t.info.sourceName, artworkUrl: t.info.artworkUrl };
          try {
            db.playlists.addTrackToPlaylist(fav.id, userId, info);
            response = '💾 Saved current track to **My Favorites**';
          } catch (addErr) {
            if (addErr.message && addErr.message.includes('already exists')) {
              response = '⚠️ This track is already in your favorites.';
            } else {
              throw addErr;
            }
          }
        } catch (err) {
          logger.error('Playerbuttons', 'Error adding to favorites:', err);
          response = '❌ Failed to save to favorites.';
        }
        break;
      }

      case 'music_effects': {
        const options = [
          { label: '8D', value: 'eightD', description: 'Enable 8D audio effect' },
          { label: 'Nightcore', value: 'nightcore', description: 'Speed up and pitch up for nightcore' },
          { label: 'Tremolo', value: 'tremolo', description: 'Enable tremolo plugin effect' },
          { label: 'Vibrato', value: 'vibrato', description: 'Enable vibrato plugin effect' },
          { label: 'Karaoke', value: 'karaoke', description: 'Apply vocal removal' },
          { label: 'Clear Effects', value: 'clear', description: 'Remove all plugin effects' },
        ];
        const select = new StringSelectMenuBuilder().setCustomId('music_effects_select').setPlaceholder('Choose an effect to toggle').setOptions(options);
        await interaction.followUp({ components: [new ActionRowBuilder().addComponents(select)], ephemeral: true });
        response = '🎛️ Effects menu opened (ephemeral).';
        break;
      }

      case 'music_filter': {
        const names = filters.getNames().slice(0, 24);
        const opts = names.map(name => ({ label: name, value: name, description: `Apply ${name} audio preset` }));
        opts.unshift({ label: 'Reset filters', value: 'reset', description: 'Clear all audio filters' });
        const select = new StringSelectMenuBuilder().setCustomId('music_filters_select').setPlaceholder('Choose an audio filter').setOptions(opts);
        await interaction.followUp({ components: [new ActionRowBuilder().addComponents(select)], ephemeral: true });
        response = '🎚️ Opened filter menu (ephemeral).';
        break;
      }

      case 'music_move': {
        const queue = pm.player?.queue?.tracks || [];
        if (!queue || queue.length === 0) {
          response = '❌ Queue is empty, nothing to move.';
          break;
        }
        const options = queue.slice(0, 24).map((t, i) => ({ label: `${i + 1}. ${t.info?.title?.slice(0, 80) || 'Unknown'}`, value: `move_idx_${i}`, description: `${t.info?.author || 'Unknown'}`.slice(0, 100) }));
        const select = new StringSelectMenuBuilder().setCustomId('music_move_select').setPlaceholder('Select a track to move to the top').setOptions(options);
        await interaction.followUp({ components: [new ActionRowBuilder().addComponents(select)], ephemeral: true });
        response = '🚚 Select a queued track to move (ephemeral).';
        break;
      }

      default:
        response = '❌ Unknown control.';
    }

    await interaction.editReply({ content: response });
    // Defer embed update to existing implementation in Playerbuttons.js
    setTimeout(async () => {
      try {
        const mod = await import('./Playerbuttons.js');
        if (typeof mod.updatePlayerMessageEmbed === 'function') mod.updatePlayerMessageEmbed(client, pm);
      } catch (e) {
        // ignore
      }
    }, 500);
  } catch (err) {
    logger.error('Playerbuttons', 'Error handling button interaction:', err);
    try { await interaction.editReply({ content: '❌ An error occurred while processing your button interaction.' }); } catch {}
  }
}

export async function handleSelectMenuInteraction(interaction, pm, client) {
  const selectedValue = interaction.values?.[0];
  let response = '';

  try {
    if (interaction.customId === 'music_similar_results') {
      const idx = parseInt((selectedValue || '').replace('similar_add_', ''), 10);
      const suggestions = pm.player?.get('similarSuggestions') || [];
      const suggestion = suggestions[idx];

      if (!suggestion) {
        await interaction.editReply({ content: '❌ Invalid selection.' });
        return;
      }

      try {
        let added = false;
        if (suggestion.trackInfo) {
          await pm.addTracks(suggestion.trackInfo);
          added = true;
        } else {
          const query = `${suggestion.artist} ${suggestion.name}`;
          const searchResult = await client.music.search(query, { source: 'spsearch' });
          if (searchResult?.tracks?.length > 0) {
            await pm.addTracks(searchResult.tracks[0]);
            added = true;
          }
        }

        if (added) {
          await interaction.editReply({ content: `✅ Added **${suggestion.name}** by **${suggestion.artist}** to the queue.` });
        } else {
          await interaction.editReply({ content: '❌ Could not find that track to add.' });
        }

        try {
          const mod = await import('./Playerbuttons.js');
          if (typeof mod.updatePlayerMessageEmbed === 'function') mod.updatePlayerMessageEmbed(client, pm);
        } catch (e) {}

        if (client.webServer) client.webServer.updatePlayerState(pm.guildId);
      } catch (err) {
        logger.error('Playerbuttons', 'Error adding similar track:', err);
        await interaction.editReply({ content: '❌ Failed to add the selected track.' });
      }

      return;
    }

    if (interaction.customId === 'music_similar_select') {
      if (selectedValue === 'similar_search') {
        await interaction.editReply({ content: '🔍 Searching for similar songs...' });
        try {
          const current = pm.currentTrack;
          if (!current) return interaction.editReply({ content: '❌ No current track to find similar songs for.' });

          const recommendations = await import('#events/player/queueEnd').then(m => m.fetchRecommendations(current, client));
          if (!recommendations || recommendations.length === 0) return interaction.editReply({ content: '❌ No similar songs found.' });

          pm.player?.set('similarSuggestions', recommendations);

          const resultsMenu = new StringSelectMenuBuilder()
            .setCustomId('music_similar_results')
            .setPlaceholder('Select a similar song to add')
            .setMaxValues(1)
            .addOptions(
              recommendations.slice(0, 5).map((rec, i) => ({
                label: `${i + 1}. ${rec.name} - ${rec.artist}`.slice(0, 100),
                description: (rec.url || '').slice(0, 100),
                value: `similar_add_${i}`
              }))
            );

          await interaction.followUp({
            content: `🔍 Found ${recommendations.length} suggestions. Choose one to add to the queue (ephemeral).`,
            components: [new ActionRowBuilder().addComponents(resultsMenu)],
            ephemeral: true,
          });
          return;
        } catch (err) {
          logger.error('Playerbuttons', 'Error fetching similar songs:', err);
          return interaction.editReply({ content: '❌ Error searching for similar songs.' });
        }
      }
      return;
    }

    if (interaction.customId === 'music_filters_select') {
      const selected = selectedValue;
      if (selected === 'reset') {
        try {
          // Try to use filterManager if available
          if (pm.player.filterManager && typeof pm.player.filterManager.clearEQ === 'function') {
            await pm.player.filterManager.clearEQ();
          } else {
            await pm.player.set('eq', null);
          }
          await interaction.editReply({ content: '✅ Audio filters reset.' });
          try {
            const mod = await import('./Playerbuttons.js');
            if (typeof mod.updatePlayerMessageEmbed === 'function') mod.updatePlayerMessageEmbed(client, pm);
          } catch (e) {}
          if (client.webServer) client.webServer.updatePlayerState(pm.guildId);
        } catch (err) {
          logger.error('Playerbuttons', 'Error resetting filters:', err);
          await interaction.editReply({ content: '❌ Failed to reset filters.' });
        }
        return;
      }

      try {
        const bands = filters.get(selected, null);
        if (!bands) return interaction.editReply({ content: '❌ Unknown filter selected.' });
        if (pm.player.filterManager && typeof pm.player.filterManager.setEQ === 'function') {
          await pm.player.filterManager.setEQ(bands);
        } else {
          await pm.player.set('eq', bands);
        }
        await interaction.editReply({ content: `✅ Applied filter **${selected}**.` });
        try {
          const mod = await import('./Playerbuttons.js');
          if (typeof mod.updatePlayerMessageEmbed === 'function') mod.updatePlayerMessageEmbed(client, pm);
        } catch (e) {}
        if (client.webServer) client.webServer.updatePlayerState(pm.guildId);
      } catch (err) {
        logger.error('Playerbuttons', 'Error applying filter:', err);
        await interaction.editReply({ content: '❌ Failed to apply that filter.' });
      }
      return;
    }

    if (interaction.customId === 'music_move_select') {
      const val = selectedValue;
      const match = /^move_idx_(\d+)$/.exec(val);
      if (!match) return interaction.editReply({ content: '❌ Invalid selection.' });
      const fromIndex = parseInt(match[1], 10);
      try {
        await pm.moveTrack(fromIndex, 0);
        await interaction.editReply({ content: `✅ Moved track ${fromIndex + 1} to the top of the queue.` });
        try {
          const mod = await import('./Playerbuttons.js');
          if (typeof mod.updatePlayerMessageEmbed === 'function') mod.updatePlayerMessageEmbed(client, pm);
        } catch (e) {}
        if (client.webServer) client.webServer.updatePlayerState(pm.guildId);
      } catch (err) {
        logger.error('Playerbuttons', 'Error moving track:', err);
        await interaction.editReply({ content: '❌ Failed to move that track.' });
      }
      return;
    }

    if (interaction.customId === 'music_effects_select') {
      const effect = selectedValue;
      try {
        if (effect === 'clear') {
          if (typeof pm.player.filter === 'function') {
            await pm.player.filter('clear');
            await interaction.editReply({ content: '✅ Cleared audio effects.' });
          } else if (pm.player.filterManager && typeof pm.player.filterManager.clear === 'function') {
            await pm.player.filterManager.clear();
            await interaction.editReply({ content: '✅ Cleared audio effects.' });
          } else {
            await pm.player.set('effect', null);
            await interaction.editReply({ content: '✅ Cleared audio effects.' });
          }
        } else {
          if (typeof pm.player.filter === 'function') {
            await pm.player.filter(effect);
            await interaction.editReply({ content: `✅ Applied effect **${effect}**.` });
          } else if (pm.player.filterManager && typeof pm.player.filterManager.set === 'function') {
            await pm.player.filterManager.set(effect);
            await interaction.editReply({ content: `✅ Applied effect **${effect}**.` });
          } else {
            await pm.player.set('effect', effect);
            await interaction.editReply({ content: `✅ Applied effect **${effect}**.` });
          }
        }
        try {
          const mod = await import('./Playerbuttons.js');
          if (typeof mod.updatePlayerMessageEmbed === 'function') mod.updatePlayerMessageEmbed(client, pm);
        } catch (e) {}
        if (client.webServer) client.webServer.updatePlayerState(pm.guildId);
      } catch (err) {
        logger.error('Playerbuttons', 'Error toggling effect:', err);
        await interaction.editReply({ content: '❌ Failed to toggle that effect.' });
      }
      return;
    }

    switch (selectedValue) {
      case 'loop_off':
        await pm.setRepeatMode('off');
        response = '🔁 Loop disabled.';
        break;

      case 'loop_track':
        await pm.setRepeatMode('track');
        response = '🔂 Looping current track.';
        break;

      case 'loop_queue':
        await pm.setRepeatMode('queue');
        response = '🔁 Looping entire queue.';
        break;

      case 'volume_down':
        {
          const currentVolumeDown = pm.volume;
          const newVolumeDown = Math.max(0, currentVolumeDown - 20);
          await pm.setVolume(newVolumeDown);
          response = `🔉 Volume decreased to ${newVolumeDown}%`;
        }
        break;

      case 'volume_up':
        {
          const currentVolumeUp = pm.volume;
          const newVolumeUp = Math.min(100, currentVolumeUp + 20);
          await pm.setVolume(newVolumeUp);
          response = `🔊 Volume increased to ${newVolumeUp}%`;
        }
        break;

      default:
        response = '❌ Unknown option selected.';
        break;
    }

    await interaction.editReply({ content: response });

    try {
      const mod = await import('./Playerbuttons.js');
      if (typeof mod.updatePlayerMessageEmbed === 'function') mod.updatePlayerMessageEmbed(client, pm);
    } catch (e) {}

    if (client.webServer) {
      client.webServer.updatePlayerState(pm.guildId);
    }

  } catch (err) {
    logger.error('Playerbuttons', 'Error handling select menu interaction:', err);
    try {
      await interaction.editReply({ content: '❌ An error occurred while processing your selection.' });
    } catch {}
  }
}

import { DiscordPlayerEmbed } from '#utils/DiscordPlayerEmbed';

export async function updatePlayerMessageEmbed(client, pm) {
  try {
    const player = pm.player;
    const messageId = player.get('nowPlayingMessageId');
    const channelId = player.get('nowPlayingChannelId');

    if (messageId && channelId) {
      const guild = client.guilds.cache.get(pm.guildId);
      const currentPosition = pm.player?.position ?? pm.position ?? 0;
      const embed = DiscordPlayerEmbed.createPlayerEmbed(pm, guild, currentPosition, client);

      const channel = guild?.channels.cache.get(channelId);
      if (channel) {
        const message = await channel.messages.fetch(messageId).catch(() => null);
        if (message && message.embeds.length > 0) {
          await message.edit({ embeds: [embed] });
        }
      }
    }
  } catch (err) {
    // ignore
  }
}

export async function updateSelectMenuOptions(interaction, pm) {
  try {
    const originalMessage = await interaction.fetchReply();
    if (!originalMessage?.components?.length) return;

    const actionRow = originalMessage.components.find(row =>
      row.components?.some(component => component.customId === 'music_controls_select')
    );

    if (!actionRow) return;

    const selectMenu = actionRow.components.find(component => component.customId === 'music_controls_select');
    if (!selectMenu) return;

    const currentMode = pm.repeatMode;
    const updatedOptions = selectMenu.options.map(option => {
      if (option.value === 'loop_off') {
        return {
          ...option,
          label: currentMode === 'off' ? 'Loop: Off ✓' : 'Loop: Off',
          description: currentMode === 'off' ? 'Currently active' : 'No repeat'
        };
      } else if (option.value === 'loop_track') {
        return {
          ...option,
          label: currentMode === 'track' ? 'Loop: Track ✓' : 'Loop: Track',
          description: currentMode === 'track' ? 'Currently active' : 'Repeat current song'
        };
      } else if (option.value === 'loop_queue') {
        return {
          ...option,
          label: currentMode === 'queue' ? 'Loop: Queue ✓' : 'Loop: Queue',
          description: currentMode === 'queue' ? 'Currently active' : 'Repeat entire queue'
        };
      }
      return option;
    });

    selectMenu.options = updatedOptions;
    await originalMessage.edit({ components: originalMessage.components });
  } catch (error) {
    logger.error('InteractionCreate', 'Error updating select menu options:', error);
  }
}
