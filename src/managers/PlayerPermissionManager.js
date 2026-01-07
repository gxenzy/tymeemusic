import { config } from "#config/config";
import { db } from "#database/DatabaseManager";
import { logger } from "#utils/logger";

/**
 * Manages player session permissions.
 * Tracks who started the current music session and handles permission requests.
 */
export class PlayerPermissionManager {
    // Map of guildId -> sessionData
    static sessions = new Map();

    // Map of pendingRequestId -> requestData
    static pendingRequests = new Map();

    /**
     * Initialize a new session when playback starts
     * @param {string} guildId - The guild ID
     * @param {object} user - The user who started the session
     */
    static startSession(guildId, user) {
        if (!guildId || !user) return;

        const sessionData = {
            ownerId: user.id,
            ownerTag: user.tag || user.username || "Unknown",
            ownerAvatar: user.displayAvatarURL?.() || user.avatar || null,
            startedAt: Date.now(),
            guildId,
            approvedUsers: new Set()
        };

        this.sessions.set(guildId, sessionData);
        logger.debug("PlayerPermission", `Session started for guild ${guildId} by ${sessionData.ownerTag}`);

        return sessionData;
    }

    /**
     * End a session when playback stops or player is destroyed
     * @param {string} guildId - The guild ID
     */
    static endSession(guildId) {
        if (this.sessions.has(guildId)) {
            logger.debug("PlayerPermission", `Session ended for guild ${guildId}`);
            this.sessions.delete(guildId);
        }

        // Clean up any pending requests for this guild
        for (const [requestId, request] of this.pendingRequests.entries()) {
            if (request.guildId === guildId) {
                this.pendingRequests.delete(requestId);
            }
        }
    }

    /**
     * Get the session owner for a guild
     * @param {string} guildId - The guild ID
     * @returns {object|null} Session data or null
     */
    static getSession(guildId) {
        return this.sessions.get(guildId) || null;
    }

    /**
     * Get the session owner ID
     * @param {string} guildId - The guild ID
     * @returns {string|null} Owner user ID or null
     */
    static getSessionOwnerId(guildId) {
        const session = this.sessions.get(guildId);
        return session?.ownerId || null;
    }

    /**
     * Check if a user is the session owner
     * @param {string} guildId - The guild ID
     * @param {string} userId - The user ID to check
     * @returns {boolean}
     */
    static isSessionOwner(guildId, userId) {
        const session = this.sessions.get(guildId);
        return session?.ownerId === userId;
    }

    /**
     * Check if a user is exempt from permissions (Owner, VIP, Premium, Bot Owner)
     * @param {string} guildId - The guild ID
     * @param {object} member - The guild member
     * @returns {boolean}
     */
    static isExempt(guildId, member) {
        if (!member) return false;

        // Bot owners are always exempt
        if (config.ownerIds?.includes(member.user?.id || member.id)) {
            return true;
        }

        // Guild owner is always exempt
        if (member.guild?.ownerId === (member.user?.id || member.id)) {
            return true;
        }

        // Check for VIP/Premium roles from guild settings
        try {
            const settings = db.guild.getSettings(guildId);
            const memberRoles = member.roles?.cache?.map(r => r.id) || [];

            // Check VIP roles
            if (settings.vipRoles?.some(roleId => memberRoles.includes(roleId))) {
                return true;
            }

            // Check Premium roles
            if (settings.premiumRoles?.some(roleId => memberRoles.includes(roleId))) {
                return true;
            }

            // Check VIP users
            if (settings.vipUsers?.includes(member.user?.id || member.id)) {
                return true;
            }

            // Check Premium users
            if (settings.premiumUsers?.includes(member.user?.id || member.id)) {
                return true;
            }
        } catch (error) {
            logger.debug("PlayerPermission", `Error checking exemption for ${member.id}: ${error.message}`);
        }

        return false;
    }

    /**
     * Check if a user can control the player
     * @param {string} guildId - The guild ID
     * @param {object} user - The user requesting control
     * @param {object} member - The guild member (for role checks)
     * @param {string} action - The action being performed
     * @returns {object} { allowed: boolean, reason?: string, requiresPermission?: boolean }
     */
    static canControl(guildId, user, member = null, action = "control") {
        const session = this.sessions.get(guildId);
        const userId = user?.id || user;

        // DEBUG LOG
        // DEBUG LOG
        // logger.debug("PlayerPermission", `canControl Check...`);


        // No active session - allow control
        if (!session) {
            return { allowed: true };
        }

        // User is the session owner - allow
        if (session.ownerId === userId) {
            return { allowed: true };
        }

        // Check if user has been approved by owner
        if (session.approvedUsers?.has(userId)) {
            return { allowed: true, reason: "approved_by_owner" };
        }

        // Check if user is exempt (VIP, Premium, Owner)
        if (member && this.isExempt(guildId, member)) {
            return { allowed: true, reason: "exempt" };
        }

        // User needs permission
        return {
            allowed: false,
            requiresPermission: true,
            sessionOwner: {
                id: session.ownerId,
                tag: session.ownerTag
            },
            reason: `Permission required from ${session.ownerTag} `
        };
    }

