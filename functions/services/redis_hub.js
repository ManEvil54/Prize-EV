const Redis = require('ioredis');
const logger = require('firebase-functions/logger');

// Strategy: Single Redis instance for the GCE VM
// Strategy: Support both local and managed Redis (Redis Cloud)
const REDIS_URL = process.env.REDIS_URL || 'redis://default:FcB1OciNTY1xqc86iHoRBeBmfJhsp3a7@redis-10564.c17.us-east-1-4.ec2.cloud.redislabs.com:10564';

class RedisHub {
    constructor() {
        this.client = new Redis(REDIS_URL, {
            retryStrategy: (times) => {
                const delay = Math.min(times * 50, 2000);
                return delay;
            }
        });

        this.client.on('error', (err) => {
            logger.error('[REDIS_HUB] connection error:', err);
        });

        this.client.on('connect', () => {
            logger.info('[REDIS_HUB] Connected to Redis.');
        });
    }

    /**
     * Set a tactical intelligence key with an expiration.
     * @param {string} key 
     * @param {any} value 
     * @param {number} ttlSeconds 
     */
    async set(key, value, ttlSeconds = 300) {
        const val = typeof value === 'string' ? value : JSON.stringify(value);
        if (ttlSeconds) {
            await this.client.set(key, val, 'EX', ttlSeconds);
        } else {
            await this.client.set(key, val);
        }
    }

    /**
     * Get a tactical intelligence key.
     * @param {string} key 
     * @returns {Promise<any>}
     */
    async get(key) {
        const val = await this.client.get(key);
        try {
            return JSON.parse(val);
        } catch (e) {
            return val;
        }
    }

    /**
     * Publish a message to a channel.
     * @param {string} channel 
     * @param {any} message 
     */
    async publish(channel, message) {
        const msg = typeof message === 'string' ? message : JSON.stringify(message);
        await this.client.publish(channel, msg);
    }

    /**
     * Get a subscriber instance.
     * @returns {Redis}
     */
    getSubscriber() {
        return new Redis(REDIS_URL);
    }

    /**
     * Key generator for the MCH schema.
     */
    static keys = {
        ticker: (symbol) => `MCH:TICKER:${symbol.toUpperCase()}`,
        odds: (sport) => `MCH:ODDS:${sport.toUpperCase()}`,
        props: (eventId) => `MCH:PROPS:${eventId}`,
        signal: (botId) => `MCH:SIGNAL:${botId.toUpperCase()}`,
        quota: 'MCH:QUOTA:REMAINING',
        events: 'MCH:EVENTS:LIVE'
    };
}

module.exports = new RedisHub();
