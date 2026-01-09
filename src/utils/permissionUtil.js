import { PermissionFlagsBits } from 'discord.js';
import { config } from '#config/config';
import { db } from '#database/DatabaseManager';
import { logger } from '#utils/logger';

// Removed static ownerSet - now using dynamic check in isOwner()
const permissionNames = new Map();

for (const [name, value] of Object.entries(PermissionFlagsBits)) {
	permissionNames.set(
		value,
		name
			.split('_')
			.map(word => word.charAt(0) + word.slice(1).toLowerCase())
			.join(' '),
	);
}

export function isOwner(userId) {
	// Always check config dynamically to ensure owner IDs are current
	return config.ownerIds?.includes(userId) || false;
}


export function canUseCommand(member, command) {
	if (command.ownerOnly && !isOwner(member.id)) return false;
	if (command.userPermissions?.length > 0) {
		return command.userPermissions.every(perm =>
			member.permissions.has(perm),
		);
	}

	return true;
}

export function getMissingBotPermissions(channel, permissions) {
	const botPerms = channel.guild.members.me.permissionsIn(channel);
	return permissions
		.filter(perm => !botPerms.has(perm))
		.map(perm => permissionNames.get(perm) || 'Unknown Permission');
}

export function inSameVoiceChannel(member, bot) {
	return (
		member.voice.channel &&
		bot.voice.channel &&
		member.voice.channelId === bot.voice.channelId
	);
}

export function isUserPremium(userId) {
	return db.isUserPremium(userId);
}

export function isGuildPremium(guildId) {
	return db.isGuildPremium(guildId);
}

export function hasAnyPremium(userId, guildId) {
	return db.hasAnyPremium(userId, guildId);
}

export function hasPremiumAccess(userId, guildId, type = 'any') {
	switch (type) {
		case 'user':
			return !!isUserPremium(userId);
		case 'guild':
			return !!isGuildPremium(guildId);
		case 'any':
		default:
			return !!hasAnyPremium(userId, guildId);
	}
}

export function getPremiumStatus(userId, guildId) {
	const userPremium = isUserPremium(userId);
	const guildPremium = isGuildPremium(guildId);
	const isBotOwner = isOwner(userId);

	// Get tier from DB if possible (sync check for what's in DB for the server)
	const guildTier = db.guild.getTier(guildId) || 'free';

	// Check if user is specifically in a tier via DB (users only check, roles need member object)
	const tierData = db.guild.getAllTierData(guildId);
	const isVipUser = tierData.users.vip.includes(userId);
	const isPremiumUser = tierData.users.premium.includes(userId) || !!(userPremium || guildPremium);

	// Determine the effective tier
	let effectiveTier = 'free';
	if (isBotOwner) effectiveTier = 'owner';
	else if (isPremiumUser || guildTier === 'premium') effectiveTier = 'premium';
	else if (isVipUser || guildTier === 'vip') effectiveTier = 'vip';

	// Map tier to maxSongs
	const maxSongs = config.queue.maxSongs[effectiveTier] || config.queue.maxSongs.free;
	const maxSongsFormatted = maxSongs === Infinity ? 'Unlimited' : maxSongs.toString();

	return {
		hasUserPremium: !!userPremium,
		hasGuildPremium: !!guildPremium,
		hasAnyPremium: !!(userPremium || guildPremium || isBotOwner || effectiveTier !== 'free'),
		userPremium: userPremium || null,
		guildPremium: guildPremium || null,
		activePremium: userPremium || guildPremium || null,
		tier: effectiveTier,
		maxSongs: maxSongs,
		maxSongsFormatted: maxSongsFormatted,
		isOwner: isBotOwner
	};
}

export function formatPremiumExpiry(expiresAt) {
	if (!expiresAt) return 'Never (Permanent)';

	const timeLeft = expiresAt - Date.now();
	if (timeLeft <= 0) return 'Expired';

	const days = Math.floor(timeLeft / 86400000);
	if (days > 0) return `${days} day${days !== 1 ? 's' : ''}`;

	const hours = Math.floor(timeLeft / 3600000);
	if (hours > 0) return `${hours} hour${hours !== 1 ? 's' : ''}`;

	const minutes = Math.floor(timeLeft / 60000);
	return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
}

