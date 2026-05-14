const { createClient } = require('@libsql/client');
const bcrypt = require('bcryptjs');

let db;

function conectar() {
  if (!db) {
    db = createClient({
      url: process.env.TURSO_DATABASE_URL || 'file:americanfit.db',
      authToken: process.env.TURSO_AUTH_TOKEN || undefined,
    });
  }
  return db;
}

async function inicializar() {
  const banco = conectar();

  await banco.execute(`
    CREATE TABLE IF NOT EXISTS cidades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      estado TEXT NOT NULL,
      cep_inicio TEXT NOT NULL,
      cep_fim TEXT NOT NULL,
      cod_disponivel INTEGER NOT NULL DEFAULT 1,
      ativo INTEGER NOT NULL DEFAULT 1,
      criado_em TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    )
  `);

  await banco.execute(`
    CREATE TABLE IF NOT EXISTS pedidos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      telefone TEXT NOT NULL,
      email TEXT NOT NULL,
      endereco TEXT NOT NULL,
      numero TEXT NOT NULL,
      complemento TEXT,
      bairro TEXT NOT NULL,
      cidade TEXT NOT NULL,
      estado TEXT NOT NULL,
      cep TEXT NOT NULL,
      kit TEXT NOT NULL,
      valor REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'pendente',
      criado_em TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      atualizado_em TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    )
  `);

  await banco.execute(`
    CREATE TABLE IF NOT EXISTS admin_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario TEXT NOT NULL UNIQUE,
      senha_hash TEXT NOT NULL,
      criado_em TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    )
  `);

  await banco.execute(`CREATE INDEX IF NOT EXISTS idx_pedidos_status ON pedidos(status)`);
  await banco.execute(`CREATE INDEX IF NOT EXISTS idx_pedidos_criado ON pedidos(criado_em)`);

  console.log('Tabelas verificadas/criadas com sucesso.');

  await popularCidades(banco);
  await criarAdminPadrao(banco);
}

