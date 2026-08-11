const express = require('express');
const pg = require('pg');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();

app.use(express.json());

const pool = new pg.Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  // Falhar no arranque é melhor que subir aceitando o que não deveria.
  throw new Error('JWT_SECRET não definido');
}

// Verificação local da assinatura, sem ida ao auth-service — mesmo desenho
// dos outros serviços.
//
// As questões não pertencem a ninguém, então o token aqui não decide QUAIS
// linhas mostrar, como no estudo-service. Ele existe porque o banco de
// questões é o ativo do produto: sem exigir token, a rota seria um endpoint
// público de download do acervo inteiro.
const verifyToken = (req, res, next) => {
  const header = req.headers.authorization;

  if (!header) {
    return res.status(401).json({ error: 'Token não fornecido' });
  }

  const token = header.startsWith('Bearer ') ? header.slice(7) : header;

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (error) {
    res.status(401).json({ error: 'Token inválido' });
  }
};

app.get('/health', (req, res) => {
  res.json({ status: 'Questoes Service is running', timestamp: new Date().toISOString() });
});

// Colunas devolvidas ao front. `gabarito` vai junto porque a correção
// acontece na tela, sem ida ao servidor — o app precisa dizer "errou" no
// mesmo instante do clique. Isso significa que a resposta está no
// JavaScript e alguém determinado consegue lê-la; é uma troca aceita de
// propósito, porque a alternativa é uma requisição por clique e um app que
// trava em rede ruim. Vale para questão de estudo, não valeria para prova.
const COLUNAS = `
  id, exame, tipo_prova, numero, banca, ano,
  enunciado, alternativas, gabarito, anulada,
  disciplina, tema, explicacao, explicacao_fonte, revisada
`;

// ───────────────────────────────────────────────────────────────
// GET /questoes — lista com filtros
// ───────────────────────────────────────────────────────────────
app.get('/questoes', verifyToken, async (req, res) => {
  const { disciplina, exame, aleatorio } = req.query;

  const limiteBruto = req.query.limite === undefined ? 20 : Number(req.query.limite);
  // Query param inválido devolve 400 em vez de virar o default em silêncio:
  // `limite=abc` virando 20 esconde um bug de quem chamou.
  if (!Number.isInteger(limiteBruto) || limiteBruto < 1 || limiteBruto > 200) {
    return res.status(400).json({ error: 'limite deve ser inteiro entre 1 e 200' });
  }

  const condicoes = ['anulada = FALSE'];
  const valores = [];

  if (disciplina) {
    valores.push(disciplina);
    condicoes.push(`disciplina = $${valores.length}`);
  }

  if (exame !== undefined) {
    const n = Number(exame);
    if (!Number.isInteger(n)) {
      return res.status(400).json({ error: 'exame deve ser inteiro' });
    }
    valores.push(n);
    condicoes.push(`exame = $${valores.length}`);
  }

  // `aleatorio` existe para o quiz e o simulado. ORDER BY random() varre a
  // tabela inteira; com dezenas de milhares de questões isso vira o gargalo
  // e a saída é TABLESAMPLE. Enquanto o acervo é de alguns milhares, trocar
  // agora seria complicar sem medir.
  const ordem = aleatorio === '1' ? 'random()' : 'exame DESC, numero ASC';

  valores.push(limiteBruto);

  try {
    const { rows } = await pool.query(
      `SELECT ${COLUNAS} FROM questoes
       WHERE ${condicoes.join(' AND ')}
       ORDER BY ${ordem}
       LIMIT $${valores.length}`,
      valores
    );
    res.json(rows);
  } catch (error) {
    console.error('Erro ao listar questões:', error);
    res.status(500).json({ error: 'Erro ao buscar questões' });
  }
});

// ───────────────────────────────────────────────────────────────
// GET /questoes/disciplinas — o que existe no acervo
// ───────────────────────────────────────────────────────────────
//
// Vem do banco e não de uma lista fixa no front: a lista fixa envelhece no
// dia em que um exame traz disciplina nova, e a tela passa a oferecer filtro
// que não devolve nada.
//
// Declarada ANTES de /questoes/:id — o Express casa na ordem, e com a ordem
// invertida "disciplinas" cairia no :id e devolveria 400.
app.get('/questoes/disciplinas', verifyToken, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT disciplina, COUNT(*)::int AS total
         FROM questoes
        WHERE disciplina IS NOT NULL AND anulada = FALSE
        GROUP BY disciplina
        ORDER BY total DESC`
    );
    res.json(rows);
  } catch (error) {
    console.error('Erro ao listar disciplinas:', error);
    res.status(500).json({ error: 'Erro ao buscar disciplinas' });
  }
});

// ───────────────────────────────────────────────────────────────
// GET /questoes/:id
// ───────────────────────────────────────────────────────────────
app.get('/questoes/:id', verifyToken, async (req, res) => {
  const id = Number(req.params.id);

  // Sem esta checagem, um id não numérico chega ao Postgres e volta como
  // 500 — erro de quem chamou disfarçado de erro do servidor.
  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ error: 'id inválido' });
  }

  try {
    const { rows } = await pool.query(`SELECT ${COLUNAS} FROM questoes WHERE id = $1`, [id]);

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Questão não encontrada' });
    }

    res.json(rows[0]);
  } catch (error) {
    console.error('Erro ao buscar questão:', error);
    res.status(500).json({ error: 'Erro ao buscar questão' });
  }
});

module.exports = { app, pool };
