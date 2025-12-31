import { Command } from "#structures/classes/Command";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  StringSelectMenuBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder,
  ComponentType,
  UserSelectMenuBuilder,
  RoleSelectMenuBuilder,
  ChannelSelectMenuBuilder,
  MentionableSelectMenuBuilder,
} from "discord.js";
import { config } from "#config/config";
import emoji from "#config/emoji";
import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";

import { logger } from "#utils/logger";

class HelpCommand extends Command {
  constructor() {
    super({
      name: "help",
      description: "Shows all available commands and their information",
      usage: "help [command]",
      aliases: ["h", "commands"],
      category: "info",
      examples: ["help", "help play", "help music", "h skip"],
      cooldown: 3,
      enabledSlash: true,
      slashData: {
        name: "help",
        description: "Get help for commands",
        options: [
          {
            name: "command",
            description: "Specific command to get help for",
            type: 3,
            required: false,
            autocomplete: true,
          },
        ],
      },
    });
  }

  async _scanCommandDirectories() {
    try {
      const commandsPath = path.join(process.cwd(), "src", "commands");
      const commands = new Map();
      const categories = new Map();
      const subcategories = new Map();

      if (!fs.existsSync(commandsPath)) {
        logger.warn("HelpCommand", "Commands directory not found");
        return { commands, categories, subcategories };
      }

      const categoryDirs = fs
        .readdirSync(commandsPath, { withFileTypes: true })
        .filter((dirent) => dirent.isDirectory())
        .map((dirent) => dirent.name)
        .filter((name) => name !== "developer");

      for (const categoryName of categoryDirs) {
        const categoryPath = path.join(commandsPath, categoryName);

        if (!categories.has(categoryName)) {
          categories.set(categoryName, []);
        }

        await this._scanCategoryDirectory(
          categoryPath,
          categoryName,
          commands,
          categories,
          subcategories,
        );
      }

      return { commands, categories, subcategories };
    } catch (error) {
      logger.error("HelpCommand", "Error scanning command directories:", error);
      return {
        commands: new Map(),
        categories: new Map(),
        subcategories: new Map(),
      };
    }
  }

  async _scanCategoryDirectory(
    categoryPath,
    categoryName,
    commands,
    categories,
    subcategories,
  ) {
    try {
      const items = fs.readdirSync(categoryPath, { withFileTypes: true });

      const commandFiles = items
        .filter((item) => item.isFile() && item.name.endsWith(".js"))
        .map((item) => item.name);

      for (const file of commandFiles) {
        await this._loadCommand(
          path.join(categoryPath, file),
          categoryName,
          commands,
          categories,
        );
      }

      const subdirs = items
        .filter((item) => item.isDirectory())
        .map((item) => item.name);

      if (subdirs.length > 0) {
        if (!subcategories.has(categoryName)) {
          subcategories.set(categoryName, new Map());
        }

        const categorySubcats = subcategories.get(categoryName);

        for (const subdir of subdirs) {
          const subdirPath = path.join(categoryPath, subdir);
          const subcategoryCommands = [];

          const subCommandFiles = fs
            .readdirSync(subdirPath, { withFileTypes: true })
            .filter((item) => item.isFile() && item.name.endsWith(".js"))
            .map((item) => item.name);

          for (const file of subCommandFiles) {
            const command = await this._loadCommand(
              path.join(subdirPath, file),
              categoryName,
              commands,
              categories,
            );
            if (command) {
              subcategoryCommands.push(command);
            }
          }

          if (subcategoryCommands.length > 0) {
            categorySubcats.set(subdir, subcategoryCommands);
          }
        }
      }
    } catch (error) {
      logger.error(
        "HelpCommand",
        `Error scanning category directory ${categoryName}:`,
        error,
      );
    }
  }

  async _loadCommand(filePath, categoryName, commands, categories) {
    try {
      const fileUrl = pathToFileURL(filePath).href;
      const { default: CommandClass } = await import(fileUrl);

      if (!CommandClass || typeof CommandClass !== "object") {
        return null;
      }

      // Auto-assign tier based on category and command name
      let commandData = { ...CommandClass };
      
      // Only call _determineCommandTier if tier is 'free' or undefined
      // (not explicitly set to vip/premium/owner)
      const explicitlySetTier = commandData.tier && ['vip', 'premium', 'owner'].includes(commandData.tier);
      
      if (!explicitlySetTier) {
        const determinedTier = this._determineCommandTier(categoryName, commandData.name);
        commandData.tier = determinedTier;
      }

      const command = {
        ...commandData,
        category: categoryName,
      };

      commands.set(command.name, command);

      if (command.aliases && Array.isArray(command.aliases)) {
        for (const alias of command.aliases) {
          commands.set(alias, command);
        }
      }

      const categoryCommands = categories.get(categoryName);
      if (!categoryCommands.find((cmd) => cmd.name === command.name)) {
        categoryCommands.push(command);
      }

      return command;
    } catch (error) {
      logger.error(
        "HelpCommand",
        `Error loading command from ${filePath}:`,
        error,
      );
      return null;
    }
  }

