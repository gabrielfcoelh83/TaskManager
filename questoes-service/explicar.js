// Escreve a EXPLICAÇÃO das questões objetivas a partir do GABARITO OFICIAL.
//
//   node explicar.js                         # mostra o que faria, não grava
//   node explicar.js --aplicar               # grava
//   node explicar.js --exame 45 --lote 3 --total 30 --aplicar
//   node explicar.js --refazer-ia --aplicar  # reescreve também as que já são 'ia'
//
// O MODELO EXPLICA A RESPOSTA, NÃO A ESCOLHE
// Gabarito é fato da FGV (migrations/001_baseline.sql). O modelo recebe a
// letra oficial pronta e só justifica: por que ela está certa e por que cada
// uma das outras está errada. Ele não vê coluna nenhuma para alterar — o
// UPDATE escreve `explicacao`, `explicacao_fonte = 'ia'` e `revisada = false`,
// e mais nada.
//
// Mesmo assim o modelo pode DISCORDAR do gabarito, e é aí que mora o perigo:
// pedido para justificar uma letra que acha errada, um modelo costuma
// inventar a justificativa — e uma explicação convincente de uma resposta que
// ele não entendeu ensina pior que explicação nenhuma. Por isso ele devolve,
// junto do texto, a letra que considera correta, e o prompt diz que pode
// discordar. Letra diferente da oficial = explicação recusada, sem gravar.
// Pelo mesmo motivo, um texto que AFIRMA outra letra como correta também é
// recusado (ver `letraAfirmadaNoTexto`).
//
// ANULADAS FICAM DE FORA
// A FGV anula quando a questão tem duas respostas, nenhuma, ou erro no
// enunciado. O `gabarito` dessas linhas é o da prova antes da anulação — não
// existe resposta oficial a explicar, e explicar aquela letra seria
// justamente ensinar como certa uma resposta que a própria banca retirou. Elas
// nem entram na fila, nem no UPDATE (que repete `anulada = FALSE` para o caso
// de a anulação chegar no meio da rodada).
//
// 'humano' NUNCA É TOCADO
// Nem com --refazer-ia. A fila exclui, e o UPDATE repete a condição: se uma
// pessoa escrever a explicação entre a leitura e a gravação, o texto do
// modelo é descartado.
//
// Roda à mão, fora do serviço, pelos mesmos motivos do classificar.js.
//
// COTA: o plano gratuito da OpenRouter dá 50 pedidos/dia por chave, e o modo
// de conferência GASTA a cota igual ao --aplicar (ele chama o modelo; só não
// grava). Cada lote é um pedido quando dá certo e até MAX_TENTATIVAS (4) quando
// os modelos falham em sequência.

const { pool } = require('./app');
const { migrate } = require('./migrate');
const { modelosEmOrdem } = require('./openrouter');

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

// Mesma lógica do classificar.js: preferência, conferida contra a listagem
// da OpenRouter antes de usar (openrouter.js); IA_MODELOS substitui.
const PREFERIDOS = [
  'nvidia/nemotron-3-ultra-550b-a55b:free',
  'google/gemma-4-31b-it:free',
  'qwen/qwen3.8-27b:free',
];

const LETRAS = ['A', 'B', 'C', 'D'];

// Lote padrão: 3 questões por pedido.
//
// O equilíbrio é entre a cota e o que se perde quando um lote falha. Lote
// grande economiza pedido (80 questões em lotes de 10 = 8 pedidos; em lotes de
// 3 = 27), mas cada explicação tem ~150 palavras, ~300–400 tokens de saída já
// com o escape do JSON. Dez delas passam de 3.500 tokens numa única string
// JSON, e é na saída longa que os modelos gratuitos cortam a resposta no meio
// ou esquecem uma aspa. JSON quebrado derruba o lote INTEIRO — e o pedido já
// foi cobrado da cota. Com 3, uma resposta ruim custa um pedido e três
// questões, que voltam na próxima rodada; a saída cabe com folga em
// MAX_TOKENS.
const LOTE_PADRAO = 3;

// 30 questões = 10 pedidos no caso bom, 40 no pior (4 modelos por lote).
// Deixa cota para outra rodada no mesmo dia; para mais, --total.
const TOTAL_PADRAO = 30;

const MAX_TOKENS = 4096;

// Explicação sem resposta em 90s é modelo travado; o pedido seguinte vai para
// o próximo modelo da lista em vez de prender a rodada.
const TIMEOUT_MS = 90 * 1000;

