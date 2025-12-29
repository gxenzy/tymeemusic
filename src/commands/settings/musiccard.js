import { Command } from "#structures/classes/Command";
import { ContainerBuilder, MessageFlags, SectionBuilder, SeparatorBuilder, SeparatorSpacingSize, TextDisplayBuilder, ThumbnailBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from "discord.js";
import { config } from "#config/config";
import emoji from "#config/emoji";
import { db } from "#database/DatabaseManager";
import { logger } from "#utils/logger";

class MusicCardCommand extends Command {
  constructor() {
    super({
      name: "musiccard",
      description: "Customize the music player card background",
      usage: "musiccard <action> [value]",
      aliases: ["cardbg", "musicbg"],
      category: "settings",
      examples: [
        "musiccard",
        "musiccard image",
        "musiccard color #ff0000",
        "musiccard gradient blue",
        "musiccard reset"
      ],
      cooldown: 5,
      enabledSlash: true,
      slashData: {
        name: "musiccard",
        description: "Customize the music player card background",
        options: [
          {
            name: "action",
            description: "What to do with the music card",
            type: 3,
            required: false,
            choices: [
              { name: "Set Background Image", value: "image" },
              { name: "Set Solid Color", value: "color" },
              { name: "Set Gradient Style", value: "gradient" },
              { name: "Reset to Default", value: "reset" },
            ],
          },
          {
            name: "value",
            description: "Value for the action (color hex, gradient name, or image URL)",
            type: 3,
            required: false,
          },
        ],
      },
    });
  }

  async execute({ client, message, args }) {
    try {
      const action = args[0]?.toLowerCase();
      const value = args.slice(1).join(" ");

      if (!action) {
        return this._showMainMenu(message);
      }

      switch (action) {
        case "image":
          return this._handleImageUpload(message, value);
        case "color":
          return this._handleColorSet(message, value);
        case "gradient":
          return this._handleGradientSet(message, value);
        case "reset":
          return this._handleReset(message);
        default:
          return this._sendError(message, "Invalid action. Use: image, color, gradient, or reset");
      }
    } catch (error) {
      logger.error("MusicCardCommand", `Error in prefix command: ${error.message}`, error);
      return this._sendError(message, "An error occurred. Please try again.");
    }
  }

  async slashExecute({ client, interaction }) {
    try {
      const action = interaction.options.getString("action");
      const value = interaction.options.getString("value");

      if (!action) {
        return this._showMainMenu(interaction);
      }

      switch (action) {
        case "image":
          return this._handleImageUpload(interaction, value);
        case "color":
          return this._handleColorSet(interaction, value);
        case "gradient":
          return this._handleGradientSet(interaction, value);
        case "reset":
          return this._handleReset(interaction);
        default:
          return this._sendError(interaction, "Invalid action.");
      }
    } catch (error) {
      logger.error("MusicCardCommand", `Error in slash command: ${error.message}`, error);
      return this._sendError(interaction, "An error occurred. Please try again.");
    }
  }

  async _showMainMenu(context) {
    const container = new ContainerBuilder();

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`${emoji.get('settings')} **Music Card Background Settings**`)
    );

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
    );

    const content = `**Customize your music player card background**\n\n` +
      `├─ **${emoji.get('image')} Background Image:** Upload or provide image URL\n` +
      `├─ **${emoji.get('color')} Solid Color:** Set a custom color (hex code)\n` +
      `├─ **${emoji.get('gradient')} Gradient Style:** Choose from preset gradients\n` +
      `└─ **${emoji.get('reset')} Reset:** Return to default background\n\n` +
      `*Changes apply to all music cards in this server*`;

    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(content)
        )
        .setThumbnailAccessory(
          new ThumbnailBuilder().setURL(config.assets.defaultTrackArtwork)
        )
    );

    const buttons = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('musiccard_image')
          .setLabel('Background Image')
          .setStyle(ButtonStyle.Primary)
          .setEmoji('🖼️'),
        new ButtonBuilder()
          .setCustomId('musiccard_color')
          .setLabel('Solid Color')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('🌈'),
        new ButtonBuilder()
          .setCustomId('musiccard_gradient')
          .setLabel('Gradient Style')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('🎨'),
        new ButtonBuilder()
          .setCustomId('musiccard_reset')
          .setLabel('Reset')
          .setStyle(ButtonStyle.Danger)
          .setEmoji('🔄')
      );

    const sent = await this._reply(context, [container, buttons]);

    if (sent) {
      this._setupCollector(sent, context.author || context.user);
    }
  }

  async _handleImageUpload(context, value) {
    if (value) {
      // Handle URL input
      return this._setBackgroundImage(context, value);
    }

    // Show upload prompt
    const container = new ContainerBuilder();

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`${emoji.get('image')} **Set Background Image**`)
    );

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
    );

    const content = `**Upload an image or provide a URL**\n\n` +
      `├─ **Supported formats:** PNG, JPG, JPEG, GIF, WebP\n` +
      `├─ **Maximum size:** 8MB\n` +
      `├─ **Recommended:** 780x260 pixels or higher\n` +
      `└─ **Note:** Image will be resized to fit the card\n\n` +
      `*Upload an image file or use: \`musiccard image <url>\`*`;

    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(content)
        )
        .setThumbnailAccessory(
          new ThumbnailBuilder().setURL(config.assets.defaultTrackArtwork)
        )
    );

    const sent = await this._reply(context, container);

    if (sent) {
      this._setupImageCollector(sent, context.author || context.user, context.guild.id);
    }
  }

  async _handleColorSet(context, value) {
    if (!value) {
      return this._sendError(context, "Please provide a hex color code. Example: `#ff0000` for red");
    }

    const colorRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
    if (!colorRegex.test(value)) {
      return this._sendError(context, "Invalid color format. Use hex codes like `#ff0000` or `#f00`");
    }

    try {
      await this._saveBackgroundSetting(context.guild.id, 'color', value);

      const container = new ContainerBuilder();

      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`${emoji.get('check')} **Background Color Set**`)
      );

      container.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
      );

      const content = `**Solid color background applied**\n\n` +
        `├─ **Color:** ${value}\n` +
        `└─ **Applied to:** All music cards in this server\n\n` +
        `*Changes will be visible on the next track*`;

      container.addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(content)
          )
          .setThumbnailAccessory(
            new ThumbnailBuilder().setURL(config.assets.defaultTrackArtwork)
          )
      );

      return this._reply(context, container);
    } catch (error) {
      logger.error("MusicCardCommand", `Error setting color: ${error.message}`, error);
      return this._sendError(context, "Failed to save color setting.");
    }
  }

  async _handleGradientSet(context, value) {
    const availableGradients = {
      blue: "Blue Ocean",
      purple: "Purple Dream",
      sunset: "Sunset Glow",
      forest: "Forest Green",
      fire: "Fire Red",
      ocean: "Deep Ocean",
      cosmic: "Cosmic Blue",
      aurora: "Aurora Borealis"
    };

    if (!value) {
      const gradientList = Object.entries(availableGradients)
        .map(([key, name]) => `\`${key}\` - ${name}`)
        .join('\n');

      const container = new ContainerBuilder();

      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`${emoji.get('gradient')} **Available Gradients**`)
      );

      container.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
      );

      const content = `**Choose a gradient style:**\n\n${gradientList}\n\n` +
        `*Use: \`musiccard gradient <style>\`*`;

      container.addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(content)
          )
          .setThumbnailAccessory(
            new ThumbnailBuilder().setURL(config.assets.defaultTrackArtwork)
          )
      );

      return this._reply(context, container);
    }

    if (!availableGradients[value]) {
      return this._sendError(context, `Invalid gradient style. Available: ${Object.keys(availableGradients).join(', ')}`);
    }

    try {
      await this._saveBackgroundSetting(context.guild.id, 'gradient', value);

      const container = new ContainerBuilder();

      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`${emoji.get('check')} **Gradient Background Set**`)
      );

      container.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
      );

      const content = `**Gradient background applied**\n\n` +
        `├─ **Style:** ${availableGradients[value]}\n` +
        `└─ **Applied to:** All music cards in this server\n\n` +
        `*Changes will be visible on the next track*`;

      container.addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(content)
          )
          .setThumbnailAccessory(
            new ThumbnailBuilder().setURL(config.assets.defaultTrackArtwork)
          )
      );

      return this._reply(context, container);
    } catch (error) {
      logger.error("MusicCardCommand", `Error setting gradient: ${error.message}`, error);
      return this._sendError(context, "Failed to save gradient setting.");
    }
  }

  async _handleReset(context) {
    try {
      await this._saveBackgroundSetting(context.guild.id, 'default', null);

      const container = new ContainerBuilder();

      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`${emoji.get('check')} **Background Reset**`)
      );

      container.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
      );

      const content = `**Music card background reset to default**\n\n` +
        `└─ **Applied to:** All music cards in this server\n\n` +
        `*Changes will be visible on the next track*`;

      container.addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(content)
          )
          .setThumbnailAccessory(
            new ThumbnailBuilder().setURL(config.assets.defaultTrackArtwork)
          )
      );

      return this._reply(context, container);
    } catch (error) {
      logger.error("MusicCardCommand", `Error resetting background: ${error.message}`, error);
      return this._sendError(context, "Failed to reset background.");
    }
  }

  async _setBackgroundImage(context, imageUrl) {
    try {
      // Validate URL format
      new URL(imageUrl);

      await this._saveBackgroundSetting(context.guild.id, 'image', imageUrl);

      const container = new ContainerBuilder();

      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`${emoji.get('check')} **Background Image Set**`)
      );

      container.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
      );

      const content = `**Image background applied**\n\n` +
        `├─ **URL:** ${imageUrl.substring(0, 50)}${imageUrl.length > 50 ? '...' : ''}\n` +
        `└─ **Applied to:** All music cards in this server\n\n` +
        `*Changes will be visible on the next track*`;

      container.addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(content)
          )
          .setThumbnailAccessory(
            new ThumbnailBuilder().setURL(imageUrl)
          )
      );

      return this._reply(context, container);
    } catch (error) {
      if (error instanceof TypeError) {
        return this._sendError(context, "Invalid URL format. Please provide a valid image URL.");
      }
      logger.error("MusicCardCommand", `Error setting image: ${error.message}`, error);
      return this._sendError(context, "Failed to save image setting.");
    }
  }

  async _saveBackgroundSetting(guildId, type, value) {
    try {
      if (!db.guild.setMusicCardSettings) {
        throw new Error("Database method not available");
      }

      await db.guild.setMusicCardSettings(guildId, { type, value });
    } catch (error) {
      logger.error("MusicCardCommand", `Error saving background setting: ${error.message}`, error);
      throw error;
    }
  }

  _setupCollector(message, user) {
    const collector = message.createMessageComponentCollector({
      filter: (i) => i.user.id === user.id,
      time: 300000, // 5 minutes
    });

    collector.on('collect', async (interaction) => {
      try {
        await interaction.deferUpdate();

        switch (interaction.customId) {
          case 'musiccard_image':
            await this._handleImageUpload(interaction, null);
            break;
          case 'musiccard_color':
            await interaction.editReply({
              components: [this._createColorPromptContainer()],
              flags: MessageFlags.IsComponentsV2,
            });
            break;
          case 'musiccard_gradient':
            await this._handleGradientSet(interaction, null);
            break;
          case 'musiccard_reset':
            await this._handleReset(interaction);
            break;
        }
      } catch (error) {
        logger.error("MusicCardCommand", `Error in collector: ${error.message}`, error);
      }
    });

    collector.on('end', () => {
      try {
        message.edit({ components: [] }).catch(() => {});
      } catch (error) {
        // Ignore errors when editing expired messages
      }
    });
  }

  _setupImageCollector(message, user, guildId) {
    const collector = message.channel.createMessageCollector({
      filter: (m) => m.author.id === user.id,
      time: 300000, // 5 minutes
      max: 1,
    });

    collector.on('collect', async (msg) => {
      try {
        const attachment = msg.attachments.first();
        if (attachment) {
          if (!attachment.contentType?.startsWith('image/')) {
            return msg.reply('Please upload a valid image file.');
          }
          if (attachment.size > 8 * 1024 * 1024) { // 8MB limit
            return msg.reply('Image file is too large. Maximum size is 8MB.');
          }
          await this._setBackgroundImage(msg, attachment.url);
          await msg.delete().catch(() => {});
        } else if (msg.content) {
          await this._setBackgroundImage(msg, msg.content);
          await msg.delete().catch(() => {});
        }
      } catch (error) {
        logger.error("MusicCardCommand", `Error in image collector: ${error.message}`, error);
      }
    });
  }

  _createColorPromptContainer() {
    const container = new ContainerBuilder();

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`${emoji.get('color')} **Set Solid Color**`)
    );

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
    );

    const content = `**Enter a hex color code**\n\n` +
      `├─ **Format:** \`#RRGGBB\` or \`#RGB\`\n` +
      `├─ **Examples:** \`#ff0000\` (red), \`#00ff00\` (green), \`#0000ff\` (blue)\n` +
      `└─ **Tools:** Use online color pickers for hex codes\n\n` +
      `*Reply with the color code to apply it*`;

    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(content)
        )
        .setThumbnailAccessory(
          new ThumbnailBuilder().setURL(config.assets.defaultTrackArtwork)
        )
    );

    return container;
  }

  _sendError(context, message) {
    const container = new ContainerBuilder();

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`${emoji.get('cross')} **Error**`)
    );

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
    );

    const content = `**Something went wrong**\n\n` +
      `├─ **${emoji.get('info')} Issue:** ${message}\n` +
      `└─ **${emoji.get('reset')} Action:** Try again or check your input\n\n` +
      `*Please check your input and try again*`;

    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(content)
        )
        .setThumbnailAccessory(
          new ThumbnailBuilder().setURL(config.assets.errorIcon || config.assets.defaultTrackArtwork)
        )
    );

    return this._reply(context, container);
  }

  async _reply(context, components) {
    const payload = {
      components: Array.isArray(components) ? components : [components],
      flags: MessageFlags.IsComponentsV2,
      fetchReply: true
    };

    try {
      if (context.replied || context.deferred) {
        return context.followUp(payload);
      }
      return context.reply(payload);
    } catch(e) {
      logger.error("MusicCardCommand", "Failed to reply:", e);
      return null;
    }
  }
}

export default new MusicCardCommand();
