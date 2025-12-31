import { Guild } from "#db/Guild";
import { User } from "#db/User";
import { Playlists } from "#db/Playlists"
import { Premium } from "#db/Premium";
import { Emoji } from "#db/Emoji";
import { logger } from "#utils/logger";
import { config } from "#config/config";
import { unlinkSync, existsSync } from "fs";

export class DatabaseManager {
  constructor() {
    this.initDatabases();
  }

  initDatabases() {
    try {
      // Reset databases if requested
      if (config.databaseReset) {
        this.resetAllDatabases();
        logger.warn("DatabaseManager", "All databases have been reset as requested");
      }

      this.guild = new Guild();
      this.user = new User();
      this.premium = new Premium();
      this.playlists = new Playlists();
      this.emoji = new Emoji();
      logger.success(
        "DatabaseManager",
        "All databases initialized successfully",
      );
    } catch (error) {
      logger.error("DatabaseManager", "Failed to initialize databases", error);
      throw error;
    }
  }

  resetAllDatabases() {
    try {
      // Close any existing connections first
      this.closeAll();

      // Delete database files
      const dbPaths = Object.values(config.database);
      for (const dbPath of dbPaths) {
        try {
          if (existsSync(dbPath)) {
            unlinkSync(dbPath);
            logger.info("DatabaseManager", `Deleted database: ${dbPath}`);
          }
        } catch (error) {
          logger.warn("DatabaseManager", `Failed to delete ${dbPath}:`, error.message);
        }
      }

      logger.success("DatabaseManager", "All databases reset successfully");
    } catch (error) {
      logger.error("DatabaseManager", "Error resetting databases", error);
    }
  }

  closeAll() {
    try {
      if (this.guild) this.guild.close();
      if (this.user) this.user.close();
      if (this.premium) this.premium.close();
      if (this.playlists) this.playlists.close();
      if (this.emoji) this.emoji.close();
      logger.info("DatabaseManager", "All database connections closed");
    } catch (error) {
      logger.error("DatabaseManager", "Error closing databases", error);
    }
  }
  }

  getPrefixes(guildId) {
    return this.guild.getPrefixes(guildId);
  }

  setPrefixes(guildId, prefixes) {
    return this.guild.setPrefixes(guildId, prefixes);
  }

  isGuildBlacklisted(guildId) {
    return this.guild.isBlacklisted(guildId);
  }

  blacklistGuild(guildId, reason = "No reason provided") {
    return this.guild.blacklistGuild(guildId, reason);
  }

  unblacklistGuild(guildId) {
    return this.guild.unblacklistGuild(guildId);
  }

  hasNoPrefix(userId) {
    return this.user.hasNoPrefix(userId);
  }

  setNoPrefix(userId, enabled, expiryTimestamp = null) {
    return this.user.setNoPrefix(userId, enabled, expiryTimestamp);
  }

  getUserPrefixes(userId) {
    return this.user.getUserPrefixes(userId);
  }

  setUserPrefixes(userId, prefixes) {
    return this.user.setUserPrefixes(userId, prefixes);
  }

  isUserBlacklisted(userId) {
    return this.user.isBlacklisted(userId);
  }

  blacklistUser(userId, reason = "No reason provided") {
    return this.user.blacklistUser(userId, reason);
  }

  unblacklistUser(userId) {
    return this.user.unblacklistUser(userId);
  }

  getUserData(userId) {
    return this.user.ensureUser(userId);
  }

  isUserPremium(userId) {
    return this.premium.isUserPremium(userId);
  }

  isGuildPremium(guildId) {
    return this.premium.isGuildPremium(guildId);
  }

  hasAnyPremium(userId, guildId) {
    return this.premium.hasAnyPremium(userId, guildId);
  }

  grantUserPremium(
    userId,
    grantedBy,
    expiresAt = null,
    reason = "Premium granted",
  ) {
    return this.premium.grantUserPremium(userId, grantedBy, expiresAt, reason);
  }

  grantGuildPremium(
    guildId,
    grantedBy,
    expiresAt = null,
    reason = "Premium granted",
  ) {
    return this.premium.grantGuildPremium(
      guildId,
      grantedBy,
      expiresAt,
      reason,
    );
  }

  revokeUserPremium(userId) {
    return this.premium.revokeUserPremium(userId);
  }

  revokeGuildPremium(guildId) {
    return this.premium.revokeGuildPremium(guildId);
  }
}

export const db = new DatabaseManager();
