import { logger } from "#utils/logger";

export class TrackResolver {
    constructor(lavalink) {
        this.lavalink = lavalink;
    }

    /**
     * Resolves a stored track object into a playable Lavalink track
     * @param {Object} trackInfo The stored track info
     * @param {Object} requester The user requesting the track
     * @returns {Promise<Object|null>} Lavalink track object or null
     */
    async resolve(trackInfo, requester) {
        if (!this.lavalink) {
            logger.error('TrackResolver', 'Lavalink instance not initialized');
            return null;
        }

        if (trackInfo.isrc) {
            // Try resolving by ISRC first (Youtube Music or Spotify)
            const isrcResult = await this.search(`"${trackInfo.isrc}"`, requester);
            if (isrcResult.tracks?.length) {
                return isrcResult.tracks[0];
            }
        }

        // 1. Try resolving by URI (most accurate)
        if (trackInfo.uri) {
            const result = await this.search(trackInfo.uri, requester);
            if (result.tracks?.length) {
                return result.tracks[0];
            }
        }

        // 2. Fallback: Search by "Title - Artist"
        const query = `${trackInfo.title} ${trackInfo.author}`;
        const result = await this.search(query, requester);

        if (result.tracks?.length) {
            return result.tracks[0];
        }

        return null;
    }

    /**
     * Search wrapper
     * @param {string} query 
     * @param {Object} requester 
     */
    async search(query, requester) {
        try {
            // Get best available node
            const node = this.lavalink.nodeManager.leastUsedNodes("memory")[0];
            if (!node) {
                logger.error('TrackResolver', 'No Lavalink nodes available for search');
                return { loadType: 'empty', tracks: [] };
            }

            // Use YouTube Music search by default for better audio quality
            const source = 'ytmsearch:';
            let q = query;

            // If it's not a URL and doesn't already have a source prefix
            if (!query.startsWith('http') && !query.includes(':')) {
                // Determine if we need aggressive filtering
                // Use quotes for exact matching if possible
                // Filter out live, cover, remix unless explicitly requested
                if (!query.toLowerCase().includes('live')) {
                    q = `${source}${query} "Audio" -Live -Cover -Remix`;
                } else {
                    q = `${source}${query}`;
                }
            } else if (query.includes('spotify') && !query.startsWith('http')) {
                // If it's a spotify ID/ISRC being resolved
                q = query.startsWith('ytmsearch:') ? query : `${source}${query}`;
            }

            return await node.search({ query: q }, requester);
        } catch (e) {
            logger.warn('TrackResolver', `Search failed for: ${query}: ${e.message}`);
            return { loadType: 'empty', tracks: [] };
        }
    }
}
