// Descoberta dos modelos do Google Gemini (Google AI Studio, plano gratuito)
// para o explicar.js — o par de openrouter.js para o outro provedor.
//
// LISTAGEM: GET /v1beta/models (API nativa), com a chave no header
// `x-goog-api-key`, NUNCA em `?key=` na URL: URL vai parar em mensagem de
// erro, log de proxy e histórico; header não. Só entram os modelos cujo
// `supportedGenerationMethods` inclui `generateContent` (geram texto).
// O id vem como "models/gemini-3.8-flash"; o prefixo "models/" é tirado,
// porque a rota compatível com OpenAI (chat/completions) usa o id puro.
//
// PREFERÊNCIA PADRÃO (sem GEMINI_MODELOS) — lista branca, não lista negra:
//   1. ids exatamente "gemini-<versão>-flash" (flash ESTÁVEL, sem sufixo),
//      da maior versão para a menor (3.8 > 3.7 > ... > 2.5);
//   2. depois "gemini-flash-latest" (apelido que o Google aponta para o
//      flash atual).
// Todo o resto fica de fora sem precisar ser nomeado: -lite, -image, -tts,
// -live, -native-audio, -transcribe, -preview/-exp (somem sem aviso), pro
// (cota gratuita mínima), gemma, omni, nano-banana, lyria, robotics,
// computer-use, antigravity, deep-research, embedding. Lista branca porque a
// listagem real tem dezenas de modelos que não servem para texto jurídico, e
// cada lançamento novo traria outro nome para bloquear.
// Nenhuma versão está fixa no código: a regra escolhe pela listagem de AGORA.
//
// GEMINI_MODELOS (ids separados por vírgula; aceita "gemini-3.8-flash",
// "models/gemini-3.8-flash" ou "gemini:gemini-3.8-flash") SUBSTITUI a regra,
// na ordem dada — mas só valem os ids que a listagem confirma. Se nenhum
// existir, volta à regra padrão.
//
// `pensa`: o campo `thinking` da listagem. Modelo que raciocina gasta tokens
// de raciocínio do mesmo teto de saída; o explicar.js usa isso para mandar
// `reasoning_effort: "low"` e uma folga no `max_tokens` só a quem raciocina.

const URL_MODELOS_GEMINI = 'https://generativelanguage.googleapis.com/v1beta/models';

const TTL_MODELOS_MS = 60 * 60 * 1000;
// Mesmo teto do openrouter.js: com a cota do dia estourada, todos devolvem
// 429, e varrer a lista inteira só gastaria pedidos negados.
const MAX_TENTATIVAS = 4;
// A API devolve no máximo 1000 por página; 5 páginas é folga de sobra.
const MAX_PAGINAS = 5;

const FLASH_ESTAVEL = /^gemini-(\d+(?:\.\d+)*)-flash$/;
const FLASH_APELIDO = 'gemini-flash-latest';

// Tira qualquer ocorrência da chave de um texto (mensagem de erro de rede
// pode trazer cabeçalho ou URL). Defesa extra: a chave já não vai em URL.
function ocultarChave(texto, chave) {
  const s = String(texto ?? '');
  if (!chave) return s;
  return s.split(chave).join('[chave oculta]');
}

const idPuro = (id) => String(id || '').trim().replace(/^gemini:/, '').replace(/^models\//, '');

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

// Regra padrão (ver topo): flash estável por versão desc, depois o apelido.
function ordemPadraoGemini(ids) {
  const estaveis = ids
    .map((id) => ({ id, m: FLASH_ESTAVEL.exec(id) }))
    .filter((x) => x.m)
    .sort((a, b) => compararVersaoDesc(a.m[1], b.m[1]))
    .map((x) => x.id);
  return ids.includes(FLASH_APELIDO) ? [...estaveis, FLASH_APELIDO] : estaveis;
}

function lerPreferidosGemini(env = process.env) {
  const bruto = env.GEMINI_MODELOS;
  if (!bruto || !bruto.trim()) return null;
  return bruto.split(',').map(idPuro).filter(Boolean);
}

// `modelos`: [{ id, pensa }] da listagem. Devolve a mesma forma, em ordem.
function ordenarGemini(modelos, preferidos) {
  const porId = new Map(modelos.map((m) => [m.id, m]));
  if (preferidos && preferidos.length) {
    const escolhidos = [...new Set(preferidos)].filter((id) => porId.has(id));
    if (escolhidos.length > 0) return escolhidos.map((id) => porId.get(id));
  }
  return ordemPadraoGemini(modelos.map((m) => m.id)).map((id) => porId.get(id));
}

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

  async function modelosGeminiEmOrdem(chave) {
    const modelos = await listarModelosGemini(chave);
    return ordenarGemini(modelos, lerPreferidosGemini(env)).slice(0, MAX_TENTATIVAS);
  }

  return { listarModelosGemini, modelosGeminiEmOrdem };
}

const padrao = criarDescobertaGemini();

module.exports = {
  URL_MODELOS_GEMINI,
  ehModeloDeTexto,
  ordemPadraoGemini,
  ordenarGemini,
  lerPreferidosGemini,
  criarDescobertaGemini,
  ocultarChave,
  listarModelosGemini: padrao.listarModelosGemini,
  modelosGeminiEmOrdem: padrao.modelosGeminiEmOrdem,
  MAX_TENTATIVAS,
};
