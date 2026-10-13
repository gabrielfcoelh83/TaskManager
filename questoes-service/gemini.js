// Descoberta dos modelos do Google Gemini (Google AI Studio, plano gratuito)
// e montagem do pedido de chat, para o explicar.js e o classificar.js. É o
// único provedor de IA do questoes-service.
//
// LISTAGEM: GET /v1beta/models (API nativa), com a chave no header
// `x-goog-api-key`, NUNCA em `?key=` na URL: URL vai parar em mensagem de
// erro, log de proxy e histórico; header não. Só entram os modelos cujo
// `supportedGenerationMethods` inclui `generateContent` (geram texto).
// O id vem como "models/gemini-3.8-flash"; o prefixo "models/" é tirado,
// porque a rota compatível com OpenAI (chat/completions) usa o id puro.
//
// GERADORES — preferência padrão (sem GEMINI_MODELOS), lista branca:
//   1. ids exatamente "gemini-<versão>-flash" (flash ESTÁVEL, sem sufixo),
//      da maior versão para a menor (3.8 > 3.7 > ... > 2.5);
//   2. depois "gemini-flash-latest" (apelido que o Google aponta para o
//      flash atual).
// Todo o resto fica de fora sem precisar ser nomeado: -lite, -image, -tts,
// -live, -native-audio, -transcribe, -preview/-exp (somem sem aviso), pro
// (sem cota no plano gratuito: 429 já no 1º pedido), omni, nano-banana,
// lyria, robotics, computer-use, antigravity, deep-research, embedding. Lista
// branca porque a listagem real tem dezenas de modelos que não servem para
// texto jurídico, e cada lançamento novo traria outro nome para bloquear.
// Nenhuma versão está fixa no código: a regra escolhe pela listagem de AGORA.
//
// CONFERENTES — preferência padrão (sem GEMINI_CONFERENTES):
//   1. a família GEMMA (pesos abertos, também servida pela API do Google):
//      ids "gemma-<versão>-<tamanho>b...-it" (só os ajustados para instrução),
//      maior versão primeiro e, na mesma versão, maior tamanho primeiro
//      (gemma-4-31b-it antes de gemma-4-26b-a4b-it);
//   2. depois os mesmos flashes dos geradores.
// Gemma é outro modelo, treinado à parte: conferir um texto do Gemini com um
// Gemma pega mais erro do que conferir com outro Gemini, que tende a
// concordar consigo mesmo. A exclusão do gerador e a preferência por família
// diferente ficam em provedores.js / explicar.js.
//
// GEMINI_MODELOS / GEMINI_CONFERENTES (ids separados por vírgula; aceitam
// "gemini-3.8-flash", "models/gemini-3.8-flash" ou "gemini:gemini-3.8-flash")
// SUBSTITUEM a regra, na ordem dada — mas só valem os ids que a listagem
// confirma. Se nenhum existir, volta à regra padrão.
//
// `pensa`: o campo `thinking` da listagem. Modelo que raciocina gasta tokens
// de raciocínio do mesmo teto de saída; o pedido manda
// `reasoning_effort: "low"` e uma folga no `max_tokens` só a quem raciocina.

const URL_MODELOS_GEMINI = 'https://generativelanguage.googleapis.com/v1beta/models';
// Rota compatível com OpenAI (chat/completions), `Authorization: Bearer`.
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';

const TTL_MODELOS_MS = 60 * 60 * 1000;
// Teto de modelos por pedido: com a cota do dia estourada, todos devolvem
// 429, e varrer a lista inteira só gastaria pedidos negados.
const MAX_TENTATIVAS = 4;
// A API devolve no máximo 1000 por página; 5 páginas é folga de sobra.
const MAX_PAGINAS = 5;

const FLASH_ESTAVEL = /^gemini-(\d+(?:\.\d+)*)-flash$/;
const FLASH_APELIDO = 'gemini-flash-latest';
// gemma-4-31b-it · gemma-4-26b-a4b-it · gemma-3-27b-it. Fica de fora o que
// não diz versão e tamanho assim (gemma-3n-e4b-it, variantes sem -it).
const GEMMA_INSTRUCAO = /^gemma-(\d+(?:\.\d+)*)-(\d+(?:\.\d+)?)b(?:-[a-z0-9.]+)*-it$/;

// Tira qualquer ocorrência da chave de um texto (mensagem de erro de rede
// pode trazer cabeçalho ou URL). Defesa extra: a chave já não vai em URL.
function ocultarChave(texto, chave) {
  const s = String(texto ?? '');
  if (!chave) return s;
  return s.split(chave).join('[chave oculta]');
}

