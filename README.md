# MMU Parking System

A UHF-RFID parking access system for MMU. Students tap a registered RFID tag at the gate; the system checks them in/out, updates the live available-space counter on the kiosk display, and logs every entry/exit in the admin dashboard.

Built as an FYP (Final Year Project).

## How it works

```
 ┌─────────────────┐    EPC over USB-HID    ┌────────────────────┐
 │ UHF RFID Reader │ ─────────────────────▶ │  reader.js (4000)  │
 │  VID 1A86 E010  │                        │  exposes /last-scan│
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
       │ polls every 1.5s    │                                    │ live-reloads on tap      │
       └─────────────────────┘                                    └──────────────────────────┘
```

Each tag's factory EPC is the unique key that joins `parking_logs.card_uid` → `users.card_uid`. No data is written to the tag; we only read its EPC.

## Stack

- **Node.js** with Express 5
- **PostgreSQL** (pg client)
- **EJS** templates for kiosk + admin views
- **node-hid** to talk to the UHF reader over USB-HID
- Two processes: `server.js` (web + DB) on port 3000, `reader.js` (USB reader bridge) on port 4000

## Setup

### 1. Database

Install PostgreSQL, create a database named `mmu_parking` in pgAdmin, then run the script in `mmu parking.session.sql` in the Query Tool. It drops/creates the `users` and `parking_logs` tables and seeds dummy data.

DB password is currently hard-coded in `server.js` (`****`). Change it to match your local Postgres setup before running.

### 2. Install dependencies

```bash
npm install
```

### 3. Run

Open two terminals.

**Terminal 1** — start the web server:
```bash
npm start
```

**Terminal 2** — start the USB reader bridge:
```bash
npm run reader
```

The reader process needs the UHF reader plugged in via USB. If it can't find the device, check that no other reader software is holding the handle.

### 4. Open the views

- **Kiosk display**: <http://localhost:3000/>
- **Admin dashboard**: <http://localhost:3000/admin-dashboard>

## Pages

### Kiosk (`/`)
Full-screen "Available Parking" counter. Green by default, yellow when <20% remain, red when full. Pops a "🚗 Vehicle entered" / "👋 Vehicle exited" toast on every change. Also runs the tap-poller so it can drive the gate even when the admin page isn't open.

### Admin Dashboard (`/admin-dashboard`)
- **Register User** button opens a modal: fill in MMU ID, name, plate; tap a new card on the reader to auto-fill the UID; click **Save Data**.
- Live table of recent check-ins / check-outs, sorted newest first.
- Auto-reloads when `/api/parking-count` reports a DB change, so it stays in sync with the kiosk.

## API

| Method | Path | Purpose |
|---|---|---|
| GET  | `/` | Kiosk display |
| GET  | `/admin-dashboard` | Admin view (HTML) |
| GET  | `/api/entry?card=<EPC>` | Toggle check-in/check-out for a card (5s server-side cooldown per card) |
| GET  | `/api/parking-count` | `{ total, occupied, available }` for live polling |
| POST | `/api/register` | Insert new user `{ mmu_id, name, car_plate, card_uid }` |

The reader bridge (`reader.js`) exposes on port 4000:

| Method | Path | Purpose |
|---|---|---|
| GET | `/status` | `{ connected }` |
| GET | `/last-scan` | Last detected tag UID (auto-clears after read) |
| GET | `/scan` | Trigger a one-shot EPC scan |

## Configuration

- `TOTAL_SPACES` (in `server.js`) — total physical parking spaces. Default: 100.
- `ENTRY_COOLDOWN_MS` (in `server.js`) — cooldown per card between consecutive taps. Default: 5000 ms.

## Hardware

UHF reader with VID `0x1A86` / PID `0xE010`. Power set to 7 dBm in `reader.js` for close-range reads (~5 cm) — adjust the `setRfPower07` command if a different range is needed. Tags tested: Alien Higgs-3 (UHF Gen2).

> Note: writing user data to the tag's USER memory was attempted but the reader firmware does not expose a working memory-read command over USB-HID, so writes can't be verified from this app. The system instead uses the tag's factory EPC as the unique lookup key, which works reliably.
