const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');

puppeteer.use(StealthPlugin());

/**
 * Fetches projections from PrizePicks internal API using Puppeteer Stealth.
 * @returns {Promise<Object>} The JSON payload from PrizePicks.
 */
async function fetchPrizePicksProjections() {
    const cacheDir = path.join(__dirname, '..', 'node_modules', '.cache', 'puppeteer');
    console.log(`[SCRAPER] Using Puppeteer cache directory: ${cacheDir}`);
    
    if (fs.existsSync(cacheDir)) {
        console.log(`[SCRAPER] Cache directory exists. Contents: ${fs.readdirSync(cacheDir).join(', ')}`);
    } else {
        console.warn(`[SCRAPER] WARNING: Cache directory does NOT exist at ${cacheDir}`);
    }

    const browser = await puppeteer.launch({
        headless: 'new',
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || null,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--single-process'
        ]
    });

    const page = await browser.newPage();
    
    // Set human-like headers
    await page.setExtraHTTPHeaders({
        'Accept-Language': 'en-US,en;q=0.9',
    });
    
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    console.log('Navigating to PrizePicks projections...');
    
    let projectionsData = null;

    // Intercept the response from the projections endpoint
    page.on('response', async (response) => {
        const url = response.url();
        if (url.includes('api.prizepicks.com/projections') && response.status() === 200) {
            try {
                projectionsData = await response.json();
                console.log('Successfully captured PrizePicks JSON.');
            } catch (e) {
                console.error('Error parsing PrizePicks JSON:', e);
            }
        }
    });

    try {
        await page.goto('https://www.prizepicks.com/projections', {
            waitUntil: 'networkidle2',
            timeout: 60000
        });
        
        // Wait a bit more to ensure the background request is captured
        await new Promise(r => setTimeout(r, 5000));
        
    } catch (error) {
        console.error('Error during PrizePicks navigation:', error);
    } finally {
        await browser.close();
    }

    return projectionsData;
}

module.exports = { fetchPrizePicksProjections };
