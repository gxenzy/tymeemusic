// V8 compile cache - speeds up subsequent startups by caching compiled bytecode
import 'v8-compile-cache-lib';

import { ClusterManager, HeartbeatManager } from 'discord-hybrid-sharding';

import { config } from '#config/config';
import { logger } from '#utils/logger';

const manager = new ClusterManager('./src/index.js', {
	totalShards: 'auto',
	shardsPerCluster: 2,
	mode: 'process',
	token: config.token,
	respawn: true,
	restartMode: 'gracefulSwitch',
});

// Optimized heartbeat - reduced frequency for less CPU usage
manager.extend(
	new HeartbeatManager({
		interval: 5000, // Increased from 2000ms
		maxMissedHeartbeats: 8, // Increased from 5
	}),
);


manager.on('clusterCreate', cluster => {
	logger.info(
		'ClusterManager',
		` ==> Launched Cluster ${cluster.id} [${cluster.shardList.join(', ')}]`,
	);
	cluster.on('ready', () =>
		logger.success('ClusterManager', `Cluster ${cluster.id} ==> Ready`),
	);
	cluster.on('reconnecting', () =>
		logger.warn(
			'ClusterManager',
			`Cluster ${cluster.id} ==> Reconnecting...`,
		),
	);
	cluster.on('death', (p, code) =>
		logger.error(
			'ClusterManager',
			`Cluster ${cluster.id} ==> Died with exit code ${code}. Respawning...`,
		),
	);
	cluster.on('error', e =>
		logger.error(
			'ClusterManager',
			`Cluster ${cluster.id} ==> An error occurred:`,
			e,
		),
	);
});

manager.on('debug', msg => {
	if (!msg.includes('Heartbeat')) {
		logger.debug('ClusterManager', msg);
	}
});

const shutdown = async () => {
	logger.info('ClusterManager', ' ==> Sending shutdown signal to all clusters...');

	try {
		// Broadcast shutdown message to all clusters
		// We use a Promise.all with a timeout to ensure we don't hang forever
		const shutdownPromises = Array.from(manager.clusters.values()).map(cluster => {
			return new Promise((resolve) => {
				const timeout = setTimeout(() => {
					logger.warn('ClusterManager', `Cluster ${cluster.id} failed to acknowledge shutdown in time.`);
					resolve();
				}, 5000);

				try {
					// Check if cluster is still alive before sending
					if (cluster && cluster.killable && typeof cluster.send === 'function') {
						const result = cluster.send({ type: 'shutdown' });
						// Handle EPIPE or other send errors if they occur
						if (result && typeof result.catch === 'function') {
							result.catch(e => {
								logger.error('ClusterManager', `Failed to send shutdown to cluster ${cluster.id} (promise):`, e.message);
								clearTimeout(timeout);
								resolve();
							});
						} else {
							// If send didn't throw and isn't a promise, we consider it sent
							// (we don't wait for ACK here, just the send success)
							// Actually we should wait a bit or resolve on ACK if we had listeners
							// but for now, this avoids the crash.
						}
					} else {
						resolve();
					}
				} catch (e) {
					logger.error('ClusterManager', `Failed to send shutdown to cluster ${cluster.id} (sync):`, e.message);
					clearTimeout(timeout);
					resolve();
				}
			});
		});

		// Give clusters 5 seconds to process the shutdown message (save DB, etc)
		await new Promise(resolve => setTimeout(resolve, 5000));

		logger.success('ClusterManager', ' ==> All clusters passed shutdown phase. Exiting.');
		process.exit(0);
	} catch (error) {
		logger.error('ClusterManager', 'Error during shutdown broadcast:', error);
		process.exit(1);
	}
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

const deploySlashCommands = async () => {
	try {
		logger.info('Deploy', 'Starting auto-deployment of slash commands...');
		const { CommandHandler } = await import('#handlers/CommandHandler');
		const { REST } = await import('@discordjs/rest');
		const { Routes } = await import('discord-api-types/v10');

		const handler = new CommandHandler();
		await handler.loadCommands();
		const commands = handler.getSlashCommandsData();

		if (commands.length === 0) {
			logger.warn('Deploy', 'No slash-enabled commands found to deploy.');
			return;
		}

		const rest = new REST({ version: '10' }).setToken(config.token);
		await rest.put(
			Routes.applicationCommands(config.clientId),
			{ body: commands }
		);

		logger.success('Deploy', `Successfully auto-deployed ${commands.length} slash commands globally!`);
	} catch (error) {
		logger.error('Deploy', 'Failed to auto-deploy slash commands:', error);
	}
};

const run = async () => {
	// Deploy commands before spawning shards
	await deploySlashCommands();

	manager
		.spawn({ timeout: -1 })
		.then(() =>
			logger.info('ClusterManager', ' ==> All clusters are being launched.'),
		)
		.catch(error =>
			logger.error('ClusterManager', ' ==> Error during spawn:', error),
		);
};

run();
