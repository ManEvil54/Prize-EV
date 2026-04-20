const admin = require("firebase-admin");
const briefManager = require("../services/brief_manager");
const logger = require("firebase-functions/logger");

if (admin.apps.length === 0) {
    admin.initializeApp();
}
const db = admin.firestore();

/**
 * Handles TWEAK signals to swap picks.
 */
class TweakHandler {
    /**
     * Swaps a primary pick with a reserve pick and recalculates parlay math.
     */
    async handleTweakSignal(briefId, playerId) {
        logger.info(`[TWEAK] Signal received for Brief: ${briefId}, Player: ${playerId}`);
        
        const briefRef = db.collection("weekly_briefs").doc(briefId);
        const doc = await briefRef.get();
        
        if (!doc.exists) {
            throw new Error(`Weekly brief ${briefId} not found.`);
        }

        const data = doc.data();
        const primaryIndex = data.primary_picks.findIndex(p => p.player_name === playerId || p.id === playerId);
        
        if (primaryIndex === -1) {
            throw new Error(`Player ${playerId} not found in primary picks.`);
        }

        if (!data.reserve_pool || data.reserve_pool.length === 0) {
            throw new Error(`No reserve picks available in pool.`);
        }

        // Archive original pick
        const originalPick = data.primary_picks[primaryIndex];
        const replacementPick = data.reserve_pool.shift(); // Take the first reserve pick

        logger.info(`[TWEAK] Swapping ${originalPick.player_name} with ${replacementPick.player_name}`);

        // Update pick statuses
        originalPick.status = 'TWEAKED';
        replacementPick.status = 'LOCKED';

        // Update arrays
        data.primary_picks[primaryIndex] = replacementPick;
        if (!data.archived_picks) data.archived_picks = [];
        data.archived_picks.push(originalPick);

        // Recalculate parlay probability
        const newParlayProb = briefManager.calculateParlayProbability(data.primary_picks);
        
        await briefRef.update({
            primary_picks: data.primary_picks,
            reserve_pool: data.reserve_pool,
            archived_picks: data.archived_picks,
            "metrics.current_parlay_prob": newParlayProb,
            last_tweak: admin.firestore.FieldValue.serverTimestamp()
        });

        return {
            success: true,
            replaced: originalPick.player_name,
            new_pick: replacementPick.player_name,
            new_parlay_prob: newParlayProb
        };
    }
}

module.exports = new TweakHandler();