// ============ TIER-BASED PERMISSION SYSTEM ============

const tierHierarchy = {
	denied: 0,
	free: 1,
	vip: 2,
	premium: 3,
	owner: 4
};

export function hasDjRole(userId, guild) {
	if (!guild || !userId) return false;

	const guildDb = db.guild;
	const djRoles = guildDb.getDjRoles(guild.id);
	if (!djRoles || djRoles.length === 0) return false;

	const member = guild.members.cache.get(userId);
	if (!member) return false;

	return djRoles.some(roleId => member.roles.cache.has(roleId));
}

export async function getUserTier(userId, guild) {
	if (!guild || !userId) return 'denied';

	// Dynamic import to ensure DB is ready and consistent with HelpCommand
	// This import is duplicated from the top of the file, but kept here for the specific context of this function
	// where the DB might not be initialized yet in certain execution paths or for consistency with other dynamic imports.
	const { db } = await import('#database/DatabaseManager');

	const guildDb = db.guild;
	const tier = guildDb.getTier(guild.id) || 'free';

	// owner check (bypass)
	// This import is duplicated from the top of the file, but kept here for the specific context of this function
	// where the config might not be initialized yet in certain execution paths or for consistency with other dynamic imports.
	const { config } = await import('#config/config');
	logger.debug('PermissionUtil', `Checking tier for user ${userId} in guild ${guild.name} (${guild.id})`);
	logger.debug('PermissionUtil', `Config ownerIds: ${JSON.stringify(config.ownerIds)}`);

	if (config.ownerIds?.includes(userId)) {
		logger.success('PermissionUtil', `User ${userId} identified as BOT OWNER`);
		return 'owner';
	}

	if (tier === 'owner') {
		const isOwner = config.ownerIds?.includes(userId);
		logger.debug('PermissionUtil', `Guild tier is 'owner'. User isOwner: ${isOwner}`);
		return isOwner ? 'owner' : 'free';
	}

	let member = guild.members.cache.get(userId);
	if (!member) {
		try {
			member = await guild.members.fetch(userId);
		} catch (e) {
			// Ignore fetch errors
		}
	}

	if (!member) {
		return 'denied';
	}

	// Get all tier data (roles and users)
	const tierData = guildDb.getAllTierData(guild.id);

	// Check premium users first (highest tier after owner)
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
}

export function getRequiredTier(command) {
	// Check new tier property first
	if (command.tier) {
		const validTiers = ['free', 'vip', 'premium', 'owner'];
		if (validTiers.includes(command.tier)) {
			return command.tier;
		}
	}

	// Check legacy vipOnly flag
	if (command.vipOnly) return 'vip';

	// Check legacy ownerOnly flag
	if (command.ownerOnly) return 'owner';

	// Check legacy premium flags
	if (command.userPrem || command.guildPrem || command.anyPrem) return 'premium';

	return 'free';
}

export async function canUseCommandByTier(userId, guild, command) {
	const userTier = await getUserTier(userId, guild);
	const requiredTier = getRequiredTier(command);

	const userTierLevel = tierHierarchy[userTier] || 0;
	const requiredTierLevel = tierHierarchy[requiredTier] || 0;

	return userTierLevel >= requiredTierLevel;
}

export function getTierDisplayName(tier) {
	const displayNames = {
		owner: 'Owner',
		premium: 'Premium',
		vip: 'VIP',
		free: 'Free',
		denied: 'Denied'
	};
	return displayNames[tier] || tier;
}

export function getTierInfo(guildId) {
	const guildDb = db.guild;
	const tier = guildDb.getTier(guildId) || 'free';
	const tierRoles = guildDb.getTierRoles(guildId);

	return {
		tier,
		displayName: getTierDisplayName(tier),
		roles: {
			allowed: tierRoles.allowed,
			vip: tierRoles.vip,
			premium: tierRoles.premium
		}
	};
}
