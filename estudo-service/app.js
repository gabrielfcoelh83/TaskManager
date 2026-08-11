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
// do user-service e do task-service. O auth só é necessário para emitir
// token; quem já está logado continua trabalhando com ele fora do ar.
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

// Health Check
app.get('/health', (req, res) => {
  res.json({ status: 'Estudo Service is running', timestamp: new Date().toISOString() });
});

// ───────────────────────────────────────────────────────────────
// POST /tentativas — registra uma resposta
// ───────────────────────────────────────────────────────────────
//
// O corpo NÃO carrega user_id. Quem responde é quem está no token —
// não existe caminho para registrar tentativa em nome de outra pessoa.
app.post('/tentativas', verifyToken, async (req, res) => {
  const { questao_id, correta, alternativa, tempo_seg } = req.body || {};

  // Validação explícita: `correta` é booleano e ausência é diferente de
  // false. Sem isso, um corpo malformado viraria "errou" silenciosamente
  // e contaminaria a taxa de acertos.
  if (questao_id === undefined || questao_id === null || String(questao_id).trim() === '') {
    return res.status(400).json({ error: 'questao_id é obrigatório' });
  }
  if (typeof correta !== 'boolean') {
    return res.status(400).json({ error: 'correta deve ser true ou false' });
  }
  if (alternativa !== undefined && alternativa !== null && !Number.isInteger(alternativa)) {
    return res.status(400).json({ error: 'alternativa deve ser um inteiro' });
  }
  if (tempo_seg !== undefined && tempo_seg !== null &&
      (!Number.isInteger(tempo_seg) || tempo_seg < 0)) {
    return res.status(400).json({ error: 'tempo_seg deve ser um inteiro não negativo' });
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO tentativas (user_id, questao_id, correta, alternativa, tempo_seg)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, questao_id, correta, alternativa, tempo_seg, respondida_em`,
      [
        req.user.id,
        String(questao_id),
        correta,
        alternativa ?? null,
        tempo_seg ?? null,
      ]
    );
    res.status(201).json(rows[0]);
  } catch (error) {
    console.error('Erro ao registrar tentativa:', error);
    res.status(500).json({ error: 'Erro ao registrar tentativa' });
  }
});

// ───────────────────────────────────────────────────────────────
// GET /tentativas?desde=ISO&limite=N — histórico do próprio usuário
// ───────────────────────────────────────────────────────────────
//
// O filtro `user_id = $1` vem do token, então não existe requisição capaz
// de ler tentativa alheia — o mesmo desenho de "autorização por dono" do
// task-service. Não há rota para buscar por id: a lista já é o recurso.
app.get('/tentativas', verifyToken, async (req, res) => {
  const { desde, limite } = req.query;

  let desdeParam = null;
  if (desde !== undefined && desde !== '') {
    const data = new Date(desde);
    if (Number.isNaN(data.getTime())) {
      return res.status(400).json({ error: 'desde deve ser uma data ISO válida' });
    }
    desdeParam = data.toISOString();
  }

  // Teto para não devolver a base inteira num descuido do cliente.
  const max = 1000;
  let limiteParam = 500;
  if (limite !== undefined && limite !== '') {
    const n = Number(limite);
    if (!Number.isInteger(n) || n < 1) {
      return res.status(400).json({ error: 'limite deve ser um inteiro positivo' });
    }
    limiteParam = Math.min(n, max);
  }

  try {
    const { rows } = await pool.query(
      `SELECT id, questao_id, correta, alternativa, tempo_seg, respondida_em
         FROM tentativas
        WHERE user_id = $1
          AND ($2::timestamptz IS NULL OR respondida_em >= $2)
        ORDER BY respondida_em DESC
        LIMIT $3`,
      [req.user.id, desdeParam, limiteParam]
    );
    res.json(rows);
  } catch (error) {
    console.error('Erro ao listar tentativas:', error);
    res.status(500).json({ error: 'Erro ao listar tentativas' });
  }
});

// Exportado sem listen(): o supertest exercita as rotas sem ocupar porta.
module.exports = { app, pool };
