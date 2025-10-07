// routes/auth.js
import express from 'express';
import jwt from 'jsonwebtoken';
import { pool } from '../db.js';
import { hashPassword, comparePassword } from '../utils/hash.js';

const router = express.Router();

function signToken(user) {
  const secret = process.env.JWT_SECRET || 'dev-secret';
  return jwt.sign(
    { id: user.id, email: user.email, name: user.name },
    secret,
    { expiresIn: '7d' }
  );
}

// Registro con logs paso a paso
router.post('/register', async (req, res) => {
  try {
    console.log('[REGISTER] body =', req.body);

    const { email, password, name } = req.body || {};
    if (!email || !password || !name) {
      console.log('[REGISTER] faltan campos');
      return res.status(400).json({ error: 'email, password y name son requeridos' });
    }

    const exists = await pool.query('SELECT 1 FROM users WHERE email=$1', [email]);
    console.log('[REGISTER] exists.rowCount =', exists.rowCount);

    if (exists.rowCount) {
      console.log('[REGISTER] email duplicado');
      return res.status(409).json({ error: 'Email ya registrado' });
    }

    const password_hash = await hashPassword(password);
    console.log('[REGISTER] hashed ok');

    const ins = await pool.query(
      'INSERT INTO users (email, password_hash, name) VALUES ($1,$2,$3) RETURNING id,email,name',
      [email, password_hash, name]
    );
    console.log('[REGISTER] insert ok');

    const user = ins.rows[0];
    const token = signToken(user);
    console.log('[REGISTER] token ok');

    return res.json({ token, user });
  } catch (e) {
    console.error('[REGISTER ERROR]', e);
    return res.status(500).json({ error: 'Error en registro' });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    console.log('[LOGIN] body =', req.body);
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'email y password son requeridos' });
    }

    const q = await pool.query('SELECT id,email,name,password_hash FROM users WHERE email=$1', [email]);
    if (!q.rowCount) return res.status(401).json({ error: 'Credenciales inválidas' });

    const u = q.rows[0];
    const ok = await comparePassword(password, u.password_hash);
    if (!ok) return res.status(401).json({ error: 'Credenciales inválidas' });

    const token = signToken(u);
    delete u.password_hash;
    return res.json({ token, user: u });
  } catch (e) {
    console.error('[LOGIN ERROR]', e);
    return res.status(500).json({ error: 'Error en login' });
  }
});

export default router;

