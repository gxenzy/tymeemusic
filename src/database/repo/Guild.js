import { Database } from "#structures/classes/Database";
import { config } from "#config/config";
import { logger } from "#utils/logger";

export class Guild extends Database {
  constructor() {
    super(config.database.guild);
    this.initTable();
  }

  initTable() {
    this.exec(`
      CREATE TABLE IF NOT EXISTS guilds (
        id TEXT PRIMARY KEY,
        prefixes TEXT,
        default_volume INTEGER DEFAULT 100,
        blacklisted BOOLEAN DEFAULT FALSE,
        blacklist_reason TEXT DEFAULT NULL,
        auto_disconnect BOOLEAN DEFAULT TRUE,
        stay_247 BOOLEAN DEFAULT FALSE,
        stay_247_voice_channel TEXT DEFAULT NULL,
        stay_247_text_channel TEXT DEFAULT NULL,
        music_card_settings TEXT DEFAULT NULL,
        dj_roles TEXT DEFAULT '[]',
        dj_role TEXT DEFAULT NULL,
        auto_play BOOLEAN DEFAULT FALSE,
        tier TEXT DEFAULT 'free',
        allowed_roles TEXT DEFAULT '[]',
        vip_roles TEXT DEFAULT '[]',
        premium_roles TEXT DEFAULT '[]',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    try {
      const columns = this.all("PRAGMA table_info(guilds)");
      const colNames = columns.map(c => c.name);

      if (!colNames.includes('music_card_settings')) {
        this.exec(`ALTER TABLE guilds ADD COLUMN music_card_settings TEXT DEFAULT NULL`);
      }
      if (!colNames.includes('dj_role')) {
        this.exec(`ALTER TABLE guilds ADD COLUMN dj_role TEXT DEFAULT NULL`);
      }
      if (!colNames.includes('auto_play')) {
        this.exec(`ALTER TABLE guilds ADD COLUMN auto_play BOOLEAN DEFAULT FALSE`);
      }
      if (!colNames.includes('dj_roles')) {
        this.exec(`ALTER TABLE guilds ADD COLUMN dj_roles TEXT DEFAULT '[]'`);
      }
      if (!colNames.includes('tier')) {
        this.exec(`ALTER TABLE guilds ADD COLUMN tier TEXT DEFAULT 'free'`);
      }
      if (!colNames.includes('allowed_roles')) {
        this.exec(`ALTER TABLE guilds ADD COLUMN allowed_roles TEXT DEFAULT '[]'`);
      }
      if (!colNames.includes('allowed_users')) {
        this.exec(`ALTER TABLE guilds ADD COLUMN allowed_users TEXT DEFAULT '[]'`);
      }
      if (!colNames.includes('vip_roles')) {
        this.exec(`ALTER TABLE guilds ADD COLUMN vip_roles TEXT DEFAULT '[]'`);
      }
      if (!colNames.includes('vip_users')) {
        this.exec(`ALTER TABLE guilds ADD COLUMN vip_users TEXT DEFAULT '[]'`);
      }
      if (!colNames.includes('premium_roles')) {
        this.exec(`ALTER TABLE guilds ADD COLUMN premium_roles TEXT DEFAULT '[]'`);
      }
      if (!colNames.includes('premium_users')) {
        this.exec(`ALTER TABLE guilds ADD COLUMN premium_users TEXT DEFAULT '[]'`);
      }

      // Migrate old dj_role to dj_roles array
      const guildsWithDjRole = this.all("SELECT id, dj_role FROM guilds WHERE dj_role IS NOT NULL AND dj_role != ''");
      for (const guild of guildsWithDjRole) {
        try {
          const djRoles = JSON.stringify([guild.dj_role]);
          this.exec("UPDATE guilds SET dj_roles = ? WHERE id = ?", [djRoles, guild.id]);
        } catch (e) {
          logger.warn('GuildDB', `Failed to migrate dj_role for guild ${guild.id}`);
        }
      }
    } catch (error) {
      logger.error('GuildDB', 'Migration error:', error);
    }
  }
  getStorageId(guildId) {
    if (!guildId) return null;
    return config.clientId ? `${guildId}_${config.clientId}` : guildId;
  }

  // Extract pure guild ID from a storage ID (removes the _clientId suffix)
  getGuildIdFromStorageId(storageId) {
    if (!storageId) return null;
    if (config.clientId && storageId.endsWith(`_${config.clientId}`)) {
      return storageId.slice(0, -(config.clientId.length + 1));
    }
    return storageId;
  }

  getGuild(guildId) {
    if (!guildId) return null;
    const storageId = this.getStorageId(guildId);
    return this.get("SELECT * FROM guilds WHERE id = ?", [storageId]);
  }

  ensureGuild(guildId) {
    if (!guildId) {
      const errorMessage = `[GuildDB] A valid guildId must be provided to ensureGuild. Received: ${guildId}`;
      logger.error(errorMessage);
      throw new Error(errorMessage);
    }

    const storageId = this.getStorageId(guildId);
    let guild = this.getGuild(guildId);
    const defaultPrefix = JSON.stringify([config.prefix]);

    if (!guild) {
      this.exec(
        "INSERT INTO guilds (id, prefixes, default_volume, auto_disconnect, stay_247, stay_247_voice_channel, stay_247_text_channel) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [storageId, defaultPrefix, 100, 1, 0, null, null],
      );
      return this.getGuild(guildId);
    }

    let needsUpdate = false;
    const updates = {};

    if (!guild.prefixes) {
      updates.prefixes = defaultPrefix;
      needsUpdate = true;
    }

    if (guild.default_volume === null || guild.default_volume === undefined) {
      updates.default_volume = 100;
      needsUpdate = true;
    }

    if (guild.auto_disconnect === null || guild.auto_disconnect === undefined) {
      updates.auto_disconnect = 1;
      needsUpdate = true;
    }

    if (guild.stay_247 === null || guild.stay_247 === undefined) {
      updates.stay_247 = 0;
      needsUpdate = true;
    }

    if (needsUpdate) {
      const keys = Object.keys(updates);
      const setClause = keys.map((key) => `${key} = ?`).join(", ");
      const values = keys.map((key) => updates[key]);
      values.push(storageId);

      this.exec(
        `UPDATE guilds SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        values,
      );
      guild = this.getGuild(guildId);
    }

