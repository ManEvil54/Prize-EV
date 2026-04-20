const { fetchMarketOdds, calculateNoVig } = require('../services/odds_api');
const { fetchSportspageOdds } = require('../services/rapid_api');
const redisHub = require('../services/redis_hub');
const logger = require("firebase-functions/logger");

/**
 * The Statistician Agent
 * Responsible for Market-Based odds analysis (Brain A).
 */
class StatisticianAgent {
    constructor(apiKey) {
        this.apiKey = apiKey;
    }

    /**
     * Analyzes market value for a given sport.
     * Fallback Logic: Redis Hub -> RapidAPI (Sportspage).
     */
    async analyzeMarket(sport) {
        logger.info(`[STATISTICIAN] Analyzing market for ${sport}...`);
        
        const marketSportCode = this._getSportCode(sport);
        const redisKey = redisHub.constructor.keys.odds(marketSportCode);
        
        // 1. Try to fetch from Redis (Ingestor source)
        let marketOdds = await redisHub.get(redisKey);
        
        // 2. Fallback to Sportspage RapidAPI if Redis is empty
        if (!marketOdds || (Array.isArray(marketOdds) && marketOdds.length === 0)) {
            logger.warn(`[STATISTICIAN] No data in Redis for ${sport}. Falling back to Sportspage RapidAPI...`);
            marketOdds = await fetchSportspageOdds(this.apiKey, sport);
        }

        const marketMap = new Map();

        if (marketOdds && Array.isArray(marketOdds)) {
            marketOdds.forEach(event => {
                // Mapping Sportspage structure to internal Map
                // Note: Sportspage provides game odds (spread, moneyline, total)
                if (event.odds) {
                    event.odds.forEach(o => {
                        const label = `${event.summary} (${o.type})`;
                        if (!marketMap.has(label)) {
                            marketMap.set(label, { over: o.homeOdds, under: o.awayOdds });
                        }
                    });
                } else if (event.bookmakers) {
                    // Mapping Odds API structure
                    event.bookmakers.forEach(bookmaker => {
                        if (bookmaker.markets) {
                            bookmaker.markets.forEach(m => {
                                if (m.outcomes) {
                                    m.outcomes.forEach(outcome => {
                                        const playerName = outcome.description || outcome.name;
                                        if (!marketMap.has(playerName)) {
                                            marketMap.set(playerName, { over: null, under: null });
                                        }
                                        const entry = marketMap.get(playerName);
                                        if (outcome.name.toLowerCase().includes('over')) entry.over = outcome.price;
                                        if (outcome.name.toLowerCase().includes('under')) entry.under = outcome.price;
                                    });
                                }
                            });
                        }
                    });
                }
            });
        }

        // Calculate No-Vig probabilities
        const result = new Map();
        marketMap.forEach((odds, player) => {
            if (odds.over && odds.under) {
                result.set(player, calculateNoVig(odds.over, odds.under));
            }
        });

        logger.info(`[STATISTICIAN] Found ${result.size} market entries for ${sport}.`);
        return result;
    }

    _getSportCode(sport) {
        const codes = {
            'MLB': 'baseball_mlb',
            'NBA': 'basketball_nba',
            'PGA': 'golf_masters_tournament_winner',
        };
        return codes[sport] || 'basketball_nba';
    }
}

module.exports = StatisticianAgent;
