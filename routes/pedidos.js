const express = require('express');
const router  = express.Router();

const { conectar } = require('../database');
const { autenticarAdmin } = require('../middleware/auth');

const KITS = {
  '1mes':   { nome: 'Kit 1 mês',   valor: 97.00 },
  '3meses': { nome: 'Kit 3 meses', valor: 247.00 },
  '5meses': { nome: 'Kit 5 meses', valor: 397.00 },
};

const STATUS_VALIDOS = ['pendente', 'confirmado', 'entregue', 'cancelado'];
const UF_VALIDAS     = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];
const EMAIL_RE       = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;
const PHONE_RE       = /^[\d\s\(\)\-\+]{7,25}$/;
const DATE_RE        = /^\d{4}-\d{2}-\d{2}$/;

function sanitize(val, maxLen = 200) {
  if (val == null) return '';
  return String(val).trim().slice(0, maxLen);
}

// POST /api/pedidos — rota pública (clientes fazem pedidos)
router.post('/pedidos', async (req, res) => {
  const s = {
    nome:        sanitize(req.body.nome, 100),
    telefone:    sanitize(req.body.telefone, 30),
    email:       sanitize(req.body.email, 150),
    endereco:    sanitize(req.body.endereco, 200),
    numero:      sanitize(req.body.numero, 20),
    complemento: sanitize(req.body.complemento, 100),
    bairro:      sanitize(req.body.bairro, 100),
    cidade:      sanitize(req.body.cidade, 100),
    estado:      sanitize(req.body.estado, 2).toUpperCase(),
    cep:         sanitize(req.body.cep, 9).replace(/\D/g, ''),
    kit:         sanitize(req.body.kit, 10),
  };

  const obrigatorios = { nome: s.nome, telefone: s.telefone, endereco: s.endereco, numero: s.numero, bairro: s.bairro, cidade: s.cidade, estado: s.estado, kit: s.kit };
  const faltando = Object.entries(obrigatorios).filter(([, v]) => !v).map(([k]) => k);
  if (faltando.length > 0) {
    return res.status(400).json({ erro: `Campos obrigatórios faltando: ${faltando.join(', ')}` });
  }

  if (!KITS[s.kit]) {
    return res.status(400).json({ erro: 'Kit inválido. Escolha: 1mes, 3meses ou 5meses.' });
  }
  if (!UF_VALIDAS.includes(s.estado)) {
    return res.status(400).json({ erro: 'Estado (UF) inválido.' });
  }
  if (s.email && !EMAIL_RE.test(s.email)) {
    return res.status(400).json({ erro: 'E-mail inválido.' });
  }
  if (!PHONE_RE.test(s.telefone)) {
    return res.status(400).json({ erro: 'Telefone inválido.' });
  }
  if (s.cep && s.cep.length !== 8) {
    return res.status(400).json({ erro: 'CEP inválido.' });
  }

  const valor = KITS[s.kit].valor;

  try {
    const db     = conectar();
    const result = await db.execute({
      sql:  `INSERT INTO pedidos (nome, telefone, email, endereco, numero, complemento, bairro, cidade, estado, cep, kit, valor, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pendente')`,
      args: [s.nome, s.telefone, s.email, s.endereco, s.numero, s.complemento, s.bairro, s.cidade, s.estado, s.cep, s.kit, valor],
    });

    const pedidoId = Number(result.lastInsertRowid);
    res.status(201).json({
      sucesso:   true,
      pedido_id: pedidoId,
      mensagem:  `Pedido #${pedidoId} recebido com sucesso! Entraremos em contato para confirmar a entrega.`,
    });
  } catch (err) {
    console.error('Create order error:', err.message);
    res.status(500).json({ erro: 'Erro interno do servidor.' });
  }
});

// GET /api/pedidos — lista com filtros (protegido)
router.get('/pedidos', autenticarAdmin, async (req, res) => {
  const { status, data_inicio, data_fim, limite } = req.query;

  if (status && !STATUS_VALIDOS.includes(status)) {
    return res.status(400).json({ erro: 'Status inválido.' });
  }
  if (data_inicio && !DATE_RE.test(data_inicio)) {
    return res.status(400).json({ erro: 'Data de início inválida.' });
  }
  if (data_fim && !DATE_RE.test(data_fim)) {
    return res.status(400).json({ erro: 'Data de fim inválida.' });
  }

  let sql  = 'SELECT * FROM pedidos WHERE 1=1';
  const args = [];

  if (status)      { sql += ' AND status = ?';                    args.push(status); }
  if (data_inicio) { sql += ' AND DATE(criado_em) >= DATE(?)';    args.push(data_inicio); }
  if (data_fim)    { sql += ' AND DATE(criado_em) <= DATE(?)';    args.push(data_fim); }

  sql += ' ORDER BY criado_em DESC';

  const lim = parseInt(limite, 10);
  if (Number.isFinite(lim) && lim > 0 && lim <= 5000) {
    sql += ' LIMIT ?';
    args.push(lim);
  }

  try {
    const db     = conectar();
    const result = await db.execute({ sql, args });
    res.json(result.rows);
  } catch (err) {
    console.error('List orders error:', err.message);
    res.status(500).json({ erro: 'Erro interno do servidor.' });
  }
});

// PATCH /api/pedidos/:id — atualiza status (protegido)
router.patch('/pedidos/:id', autenticarAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id) || id <= 0) {
    return res.status(400).json({ erro: 'ID inválido.' });
  }

  const { status } = req.body;
  if (!STATUS_VALIDOS.includes(status)) {
    return res.status(400).json({ erro: `Status inválido. Use: ${STATUS_VALIDOS.join(', ')}` });
  }

  try {
    const db     = conectar();
    const result = await db.execute({
      sql:  `UPDATE pedidos SET status = ?, atualizado_em = datetime('now', 'localtime') WHERE id = ?`,
      args: [status, id],
    });

    if (result.rowsAffected === 0) {
      return res.status(404).json({ erro: 'Pedido não encontrado.' });
    }

    res.json({ sucesso: true, mensagem: `Pedido #${id} atualizado para "${status}".` });
  } catch (err) {
    console.error('Update order error:', err.message);
    res.status(500).json({ erro: 'Erro interno do servidor.' });
  }
});

module.exports = router;
