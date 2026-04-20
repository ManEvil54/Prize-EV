/**
 * The Actuary Agent
 * Responsible for merging data, calculating hybrid scores, 
 * applying weighted conviction math, and assessing risk.
 */
class ActuaryAgent {
    constructor() {}

    /**
     * Calculates the final conviction score and edge.
     * @param {Object} params { sport, marketProb, modelProb, betType }
     * @returns {Object} { convictionScore, edge, lowSample, hybridScore, regimeType }
     */
    calculateConviction(params) {
        const { sport, marketProb, modelProb, betType = 'prop', isPlayIn = false, lowSample = false, isFallback = false } = params;
        
        // 1. Calculate Hybrid Score (Simple average for base)
        const hybridScore = (marketProb + modelProb) / 2;
        
        // 2. Calculate Edge (Distance from break-even 54.3% for PrizePicks)
        const breakEven = betType === 'prop' ? 0.543 : 0.50;
        const edge = hybridScore - breakEven;

        // 3. Apply Weighted Conviction Math
        let wEdge, wConf;
        let regimeType = 'Standard';

        if (isFallback) {
            // Research-Only Fallback: 100% weight on research model
            wEdge = 0.0;
            wConf = 1.0;
            regimeType = 'Research Fallback';
        } else if (betType === 'prop') {
            wEdge = 0.4;
            wConf = 0.6;
            regimeType = edge > 0.03 ? 'Alpha Divergence' : 'Market Aligned';
        } else {
            wEdge = 0.7;
            wConf = 0.3;
        }

        // Play-In Tonight Adjustment
        if (isPlayIn && !isFallback) {
            wEdge = Math.min(wEdge, 0.5);
            wConf = 1 - wEdge;
            regimeType = 'High Volatility';
        }

        const normalizedEdge = Math.min(1.0, edge / 0.05); 
        const confidence = modelProb; 

        const rawConviction = (normalizedEdge * wEdge) + (confidence * wConf);
        const convictionScore = Math.round(rawConviction * 100);

        // Recommended Sizing logic
        const recommendedSizing = convictionScore > 80 ? 'Heavy (5%)' : convictionScore > 60 ? 'Standard (2%)' : 'Minimal (1%)';

        return {
            convictionScore,
            edge: (edge * 100).toFixed(1) + '%',
            hybridScore,
            lowSample: lowSample || confidence < 0.50,
            regimeType,
            recommendedSizing,
            stopStrategy: convictionScore < 50 ? 'Hard Stop' : 'Trailing'
        };
    }

    /**
     * Standardizes the report for Firestore (MCH Structured Schema).
     */
    formatReport(id, domain, targetAsset, synthesis, agentData) {
        return {
            id: id,
            metadata: {
                request_id: id,
                timestamp: Date.now(),
                domain: domain,
                target_asset: targetAsset,
                status: synthesis.isFallback ? '[RESEARCH ONLY]' : 'FINAL'
            },
            synthesis: {
                overall_conviction_score: synthesis.convictionScore,
                regime_type: synthesis.regimeType,
                veto_flag: synthesis.lowSample && synthesis.convictionScore < 60,
                recommended_sizing: synthesis.recommendedSizing,
                stop_strategy: synthesis.stopStrategy
            },
            agent_data: agentData
        };
    }
}

module.exports = ActuaryAgent;