// Validação do texto. O alvo do prompt é 120–200 palavras; a faixa aceita é
// mais larga para não recusar uma explicação boa por 10 palavras, mas fecha
// os dois defeitos reais: resposta vazia/"Ver gabarito" (curta demais) e
// texto que desandou, repetindo-se até o teto de tokens (longo demais).
const MIN_PALAVRAS = 50;
const MAX_PALAVRAS = 400;
const MAX_CARACTERES = 3500;

const PROMPT_SISTEMA = `Você é professor de cursinho preparatório para o Exame de Ordem da OAB.
Sua tarefa é EXPLICAR o gabarito oficial da FGV de questões objetivas.

Para cada questão você recebe o enunciado, as alternativas A, B, C e D e a
letra correta segundo o gabarito oficial. Escreva uma explicação que:
- diga por que a alternativa correta está certa;
- diga, uma a uma, por que cada uma das outras três está errada;
- cite o dispositivo legal, a súmula ou o entendimento jurisprudencial que
  fundamenta a resposta QUANDO VOCÊ TIVER CERTEZA dele.

NÃO INVENTE NÚMERO DE ARTIGO, PARÁGRAFO, INCISO OU SÚMULA. Na dúvida sobre o
número, explique a regra sem citar número ("o Código Civil prevê que...").
Uma citação errada é pior do que nenhuma: o aluno vai decorá-la.

Estilo: português do Brasil, tom de professor de cursinho, direto e
didático. Entre 120 e 200 palavras por questão. Texto corrido, sem
markdown (sem **, sem #, sem listas, sem blocos de código).

Se, depois de analisar, você concluir que a alternativa correta NÃO é a do
gabarito oficial, não tente justificar a letra oficial: devolva em "correta"
a letra que você considera certa e "explicacao": null. Isso é aceitável e
preferível a uma justificativa forçada.

Responda APENAS com JSON válido, sem markdown e sem comentários.`;

function montarPrompt(questoes) {
  const itens = questoes.map((q) => ({
    id: q.id,
    ...(q.disciplina ? { disciplina: q.disciplina } : {}),
    ...(q.tema ? { tema: q.tema } : {}),
    // Enunciado inteiro, ao contrário do classificar.js: lá o começo bastava
    // para achar a matéria; aqui o detalhe do caso é o que decide a resposta.
    enunciado: String(q.enunciado),
    alternativas: Object.fromEntries(
      q.alternativas.map((texto, i) => [LETRAS[i], String(texto)])
    ),
    gabarito_oficial: LETRAS[q.gabarito],
  }));

  return `Explique o gabarito oficial destas ${questoes.length} questões.

${JSON.stringify(itens, null, 2)}

Responda com uma lista JSON, um objeto por questão, no formato:
[{"id": 123, "correta": "C", "explicacao": "A alternativa C está correta porque..."}]`;
}

