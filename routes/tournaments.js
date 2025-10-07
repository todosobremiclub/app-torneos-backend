import express from 'express';
import { pool } from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

// Crear torneo con reglas por defecto (si no mandás scoring_rules explícitas)
router.post('/', requireAuth, async (req, res) => {
  const { id: ownerId } = req.user;
  const {
    name,
    location,
    visibility = 'private',
    format = 'round_robin',
    is_doubles = true,
    scoring_rules // opcional: { golden_point, tiebreak_type, ... }
  } = req.body;

  if (!name) return res.status(400).json({ error: 'name es requerido' });

  // Crear reglas (si mandaste objeto), o crear una default
  let scoringId = null;
  if (scoring_rules && typeof scoring_rules === 'object') {
    const s = scoring_rules;
    const insRules = await pool.query(
      `INSERT INTO scoring_rules
       (best_of_sets, golden_point, tiebreak_type, tiebreak_final_set,
        points_win, points_loss, points_walkover, points_retired,
        sets_diff_weight, games_diff_weight)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING id`,
      [
        s.best_of_sets ?? 3,
        !!s.golden_point,
        s.tiebreak_type ?? 'long7',
        s.tiebreak_final_set ?? 'allowed',
        s.points_win ?? 2,
        s.points_loss ?? 0,
        s.points_walkover ?? 0,
        s.points_retired ?? 0,
        s.sets_diff_weight ?? 1,
        s.games_diff_weight ?? 1
      ]
    );
    scoringId = insRules.rows[0].id;
  } else {
    const insDefault = await pool.query(
      `INSERT INTO scoring_rules (best_of_sets, golden_point, tiebreak_type, tiebreak_final_set,
        points_win, points_loss, points_walkover, points_retired, sets_diff_weight, games_diff_weight)
       VALUES (3,false,'long7','allowed',2,0,0,0,1,1)
       RETURNING id`
    );
    scoringId = insDefault.rows[0].id;
  }

  const insT = await pool.query(
    `INSERT INTO tournaments
     (owner_user_id, name, location, visibility, format, scoring_rules_id, is_doubles, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'draft')
     RETURNING *`,
    [ownerId, name, location || null, visibility, format, scoringId, is_doubles]
  );

  res.status(201).json(insT.rows[0]);
});

// Mis torneos (donde soy owner)
router.get('/mine', requireAuth, async (req, res) => {
  const { id: ownerId } = req.user;
  const q = await pool.query(
    `SELECT t.*, sr.golden_point, sr.tiebreak_type
     FROM tournaments t
     JOIN scoring_rules sr ON sr.id = t.scoring_rules_id
     WHERE t.owner_user_id=$1
     ORDER BY t.created_at DESC`,
    [ownerId]
  );
  res.json(q.rows);
});

// Detalle de un torneo
router.get('/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const q = await pool.query(
    `SELECT t.*, sr.*
     FROM tournaments t
     JOIN scoring_rules sr ON sr.id = t.scoring_rules_id
     WHERE t.id=$1`,
    [id]
  );
  if (!q.rowCount) return res.status(404).json({ error: 'Torneo no encontrado' });
  res.json(q.rows[0]);
});

export default router;