const idPuro = (id) => String(id || '').trim().replace(/^gemini:/, '').replace(/^models\//, '');

const ehGemma = (id) => /^gemma/i.test(idPuro(id));

function ehModeloDeTexto(m) {
  return Boolean(
    m &&
      typeof m.name === 'string' &&
      Array.isArray(m.supportedGenerationMethods) &&
      m.supportedGenerationMethods.includes('generateContent')
  );
}

function compararVersaoDesc(a, b) {
  const va = a.split('.').map(Number);
  const vb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(va.length, vb.length); i++) {
    const d = (vb[i] || 0) - (va[i] || 0);
    if (d !== 0) return d;
  }
  return 0;
}

// Regra padrão dos geradores (ver topo): flash estável por versão desc,
// depois o apelido.
function ordemPadraoGemini(ids) {
  const estaveis = ids
    .map((id) => ({ id, m: FLASH_ESTAVEL.exec(id) }))
    .filter((x) => x.m)
    .sort((a, b) => compararVersaoDesc(a.m[1], b.m[1]))
    .map((x) => x.id);
  return ids.includes(FLASH_APELIDO) ? [...estaveis, FLASH_APELIDO] : estaveis;
}

// Regra padrão dos conferentes (ver topo): gemma -it por versão desc e
// tamanho desc, depois os flashes dos geradores.
function ordemPadraoConferentes(ids) {
  const gemmas = ids
    .map((id) => ({ id, m: GEMMA_INSTRUCAO.exec(id) }))
    .filter((x) => x.m)
    .sort((a, b) => compararVersaoDesc(a.m[1], b.m[1]) || Number(b.m[2]) - Number(a.m[2]))
    .map((x) => x.id);
  return [...gemmas, ...ordemPadraoGemini(ids)];
}

function lerLista(bruto) {
  if (!bruto || !bruto.trim()) return null;
  return bruto.split(',').map(idPuro).filter(Boolean);
}

const lerPreferidosGemini = (env = process.env) => lerLista(env.GEMINI_MODELOS);
const lerConferentesGemini = (env = process.env) => lerLista(env.GEMINI_CONFERENTES);

// `modelos`: [{ id, pensa }] da listagem. Devolve a mesma forma, em ordem:
// os `preferidos` que existem, ou, sem nenhum, a `regra`.
function ordenarGemini(modelos, preferidos, regra = ordemPadraoGemini) {
  const porId = new Map(modelos.map((m) => [m.id, m]));
  if (preferidos && preferidos.length) {
    const escolhidos = [...new Set(preferidos)].filter((id) => porId.has(id));
    if (escolhidos.length > 0) return escolhidos.map((id) => porId.get(id));
  }
  return regra(modelos.map((m) => m.id)).map((id) => porId.get(id));
}

const ordenarConferentesGemini = (modelos, preferidos) => ordenarGemini(modelos, preferidos, ordemPadraoConferentes);