  _determineCommandTier(category, commandName) {
    const tierHierarchy = {
      // Premium tier commands
      premium: [
        'create-playlist', 'delete-playlist', 'my-playlists', 'playlist-info',
        'edit-playlist', 'add2pl', 'remove-track', 'load-playlist',
        'link-spotify', 'unlink-spotify', 'spotify-playlists',
        'premium', 'noptoggle', 'userprefix',
        'blacklist', 'rl', 'updateslash',
        'autoplay', 'history', 'search', 'recommendations',
        'musiccard'
      ],
      // VIP tier commands  
      vip: [
        'seek', 'forward', 'rewind', 'replay',
        'loop', 'bump', 'move',
        'classical', 'electronic', 'hiphop', 'jazz', 'pop', 'rock', 'reggae',
        '247', 'setdefaultvolume'
      ],
      // Free tier is default
      free: []
    };

    // Check premium commands
    if (tierHierarchy.premium.includes(commandName.toLowerCase())) {
      return 'premium';
    }

    // Check VIP commands
    if (tierHierarchy.vip.includes(commandName.toLowerCase())) {
      return 'vip';
    }

    // Check premium categories
    const premiumCategories = ['playlists', 'Spotify', 'developer', 'premium'];
    if (premiumCategories.includes(category.toLowerCase())) {
      return 'premium';
    }

    // Check VIP categories
    const vipCategories = ['settings'];
    if (vipCategories.includes(category.toLowerCase())) {
      return 'vip';
    }

    // Default to free tier
    return 'free';
  }

  async execute({ client, message, args }) {
    try {
      // Get user's tier for this guild
      const userTier = await this._getUserTier(message.author.id, message.guild.id, client);
      const { commands, categories, subcategories } =
        await this._scanCommandDirectories();

      // Filter commands based on user's tier
      const filteredCommands = this._filterCommandsByTier(commands, userTier);

      if (args.length > 0) {
        const commandName = args[0].toLowerCase();
        const command = filteredCommands.get(commandName);

        if (command) {
          return await this._sendCommandHelp(
            message,
            command,
            "message",
            client,
            filteredCommands,
            categories,
            subcategories,
            userTier,
          );
        } else {
          return message.reply({
            components: [
              this._createErrorContainer(`Command "${commandName}" not found or you don't have access.`),
            ],
            flags: MessageFlags.IsComponentsV2,
          });
        }
      }

      // Filter categories based on available commands
      const filteredCategories = this._filterCategoriesByCommands(categories, filteredCommands);
      
      if (filteredCategories.size === 0) {
        return message.reply({
          components: [this._createErrorContainer("No commands available for your tier.")],
          flags: MessageFlags.IsComponentsV2,
        });
      }

      const helpMessage = await message.reply({
        components: [
          this._createMainContainer(filteredCommands, filteredCategories, subcategories, userTier),
        ],
        flags: MessageFlags.IsComponentsV2,
      });

      this._setupCollector(
        helpMessage,
        message.author.id,
        client,
        filteredCommands,
        filteredCategories,
        subcategories,
        userTier,
      );
    } catch (error) {
      client.logger?.error(
        "HelpCommand",
        `Error in prefix command: ${error.message}`,
        error,
      );
      await message
        .reply({
          components: [
            this._createErrorContainer("An error occurred while loading help."),
          ],
          flags: MessageFlags.IsComponentsV2,
        })
        .catch(() => {});
    }
  }

