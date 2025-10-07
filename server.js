// server.js
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { pool } from './db.js';

// Rutas
import authRoutes from './routes/auth.js';
import playersRoutes from './routes/players.js';
import tournamentsRoutes from './routes/tournaments.js';

dotenv.config();

const app = express();

// Middlewares básicos
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '1mb' }));

// Ping simple
app.get('/', (req, res) => {
  res.send('API Torneos de Pádel funcionando 🎾');
});

// Healthcheck
app.get('/health', (req, res) => {
  res.json({ ok: true });
});

// Probar conexión a DB
app.get('/db-test', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json({ success: true, time: result.rows[0].now });
  } catch (err) {
    console.error('[DB TEST ERROR]', err);
    res.status(500).json({ error: 'Error al conectar con la base' });
  }
});

// Montar rutas de la API
app.use('/auth', authRoutes);
app.use('/players', playersRoutes);
app.use('/tournaments', tournamentsRoutes);

// 404 por defecto
app.use((req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

// Manejador de errores genérico
app.use((err, req, res, next) => {
  console.error('[UNHANDLED ERROR]', err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor escuchando en puerto ${PORT}`);
});
