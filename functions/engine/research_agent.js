const logger = require("firebase-functions/logger");

/**
 * The Research Bot (The Analyst)
 * Responsible for cross-market analysis and generating the "Golden 5" and "Reserve Pool".
 */
class ResearchAgent {
    constructor() {}

    /**
     * Scouts the markets and categorizes picks.
     * @param {Array} allReports Array of synthesized reports from Actuary.
     * @returns {Object} { golden5: Array, reservePool: Array }
     */
    scoutWeeklyMarkets(allReports) {
        logger.info(`[RESEARCH_BOT] Sorting ${allReports.length} reports into Golden 5 and Reserve Pool...`);

        // Sort by conviction score descending
        const sorted = [...allReports].sort((a, b) => b.synthesis.overall_conviction_score - a.synthesis.overall_conviction_score);

        // 1. Identify Golden 5 (High-Conviction Alpha)
        // Focus on NBA Playoffs, PGA Tournament Leaders, MLB Stat Outliers
        const golden5 = sorted.slice(0, 5).map(report => {
            return {
                ...report,
                type: 'Alpha',
                rationale: this.generateRationale(report)
            };
        });

        // 2. Identify Reserve Pool (Low-Volatility / Goblins)
        // Prioritize picks with high model prob but perhaps lower market edge (Goblins)
        const reserveCandidates = sorted.slice(5).filter(report => {
            const isGoblin = report.agent_data.fundamental.score >= 58; // High hit rate model
            const isLowVol = report.agent_data.risk.score < 30; // Low risk score
            return isGoblin || isLowVol;
        });

        const reservePool = reserveCandidates.slice(0, 5).map(report => {
            return {
                ...report,
                type: 'Low-Volatility',
                rationale: this.generateRationale(report)
            };
        });

        logger.info(`[RESEARCH_BOT] Analysis complete. Golden 5: ${golden5.length}, Reserve: ${reservePool.length}`);
        return { golden5, reservePool };
    }

    /**
     * Generates a 2-sentence tactical rationale for a pick.
     */
    generateRationale(report) {
        const player = report.player_name || report.metadata.target_asset;
        const sport = report.sport || report.metadata.domain;
        const edge = report.synthesis.edge || '0%';
        const score = report.synthesis.overall_conviction_score;

        let sentence1 = `High-conviction ${sport} play identified for ${player} with a projected ${edge} edge against market lines. `;
        
        // Contextual logic for 2026 events
        const isNbaPlayoffs = sport === 'NBA' && new Date().getMonth() === 3; // April
        const isPgaZurich = sport === 'PGA' && report.metadata.context === 'Zurich Classic';

        if (isNbaPlayoffs) {
            sentence1 = `Playoff-leverage ${sport} outlier detected for ${player} showing significant Alpha divergence. `;
        } else if (isPgaZurich) {
            sentence1 = `Zurich Classic team-dynamics analysis favors ${player} for a high-probability birdie conversion. `;
        }

        const sentence2 = score > 75 
            ? `Structural model alignment suggests an elite risk-reward profile for this selection.` 
            : `Low-volatility stabilization pick designed to protect the 60% individual leg hit rate target.`;

        return `${sentence1}${sentence2}`;
    }
}

module.exports = ResearchAgent;
