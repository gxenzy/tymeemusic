import { StringSelectMenuBuilder, ActionRowBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { config } from '#config/config';
import filters from '#config/filters';
import { logger } from '#utils/logger';
import { db } from '#database/DatabaseManager';

// Helper function to auto-dismiss messages after 5 seconds
function autoDismiss(interaction, delayMs = 5000) {
  setTimeout(() => {
    interaction.deleteReply().catch(() => { });
  }, delayMs);
}


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
          { label: '🎛️ Audio Effects', value: 'effects_menu', description: 'Bass, Treble, etc' },
          { label: '⏱️ Speed Control', value: 'speed_menu', description: 'Faster or slower' },
          { label: '🧹 Clear All', value: 'clear_filters', description: 'Reset all filters' },
        ];
        const select = new StringSelectMenuBuilder()
          .setCustomId('music_filters_select')
          .setPlaceholder('🎛️ Audio Tuning')
          .setOptions([
            { label: 'Bass Boost', value: 'bassboost', description: 'Bass boost', emoji: '🔊' },
            { label: 'Super Bass', value: 'superbass', description: 'Strong bass', emoji: '💥' },
            { label: 'Deep Bass', value: 'deepbass', description: 'Deep sub-bass', emoji: '🔉' },
            { label: 'Nightcore', value: 'nightcore', description: 'Fast & High Pitch', emoji: '🐿️' },
            { label: 'Vaporwave', value: 'vaporwave', description: 'Slow & Aesthetic', emoji: '📼' },
            { label: 'Pop', value: 'pop', description: 'Pop preset', emoji: '🎵' },
            { label: 'Rock', value: 'rock', description: 'Rock preset', emoji: '🎸' },
            { label: 'Gamng', value: 'gaming', description: 'Gaming mix', emoji: '🎮' },
            { label: 'Soft', value: 'soft', description: 'Soft & Mellow', emoji: '☁️' },
            { label: 'Clear Filters', value: 'reset', description: 'Reset all filters', emoji: '🧹' }
          ]);
        await interaction.followUp({ components: [new ActionRowBuilder().addComponents(select)], ephemeral: true });
        response = '🎛️ Audio effects menu opened.';
        break;
      }

      case 'music_lyrics': {
        try {
          if (!interaction.deferred && !interaction.replied) await interaction.deferReply({ ephemeral: true });

          const lyricsResult = await pm.getCurrentLyrics();
          if (!lyricsResult || (!lyricsResult.text && (!lyricsResult.lines || lyricsResult.lines.length === 0))) {
            await interaction.editReply({ content: '❌ No lyrics found for this song.' });
            return;
          }

          const hasSynced = lyricsResult.lines && lyricsResult.lines.length > 0;

          if (hasSynced) {
            // LIVE LYRICS MODE
            let isActive = true;
            let currentLineIndex = -1;

            const getLiveEmbed = (pos) => {
              const lines = lyricsResult.lines;
              let index = lines.findLastIndex(l => l.timestamp <= pos);
              if (index === -1) index = 0;

              if (index === currentLineIndex) return null; // No change
              currentLineIndex = index;

              const currentLine = lines[index];
              const upcoming = lines.slice(index + 1, index + 5);

              let desc = `### 🎤 **${currentLine.line}**\n\n`;
              upcoming.forEach(l => desc += `${l.line}\n`);

              return new EmbedBuilder()
                .setTitle(`🎶 Live Lyrics: ${lyricsResult.title}`)
                .setAuthor({ name: lyricsResult.artist })
                .setDescription(desc || '...')
                .setColor(0x00FFA3)
                .setThumbnail(lyricsResult.image || null)
                .setFooter({ text: `Source: LRCLIB • Real-time Sync` });
            };

            const initialEmbed = getLiveEmbed(pm.position);
            const msg = await interaction.editReply({ embeds: [initialEmbed] });

            const interval = setInterval(async () => {
              if (!isActive || !pm.isPlaying) {
                clearInterval(interval);
                return;
              }
              const embed = getLiveEmbed(pm.position);
              if (embed) {
                await interaction.editReply({ embeds: [embed] }).catch(() => { isActive = false; clearInterval(interval); });
              }
            }, 2000);

            // Stop after 5 mins or if track changes
            setTimeout(() => { isActive = false; clearInterval(interval); }, 300000);
            return;
          }

          // STATIC PAGINATION MODE
          const lyricsText = lyricsResult.text || lyricsResult.lines.map(l => l.line).join('\n');
          const chunkSize = 2048;
          const chunks = [];
          for (let i = 0; i < lyricsText.length; i += chunkSize) {
            chunks.push(lyricsText.substring(i, i + chunkSize));
          }

          if (chunks.length <= 1) {
            const embed = new EmbedBuilder()
              .setTitle(`📝 Lyrics: ${lyricsResult.title}`)
              .setAuthor({ name: lyricsResult.artist })
              .setDescription(chunks[0] || 'No lyrics available.')
              .setColor(0x00FFA3)
              .setThumbnail(lyricsResult.image || null)
              .setFooter({ text: `Source: ${lyricsResult.sourceName} | Provider: ${lyricsResult.provider}` });
            await interaction.editReply({ embeds: [embed] });
            return;
          }

          let currentPage = 0;
          const totalPages = chunks.length;

          const getLyricEmbed = (page) => {
            return new EmbedBuilder()
              .setTitle(`📝 Lyrics: ${lyricsResult.title} (Page ${page + 1}/${totalPages})`)
              .setAuthor({ name: lyricsResult.artist })
              .setDescription(chunks[page])
              .setColor(0x00FFA3)
              .setThumbnail(lyricsResult.image || null)
              .setFooter({ text: `Source: ${lyricsResult.sourceName} | Provider: ${lyricsResult.provider}` });
          };

          const getLyricButtons = (page) => {
            return new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId(`lyrics_btn_prev_${interaction.id}`)
                .setLabel('Previous')
                .setEmoji('⬅️')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(page === 0),
              new ButtonBuilder()
                .setCustomId(`lyrics_btn_next_${interaction.id}`)
                .setLabel('Next')
                .setEmoji('➡️')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(page === totalPages - 1)
            );
          };

          const initialMsg = await interaction.editReply({
            embeds: [getLyricEmbed(currentPage)],
            components: [getLyricButtons(currentPage)]
          });

          const collector = initialMsg.createMessageComponentCollector({
            filter: i => i.user.id === interaction.user.id && i.customId.startsWith(`lyrics_btn_`),
            time: 300000
          });

          collector.on('collect', async i => {
            if (i.customId.includes('prev')) currentPage--;
            else if (i.customId.includes('next')) currentPage++;

            await i.update({
              embeds: [getLyricEmbed(currentPage)],
              components: [getLyricButtons(currentPage)]
            });
          });

          return;
        } catch (error) {
          logger.error('Playerbuttons', 'Error fetching lyrics:', error);
          await interaction.editReply({ content: '❌ Failed to fetch lyrics.' }).catch(() => { });
          return;
        }
      }

      case 'music_misc': {
        const moreMenu = new StringSelectMenuBuilder()
          .setCustomId('music_more_menu')
          .setPlaceholder('⚙️ More Options')
          .addOptions([
            { label: '📋 View Full Queue', value: 'view_queue', description: 'Show all tracks', emoji: '📜' },
            { label: '📻 Radio Mode', value: 'toggle_autoplay', description: 'Autoplay similar songs', emoji: '🌀' },
            { label: '📻 Start Station', value: 'radio_stations', description: 'Play themed radio', emoji: '📻' },
            { label: '🔍 Find Similar', value: 'find_similar', description: 'Search for similar tracks', emoji: '🔍' },
            { label: '⏰ Sleep Timer', value: 'sleep_timer', description: 'Set auto-stop timer', emoji: '💤' },
            { label: '🔗 Share Queue', value: 'share_queue', description: 'Get dashboard link', emoji: '🔗' },
            { label: '🧹 Clear Queue', value: 'clear_queue', description: 'Remove all songs', emoji: '🧹' },
            { label: '📊 Track Stats', value: 'track_info', description: 'Show technical details', emoji: '📊' },
          ]);
        await interaction.followUp({ components: [new ActionRowBuilder().addComponents(moreMenu)], ephemeral: true });
        response = '⚙️ More options menu opened.';
        break;
      }

      default:
        response = '❌ Unknown control.';
    }

    const menuIds = ['music_effects', 'music_lyrics', 'music_misc', 'music_more_menu', 'music_filters_select', 'music_sleep_timer_select', 'music_similar_select', 'music_similar_results', 'music_move_select'];
    const isMenu = menuIds.includes(customId);

    // Update the ephemeral status message
    await interaction.editReply({ content: response });

    // Auto-dismiss ALL messages after 5 seconds (not just successful ones)
    if (!isMenu && response) {
      setTimeout(() => {
        interaction.deleteReply().catch(() => { });
      }, 5000);
    }

    // Refresh the main player embed for visual feedback
    setTimeout(async () => {
      try {
        const mod = await import('./Playerbuttons.js');
        if (typeof mod.updatePlayerMessageEmbed === 'function') mod.updatePlayerMessageEmbed(client, pm);
      } catch (e) { }
    }, 500);

  } catch (err) {
    logger.error('Playerbuttons', 'Error handling button interaction:', err);
    try {
      await interaction.editReply({ content: '❌ An error occurred while processing your button interaction.' });
      // Auto-dismiss error messages too
      setTimeout(() => {
        interaction.deleteReply().catch(() => { });
      }, 5000);
    } catch { }
  }
}


