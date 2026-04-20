const axios = require('axios');
const logger = require("firebase-functions/logger");

const RAPID_API_HOSTS = {
    SPORTSPAGE: 'sportspage-feeds.p.rapidapi.com',
    GOLF: 'live-golf-data1.p.rapidapi.com'
};

/**
 * Fetches market odds from Sportspage Feeds via RapidAPI.
 */
async function fetchSportspageOdds(apiKey, sport) {
    try {
        const response = await axios.get(`https://${RAPID_API_HOSTS.SPORTSPAGE}/odds`, {
            params: { sport: sport.toLowerCase() },
            headers: {
                'X-RapidAPI-Key': apiKey,
                'X-RapidAPI-Host': RAPID_API_HOSTS.SPORTSPAGE
            }
        });
        return response.data.results || [];
    } catch (error) {
        logger.error(`[RAPID_API] Sportspage Feeds failed for ${sport}:`, error.message);
        return [];
    }
}

/**
 * Fetches live golf leaderboard data via RapidAPI.
 */
async function fetchGolfLeaderboard(apiKey) {
    try {
        const response = await axios.get(`https://${RAPID_API_HOSTS.GOLF}/leaderboard`, {
            params: { org: 'pga' },
            headers: {
                'X-RapidAPI-Key': apiKey,
                'X-RapidAPI-Host': RAPID_API_HOSTS.GOLF
            }
        });
        return response.data.results || [];
    } catch (error) {
        logger.error(`[RAPID_API] Golf Data failed:`, error.message);
        return [];
    }
}

module.exports = {
    fetchSportspageOdds,
    fetchGolfLeaderboard
};
