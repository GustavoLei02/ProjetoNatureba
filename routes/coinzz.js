const express = require('express');
const router  = express.Router();

const COINZZ_TOKEN = process.env.COINZZ_TOKEN;
const COINZZ_API   = (process.env.COINZZ_API_URL || 'https://app.coinzz.com.br/api').replace(/\/$/, '');

const OFFERS = {
  '1mes':   process.env.COINZZ_OFFER_1MES,
  '3meses': process.env.COINZZ_OFFER_3MESES,
  '5meses': process.env.COINZZ_OFFER_5MESES,
};

const METODOS_VALIDOS = ['pix', 'bank_slip', 'credit_card'];

function str(val, max) {
  return typeof val === 'string' ? val.trim().slice(0, max) : '';
}

// POST /api/coinzz/venda — proxy seguro para Coinzz
router.post('/coinzz/venda', async (req, res) => {
  const { kit, pagamento, cliente, cartao } = req.body;

  if (!kit || !pagamento || !cliente || typeof cliente !== 'object') {
    return res.status(400).json({ erro: 'Dados incompletos.' });
  }
  if (!OFFERS[kit]) {
    return res.status(400).json({
      erro: Object.prototype.hasOwnProperty.call(OFFERS, kit)
        ? `Oferta do kit "${kit}" ainda não configurada. Preencha COINZZ_OFFER_${kit.toUpperCase()} no painel Vercel.`
        : `Kit inválido: ${kit}`,
    });
  }
  if (!METODOS_VALIDOS.includes(pagamento)) {
    return res.status(400).json({ erro: 'Forma de pagamento inválida.' });
  }

  const camposCliente = ['nome', 'email', 'cpf', 'telefone', 'cep', 'endereco', 'numero', 'bairro', 'cidade', 'estado'];
  for (const campo of camposCliente) {
    if (!cliente[campo] || typeof cliente[campo] !== 'string' || !cliente[campo].trim()) {
      return res.status(400).json({ erro: `Campo obrigatório do cliente: ${campo}` });
    }
  }

  if (pagamento === 'credit_card') {
    if (!cartao || typeof cartao !== 'object') {
      return res.status(400).json({ erro: 'Dados do cartão são obrigatórios.' });
    }
    for (const campo of ['titular', 'numero', 'mes', 'ano', 'cvv']) {
      if (!cartao[campo]) {
        return res.status(400).json({ erro: `Campo obrigatório do cartão: ${campo}` });
      }
    }
  }

  const payload = {
    offer_hash:     OFFERS[kit],
    payment_method: pagamento,
    customer: {
      name:     str(cliente.nome, 100),
      email:    str(cliente.email, 150),
      document: str(cliente.cpf, 20).replace(/\D/g, ''),
      phone:    str(cliente.telefone, 25).replace(/\D/g, ''),
      address: {
        zip_code:     str(cliente.cep, 9).replace(/\D/g, ''),
        street:       str(cliente.endereco, 200),
        number:       str(cliente.numero, 20),
        complement:   str(cliente.complemento || '', 100),
        neighborhood: str(cliente.bairro, 100),
        city:         str(cliente.cidade, 100),
        state:        str(cliente.estado, 2).toUpperCase(),
      },
    },
  };

  if (pagamento === 'credit_card' && cartao) {
    const parcelas = parseInt(cartao.parcelas, 10);
    payload.credit_card = {
      card_holder:  str(cartao.titular, 100),
      card_number:  str(cartao.numero, 19).replace(/\D/g, ''),
      month:        parseInt(cartao.mes, 10),
      year:         parseInt(cartao.ano, 10),
      cvv:          str(cartao.cvv, 4).replace(/\D/g, ''),
      installments: Number.isFinite(parcelas) && parcelas > 0 ? parcelas : 1,
    };
  }

  try {
    const response = await fetch(`${COINZZ_API}/sales`, {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${COINZZ_TOKEN}`,
        'Content-Type': 'application/json',
        Accept:         'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (response.ok && data.success) {
      const venda = data.data[0];
      res.json({ sucesso: true, venda });
    } else {
      const erroMsg = data.message || 'Erro ao processar pagamento.';
      res.status(response.status).json({ erro: erroMsg, detalhes: data.errors || null });
    }
  } catch (err) {
    console.error('Coinzz connection error:', err.message);
    res.status(500).json({ erro: 'Erro de conexão com a plataforma de pagamento. Tente novamente.' });
  }
});

module.exports = router;
