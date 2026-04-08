// reader.js - MMU Parking Hardware Bridge (Max Power & Noise Filter)
import HID from 'node-hid';
import axios from 'axios';
import http from 'http';
import url from 'url';

const VENDOR_ID = 0x1a86; 
const PRODUCT_ID = 0xe010; 
const SERVER_URL = 'http://localhost:3000/api/entry';
const READER_PORT = 4000; 

console.log("🔍 Searching for MMU Parking Reader...");

const allDevices = HID.devices().filter(d => d.vendorId === VENDOR_ID && d.productId === PRODUCT_ID);
let deviceInfo = allDevices.find(d => d.usagePage === 0xFF00 || d.usagePage === 65280);
if (!deviceInfo) deviceInfo = allDevices.find(d => !d.path.includes('kbd') && d.usage !== 6); 

if (!deviceInfo) {
    console.error("❌ Reader not found. Please check USB connection.");
    process.exit(1);
}

console.log(`✅ Reader USB Connected!`);
const device = new HID.HID(deviceInfo.path);

device.on('error', function(err) {
    console.log("⚠️ Minor USB hiccup:", err.message);
});

function calculateCheckSum(data, length) {
    let bSum = 0x00;
    for(let i = 2; i < length; i++) bSum += data[i];
    return (~bSum + 1) & 0xFF;
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
let isBusy = false; 
let globalLastTag = ""; 

// --- THE CRITICAL HARDWARE HANDSHAKE ---
async function initializeHardware() {
    console.log("⏳ Running hardware handshake...");
    
    try {
        device.sendFeatureReport(Buffer.from([0x00,0xFF, 0xC7, 0x83, 0xCC, 0x30, 0x00])); 
        await sleep(200);
    } catch (e) {} 

    try {
        // --- UPGRADED: Set RF Power to MAX (26 dbm) ---
        device.write(Buffer.from([0x00, 0x09, 0x53, 0x57, 0x00, 0x05, 0xFF, 0x24, 0x05, 0x1A, 0x0F]));
        await sleep(200);

        // Force Answer Mode (Silent)
        device.write(Buffer.from([0x00, 0x09, 0x53, 0x57, 0x00, 0x05, 0xFF, 0x24, 0x02, 0x00, 0x2C]));
        await sleep(200);

        console.log("⚡ Hardware Ready & Silent (MAX POWER)!");
    } catch (e) {
        console.log("⚠️ Setup warning:", e.message);
    }
}

await initializeHardware();

// --- POLLING LOOP (EPC / ISO18000-6C) ---
setInterval(() => {
    if (!isBusy) {
        try {
            device.write(Buffer.from([0x00, 0x09, 0x53, 0x57, 0x00, 0x05, 0xFF, 0x24, 0x0A, 0x00, 0x24]));
        } catch (e) {}
    }
}, 1500); 

// --- INTERNAL WEBSERVER FOR DASHBOARD ---
http.createServer(async (req, res) => {
    // ... (This section remains identical for writing data)
    const reqUrl = url.parse(req.url, true);
    if (reqUrl.pathname === '/last-scan' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ uid: globalLastTag }));
        globalLastTag = ""; 
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

// --- UPGRADED DATA LISTENER ---
device.on('data', function(data) {
    let hexArray = Array.from(data).map(b => b.toString(16).padStart(2, '0').toUpperCase());

    // 1. FILTER: Ignore the "No Tag Found" spam (08 43 54 00 04 00 24 01 40)
    if (hexArray[1] === '43' && hexArray[6] === '24' && hexArray[7] === '01') {
        return; // Exit silently
    }

    // 2. If we reach here, it means we scanned a real tag!
    if (hexArray[1] !== '00' && hexArray[2] !== '00') {
        console.log("🌟 TAG DETECTED! RAW PACKET:", hexArray.slice(0, 35).join(' ')); 
    }
});