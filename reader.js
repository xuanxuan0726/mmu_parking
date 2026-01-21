import HID from 'node-hid';
import axios from 'axios';
import http from 'http';
import url from 'url';

// --- CONFIGURATION ---
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
console.log("✅ Reader Connected!");

// Helper: Calculate CheckSum (From SDK)
function calculateCheckSum(data, length) {
    let bSum = 0x00;
    for(let i = 2; i < length; i++) bSum += data[i];
    return (~bSum + 1) & 0xFF;
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Flag to pause scanning while writing
let isBusy = false; 

// --- 1. INITIAL SETUP ---
try {
    // Wake up
    device.sendFeatureReport([0x00,0xFF, 0xC7, 0x83, 0xCC, 0x30, 0x00]);
    
    // --- KEY CHANGE: SET ANSWER MODE (0x2C) INSTEAD OF ACTIVE MODE ---
    // This stops the reader from scanning automatically
    device.write([0x00, 0x09, 0x53, 0x57, 0x00, 0x05, 0xFF, 0x24, 0x02, 0x00, 0x2C]); 
    console.log("🔇 Mode set to: Answer Mode (Silent)");

} catch (e) { console.log("⚠️ Init warning:", e.message); }


// --- 2. POLLING LOOP (The "Heartbeat") ---
// We ask the reader to scan every 1.5 seconds
setInterval(() => {
    if (!isBusy) {
        try {
            // Send "Scan TID" Command (From SDK: 0x24, 0x0A, 0x01, 0x23)
            // This triggers ONE scan and ONE beep
            device.write([0x00, 0x09, 0x53, 0x57, 0x00, 0x05, 0xFF, 0x24, 0x0A, 0x01, 0x23]);
        } catch (e) {
            console.error("Scan Error (Reader unplugged?)");
        }
    }
}, 1500); // <--- CHANGE THIS NUMBER to make it beep faster or slower (1500ms = 1.5s)


// --- 3. LISTENING SERVER (For Write Command) ---
http.createServer(async (req, res) => {
    const reqUrl = url.parse(req.url, true);

    if (reqUrl.pathname === '/write' && req.method === 'GET') {
        const mmu_id = reqUrl.query.mmu_id || "00000000";
        console.log(`✍️ Write Request: [${mmu_id}]`);
        
        isBusy = true; // Stop the polling loop
        
        // Prepare Data
        let writeData = Buffer.alloc(28);
        writeData[0] = 0x00; writeData[1] = 26; writeData[2] = 0x53; writeData[3] = 0x57; 
        writeData[4] = 0x00; writeData[5] = 0x16; writeData[6] = 0xFF; writeData[7] = 0x03; 
        writeData[8] = 0x03; writeData[9] = 0x00; writeData[10] = 0x06; 
        
        // Password & Content
        writeData[11] = 0x00; writeData[12] = 0x00; writeData[13] = 0x00; writeData[14] = 0x00;
        for(let i=0; i<12; i++) writeData[15+i] = mmu_id.charCodeAt(i) || 0x00; 

        writeData[27] = calculateCheckSum(writeData, 27);

        try {
            // Send Write Command
            device.write(writeData);
            console.log("   -> Writing...");
            await sleep(1000); // Wait for write to finish
            
            isBusy = false; // Resume polling
            res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify({ status: "success" }));

        } catch (err) {
            isBusy = false;
            res.writeHead(500);
            res.end(JSON.stringify({ status: "error", message: err.message }));
        }
    }
}).listen(READER_PORT, () => {});


// --- 4. DATA LISTENER ---
device.on('data', function(data) {
    // Valid Data Packet Check
    if(data[1] === 0x43 && data[2] === 0x54 && data[6] === 0x45) {
        
        let tagId = "";
        for (let i = 19; i <= 30; i++) {
            let hex = data[i].toString(16).toUpperCase();
            if (hex.length < 2) hex = "0" + hex;
            tagId += hex;
        }

        console.log(`🔔 Scanned: ${tagId}`);
        axios.get(`${SERVER_URL}?card=${tagId}`).catch(e => {});
    }
});