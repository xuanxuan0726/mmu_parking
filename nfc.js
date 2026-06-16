import express from "express";
import cors from "cors";
import pkg from "nfc-pcsc";
const { NFC } = pkg;

const PORT = 4001;

// ----- Device state -----

let connected = false;
let lastUid = null;
let lastSeenAt = 0;

// ----- NFC service -----

const nfc = new NFC();

nfc.on("reader", (reader) => {
  console.log(`NFC reader attached: ${reader.name}`);
  connected = true;
  reader.autoProcessing = true;

  reader.on("card", (card) => {
    const uid = (card.uid || "").toUpperCase();
    if (!uid) return;
    const ts = Date.now();
    const dt = lastSeenAt ? ((ts - lastSeenAt) / 1000).toFixed(2) : "0.00";
    lastUid = uid;
    lastSeenAt = ts;
    console.log(`[${new Date(ts).toISOString()}] NFC card detected: ${uid} (Δ ${dt}s since last)`);
  });

  reader.on("error", (err) => {
    console.error(`NFC reader error: ${err.message}`);
  });

  reader.on("end", () => {
    console.log(`NFC reader detached: ${reader.name}`);
    connected = false;
  });
});

nfc.on("error", (err) => {
  console.error(`NFC service error: ${err.message}`);
  connected = false;
});

// ----- HTTP API (mirrors reader.js shape) -----

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

// NFC scans automatically on tap; manual scan just returns whatever's fresh.
app.get("/scan", (req, res) => {
  if (!connected) return res.status(503).json({ error: "NFC reader not connected" });
  res.json({ uid: lastUid || "" });
});

app.listen(PORT, () => {
  console.log(`NFC bridge listening on http://localhost:${PORT}`);
});
