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
// GET /tentativas?desde=ISO&limite=N&offset=N&paginado=1 — histórico do
// próprio usuário
// ───────────────────────────────────────────────────────────────
//
// O filtro `user_id = $1` vem do token, então não existe requisição capaz
// de ler tentativa alheia — o mesmo desenho de "autorização por dono" do
// task-service. Não há rota para buscar por id: a lista já é o recurso.
app.get('/tentativas', verifyToken, async (req, res) => {
  const { desde, limite, offset } = req.query;

  // O teto de 1000 existia sem saída: quem passava dele recebia as 1000 mais
  // recentes como se fossem o histórico inteiro, e o front calculava meta,
  // sequência e revisão sobre uma lista cortada sem saber. Paginar é a saída.
  //
  // O formato segue o de /questoes, e pelo mesmo motivo: o array puro continua
  // sendo o padrão, porque o front publicado faz `(linhas || [])` e morreria
  // com um objeto. Quem quer paginar pede `paginado=1` e recebe
  // `{ tentativas, total, limite, offset }`.
  const paginado = req.query.paginado === '1';

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

  let offsetParam = 0;
  if (offset !== undefined && offset !== '') {
    const n = Number(offset);
    // Mesmo cuidado do id no PATCH, com outro teto: `offset=1e20` é inteiro
    // para o JS, mas o driver o manda como "100000000000000000000", que
    // estoura o bigint, e o pedido malformado sairia como 500 do servidor.
    // Aqui o teto é o maior inteiro que o JS representa sem perder precisão —
    // abaixo dele, o número chega ao Postgres exatamente como foi pedido.
    if (!Number.isInteger(n) || n < 0 || n > Number.MAX_SAFE_INTEGER) {
      return res.status(400).json({
        error: `offset deve ser inteiro entre 0 e ${Number.MAX_SAFE_INTEGER}`,
      });
    }
    offsetParam = n;
  }

  const filtro = `user_id = $1 AND ($2::timestamptz IS NULL OR respondida_em >= $2)`;

  try {
    // `id DESC` desempata tentativas gravadas no mesmo instante. Sem ele a
    // ordem entre elas fica a critério do Postgres, que pode mudar de uma
    // consulta para a outra — e aí uma delas aparece em duas páginas e a
    // vizinha em nenhuma.
    const { rows: tentativas } = await pool.query(
      `SELECT id, questao_id, correta, alternativa, tempo_seg, tipo, certeza, respondida_em
         FROM tentativas
        WHERE ${filtro}
        ORDER BY respondida_em DESC, id DESC
        LIMIT $3 OFFSET $4`,
      [req.user.id, desdeParam, limiteParam, offsetParam]
    );

    if (!paginado) return res.json(tentativas);

    // O total vem de uma contagem própria, e só para quem pede `paginado=1`.
    // `COUNT(*) OVER()` na consulta acima faria o mesmo numa ida só, mas a
    // janela obriga o Postgres a ler o histórico inteiro antes da primeira
    // linha: o LIMIT deixa de parar cedo, e até o front antigo — que não quer
    // total nenhum — pagaria isso a cada abertura do dashboard. Sem o total, o
    // cliente não distingue "acabou" de "bateu no teto".
    const contagem = await pool.query(
      `SELECT COUNT(*)::int AS total FROM tentativas WHERE ${filtro}`,
      [req.user.id, desdeParam]
    );

    res.json({
      tentativas,
      total: contagem.rows[0].total,
      limite: limiteParam,
      offset: offsetParam,
    });
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
  //
  // O teto de 18 dígitos é a segunda metade da mesma guarda: "só dígitos"
  // não impede 99999999999999999999999, que estoura o bigint e produz
  // exatamente o mesmo 500 pelo mesmo motivo. 18 dígitos cabem sempre
  // (bigint vai até 9.22e18), e um id real nunca chega perto disso.
  if (!/^\d{1,18}$/.test(req.params.id)) {
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
    // Mede o que vai ser gravado, e não o que chegou: quem grava usa
    // `.trim()`, então validar antes recusaria um valor de 40 caracteres
    // por causa de espaço de sobra, com uma mensagem que engana.
    if (corpo.tipo.trim().length > TIPO_MAX) {
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

// ═══════════════════════════════════════════════════════════════
// Respostas às discursivas da 2ª fase
// ═══════════════════════════════════════════════════════════════
//
// Mesmo desenho de /tentativas: user_id vem do token, a lista é do próprio
// usuário, e não existe caminho para ler ou gravar em nome de outra pessoa.

// Texto de um item. A folha de resposta da FGV tem 30 linhas por questão;
// 6000 caracteres cobre isso com folga e barra quem cola um livro.
const RESPOSTA_MAX = 6000;
const FUNDAMENTOS_MAX = 1000;
const LISTA_MAX = 200;
// questoes_discursivas.id é BIGSERIAL, mas o questoes-service devolve o id
// como int. Aceitar além disso gravaria um id que nenhuma questão pode ter.
const QUESTAO_ID_MAX = 2147483647;

const ehObjeto = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// Número inteiro, ou texto só de dígitos (o id chega como texto quando vem
// de uma URL). Devolve null se não for um id válido.
function lerQuestaoId(v) {
  let n = null;
  if (typeof v === 'number') n = v;
  else if (typeof v === 'string' && /^\d{1,10}$/.test(v)) n = Number(v);
  if (!Number.isInteger(n) || n < 1 || n > QUESTAO_ID_MAX) return null;
  return n;
}

const COLUNAS_RESPOSTA =
  'id::int AS id, questao_id::int AS questao_id, respostas, fundamentos, criada_em';

// ───────────────────────────────────────────────────────────────
// POST /discursivas/respostas
// ───────────────────────────────────────────────────────────────
app.post('/discursivas/respostas', verifyToken, async (req, res) => {
  const corpo = req.body || {};

  const questaoId = lerQuestaoId(corpo.questao_id);
  if (questaoId === null) {
    return res.status(400).json({ error: 'questao_id deve ser um inteiro positivo' });
  }

  const { respostas } = corpo;
  if (!ehObjeto(respostas)) {
    return res.status(400).json({ error: 'respostas deve ser um objeto {"A": "texto", ...}' });
  }
  const letras = Object.keys(respostas);
  if (letras.length === 0) {
    return res.status(400).json({ error: 'respostas está vazio' });
  }
  for (const letra of letras) {
    if (!/^[A-E]$/.test(letra)) {
      return res.status(400).json({ error: `item "${letra}" inválido: use letras de A a E` });
    }
    if (typeof respostas[letra] !== 'string') {
      return res.status(400).json({ error: `resposta do item ${letra} deve ser texto` });
    }
    if (respostas[letra].length > RESPOSTA_MAX) {
      return res.status(400).json({
        error: `resposta do item ${letra} passa de ${RESPOSTA_MAX} caracteres`,
      });
    }
  }
  // Tudo em branco não é resposta: gravar criaria uma "tentativa" que o
  // histórico mostraria como se a pessoa tivesse feito a questão.
  if (letras.every((l) => respostas[l].trim() === '')) {
    return res.status(400).json({ error: 'responda ao menos um item' });
  }

  let fundamentos = null;
  if (corpo.fundamentos !== undefined && corpo.fundamentos !== null) {
    const f = corpo.fundamentos;
    const inteiroValido = (n) => Number.isInteger(n) && n >= 0 && n <= FUNDAMENTOS_MAX;
    if (!ehObjeto(f) || !inteiroValido(f.citados) || !inteiroValido(f.esperados) ||
        Object.keys(f).length !== 2) {
      return res.status(400).json({
        error: `fundamentos deve ser {citados, esperados}, inteiros de 0 a ${FUNDAMENTOS_MAX}`,
      });
    }
    // Só os dois campos conhecidos são gravados.
    fundamentos = { citados: f.citados, esperados: f.esperados };
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO respostas_discursivas (user_id, questao_id, respostas, fundamentos)
       VALUES ($1, $2, $3, $4)
       RETURNING ${COLUNAS_RESPOSTA}`,
      [
        req.user.id,
        questaoId,
        JSON.stringify(respostas),
        fundamentos === null ? null : JSON.stringify(fundamentos),
      ]
    );
    res.status(201).json(rows[0]);
  } catch (error) {
    console.error('Erro ao salvar resposta discursiva:', error);
    res.status(500).json({ error: 'Erro ao salvar resposta' });
  }
});

// ───────────────────────────────────────────────────────────────
// GET /discursivas/respostas?questao_id=N — histórico do próprio usuário
// ───────────────────────────────────────────────────────────────
app.get('/discursivas/respostas', verifyToken, async (req, res) => {
  let questaoId = null;
  if (req.query.questao_id !== undefined && req.query.questao_id !== '') {
    questaoId = lerQuestaoId(req.query.questao_id);
    if (questaoId === null) {
      return res.status(400).json({ error: 'questao_id deve ser um inteiro positivo' });
    }
  }

  try {
    // `id DESC` desempata respostas gravadas no mesmo instante, como em
    // /tentativas. O teto existe para não devolver a base inteira num
    // descuido; 200 respostas discursivas são meses de estudo.
    const { rows } = await pool.query(
      `SELECT ${COLUNAS_RESPOSTA}
         FROM respostas_discursivas
        WHERE user_id = $1
          AND ($2::bigint IS NULL OR questao_id = $2)
        ORDER BY criada_em DESC, id DESC
        LIMIT ${LISTA_MAX}`,
      [req.user.id, questaoId]
    );
    res.json(rows);
  } catch (error) {
    console.error('Erro ao listar respostas discursivas:', error);
    res.status(500).json({ error: 'Erro ao listar respostas' });
  }
});

// Exportado sem listen(): o supertest exercita as rotas sem ocupar porta.
module.exports = { app, pool };