    return guild;
  }

  getPrefixes(guildId) {
    const guild = this.ensureGuild(guildId);
    try {
      const prefixes = JSON.parse(guild.prefixes);
      return Array.isArray(prefixes) && prefixes.length > 0 ? prefixes : [config.prefix];
    } catch (e) {
      return [config.prefix];
    }
  }

  setPrefixes(guildId, prefixes) {
    const storageId = this.getStorageId(guildId);
    this.ensureGuild(guildId);
    const prefixesJson = JSON.stringify(prefixes);
    return this.exec(
      "UPDATE guilds SET prefixes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      [prefixesJson, storageId]
    );
  }

  getDefaultVolume(guildId) {
    const guild = this.ensureGuild(guildId);
    return guild.default_volume || 100;
  }

  setDefaultVolume(guildId, volume) {
    const storageId = this.getStorageId(guildId);
    this.ensureGuild(guildId);

    if (volume < 1 || volume > 100) {
      throw new Error("Volume must be between 1 and 100");
    }

    return this.exec(
      "UPDATE guilds SET default_volume = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      [volume, storageId]
    );
  }

  getAllGuilds() {
    return this.all("SELECT * FROM guilds");
  }

  updateSettings(guildId, settings) {
    const storageId = this.getStorageId(guildId);
    this.ensureGuild(guildId);
    const allowedKeys = [
      "prefixes", "default_volume", "auto_disconnect",
      "stay_247", "stay_247_voice_channel", "stay_247_text_channel",
      "dj_roles", "auto_play", "tier", "allowed_roles",
      "vip_roles", "premium_roles", "allowed_users",
      "vip_users", "premium_users"
    ];
    const keys = Object.keys(settings).filter(key => allowedKeys.includes(key));

    if (keys.length === 0) return null;

    const setClause = keys.map((key) => `${key} = ?`).join(", ");
    const values = keys.map((key) => {
      if (Array.isArray(settings[key])) {
        return JSON.stringify(settings[key]);
      }
      return settings[key];
    });
    values.push(storageId);

    return this.exec(
      `UPDATE guilds SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      values
    );
  }

  blacklistGuild(guildId, reason = "No reason provided") {
    const storageId = this.getStorageId(guildId);
    this.ensureGuild(guildId);
    return this.exec(
      "UPDATE guilds SET blacklisted = 1, blacklist_reason = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      [reason, storageId]
    );
  }

  unblacklistGuild(guildId) {
    const storageId = this.getStorageId(guildId);
    this.ensureGuild(guildId);
    return this.exec(
      "UPDATE guilds SET blacklisted = 0, blacklist_reason = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      [storageId]
    );
  }

  isBlacklisted(guildId) {
    const guild = this.getGuild(guildId);
    if (!guild || !guild.blacklisted) return false;

    return {
      blacklisted: true,
      reason: guild.blacklist_reason || "No reason provided",
    };
  }

  getAllBlacklistedGuilds() {
    return this.all("SELECT * FROM guilds WHERE blacklisted   =1");
  }

  get247Settings(guildId) {
    const guild = this.ensureGuild(guildId);
    return {
      enabled: guild.stay_247 === 1 || guild.stay_247 === true,
      voiceChannel: guild.stay_247_voice_channel,
      textChannel: guild.stay_247_text_channel,
      autoDisconnect: guild.auto_disconnect !== 0 && guild.auto_disconnect !== false
    };
  }
  set247Mode(guildId, enabled, voiceChannelId = null, textChannelId = null) {
    const storageId = this.getStorageId(guildId);
    this.ensureGuild(guildId);
    this.exec(
      "UPDATE guilds SET stay_247 = ?, stay_247_voice_channel = ?, stay_247_text_channel = ?, auto_disconnect = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      [
        enabled ? 1 : 0,
        enabled ? voiceChannelId : null,
        enabled ? textChannelId : null,
        enabled ? 0 : 1,
        storageId,
      ],
    );
    // If enabling 24/7 mode with a voice channel, trigger auto-connect
    if (enabled && voiceChannelId) {
      logger.info('GuildDB', `24/7 mode enabled for guild ${guildId}, voice channel: ${voiceChannelId}`);
    }

    return { enabled, voiceChannelId, textChannelId };
  }

  getAll247Guilds() {
    const guilds = this.all("SELECT * FROM guilds WHERE stay_247 = 1 AND stay_247_voice_channel IS NOT NULL");
    // Map storage IDs to pure Discord guild IDs
    return guilds.map(guild => ({
      ...guild,
      id: this.getGuildIdFromStorageId(guild.id)
    }));
  }

  setAutoDisconnect(guildId, enabled) {
    const storageId = this.getStorageId(guildId);
    this.ensureGuild(guildId);
    return this.exec(
      "UPDATE guilds SET auto_disconnect = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      [enabled ? 1 : 0, storageId]
    );
  }

  getValid247Guilds() {
    const guilds = this.all(`
      SELECT * FROM guilds
      WHERE stay_247   =1
      AND stay_247_voice_channel IS NOT NULL
      AND stay_247_voice_channel   !=''
    `);

    // Map storage IDs to pure Discord guild IDs and filter valid entries
    return guilds
      .filter(guild => guild.stay_247_voice_channel && guild.stay_247_voice_channel.length > 0)
      .map(guild => ({
        ...guild,
        id: this.getGuildIdFromStorageId(guild.id) // Convert storage ID back to pure guild ID
      }));
  }

  getMusicCardSettings(guildId) {
    const guild = this.ensureGuild(guildId);
    if (!guild.music_card_settings) return null;

    try {
      return JSON.parse(guild.music_card_settings);
    } catch (error) {
      logger.warn('GuildDB', `Invalid music card settings for guild ${guildId}:`, error);
      return null;
    }
  }

  setMusicCardSettings(guildId, settings) {
    this.ensureGuild(guildId);
    const settingsJson = JSON.stringify(settings);
    return this.exec(
      "UPDATE guilds SET music_card_settings = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      [settingsJson, guildId]
    );
  }

  // ============ TIER & ROLE MANAGEMENT ============

  getTier(guildId) {
    const guild = this.ensureGuild(guildId);
    return guild.tier || 'free';
  }

  setTier(guildId, tier) {
    this.ensureGuild(guildId);
    const validTiers = ['free', 'vip', 'premium', 'owner'];
    const sanitizedTier = validTiers.includes(tier) ? tier : 'free';
    const storageId = this.getStorageId(guildId);
    return this.exec(
      "UPDATE guilds SET tier = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      [sanitizedTier, storageId]
    );
  }

  getDjRoles(guildId) {
    const guild = this.ensureGuild(guildId);
    try {
      return JSON.parse(guild.dj_roles || '[]');
    } catch (e) {
      return [];
    }
  }

  setDjRoles(guildId, roles) {
    this.ensureGuild(guildId);
    const rolesJson = JSON.stringify(Array.isArray(roles) ? roles : []);
    const storageId = this.getStorageId(guildId);
    return this.exec(
      "UPDATE guilds SET dj_roles = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      [rolesJson, storageId]
    );
  }

  getAllowedRoles(guildId) {
    const guild = this.ensureGuild(guildId);
    try {
      return JSON.parse(guild.allowed_roles || '[]');
    } catch (e) {
      return [];
    }
  }

  setAllowedRoles(guildId, roles) {
    this.ensureGuild(guildId);
    const rolesJson = JSON.stringify(Array.isArray(roles) ? roles : []);
    const storageId = this.getStorageId(guildId);
    return this.exec(
      "UPDATE guilds SET allowed_roles = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      [rolesJson, storageId]
    );
  }

  getVipRoles(guildId) {
    const guild = this.ensureGuild(guildId);
    try {
      return JSON.parse(guild.vip_roles || '[]');
    } catch (e) {
      return [];
    }
  }

  setVipRoles(guildId, roles) {
    this.ensureGuild(guildId);
    const rolesJson = JSON.stringify(Array.isArray(roles) ? roles : []);
    const storageId = this.getStorageId(guildId);
    return this.exec(
      "UPDATE guilds SET vip_roles = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      [rolesJson, storageId]
    );
  }

  getPremiumRoles(guildId) {
    const guild = this.ensureGuild(guildId);
    try {
      return JSON.parse(guild.premium_roles || '[]');
    } catch (e) {
      return [];
    }
  }

  setPremiumRoles(guildId, roles) {
    this.ensureGuild(guildId);
    const rolesJson = JSON.stringify(Array.isArray(roles) ? roles : []);
    const storageId = this.getStorageId(guildId);
    return this.exec(
      "UPDATE guilds SET premium_roles = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      [rolesJson, storageId]
    );
  }

  getTierRoles(guildId) {
    const guild = this.ensureGuild(guildId);
    return {
      allowed: JSON.parse(guild.allowed_roles || '[]'),
      allowedUsers: JSON.parse(guild.allowed_users || '[]'),
      vip: JSON.parse(guild.vip_roles || '[]'),
      vipUsers: JSON.parse(guild.vip_users || '[]'),
      premium: JSON.parse(guild.premium_roles || '[]'),
      premiumUsers: JSON.parse(guild.premium_users || '[]')
    };
  }

  setTierRoles(guildId, roles) {
    this.ensureGuild(guildId);
    const allowedRoles = JSON.stringify(Array.isArray(roles?.allowed) ? roles.allowed : []);
    const allowedUsers = JSON.stringify(Array.isArray(roles?.allowedUsers) ? roles.allowedUsers : []);
    const vipRoles = JSON.stringify(Array.isArray(roles?.vip) ? roles.vip : []);
    const vipUsers = JSON.stringify(Array.isArray(roles?.vipUsers) ? roles.vipUsers : []);
    const premiumRoles = JSON.stringify(Array.isArray(roles?.premium) ? roles.premium : []);
    const premiumUsers = JSON.stringify(Array.isArray(roles?.premiumUsers) ? roles.premiumUsers : []);

    const storageId = this.getStorageId(guildId);
    return this.exec(
      "UPDATE guilds SET allowed_roles = ?, allowed_users = ?, vip_roles = ?, vip_users = ?, premium_roles = ?, premium_users = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      [allowedRoles, allowedUsers, vipRoles, vipUsers, premiumRoles, premiumUsers, storageId]
    );
  }

  // ============ USER-BASED TIER MANAGEMENT ============

  getAllowedUsers(guildId) {
    const guild = this.ensureGuild(guildId);
    try {
      return JSON.parse(guild.allowed_users || '[]');
    } catch (e) {
      return [];
    }
  }

  setAllowedUsers(guildId, users) {
    this.ensureGuild(guildId);
    const usersJson = JSON.stringify(Array.isArray(users) ? users : []);
    const storageId = this.getStorageId(guildId);
    return this.exec(
      "UPDATE guilds SET allowed_users = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      [usersJson, storageId]
    );
  }

  getVipUsers(guildId) {
    const guild = this.ensureGuild(guildId);
    try {
      return JSON.parse(guild.vip_users || '[]');
    } catch (e) {
      return [];
    }
  }

  setVipUsers(guildId, users) {
    this.ensureGuild(guildId);
    const usersJson = JSON.stringify(Array.isArray(users) ? users : []);
    const storageId = this.getStorageId(guildId);
    return this.exec(
      "UPDATE guilds SET vip_users = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      [usersJson, storageId]
    );
  }

  getPremiumUsers(guildId) {
    const guild = this.ensureGuild(guildId);
    try {
      return JSON.parse(guild.premium_users || '[]');
    } catch (e) {
      return [];
    }
  }

  setPremiumUsers(guildId, users) {
    this.ensureGuild(guildId);
    const usersJson = JSON.stringify(Array.isArray(users) ? users : []);
    const storageId = this.getStorageId(guildId);
    return this.exec(
      "UPDATE guilds SET premium_users = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      [usersJson, storageId]
    );
  }

  // Combined method to get all tier data (roles + users)
  getAllTierData(guildId) {
    const guild = this.ensureGuild(guildId);
    return {
      roles: {
        allowed: JSON.parse(guild.allowed_roles || '[]'),
        vip: JSON.parse(guild.vip_roles || '[]'),
        premium: JSON.parse(guild.premium_roles || '[]')
      },
      users: {
        allowed: JSON.parse(guild.allowed_users || '[]'),
        vip: JSON.parse(guild.vip_users || '[]'),
        premium: JSON.parse(guild.premium_users || '[]')
      }
    };
  }
}
