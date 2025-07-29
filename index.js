// Required modules
const fs = require('fs');
const readline = require('readline');
const path = require('path');
const https = require('https');
const { format } = require('date-fns');

// Constants
const API_URL = 'https://tcgcsv.com/tcgplayer/79/groups';
const AUTO_GROUPS = [
    23405, // Spark of Rebellion
    23488, // Shadows of the Galaxy
    23597,  // Twilight of the Republic
    23956, // Jump to Lightspeed
    24279 // Legends of the Force
];

const OUTPUT_DIR = path.join(__dirname, 'data');

// Ensure fetch is available
const fetch = global.fetch || require('node-fetch');

// Download CSV directly from URL and save
function downloadAndSaveCSV(url, filename) {
    return new Promise((resolve, reject) => {
        const filePath = path.join(OUTPUT_DIR, filename);
        const file = fs.createWriteStream(filePath);
        https.get(url, (response) => {
            if (response.statusCode !== 200) {
                reject(new Error(`Failed to get '${url}' (${response.statusCode})`));
                return;
            }
            response.pipe(file);
            file.on('finish', () => {
                file.close();
                console.log(`✅ CSV saved to ${filename}`);
                resolve();
            });
        }).on('error', (err) => {
            fs.unlinkSync(filename);
            reject(err);
        });
    });
}

function askMode() {
    return new Promise(resolve => {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        rl.question('Choose mode: (1) CLI Selection (2) Auto Process List: ', answer => {
            rl.close();
            resolve(answer === '2' ? 'auto' : 'cli');
        });
    });
}

function displayAndPrompt(items) {
    const mappedItems = items.map(item => ({
        display: `${item.groupId}_${item.name}`,
        id: item.groupId,
        name: item.name
    }));

    console.log('\nAvailable Options:');
    mappedItems.forEach((item, index) => {
        console.log(`${index + 1}. ${item.display}`);
    });

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    rl.question('\nSelect an option by number: ', async (answer) => {
        const index = parseInt(answer) - 1;
        if (index >= 0 && index < mappedItems.length) {
            const selectedItem = mappedItems[index];
            console.log(`\nYou selected: ${selectedItem.display}`);

            const groupId = selectedItem.id;
            const groupName = selectedItem.name.replace(/[^a-zA-Z0-9]/g, '_');
            const today = format(new Date(), 'yyyyMMdd');
            const filename = `${groupName}_Prices_${today}.csv`;
            const downloadUrl = `https://tcgcsv.com/tcgplayer/79/${groupId}/ProductsAndPrices.csv`; // CSV endpoint

            await downloadAndSaveCSV(downloadUrl, filename);
        } else {
            console.log('\nInvalid selection.');
        }
        rl.close();
    });
}

(async () => {
    console.log('⚙️ Starting SWU Price Tracker...');
    const mode = await askMode();

    if (mode === 'auto') {
        for (const groupId of AUTO_GROUPS) {
            const groupList = await fetch(API_URL).then(res => res.json());
            const group = groupList.results.find(g => g.groupId === groupId);
            if (!group) {
                console.warn(`Group ID ${groupId} not found.`);
                continue;
            }

            const groupName = group.name.replace(/[^a-zA-Z0-9]/g, '_');
            const today = format(new Date(), 'yyyyMMdd');
            const filename = `${groupName}_Prices_${today}.csv`;
            const downloadUrl = `https://tcgcsv.com/tcgplayer/79/${groupId}/ProductsAndPrices.csv`;

            await downloadAndSaveCSV(downloadUrl, filename);
        }
    } else {
        const groupList = await fetch(API_URL).then(res => res.json());
        if (groupList && groupList.results.length > 0) {
            displayAndPrompt(groupList.results);
        } else {
            console.log('No results found.');
        }
    }
})();
