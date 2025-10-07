// routes/tournaments.js
import express from 'express';
import { pool } from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

/**
 * Crear torneo (si no enviás scoring_rules, crea unas por defecto)
 */
router.post('/', requireAuth, async (req, res) => {
  try {
    const { id: ownerId } = req.user;
    const {
      name,
      location,
      visibility = 'private',
      format = 'round_robin',
      is_doubles = true,
      scoring_rules // opcional: { best_of_sets, golden_point, tiebreak_type, ... }
    } = req.body;

    if (!name) return res.status(400).json({ error: 'name es requerido' });

    // 1) Crear reglas
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
      const def = await pool.query(
        `INSERT INTO scoring_rules
         (best_of_sets, golden_point, tiebreak_type, tiebreak_final_set,
          points_win, points_loss, points_walkover, points_retired,
          sets_diff_weight, games_diff_weight)
         VALUES (3,false,'long7','allowed',2,0,0,0,1,1)
         RETURNING id`
      );
      scoringId = def.rows[0].id;
    }

    // 2) Crear torneo
    const insT = await pool.query(
      `INSERT INTO tournaments
       (owner_user_id, name, location, visibility, format, scoring_rules_id, is_doubles, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'draft')
       RETURNING *`,
      [ownerId, name, location || null, visibility, format, scoringId, is_doubles]
    );

    return res.status(201).json(insT.rows[0]);
  } catch (e) {
    console.error('[TOURNAMENT CREATE ERROR]', e);
    return res.status(500).json({ error: 'Error creando torneo' });
  }
});

/**
 * Mis torneos (soy owner)
 */
router.get('/mine', requireAuth, async (req, res) => {
  try {
    const { id: ownerId } = req.user;
    const q = await pool.query(
      `SELECT t.*, sr.golden_point, sr.tiebreak_type
       FROM tournaments t
       JOIN scoring_rules sr ON sr.id = t.scoring_rules_id
       WHERE t.owner_user_id=$1
       ORDER BY t.created_at DESC`,
      [ownerId]
    );
    return res.json(q.rows);
  } catch (e) {
    console.error('[TOURNAMENT MINE ERROR]', e);
    return res.status(500).json({ error: 'Error listando mis torneos' });
  }
});

/**
 * Detalle de torneo por id
 */
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const q = await pool.query(
      `SELECT t.*, sr.*
       FROM tournaments t
       JOIN scoring_rules sr ON sr.id = t.scoring_rules_id
       WHERE t.id=$1`,
      [id]
    );
    if (!q.rowCount) return res.status(404).json({ error: 'Torneo no encontrado' });
    return res.json(q.rows[0]);
  } catch (e) {
    console.error('[TOURNAMENT DETAIL ERROR]', e);
    return res.status(500).json({ error: 'Error obteniendo torneo' });
  }
});

/**
 * Inscribir jugadores (bulk) al torneo
 * body: { player_ids: ["uuid1","uuid2", ...] }
 */
router.post('/:id/players', requireAuth, async (req, res) => {
  const { id: tourId } = req.params;
  const { id: userId } = req.user;
  const { player_ids } = req.body;

  if (!Array.isArray(player_ids) || player_ids.length === 0) {
    return res.status(400).json({ error: 'player_ids (array) es requerido' });
  }

  try {
    // Chequear ownership
    const tq = await pool.query('SELECT owner_user_id FROM tournaments WHERE id=$1', [tourId]);
    if (!tq.rowCount) return res.status(404).json({ error: 'Torneo no encontrado' });
    if (tq.rows[0].owner_user_id !== userId) {
      return res.status(403).json({ error: 'No sos el organizador de este torneo' });
    }

    await pool.query('BEGIN');

    for (const pid of player_ids) {
      await pool.query(
        `INSERT INTO tournament_players (tournament_id, player_id, accepted)
         VALUES ($1,$2,true)
         ON CONFLICT (tournament_id, player_id) DO NOTHING`,
        [tourId, pid]
      );
    }

    await pool.query('COMMIT');

    const enrolled = await pool.query(
      `SELECT tp.id, p.id AS player_id, p.display_name, p.email
       FROM tournament_players tp
       JOIN players p ON p.id = tp.player_id
       WHERE tp.tournament_id = $1
       ORDER BY p.display_name`,
      [tourId]
    );

    return res.status(201).json(enrolled.rows);
  } catch (e) {
    await pool.query('ROLLBACK');
    console.error('[TOURNAMENT ENROLL ERROR]', e);
    return res.status(500).json({ error: 'Error inscribiendo jugadores' });
  }
});

/**
 * Listar jugadores inscriptos en un torneo
 */
router.get('/:id/players', requireAuth, async (req, res) => {
  try {
    const { id: tourId } = req.params;
    const q = await pool.query(
      `SELECT tp.id, p.id AS player_id, p.display_name, p.email
       FROM tournament_players tp
       JOIN players p ON p.id = tp.player_id
       WHERE tp.tournament_id = $1
       ORDER BY p.display_name`,
      [tourId]
    );
    return res.json(q.rows);
  } catch (e) {
    console.error('[TOURNAMENT LIST PLAYERS ERROR]', e);
    return res.status(500).json({ error: 'Error listando jugadores del torneo' });
  }
});

export default router;
