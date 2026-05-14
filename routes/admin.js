const express = require('express');
const router  = express.Router();
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');

const { conectar } = require('../database');
const { autenticarAdmin } = require('../middleware/auth');

const COOKIE_OPTS = {
  httpOnly: true,
  secure:   process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  maxAge:   24 * 60 * 60 * 1000,
};

// Rate limit: 10 tentativas por IP a cada 15 min
const loginLimiter = rateLimit({
  windowMs:        15 * 60 * 1000,
  max:             10,
  standardHeaders: true,
  legacyHeaders:   false,
  message:         { erro: 'Muitas tentativas de login. Tente novamente em 15 minutos.' },
});

// POST /api/auth/login
router.post('/auth/login', loginLimiter, async (req, res) => {
  const { usuario, senha } = req.body;

  if (!usuario || !senha || typeof usuario !== 'string' || typeof senha !== 'string') {
    return res.status(400).json({ erro: 'Usuário e senha são obrigatórios.' });
  }
  if (usuario.length > 64 || senha.length > 128) {
    return res.status(400).json({ erro: 'Dados inválidos.' });
  }

  try {
    const db     = conectar();
    const result = await db.execute({
      sql:  'SELECT id, usuario, senha_hash FROM admin_users WHERE usuario = ?',
      args: [usuario.trim()],
    });
    const admin = result.rows[0];

    if (!admin || !(await bcrypt.compare(senha, String(admin.senha_hash)))) {
      return res.status(401).json({ erro: 'Usuário ou senha incorretos.' });
    }

    const token = jwt.sign(
      { id: Number(admin.id), usuario: admin.usuario },
      process.env.JWT_SECRET,
      { expiresIn: '24h' },
    );

    res.cookie('af_token', token, COOKIE_OPTS);
    res.json({ sucesso: true, mensagem: 'Login realizado com sucesso.' });
  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).json({ erro: 'Erro interno do servidor.' });
  }
});

// POST /api/auth/logout
router.post('/auth/logout', (req, res) => {
  res.clearCookie('af_token', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict' });
  res.json({ sucesso: true, mensagem: 'Logout realizado com sucesso.' });
});

// GET /api/auth/me — retorna usuário logado
router.get('/auth/me', autenticarAdmin, (req, res) => {
  res.json({ usuario: req.admin.usuario });
});

// PATCH /api/admin/cidades/:id — ativa/desativa COD (protegido)
router.patch('/admin/cidades/:id', autenticarAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id) || id <= 0) {
    return res.status(400).json({ erro: 'ID inválido.' });
  }

  const { cod_disponivel } = req.body;
  if (cod_disponivel === undefined) {
    return res.status(400).json({ erro: 'Campo "cod_disponivel" é obrigatório.' });
  }

  try {
    const db     = conectar();
    const result = await db.execute({
      sql:  'UPDATE cidades SET cod_disponivel = ? WHERE id = ?',
      args: [cod_disponivel ? 1 : 0, id],
    });

    if (result.rowsAffected === 0) {
      return res.status(404).json({ erro: 'Cidade não encontrada.' });
    }

    const status = cod_disponivel ? 'ativado' : 'desativado';
    res.json({ sucesso: true, mensagem: `COD ${status} com sucesso.` });
  } catch (err) {
    console.error('Toggle COD error:', err.message);
    res.status(500).json({ erro: 'Erro interno do servidor.' });
  }
});

// GET /api/admin/stats — pedidos dos últimos 7 dias (protegido)
router.get('/admin/stats', autenticarAdmin, async (req, res) => {
  try {
    const db     = conectar();
    const result = await db.execute(`
      SELECT DATE(criado_em) as data, COUNT(*) as total, SUM(valor) as receita
      FROM pedidos
      WHERE criado_em >= datetime('now', '-6 days', 'localtime')
      GROUP BY DATE(criado_em)
      ORDER BY data ASC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('Stats error:', err.message);
    res.status(500).json({ erro: 'Erro interno do servidor.' });
  }
});

module.exports = router;
