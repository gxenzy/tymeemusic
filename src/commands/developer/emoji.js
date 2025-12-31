import { ApplicationCommandOptionType } from "discord.js";
import { emojiService, EMOJI_KEYS, DEFAULT_EMOJIS } from "#services/EmojiService";

export default {
  name: "emoji",
  description: "Manage custom emojis for this server",
  options: [
    {
      name: "add",
      description: "Add a custom emoji mapping",
      type: ApplicationCommandOptionType.Subcommand,
      options: [
        {
          name: "key",
          description: "Emoji key (e.g., music, play, pause)",
          type: ApplicationCommandOptionType.String,
          required: true,
          choices: Object.keys(EMOJI_KEYS).map(k => ({ name: k, value: k }))
        },
        {
          name: "emoji",
          description: "The custom emoji (e.g., <:mymusic:123456789>)",
          type: ApplicationCommandOptionType.String,
          required: true
        }
      ]
    },
    {
      name: "remove",
      description: "Remove a custom emoji mapping",
      type: ApplicationCommandOptionType.Subcommand,
      options: [
        {
          name: "key",
          description: "Emoji key to remove",
          type: ApplicationCommandOptionType.String,
          required: true,
          choices: Object.keys(EMOJI_KEYS).map(k => ({ name: k, value: k }))
        }
      ]
    },
    {
      name: "list",
      description: "List all custom emoji mappings",
      type: ApplicationCommandOptionType.Subcommand
    },
    {
      name: "sync",
      description: "Automatically scan and map server emojis",
      type: ApplicationCommandOptionType.Subcommand
    },
    {
      name: "reset",
      description: "Reset all emojis to defaults",
      type: ApplicationCommandOptionType.Subcommand
    },
    {
      name: "preview",
      description: "Preview an emoji by key",
      type: ApplicationCommandOptionType.Subcommand,
      options: [
        {
          name: "key",
          description: "Emoji key to preview",
          type: ApplicationCommandOptionType.String,
          required: true,
          choices: Object.keys(EMOJI_KEYS).map(k => ({ name: k, value: k }))
        }
      ]
    }
  ],

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const guildId = interaction.guildId;
    const guild = interaction.guild;

    switch (subcommand) {
      case "add":
        return this.addEmoji(interaction, guildId, guild);
      case "remove":
        return this.removeEmoji(interaction, guildId);
      case "list":
        return this.listEmojis(interaction, guildId, guild);
      case "sync":
        return this.syncEmojis(interaction, guildId, guild);
      case "reset":
        return this.resetEmojis(interaction, guildId);
      case "preview":
        return this.previewEmoji(interaction, guildId, guild);
    }
  },

  async addEmoji(interaction, guildId, guild) {
    const key = interaction.options.getString("key");
    const emojiInput = interaction.options.getString("emoji");

    try {
      const parsed = emojiService.setEmoji(guildId, key, emojiInput);

      const preview = emojiService.getEmoji(guildId, key, guild);

      interaction.reply({
        content: `✅ Added emoji mapping:\n**Key:** \`${key}\`\n**Emoji:** ${preview}`,
        ephemeral: true
      });
    } catch (error) {
      interaction.reply({
        content: `❌ Failed to add emoji: ${error.message}`,
        ephemeral: true
      });
    }
  },

  async removeEmoji(interaction, guildId) {
    const key = interaction.options.getString("key");

    emojiService.removeEmoji(guildId, key);

    interaction.reply({
      content: `✅ Removed emoji mapping for \`${key}\``,
      ephemeral: true
    });
  },

  async listEmojis(interaction, guildId, guild) {
    const emojiList = emojiService.getEmojiList(guildId, guild);
    const mappedKeys = emojiList.map(e => e.key);

    let description = "";
    for (const item of emojiList) {
      description += `**${item.key}:** ${item.emoji}\n`;
    }

    const unmappedCount = Object.keys(DEFAULT_EMOJIS).length - mappedKeys.length;

    const embed = {
      title: "🎨 Custom Emoji Mappings",
      description: description || "No custom emojis set yet. Use `/emoji add` or `/emoji sync` to set them.",
      color: 0xFFCBA4,
      fields: [
        {
          name: "📊 Stats",
          value: `Mapped: ${mappedKeys.length} | Default: ${unmappedCount}`,
          inline: false
        }
      ]
    };

    interaction.reply({ embeds: [embed], ephemeral: true });
  },

  async syncEmojis(interaction, guildId, guild) {
    const synced = emojiService.syncEmojis(guildId, guild);
    const missing = emojiService.getMissingEmojis(guildId, guild);

    let description = "";
    if (synced > 0) {
      description += `✅ Synced **${synced}** emoji(s) from server emojis.\n\n`;
    } else {
      description += `ℹ️ No matching server emojis found to sync.\n\n`;
    }

    if (missing.length > 0) {
      description += "**💡 Available server emojis that can be mapped:**\n";
      for (const item of missing.slice(0, 10)) {
        description += `\`${item.key}\`: ${item.suggested} (${item.name})\n`;
      }
      if (missing.length > 10) {
        description += `_...and ${missing.length - 10} more_`;
      }
    }

    const embed = {
      title: "🔄 Emoji Sync Complete",
      description,
      color: synced > 0 ? 0x00FF00 : 0xFFCBA4
    };

    interaction.reply({ embeds: [embed], ephemeral: true });
  },

  async resetEmojis(interaction, guildId) {
    emojiService.resetEmojis(guildId);

    interaction.reply({
      content: "✅ All emoji mappings have been reset to defaults.",
      ephemeral: true
    });
  },

  async previewEmoji(interaction, guildId, guild) {
    const key = interaction.options.getString("key");
    const emoji = emojiService.getEmoji(guildId, key, guild);
    const defaultEmoji = DEFAULT_EMOJIS[key];

    const embed = {
      title: `Preview: ${key}`,
      description: `**Current:** ${emoji}\n**Default:** ${defaultEmoji}`,
      color: 0xFFCBA4
    };

    interaction.reply({ embeds: [embed], ephemeral: true });
  }
};
