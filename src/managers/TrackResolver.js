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

        const targetDuration = trackInfo.duration;
        const durationTolerance = 5000; // 5 seconds tolerance

        // 1. Try ISRC first for exact match (most accurate)
        if (trackInfo.isrc) {
            const isrcResult = await this.search(`"${trackInfo.isrc}"`, requester);
            if (isrcResult.tracks?.length) {
                const match = this._findBestMatch(isrcResult.tracks, targetDuration, durationTolerance);
                if (match) return match;
            }
        }

        // 2. Try resolving by URI (if YouTube/Spotify URL)
        if (trackInfo.uri) {
            const result = await this.search(trackInfo.uri, requester);
            if (result.tracks?.length) {
                const match = this._findBestMatch(result.tracks, targetDuration, durationTolerance);
                if (match) return match;
            }
        }

        // 3. Search by "Artist - Title" with duration matching
        const query = `${trackInfo.author} - ${trackInfo.title}`;
        const result = await this.search(query, requester);

        if (result.tracks?.length) {
            const match = this._findBestMatch(result.tracks, targetDuration, durationTolerance);
            if (match) return match;
            // If no duration match, return first result as fallback
            return result.tracks[0];
        }

        return null;
    }

    /**
     * Find the best matching track based on duration
     * @param {Array} tracks Array of tracks from search results
     * @param {number} targetDuration Target duration in milliseconds
     * @param {number} tolerance Duration tolerance in milliseconds
     * @returns {Object|null} Best matching track or null
     */
    _findBestMatch(tracks, targetDuration, tolerance = 5000) {
        if (!targetDuration || !tracks.length) return tracks[0];

        // Filter tracks within duration tolerance
        const matchingTracks = tracks.filter(track => {
            const trackDuration = track.info?.duration || 0;
            return Math.abs(trackDuration - targetDuration) <= tolerance;
        });

        if (matchingTracks.length) {
            // Return the one closest to target duration
            return matchingTracks.reduce((best, current) => {
                const bestDiff = Math.abs((best.info?.duration || 0) - targetDuration);
                const currentDiff = Math.abs((current.info?.duration || 0) - targetDuration);
                return currentDiff < bestDiff ? current : best;
            });
        }

        // No duration match - check if first result is obviously wrong (compilation/mix)
        const first = tracks[0];
        const firstDuration = first.info?.duration || 0;
        const title = (first.info?.title || '').toLowerCase();

        // If it's way too long (>2x) and looks like a mix/compilation, skip it
        if (firstDuration > targetDuration * 2) {
            const mixKeywords = ['mix', 'compilation', 'album', 'playlist', 'full album', 'best of'];
            if (mixKeywords.some(kw => title.includes(kw))) {
                // Try to find a non-mix track
                const nonMix = tracks.find(t => {
                    const tTitle = (t.info?.title || '').toLowerCase();
                    return !mixKeywords.some(kw => tTitle.includes(kw));
                });
                if (nonMix) return nonMix;
            }
        }

        return first;
    }

    /**
     * Search wrapper with improved query formatting
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
                // Build search query optimized for original tracks
                // Exclude common non-original versions
                q = `${source}${query} -cover -remix -live -karaoke -instrumental`;
            } else if (query.includes('spotify') && !query.startsWith('http')) {
                q = query.startsWith('ytmsearch:') ? query : `${source}${query}`;
            }

            return await node.search({ query: q }, requester);
        } catch (e) {
            logger.warn('TrackResolver', `Search failed for: ${query}: ${e.message}`);
            return { loadType: 'empty', tracks: [] };
        }
    }
}

