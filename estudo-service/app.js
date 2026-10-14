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
//
// `simulado_id` (opcional) liga a resposta a um simulado de prova real. Só
// entra em simulado aberto do próprio usuário: resposta depois de finalizar
// mudaria uma prova já corrigida.
//
// `origem` (opcional) diz de onde veio a resposta: 'quiz', 'simulado',
// 'revisao'. Sem lista fechada aqui (migration 007); só o formato é conferido.
// Com `simulado_id`, a origem é 'simulado' por definição: ausente, é
// preenchida; diferente, é 400. Sem essa amarra, a resposta da prova real
// gravada com origem nula seria tratada pela revisão como erro de estudo.
// 'simulado' sem `simulado_id` continua valendo: é o simulado sorteado.

// As mesmas colunas no POST, no GET e no PATCH: é um recurso só, e o front
// não deveria receber formatos diferentes dele conforme a rota.
const COLUNAS_TENTATIVA =
  'id, questao_id, correta, alternativa, tempo_seg, tipo, certeza, ' +
  'motivo, motivo_nota, simulado_id::int AS simulado_id, origem, respondida_em';

const ORIGEM_MAX = 20;

// Tetos dos tipos das colunas (`alternativa` smallint, `tempo_seg` int).
// Acima deles o Postgres recusa o INSERT, e o pedido malformado sairia como
// 500 do servidor em vez de 400.
const SMALLINT_MAX = 32767;
const INT_MAX = 2147483647;

// Ids de simulado chegam como número (JSON) ou texto só de dígitos (URL).
// O teto é o do `::int` com que as rotas os devolvem.
const ID_INT_MAX = 2147483647;

function lerIdInteiro(v) {
  let n = null;
  if (typeof v === 'number') n = v;
  else if (typeof v === 'string' && /^\d{1,10}$/.test(v)) n = Number(v);
  if (!Number.isInteger(n) || n < 1 || n > ID_INT_MAX) return null;
  return n;
}

