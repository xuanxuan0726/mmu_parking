var HID = require('node-hid');
var axios = require('axios');

const VENDOR_ID = 0x1a86; 
const PRODUCT_ID = 0xe010; 
const SERVER_URL = 'http://localhost:3000/api/entry'; // Points to the new Entry API

console.log("🔎 Searching for MMU Parking Reader...");

var devices = HID.devices();
var deviceInfo = devices.find( d => d.vendorId === VENDOR_ID && d.productId === PRODUCT_ID && !d.path.includes('kbd'));

if (!deviceInfo) {
    console.log("❌ Reader not found.");
    process.exit(1);
}

var device = new HID.HID(deviceInfo.path);
console.log("✅ Reader Connected. Ready to scan cars.");

// Wake up the device
try { device.sendFeatureReport([0x00,0xFF, 0xC7, 0x83, 0xCC, 0x30, 0x00]); } catch (e) {}

device.on('data', function(data) {
    if(data[1] === 0x43 && data[2] === 0x54 && data[6] === 0x45) {
        var tagId = "";
        for (var i = 19; i <= 30; i++) {
            var hex = data[i].toString(16).toUpperCase();
            if (hex.length < 2) hex = "0" + hex;
            tagId += hex;
        }

        console.log("🔔 Card Scanned: " + tagId);
        axios.get(`${SERVER_URL}?card=${tagId}`)
             .then(() => console.log("   -> Access Granted"))
             .catch(() => console.log("   -> Server Error"));
    }
});
setInterval(() => {}, 1000);