const express = require('express');
const router  = express.Router();

const { conectar } = require('../database');
const { autenticarAdmin } = require('../middleware/auth');

// POST /api/verificar-cep — público
router.post('/verificar-cep', async (req, res) => {
  const raw = req.body && req.body.cep;
  if (!raw || typeof raw !== 'string') {
    return res.status(400).json({ erro: 'CEP não informado.' });
  }

  const cepLimpo = raw.replace(/\D/g, '');
  if (cepLimpo.length !== 8) {
    return res.status(400).json({ erro: 'CEP inválido. Informe 8 dígitos.' });
  }

  try {
    const db     = conectar();
    const result = await db.execute({
      sql:  `SELECT id, nome, estado, cod_disponivel FROM cidades
             WHERE ativo = 1 AND cep_inicio <= ? AND cep_fim >= ? LIMIT 1`,
      args: [cepLimpo, cepLimpo],
    });

    const cidade = result.rows[0];

    if (!cidade) {
      return res.json({
        disponivel: false,
        cidade:     null,
        estado:     null,
        mensagem:   'Infelizmente ainda não atendemos esse CEP. Mas você pode comprar pelo nosso checkout online!',
      });
    }

    if (cidade.cod_disponivel) {
      return res.json({
        disponivel: true,
        cidade:     cidade.nome,
        estado:     cidade.estado,
        mensagem:   `✅ Ótima notícia! Entregamos em ${cidade.nome}/${cidade.estado} com pagamento na entrega.`,
      });
    }

    return res.json({
      disponivel: false,
      cidade:     cidade.nome,
      estado:     cidade.estado,
      mensagem:   'Entregamos na sua região! Finalize sua compra com segurança pelo nosso checkout.',
    });
  } catch (err) {
    console.error('CEP check error:', err.message);
    res.status(500).json({ erro: 'Erro interno do servidor.' });
  }
});

// GET /api/cidades-disponiveis — público
router.get('/cidades-disponiveis', async (req, res) => {
  try {
    const db     = conectar();
    const result = await db.execute(
      'SELECT nome, estado FROM cidades WHERE ativo = 1 AND cod_disponivel = 1 ORDER BY estado, nome',
    );

    const porEstado = {};
    for (const c of result.rows) {
      if (!porEstado[c.estado]) porEstado[c.estado] = [];
      porEstado[c.estado].push(c.nome);
    }
    res.json(porEstado);
  } catch (err) {
    console.error('Cities list error:', err.message);
    res.status(500).json({ erro: 'Erro interno do servidor.' });
  }
});

// GET /api/cidades — protegido
router.get('/cidades', autenticarAdmin, async (req, res) => {
  try {
    const db     = conectar();
    const result = await db.execute('SELECT * FROM cidades WHERE ativo = 1 ORDER BY estado, nome');
    res.json(result.rows);
  } catch (err) {
    console.error('Cities admin list error:', err.message);
    res.status(500).json({ erro: 'Erro interno do servidor.' });
  }
});

module.exports = router;