app.post('/tentativas', verifyToken, async (req, res) => {
  const { questao_id, correta, alternativa, tempo_seg, simulado_id, origem } = req.body || {};

  // Validação explícita: `correta` é booleano e ausência é diferente de
  // false. Sem isso, um corpo malformado viraria "errou" silenciosamente
  // e contaminaria a taxa de acertos.
  if (questao_id === undefined || questao_id === null || String(questao_id).trim() === '') {
    return res.status(400).json({ error: 'questao_id é obrigatório' });
  }
  if (typeof correta !== 'boolean') {
    return res.status(400).json({ error: 'correta deve ser true ou false' });
  }
  if (alternativa !== undefined && alternativa !== null &&
      (!Number.isInteger(alternativa) || alternativa < 0 || alternativa > SMALLINT_MAX)) {
    return res.status(400).json({ error: `alternativa deve ser um inteiro entre 0 e ${SMALLINT_MAX}` });
  }
  if (tempo_seg !== undefined && tempo_seg !== null &&
      (!Number.isInteger(tempo_seg) || tempo_seg < 0 || tempo_seg > INT_MAX)) {
    return res.status(400).json({ error: `tempo_seg deve ser um inteiro entre 0 e ${INT_MAX}` });
  }
  let simuladoId = null;
  if (simulado_id !== undefined && simulado_id !== null) {
    simuladoId = lerIdInteiro(simulado_id);
    if (simuladoId === null) {
      return res.status(400).json({ error: 'simulado_id deve ser um inteiro positivo' });
    }
  }
  if (origem !== undefined && origem !== null &&
      (typeof origem !== 'string' || origem.trim() === '' || origem.trim().length > ORIGEM_MAX)) {
    return res.status(400).json({
      error: `origem deve ser um texto não vazio de até ${ORIGEM_MAX} caracteres ou null`,
    });
  }
  let origemParam = typeof origem === 'string' ? origem.trim() : null;
  if (simuladoId !== null) {
    if (origemParam !== null && origemParam !== 'simulado') {
      return res.status(400).json({ error: "com simulado_id, origem deve ser 'simulado' ou ausente" });
    }
    origemParam = 'simulado';
  }

  try {
    // A condição do simulado vai no próprio INSERT, e não num SELECT antes:
    // entre conferir e gravar, outra aba pode finalizar a prova, e a
    // resposta cairia num simulado já corrigido.
    //
    // O FOR SHARE é o que fecha essa janela. Sem ele, o EXISTS lê a foto de
    // antes de um UPDATE ainda não commitado e vê 'aberto'; e a FK não
    // segura nada, porque o FOR KEY SHARE dela não conflita com o UPDATE de
    // status. Com ele, o INSERT espera o encerramento terminar e reavalia a
    // linha já atualizada (status 'finalizado' → não grava → 409).
    //
    // Os casts são necessários porque, num INSERT ... SELECT, o Postgres não
    // infere o tipo do parâmetro pela coluna de destino.
    const { rows } = await pool.query(
      `INSERT INTO tentativas (user_id, questao_id, correta, alternativa, tempo_seg, simulado_id, origem)
       SELECT $1::int, $2::text, $3::boolean, $4::smallint, $5::int, $6::bigint, $7::text
        WHERE $6::bigint IS NULL
           OR EXISTS (SELECT 1 FROM simulados
                       WHERE id = $6::bigint AND user_id = $1::int AND status = 'aberto'
                         FOR SHARE)
       RETURNING ${COLUNAS_TENTATIVA}`,
      [
        req.user.id,
        String(questao_id),
        correta,
        alternativa ?? null,
        tempo_seg ?? null,
        simuladoId,
        origemParam,
      ]
    );

    if (rows.length === 0) {
      // Só o simulado barra o INSERT. 404 para o que não existe ou é de
      // outra pessoa (mesmo critério do PATCH); 409 para o que já encerrou.
      const { rows: sim } = await pool.query(
        'SELECT status FROM simulados WHERE id = $1 AND user_id = $2',
        [simuladoId, req.user.id]
      );
      if (sim.length === 0) {
        return res.status(404).json({ error: 'Simulado não encontrado' });
      }
      return res.status(409).json({ error: 'Simulado já encerrado' });
    }

    res.status(201).json(rows[0]);
  } catch (error) {
    console.error('Erro ao registrar tentativa:', error);
    res.status(500).json({ error: 'Erro ao registrar tentativa' });
  }
});

// `limite` e `offset` da query string, iguais em toda lista paginada.
// Devolve `{ erro }` (mensagem para o 400) ou `{ limite, offset }`.
function lerPaginacao({ limite, offset }, { padrao, max }) {
  let limiteParam = padrao;
  if (limite !== undefined && limite !== '') {
    const n = Number(limite);
    if (!Number.isInteger(n) || n < 1) {
      return { erro: 'limite deve ser um inteiro positivo' };
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
      return { erro: `offset deve ser inteiro entre 0 e ${Number.MAX_SAFE_INTEGER}` };
    }
    offsetParam = n;
  }

  return { limite: limiteParam, offset: offsetParam };
}

