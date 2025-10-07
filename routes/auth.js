import express from 'express';
import jwt from 'jsonwebtoken';
import { pool } from '../db.js';
import { hashPassword, comparePassword } from '../utils/hash.js';

const router = express.Router();

function signToken(user) {
  const payload = { id: user.id, email: user.email, name: user.name };
  const secret = process.env.JWT_SECRET || 'dev-secret';
  return jwt.sign(payload, secret, { expiresIn: '7d' });
}

// Registro
router.post('/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;
    if (!email || !password || !name) {
      return res.status(400).json({ error: 'email, password y name son requeridos' });
    }
    const exists = await pool.query('SELECT 1 FROM users WHERE email=$1', [email]);
    if (exists.rowCount) return res.status(409).json({ error: 'Email ya registrado' });

    const password_hash = await hashPassword(password);
    const ins = await pool.query(
      'INSERT INTO users (email, password_hash, name) VALUES ($1,$2,$3) RETURNING id,email,name',
      [email, password_hash, name]
    );
    const user = ins.rows[0];
    const token = signToken(user);
    return res.json({ token, user });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error en registro' });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const q = await pool.query('SELECT id,email,name,password_hash FROM users WHERE email=$1', [email]);
    if (!q.rowCount) return res.status(401).json({ error: 'Credenciales inválidas' });

    const user = q.rows[0];
    const ok = await comparePassword(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Credenciales inválidas' });

    const token = signToken(user);
    // No devolvemos password_hash
    delete user.password_hash;
    res.json({ token, user });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error en login' });
  }
});

export default router;
