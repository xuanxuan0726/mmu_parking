# MMU Parking System

A dual-reader parking access system for MMU. Students tap either a **UHF RFID tag** or an **NFC card** at the gate; the system checks them in/out, updates the live available-space counter on the kiosk display, and logs every entry/exit in the admin dashboard.

Built as an FYP (Final Year Project).

## How it works

```
 ┌─────────────────┐    EPC over USB-HID    ┌────────────────────┐
 │ UHF RFID Reader │ ─────────────────────▶ │  reader.js (4000)  │
 │  VID 1A86 E010  │                        │  /last-scan /peek  │
 └─────────────────┘                        └─────────┬──────────┘
                                                      │
 ┌─────────────────┐    PC/SC via nfc-pcsc  ┌─────────┴──────────┐
 │ NFC Reader      │ ─────────────────────▶ │   nfc.js (4001)    │
 │ ACR122U (ACS)   │                        │  /last-scan /peek  │
 └─────────────────┘                        └─────────┬──────────┘
                                                      │ HTTP poll
                                                      ▼
 ┌─────────────────────────────┐         ┌────────────────────────┐
 │  PostgreSQL                 │ ◀────── │  server.js (3000)      │
 │  users + parking_logs       │         │  Express + EJS         │
 └─────────────────────────────┘         └────────┬───────────────┘
                                                  │ renders
                  ┌───────────────────────────────┼─────────────────────────────┐
                  ▼                                                             ▼
       ┌─────────────────────┐                                    ┌──────────────────────────┐
       │ / (kiosk)           │                                    │ /admin-dashboard         │
       │ big "Available 99"  │                                    │ register users + table   │
       │ polls both bridges  │                                    │ live-reloads on tap      │
       └─────────────────────┘                                    └──────────────────────────┘
```

Each card/tag's factory UID is the unique key that joins `parking_logs.card_uid` → `users.card_uid`. No data is written to the card/tag; we only read the UID. UHF tag UIDs are the 12-byte EPC; NFC card UIDs are the 4- or 7-byte standard UID read via the PC/SC `FF CA 00 00 00` APDU.

## Stack

- **Node.js** with Express 5
- **PostgreSQL** (pg client)
- **EJS** templates for kiosk + admin views
- **node-hid** — UHF reader over USB-HID
- **nfc-pcsc** — NFC reader over the Windows PC/SC stack
- Three processes:
  - `server.js` (web + DB) on port 3000
  - `reader.js` (UHF bridge) on port 4000
  - `nfc.js` (NFC bridge) on port 4001

The dashboard and kiosk poll **both** bridges in parallel, so either reader can drive a check-in/check-out independently.

## Setup

### 1. Database

Install PostgreSQL, create a database named `mmu_parking` in pgAdmin, then run the script in `mmu parking.session.sql` in the Query Tool. It drops/creates the `users` and `parking_logs` tables and seeds dummy data.

DB password is currently hard-coded in `server.js`. Change it to match your local Postgres setup before running.

### 2. Install dependencies

```bash
npm install
```

> `nfc-pcsc` and `node-hid` are native modules — they compile on install. You need **Visual Studio Build Tools** with the "Desktop development with C++" workload on Windows. If `node-hid` ever fails to load (e.g. `Failed to find binding for HID`) after another install reshuffled `node_modules`, run `npm rebuild node-hid` to recompile it.

### 3. Run

Open **three** terminals.

**Terminal 1** — web server:
```bash
npm start
```

**Terminal 2** — UHF (RFID) reader bridge:
```bash
npm run reader
```

**Terminal 3** — NFC reader bridge:
```bash
npm run nfc
```

Each bridge process needs its reader plugged in via USB. If a bridge can't find its device, check that no other reader software is holding the handle. You can run **either** bridge alone if only one reader is connected — the dashboard tolerates one being down.

### 4. Open the views

- **Kiosk display**: <http://localhost:3000/>
- **Admin dashboard**: <http://localhost:3000/admin-dashboard>

## Pages

### Kiosk (`/`)
Full-screen "Available Parking" counter. Green by default, yellow when <20% remain, red when full. Pops a "🚗 Vehicle entered" / "👋 Vehicle exited" toast on every change. Polls both bridges' `/last-scan` so any tap on either reader drives the gate.

### Admin Dashboard (`/admin-dashboard`)
- **Reader Status** badges show `RFID: Connected / Disconnected` and `NFC: Connected / Disconnected` independently.
- **Register User** button opens a modal: fill in MMU ID, name, plate; tap a new card/tag on either reader to auto-fill the UID; click **Save Data**. The modal uses each bridge's `/peek` endpoint (non-draining + timestamp-filtered) so a previous operator's tap can't bleed in.
- Live table of recent check-ins / check-outs, sorted newest first.
- Browser console logs every entry/exit with the source reader:
  ```
  🚗 Ali bin Abu check-in. Card/tag: Card (uid=4CB36203)
  👋 Ali bin Abu check-out. Card/tag: Tag (uid=E280116020...)
  ⚠️ Unregistered Card scanned (uid=3E4C6403)
  ```
  *Card* = NFC reader (ACR122U), *Tag* = UHF reader.
- Auto-reloads when `/api/parking-count` reports a DB change, so it stays in sync with the kiosk.

## API

### Server (`server.js`, port 3000)

| Method | Path | Purpose |
|---|---|---|
| GET  | `/` | Kiosk display |
| GET  | `/admin-dashboard` | Admin view (HTML) |
| GET  | `/api/entry?card=<UID>` | Toggle check-in/check-out for a card/tag (5 s server-side cooldown per UID) |
| GET  | `/api/parking-count` | `{ total, occupied, available }` for live polling |
| POST | `/api/register` | Insert new user `{ mmu_id, name, car_plate, card_uid }` |

### UHF bridge (`reader.js`, port 4000) and NFC bridge (`nfc.js`, port 4001)

Both bridges expose the same shape so the frontend can treat them uniformly:

| Method | Path | Purpose |
|---|---|---|
| GET | `/status` | `{ connected }` |
| GET | `/last-scan` | Last detected UID (auto-clears after read; freshness window 10 s) |
| GET | `/peek` | `{ uid, seenAt }` without draining — used by the registration modal |
| GET | `/scan` | Trigger a one-shot scan (UHF actively re-sends the EPC scan APDU; NFC just returns the freshest UID since it scans automatically on tap) |

## Configuration

- `TOTAL_SPACES` (in `server.js`) — total physical parking spaces. Default: 100.
- `ENTRY_COOLDOWN_MS` (in `server.js`) — cooldown per card/tag between consecutive taps. Default: 5000 ms.

## Hardware

### UHF RFID Reader
Generic UHF reader with VID `0x1A86` / PID `0xE010`. Power set to 7 dBm in `reader.js` for close-range reads (~5 cm) — adjust the `setRfPower07` command if a different range is needed. Tags tested: Alien Higgs-3 (UHF Gen2).

> Note: writing user data to the tag's USER memory was attempted but the reader firmware does not expose a working memory-read command over USB-HID, so writes can't be verified from this app. The system uses the tag's factory EPC as the unique lookup key, which works reliably.

### NFC Reader
ACS ACR122U over PC/SC (Windows ships the driver). `nfc.js` runs with `reader.autoProcessing = false` and queries the UID via the standard PC/SC "Get Data" APDU (`FF CA 00 00 00`). This is the fastest path — it avoids the `nfc-pcsc` library's NDEF read step, which adds 0.5–2 s of latency and throws *"Cannot process ISO 14443-4 tag because AID was not set"* on type-4 cards. Cards tested: MIFARE Classic 1K, NTAG215.
