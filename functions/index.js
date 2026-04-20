const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

// Service Imports
const { fetchPrizePicksProjections } = require('./services/prizepicks_scraper');
const { updateDashboard } = require('./services/google_sheets');
const { fuzzyMatch } = require('./engine/hybrid_engine');
const { getPrioritySports } = require('./utils/season_manager');
const briefManager = require('./services/brief_manager');

// Agent Imports
const StatisticianAgent = require('./engine/statistician');
const MatchupScoutAgent = require('./engine/matchup_scout');
const ActuaryAgent = require('./engine/actuary');
const ResearchAgent = require('./engine/research_agent');
const tweakHandler = require('./engine/tweak_handler');

if (admin.apps.length === 0) {
    admin.initializeApp();
}
const db = admin.firestore();

// Command Hub Sync
const HUB_PROJECT_ID = 'manny-control-hub';
const hubApp = admin.apps.find(a => a.name === 'hub') || admin.initializeApp({ projectId: HUB_PROJECT_ID }, 'hub');
const hubDb = hubApp.firestore();

// Define Secrets
const THE_ODDS_API_KEY_SECRET = defineSecret("THE_ODDS_API_KEY_SEC");
const GOOGLE_CREDENTIALS_SECRET = defineSecret("GOOGLE_CREDENTIALS_SEC");
const RAPID_API_KEY_SECRET = defineSecret("RAPID_API_KEY_SEC");

const SPREADSHEET_ID = '1CL5ArzQK2ju7QZDn0Z2kyQtHLI6y3rINtV9bI85K5Qg';

/**
 * Weekly Research Analysis
 * Triggered every Sunday at 18:00 PST (02:00 UTC Monday)
 */
exports.weeklyResearch = onSchedule({
    schedule: "0 2 * * 1", // 2:00 AM UTC Monday (approx 18:00 PST Sunday)
    timeZone: "UTC",
    memory: "2GiB",
    timeoutSeconds: 540,
    secrets: [THE_ODDS_API_KEY_SECRET, GOOGLE_CREDENTIALS_SECRET, RAPID_API_KEY_SECRET]
}, async (event) => {
    logger.info("Executing Weekly Research Agent (The Analyst)...");
    return runAnalysis(true); // true indicates weekly research mode
});

/**
 * Manual Sync Trigger
 */
exports.manualSync = onRequest({
    secrets: [THE_ODDS_API_KEY_SECRET, GOOGLE_CREDENTIALS_SECRET, RAPID_API_KEY_SECRET],
    memory: "2GiB",
    timeoutSeconds: 540
}, async (req, res) => {
    logger.info("Manual Sync Triggered...");
    try {
        const stats = await runAnalysis();
        res.status(200).send(`Sync completed successfully. \n\nSTATUS:\n- Google Sheets: ${stats.sheets}\n- Manny Hub: ${stats.hub}`);
    } catch (e) {
        logger.error("Manual Sync Failed:", e);
        res.status(500).send("Error triggering sync: " + e.message);
    }
});

/**
 * TWEAK Signal Handler
 */
exports.handleTweak = onRequest({
    secrets: [GOOGLE_CREDENTIALS_SECRET],
    memory: "1GiB"
}, async (req, res) => {
    const { briefId, playerId } = req.body;
    if (!briefId || !playerId) {
        return res.status(400).send("Missing briefId or playerId in request body.");
    }

    try {
        const result = await tweakHandler.handleTweakSignal(briefId, playerId);
        res.status(200).json(result);
    } catch (e) {
        logger.error("Tweak Failed:", e.message);
        res.status(500).send("Tweak error: " + e.message);
    }
});

/**
 * Core Orchestrator Logic
 */
