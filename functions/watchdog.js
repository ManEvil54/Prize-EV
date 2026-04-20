require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const redisHub = require('./services/redis_hub');
const logger = require('firebase-functions/logger');

// Thresholds
const CHECK_INTERVAL_MS = 300000; // 5 minutes (less aggressive)
const QUOTA_ALERT_THRESHOLD = 0.20; // 20%
const TOTAL_MONTHLY_QUOTA = 500; // Example: Set your plan's total here

async function monitorQuota() {
    try {
        const remainingStr = await redisHub.get(redisHub.constructor.keys.quota);
        if (remainingStr === null) {
            logger.warn('[WATCHDOG] Quota info not found in Redis yet.');
            return;
        }

        const remaining = parseInt(remainingStr);
        const percentRemaining = remaining / TOTAL_MONTHLY_QUOTA;

        console.log(`\n[WATCHDOG] API QUOTA STATUS: ${remaining} remaining (${(percentRemaining * 100).toFixed(1)}%)`);

        if (percentRemaining < QUOTA_ALERT_THRESHOLD) {
            console.log('------------------------------------------------------------');
            console.log('🚨 WARNING: ODDS API QUOTA IS BELOW 20%!');
            console.log(`Remaining: ${remaining} requests.`);
            console.log('------------------------------------------------------------');
            
            // Optionally: Send a signal to Redis to throttle bots
            await redisHub.set('MCH:SYSTEM:THROTTLE', 'true', 3600);
        }
    } catch (e) {
        logger.error('[WATCHDOG] Failed to monitor quota:', e.message);
    }
}

async function monitorHeartbeats() {
    // Check if ingestor is active by looking at Ticker updates
    const solData = await redisHub.get(redisHub.constructor.keys.ticker('SOL'));
    if (solData && solData.timestamp) {
        const ageSeconds = (Date.now() - solData.timestamp) / 1000;
        if (ageSeconds > 15) {
            console.log(`\n[WATCHDOG] ⚠️  INGESTOR DELAY: SOL Ticker is ${ageSeconds.toFixed(1)}s old!`);
        }
    }
}

async function start() {
    console.log('[WATCHDOG] Watchdog Agent Started.');
    
    // Initial runs
    await monitorQuota();
    await monitorHeartbeats();
    
    // Schedules
    setInterval(monitorQuota, CHECK_INTERVAL_MS); // Check quota every 5 mins
    setInterval(monitorHeartbeats, 30000); // Check heartbeats every 30s
}

// Execution
if (require.main === module) {
    start().catch(err => {
        logger.error('[WATCHDOG] Critical failure:', err);
        process.exit(1);
    });
}

module.exports = { start };
