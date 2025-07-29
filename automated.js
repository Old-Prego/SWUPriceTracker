// Required modules
const fs = require('fs');
const readline = require('readline');
const path = require('path');
const https = require('https');
const { format } = require('date-fns');
const csvParser = require('csv-parser');

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
const RESULTS_DIR = path.join(__dirname, 'results');

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR);
}

if (!fs.existsSync(RESULTS_DIR)) {
    fs.mkdirSync(RESULTS_DIR);
}

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
                console.log(`|o| [o] |o| CSV saved to ${filename} |o| [o] |o|`);
                resolve(filePath); // Return the local path
            });
        }).on('error', (err) => {
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            reject(err);
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
    

    const groupList = await fetch(API_URL).then(res => res.json());
    if (!groupList || !groupList.results.length) {
        console.log('No results found.');
        return;
    }
    const groupsToProcess = groupList.results;

    const downloadedFiles = [];
    const now = new Date();
    const dateStr = format(now, 'yyyyMMdd');
    const dateTimeStr = format(now, 'yyyyMMdd_HHmm');

    for (const group of groupsToProcess) {
        const groupName = group.name.replace(/[^a-zA-Z0-9]/g, '_');
        const filename = `${groupName}_Prices_${dateStr}.csv`;
        const downloadUrl = `https://tcgcsv.com/tcgplayer/79/${group.groupId}/ProductsAndPrices.csv`;

        try {
            const filePath = await downloadAndSaveCSV(downloadUrl, filename);
            downloadedFiles.push(filePath);
        } catch (error) {
            console.warn(`Failed to download group ${group.groupId}: ${error.message}`);
        }
    }

    const mergedFileName = `Prices_${dateTimeStr}.csv`;
    const mergedFilePath = path.join(RESULTS_DIR, mergedFileName);

    console.log(mergedFilePath);
    
    if (downloadedFiles.length === 0) {
        console.warn('No CSV files to merge. Exiting.');
        return;
    }
    await mergeCSVFiles(downloadedFiles, mergedFilePath);

    deleteFiles(downloadedFiles)
})();


// Merge multiple CSV files into one
async function mergeCSVFiles(filePaths, outputFilePath) {
    const allRows = new Map(); // key = `${productId}_${groupId}`, value = row object
    const allColumns = new Set(); // Collect all unique columns

    for (const file of filePaths) {
        await new Promise((resolve, reject) => {
            fs.createReadStream(file)
                .pipe(csvParser())
                .on('headers', headers => {
                    headers.forEach(header => allColumns.add(header));
                })
                .on('data', row => {
                    const key = `${row.productId}_${row.groupId}`;
                    allRows.set(key, row); // Last row with same key wins
                })
                .on('end', resolve)
                .on('error', reject);
        });
    }

    const orderedColumns = Array.from(allColumns);

    const writeStream = fs.createWriteStream(outputFilePath);
    writeStream.write(orderedColumns.join(',') + '\n');

    for (const row of allRows.values()) {
        const line = orderedColumns.map(col => `"${(row[col] ?? '').replace(/"/g, '""')}"`).join(',') + '\n';
        writeStream.write(line);
    }

    writeStream.end();
    console.log(`Merged and normalized CSV saved to ${outputFilePath}`);
}


function deleteFiles(filePaths) {
    for (const filePath of filePaths) {
        try {
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            } else {
                console.warn(`File not found: ${filePath}`);
            }
        } catch (error) {
            console.error(`❌ Failed to delete ${filePath}: ${error.message}`);
        }
    }
}