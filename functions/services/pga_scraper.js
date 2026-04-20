const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

puppeteer.use(StealthPlugin());

const STAT_URLS = {
    SG_APPROACH: 'https://www.pgatour.com/stats/detail/02568',
    BIRDIE_CONV: 'https://www.pgatour.com/stats/detail/02334'
};

/**
 * Scrapes a PGA Tour stats page for player rankings and values.
 * @param {string} url 
 * @returns {Promise<Map<string, number>>}
 */
async function scrapePgaStat(url) {
    const browser = await puppeteer.launch({
        headless: 'new',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu'
        ]
    });

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    console.log(`Scraping PGA Stat: ${url}`);
    
    const statsMap = new Map();

    try {
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
        
        // Wait for the table to be visible
        await page.waitForSelector('table', { timeout: 10000 });

        // Extract data
        const players = await page.evaluate(() => {
            const rows = Array.from(document.querySelectorAll('table tbody tr'));
            return rows.map(row => {
                const nameCell = row.querySelector('td:nth-child(2)'); // Adjust if layout differs
                const valueCell = row.querySelector('td:nth-child(5)'); // Typically the 'Average' or 'Value' column
                
                if (nameCell && valueCell) {
                    return {
                        name: nameCell.innerText.trim(),
                        value: parseFloat(valueCell.innerText.trim())
                    };
                }
                return null;
            }).filter(p => p !== null);
        });

        players.forEach(p => statsMap.set(p.name, p.value));

    } catch (error) {
        console.error(`Error scraping PGA stat at ${url}:`, error.message);
    } finally {
        await browser.close();
    }

    return statsMap;
}

module.exports = { scrapePgaStat, STAT_URLS };
