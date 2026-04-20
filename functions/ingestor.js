require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const redisHub = require('./services/redis_hub');
const { fetchMarketOdds, fetchEventProps } = require('./services/odds_api');
const logger = require('firebase-functions/logger');
const axios = require('axios');

// Config
const POLL_INTERVAL_MS = 1000 * 60 * 60; // 1 hour (to respect the 20/day limit)
const CRYPTO_POLL_INTERVAL_MS = 5000; // 5 seconds for tickers
const SPORTS_TO_POLL = ['basketball_nba']; // Start with just one to save quota

// Secrets/Keys (In production, use process.env or Secret Manager)
const ODDS_API_KEY = process.env.THE_ODDS_API_KEY;

async function pollSportsOdds() {
    for (const sport of SPORTS_TO_POLL) {
        try {
            logger.info(`[INGESTOR] Polling odds for ${sport}...`);
            const games = await fetchMarketOdds(ODDS_API_KEY, sport);
            
            if (games && Array.isArray(games)) {
                // Targeted Refresh: Only fetch props for games starting in the next 12 hours
                const now = Date.now();
                const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;
                
                const upcomingGames = games.filter(game => {
                    const commenceTime = new Date(game.commence_time).getTime();
                    return commenceTime > now && (commenceTime - now) < TWELVE_HOURS_MS;
                });

                logger.info(`[INGESTOR] Found ${upcomingGames.length} games starting in the next 12 hours.`);
                
                for (const game of upcomingGames) {
                    logger.info(`[INGESTOR] Deep-Diving into Props for ${game.home_team} vs ${game.away_team}...`);
                    const props = await fetchEventProps(
                        ODDS_API_KEY, 
                        sport, 
                        game.id, 
                        'player_points,player_rebounds,player_assists'
                    );
                    
                    if (props) {
                        const propKey = redisHub.constructor.keys.props(game.id);
                        await redisHub.set(propKey, props, 7200); // Cache for 2 hours
                    }
                }

                const key = redisHub.constructor.keys.odds(sport);
                await redisHub.set(key, games, 3600); // Store main H2H lines
                
                await redisHub.publish(`CHANNEL:ODDS:${sport.toUpperCase()}`, { 
                    timestamp: Date.now(), 
                    gameCount: games.length,
                    propGamesUpdated: upcomingGames.length 
                });
                
                logger.info(`[INGESTOR] Updated ${sport} in Redis with ${upcomingGames.length} prop-heavy games.`);
            }
        } catch (e) {
            logger.error(`[INGESTOR] Failed to poll ${sport}:`, e.message);
        }
    }
}

async function pollCryptoPrices() {
    const symbols = ['SOL', 'ETH', 'BTC'];
    for (const symbol of symbols) {
        try {
            // Placeholder: Replace with actual price feed (e.g. Binance, Coinbase, etc.)
            // For now, using a mock for demonstration
            const mockPrice = (Math.random() * 100 + (symbol === 'BTC' ? 60000 : symbol === 'ETH' ? 3000 : 140)).toFixed(2);
            const change24h = (Math.random() * 5 - 2.5).toFixed(2);
            
            const data = {
                price: mockPrice,
                change_24h: change24h,
                timestamp: Date.now()
            };
            
            const key = redisHub.constructor.keys.ticker(symbol);
            await redisHub.set(key, data, 15); // Cache for 15s
            await redisHub.publish(`CHANNEL:TICKER:${symbol}`, data);
        } catch (e) {
            logger.error(`[INGESTOR] Failed to poll ${symbol}:`, e.message);
        }
    }
}

// Main Loop
async function start() {
    logger.info('[INGESTOR] Single Source of Truth Ingestor Started.');
    
    // Initial runs
    await pollSportsOdds();
    await pollCryptoPrices();
    
    // Schedules
    setInterval(pollSportsOdds, POLL_INTERVAL_MS);
    setInterval(pollCryptoPrices, CRYPTO_POLL_INTERVAL_MS);
}

// Execution
if (require.main === module) {
    start().catch(err => {
        logger.error('[INGESTOR] Critical failure:', err);
        process.exit(1);
    });
}

module.exports = { start };
