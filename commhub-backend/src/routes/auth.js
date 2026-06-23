require('dotenv').config();
const router  = require('express').Router();
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const db      = require('../db');
const { authenticateToken } = require('../middleware/auth');

const COLORS = ['bg-teal-500','bg-indigo-500','bg-rose-500','bg-amber-500','bg-emerald-500','bg-violet-500','bg-cyan-600','bg-orange-500'];
const colorFor = (s) => COLORS[[...s].reduce((a,c)=>a+c.charCodeAt(0),0)%COLORS.length];
const initialsFor = (n) => n.trim().split(/\s+/).map(w=>w[0]).slice(0,2).join('').toUpperCase();

function makeToken(user) {
  return jwt.sign({ id: user.id, email: user.email, name: user.name }, process.env.JWT_SECRET, { expiresIn: '30d' });
}

router.post('/signup', async (req, res) => {
  const { name, email, password } = req.body;
  if (!name?.trim() || !email?.trim() || !password) return res.status(400).json({ error: 'name, email and password are required' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
  try {
    const exists = await db.query('SELECT id FROM users WHERE email=$1', [email.toLowerCase()]);
    if (exists.rows.length) return res.status(409).json({ error: 'Email already registered' });
    const password_hash = await bcrypt.hash(password, 12);
    const { rows } = await db.query(
      `INSERT INTO users (name,email,password_hash,color,initials,presence,title) VALUES ($1,$2,$3,$4,$5,'online','') RETURNING id,name,email,color,initials,presence,title`,
      [name.trim(), email.toLowerCase(), password_hash, colorFor(email), initialsFor(name)]
    );
    const user = rows[0];
    const chans = await db.query(`SELECT id FROM channels WHERE type='public'`);
    for (const ch of chans.rows) await db.query(`INSERT INTO channel_members(channel_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING`,[ch.id,user.id]);
    res.status(201).json({ token: makeToken(user), user });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  try {
    const { rows } = await db.query(`SELECT id,name,email,password_hash,color,initials,presence,title FROM users WHERE email=$1`,[email.toLowerCase()]);
    if (!rows.length) return res.status(401).json({ error: 'No account with that email' });
    const user = rows[0];
    if (!await bcrypt.compare(password, user.password_hash)) return res.status(401).json({ error: 'Incorrect password' });
    await db.query(`UPDATE users SET presence='online' WHERE id=$1`,[user.id]);
    user.presence='online'; delete user.password_hash;
    res.json({ token: makeToken(user), user });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

router.get('/me', authenticateToken, async (req, res) => {
  try {
    const { rows } = await db.query(`SELECT id,name,email,color,initials,presence,title FROM users WHERE id=$1`,[req.user.id]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

module.exports = router;
