const axios = require('axios');
const redisHub = require('./redis_hub');

/**
 * Converts American odds or decimal odds to implied probability.
 * @param {number|string} odds 
 * @returns {number}
 */
function toImpliedProb(odds) {
    const num = parseFloat(odds);
    if (isNaN(num)) return 0;
    
    // Check if it's American or Decimal (rough logic)
    if (Math.abs(num) >= 100) {
        if (num > 0) return 100 / (num + 100);
        return Math.abs(num) / (Math.abs(num) + 100);
    } else {
        // Assume decimal
        return 1 / num;
    }
}

/**
 * Calculates No-Vig probability using the user-provided formula:
 * P = ProbOver / (ProbOver + ProbUnder)
 * @param {number} overOdds 
 * @param {number} underOdds 
 * @returns {number}
 */
function calculateNoVig(overOdds, underOdds) {
    const pOver = toImpliedProb(overOdds);
    const pUnder = toImpliedProb(underOdds);
    
    if (pOver + pUnder === 0) return 0;
    return pOver / (pOver + pUnder);
}

/**
 * Fetches odds for a specific sport and player prop.
 * @param {string} apiKey 
 * @param {string} sport 
 * @param {string} regions 
 * @param {string} markets 
 * @returns {Promise<Array>}
 */
async function fetchMarketOdds(apiKey, sport, regions = 'us', markets = 'h2h') {
    try {
        const response = await axios.get(`https://api.the-odds-api.com/v4/sports/${sport}/odds`, {
            params: {
                apiKey: apiKey,
                regions: regions,
                markets: markets,
                oddsFormat: 'american'
            }
        });

        // Quota Tracking
        const remaining = response.headers['x-requests-remaining'];
        if (remaining) {
            await redisHub.set(redisHub.constructor.keys.quota, remaining, 0); // No expiration
        }

        return response.data;
    } catch (error) {
        console.error(`Error fetching odds for ${sport}:`, error.response?.data || error.message);
        return [];
    }
}

/**
 * Fetches specific player props for a single event.
 * @param {string} apiKey 
 * @param {string} sport 
 * @param {string} eventId 
 * @param {string} markets (e.g., 'player_points,player_assists')
 * @returns {Promise<Object>}
 */
async function fetchEventProps(apiKey, sport, eventId, markets = 'player_points') {
    try {
        const response = await axios.get(`https://api.the-odds-api.com/v4/sports/${sport}/events/${eventId}/odds`, {
            params: {
                apiKey: apiKey,
                regions: 'us',
                markets: markets,
                oddsFormat: 'american'
            }
        });
        return response.data;
    } catch (error) {
        console.error(`[ODDS_API] Failed to fetch props for event ${eventId}:`, error.response?.data || error.message);
        return null;
    }
}

module.exports = {
    fetchMarketOdds,
    fetchEventProps,
    calculateNoVig,
    toImpliedProb
};
