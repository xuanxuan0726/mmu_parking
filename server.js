// server.js - Express Backend
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');

const app = express();
const port = 3000; // Your website will be at http://localhost:3000

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public')); // Serve the HTML file

// Database Connection
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'mmu_parking',
  password: 'root', // <--- PUT YOUR POSTGRES PASSWORD HERE
  port: 5432,
});

// Route 1: Receive Scan (The "Insert" API)
app.get('/api/insert', async (req, res) => {
  const card_uid = req.query.card;
  if (!card_uid) return res.status(400).send("No card provided");

  try {
    await pool.query('INSERT INTO scans (card_uid) VALUES ($1)', [card_uid]);
    console.log(`✅ Saved: ${card_uid}`);
    res.send("Success");
  } catch (err) {
    console.error(err);
    res.status(500).send("Database Error");
  }
});

// Route 2: Get History (For Dashboard)
app.get('/api/history', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM scans ORDER BY id DESC LIMIT 10');
    res.json(result.rows);
  } catch (err) {
    res.status(500).send("Database Error");
  }
});

// Start Server
app.listen(port, () => {
  console.log(`🚀 Server running at http://localhost:${port}`);
});