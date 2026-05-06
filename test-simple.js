import HID from 'node-hid';

console.log("🔍 Starting Simple Reader Test...");

const allDevices = HID.devices().filter(d => d.vendorId === 0x1a86 && d.productId === 0xe010);
let deviceInfo = allDevices.find(d => d.usagePage === 0xFF00 || d.usagePage === 65280) || allDevices.find(d => !d.path.includes('kbd') && d.usage !== 6); 

const device = new HID.HID(deviceInfo.path);

async function boot() {
    try { device.sendFeatureReport(Buffer.from([0x00,0xFF, 0xC7, 0x83, 0xCC, 0x30, 0x00])); } catch(e){}
    await new Promise(r => setTimeout(r, 200));
    device.write(Buffer.from([0x00, 0x09, 0x53, 0x57, 0x00, 0x05, 0xFF, 0x24, 0x05, 0x1A, 0x0F])); // Max Power
    await new Promise(r => setTimeout(r, 200));
    device.write(Buffer.from([0x00, 0x09, 0x53, 0x57, 0x00, 0x05, 0xFF, 0x3F, 0x31, 0x80, 0x62])); // US Band
    await new Promise(r => setTimeout(r, 200));
    device.write(Buffer.from([0x00, 0x09, 0x53, 0x57, 0x00, 0x05, 0xFF, 0x24, 0x02, 0x00, 0x2C])); // Answer Mode
    console.log("✅ Hardware Ready. Scan a tag!");
}
boot();

setInterval(() => {
    try { device.write(Buffer.from([0x00, 0x09, 0x53, 0x57, 0x00, 0x05, 0xFF, 0x24, 0x0A, 0x00, 0x24])); } catch(e){}
}, 1000);

device.on('data', function(data) {
    let hexStr = Array.from(data).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
    
    // ONLY print if the Alien Tag signature (E2 80) is anywhere inside the buffer
    if (hexStr.includes('E2 80')) {
        console.log("\n💥 BEEP TRIGGERED! RAW BUFFER:");
        console.log(hexStr);
    }
});