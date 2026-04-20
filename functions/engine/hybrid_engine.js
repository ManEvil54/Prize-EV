const stringSimilarity = require('string-similarity');

/**
 * Normalizes a player name for better matching.
 * e.g., "L. James" vs "LeBron James"
 */
function normalizeName(name) {
    return name.toLowerCase().replace(/[^a-z ]/g, '').trim();
}

/**
 * Finds the best match for a name in a list of names.
 * @param {string} target 
 * @param {string[]} list 
 * @returns {Object} { match: string, rating: number }
 */
function fuzzyMatch(target, list) {
    if (!list || list.length === 0) return { match: null, rating: 0 };
    const matches = stringSimilarity.findBestMatch(target, list);
    return {
        match: matches.bestMatch.target,
        rating: matches.bestMatch.rating
    };
}

/**
 * Calculates the hybrid score based on sport-specific weights.
 * @param {string} sport 
 * @param {number} marketProb No-Vig Probability from sharp books
 * @param {number} modelProb Probability from performance historical regression
 * @returns {number}
 */
function calculateHybridScore(sport, marketProb, modelProb) {
    let marketWeight, modelWeight;

    switch (sport.toUpperCase()) {
        case 'PGA':
            marketWeight = 0.4;
            modelWeight = 0.6;
            break;
        case 'NBA':
        case 'MLB':
        default:
            marketWeight = 0.7;
            modelWeight = 0.3;
            break;
    }

    const score = (marketWeight * marketProb) + (modelWeight * modelProb);
    return score;
}

module.exports = {
    normalizeName,
    fuzzyMatch,
    calculateHybridScore
};