export async function handleSelectMenuInteraction(interaction, pm, client) {
  const selectedValue = interaction.values?.[0];
  let response = '';

  try {
    if (interaction.customId === 'music_sleep_timer_select') {
      const value = selectedValue.replace('sleep_', '');
      const minutes = parseInt(value, 10);

      if (minutes === 0) {
        pm.setSleepTimer(0);
        await interaction.editReply({ content: '✅ **Sleep timer cancelled.**' });
        autoDismiss(interaction);
        return;
      }

      const expireAt = pm.setSleepTimer(minutes, client);
      const timeString = `<t:${Math.floor(expireAt / 1000)}:R>`;
      response = `✅ **Sleep timer set!** The music will stop ${timeString}. 💤`;
      await interaction.editReply({ content: response });
      autoDismiss(interaction);

      // Immediate embed update for sleep timer status
      try {
        const mod = await import('./Playerbuttons.js');
        if (typeof mod.updatePlayerMessageEmbed === 'function') mod.updatePlayerMessageEmbed(client, pm);
      } catch (e) { }

      return;
    }


    if (interaction.customId === 'music_similar_results') {
      const idx = parseInt((selectedValue || '').replace('similar_add_', ''), 10);
      const suggestions = pm.player?.get('similarSuggestions') || [];
      const suggestion = suggestions[idx];

      if (!suggestion) {
        await interaction.editReply({ content: '❌ Invalid selection.' });
        autoDismiss(interaction);
        return;
      }

      try {
        const query = suggestion.trackInfo ? suggestion.trackInfo : `${suggestion.artist} ${suggestion.name}`;
        const searchResult = await client.music.search(query, { requester: interaction.user });

        if (searchResult && searchResult.tracks.length > 0) {
          await pm.addTracks(searchResult.tracks[0]);
          await interaction.editReply({ content: `✅ Added **${searchResult.tracks[0].info.title}** to the queue!` });
          autoDismiss(interaction);

          // Refresh embed
          try {
            const mod = await import('./Playerbuttons.js');
            if (typeof mod.updatePlayerMessageEmbed === 'function') mod.updatePlayerMessageEmbed(client, pm);
          } catch (e) { }

          if (client.webServer) client.webServer.updatePlayerState(pm.guildId);
        } else {
          await interaction.editReply({ content: '❌ Could not find a playable version of that track.' });
          autoDismiss(interaction);
        }
      } catch (err) {
        logger.error('Playerbuttons', 'Error adding similar track:', err);
        await interaction.editReply({ content: '❌ Error adding track.' });
        autoDismiss(interaction);
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
          // Super Nuclear Reset: Wipe every piece of internal state
          if (pm.player.filterManager) {
            const fm = pm.player.filterManager;
            const props = ['equalizer', 'timescale', 'karaoke', 'tremolo', 'vibrato', 'distortion', 'rotation', 'channelMix', 'lowPass'];
            props.forEach(p => {
              try {
                if (p === 'equalizer') fm[p] = [];
                else fm[p] = null;
              } catch (e) { }
            });
            if (fm.data) fm.data = {};
            // THIS IS THE KEY FIX: Clear the separate equalizerBands array!
            if (fm.equalizerBands) fm.equalizerBands = [];

            if (fm.setSpeed) await fm.setSpeed(1.0);
            if (fm.setPitch) await fm.setPitch(1.0);
            if (fm.setRate) await fm.setRate(1.0);
          }

          // Send clear packet to Lavalink
          if (typeof pm.player.setFilters === "function") {
            await pm.player.setFilters({});
          } else if (pm.player.filterManager) {
            await pm.player.filterManager.resetFilters();
          } else if (pm.player.filterManager && typeof pm.player.filterManager.clearEQ === 'function') {
            await pm.player.filterManager.clearEQ();
          }
          pm.player.lastFilterName = null;
          await interaction.editReply({ content: '✅ Audio filters reset.' });
          autoDismiss(interaction);
          try {
            const mod = await import('./Playerbuttons.js');
            if (typeof mod.updatePlayerMessageEmbed === 'function') mod.updatePlayerMessageEmbed(client, pm);
          } catch (e) { }
          if (client.webServer) client.webServer.updatePlayerState(pm.guildId);
        } catch (err) {
          logger.error('Playerbuttons', 'Error resetting filters:', err);
          await interaction.editReply({ content: '❌ Failed to reset filters.' });
          autoDismiss(interaction);
        }
        return;
      }

      // Apply selected filter
      try {
        const filterData = filters.get(selected, null);
        if (!filterData) return interaction.editReply({ content: '❌ Unknown filter selected.' });

        // Super Nuclear Reset before applying new filter
        if (pm.player.filterManager) {
          const fm = pm.player.filterManager;
          const props = ['equalizer', 'timescale', 'karaoke', 'tremolo', 'vibrato', 'distortion', 'rotation', 'channelMix', 'lowPass'];
          props.forEach(p => {
            try {
              if (p === 'equalizer') fm[p] = [];
              else fm[p] = null;
            } catch (e) { }
          });
          if (fm.data) fm.data = {};
          // THIS IS THE KEY FIX: Clear the separate equalizerBands array!
          if (fm.equalizerBands) fm.equalizerBands = [];

          if (fm.setSpeed) await fm.setSpeed(1.0);
          if (fm.setPitch) await fm.setPitch(1.0);
          if (fm.setRate) await fm.setRate(1.0);
        }

        if (typeof pm.player.setFilters === "function") {
          await pm.player.setFilters({});
        }

        if (Array.isArray(filterData)) {
          if (pm.player.filterManager.setEQ) await pm.player.filterManager.setEQ(filterData);
        } else {
          if (filterData.timescale) {
            const { speed, pitch, rate } = filterData.timescale;
            if (speed) await pm.player.filterManager.setSpeed(speed);
            if (pitch) await pm.player.filterManager.setPitch(pitch);
            if (rate) await pm.player.filterManager.setRate(rate);
          }
          if (filterData.eq) {
            if (pm.player.filterManager.setEQ) await pm.player.filterManager.setEQ(filterData.eq);
          }
        }

        pm.player.lastFilterName = selected;

        await interaction.editReply({ content: `✅ Applied filter **${selected}**.` });
        autoDismiss(interaction);
        try {
          const mod = await import('./Playerbuttons.js');
          if (typeof mod.updatePlayerMessageEmbed === 'function') mod.updatePlayerMessageEmbed(client, pm);
        } catch (e) { }
        if (client.webServer) client.webServer.updatePlayerState(pm.guildId);
      } catch (err) {
        logger.error('Playerbuttons', 'Error applying filter:', err);
        await interaction.editReply({ content: '❌ Failed to apply that filter.' });
        autoDismiss(interaction);
      }
      return;
    }

    if (interaction.customId === 'music_move_select') {
      const val = selectedValue;
      const match = /^move_idx_(\d+)$/.exec(val);
      if (!match) {
        await interaction.editReply({ content: '❌ Invalid selection.' });
        autoDismiss(interaction);
        return;
      }
      const fromIndex = parseInt(match[1], 10);
      try {
        await pm.moveTrack(fromIndex, 0);
        await interaction.editReply({ content: `✅ Moved track ${fromIndex + 1} to the top of the queue.` });
        autoDismiss(interaction);
        try {
          const mod = await import('./Playerbuttons.js');
          if (typeof mod.updatePlayerMessageEmbed === 'function') mod.updatePlayerMessageEmbed(client, pm);
        } catch (e) { }
        if (client.webServer) client.webServer.updatePlayerState(pm.guildId);
      } catch (err) {
        logger.error('Playerbuttons', 'Error moving track:', err);
        await interaction.editReply({ content: '❌ Failed to move that track.' });
        autoDismiss(interaction);
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
        } catch (e) { }
        if (client.webServer) client.webServer.updatePlayerState(pm.guildId);
      } catch (err) {
        logger.error('Playerbuttons', 'Error toggling effect:', err);
        await interaction.editReply({ content: '❌ Failed to toggle that effect.' });
      }
      return;
    }

    if (interaction.customId === 'music_radio_select') {
      const stationKey = selectedValue.replace('radio_', '');
      const stations = {
        lofi: "https://www.youtube.com/watch?v=jfKfPfyJRdk",
        rock: "https://www.youtube.com/watch?v=hTWKbfoikeg",
        pop: "https://www.youtube.com/playlist?list=PLMC9KNkIncKvYin_USF1qoJQnIyMAfRxl",
        edm: "https://www.youtube.com/watch?v=mAKsZ26SabQ",
        jazz: "https://www.youtube.com/watch?v=f_mS3W3606M",
        hiphop: "https://www.youtube.com/watch?v=MWN-P6_4-iY",
        gaming: "https://www.youtube.com/watch?v=BTYAsjAVa3I",
        kpop: "https://www.youtube.com/playlist?list=PL4fGSI1pDJn6jWqs706AuE3k58W_LToGO"
      };

      const url = stations[stationKey];
      if (!url) return interaction.editReply({ content: '❌ Invalid station.' });

      try {
        const result = await client.music.search(url, { requester: interaction.user });
        if (!result || !result.tracks.length) return interaction.editReply({ content: '❌ Could not load station.' });

        await pm.addTracks(result.tracks);
        if (!pm.isPlaying) await pm.play();

        const title = stationKey.charAt(0).toUpperCase() + stationKey.slice(1);
        await interaction.editReply({ content: `📻 **Radio Started:** ${title} station is now playing!` });

        if (client.webServer) client.webServer.updatePlayerState(pm.guildId);
      } catch (err) {
        logger.error('Playerbuttons', 'Error starting radio:', err);
        await interaction.editReply({ content: '❌ Error starting radio.' });
      }
      return;
    }

    if (interaction.customId === 'music_more_menu') {
      const moreValue = selectedValue;
      switch (moreValue) {
        case 'view_queue':
          {
            const tracks = pm.player?.queue?.tracks || [];
            const current = pm.currentTrack;
            const embed = new EmbedBuilder()
              .setTitle(`🎶 Current Queue`)
              .setColor(0xFFCBA4)
              .setThumbnail(current?.info?.artworkUrl || config.assets.defaultTrackArtwork);

            let description = current ? `**Now Playing:** [${current.info.title}](${current.info.uri})\n\n` : '';

            if (tracks.length === 0) {
              description += '*Queue is empty.*';
            } else {
              description += `**Up Next (${tracks.length} tracks):**\n`;
              description += tracks.slice(0, 10).map((t, i) => `**${i + 1}.** [${t.info.title.slice(0, 50)}](${t.info.uri})`).join('\n');
              if (tracks.length > 10) description += `\n*...and ${tracks.length - 10} more tracks*`;
            }

            embed.setDescription(description);
            await interaction.editReply({ content: null, embeds: [embed] });
            return;
          }
        case 'toggle_autoplay':
          {
            const current = pm.player?.get('autoplayEnabled') || false;
            const newVal = !current;
            pm.player?.set('autoplayEnabled', newVal);
            response = newVal ? '📻 **Radio Mode Enabled!** Similar songs will be added automatically.' : '📻 **Radio Mode Disabled.**';

            // Immediate embed update for autoplay status
            try {
              const mod = await import('./Playerbuttons.js');
              if (typeof mod.updatePlayerMessageEmbed === 'function') mod.updatePlayerMessageEmbed(client, pm);
            } catch (e) { }
          }
          break;
        case 'find_similar':
          {
            const current = pm.currentTrack;
            if (!current) {
              response = '❌ No track is currently playing.';
              break;
            }
            await interaction.editReply({ content: '🔍 Searching for similar tracks...' });
            const { fetchRecommendations } = await import('../../player/queueEnd.js');
            try {
              const recommendations = await fetchRecommendations(current, client);
              if (!recommendations || recommendations.length === 0) {
                await interaction.editReply({ content: '❌ No similar tracks found.' });
                return;
              }

              pm.player.set('similarSuggestions', recommendations);

              const options = recommendations.map((rec, i) => ({
                label: `${rec.name.slice(0, 50)}`,
                description: `by ${rec.artist.slice(0, 50)}`,
                value: `similar_add_${i}`,
                emoji: '🎵'
              }));

              const select = new StringSelectMenuBuilder()
                .setCustomId('music_similar_results')
                .setPlaceholder('Select a track to add to queue')
                .setOptions(options);

              await interaction.editReply({ content: '🔍 **Found similar tracks!** Select one to add:', components: [new ActionRowBuilder().addComponents(select)] });
              return;
            } catch (e) {
              logger.error('Playerbuttons', 'Find similar error:', e);
              await interaction.editReply({ content: '❌ Failed to find recommendations.' });
              return;
            }
          }
        case 'share_queue':
          {
            const host = config.web?.host || 'localhost';
            const port = config.web?.port || 3000;
            const protocol = config.web?.secure ? 'https' : 'http';
            const url = `${protocol}://${host}${port === 80 || port === 443 ? '' : `:${port}`}/dashboard?guild=${pm.guildId}`;
            response = `🔗 **Share your queue!**\nAnyone with this link can view the live queue: ${url}`;
          }
          break;
        case 'export_queue':
          response = '📦 Queue export logic coming soon!';
          break;
        case 'move_track':
          {
            const queue = pm.player?.queue?.tracks || [];
            if (queue.length === 0) {
              response = '❌ Queue is empty.';
            } else {
              const options = queue.slice(0, 24).map((t, i) => ({ label: `${i + 1}. ${t.info?.title?.slice(0, 80)}`, value: `move_idx_${i}` }));
              const select = new StringSelectMenuBuilder().setCustomId('music_move_select').setPlaceholder('Select a track to move to top').setOptions(options);
              await interaction.followUp({ components: [new ActionRowBuilder().addComponents(select)], ephemeral: true });
              response = '🚚 Select a track to move.';
            }
          }
          break;
        case 'clear_queue':
          await pm.player?.queue?.clear();
          response = '🧹 Queue cleared.';
          break;
        case 'track_info':
          {
            const t = pm.currentTrack;
            response = t ? `📊 **Track Details**\nTitle: ${t.info.title}\nArtist: ${t.info.author}\nSource: ${t.info.sourceName}\nDuration: ${pm.formatDuration(t.info.duration)}` : '❌ No track playing.';
          }
          break;
        case 'radio_stations': {
          const select = new StringSelectMenuBuilder()
            .setCustomId("music_radio_select")
            .setPlaceholder("📻 Select a radio station")
            .addOptions([
              { label: "Lofi / Chill", value: "radio_lofi", emoji: "☕" },
              { label: "Rock Classic", value: "radio_rock", emoji: "🎸" },
              { label: "Pop Hits", value: "radio_pop", emoji: "💃" },
              { label: "EDM / Dance", value: "radio_edm", emoji: "🎧" },
              { label: "Jazz / Study", value: "radio_jazz", emoji: "🎹" },
              { label: "Hip Hop", value: "radio_hiphop", emoji: "🔥" },
              { label: "Gaming / Phonk", value: "radio_gaming", emoji: "🎮" },
              { label: "K-Pop", value: "radio_kpop", emoji: "🌈" }
            ]);
          await interaction.followUp({ components: [new ActionRowBuilder().addComponents(select)], ephemeral: true });
          response = '📻 Select a radio station to start!';
          break;
        }
        case 'sleep_timer': {
          const sleepMenu = new StringSelectMenuBuilder()
            .setCustomId('music_sleep_timer_select')
            .setPlaceholder('⏰ Select Sleep Duration')
            .addOptions([
              { label: '1 Minute (Test)', value: 'sleep_1', emoji: '⏲️' },
              { label: '5 Minutes', value: 'sleep_5', emoji: '⏲️' },
              { label: '15 Minutes', value: 'sleep_15', emoji: '⏲️' },
              { label: '30 Minutes', value: 'sleep_30', emoji: '⏲️' },
              { label: '1 Hour', value: 'sleep_60', emoji: '⏲️' },
              { label: 'Cancel Timer', value: 'sleep_0', emoji: '❌' },
            ]);
          await interaction.followUp({ components: [new ActionRowBuilder().addComponents(sleepMenu)], ephemeral: true });
          response = '⏰ Select how long before the music stops.';
          break;
        }
        default:
          response = '❌ Unknown option.';
      }
      await interaction.editReply({ content: response });
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

    // Auto-dismiss simple select menu responses after 5 seconds
    const persistentMenus = ['music_filters_select', 'music_similar_results', 'music_move_select', 'music_more_menu'];
    if (!persistentMenus.includes(interaction.customId) && response && !response.includes('❌')) {
      setTimeout(() => {
        interaction.deleteReply().catch(() => { });
      }, 5000);
    }

    try {
      const mod = await import('./Playerbuttons.js');
      if (typeof mod.updatePlayerMessageEmbed === 'function') mod.updatePlayerMessageEmbed(client, pm);
    } catch (e) { }

    if (client.webServer) {
      client.webServer.updatePlayerState(pm.guildId);
    }

  } catch (err) {
    logger.error('Playerbuttons', 'Error handling select menu interaction:', err);
    try {
      await interaction.editReply({ content: '❌ An error occurred while processing your selection.' });
      // Auto-dismiss error message after 5 seconds
      setTimeout(() => {
        interaction.deleteReply().catch(() => { });
      }, 5000);
    } catch { }
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
      const embed = await DiscordPlayerEmbed.createPlayerEmbedAsync(pm, guild, currentPosition, client);

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
