const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

// DB Connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

app.use(cors({
  origin: ['https://hammond212.github.io', 'http://localhost:3000'],
  credentials: true
}));
app.use(express.json());

// ─── Auth Middleware ───────────────────────────────────────────────
function authAdmin(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });
  try {
    req.admin = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

// ─── Setup DB ─────────────────────────────────────────────────────
app.get('/setup', async (req, res) => {
  // One-time setup — remove after first run
  const secret = req.query.secret;
  if (secret !== process.env.SETUP_SECRET) return res.status(403).json({ error: 'Forbidden' });

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        university VARCHAR(255),
        phone VARCHAR(50),
        password_hash VARCHAR(255),
        verified BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS listings (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        title VARCHAR(255),
        category VARCHAR(100),
        price NUMERIC(10,2),
        description TEXT,
        active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    res.json({ message: 'Tables created!' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Admin Login ──────────────────────────────────────────────────
app.post('/admin/login', async (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: 'Password required' });

  const isValid = await bcrypt.compare(password, process.env.ADMIN_PASSWORD_HASH);
  if (!isValid) return res.status(401).json({ error: 'Wrong password' });

  const token = jwt.sign({ role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '8h' });
  res.json({ token });
});

// ─── Users ────────────────────────────────────────────────────────
app.get('/admin/users', authAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT u.id, u.name, u.email, u.university, u.phone, u.verified, u.created_at,
             COUNT(l.id) as listing_count
      FROM users u
      LEFT JOIN listings l ON l.user_id = u.id
      GROUP BY u.id
      ORDER BY u.created_at DESC
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/admin/users/:id/verify', authAdmin, async (req, res) => {
  const { verified } = req.body;
  try {
    const { rows } = await pool.query(
      'UPDATE users SET verified = $1 WHERE id = $2 RETURNING *',
      [verified, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'User not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/admin/users/:id', authAdmin, async (req, res) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM users WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'User not found' });
    res.json({ message: 'User deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Listings ─────────────────────────────────────────────────────
app.get('/admin/listings', authAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT l.*, u.name as user_name, u.email as user_email
      FROM listings l
      JOIN users u ON u.id = l.user_id
      ORDER BY l.created_at DESC
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/admin/listings/:id', authAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM listings WHERE id = $1', [req.params.id]);
    res.json({ message: 'Listing deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Stats ────────────────────────────────────────────────────────
app.get('/admin/stats', authAdmin, async (req, res) => {
  try {
    const [users, listings, verified] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM users'),
      pool.query('SELECT COUNT(*) FROM listings'),
      pool.query('SELECT COUNT(*) FROM users WHERE verified = TRUE')
    ]);
    res.json({
      totalUsers: parseInt(users.rows[0].count),
      totalListings: parseInt(listings.rows[0].count),
      verifiedUsers: parseInt(verified.rows[0].count)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Public: Register User ────────────────────────────────────────
app.post('/register', async (req, res) => {
  const { name, email, university, phone, password } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'Missing fields' });
  try {
    const hash = await bcrypt.hash(password, 10);
    const { rows } = await pool.query(
      'INSERT INTO users (name, email, university, phone, password_hash) VALUES ($1,$2,$3,$4,$5) RETURNING id, name, email, verified',
      [name, email, university, phone, hash]
    );
    res.json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Email already registered' });
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => console.log(`Uniplace backend running on port ${PORT}`));
