import DashboardServer from './web/server.js';
import EmojiManager from './managers/EmojiManager.js';
import EmojiEventHandler from './events/discord/guild/EmojiEvents.js';

let dashboardServer = null;
let emojiManager = null;
let emojiEventHandler = null;

export async function startDashboard(bot) {
    if (dashboardServer) {
        console.log('Dashboard already running');
        return dashboardServer;
    }

    emojiManager = new EmojiManager(bot);
    await emojiManager.initialize();
    bot.emojiManager = emojiManager;

    emojiEventHandler = new EmojiEventHandler(bot);
    
    bot.on('guildCreate', (guild) => emojiEventHandler.guildCreate(guild));
    bot.on('guildDelete', (guild) => emojiEventHandler.guildDelete(guild));
    bot.on('guildEmojisUpdate', (emojis) => emojiEventHandler.guildEmojisUpdate(emojis));
    bot.on('guildAvailable', (guild) => emojiEventHandler.guildAvailable(guild));

    dashboardServer = new DashboardServer(bot);
    await dashboardServer.start();

    console.log('Dashboard server started');
    return dashboardServer;
}

export function stopDashboard() {
    if (dashboardServer) {
        dashboardServer.stop();
        dashboardServer = null;
    }
    if (emojiManager) {
        emojiManager.clearAllCache();
        emojiManager = null;
    }
    console.log('Dashboard server stopped');
}

export function getDashboardServer() {
    return dashboardServer;
}

export function getEmojiManager() {
    return emojiManager;
}
