const axios = require('axios');

const BASE_URL = 'https://statsapi.mlb.com/api/v1';

/**
 * Fetches season pitching stats for a player by their ID.
 * @param {string} personId 
 * @returns {Promise<Object>}
 */
async function getPitcherStats(personId) {
    try {
        const response = await axios.get(`${BASE_URL}/people/${personId}/stats`, {
            params: {
                stats: 'season',
                group: 'pitching',
                season: new Date().getFullYear()
            }
        });
        const stats = response.data.stats[0]?.splits[0]?.stat;
        return stats || null;
    } catch (error) {
        console.error(`Error fetching stats for pitcher ${personId}:`, error.message);
        return null;
    }
}

/**
 * Fetches team hitting stats to derive opponent K%.
 * @param {string} teamId 
 * @returns {Promise<Object>}
 */
async function getTeamHittingStats(teamId) {
    try {
        const response = await axios.get(`${BASE_URL}/teams/${teamId}/stats`, {
            params: {
                stats: 'season',
                group: 'hitting',
                season: new Date().getFullYear()
            }
        });
        const stats = response.data.stats[0]?.splits[0]?.stat;
        return stats || null;
    } catch (error) {
        console.error(`Error fetching hitting stats for team ${teamId}:`, error.message);
        return null;
    }
}

/**
 * Search for a player by name to get their ID.
 * @param {string} name 
 * @returns {Promise<string|null>}
 */
async function searchPlayerId(name) {
    try {
        const response = await axios.get(`${BASE_URL}/people/search`, {
            params: {
                names: name,
                active: true
            }
        });
        return response.data.people[0]?.id || null;
    } catch (error) {
        console.error(`Error searching player ${name}:`, error.message);
        return null;
    }
}

module.exports = {
    getPitcherStats,
    getTeamHittingStats,
    searchPlayerId
};