async function runAnalysis(isWeeklyResearch = false) {
    logger.info(`Starting Orchestrator Flow (WeeklyResearch: ${isWeeklyResearch})...`);
    const stats = { sheets: "PENDING", hub: "PENDING" };

    // Update Heartbeat
    try {
        await hubDb.collection("agents").doc("prize_ev_bot").set({
            id: "prize_ev_bot",
            name: "Prize EV",
            type: "Betting Engine",
            status: "ACTIVE",
            last_seen: admin.firestore.FieldValue.serverTimestamp(),
            version: "1.4.0"
        }, { merge: true });
    } catch (e) {
        logger.error("Failed to update Heartbeat in Hub:", e.message);
    }
    
    const apiKey = THE_ODDS_API_KEY_SECRET.value();
    const rapidApiKey = RAPID_API_KEY_SECRET.value();
    const sheetsCredentials = JSON.parse(GOOGLE_CREDENTIALS_SECRET.value() || '{}');

    // Initialize Agents
    const statistician = new StatisticianAgent(apiKey);
    const mockupScout = new MatchupScoutAgent(rapidApiKey);
    const actuary = new ActuaryAgent();
    const researchBot = new ResearchAgent();

    try {
        const ppProjections = await fetchPrizePicksProjections();
        const sportsToAnalyze = getPrioritySports();
        const allReports = [];

        for (const sport of sportsToAnalyze) {
            logger.info(`[ORCHESTRATOR] Processing ${sport}...`);
            
            let marketProbs = new Map();
            let isFallbackMode = false;
            try {
                marketProbs = await statistician.analyzeMarket(sport);
                if (marketProbs.size === 0) isFallbackMode = true;
            } catch (e) {
                isFallbackMode = true;
            }
            
            await mockupScout.scout(sport);

            if (ppProjections && ppProjections.data) {
                for (const prop of ppProjections.data) {
                    if (prop.attributes.sport !== sport) continue;

                    const playerName = prop.attributes.display_name;
                    const propType = prop.attributes.stat_type;
                    const line = prop.attributes.line_score;

                    const marketMatch = fuzzyMatch(playerName, Array.from(marketProbs.keys()));
                    const marketProb = marketMatch.match ? marketProbs.get(marketMatch.match) : 0.50;

                    const perfMatch = fuzzyMatch(playerName, Array.from(mockupScout.pgaStats.sga.keys()));
                    const perfData = mockupScout.getPerformanceProbability(sport, playerName, perfMatch.match);

                    const metrics = actuary.calculateConviction({
                        sport, marketProb, modelProb: perfData.prob, 
                        isFallback: isFallbackMode, lowSample: perfData.lowSample
                    });

                    const threshold = isFallbackMode ? 40 : 65;
                    if (metrics.convictionScore >= threshold) {
                        const report = actuary.formatReport(
                            `bet_${sport.toLowerCase()}_${playerName.toLowerCase().replace(/ /g, '_')}`,
                            'sports_betting', playerName, metrics, 
                            { 
                                technical: { score: Math.round(marketProb * 100) },
                                fundamental: { score: Math.round(perfData.prob * 100) },
                                risk: { score: 100 - metrics.convictionScore }
                            }
                        );
                        
                        report.player_name = playerName;
                        report.sport = sport;
                        report.prop_type = propType;
                        report.line = line;
                        report.market_prob = marketProb;
                        report.model_prob = perfData.prob;
                        report.hybrid_score = metrics.hybridScore;
                        
                        allReports.push(report);
                    }
                }
            }
        }

        // Research Bot Logic: Sort into Golden 5 and Reserve Pool
        const { golden5, reservePool } = researchBot.scoutWeeklyMarkets(allReports);

        // Create Weekly Brief if in Research mode or manually triggered
        if (isWeeklyResearch || allReports.length > 0) {
            const briefId = await briefManager.createWeeklyBrief(golden5, reservePool);
            logger.info(`[ORCHESTRATOR] Created Weekly Brief: ${briefId}`);
        }

        // Update Hub Reports
        try {
            const batch = hubDb.batch();
            golden5.forEach(report => {
                const ref = hubDb.collection("bot_analysis_reports").doc(report.id);
                batch.set(ref, report, { merge: true });
            });
            await batch.commit();
            stats.hub = "SUCCESS";
        } catch (e) {
            stats.hub = `ERROR: ${e.message}`;
        }

        // Update Sheets Backup
        try {
            await updateDashboard(SPREADSHEET_ID, golden5.map(r => ({
                player: r.player_name, sport: r.sport, propType: r.prop_type,
                line: r.line, marketProb: r.market_prob, modelProb: r.model_prob,
                hybridScore: r.hybrid_score
            })), sheetsCredentials, {
                totalAnalyzed: ppProjections?.data?.length || 0,
                playsFound: allReports.length
            });
            stats.sheets = "SUCCESS";
        } catch (e) {
            stats.sheets = `ERROR: ${e.message}`;
        }

        return stats;
    } catch (error) {
        logger.error("Global Error in runAnalysis:", error);
        throw error;
    }
}
