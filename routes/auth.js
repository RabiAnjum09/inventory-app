const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { pool } = require('../db');
const { sign, requireAuth, wrap, HttpError } = require('../middleware/auth');

// Module 1: Authentication & user management
router.post('/register', wrap(async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) throw new HttpError(400, 'Name, email and password are required');
  if (password.length < 6) throw new HttpError(400, 'Password must be at least 6 characters');
  const [exists] = await pool.query('SELECT id FROM users WHERE email=?', [email]);
  if (exists.length) throw new HttpError(409, 'Email already registered');
  const [[{ c }]] = await pool.query('SELECT COUNT(*) AS c FROM users');
  const role = c === 0 ? 'admin' : 'staff'; // first user becomes admin
  const hash = await bcrypt.hash(password, 10);
  const [r] = await pool.query('INSERT INTO users (name,email,password_hash,role) VALUES (?,?,?,?)', [name, email, hash, role]);
  const user = { id: r.insertId, name, role };
  res.status(201).json({ token: sign(user), user });
}));

router.post('/login', wrap(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) throw new HttpError(400, 'Email and password are required');
  const [rows] = await pool.query('SELECT * FROM users WHERE email=?', [email]);
  if (!rows.length || !(await bcrypt.compare(password, rows[0].password_hash)))
    throw new HttpError(401, 'Invalid email or password');
  const u = rows[0];
  res.json({ token: sign(u), user: { id: u.id, name: u.name, role: u.role } });
}));

router.get('/me', requireAuth, wrap(async (req, res) => {
  const [rows] = await pool.query('SELECT id,name,email,role,created_at FROM users WHERE id=?', [req.user.id]);
  if (!rows.length) throw new HttpError(404, 'User not found');
  res.json(rows[0]);
}));

router.get('/users', requireAuth, wrap(async (req, res) => {
  const [rows] = await pool.query('SELECT id,name,email,role,created_at FROM users ORDER BY id');
  res.json(rows);
}));

module.exports = router;