  async slashExecute({ client, interaction }) {
    try {
      // Get user's tier for this guild
      const userTier = await this._getUserTier(interaction.user.id, interaction.guild.id, client);
      const { commands, categories, subcategories } =
        await this._scanCommandDirectories();
      
      // Filter commands based on user's tier
      const filteredCommands = this._filterCommandsByTier(commands, userTier);
      
      const commandName = interaction.options.getString("command");

      if (commandName) {
        const command = filteredCommands.get(commandName.toLowerCase());

        if (command) {
          return await this._sendCommandHelp(
            interaction,
            command,
            "interaction",
            client,
            filteredCommands,
            categories,
            subcategories,
            userTier,
          );
        } else {
          return interaction.reply({
            components: [
              this._createErrorContainer(`Command "${commandName}" not found or you don't have access.`),
            ],
            flags: MessageFlags.IsComponentsV2,
            ephemeral: true,
          });
        }
      }

      // Filter categories based on available commands
      const filteredCategories = this._filterCategoriesByCommands(categories, filteredCommands);

      if (filteredCategories.size === 0) {
        return interaction.reply({
          components: [this._createErrorContainer("No commands available for your tier.")],
          flags: MessageFlags.IsComponentsV2,
          ephemeral: true,
        });
      }

      const helpMessage = await interaction.reply({
        components: [
          this._createMainContainer(filteredCommands, filteredCategories, subcategories, userTier),
        ],
        flags: MessageFlags.IsComponentsV2,
        fetchReply: true,
      });

      this._setupCollector(
        helpMessage,
        interaction.user.id,
        client,
        filteredCommands,
        filteredCategories,
        subcategories,
        userTier,
      );
    } catch (error) {
      client.logger?.error(
        "HelpCommand",
        `Error in slash command: ${error.message}`,
        error,
      );
      try {
        if (interaction.replied || interaction.deferred) {
          await interaction.editReply({
            components: [
              this._createErrorContainer(
                "An error occurred while loading help.",
              ),
            ],
          });
        } else {
          await interaction.reply({
            components: [
              this._createErrorContainer(
                "An error occurred while loading help.",
              ),
            ],
            ephemeral: true,
          });
        }
      } catch (e) {
        logger.error("HelpCommand", "Failed to send error response:", e);
      }
    }
  }

  async autocomplete({ interaction, client }) {
    try {
      const { commands } = await this._scanCommandDirectories();
      const focusedValue = interaction.options.getFocused();

      const uniqueCommands = new Set();
      for (const [name, command] of commands) {
        if (command.name === name) {
          uniqueCommands.add(name);
        }
      }

      const choices = Array.from(uniqueCommands)
        .filter((name) =>
          name.toLowerCase().includes(focusedValue.toLowerCase()),
        )
        .slice(0, 25)
        .map((name) => ({ name, value: name }));

      await interaction.respond(choices);
    } catch (error) {
      await interaction.respond([]).catch(() => {});
    }
  }

  // ============ TIER-BASED COMMAND FILTERING ============

  async _getUserTier(userId, guildId, client) {
    try {
      // Check if user is bot owner
      const { config } = await import('#config/config');
      if (config.ownerIds?.includes(userId)) {
        return 'owner';
      }

      // Get guild settings
      const { DatabaseManager } = await import('#database/DatabaseManager');
      const { db } = await import('#database/DatabaseManager');
      const guildDb = db.guild;
      
      const guild = guildDb.ensureGuild(guildId);
      const tier = guildDb.getTier(guildId) || 'free';
      
      // If tier is owner, only bot owners get it
      if (tier === 'owner') {
        return config.ownerIds?.includes(userId) ? 'owner' : 'free';
      }

      const guildObj = client.guilds.cache.get(guildId);
      if (!guildObj) return 'denied';
      
      let member = guildObj.members.cache.get(userId);
      if (!member) {
        try {
          member = await guildObj.members.fetch(userId);
        } catch (e) {
          // Ignore
        }
      }
      if (!member) return 'denied';

      // Get all tier data (roles and users)
      const tierData = guildDb.getAllTierData(guildId);

      // Check premium users first
      if (tierData.users.premium.includes(userId)) {
        return 'premium';
      }

      // Check premium roles
      if (tierData.roles.premium.some(roleId => member.roles.cache.has(roleId))) {
        return 'premium';
      }

      // Check VIP users
      if (tierData.users.vip.includes(userId)) {
        return 'vip';
      }

      // Check VIP roles
      if (tierData.roles.vip.some(roleId => member.roles.cache.has(roleId))) {
        return 'vip';
      }

      // Check allowed users
      if (tierData.users.allowed.includes(userId)) {
        return 'free';
      }

      // Check allowed roles for free tier
      if (tierData.roles.allowed.some(roleId => member.roles.cache.has(roleId))) {
        return 'free';
      }

      // No matching users or roles - check server tier setting
      if (tier === 'free' || tier === 'vip' || tier === 'premium') {
        return tier;
      }

      return 'denied';
    } catch (error) {
      logger.error("HelpCommand", "Error getting user tier:", error);
      return 'free';
    }
  }

