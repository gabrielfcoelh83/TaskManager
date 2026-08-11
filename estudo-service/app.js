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
       RETURNING id, questao_id, correta, alternativa, tempo_seg, tipo, certeza, respondida_em`,
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
      `SELECT id, questao_id, correta, alternativa, tempo_seg, tipo, certeza, respondida_em
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

// ───────────────────────────────────────────────────────────────
// PATCH /tentativas/:id — feedback de como a pessoa chegou na resposta
// ───────────────────────────────────────────────────────────────
//
// Rota separada do POST porque o feedback é coletado depois: a tentativa é
// gravada no instante em que a alternativa é marcada, e só então o app
// pergunta "foi chute ou tinha certeza?". Mandar os dois juntos exigiria
// adiar a gravação até a segunda pergunta — e quem fechasse a aba no meio
// perderia a resposta inteira, em vez de só o feedback. Ver ADR-001.
const TIPO_MAX = 40;

app.patch('/tentativas/:id', verifyToken, async (req, res) => {
  // O id vai para uma coluna BIGSERIAL; um "abc" aqui viraria erro de
  // sintaxe do Postgres e sairia como 500, culpando o servidor por um
  // pedido malformado do cliente.
  if (!/^\d+$/.test(req.params.id)) {
    return res.status(400).json({ error: 'id deve ser um inteiro' });
  }

  const corpo = req.body || {};
  const temTipo = Object.prototype.hasOwnProperty.call(corpo, 'tipo');
  const temCerteza = Object.prototype.hasOwnProperty.call(corpo, 'certeza');

  // Ausência não é valor: corpo sem nenhum dos dois campos é engano do
  // cliente, e responder 200 a um UPDATE que não mudou nada esconderia o
  // engano. Mandar `null` explícito, esse sim, limpa o campo.
  if (!temTipo && !temCerteza) {
    return res.status(400).json({ error: 'informe tipo e/ou certeza' });
  }

  if (temTipo && corpo.tipo !== null) {
    if (typeof corpo.tipo !== 'string' || corpo.tipo.trim() === '') {
      return res.status(400).json({ error: 'tipo deve ser um texto não vazio ou null' });
    }
    if (corpo.tipo.length > TIPO_MAX) {
      return res.status(400).json({ error: `tipo deve ter no máximo ${TIPO_MAX} caracteres` });
    }
  }

  if (temCerteza && corpo.certeza !== null) {
    if (!Number.isInteger(corpo.certeza) || corpo.certeza < 0 || corpo.certeza > 100) {
      return res.status(400).json({ error: 'certeza deve ser um inteiro entre 0 e 100' });
    }
  }

  // SET montado a partir do que veio, para que atualizar só `certeza` não
  // apague o `tipo` já gravado — semântica de PATCH, não de PUT.
  const campos = [];
  const valores = [];
  if (temTipo) {
    valores.push(corpo.tipo === null ? null : corpo.tipo.trim());
    campos.push(`tipo = $${valores.length}`);
  }
  if (temCerteza) {
    valores.push(corpo.certeza);
    campos.push(`certeza = $${valores.length}`);
  }

  try {
    const { rows } = await pool.query(
      `UPDATE tentativas
          SET ${campos.join(', ')}
        WHERE id = $${valores.length + 1}
          AND user_id = $${valores.length + 2}
       RETURNING id, questao_id, correta, alternativa, tempo_seg, tipo, certeza, respondida_em`,
      [...valores, req.params.id, req.user.id]
    );

    // 404 e não 403 para tentativa de outro dono: o mesmo critério do
    // user-service. Um 403 confirmaria que aquele id existe, que é
    // justamente o que quem sonda a base quer descobrir.
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Tentativa não encontrada' });
    }

    res.json(rows[0]);
  } catch (error) {
    console.error('Erro ao atualizar feedback da tentativa:', error);
    res.status(500).json({ error: 'Erro ao atualizar tentativa' });
  }
});

// Exportado sem listen(): o supertest exercita as rotas sem ocupar porta.
module.exports = { app, pool };
