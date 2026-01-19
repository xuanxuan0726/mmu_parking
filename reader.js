// reader.js - MMU Parking Hardware Bridge (ES Module Version)
import HID from 'node-hid';
import axios from 'axios';

// --- CONFIGURATION ---
const VENDOR_ID = 0x1a86; 
const PRODUCT_ID = 0xe010; 
const SERVER_URL = 'http://localhost:3000/api/entry';

console.log("🔍 Searching for MMU Parking Reader...");

// 1. Find the Device
const devices = HID.devices();
const deviceInfo = devices.find( d => 
    d.vendorId === VENDOR_ID && 
    d.productId === PRODUCT_ID && 
    !d.path.includes('kbd')
);

if (!deviceInfo) {
    console.error("❌ Reader not found. Please check USB connection.");
    process.exit(1);
}

// 2. Connect to Device
const device = new HID.HID(deviceInfo.path);
console.log("✅ Reader Connected!");

// 3. Initialize & Wake Up
try {
    // Wake up
    device.sendFeatureReport([0x00,0xFF, 0xC7, 0x83, 0xCC, 0x30, 0x00]);
    
    // Set Active Mode (Auto Scan)
    device.write([0x00, 0x09, 0x53, 0x57, 0x00, 0x05, 0xFF, 0x24, 0x02, 0x01, 0x2B]); 
    console.log("⚡ Mode set to: Active Scan");

} catch (e) {
    console.log("⚠️ Initialization warning:", e.message);
}

// 4. Listen for Scans
let lastScanTime = 0;
const SCAN_DELAY = 2000; // 2 seconds delay

device.on('data', function(data) {
    // SDK Header Check: 0x43, 0x54, 0x45 means valid tag data
    if(data[1] === 0x43 && data[2] === 0x54 && data[6] === 0x45) {
        
        // Extract Card UID (Bytes 19 to 30)
        let tagId = "";
        for (let i = 19; i <= 30; i++) {
            let hex = data[i].toString(16).toUpperCase();
            if (hex.length < 2) hex = "0" + hex;
            tagId += hex;
        }

        const now = Date.now();
        if (now - lastScanTime > SCAN_DELAY) {
            console.log(`🔔 Card Detected: ${tagId}`);
            lastScanTime = now;
            
            // Send to Server
            axios.get(`${SERVER_URL}?card=${tagId}`)
                .then(response => {
                    console.log(`   -> Server Response: ${response.data}`);
                })
                .catch(error => {
                    console.error(`   -> ❌ Upload Failed: ${error.message}`);
                });
        }
    }
});

// Keep script alive
setInterval(() => {}, 1000);