// `buscar`, `agora` e `env` injetáveis para o teste rodar sem rede.
function criarDescobertaGemini({ buscar = (...args) => fetch(...args), agora = Date.now, env = process.env } = {}) {
  let cache = null; // { modelos, em }

  async function listarModelosGemini(chave) {
    if (!chave) throw new Error('GEMINI_API_KEY não definida');
    if (cache && agora() - cache.em < TTL_MODELOS_MS) return cache.modelos;

    try {
      const modelos = [];
      let pagina = null;
      for (let i = 0; i < MAX_PAGINAS; i++) {
        const url = `${URL_MODELOS_GEMINI}?pageSize=1000${pagina ? `&pageToken=${encodeURIComponent(pagina)}` : ''}`;
        const res = await buscar(url, {
          headers: { 'x-goog-api-key': chave },
          signal: AbortSignal.timeout(10000),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const corpo = await res.json();
        const lista = Array.isArray(corpo && corpo.models) ? corpo.models : [];
        for (const m of lista.filter(ehModeloDeTexto)) {
          modelos.push({ id: idPuro(m.name), pensa: m.thinking === true });
        }
        pagina = corpo && corpo.nextPageToken;
        if (!pagina) break;
      }
      if (modelos.length === 0 && cache) return cache.modelos;
      cache = { modelos, em: agora() };
      return modelos;
    } catch (err) {
      if (cache) return cache.modelos;
      throw new Error(`não foi possível listar os modelos do Gemini (${ocultarChave(err.message, chave)})`);
    }
  }

  // Geradores: no máximo MAX_TENTATIVAS por pedido.
  async function modelosGeminiEmOrdem(chave) {
    const modelos = await listarModelosGemini(chave);
    return ordenarGemini(modelos, lerPreferidosGemini(env)).slice(0, MAX_TENTATIVAS);
  }

  // Conferentes: a lista inteira, sem corte — quem chama tira o gerador e os
  // excluídos, reordena por família e só então corta em MAX_TENTATIVAS.
  async function conferentesGeminiEmOrdem(chave) {
    const modelos = await listarModelosGemini(chave);
    return ordenarConferentesGemini(modelos, lerConferentesGemini(env));
  }

  return { listarModelosGemini, modelosGeminiEmOrdem, conferentesGeminiEmOrdem };
}

// PEDIDO DE CHAT (rota compatível com OpenAI): mesmo corpo (model, messages,
// temperature, max_tokens) e mesma resposta (choices[0].message.content).
//
// Só para modelo que a listagem marca como `thinking`: `reasoning_effort:
// "low"` (campo documentado da rota compatível; exceto gemma, ver abaixo) e
// uma folga no `max_tokens`.
// Os tokens de raciocínio saem do mesmo teto da resposta; sem folga, um
// modelo que pensa muito devolve o JSON cortado.
const FOLGA_RACIOCINIO = 4096;

// GEMMA SEM MENSAGEM `system`: na API do Google o Gemma 3 recusava instrução
// de sistema ("Developer instruction is not enabled"), com HTTP 400. Não foi
// verificado se o Gemma 4 já aceita; juntar é inofensivo e evita o 400. Para
// ids gemma, o texto do sistema vai no começo da mensagem do usuário,
// separado por uma linha em branco. Para os demais, `system` + `user`.
function montarMensagens(id, sistema, prompt) {
  if (ehGemma(id)) return [{ role: 'user', content: `${sistema}\n\n${prompt}` }];
  return [
    { role: 'system', content: sistema },
    { role: 'user', content: prompt },
  ];
}

// `c`: { id, chave, pensa? }. Devolve { url, headers, corpo }.
function montarPedidoGemini(c, { prompt, sistema, temperatura, maxTokens }) {
  const corpo = {
    model: c.id,
    messages: montarMensagens(c.id, sistema, prompt),
    temperature: temperatura,
    max_tokens: maxTokens,
  };
  // GEMMA PENSA, MAS NÃO ACEITA `reasoning_effort`: a listagem marca o
  // gemma-4 como `thinking: true`, e a rota compatível recusa o campo para
  // ele com HTTP 400 "Thinking level is not supported for this model"
  // (verificado em out/2026). Ele ganha só a folga no teto.
  if (c.pensa) {
    if (!ehGemma(c.id)) corpo.reasoning_effort = 'low';
    corpo.max_tokens = maxTokens + FOLGA_RACIOCINIO;
  }
  return {
    url: GEMINI_URL,
    headers: { Authorization: `Bearer ${c.chave}`, 'Content-Type': 'application/json' },
    corpo,
  };
}

const padrao = criarDescobertaGemini();

// RACIOCÍNIO NO TEXTO: pela rota compatível, o gemma-4 devolve o que pensou
// DENTRO de `content`, num bloco "<thought>...</thought>" antes da resposta
// (verificado em out/2026). Esse bloco tem rascunhos de lista JSON — inclusive
// o exemplo do próprio prompt —, e quem lê a resposta procura a PRIMEIRA
// lista: leria o rascunho como veredito. Então o bloco sai antes de qualquer
// leitura. Bloco aberto e nunca fechado = resposta cortada no meio do
// raciocínio: não sobra resposta nenhuma (string vazia), e quem chama trata
// como "resposta sem conteúdo".
function semRaciocinio(texto) {
  let s = String(texto ?? '');
  for (;;) {
    // Tolera atributo e espaço na tag ("<thought type=x>", "< thought>").
    const m = /^\s*<\s*(thought|think|thinking)\b[^>]*>/i.exec(s);
    if (!m) return s.trim();
    const fecha = new RegExp(`<\\s*/\\s*${m[1]}\\s*>`, 'i').exec(s.slice(m[0].length));
    if (!fecha) return '';
    s = s.slice(m[0].length + fecha.index + fecha[0].length);
  }
}

// O gemma-4 raciocina antes de responder e é mais lento que os flash: 65 s
// para conferir duas explicações curtas (out/2026). Com o teto de 90 s de
// todo modelo, um lote de 5 cortaria no meio. Ele ganha mais tempo.
const TIMEOUT_MS = 90 * 1000;
const TIMEOUT_GEMMA_MS = 180 * 1000;
const timeoutDe = (id) => (ehGemma(id) ? TIMEOUT_GEMMA_MS : TIMEOUT_MS);

module.exports = {
  URL_MODELOS_GEMINI,
  GEMINI_URL,
  FOLGA_RACIOCINIO,
  ehModeloDeTexto,
  ehGemma,
  ordemPadraoGemini,
  ordemPadraoConferentes,
  ordenarGemini,
  ordenarConferentesGemini,
  lerPreferidosGemini,
  lerConferentesGemini,
  criarDescobertaGemini,
  montarMensagens,
  montarPedidoGemini,
  semRaciocinio,
  timeoutDe,
  TIMEOUT_MS,
  TIMEOUT_GEMMA_MS,
  ocultarChave,
  listarModelosGemini: padrao.listarModelosGemini,
  modelosGeminiEmOrdem: padrao.modelosGeminiEmOrdem,
  conferentesGeminiEmOrdem: padrao.conferentesGeminiEmOrdem,
  MAX_TENTATIVAS,
};
