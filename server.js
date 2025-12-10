// server.js - MMU Parking System Backend
const express = require('express');  // The web server framework
const { Pool } = require('pg');      // The PostgreSQL driver
const cors = require('cors');        // Allows the frontend to talk to the backend
const app = express();
const port = 3000;                   // The port number (localhost:3000)

// --- 1. MIDDLEWARE ---
app.use(cors());                     // Enable security clearance for frontend
app.use(express.static('public'));   // Serve the HTML dashboard from the 'public' folder

// --- 2. DATABASE CONNECTION ---
// This configures the link to your PostgreSQL database
const db = new Pool({
  user: 'postgres',       // Default PostgreSQL username
  host: 'localhost',      // Database is on this computer
  database: 'mmu_parking',// Your database name
  password: 'xuan1234',       // <--- CHANGE THIS to your actual password (e.g., 'xuan1234')
  port: 5432,             // Default PostgreSQL port
});

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

// --- 4. API ROUTE: FETCH HISTORY ---
// This is used by the Dashboard (index.html) to show the list
app.get('/api/history', async (req, res) => {
  try {
    // Join 'parking_logs' with 'users' to show Names instead of just Card IDs
    const query = `
      SELECT parking_logs.id, users.name, users.matrix_id, users.car_plate, 
             parking_logs.check_in, parking_logs.check_out
      FROM parking_logs
      JOIN users ON parking_logs.card_uid = users.card_uid
      ORDER BY parking_logs.id DESC LIMIT 10
    `;
    const result = await db.query(query);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).send("Database Error");
  }
});

app.get('/', async(req, res) => {

  const response = await db.query('SELECT * FROM users');

  console.log(response.rows)

  res.render('index.ejs', {
    response: response.rows[1].name
  })
})

// --- 5. START SERVER ---
app.listen(port, () => {
  console.log(`🅿️  MMU Parking System running at http://localhost:${port}`);
});