  _getCommandTier(command) {
    // Check new tier property first
    if (command.tier) {
      const validTiers = ['free', 'vip', 'premium', 'owner'];
      if (validTiers.includes(command.tier)) {
        return command.tier;
      }
    }

    // Check legacy flags
    if (command.ownerOnly) return 'owner';
    if (command.vipOnly) return 'vip';
    if (command.userPrem || command.guildPrem || command.anyPrem) return 'premium';

    return 'free';
  }

  _filterCommandsByTier(commands, userTier) {
    const tierHierarchy = { denied: 0, free: 1, vip: 2, premium: 3, owner: 4 };
    const userTierLevel = tierHierarchy[userTier] || 0;

    const filtered = new Map();
    
    for (const [name, command] of commands) {
      // Only add unique commands (not aliases)
      if (name !== command.name) continue;

      const commandTier = this._getCommandTier(command);
      const commandTierLevel = tierHierarchy[commandTier] || 0;

      // User can access command if their tier >= command's tier
      if (userTierLevel >= commandTierLevel) {
        filtered.set(name, command);
      }
    }

    return filtered;
  }

  _filterCategoriesByCommands(categories, filteredCommands) {
    const filtered = new Map();
    
    for (const [categoryName, commands] of categories) {
      // Filter commands in this category
      const filteredCategoryCommands = commands.filter(cmd => 
        filteredCommands.has(cmd.name)
      );
      
      if (filteredCategoryCommands.length > 0) {
        filtered.set(categoryName, filteredCategoryCommands);
      }
    }

    return filtered;
  }

  _getTierDisplayName(tier) {
    const names = {
      free: 'Free',
      vip: 'VIP',
      premium: 'Premium',
      owner: 'Owner',
      denied: 'Denied'
    };
    return names[tier] || tier;
  }

  _createMainContainer(commands, categories, subcategories, userTier = 'free') {
    try {
      const categoryArray = Array.from(categories.keys());
      const uniqueCommands = Array.from(commands.values()).filter(
        (cmd, index, arr) =>
          arr.findIndex((c) => c.name === cmd.name) === index,
      );

      const slashCommands = uniqueCommands.filter(
        (cmd) => cmd.enabledSlash && cmd.slashData,
      );

      const container = new ContainerBuilder();

      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `${emoji.get("info")} **Help Menu**`,
        ),
      );

