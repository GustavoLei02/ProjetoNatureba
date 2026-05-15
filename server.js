require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');

const { inicializar } = require('./database');
const rotasCidades = require('./routes/cidades');
const rotasPedidos = require('./routes/pedidos');
const rotasAdmin   = require('./routes/admin');
const rotasCoinzz  = require('./routes/coinzz');

const app = express();
const PORTA = process.env.PORT || 3000;

// ── Inicialização lazy (compatível com Vercel serverless) ──────────────────────
let initialized = false;
let initPromise  = null;

async function ensureInitialized() {
  if (!initialized) {
    if (!initPromise) initPromise = inicializar();
    await initPromise;
    initialized = true;
  }
}

// ── Segurança: headers HTTP ────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:     ["'self'"],
      scriptSrc:      ["'self'", "'unsafe-inline'", 'https://connect.facebook.net'],
      scriptSrcAttr:  ["'unsafe-inline'"],
      styleSrc:       ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      imgSrc:         ["'self'", 'data:', 'blob:', 'https://www.facebook.com'],
      connectSrc:     ["'self'", 'https://www.facebook.com', 'https://connect.facebook.net'],
      fontSrc:        ["'self'", 'https://fonts.gstatic.com'],
      objectSrc:      ["'none'"],
      frameAncestors: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

// ── CORS ───────────────────────────────────────────────────────────────────────
const allowedOrigins = (process.env.ALLOWED_ORIGIN || 'http://localhost:3000')
  .split(',')
  .map(o => o.trim());

app.use(cors({
  origin(origin, cb) {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error('Origem não permitida pelo CORS'));
  },
  credentials: true,
  optionsSuccessStatus: 200,
}));

// ── Body / Cookie ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: false, limit: '10kb' }));
app.use(cookieParser());

// ── Arquivos estáticos ────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ── Inicialização do banco apenas para rotas de API ───────────────────────────
app.use('/api', async (req, res, next) => {
  try {
    await ensureInitialized();
    next();
  } catch (err) {
    console.error('Erro de inicialização:', err.message);
    res.status(500).json({ erro: 'Erro interno do servidor.' });
  }
});

// ── Rotas da API ───────────────────────────────────────────────────────────────
app.use('/api', rotasCidades);
app.use('/api', rotasPedidos);
app.use('/api', rotasAdmin);
app.use('/api', rotasCoinzz);

app.get('/api/status', (req, res) => {
  res.json({ status: 'online', versao: '2.0.0' });
});

// ── 404 ────────────────────────────────────────────────────────────────────────
app.use((req, res) => {
  if (req.accepts('html')) return res.sendFile(path.join(__dirname, 'public', 'index.html'));
  res.status(404).json({ erro: 'Rota não encontrada.' });
});

// ── Error handler global ───────────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err.message);
  res.status(500).json({ erro: 'Erro interno do servidor.' });
});

// ── Inicialização local (não roda no Vercel) ───────────────────────────────────
if (require.main === module) {
  (async () => {
    await inicializar();
    initialized = true;
    app.listen(PORTA, () => {
      console.log('');
      console.log('===========================================');
      console.log('  OAmericanFit — Sistema COD iniciado!');
      console.log(`  Acesse: http://localhost:${PORTA}`);
      console.log(`  Admin:  http://localhost:${PORTA}/login.html`);
      console.log('===========================================');
      console.log('');
    });
  })();
}

// Exporta para Vercel serverless
module.exports = app;