async function popularCidades(banco) {
  const result = await banco.execute("SELECT id FROM cidades WHERE nome = 'Goiânia' LIMIT 1");
  if (result.rows.length > 0) {
    console.log('Cidades já populadas. Pulando.');
    return;
  }

  await banco.execute('DELETE FROM cidades');

  const cidadesPorEstado = {
    AM: ['Manaus'],
    BA: ['Lauro de Freitas', 'Salvador'],
    CE: ['Caucaia', 'Eusébio', 'Fortaleza', 'Itaitinga', 'Maracanaú', 'Maranguape', 'Pacatuba'],
    DF: ['Arniqueira', 'Brasília', 'Ceilândia', 'Gama', 'Guará', 'Recanto das Emas', 'Samambaia', 'Santa Maria', 'Sol Nascente/Pôr do Sol', 'Taguatinga', 'Vicente Pires'],
    ES: ['Cariacica', 'Guarapari', 'Serra', 'Viana', 'Vila Velha', 'Vitória'],
    GO: ['Abadia de Goiás', 'Águas Lindas de Goiás', 'Anápolis', 'Aparecida de Goiânia', 'Aragoiânia', 'Bonfinópolis', 'Caturaí', 'Cidade Ocidental', 'Goianápolis', 'Goianira', 'Goiânia', 'Guapó', 'Hidrolândia', 'Inhumas', 'Luziânia', 'Nerópolis', 'Novo Gama', 'Senador Canedo', 'Terezópolis de Goiás', 'Trindade', 'Valparaíso de Goiás'],
    MA: ['Paço do Lumiar', 'Raposa', 'São José de Ribamar', 'São Luís', 'Timon'],
    MG: ['Belo Horizonte', 'Betim', 'Carmo do Cajuru', 'Citrolândia', 'Contagem', 'Divinópolis', 'Ibirité', 'Igaratinga', 'Itaúna', 'Nova Serrana', 'Pará de Minas', 'Sabará', 'Santa Luzia'],
    MS: ['Campo Grande'],
    PA: ['Ananindeua', 'Belém', 'Marituba'],
    PB: ['Bayeux', 'Cabedelo', 'João Pessoa', 'Santa Rita'],
    PE: ['Abreu e Lima', 'Cabo de Santo Agostinho', 'Camaragibe', 'Igarassu', 'Jaboatão dos Guararapes', 'Olinda', 'Paulista', 'Recife', 'São Lourenço da Mata'],
    PI: ['Teresina'],
    PR: ['Almirante Tamandaré', 'Araucária', 'Campina Grande do Sul', 'Campo Largo', 'Colombo', 'Curitiba', 'Fazenda Rio Grande', 'Itaperuçu', 'Pinhais', 'Piraquara', 'Quatro Barras', 'Rio Branco do Sul', 'São José dos Pinhais'],
    RJ: ['Belford Roxo', 'Duque de Caxias', 'Mesquita', 'Nilópolis', 'Niterói', 'Nova Iguaçu', 'Queimados', 'Rio de Janeiro', 'São João de Meriti'],
    RN: ['Ceará-Mirim', 'Extremoz', 'Macaíba', 'Mossoró', 'Natal', 'Parnamirim', 'São Gonçalo do Amarante'],
    RS: ['Alvorada', 'Bento Gonçalves', 'Bom Princípio', 'Cachoeirinha', 'Campo Bom', 'Canoas', 'Carlos Barbosa', 'Caxias do Sul', 'Eldorado do Sul', 'Estância Velha', 'Esteio', 'Farroupilha', 'Garibaldi', 'Gravataí', 'Guaíba', 'Novo Hamburgo', 'Portão', 'Porto Alegre', 'Sapiranga', 'Sapucaia do Sul', 'São Leopoldo', 'São Sebastião do Caí', 'São Vendelino', 'Viamão'],
    SC: ['Balneário Camboriú', 'Balneário Piçarras', 'Barra Velha', 'Blumenau', 'Camboriú', 'Itajaí', 'Itapema', 'Jaraguá do Sul', 'Joinville', 'Navegantes', 'Penha'],
    SP: ['Americana', 'Arujá', 'Barueri', 'Caçapava', 'Caieiras', 'Cajamar', 'Campo Limpo Paulista', 'Campinas', 'Carapicuíba', 'Cotia', 'Cubatão', 'Diadema', 'Embu das Artes', 'Ferraz de Vasconcelos', 'Francisco Morato', 'Franco da Rocha', 'Guarulhos', 'Hortolândia', 'Itapevi', 'Itaquaquecetuba', 'Jacareí', 'Jandira', 'Jundiaí', 'Mauá', 'Mogi das Cruzes', 'Monte Mor', 'Nova Odessa', 'Osasco', 'Paulínia', 'Poá', 'Praia Grande', 'Ribeirão Pires', 'Ribeirão Preto', 'Rio Grande da Serra', "Santa Bárbara d'Oeste", 'Santo André', 'Santos', 'São Bernardo do Campo', 'São Caetano do Sul', 'São José dos Campos', 'São Paulo', 'São Vicente', 'Sumaré', 'Suzano', 'Taboão da Serra', 'Taubaté', 'Valinhos', 'Vinhedo'],
  };

  const statements = [];
  for (const [estado, lista] of Object.entries(cidadesPorEstado)) {
    for (const cidade of lista) {
      statements.push({
        sql: "INSERT INTO cidades (nome, estado, cep_inicio, cep_fim, cod_disponivel, ativo) VALUES (?, ?, '00000000', '99999999', 1, 1)",
        args: [cidade, estado],
      });
    }
  }
  await banco.batch(statements, 'write');

  const total = Object.values(cidadesPorEstado).reduce((s, a) => s + a.length, 0);
  console.log(`${total} cidades cadastradas com sucesso.`);
}

async function criarAdminPadrao(banco) {
  const result = await banco.execute({
    sql: 'SELECT id FROM admin_users WHERE usuario = ?',
    args: ['admin'],
  });
  if (result.rows.length > 0) {
    console.log('Usuário admin já existe. Pulando criação.');
    return;
  }

  const senhaHash = await bcrypt.hash('admin123', 12);
  await banco.execute({
    sql: 'INSERT INTO admin_users (usuario, senha_hash) VALUES (?, ?)',
    args: ['admin', senhaHash],
  });
  console.log('Usuário admin criado. TROQUE A SENHA EM PRODUÇÃO via painel admin.');
}

module.exports = { conectar, inicializar };
