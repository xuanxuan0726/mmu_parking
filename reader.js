// reader.js - MMU Parking Hardware Bridge (Auto-fill Support)
import HID from 'node-hid';
import axios from 'axios';
import http from 'http';
import url from 'url';

const VENDOR_ID = 0x1a86; 
const PRODUCT_ID = 0xe010; 
const SERVER_URL = 'http://localhost:3000/api/entry';
const READER_PORT = 4000; 

console.log("🔍 Searching for MMU Parking Reader...");

const devices = HID.devices();
const deviceInfo = devices.find( d => d.vendorId === VENDOR_ID && d.productId === PRODUCT_ID && !d.path.includes('kbd'));

if (!deviceInfo) {
    console.error("❌ Reader not found. Please check USB connection.");
    process.exit(1);
}

const device = new HID.HID(deviceInfo.path);
console.log("✅ Reader Connected! (Using ReaderSoft Settings)");

function calculateCheckSum(data, length) {
    let bSum = 0x00;
    for(let i = 2; i < length; i++) bSum += data[i];
    return (~bSum + 1) & 0xFF;
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
let isBusy = false; 

// --- NEW: Store the last scanned tag for the dashboard ---
let globalLastTag = ""; 

try {
    device.sendFeatureReport([0x00,0xFF, 0xC7, 0x83, 0xCC, 0x30, 0x00]); 
} catch (e) {}

setInterval(() => {
    if (!isBusy) {
        try {
            // Asking for EPC (Correct)
            device.write([0x00, 0x09, 0x53, 0x57, 0x00, 0x05, 0xFF, 0x24, 0x0A, 0x00, 0x24]);
        } catch (e) {}
    }
}, 1500); 

http.createServer(async (req, res) => {
    const reqUrl = url.parse(req.url, true);

    // --- NEW ENDPOINT: Return the last scanned tag to the dashboard ---
    if (reqUrl.pathname === '/last-scan' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ uid: globalLastTag }));
        globalLastTag = ""; // Clear it so we don't keep sending the same one
        return;
    }

    if (reqUrl.pathname === '/write' && req.method === 'GET') {
        const mmu_id = reqUrl.query.mmu_id || "00000000";
        console.log(`✍️ Write Request: [${mmu_id}]`);
        
        isBusy = true; 
        
        let writeData = Buffer.alloc(28);
        writeData[0] = 0x00; writeData[1] = 26; writeData[2] = 0x53; writeData[3] = 0x57; 
        writeData[4] = 0x00; writeData[5] = 0x16; writeData[6] = 0xFF; writeData[7] = 0x03; 
        writeData[8] = 0x03; writeData[9] = 0x00; writeData[10] = 0x06; 
        
        writeData[11] = 0x00; writeData[12] = 0x00; writeData[13] = 0x00; writeData[14] = 0x00;
        for(let i=0; i<12; i++) writeData[15+i] = mmu_id.charCodeAt(i) || 0x00; 

        writeData[27] = calculateCheckSum(writeData, 27);

        try {
            device.write(writeData);
            console.log("   -> Writing...");
            await sleep(1000); 
            
            isBusy = false; 

            res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify({ status: "success" }));

        } catch (err) {
            isBusy = false;
            res.writeHead(500);
            res.end(JSON.stringify({ status: "error", message: err.message }));
        }
    }
}).listen(READER_PORT, () => {});

device.on('data', function(data) {
    if(data[1] === 0x43 && data[2] === 0x54 && data[6] === 0x45) {
        
        let tagId = "";
        for (let i = 19; i <= 30; i++) {
            let hex = data[i].toString(16).toUpperCase();
            if (hex.length < 2) hex = "0" + hex;
            tagId += hex;
        }

        console.log(`🔔 Scanned: ${tagId}`);
        globalLastTag = tagId; // Save it for the dashboard auto-fill
        axios.get(`${SERVER_URL}?card=${tagId}`).catch(e => {});
    }
});