import express from "express";
import cors from "cors";
import HID from "node-hid";

const VENDOR_ID = 0x1a86;
const PRODUCT_ID = 0xe010;
const PORT = 4000;

// ----- Vendor protocol (extracted from UsbHidDemo.js) -----

const COMMANDS = {
  openUsbFeature: Buffer.from([0x00, 0xff, 0xc7, 0x83, 0xcc, 0x30, 0x00]),
  setRfPower07:   Buffer.from([0x00, 0x09, 0x53, 0x57, 0x00, 0x05, 0xff, 0x24, 0x05, 0x07, 0x22]),
  setActiveMode:  Buffer.from([0x00, 0x09, 0x53, 0x57, 0x00, 0x05, 0xff, 0x24, 0x02, 0x01, 0x2b]),
  setFreqUS:      Buffer.from([0x00, 0x09, 0x53, 0x57, 0x00, 0x05, 0xff, 0x3f, 0x31, 0x80, 0x62]),
  scanEpc:        Buffer.from([0x00, 0x09, 0x53, 0x57, 0x00, 0x05, 0xff, 0x24, 0x0a, 0x00, 0x24]),
};

// Per vendor UsbHidDemo.js: only frames with data[6]===0x45 are "active tag data".
// data[17]=tagType (0x01=EPC), data[18]=antenna, data[19..30]=EPC (12 bytes), data[31]=RSSI.
function parseTagPacket(data) {
  if (data[1] !== 0x43 || data[2] !== 0x54) return null;
  if (data[6] !== 0x45) return null;
  if (data.length < 31) return null;
  if (data[17] !== 0x01) return null;

  const parts = [];
  for (let i = 19; i <= 30; i++) {
    parts.push(data[i].toString(16).padStart(2, "0").toUpperCase());
  }
  const tagId = parts.join("");
  if (tagId === "000000000000000000000000") return null;
  return { tagId };
}

// ----- Device state -----

let device = null;
let connected = false;
let lastUid = null;
let lastSeenAt = 0;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function initReader() {
  console.log("Searching for MMU Parking Reader...");
  const devices = await HID.devicesAsync();
  const info = devices.find(
    (d) =>
      d.vendorId === VENDOR_ID &&
      d.productId === PRODUCT_ID &&
      !d.path.includes("kbd"),
  );

  if (!info) {
    throw new Error(
      "Reader not found. Check USB connection and close any other reader software.",
    );
  }

  console.log("Found device, opening...");
  device = await HID.HIDAsync.open(info.path);
  console.log("Reader USB connected.");

  try {
    await device.sendFeatureReport(COMMANDS.openUsbFeature);
  } catch (e) {
    console.log("Handshake warning (safe to ignore):", e.message);
  }

  await device.write(COMMANDS.setRfPower07);
  await sleep(200);
  await device.write(COMMANDS.setActiveMode);
  await sleep(200);
  await device.write(COMMANDS.setFreqUS);
  await sleep(200);
  await device.write(COMMANDS.scanEpc);
  await sleep(200);

  device.on("data", (data) => {
    const tag = parseTagPacket(data);
    if (tag) {
      const ts = Date.now();
      const dt = lastSeenAt ? ((ts - lastSeenAt) / 1000).toFixed(2) : "0.00";
      lastUid = tag.tagId;
      lastSeenAt = ts;
      console.log(`[${new Date(ts).toISOString()}] Tag detected: ${tag.tagId} (Δ ${dt}s since last)`);
    }
  });

  device.on("error", (err) => {
    console.error("USB error:", err.message);
    connected = false;
  });

  connected = true;
  console.log("Reader ready (Active Mode, EPC scan).");
}

// ----- HTTP API -----

const app = express();
app.use(cors());
app.use(express.json());

app.get("/status", (req, res) => {
  res.json({ connected });
});

app.get("/last-scan", (req, res) => {
  if (lastUid && Date.now() - lastSeenAt < 10_000) {
    const uid = lastUid;
    const age = ((Date.now() - lastSeenAt) / 1000).toFixed(2);
    lastUid = null;
    console.log(`[/last-scan] DRAIN uid=${uid} age=${age}s`);
    res.json({ uid });
  } else {
    res.json({ uid: "" });
  }
});

// Non-draining read for the registration modal. Returns seenAt so the
// client can ignore stale UIDs (e.g. from a previous operator's tap).
app.get("/peek", (req, res) => {
  if (lastUid && Date.now() - lastSeenAt < 10_000) {
    res.json({ uid: lastUid, seenAt: lastSeenAt });
  } else {
    res.json({ uid: "", seenAt: 0 });
  }
});

app.get("/scan", async (req, res) => {
  if (!connected || !device) return res.status(503).json({ error: "Reader not connected" });
  try {
    await device.write(COMMANDS.scanEpc);
    await sleep(600);
    res.json({ uid: lastUid || "" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Reader API listening on http://localhost:${PORT}`);
});

initReader().catch((err) => {
  console.error("Reader init failed:", err.message);
  connected = false;
});
