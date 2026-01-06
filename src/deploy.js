import { CommandHandler } from '#handlers/CommandHandler';
import { REST } from '@discordjs/rest';
import { Routes } from 'discord-api-types/v10';
import { config } from '#config/config';
import { logger } from '#utils/logger';
import 'dotenv/config';

async function deploy() {
    logger.info('Deploy', 'Starting slash command registration...');

    if (!config.token || !config.clientId) {
        logger.error('Deploy', 'Missing DISCORD_TOKEN or CLIENT_ID in .env or config.');
        process.exit(1);
    }

    try {
        const handler = new CommandHandler();
        // Load commands from the commands directory
        // The handler uses path.join(__dirname, dirPath)
        // CommandHandler is in src/structures/handlers
        // dirPath defaults to '../../commands' which is src/commands
        await handler.loadCommands();

        const commands = handler.getSlashCommandsData();

        if (commands.length === 0) {
            logger.warn('Deploy', 'No slash-enabled commands found.');
            return;
        }

        logger.info('Deploy', `Found ${commands.length} slash commands to register.`);

        const rest = new REST({ version: '10' }).setToken(config.token);

        logger.info('Deploy', 'Registering commands globally...');

        await rest.put(
            Routes.applicationCommands(config.clientId),
            { body: commands }
        );

        logger.success('Deploy', 'Successfully registered slash commands globally!');
        logger.info('Deploy', 'Note: Global commands can take up to an hour to propagate to all servers.');

    } catch (error) {
        logger.error('Deploy', 'Failed to register commands:', error);
    }
}

deploy();
