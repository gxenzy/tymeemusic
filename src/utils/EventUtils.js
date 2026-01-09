import { logger } from '#utils/logger';

export class EventUtils {
	// 💓 HEARTBEAT REGISTRY: Stores active UI update intervals in memory to prevent ghosts
	static activeHeartbeats = new Map();

	static async sendTimedMessage(client, channelId, messageData, delay = 5000) {
		try {
			const channel = client.channels.cache.get(channelId) || await client.channels.fetch(channelId).catch(() => null);
			if (!channel) return null;

			const msg = await channel.send(messageData);
			if (delay > 0) {
				setTimeout(() => {
					msg.delete().catch(() => { });
				}, delay);
			}
			return msg;
		} catch (error) {
			logger.error('EventUtils', 'Failed to send timed message:', error);
			return null;
		}
	}

	static async sendPlayerMessage(client, player, messageData) {
		try {
			// GLOBAL REDIRECT: Prioritize the voice channel's "Chat in Voice" feature
			let voiceId = player.voiceChannelId;

			if (!voiceId) {
				const guild = client.guilds.cache.get(player.guildId);
				const botMember = guild?.members.me || await guild?.members.fetch(client.user.id).catch(() => null);
				if (botMember?.voice?.channelId) {
					voiceId = botMember.voice.channelId;
					player.voiceChannelId = voiceId;
				}
			}

			let channelId = player.textChannelId || player.get('nowPlayingChannelId');

			// If we are in voice, we ALWAYS force the voice channel chat
			if (voiceId) {
				const voiceChannel = client.channels.cache.get(voiceId) || await client.channels.fetch(voiceId).catch(() => null);
				if (voiceChannel) {
					channelId = voiceId;
				} else if (player.voiceChannelId) {
					// If we ARE in voice but can't find channel, SUPPRESS fallback to stop #chat spam
					logger.warn('EventUtils', 'Bot in voice but voice channel chat not accessible. Suppressing fallback to stop spam.');
					return null;
				}
			}

			const channel = client.channels.cache.get(channelId) || await client.channels.fetch(channelId).catch(() => null);
			if (!channel) return null;

			// FINAL GHOST CHECK: (DISABLED) - Allowing message to send to text channels even if in voice.
			/*
			if (voiceId && channel.id !== voiceId && !channel.isVoiceBased()) {
				logger.debug('EventUtils', 'Blocking message to generic channel while in voice.');
				return null;
			}
			*/

			return await channel.send(messageData);
		} catch (error) {
			logger.error('EventUtils', 'Failed to send player message:', error);
			return null;
		}
	}

	/**
	 * PERMANENT GHOST KILLER: Wipes any player-like embeds from the bot to ensure a clean slate.
	 */
	static async forceCleanupPlayerUI(client, player, targetChannelId = null) {
		try {
			const channelId = targetChannelId || player.voiceChannelId || player.get('nowPlayingChannelId') || player.textChannelId;
			if (!channelId) return;

			const channel = client.channels.cache.get(channelId) || await client.channels.fetch(channelId).catch(() => null);
			if (!channel || !channel.isTextBased()) return;

			logger.debug('EventUtils', `Initiating Scorched Earth cleanup in channel: ${channel.id}`);

			// 1. Try to delete specific stored message
			const storedId = player.get('nowPlayingMessageId');
			if (storedId) {
				const msg = await channel.messages.fetch(storedId).catch(() => null);
				if (msg) {
					if (msg.pinned) await msg.unpin().catch(() => { });
					await msg.delete().catch(() => { });
				}
			}

			// 2. SCORCHED EARTH: Scan last 30 messages for ANY dangling player embeds from this bot
			const recentMessages = await channel.messages.fetch({ limit: 30 }).catch(() => []);
			for (const msg of recentMessages.values()) {
				// Detect bot's music cards: Check for author ID and either our specific select menu or an embed with "NOW PLAYING"
				const isBot = msg.author.id === client.user.id;
				const isMusicCard = msg.embeds.some(e => e.title?.includes('PLAYING') || e.description?.includes('PLAYING')) ||
					msg.components.some(c => c.components.some(comp => comp.customId?.includes('music_similar_select')));

				if (isBot && (isMusicCard || msg.attachments.size > 0)) {
					if (msg.pinned) await msg.unpin().catch(() => { });
					await msg.delete().catch(() => { });
				}
			}

			// Clear IDs
			player.set('nowPlayingMessageId', null);
			player.set('nowPlayingChannelId', null);
		} catch (error) {
			logger.debug('EventUtils', 'Force cleanup error (ignoring):', error);
		}
	}

	static async editMessage(client, channelId, messageId, editData) {
		try {
			const channel = client.channels.cache.get(channelId);
			if (!channel) return null;

			const message = await channel.messages
				.fetch(messageId)
				.catch(() => null);
			if (!message) return null;

			return await message.edit(editData);
		} catch (error) {
			logger.debug('EventUtils', 'Failed to edit message:', error);
			return null;
		}
	}

	static async deleteMessage(client, channelId, messageId) {
		try {
			const channel = client.channels.cache.get(channelId);
			if (!channel) return false;

			const message = await channel.messages
				.fetch(messageId)
				.catch(() => null);
			if (!message) return false;

			await message.delete();
			return true;
		} catch (error) {
			logger.debug('EventUtils', 'Failed to delete message:', error);
			return false;
		}
	}

	static clearPlayerTimeout(player, timeoutKey) {
		const timeoutId = player.get(timeoutKey);
		if (timeoutId) {
			clearTimeout(timeoutId);
			player.set(timeoutKey, null);
		}
	}

	/**
	 * 🛑 HARD KILL HEARTBEAT: Physically wipes the UI timer for a guild from memory.
	 */
	static clearHeartbeat(guildId) {
		const interval = this.activeHeartbeats.get(guildId);
		if (interval) {
			logger.debug('EventUtils', `Physically killing heartbeat for guild: ${guildId}`);
			clearInterval(interval);
			this.activeHeartbeats.delete(guildId);
		}
	}

	static registerHeartbeat(guildId, interval) {
		this.clearHeartbeat(guildId); // Kill old before registering new
		this.activeHeartbeats.set(guildId, interval);
	}

	static formatTrackInfo(track) {
		if (!track?.info) return 'Unknown Track';
		return `**${track.info.title || 'Unknown'}** by **${track.info.author || 'Unknown'
			}**`;
	}
}
