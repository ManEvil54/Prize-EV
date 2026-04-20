const { scrapePgaStat, STAT_URLS } = require('../services/pga_scraper');
const { fetchGolfLeaderboard } = require('../services/rapid_api');
const logger = require("firebase-functions/logger");

/**
 * The Matchup Scout Agent
 * Responsible for Performance Analysis (Brain B).
 */
class MatchupScoutAgent {
    constructor(rapidApiKey) {
        this.rapidApiKey = rapidApiKey;
        this.pgaStats = {
            sga: new Map(),
            birdie: new Map(),
            rank: new Map()
        };
        this.mlbStats = new Map();
    }

    /**
     * Scrapes or fetches performance data.
     * Fallback Logic: RapidAPI Golf -> Puppeteer Scraper.
     */
    async scout(sport) {
        logger.info(`[MATCHUP_SCOUT] Scouting ${sport}...`);
        
        if (sport === 'PGA') {
            let leaderboard = [];
            try {
                // 1. Try RapidAPI first
                leaderboard = await fetchGolfLeaderboard(this.rapidApiKey);
                
                if (leaderboard && leaderboard.length > 0) {
                    logger.info(`[MATCHUP_SCOUT] Processing ${leaderboard.length} players from RapidAPI Leaderboard.`);
                    leaderboard.forEach(player => {
                        const name = player.player_name;
                        // Map leaderboard metrics to internal maps
                        // Since leaderboard might not have SG:APP, we use score/rank as proxy or placeholders
                        this.pgaStats.rank.set(name, player.rank);
                        this.pgaStats.sga.set(name, player.total_score || 0); // Placeholder
                        this.pgaStats.birdie.set(name, player.round_score || 0); // Placeholder
                    });
                } else {
                    // 2. Fallback to Puppeteer Scraper if RapidAPI fails or is empty
                    logger.warn(`[MATCHUP_SCOUT] RapidAPI empty. Falling back to Puppeteer Scraping...`);
                    this.pgaStats.sga = await scrapePgaStat(STAT_URLS.SG_APPROACH);
                    this.pgaStats.birdie = await scrapePgaStat(STAT_URLS.BIRDIE_CONV);
                }
            } catch (e) {
                logger.error(`[MATCHUP_SCOUT] Error scouting PGA: ${e.message}`);
            }
        } else if (sport === 'MLB') {
            logger.info(`[MATCHUP_SCOUT] Monitoring MLB pitcher outliers.`);
        }
    }

    /**
     * Returns a performance-based probability.
     */
    getPerformanceProbability(sport, playerName, matchedName) {
        let prob = 0.50;
        let lowSample = false;

        if (sport === 'PGA') {
            const sgaValue = matchedName ? this.pgaStats.sga.get(matchedName) : null;
            const birdieValue = matchedName ? this.pgaStats.birdie.get(matchedName) : null;
            const rank = matchedName ? this.pgaStats.rank.get(matchedName) : null;
            
            if (sgaValue !== null && birdieValue !== null) {
                // Tactical logic for Zurich Classic / RBC Heritage
                // If we have a rank, we can factor that in
                const rankBonus = rank ? (100 - parseInt(rank)) / 1000 : 0;
                prob = 0.5 + (parseFloat(sgaValue) * 0.001) + (parseFloat(birdieValue) * 0.001) + rankBonus;
                lowSample = false; 
            } else {
                lowSample = true;
            }
        } else if (sport === 'MLB') {
            prob = 0.52;
            lowSample = false;
        }

        return { prob: Math.min(0.65, Math.max(0.40, prob)), lowSample };
    }
}

module.exports = MatchupScoutAgent;
