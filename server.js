// server.js - MMU Parking System Backend
import express from "express"; // The web server framework
import pg from "pg"; // The PostgreSQL driver
import cors from "cors"; // Allows the frontend to talk to the backend
import dotenv from "dotenv";

const app = express();
const port = 3000;
dotenv.config();

// --- 1. MIDDLEWARE ---
app.use(cors()); // allow EJS pages to call port 4000/4001
app.use(express.static("public")); // Serve the HTML dashboard from the 'public' folder
app.use(express.json()); // Parses JSON request bodies

// --- 2. DATABASE CONNECTION ---
// This configures the link to your PostgreSQL database
// const db = new Pool({
//   user: 'postgres',       // Default PostgreSQL username
//   host: 'localhost',      // Database is on this computer
//   database: 'mmu_parking',// Your database name
//   password: 'xuan1234',       // <--- CHANGE THIS to your actual password (e.g., 'xuan1234')
//   port: 5432,             // Default PostgreSQL port
// });

const db = new pg.Client({
  user: 'postgres',
  host: '127.0.0.1',       // Using the direct IP to avoid Windows translation errors
  database: 'mmu_parking', // Make sure this matches pgAdmin exactly
  password: 'xuan123',    // Your pgAdmin password
  port: 5432,
});

db.connect((err) => {
  if (err) {
    console.error('❌ Database connection failed:', err.stack);
  } else {
    console.log('✅ Connected to PostgreSQL successfully!');
  }
});

// Total physical parking spaces in the MMU lot.
const TOTAL_SPACES = 100;

// Per-card cooldown so a tag left on the reader doesn't toggle entry/exit
// every second. JS-side debounce can't be trusted because pages reload.
const recentEntries = new Map(); // card_uid -> last-processed timestamp (ms)
const ENTRY_COOLDOWN_MS = 5000;

// --- 3. API ROUTE: HANDLE CARD SCANS ---
// This is triggered when the Hardware Reader scans a card
app.get("/api/entry", async (req, res) => {
  const card_uid = req.query.card; // Get card ID from URL (sent by reader.js)

  if (!card_uid) return res.status(400).send("No card ID provided");

  const lastAt = recentEntries.get(card_uid);
  if (lastAt && Date.now() - lastAt < ENTRY_COOLDOWN_MS) {
    return res.send("Cooldown — please lift the tag before tapping again");
  }
  recentEntries.set(card_uid, Date.now());

  try {
    // A. Check if the user is registered
    const userCheck = await db.query(
      "SELECT * FROM users WHERE card_uid = $1",
      [card_uid],
    );

    if (userCheck.rows.length === 0) {
      console.log(`⚠️ Unregistered Card: ${card_uid}`);
      return res.send("Unregistered Card");
    }

    const user = userCheck.rows[0];

    // B. Check if they are currently Parked (Check-In vs Check-Out)
    // We look for a log entry that has NO check_out time yet
    const activeSession = await db.query(
      "SELECT * FROM parking_logs WHERE card_uid = $1 AND check_out IS NULL",
      [card_uid],
    );

    if (activeSession.rows.length > 0) {
      // --- CASE 1: CHECK OUT (Exit) ---
      await db.query(
        "UPDATE parking_logs SET check_out = CURRENT_TIMESTAMP WHERE id = $1",
        [activeSession.rows[0].id],
      );
      console.log(`👋 EXIT: ${user.name}`);
      res.send(`Goodbye ${user.name}`);
    } else {
      // --- CASE 2: CHECK IN (Entry) ---
      await db.query(
        "INSERT INTO parking_logs (card_uid, mmu_id) VALUES ($1, $2)",
        [card_uid, user.mmu_id],
      );
      console.log(`🚗 ENTRY: ${user.name}`);
      res.send(`Welcome ${user.name}`);
    }
  } catch (err) {
    console.error("Database Error:", err);
    res.status(500).send("Server Error");
  }
});

app.get("/admin-dashboard", async (req, res) => {
  try {
    const query = `
      SELECT users.name, users.mmu_id, users.car_plate, parking_logs.check_in, parking_logs.check_out
      FROM parking_logs JOIN users
      ON parking_logs.mmu_id = users.mmu_id
      ORDER BY parking_logs.check_in DESC LIMIT 10
    `;
    const logs = await db.query(query);
    const countResult = await db.query(
      "SELECT COUNT(*) FROM parking_logs WHERE check_out IS NULL",
    );
    const occupied = parseInt(countResult.rows[0].count, 10);
    res.render("adminDashboard.ejs", {
      logs: logs.rows,
      occupiedAtRender: occupied,
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("Database Error");
  }
});

app.get("/", async (req, res) => {
  try {
    const result = await db.query(
      "SELECT COUNT(*) FROM parking_logs WHERE check_out IS NULL",
    );
    const occupied = parseInt(result.rows[0].count, 10);
    res.render("index.ejs", {
      total: TOTAL_SPACES,
      available: TOTAL_SPACES - occupied,
    });
  } catch (err) {
    console.error("Index render error:", err);
    res.status(500).send("Database Error");
  }
});

app.get("/api/parking-count", async (req, res) => {
  try {
    const result = await db.query(
      "SELECT COUNT(*) FROM parking_logs WHERE check_out IS NULL",
    );
    const occupied = parseInt(result.rows[0].count, 10);
    res.json({
      total: TOTAL_SPACES,
      occupied,
      available: TOTAL_SPACES - occupied,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/register", async (req, res) => {
  const { mmu_id, name, car_plate, card_uid } = req.body;

  try {
    // Save to PostgreSQL
    const query = `
      INSERT INTO users (mmu_id, name, car_plate, card_uid)
      VALUES ($1, $2, $3, $4)
    `;
    await db.query(query, [mmu_id, name, car_plate, card_uid]);
    console.log(`✅ Registered new user: ${name}`);
    res.send("Success");
  } catch (err) {
    console.error("Registration Error:", err);
    res.status(500).send("Database Error: " + err.detail);
  }
});

// --- 5. START SERVER ---
app.listen(port, () => {
  console.log(`🅿️ MMU Parking System running at http://localhost:${port}`);
});

