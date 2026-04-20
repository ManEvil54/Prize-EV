/**
 * Logic to detect current date and prioritize sports.
 * April - September: Focus on MLB and PGA.
 * Returns an array of priority sports.
 */
function getPrioritySports() {
    const now = new Date();
    const month = now.getMonth(); // 0-indexed (0 is Jan, 3 is April, 8 is Sept)

    const priority = [];

    // April (3) to September (8)
    if (month >= 3 && month <= 8) {
        priority.push('MLB', 'PGA');
    }

    // NBA is usually Oct to June, so add if applicable
    if (month >= 9 || month <= 5) {
        priority.push('NBA');
    }

    return [...new Set(priority)];
}

module.exports = { getPrioritySports };
