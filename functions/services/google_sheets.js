const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');

/**
 * Updates the Google Sheet with the top 5 hybrid score picks.
 * @param {string} spreadsheetId 
 * @param {Array} topPicks 
 * @param {Object} credentials Service account credentials { client_email, private_key }
 * @param {Object} summary { totalAnalyzed, playsFound, modes }
 */
async function updateDashboard(spreadsheetId, topPicks, credentials, summary = {}) {
    try {
        const serviceAccountAuth = new JWT({
            email: credentials.client_email,
            key: credentials.private_key,
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });

        const doc = new GoogleSpreadsheet(spreadsheetId, serviceAccountAuth);
        await doc.loadInfo();

        // Case-insensitive sheet search
        let sheet = doc.sheetsByTitle['Dashboard'];
        if (!sheet) {
            // Check for lowercase or other variations
            sheet = doc.sheetsByIndex.find(s => s.title.toLowerCase() === 'dashboard');
        }
        
        const headers = ['Player', 'Sport', 'Prop Type', 'Line', 'Market Prob', 'Model Prob', 'Hybrid Score'];
        
        // Create if not exists
        if (!sheet) {
            sheet = await doc.addSheet({ title: 'Dashboard', headerValues: headers });
        } else {
            await sheet.clear();
            // Ensure minimum grid size for Heartbeat write
            await sheet.resize({ rowCount: 100, columnCount: 10 });
        }

        // Heartbeat Row (Row 1)
        const timestamp = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
        const heartbeatValues = [
            `LAST_SYNC: ${timestamp}`,
            `TOTAL_PROPS_ANALYZED: ${summary.totalAnalyzed || 0}`,
            `PLAYS_FOUND: ${summary.playsFound || 0}`,
            `MODES: ${summary.modes || 'N/A'}`
        ];

        // Pad with empty strings to match header length for consistency
        while (heartbeatValues.length < headers.length) heartbeatValues.push('');

        // Load cells for formatting
        await sheet.loadCells('A1:G2'); 
        
        // Write Heartbeat to Row 1
        for (let i = 0; i < heartbeatValues.length; i++) {
            const cell = sheet.getCell(0, i);
            cell.value = heartbeatValues[i];
            cell.format = { 
                textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } },
                backgroundColor: { red: 0.1, green: 0.5, blue: 0.2 } // Deep Green for "Alive"
            };
        }

        // Write Headers to Row 2
        for (let i = 0; i < headers.length; i++) {
            const cell = sheet.getCell(1, i);
            cell.value = headers[i];
            cell.format = { textFormat: { bold: true } };
        }

        await sheet.saveUpdatedCells();

        const rows = topPicks.map(pick => ({
            'Player': pick.player || 'N/A',
            'Sport': pick.sport || 'N/A',
            'Prop Type': pick.propType || 'N/A',
            'Line': pick.line || 'N/A',
            'Market Prob': pick.marketProb ? (pick.marketProb * 100).toFixed(2) + '%' : 'N/A',
            'Model Prob': pick.modelProb ? (pick.modelProb * 100).toFixed(2) + '%' : 'N/A',
            'Hybrid Score': pick.hybridScore ? (pick.hybridScore * 100).toFixed(2) + '%' : 'N/A'
        }));

        // Add pick rows starting from Row 3 (index 2)
        // Note: Using addRows normally adds at the end, but we cleared the sheet
        await sheet.addRows(rows);
        console.log('Successfully updated Google Sheets Dashboard.');

    } catch (error) {
        console.error('Error updating Google Sheets:', error);
        throw error; // Re-throw to ensure orchestrator catches the failure
    }
}

module.exports = { updateDashboard };
