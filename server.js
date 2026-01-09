// server.js - MMU Parking System Backend
import express from 'express';  // The web server framework
import pg from 'pg';      // The PostgreSQL driver
import cors from 'cors';        // Allows the frontend to talk to the backend

const app = express();
const port = 3000;

// --- 1. MIDDLEWARE ---
app.use(cors());                     // Enable security clearance for frontend
app.use(express.static('public'));   // Serve the HTML dashboard from the 'public' folder

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
  user: 'postgres',       // Default PostgreSQL username
  host: 'localhost',      // Database is on this computer
  database: 'mmu_parking',// Your database name
  password: 'xuan1234',       // <--- CHANGE THIS to your actual password (e.g., 'xuan1234')
  port: 5432,             // Default PostgreSQL port
});

db.connect()

// --- 3. API ROUTE: HANDLE CARD SCANS ---
// This is triggered when the Hardware Reader scans a card
app.get('/api/entry', async (req, res) => {
  const card_uid = req.query.card; // Get card ID from URL (sent by reader.js)
  
  if (!card_uid) return res.status(400).send("No card ID provided");

  try {
    // A. Check if the user is registered
    const userCheck = await db.query('SELECT * FROM users WHERE card_uid = $1', [card_uid]);
    
    if (userCheck.rows.length === 0) {
      console.log(`⚠️ Unregistered Card: ${card_uid}`);
      return res.send("Unregistered Card");
    }

    const user = userCheck.rows[0];

    // B. Check if they are currently Parked (Check-In vs Check-Out)
    // We look for a log entry that has NO check_out time yet
    const activeSession = await db.query(
      'SELECT * FROM parking_logs WHERE card_uid = $1 AND check_out IS NULL',
      [card_uid]
    );

    if (activeSession.rows.length > 0) {
      // --- CASE 1: CHECK OUT (Exit) ---
      await pool.query(
        'UPDATE parking_logs SET check_out = CURRENT_TIMESTAMP WHERE id = $1',
        [activeSession.rows[0].id]
      );
      console.log(`👋 EXIT: ${user.name}`);
      res.send(`Goodbye ${user.name}`);

    } else {
      // --- CASE 2: CHECK IN (Entry) ---
      await db.query('INSERT INTO parking_logs (card_uid) VALUES ($1)', [card_uid]);
      console.log(`🚗 ENTRY: ${user.name}`);
      res.send(`Welcome ${user.name}`);
    }

  } catch (err) {
    console.error("Database Error:", err);
    res.status(500).send("Server Error");
  }
});

app.get('/admin-dashboard', async(req, res) => {
  try {
    const query = `
      SELECT users.name, users.mmu_id, users.car_plate, parking_logs.check_in, parking_logs.check_out
      FROM parking_logs JOIN users 
      ON parking_logs.mmu_id = users.mmu_id
      ORDER BY parking_logs.check_in DESC LIMIT 10
    `;
    const logs = await db.query(query);
    res.render('index.ejs', {
      logs: logs.rows
    })
  } catch (err) {
    console.error(err);
    res.status(500).send("Database Error");
  }
})

// --- 5. START SERVER ---
app.listen(port, () => {
  console.log(`🅿️ MMU Parking System running at http://localhost:${port}`);
});