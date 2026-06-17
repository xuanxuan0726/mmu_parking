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
  // We only need the UID. autoProcessing=true makes the library try to read
  // NDEF after detection, which delays the card event ~500ms-2s and throws
  // "Cannot process ISO 14443-4 tag because AID was not set" on type-4 cards.
  // With autoProcessing=false the card event has no .uid, so we query it
  // ourselves via the standard PC/SC "Get UID" APDU (FF CA 00 00 00).
  reader.autoProcessing = false;

  const GET_UID_APDU = Buffer.from([0xFF, 0xCA, 0x00, 0x00, 0x00]);

  reader.on("card", async (card) => {
    try {
      const resp = await reader.transmit(GET_UID_APDU, 12);
      // Response is <UID bytes><SW1><SW2>; success = SW1SW2 == 9000.
      if (resp.length < 2) return;
      const sw = resp.readUInt16BE(resp.length - 2);
      if (sw !== 0x9000) {
        console.error(`NFC Get-UID failed, SW=${sw.toString(16)}`);
        return;
      }
      const uid = resp.slice(0, resp.length - 2).toString("hex").toUpperCase();
      if (!uid) return;
      const ts = Date.now();
      const dt = lastSeenAt ? ((ts - lastSeenAt) / 1000).toFixed(2) : "0.00";
      lastUid = uid;
      lastSeenAt = ts;
      console.log(`[${new Date(ts).toISOString()}] NFC card detected: ${uid} (Δ ${dt}s since last)`);
    } catch (err) {
      console.error(`NFC Get-UID error: ${err.message}`);
    }
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