      container.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
      );

      // Show user's tier
      const tierEmoji = {
        free: '🎵',
        vip: '⭐',
        premium: '💎',
        owner: '👑'
      };
      const tierColor = {
        free: '#5865F2',
        vip: '#FEE75C',
        premium: '#EB459E',
        owner: '#ED4245'
      };

      let content = `**Your Access: ${tierEmoji[userTier] || '🎵'} ${this._getTierDisplayName(userTier)} Tier**\n\n`;
      content += `┌─ **${emoji.get("info")} Statistics**\n`;
      content += `├─ Available Commands: ${uniqueCommands.length}\n`;
      content += `├─ Slash Commands: ${slashCommands.length}\n`;
      content += `├─ Categories: ${categoryArray.length}\n`;
      content += `└─ Your Tier: ${this._getTierDisplayName(userTier)}\n\n`;

      content += `**Available Categories:**\n`;

      categoryArray.forEach((category, index) => {
        const isLast = index === categoryArray.length - 1;
        const prefix = isLast ? "└─" : "├─";
        const categoryCommands = categories.get(category) || [];
        const subcats = subcategories.get(category);
        const subcatCount = subcats ? subcats.size : 0;
        const info = subcatCount > 0 
          ? `${categoryCommands.length} commands, ${subcatCount} subcategories`
          : `${categoryCommands.length} commands`;

        content += `${prefix} **${emoji.get("folder")} ${this._capitalize(category)}** (${info})\n`;
      });

      const section = new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
        .setThumbnailAccessory(
          new ThumbnailBuilder().setURL(
            config.assets?.helpThumbnail || config.assets?.defaultThumbnail,
          ),
        );

      container.addSectionComponents(section);

      container.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
      );

      if (categoryArray.length === 0) {
        return this._createErrorContainer("No command categories available.");
      }

      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId("help_category_select")
        .setPlaceholder("Select a category")
        .addOptions(
          categoryArray.map((category) => {
            const categoryCommands = categories.get(category) || [];
            const subcats = subcategories.get(category);
            const subcatCount = subcats ? subcats.size : 0;
            const description =
              subcatCount > 0
                ? `${categoryCommands.length} commands, ${subcatCount} subcategories`
                : `${categoryCommands.length} commands`;

            return {
              label: this._capitalize(category),
              value: category,
              emoji: emoji.get("folder"),
              description,
            };
          }),
        );

      container.addActionRowComponents(
        new ActionRowBuilder().addComponents(selectMenu),
      );

      return container;
    } catch (error) {
      logger.error("HelpCommand", "Error creating main container:", error);
      return this._createErrorContainer("Unable to load help menu.");
    }
  }

  _createCategoryContainer(category, categories, subcategories, userTier = 'free') {
    try {
      const commands = categories.get(category) || [];
      const subcats = subcategories.get(category);

      if (commands.length === 0 && (!subcats || subcats.size === 0)) {
        return this._createErrorContainer(
          `No commands found in category "${category}".`,
        );
      }

      const container = new ContainerBuilder();

      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `${emoji.get("info")} **${this._capitalize(category)} Commands**`,
        ),
      );

      container.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
      );

      let content = `**${this._capitalize(category)} Category**\n\n`;
      content += `Your Tier: ${this._getTierDisplayName(userTier)}\n\n`;

      
      const directCommands = commands.filter((cmd) => {
        if (!subcats) return true;
        for (const [, subcatCommands] of subcats) {
          if (subcatCommands.find((subcmd) => subcmd.name === cmd.name)) {
            return false;
          }
        }
        return true;
      });

      const hasDirectCommands = directCommands.length > 0;
      const hasSubcats = subcats && subcats.size > 0;
      const subcatEntries = hasSubcats ? Array.from(subcats.entries()) : [];

    
      if (hasDirectCommands) {
        directCommands.forEach((cmd, index) => {
          const isLast = index === directCommands.length - 1 && !hasSubcats;
          const prefix = isLast ? "└── " : "├── ";
          content += `${prefix}${emoji.get("info")}\`${cmd.name}\`\n`;
        });
      }

    
      if (hasSubcats) {
        subcatEntries.forEach(([subcatName, subcatCommands], subcatIndex) => {
          const isLastSubcat = subcatIndex === subcatEntries.length - 1;
          const prefix = isLastSubcat ? "└── " : "├── ";

          content += `${prefix}${emoji.get("folder")}**${this._capitalize(subcatName)}**\n`;

          
          const commandList = subcatCommands.map(cmd => `\`${cmd.name}\``).join(", ");
          const indent = isLastSubcat ? "    " : "│   ";
          content += `${indent}${commandList}\n`;
        });
      }

      const section = new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
        .setThumbnailAccessory(
          new ThumbnailBuilder().setURL(
            config.assets?.helpThumbnail || config.assets?.defaultThumbnail,
          ),
        );

      container.addSectionComponents(section);

      container.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
      );

      const allCategoryCommands = [...commands];
      if (allCategoryCommands.length > 0) {
        const selectMenu = new StringSelectMenuBuilder()
          .setCustomId(`help_command_select_${category}`)
          .setPlaceholder(`Select a command for detailed info`)
          .addOptions(
            allCategoryCommands.slice(0, 25).map((cmd) => ({
              label: cmd.name,
              emoji: emoji.get("info"),
              value: cmd.name,
              description: cmd.description
                ? cmd.description.slice(0, 100)
                : "No description",
            })),
          );

        container.addActionRowComponents(
          new ActionRowBuilder().addComponents(selectMenu),
        );
      }

      const buttonRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("help_back_main")
          .setLabel("Back")
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId("help_close")
          .setLabel("Close")
          .setStyle(ButtonStyle.Danger),
      );

      container.addActionRowComponents(buttonRow);

      return container;
    } catch (error) {
      logger.error("HelpCommand", "Error creating category container:", error);
      return this._createErrorContainer("Unable to load category commands.");
    }
  }

  _createCommandContainer(command, category, userTier = 'free') {
    try {
      if (!command) return this._createErrorContainer("Command not found");

      const container = new ContainerBuilder();

      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `${emoji.get("info")} **Command: ${command.name}**`,
        ),
      );

      container.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
      );

      // Get command's required tier
      const commandTier = this._getCommandTier(command);
      const tierEmoji = { free: '🎵', vip: '⭐', premium: '💎', owner: '👑' };
      
      let content = `**Command Information**\n\n`;
      content += `┌─ **${emoji.get("info")} Basic Info**\n`;
      content += `├─ Description: ${command.description || "No description provided"}\n`;
      content += `├─ Usage: \`${command.usage || command.name}\`\n`;
      content += `├─ Category: ${this._capitalize(command.category || "misc")}\n`;
      content += `├─ Cooldown: ${command.cooldown || 3}s\n`;
      content += `└─ Required Tier: ${tierEmoji[commandTier] || '🎵'} ${this._getTierDisplayName(commandTier)}\n\n`;

      if (command.aliases?.length) {
        content += `**Aliases:**\n`;
        command.aliases.forEach((a, i) => {
          const isLast = i === command.aliases.length - 1;
          const prefix = isLast ? "└─" : "├─";
          content += `${prefix} \`${a}\`\n`;
        });
        content += "\n";
      }

      if (command.examples?.length) {
        content += `**Examples:**\n`;
        command.examples.forEach((ex, i) => {
          const isLast = i === command.examples.length - 1;
          const prefix = isLast ? "└─" : "├─";
          content += `${prefix} \`${ex}\`\n`;
        });
        content += "\n";
      }

      const requirements = [];
      
      // Tier access info
      const tierHierarchy = { free: 1, vip: 2, premium: 3, owner: 4 };
      const userTierLevel = tierHierarchy[userTier] || 0;
      const commandTierLevel = tierHierarchy[commandTier] || 0;
      
      if (userTierLevel >= commandTierLevel) {
        content += `✅ You have access to this command!\n\n`;
      } else {
        content += `❌ You need ${this._getTierDisplayName(commandTier)} tier to use this command.\n\n`;
      }

      // Other requirements
      if (command.voiceRequired) requirements.push("Voice Channel Required");
      if (command.sameVoiceRequired) requirements.push("Same Voice Channel Required");
      if (command.playerRequired) requirements.push("Music Player Required");
      if (command.playingRequired) requirements.push("Currently Playing Required");
      if (command.maintenance) requirements.push("Maintenance Mode Active");
      if (command.userPermissions?.length)
        requirements.push(
          `User Permissions: ${command.userPermissions.join(", ")}`,
        );
      if (command.permissions?.length)
        requirements.push(`Bot Permissions: ${command.permissions.join(", ")}`);

      if (requirements.length) {
        content += `**Other Requirements:**\n`;
        requirements.forEach((req, i) => {
          const isLast = i === requirements.length - 1;
          const prefix = isLast ? "└─" : "├─";
          content += `${prefix} ${req}\n`;
        });
      }

      const section = new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
        .setThumbnailAccessory(
          new ThumbnailBuilder().setURL(
            config.assets?.helpThumbnail || config.assets?.defaultThumbnail,
          ),
        );

      container.addSectionComponents(section);

      container.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
      );

      const buttons = [
        new ButtonBuilder()
          .setCustomId("help_back_main")
          .setLabel("Back")
          .setStyle(ButtonStyle.Secondary),
      ];

      if (command.enabledSlash && command.slashData) {
        buttons.push(
          new ButtonBuilder()
            .setCustomId(`help_slash_info_${command.name}`)
            .setLabel("Slash Info")
            .setStyle(ButtonStyle.Success),
        );
      }

      container.addActionRowComponents(
        new ActionRowBuilder().addComponents(buttons),
      );

      return container;
    } catch (error) {
      logger.error("HelpCommand", "Error creating command container:", error);
      return this._createErrorContainer("Unable to load command information.");
    }
  }

  _createSlashInfoContainer(command, category, client) {
    try {
      if (!command?.slashData)
        return this._createErrorContainer(
          "Slash command information not available.",
        );

      const container = new ContainerBuilder();

      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `${emoji.get("info")} **Slash Command: ${command.name}**`,
        ),
      );

      container.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
      );

      const slashName = Array.isArray(command.slashData.name)
        ? `/${command.slashData.name.join(" ")}`
        : `/${command.slashData.name}`;

      let content = `**Slash Command Information**\n\n`;
      content += `┌─ **Command:** \`${slashName}\`\n`;
      content += `└─ **Description:** ${command.slashData.description}\n\n`;

      if (command.slashData.options?.length) {
        content += `**Options:**\n`;
        command.slashData.options.forEach((option, i) => {
          const required = option.required ? " (Required)" : " (Optional)";
          const isLast = i === command.slashData.options.length - 1;
          const prefix = isLast ? "└─" : "├─";
          const indent = isLast ? "   " : "│  ";
          content += `${prefix} \`${option.name}\`${required}: ${option.description}\n`;

          if (option.choices?.length) {
            option.choices.forEach((choice, ci) => {
              const isChoiceLast = ci === option.choices.length - 1;
              const choicePrefix = isChoiceLast ? `${indent}└─` : `${indent}├─`;
              content += `${choicePrefix} \`${choice.name}\`\n`;
            });
          }
        });
      }

      const section = new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
        .setThumbnailAccessory(
          new ThumbnailBuilder().setURL(
            client.user.displayAvatarURL({ size: 512, extension: 'png' }),
          ),
        );

      container.addSectionComponents(section);

      container.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
      );

      container.addActionRowComponents(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(
              `help_back_command_${command.name}_${category || command.category || "misc"}`,
            )
            .setLabel("Back")
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId("help_back_main")
            .setLabel("Home")
            .setStyle(ButtonStyle.Primary),
        ),
      );

      return container;
    } catch (error) {
      logger.error(
        "HelpCommand",
        "Error creating slash info container:",
        error,
      );
      return this._createErrorContainer(
        "Unable to load slash command information.",
      );
    }
  }

  _createErrorContainer(message) {
    try {
      const container = new ContainerBuilder();

      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`${emoji.get("cross")} **Error**`),
      );

      container.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
      );

      const content = `**Something went wrong**\n\n┌─ **${emoji.get("info")} Issue:** ${message}\n└─ **${emoji.get("reset")} Action:** Try again or contact support\n\n*Please check your input and try again*`;

      const section = new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(content),
        )
        .setThumbnailAccessory(
          new ThumbnailBuilder().setURL(
            config.assets?.helpThumbnail || config.assets?.defaultThumbnail,
          ),
        );

      container.addSectionComponents(section);

      container.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
      );

      return container;
    } catch (error) {
      logger.error("HelpCommand", "Error creating error container:", error);
      const fallbackContainer = new ContainerBuilder();
      fallbackContainer.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `${emoji.get("cross")} **Error**\n*Help system unavailable*`,
        ),
      );
      return fallbackContainer;
    }
  }

  async _sendCommandHelp(
    messageOrInteraction,
    command,
    type,
    client,
    commands,
    categories,
    subcategories,
    userTier,
  ) {
    try {
      const container = this._createCommandContainer(command, command.category, userTier);

      if (type === "message") {
        const helpMessage = await messageOrInteraction.reply({
          components: [container],
          flags: MessageFlags.IsComponentsV2,
        });
        this._setupCollector(
          helpMessage,
          messageOrInteraction.author.id,
          client,
          commands,
          categories,
          subcategories,
          userTier,
        );
      } else {
        const helpMessage = await messageOrInteraction.reply({
          components: [container],
          flags: MessageFlags.IsComponentsV2,
          fetchReply: true,
        });
        this._setupCollector(
          helpMessage,
          messageOrInteraction.user.id,
          client,
          commands,
          categories,
          subcategories,
          userTier,
        );
      }
    } catch (error) {
      logger.error("HelpCommand", "Error sending command help:", error);
    }
  }

  _setupCollector(
    message,
    userId,
    client,
    commands,
    categories,
    subcategories,
    userTier,
  ) {
    try {
      const filter = (i) => i.user.id === userId;
      const collector = message.createMessageComponentCollector({
        filter,
        time: 300_000,
      });

      collector.on("collect", async (interaction) => {
        try {
          await interaction.deferUpdate();

          if (interaction.customId === "help_close") {
            await interaction.deleteReply().catch(() => {});
            collector.stop();
            return;
          }

          if (interaction.customId === "help_back_main") {
            await interaction.editReply({
              components: [
                this._createMainContainer(commands, categories, subcategories, userTier),
              ],
            });
            return;
          }

          if (interaction.customId === "help_category_select") {
            const category = interaction.values[0];
            await interaction.editReply({
              components: [
                this._createCategoryContainer(
                  category,
                  categories,
                  subcategories,
                  userTier,
                ),
              ],
            });
            return;
          }

          if (interaction.customId.startsWith("help_command_select_")) {
            const category = interaction.customId.replace(
              "help_command_select_",
              "",
            );
            const commandName = interaction.values[0];
            const command = commands.get(commandName);

            if (command) {
              await interaction.editReply({
                components: [this._createCommandContainer(command, category, userTier)],
              });
            }
            return;
          }

          if (interaction.customId.startsWith("help_back_category_")) {
            const category = interaction.customId.replace(
              "help_back_category_",
              "",
            );
            await interaction.editReply({
              components: [
                this._createCategoryContainer(
                  category,
                  categories,
                  subcategories,
                  userTier,
                ),
              ],
            });
            return;
          }

          if (interaction.customId.startsWith("help_slash_info_")) {
            const commandName = interaction.customId.replace(
              "help_slash_info_",
              "",
            );
            const command = commands.get(commandName);

            if (command) {
              await interaction.editReply({
                components: [
                  this._createSlashInfoContainer(command, command.category, client),
                ],
              });
            }
            return;
          }

          if (interaction.customId.startsWith("help_back_command_")) {
            const parts = interaction.customId
              .replace("help_back_command_", "")
              .split("_");
            const commandName = parts[0];
            const category = parts[1];
            const command = commands.get(commandName);

            if (command) {
              await interaction.editReply({
                components: [this._createCommandContainer(command, category, userTier)],
              });
            }
            return;
          }
        } catch (error) {
          client?.logger?.error(
            "HelpCommand",
            `Error in collector: ${error.message}`,
            error,
          );

          try {
            await interaction.followUp({
              content: "An error occurred while processing your request. Please try again.",
              ephemeral: true,
            });
          } catch (followUpError) {
            client?.logger?.error(
              "HelpCommand",
              `Error sending followup: ${followUpError.message}`,
            );
          }
        }
      });

      collector.on("end", async (collected, reason) => {
        if (reason === "limit" || reason === "messageDelete") return;

        try {
          const currentMessage = await this._fetchMessage(message).catch(
            () => null,
          );

          if (!currentMessage?.components?.length) {
            client?.logger?.debug(
              "HelpCommand",
              "No message or components found for disabling",
            );
            return;
          }

          const success = await this._disableAllComponents(
            currentMessage,
            client,
          );

          if (success) {
            client?.logger?.debug(
              "HelpCommand",
              `Components disabled successfully. Reason: ${reason}`,
            );
          }
        } catch (error) {
          this._handleDisableError(error, client, reason);
        }
      });

      collector.on("dispose", async (interaction) => {
        client?.logger?.debug(
          "HelpCommand",
          `Interaction disposed: ${interaction.customId}`,
        );
      });
    } catch (error) {
      logger.error("HelpCommand", "Error setting up collector:", error);
    }
  }

  async _disableAllComponents(message, client) {
    try {
      const disabledComponents = this._processComponents(message.components);

      await message.edit({
        components: disabledComponents,
        flags: MessageFlags.IsComponentsV2,
      });

      return true;
    } catch (error) {
      client?.logger?.error(
        "HelpCommand",
        `Failed to disable components: ${error.message}`,
        error,
      );
      return false;
    }
  }

  _processComponents(components) {
    return components.map((component) => {
      if (component.type === ComponentType.ActionRow) {
        return {
          ...component.toJSON(),
          components: component.components.map((subComponent) => ({
            ...subComponent.toJSON(),
            disabled: true,
          })),
        };
      }

      if (component.type === ComponentType.Container) {
        return {
          ...component.toJSON(),
          components: this._processComponents(component.components),
        };
      }

      if (component.type === ComponentType.Section) {
        const processedComponent = {
          ...component.toJSON(),
          components: this._processComponents(component.components),
        };

        if (
          component.accessory &&
          component.accessory.type === ComponentType.Button
        ) {
          processedComponent.accessory = {
            ...component.accessory.toJSON(),
            disabled: true,
          };
        }

        return processedComponent;
      }

      return component.toJSON();
    });
  }

  _handleDisableError(error, client, reason) {
    if (error.code === 10008) {
      // Unknown Message
      client?.logger?.debug(
        "HelpCommand",
        `Message was deleted, cannot disable components. Reason: ${reason}`,
      );
    } else if (error.code === 50001) {
      // Missing Access
      client?.logger?.warn(
        "HelpCommand",
        `Missing permissions to edit message. Reason: ${reason}`,
      );
    } else {
      client?.logger?.error(
        "HelpCommand",
        `Error disabling components: ${error.message}. Reason: ${reason}`,
        error,
      );
    }
  }

  async _fetchMessage(messageOrInteraction) {
    if (messageOrInteraction.fetchReply) {
      return await messageOrInteraction.fetchReply();
    } else if (messageOrInteraction.fetch) {
      return await messageOrInteraction.fetch();
    } else {
      return messageOrInteraction;
    }
  }

  _shouldDisableComponent(component) {
    const selectMenuTypes = [
      StringSelectMenuBuilder,
      UserSelectMenuBuilder,
      RoleSelectMenuBuilder,
      ChannelSelectMenuBuilder,
      MentionableSelectMenuBuilder,
    ];

    if (selectMenuTypes.some((type) => component instanceof type)) {
      return true;
    }

    if (component instanceof ButtonBuilder) {
      return component.data.style !== ButtonStyle.Link;
    }

    return false;
  }

  _capitalize(str) {
    try {
      if (!str || typeof str !== "string") {
        return "Unknown";
      }
      return str.charAt(0).toUpperCase() + str.slice(1);
    } catch (error) {
      return "Unknown";
    }
  }
}

export default new HelpCommand();