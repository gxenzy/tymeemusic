import { PlayerManager } from '#managers/PlayerManager';
import { logger } from '#utils/logger';
// import { DiscordPlayerEmbed } from '#utils/DiscordPlayerEmbed'; // using dynamic import for hot-reload
import { EventUtils } from '#utils/EventUtils';
import { db } from '#database/DatabaseManager';
import { config } from '#config/config';
import { ActionRowBuilder, StringSelectMenuBuilder } from 'discord.js';
import filters from '#config/filters';

export default {
	name: "interactionCreate",
	once: false,
	async execute(interaction, client) {
		try {
			if (!interaction.isButton() && !interaction.isStringSelectMenu()) {
				return;
			}

			const musicControlIds = [
				'music_previous',
				'music_pause',
				'music_skip',
				'music_stop',
				'music_controls_select',
				'music_similar_select',
				'music_similar_results',
				'music_shuffle',
				'music_repeat',
				'music_volume_down',
				'music_volume_up',
				'music_seek_back',
				'music_seek_forward',
				'music_favorite',
				'music_effects',
				'music_filter',
				'music_move',
				'music_misc',
				'music_lyrics',
				'music_more_menu',
				'music_sleep_timer_select',
				'music_queue_info',
				'music_filters_select',
				'music_move_select',
				'music_effects_select',
			];

			if (!musicControlIds.includes(interaction.customId)) {
				return;
			}

			if (!interaction.member?.voice?.channel) {
				return interaction.reply({
					content: '❌ You must be in a voice channel to use music controls.',
					ephemeral: true,
				});
			}

			const player = client.music?.getPlayer(interaction.guild.id);
			if (!player) {
				return interaction.reply({
					content: '❌ No music player found for this server.',
					ephemeral: true,
				});
			}

			const pm = new PlayerManager(player);

			// Ensure user is in same voice channel as the bot
			const botVoiceChannelId = pm.voiceChannelId || pm.player?.voiceChannelId;
			if (botVoiceChannelId && interaction.member.voice.channel && interaction.member.voice.channel.id !== botVoiceChannelId) {
				return interaction.reply({
					content: '❌ You must be in the same voice channel as the bot to use controls.',
					ephemeral: true
				});
			}

			if (['music_pause', 'music_skip', 'music_previous'].includes(interaction.customId) && !pm.hasCurrentTrack) {
				return interaction.reply({
					content: '❌ No track is currently playing.',
					ephemeral: true
				});
			}

			await interaction.deferReply({ ephemeral: true });

			if (interaction.isButton()) {
				await import('./PlayerbuttonsHandler.js').then(m => m.handleButtonInteraction(interaction, pm, client));
			} else if (interaction.isStringSelectMenu()) {
				await import('./PlayerbuttonsHandler.js').then(m => m.handleSelectMenuInteraction(interaction, pm, client));
			}

		} catch (error) {
			logger.error('InteractionCreate', 'Error handling music control interaction:', error);

			try {
				const errorMessage = '❌ An error occurred while processing your request.';
				if (interaction.deferred) {
					await interaction.editReply({ content: errorMessage });
				} else {
					await interaction.reply({ content: errorMessage, ephemeral: true });
				}
			} catch (replyError) {
				logger.error('InteractionCreate', 'Error sending error response:', replyError);
			}
		}
	},
};

export async function updatePlayerMessageEmbed(client, pm) {
	try {
		const player = pm.player;
		const messageId = player.get('nowPlayingMessageId');
		const channelId = player.get('nowPlayingChannelId');

		if (messageId && channelId) {
			const guild = client.guilds.cache.get(pm.guildId);
			// Get fresh position from player
			const currentPosition = pm.player?.position ?? pm.position ?? 0;

			// 🔥 DEV: Smart Hot-Reload (Prevents lag/memory leaks)
			// Only re-import if it's been more than 10 seconds since the last reload
			if (!global.cachedDiscordPlayerEmbed || Date.now() - (global.lastEmbedReload || 0) > 10000) {
				const { DiscordPlayerEmbed: FreshClass } = await import(`../../../utils/DiscordPlayerEmbed.js?v=${Date.now()}`);
				global.cachedDiscordPlayerEmbed = FreshClass;
				global.lastEmbedReload = Date.now();
			}
			
			const DiscordPlayerEmbed = global.cachedDiscordPlayerEmbed;
			const embed = await DiscordPlayerEmbed.createPlayerEmbedAsync(pm, guild, currentPosition, client);
            
            // EXTRACT GENERATED IMAGE
            const files = embed.file ? [embed.file] : [];

			const channel = guild?.channels.cache.get(channelId);
			if (channel) {
				const message = await channel.messages.fetch(messageId).catch(() => null);
				if (message) {
                    const currentTrackId = pm.queue.current?.info?.identifier || pm.queue.current?.info?.uri;
                    const cachedId = pm.player?.cachedCard?.id;
                    
                    // Logic: If we are playing the same track as the one cached/displayed, try to retain attachments
                    // The cachedId is set in DiscordPlayerEmbed when image is generated/retrieved
                    const isSameTrack = currentTrackId && cachedId && currentTrackId === cachedId;
                    const hasAttachments = message.attachments.size > 0;

                    const editOptions = { embeds: [embed] };

                    if (isSameTrack && hasAttachments) {
                         // RETAIN: Do nothing, just don't add 'files' 
                    } else {
                        // New Track or missing image: Upload
                        if (files.length > 0) editOptions.files = files;
                    }

					const updatedMsg = await message.edit(editOptions);
                    
                    // 🖼️ CAPTURE CDN URL (If not already cached)
                    if (updatedMsg && updatedMsg.embeds[0]?.image?.url && pm.player?.cachedCard) {
                        pm.player.cachedCard.url = updatedMsg.embeds[0].image.url;
                    }
				}
			}
		}
	} catch (err) {
		// ignore
	}
}

export async function updateSelectMenuOptions(interaction, pm) {
	return import('./PlayerbuttonsHandler.js').then(m => (typeof m.updateSelectMenuOptions === 'function' ? m.updateSelectMenuOptions(interaction, pm) : undefined));
}