// ───────────────────────────────────────────────────────────────
// GET /tentativas?desde=ISO&limite=N&offset=N&paginado=1 — histórico do
// próprio usuário
// ───────────────────────────────────────────────────────────────
//
// O filtro `user_id = $1` vem do token, então não existe requisição capaz
// de ler tentativa alheia — o mesmo desenho de "autorização por dono" do
// task-service. Não há rota para buscar por id: a lista já é o recurso.
app.get('/tentativas', verifyToken, async (req, res) => {
  const { desde } = req.query;

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
  const pagina = lerPaginacao(req.query, { padrao: 500, max: 1000 });
  if (pagina.erro) return res.status(400).json({ error: pagina.erro });
  const { limite: limiteParam, offset: offsetParam } = pagina;

  const filtro = `user_id = $1 AND ($2::timestamptz IS NULL OR respondida_em >= $2)`;

  try {
    // `id DESC` desempata tentativas gravadas no mesmo instante. Sem ele a
    // ordem entre elas fica a critério do Postgres, que pode mudar de uma
    // consulta para a outra — e aí uma delas aparece em duas páginas e a
    // vizinha em nenhuma.
    const { rows: tentativas } = await pool.query(
      `SELECT ${COLUNAS_TENTATIVA}
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
//
// O motivo do erro (Caderno de Erros) chega pelo mesmo caminho, e ainda mais
// tarde: é anotado na revisão, às vezes dias depois. Todos os campos de texto
// seguem a mesma regra — texto não vazio, aparado, com teto, ou null.
const CAMPOS_DE_TEXTO = [
  ['tipo', 40],
  ['motivo', 40],
  ['motivo_nota', 280],
];

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
  const tem = (campo) => Object.prototype.hasOwnProperty.call(corpo, campo);

  // Ausência não é valor: corpo sem nenhum dos campos é engano do cliente, e
  // responder 200 a um UPDATE que não mudou nada esconderia o engano. Mandar
  // `null` explícito, esse sim, limpa o campo.
  if (!tem('certeza') && !CAMPOS_DE_TEXTO.some(([campo]) => tem(campo))) {
    return res.status(400).json({ error: 'informe tipo, certeza, motivo e/ou motivo_nota' });
  }

  // SET montado a partir do que veio, para que atualizar só `certeza` não
  // apague o `tipo` já gravado — semântica de PATCH, não de PUT.
  const campos = [];
  const valores = [];

  for (const [campo, max] of CAMPOS_DE_TEXTO) {
    if (!tem(campo)) continue;
    const valor = corpo[campo];
    if (valor !== null) {
      if (typeof valor !== 'string' || valor.trim() === '') {
        return res.status(400).json({ error: `${campo} deve ser um texto não vazio ou null` });
      }
      // Mede o que vai ser gravado, e não o que chegou: quem grava usa
      // `.trim()`, então validar antes recusaria um valor de 40 caracteres
      // por causa de espaço de sobra, com uma mensagem que engana.
      if (valor.trim().length > max) {
        return res.status(400).json({ error: `${campo} deve ter no máximo ${max} caracteres` });
      }
    }
    valores.push(valor === null ? null : valor.trim());
    campos.push(`${campo} = $${valores.length}`);
  }

  if (tem('certeza')) {
    if (corpo.certeza !== null &&
        (!Number.isInteger(corpo.certeza) || corpo.certeza < 0 || corpo.certeza > 100)) {
      return res.status(400).json({ error: 'certeza deve ser um inteiro entre 0 e 100' });
    }
    valores.push(corpo.certeza);
    campos.push(`certeza = $${valores.length}`);
  }

  try {
    const { rows } = await pool.query(
      `UPDATE tentativas
          SET ${campos.join(', ')}
        WHERE id = $${valores.length + 1}
          AND user_id = $${valores.length + 2}
       RETURNING ${COLUNAS_TENTATIVA}`,
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

const ehObjeto = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// questoes_discursivas.id é BIGSERIAL, mas o questoes-service devolve o id
// como int. Aceitar além disso gravaria um id que nenhuma questão pode ter —
// a mesma regra dos ids de simulado.
const lerQuestaoId = lerIdInteiro;

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

// ═══════════════════════════════════════════════════════════════
// Simulados de prova real
// ═══════════════════════════════════════════════════════════════
//
// Um simulado é um exame inteiro (80 questões, 5 horas), aberto aqui,
// respondido por POST /tentativas com `simulado_id` e encerrado por
// /finalizar ou /abandonar. As questões em si vêm do questoes-service: este
// serviço só registra a prova e o resultado.

const QUESTOES_DA_PROVA = 80;
// Passar das 5 horas não bloqueia: o simulado sai marcado `fora_do_tempo`,
// e a pessoa vê que a nota não foi feita nas condições da prova.
const DURACAO_DA_PROVA_SEG = 5 * 60 * 60;

const COLUNAS_SIMULADO = `
  id::int AS id, exame, tipo, status, refeito, iniciado_em, finalizado_em,
  acertos, anuladas,
  CASE WHEN status = 'finalizado' THEN acertos + anuladas END AS nota,
  EXTRACT(EPOCH FROM finalizado_em - iniciado_em)::int AS duracao_seg,
  CASE WHEN status = 'finalizado'
       THEN (finalizado_em - iniciado_em) > make_interval(secs => ${DURACAO_DA_PROVA_SEG})
  END AS fora_do_tempo
`;

function lerInteiroNaFaixa(v, min, max) {
  return Number.isInteger(v) && v >= min && v <= max ? v : null;
}

// ───────────────────────────────────────────────────────────────
// POST /simulados — abre um simulado { exame, tipo }
// ───────────────────────────────────────────────────────────────
app.post('/simulados', verifyToken, async (req, res) => {
  const corpo = req.body || {};
  const exame = lerInteiroNaFaixa(corpo.exame, 1, 32767);
  const tipo = lerInteiroNaFaixa(corpo.tipo, 1, 4);
  if (exame === null) {
    return res.status(400).json({ error: 'exame deve ser um inteiro positivo' });
  }
  if (tipo === null) {
    return res.status(400).json({ error: 'tipo deve ser um inteiro entre 1 e 4' });
  }

  try {
    // `refeito` olha o exame e ignora o tipo: os tipos são a mesma prova
    // embaralhada, então quem fez o tipo 1 já viu as questões do tipo 2.
    // Simulado abandonado só conta se a pessoa chegou a responder alguma
    // questão — abrir por engano e desistir não viu prova nenhuma.
    //
    // Limite conhecido: questões do mesmo exame respondidas no quiz não
    // marcam o simulado como refeito. Este serviço não sabe de que exame é
    // cada questão; isso mora no questoes_db.
    const { rows } = await pool.query(
      `INSERT INTO simulados (user_id, exame, tipo, refeito)
       VALUES ($1, $2, $3, EXISTS (
         SELECT 1 FROM simulados s
          WHERE s.user_id = $1 AND s.exame = $2
            AND (s.status = 'finalizado'
                 OR EXISTS (SELECT 1 FROM tentativas t WHERE t.simulado_id = s.id))
       ))
       RETURNING ${COLUNAS_SIMULADO}`,
      [req.user.id, exame, tipo]
    );
    res.status(201).json(rows[0]);
  } catch (error) {
    // O índice único parcial é quem garante um aberto por pessoa. O id do
    // aberto vai na resposta para o front oferecer "continuar" em vez de
    // só dizer não.
    //
    // O `.catch` não é enfeite: um erro lançado aqui dentro escaparia do
    // handler, e o Express 4 não trata rejeição de função async.
    if (error.code === '23505') {
      const { rows } = await pool
        .query(`SELECT id::int AS id FROM simulados WHERE user_id = $1 AND status = 'aberto'`, [
          req.user.id,
        ])
        .catch(() => ({ rows: [] }));
      return res.status(409).json({
        error: 'Já existe um simulado aberto',
        simulado_id: rows[0]?.id ?? null,
      });
    }
    console.error('Erro ao abrir simulado:', error);
    res.status(500).json({ error: 'Erro ao abrir simulado' });
  }
});

// ───────────────────────────────────────────────────────────────
// GET /simulados?limite=N&offset=N&paginado=1 — histórico do próprio
// usuário, mais recente primeiro
// ───────────────────────────────────────────────────────────────
//
// Mesmo formato de /tentativas: array puro por padrão; `paginado=1` devolve
// `{ simulados, total, limite, offset }`, para o front saber se a curva de
// evolução foi calculada sobre o histórico inteiro ou sobre um pedaço.
app.get('/simulados', verifyToken, async (req, res) => {
  // Teto como em /discursivas/respostas: 200 simulados de 5 horas são
  // anos de estudo.
  const pagina = lerPaginacao(req.query, { padrao: LISTA_MAX, max: LISTA_MAX });
  if (pagina.erro) return res.status(400).json({ error: pagina.erro });

  try {
    const { rows: simulados } = await pool.query(
      `SELECT ${COLUNAS_SIMULADO}
         FROM simulados
        WHERE user_id = $1
        ORDER BY iniciado_em DESC, id DESC
        LIMIT $2 OFFSET $3`,
      [req.user.id, pagina.limite, pagina.offset]
    );
    if (req.query.paginado !== '1') return res.json(simulados);

    const contagem = await pool.query(
      'SELECT COUNT(*)::int AS total FROM simulados WHERE user_id = $1',
      [req.user.id]
    );
    res.json({
      simulados,
      total: contagem.rows[0].total,
      limite: pagina.limite,
      offset: pagina.offset,
    });
  } catch (error) {
    console.error('Erro ao listar simulados:', error);
    res.status(500).json({ error: 'Erro ao listar simulados' });
  }
});

// Encerra um simulado aberto. A condição `status = 'aberto'` fica no UPDATE
// para que dois encerramentos simultâneos não gravem os dois.
async function encerrarSimulado(req, res, { status, acertos = null, anuladas = null }) {
  const id = lerIdInteiro(req.params.id);
  if (id === null) {
    return res.status(400).json({ error: 'id deve ser um inteiro positivo' });
  }

  try {
    const { rows } = await pool.query(
      `UPDATE simulados
          SET status = $1, finalizado_em = NOW(), acertos = $2, anuladas = $3
        WHERE id = $4 AND user_id = $5 AND status = 'aberto'
       RETURNING ${COLUNAS_SIMULADO}`,
      [status, acertos, anuladas, id, req.user.id]
    );
    if (rows.length > 0) return res.json(rows[0]);

    // 404 para o que não existe ou é de outra pessoa (não confirma que o
    // id existe); 409 para o que já foi encerrado.
    const { rows: existe } = await pool.query(
      'SELECT 1 FROM simulados WHERE id = $1 AND user_id = $2',
      [id, req.user.id]
    );
    if (existe.length === 0) {
      return res.status(404).json({ error: 'Simulado não encontrado' });
    }
    return res.status(409).json({ error: 'Simulado já encerrado' });
  } catch (error) {
    console.error('Erro ao encerrar simulado:', error);
    res.status(500).json({ error: 'Erro ao encerrar simulado' });
  }
}

// ───────────────────────────────────────────────────────────────
// POST /simulados/:id/finalizar — { acertos, anuladas }
// ───────────────────────────────────────────────────────────────
//
// O resultado vem do front, que tem o gabarito: gabarito e anulação moram no
// questoes_db, e este serviço não os conhece. Na prática a pessoa pode
// declarar a nota que quiser — e engana só a si mesma, porque não existe
// ranking entre alunos. No dia em que existir, esta rota precisa corrigir
// a prova consultando o questoes-service.
app.post('/simulados/:id/finalizar', verifyToken, async (req, res) => {
  const corpo = req.body || {};
  const acertos = lerInteiroNaFaixa(corpo.acertos, 0, QUESTOES_DA_PROVA);
  const anuladas = lerInteiroNaFaixa(corpo.anuladas, 0, QUESTOES_DA_PROVA);
  if (acertos === null || anuladas === null) {
    return res.status(400).json({
      error: `acertos e anuladas devem ser inteiros entre 0 e ${QUESTOES_DA_PROVA}`,
    });
  }
  if (acertos + anuladas > QUESTOES_DA_PROVA) {
    return res.status(400).json({
      error: `acertos + anuladas não pode passar de ${QUESTOES_DA_PROVA}`,
    });
  }
  return encerrarSimulado(req, res, { status: 'finalizado', acertos, anuladas });
});

// ───────────────────────────────────────────────────────────────
// POST /simulados/:id/abandonar — encerra sem nota
// ───────────────────────────────────────────────────────────────
//
// Sem esta saída, um simulado esquecido aberto travaria o próximo para
// sempre (um aberto por pessoa). As tentativas já gravadas ficam: continuam
// valendo para o Caderno de Erros e as Revisões.
app.post('/simulados/:id/abandonar', verifyToken, (req, res) =>
  encerrarSimulado(req, res, { status: 'abandonado' })
);

// Exportado sem listen(): o supertest exercita as rotas sem ocupar porta.
module.exports = { app, pool };
