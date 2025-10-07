// server.js
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { pool } from './db.js';

// Rutas
import authRoutes from './routes/auth.js';
import playersRoutes from './routes/players.js';
import tournamentsRoutes from './routes/tournaments.js';

// Airbags de errores (debug)
process.on('uncaughtException', err => console.error('[UNCAUGHT]', err));
process.on('unhandledRejection', err => console.error('[UNHANDLED]', err));

dotenv.config();

const app = express();
const isProd = process.env.NODE_ENV === 'production';

// Confianza en proxy (Render / Nginx) para IP real en rate-limit
app.set('trust proxy', 1);

// Seguridad + límites
app.use(helmet());
app.use(rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 200,                  // 200 req por IP por ventana
}));

// CORS: permitir orígenes definidos por env (coma-separados)
const ALLOWED = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    // Apps nativas no envían Origin → permitir
    if (!origin) return cb(null, true);
    // Si no configuraste ALLOWED, permitir todo temporalmente
    if (ALLOWED.length === 0 || ALLOWED.includes(origin)) return cb(null, true);
    return cb(new Error('CORS not allowed'), false);
  },
  credentials: true
}));

app.use(express.json({ limit: '1mb' }));

// Ping simple
app.get('/', (req, res) => {
  res.send('API Torneos de Pádel funcionando 🎾');
});

// Healthcheck siempre disponible
app.get('/health', (req, res) => {
  res.json({ ok: true });
});

// Rutas de diagnóstico SOLO en desarrollo
if (!isProd) {
  app.post('/echo', (req, res) => res.json({ got: req.body }));
  app.get('/db-test', async (req, res) => {
    try {
      const result = await pool.query('SELECT NOW()');
      res.json({ success: true, time: result.rows[0].now });
    } catch (err) {
      console.error('[DB TEST ERROR]', err);
      res.status(500).json({ error: 'Error al conectar con la base' });
    }
  });
}

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
  console.error('[UNHANDLED ERROR MIDDLEWARE]', err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor escuchando en puerto ${PORT} (NODE_ENV=${process.env.NODE_ENV || 'development'})`);
});