// Procura no texto uma afirmação explícita de qual alternativa é a correta
// ("a alternativa correta é a B", "resposta correta: letra D"). A letra é
// maiúscula de propósito: com caixa livre, "a correta é a afirmação" leria o
// artigo "a" como alternativa A.
const AFIRMA_CORRETA =
  /(?:[Rr]esposta|[Aa]lternativa|[Ll]etra|[Gg]abarito)\s+(?:correta|certa)\s*(?:é|e|:)?\s*(?:a\s+)?(?:letra\s+|alternativa\s+)?\(?([A-D])\b/g;

function letraAfirmadaNoTexto(texto) {
  const letras = new Set();
  for (const m of texto.matchAll(AFIRMA_CORRETA)) letras.add(m[1]);
  return [...letras];
}

// Motivo da recusa do texto, ou null se passa.
function problemaNoTexto(texto, letraOficial) {
  if (texto.includes('```')) return 'texto com cerca de markdown';
  if (texto.length > MAX_CARACTERES) return `texto longo demais (${texto.length} caracteres)`;
  const palavras = texto.split(/\s+/).filter(Boolean).length;
  if (palavras < MIN_PALAVRAS) return `texto curto demais (${palavras} palavras)`;
  if (palavras > MAX_PALAVRAS) return `texto longo demais (${palavras} palavras)`;
  const outras = letraAfirmadaNoTexto(texto).filter((l) => l !== letraOficial);
  if (outras.length > 0) return `texto afirma outra alternativa como correta (${outras.join(', ')})`;
  return null;
}

// Separada da rede: é o que decide o que entra no banco.
function interpretarResposta(texto, questoes) {
  const porId = new Map(questoes.map((q) => [q.id, q]));

  const limpo = String(texto || '').trim();
  // Do primeiro '[' ao último ']': ignora cerca ```json em volta da resposta
  // e um eventual envelope {"questoes": [...]}. Não se apaga ``` no meio do
  // texto — se houver cerca DENTRO de uma explicação, ela deve ser recusada,
  // não limpa em silêncio.
  const inicio = limpo.indexOf('[');
  const fim = limpo.lastIndexOf(']');
  if (inicio === -1 || fim === -1 || fim < inicio) {
    throw new Error('resposta do modelo não contém lista JSON');
  }

  const bruto = JSON.parse(limpo.slice(inicio, fim + 1));
  if (!Array.isArray(bruto)) throw new Error('resposta do modelo não é uma lista');

  const aceitas = [];
  const recusadas = [];
  const vistas = new Set();

  for (const item of bruto) {
    const id = Number(item?.id);
    const q = porId.get(id);

    if (!q) {
      recusadas.push({ id: item?.id, motivo: 'id fora do lote' });
      continue;
    }
    // Duas respostas para a mesma questão: não há como saber qual vale.
    if (vistas.has(id)) {
      recusadas.push({ id, motivo: 'id repetido na resposta' });
      const i = aceitas.findIndex((a) => a.id === id);
      if (i !== -1) aceitas.splice(i, 1);
      continue;
    }
    vistas.add(id);

    const oficial = LETRAS[q.gabarito];
    const letra = String(item.correta ?? '').trim().toUpperCase().replace(/[^A-D]/g, '');

    // A GUARDA ANTI-ALUCINAÇÃO. Sem letra, ou com letra diferente da
    // oficial, o modelo não demonstrou que concorda com o gabarito — e não
    // explica o que não aceita.
    if (letra.length !== 1) {
      recusadas.push({ id, motivo: `modelo não informou a letra correta (${JSON.stringify(item.correta ?? null)})` });
      continue;
    }
    if (letra !== oficial) {
      recusadas.push({ id, motivo: `modelo discorda do gabarito (disse ${letra}, oficial ${oficial})` });
      continue;
    }

    if (typeof item.explicacao !== 'string' || !item.explicacao.trim()) {
      recusadas.push({ id, motivo: 'explicação vazia' });
      continue;
    }

    const explicacao = item.explicacao.trim();
    const problema = problemaNoTexto(explicacao, oficial);
    if (problema) {
      recusadas.push({ id, motivo: problema });
      continue;
    }

    aceitas.push({ id, explicacao });
  }

  // Questão do lote sem resposta nenhuma: entra no resumo, senão some sem
  // rastro e parece que o modelo explicou tudo.
  for (const q of questoes) {
    if (!vistas.has(q.id)) recusadas.push({ id: q.id, motivo: 'modelo não respondeu esta questão' });
  }

  return { aceitas, recusadas };
}

async function chamarOpenRouter(prompt, { chave, modelos } = {}) {
  if (!chave) throw new Error('OPENROUTER_API_KEY não definida');

  const ordem = modelos || (await modelosEmOrdem(PREFERIDOS));
  if (ordem.length === 0) throw new Error('a OpenRouter não lista nenhum modelo gratuito');

  let ultimoErro = null;
  let todos429 = true;

  for (const modelo of ordem) {
    try {
      const res = await fetch(OPENROUTER_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${chave}`,
          'Content-Type': 'application/json',
          'X-Title': 'MA Questoes - explicacao',
        },
        body: JSON.stringify({
          model: modelo,
          messages: [
            { role: 'system', content: PROMPT_SISTEMA },
            { role: 'user', content: prompt },
          ],
          // Baixa, não zero: texto corrido sai menos robótico com um pouco de
          // variação, e o que importa (a letra) é conferido de qualquer jeito.
          temperature: 0.2,
          max_tokens: MAX_TOKENS,
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      if (res.status !== 429) todos429 = false;
      if (!res.ok) {
        ultimoErro = new Error(`${modelo}: HTTP ${res.status}`);
        continue;
      }

      const dados = await res.json();
      const conteudo = dados?.choices?.[0]?.message?.content;
      if (!conteudo) {
        ultimoErro = new Error(`${modelo}: resposta sem conteúdo`);
        continue;
      }

      return { conteudo, modelo };
    } catch (err) {
      todos429 = false;
      ultimoErro = err;
    }
  }

  const erro = ultimoErro || new Error('nenhum modelo respondeu');
  // Todos os modelos em 429 é, quase sempre, a cota diária da CHAVE — não de
  // um modelo. Seguir para o próximo lote só gastaria mais 4 pedidos negados.
  if (todos429) erro.cotaEsgotada = true;
  throw erro;
}

async function buscarPendentes(cliente, { exame, limite, refazerIa, ignorar = [] }) {
  const valores = [];

  // Anuladas e 'humano' ficam de fora em qualquer modo. A fila normal é
  // "sem explicação" (string em branco conta como sem); --refazer-ia soma as
  // escritas por modelo e ainda não revisadas — uma 'ia' com revisada = true
  // foi conferida por alguém, e reescrevê-la jogaria fora essa conferência.
  const vazia = `(explicacao IS NULL OR btrim(explicacao) = '')`;
  const condicoes = [
    'anulada = FALSE',
    `explicacao_fonte IS DISTINCT FROM 'humano'`,
    refazerIa ? `(${vazia} OR (explicacao_fonte = 'ia' AND revisada = FALSE))` : vazia,
  ];

  if (exame != null) {
    valores.push(exame);
    condicoes.push(`exame = $${valores.length}`);
  }

  // Já tentadas nesta rodada saem da busca — como no classificar.js, é o
  // que impede um lote recusado (que continua pendente) de voltar em laço.
  if (ignorar.length > 0) {
    valores.push(ignorar);
    condicoes.push(`id <> ALL($${valores.length}::bigint[])`);
  }

  valores.push(limite);

  const { rows } = await cliente.query(
    `SELECT id, exame, numero, enunciado, alternativas, gabarito, disciplina, tema
       FROM questoes
      WHERE ${condicoes.join(' AND ')}
      ORDER BY exame DESC, tipo_prova ASC, numero ASC
      LIMIT $${valores.length}`,
    valores
  );

  // id: BIGSERIAL chega como string do `pg` (ver classificar.js).
  return rows.map((r) => ({ ...r, id: Number(r.id), gabarito: Number(r.gabarito) }));
}

async function gravar(cliente, aceitas, pendentes, { refazerIa }) {
  const porId = new Map(pendentes.map((q) => [q.id, q]));
  let gravadas = 0;

  for (const item of aceitas) {
    const q = porId.get(item.id);

    // O WHERE repete a leitura, porque entre ela e esta escrita a linha pode
    // ter mudado:
    //  - uma pessoa escreveu a explicação  → fonte 'humano', não sobrescreve;
    //  - outra rodada gravou primeiro      → já não está vazia (modo normal);
    //  - a FGV anulou ou trocou o gabarito → o texto explica uma resposta
    //    que não é mais a oficial, então é descartado.
    // Nos três casos rowCount = 0 e a questão, se ainda pendente, volta na
    // próxima rodada.
    const { rowCount } = await cliente.query(
      `UPDATE questoes
          SET explicacao       = $2,
              explicacao_fonte = 'ia',
              revisada         = FALSE,
              atualizada_em    = NOW()
        WHERE id = $1
          AND anulada = FALSE
          AND gabarito = $3
          AND explicacao_fonte IS DISTINCT FROM 'humano'
          AND ${
            refazerIa
              ? `((explicacao IS NULL OR btrim(explicacao) = '') OR (explicacao_fonte = 'ia' AND revisada = FALSE))`
              : `(explicacao IS NULL OR btrim(explicacao) = '')`
          }`,
      [item.id, item.explicacao, q.gabarito]
    );
    gravadas += rowCount;
  }

  return gravadas;
}

// `chamarModelo` é injetável para o teste rodar sem rede.
async function explicar({
  exame = null,
  lote = LOTE_PADRAO,
  total = TOTAL_PADRAO,
  aplicar = false,
  refazerIa = false,
  chamarModelo,
  log = console.log,
} = {}) {
  const cliente = await pool.connect();

  const resumo = {
    lidas: 0,
    explicadas: 0,
    gravadas: 0,
    recusadas: [],
    lotesComErro: 0,
    errosDeLote: [],
    modelos: [],
    interrompida: null,
  };

  try {
    let restantes = total;
    const jaTentadas = [];

    while (restantes > 0) {
      const pendentes = await buscarPendentes(cliente, {
        exame,
        limite: Math.min(lote, restantes),
        refazerIa,
        ignorar: jaTentadas,
      });

      if (pendentes.length === 0) break;
      resumo.lidas += pendentes.length;
      jaTentadas.push(...pendentes.map((p) => p.id));
      restantes -= pendentes.length;

      let interpretada;
      try {
        const { conteudo, modelo } = await chamarModelo(montarPrompt(pendentes));
        if (modelo && !resumo.modelos.includes(modelo)) resumo.modelos.push(modelo);
        interpretada = interpretarResposta(conteudo, pendentes);
      } catch (err) {
        // Lote que falha (rede, JSON quebrado) não derruba a rodada: as
        // questões continuam pendentes e voltam na próxima execução.
        const ids = pendentes.map((p) => p.id).join(', ');
        log(`  ⚠️  lote [${ids}] falhou (${err.message}) — volta na próxima rodada`);
        resumo.lotesComErro++;
        resumo.errosDeLote.push({ ids: pendentes.map((p) => p.id), motivo: err.message });
        if (err.cotaEsgotada) {
          resumo.interrompida = 'todos os modelos devolveram 429 (cota da chave provavelmente esgotada)';
          break;
        }
        continue;
      }

      resumo.explicadas += interpretada.aceitas.length;
      resumo.recusadas.push(...interpretada.recusadas);

      // Na conferência o texto vai inteiro para a tela: é para isso que ela
      // existe — ler antes de decidir gravar.
      for (const item of interpretada.aceitas) {
        const q = pendentes.find((p) => p.id === item.id);
        log(`\n  ${q.exame}º/${q.numero} (id ${q.id}) · gabarito ${LETRAS[q.gabarito]}`);
        log(`  ${item.explicacao}`);
      }
      for (const rec of interpretada.recusadas) {
        log(`  ✗ recusada ${rec.id}: ${rec.motivo}`);
      }

      if (aplicar) {
        resumo.gravadas += await gravar(cliente, interpretada.aceitas, pendentes, { refazerIa });
      }
    }
  } finally {
    cliente.release();
  }

  return resumo;
}

module.exports = {
  explicar,
  interpretarResposta,
  montarPrompt,
  chamarOpenRouter,
  letraAfirmadaNoTexto,
  PROMPT_SISTEMA,
  LOTE_PADRAO,
  MAX_CARACTERES,
};

if (require.main === module) {
  const argv = process.argv.slice(2);
  const valor = (nome, padrao) => {
    const i = argv.indexOf(nome);
    if (i === -1) return padrao;
    const n = Number(argv[i + 1]);
    if (!Number.isInteger(n) || n < 1) {
      console.error(`❌ ${nome} precisa de um inteiro positivo.`);
      process.exit(1);
    }
    return n;
  };

  const aplicar = argv.includes('--aplicar');
  const refazerIa = argv.includes('--refazer-ia');
  const exame = valor('--exame', null);
  const lote = valor('--lote', LOTE_PADRAO);
  const total = valor('--total', TOTAL_PADRAO);
  const chave = process.env.OPENROUTER_API_KEY;

  if (!chave) {
    console.error('❌ OPENROUTER_API_KEY não definida.');
    console.error('   Ex.: OPENROUTER_API_KEY=$(cat ~/.openrouter-key) node explicar.js --aplicar');
    process.exit(1);
  }

  if (!aplicar) {
    console.log('🔍 Modo de conferência: nada será gravado. Use --aplicar para valer.');
    console.log('   (A conferência chama o modelo e gasta cota da OpenRouter igual.)\n');
  }
  if (refazerIa) console.log('♻️  --refazer-ia: explicações da IA não revisadas também entram na fila.\n');

  migrate(pool)
    .then(() =>
      explicar({
        exame,
        lote,
        total,
        aplicar,
        refazerIa,
        chamarModelo: (prompt) => chamarOpenRouter(prompt, { chave }),
      })
    )
    .then((r) => {
      console.log(`\n${r.lidas} lida(s), ${r.explicadas} explicada(s), ${r.recusadas.length} recusada(s)`);
      if (aplicar) console.log(`${r.gravadas} gravada(s) no banco`);
      if (r.lotesComErro) console.log(`${r.lotesComErro} lote(s) falharam e voltam na próxima rodada`);
      for (const e of r.errosDeLote) console.log(`  lote [${e.ids.join(', ')}]: ${e.motivo}`);
      if (r.interrompida) console.log(`⛔ rodada interrompida: ${r.interrompida}`);
      console.log(`modelo(s) usado(s): ${r.modelos.length ? r.modelos.join(', ') : 'nenhum'}`);
      for (const rec of r.recusadas) console.log(`  recusada ${rec.id}: ${rec.motivo}`);
      return pool.end();
    })
    .catch((err) => {
      console.error('❌', err.message);
      process.exit(1);
    });
}
