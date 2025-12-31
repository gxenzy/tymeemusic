import { logger } from "#utils/logger";
import { emojiService } from "#services/EmojiService";

export default {
  name: "guildEmojiUpdate",
  once: false,
  async execute(guild, oldEmojis, newEmojis) {
    try {
      const addedEmojis = newEmojis.filter(e => !oldEmojis.has(e.id));
      const removedEmojis = oldEmojis.filter(e => !newEmojis.has(e.id));

      if (addedEmojis.length === 0 && removedEmojis.length === 0) {
        return;
      }

      logger.info('GuildEmojiUpdate', 
        `Emoji update in ${guild.name}: +${addedEmojis.length} -${removedEmojis.length}`
      );

      emojiService.clearCache(guild.id);

      if (addedEmojis.length > 0) {
        const addedNames = addedEmojis.map(e => e.name).join(', ');
        logger.debug('GuildEmojiUpdate', `Added emojis: ${addedNames}`);
      }

      if (removedEmojis.length > 0) {
        const removedNames = removedEmojis.map(e => e.name).join(', ');
        logger.debug('GuildEmojiUpdate', `Removed emojis: ${removedNames}`);
      }

    } catch (error) {
      logger.error('GuildEmojiUpdate', 'Error handling emoji update:', error);
    }
  }
};
