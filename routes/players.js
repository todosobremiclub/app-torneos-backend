// routes/players.js
import express from 'express';
import { pool } from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

// Listar jugadores de MI agenda
router.get('/', requireAuth, async (req, res) => {
  const { id: userId } = req.user;
  const q = await pool.query(
    `SELECT id, display_name, email, rating, avatar_url, created_at
     FROM players
     WHERE owner_user_id = $1
     ORDER BY display_name`,
    [userId]
  );
  res.json(q.rows);
});

// Crear jugador en MI agenda
router.post('/', requireAuth, async (req, res) => {
  const { id: userId } = req.user;
  const { display_name, email } = req.body;
  if (!display_name) return res.status(400).json({ error: 'display_name es requerido' });

  const ins = await pool.query(
    `INSERT INTO players (owner_user_id, display_name, email)
     VALUES ($1,$2,$3)
     RETURNING id, display_name, email, rating, avatar_url, created_at`,
    [userId, display_name, email || null]
  );
  res.status(201).json(ins.rows[0]);
});

export default router;

