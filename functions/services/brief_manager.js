const admin = require("firebase-admin");
const logger = require("firebase-functions/logger");

if (admin.apps.length === 0) {
    admin.initializeApp();
}
const db = admin.firestore();

/**
 * Manages the Weekly Brief document lifecycle.
 */
class BriefManager {
    /**
     * Creates a new weekly_brief document in Firestore.
     */
    async createWeeklyBrief(golden5, reservePool) {
        const briefId = `brief_${new Date().toISOString().split('T')[0]}`;
        const briefData = {
            id: briefId,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            status: 'DRAFT',
            primary_picks: golden5.map(p => ({
                ...p,
                status: 'DRAFT'
            })),
            reserve_pool: reservePool.map(p => ({
                ...p,
                status: 'DRAFT'
            })),
            metrics: {
                target_hit_rate: 0.60,
                target_parlay_rate: 0.25,
                current_parlay_prob: this.calculateParlayProbability(golden5)
            }
        };

        await db.collection("weekly_briefs").doc(briefId).set(briefData, { merge: true });
        return briefId;
    }

    /**
     * Calculates the total parlay probability (Product of individual probabilities).
     */
    calculateParlayProbability(picks) {
        if (!picks || picks.length === 0) return 0;
        return picks.reduce((acc, pick) => acc * (pick.market_prob || 0.5), 1);
    }

    /**
     * Updates performance metrics based on results.
     */
    async updatePerformanceMetrics(briefId) {
        const doc = await db.collection("weekly_briefs").doc(briefId).get();
        if (!doc.exists) return;

        const data = doc.data();
        const results = data.primary_picks.filter(p => p.status === 'WIN' || p.status === 'LOSS');
        if (results.length === 0) return;

        const wins = results.filter(p => p.status === 'WIN').length;
        const hitRate = wins / results.length;
        const performanceDelta = hitRate - data.metrics.target_hit_rate;

        await db.collection("weekly_briefs").doc(briefId).update({
            "metrics.current_hit_rate": hitRate,
            "metrics.performance_delta": performanceDelta
        });
    }
}

module.exports = new BriefManager();