    /**
     * Create a permission request
     * @param {string} guildId - The guild ID
     * @param {object} requester - The user requesting permission
     * @param {string} action - The action they want to perform
     * @returns {object} The permission request data
     */
    static createPermissionRequest(guildId, requester, action) {
        const session = this.sessions.get(guildId);
        if (!session) return null;

        const requestId = `${guildId} -${requester.id} -${Date.now()} `;
        const requestData = {
            id: requestId,
            guildId,
            requesterId: requester.id,
            requesterTag: requester.tag || requester.username || "Unknown",
            requesterAvatar: requester.displayAvatarURL?.() || requester.avatar || null,
            ownerId: session.ownerId,
            ownerTag: session.ownerTag,
            action,
            createdAt: Date.now(),
            status: "pending" // pending, approved, denied, expired
        };

        this.pendingRequests.set(requestId, requestData);

        // Auto-expire after 60 seconds
        setTimeout(() => {
            const request = this.pendingRequests.get(requestId);
            if (request && request.status === "pending") {
                request.status = "expired";
                this.pendingRequests.delete(requestId);
            }
        }, 60000);

        logger.debug("PlayerPermission", `Permission request created: ${requestId} `);
        return requestData;
    }

    /**
     * Respond to a permission request
     * @param {string} requestId - The request ID
     * @param {boolean} approved - Whether the request is approved
     * @param {string} responderId - The ID of the user responding
     * @returns {object|null} Updated request data or null if not found
     */
    static respondToRequest(requestId, approved, responderId) {
        const request = this.pendingRequests.get(requestId);
        if (!request) return null;

        // Only the session owner can respond
        if (request.ownerId !== responderId) {
            return { error: "Only the session owner can respond to this request" };
        }

        request.status = approved ? "approved" : "denied";
        request.respondedAt = Date.now();

        // If approved, add to session's allowed users
        if (approved) {
            const session = this.sessions.get(request.guildId);
            if (session) {
                if (!session.approvedUsers) session.approvedUsers = new Set();
                session.approvedUsers.add(request.requesterId);
                if (!session.approvedUsers) session.approvedUsers = new Set();
                session.approvedUsers.add(request.requesterId);
                logger.debug("PlayerPermission", `APPROVED: Added ${request.requesterId} to approved list.`);
            } else {
                logger.warn("PlayerPermission", `Could not find session for guild ${request.guildId} to approve user`);
            }
        }

        // Remove from pending after response
        setTimeout(() => {
            this.pendingRequests.delete(requestId);
        }, 5000);

        logger.debug("PlayerPermission", `Permission request ${requestId} ${request.status} `);
        return request;
    }

    /**
     * Get pending requests for a session owner
     * @param {string} ownerId - The session owner's user ID
     * @returns {array} Array of pending requests
     */
    static getPendingRequestsForOwner(ownerId) {
        const requests = [];
        for (const [id, request] of this.pendingRequests.entries()) {
            if (request.ownerId === ownerId && request.status === "pending") {
                requests.push(request);
            }
        }
        return requests;
    }

    /**
     * Transfer session ownership
     * @param {string} guildId - The guild ID
     * @param {object} newOwner - The new session owner
     * @param {string} currentOwnerId - The current owner's ID (for validation)
     * @returns {boolean} Success
     */
    static transferOwnership(guildId, newOwner, currentOwnerId) {
        const session = this.sessions.get(guildId);
        if (!session || session.ownerId !== currentOwnerId) {
            return false;
        }

        session.ownerId = newOwner.id;
        session.ownerTag = newOwner.tag || newOwner.username || "Unknown";
        session.ownerAvatar = newOwner.displayAvatarURL?.() || newOwner.avatar || null;
        session.transferredAt = Date.now();

        logger.debug("PlayerPermission", `Session ownership transferred to ${session.ownerTag} in guild ${guildId} `);
        return true;
    }
}

export default PlayerPermissionManager;
