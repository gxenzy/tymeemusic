import { REST } from '@discordjs/rest';
import { ClusterClient, getInfo } from 'discord-hybrid-sharding';
import {
	Client,
	GatewayIntentBits,
	Collection,
	Partials,
	Options,
} from 'discord.js';

import { config } from '#config/config';
import { db } from '#database/DatabaseManager';
import { CommandHandler } from '#handlers/CommandHandler';
import { EventLoader } from '#handlers/EventLoader';
import { MusicManager } from '#managers/MusicManager';
import { PlaylistManager } from '#managers/PlaylistManager';
import { logger } from '#utils/logger';
import { WebServer } from '#web/server';

let shardInfo = null;
try {
	shardInfo = getInfo();
} catch (error) {
	shardInfo = null;
	console.error(`Error while getting shard info: ${error}`);
}

export class Tymee extends Client {
	constructor() {
		const clientOptions = {
			intents: [
				GatewayIntentBits.Guilds,
				GatewayIntentBits.GuildMembers,
				GatewayIntentBits.GuildMessages,
				GatewayIntentBits.GuildVoiceStates,
				GatewayIntentBits.GuildMessageReactions,
				GatewayIntentBits.MessageContent,
			],
			partials: [
				Partials.Channel,
				Partials.GuildMember,
				Partials.Message,
				Partials.User,
			],
			makeCache: Options.cacheWithLimits({
				MessageManager: 100,
				PresenceManager: 0,
				UserManager: Infinity, // Restored to Infinity for reliability
				GuildMemberManager: Infinity, // Restored to Infinity for reliability
				ReactionManager: 0,
				ReactionUserManager: 0,
				ThreadManager: 0,
				ThreadMemberManager: 0,
				StageInstanceManager: 0,
				VoiceStateManager: Infinity,
				GuildBanManager: 0,
				GuildInviteManager: 0,
				GuildScheduledEventManager: 0,
			}),
			// Auto-sweep old cached data
			sweepers: {
				...Options.DefaultSweeperSettings,
				messages: {
					interval: 300, // Every 5 minutes
					lifetime: 600, // Delete messages older than 10 minutes
				},
				users: {
					interval: 600, // Every 10 minutes
					filter: () => user => user.bot && user.id !== user.client.user?.id, // Remove cached bots
				},
			},
			failIfNotExists: false,
			allowedMentions: { parse: ['users', 'roles'], repliedUser: false },
		};

		if (shardInfo) {
			clientOptions.shards = shardInfo.SHARD_LIST;
			clientOptions.shardCount = shardInfo.TOTAL_SHARDS;
		}


		super(clientOptions);

		this.cluster = shardInfo ? new ClusterClient(this) : null;
		this.commands = new Collection();
		this.logger = logger;
		this.config = config;
		this.db = db;
		this.music = new MusicManager(this);
		this.lavalink = this.music.lavalink;
		this.playlistManager = new PlaylistManager(this);

		this.commandHandler = new CommandHandler(this);
		this.eventHandler = new EventLoader(this);

		this.startTime = Date.now();
		this.rest = new REST({ version: '10' }).setToken(config.token);

		// Initialize web server
		this.webServer = new WebServer(this);
	}

	async init() {
		this.logger.info('Tymee', `❄️ Initializing bot...`);
		try {
			await this.eventHandler.loadAllEvents();
			await this.commandHandler.loadCommands();
			await this.login(config.token);

			// Start web server after bot is ready
			this.once('ready', () => {
				this.webServer.start();
			});

			this.logger.success(
				'Tymee',
				`❄️ Bot has successfully initialized. 🌸`,
			);
			this.logger.info('Tymee', '❄️ Coded by ZenIX');
		} catch (error) {
			this.logger.error(
				'Tymee',
				'❄️ Failed to initialize bot cluster:',
				error,
			);
			throw error;
		}
	}

	async cleanup() {
		this.logger.warn('Tymee', `❄️ Starting cleanup for bot...`);
		try {
			if (this.music) {
				await this.music.saveAllPlayerSessions();
			}
			if (this.webServer) {
				// Prevent web server hang from blocking shutdown (max 2 seconds)
				const stopPromise = this.webServer.stop();
				const timeoutPromise = new Promise(resolve => setTimeout(resolve, 2000));
				await Promise.race([stopPromise, timeoutPromise]);
			}
			await this.db.closeAll();
			this.destroy();
			this.logger.success(
				'Tymee',
				'❄️ Cleanup completed successfully. 🌸',
			);
		} catch (error) {
			this.logger.error(
				'Tymee',
				'❄️ An error occurred during cleanup:',
				error,
			);
		}
	}

	get uptime() {
		return Date.now() - this.startTime;
	}
}
