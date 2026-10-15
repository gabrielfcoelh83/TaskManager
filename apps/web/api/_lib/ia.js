// api/_lib/ia.js
//
// Camada ÚNICA de IA do app. Toda chamada a modelo de linguagem passa por
// aqui — hoje nenhuma rota a usa ainda; o próximo passo é um chat de estudo
// sobre as questões REAIS do acervo (a IA explica, não inventa questão).
//
// Provedor: Google Gemini (Google AI Studio), no plano gratuito — o mesmo do
// questoes-service, que escreve as explicações das questões. Até out/2026 era
// a OpenRouter; saiu porque a cota gratuita (50 pedidos/dia por chave) acabava
// numa rodada e os modelos gratuitos de lá respondiam fora do formato. O
// Gemini tem cota própria POR MODELO e fala o formato de chat da OpenAI na
// rota compatível documentada pelo Google (/v1beta/openai/chat/completions).
//
// Por que descobrir os modelos em vez de fixar uma lista: ids de modelo SOMEM
// (preview vira estável, versão velha sai). Este projeto já quebrou duas vezes
// por isso com uma lista fixa: id inexistente devolve 404, o fallback cai para
// o próximo, o último também falha, e o erro final parece rede ruim ou chave
// inválida. Aqui a ordem só usa ids que a listagem confirma que existem AGORA.
//
// REGRA PADRÃO (sem GEMINI_MODELOS) — lista branca, igual à do questoes-service
// (questoes-service/gemini.js): só "gemini-<versão>-flash" estável, da maior
// versão para a menor, e depois o apelido "gemini-flash-latest". Fica de fora
// sem precisar ser nomeado: pro (sem cota gratuita), -lite, -preview/-exp,
// -tts, -image, gemma, embedding etc. GEMINI_MODELOS (ids separados por
// vírgula) SUBSTITUI a regra, na ordem dada — e só vale o que a listagem
// confirma; se nada existir, volta à regra padrão.
//
// A chave vai SEMPRE em header (`x-goog-api-key` na listagem, `Authorization:
// Bearer` no chat), nunca em `?key=` na URL: URL vai parar em log e mensagem
// de erro. O plano gratuito do Google pode usar o que é enviado para melhorar
// os produtos dele — a política de privacidade avisa.

import axios from 'axios';

const URL_MODELOS = 'https://generativelanguage.googleapis.com/v1beta/models';
const URL_CHAT = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';

// A lista de modelos muda devagar; 1h poupa uma ida à rede a cada pedido sem
// deixar o app preso por muito tempo a um id que acabou de sumir.
const TTL_MODELOS_MS = 60 * 60 * 1000;

// Teto de modelos tentados por pedido. A cota do plano gratuito é por modelo
// e por dia: com todos estourados, varrer a lista inteira só gastaria tempo.
const MAX_TENTATIVAS = 4;
// A listagem devolve no máximo 1000 por página; 5 páginas é folga de sobra.
const MAX_PAGINAS = 5;

const FLASH_ESTAVEL = /^gemini-(\d+(?:\.\d+)*)-flash$/;
const FLASH_APELIDO = 'gemini-flash-latest';

// ---------------------------------------------------------------------------
// Erros tipados: as rotas mapeiam direto para HTTP com `erro.status`.
// ---------------------------------------------------------------------------

// Nenhum modelo respondeu (limite, fora do ar, timeout, JSON inválido).
// 503 porque é transitório: tentar de novo em alguns minutos pode dar certo.
export class IaIndisponivel extends Error {
  constructor(mensagem, tentativas = []) {
    super(mensagem);
    this.name = 'IaIndisponivel';
    this.status = 503;
    this.tentativas = tentativas;
  }
}

// Chave ausente, inválida ou sem permissão. É defeito de configuração do
// servidor, não do usuário — por isso 500 e NÃO 401: o front trata 401 como
// sessão expirada e mandaria a pessoa para o login sem culpa nenhuma dela.
export class IaChaveInvalida extends Error {
  constructor(mensagem) {
    super(mensagem);
    this.name = 'IaChaveInvalida';
    this.status = 500;
  }
}

// ---------------------------------------------------------------------------
// Funções puras (exportadas para teste)
// ---------------------------------------------------------------------------

const idPuro = (id) => String(id || '').trim().replace(/^gemini:/, '').replace(/^models\//, '');

// Só modelo que gera texto (`generateContent`) serve aqui.
export function ehModeloDeTexto(m) {
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

export function lerPreferidos(env = process.env) {
  const bruto = env.GEMINI_MODELOS;
  if (!bruto || !bruto.trim()) return null;
  const ids = bruto.split(',').map(idPuro).filter(Boolean);
  return ids.length ? ids : null;
}

// Recebe os ids existentes e devolve os que serão tentados, na ordem.
// `preferidos` (de GEMINI_MODELOS) substitui a regra padrão, se algum existir.
export function ordenarModelos(ids, preferidos = null) {
  const existentes = new Set(ids);
  if (preferidos) {
    const escolhidos = preferidos.filter((id) => existentes.has(id));
    if (escolhidos.length > 0) return escolhidos;
  }
  const estaveis = ids
    .map((id) => ({ id, m: FLASH_ESTAVEL.exec(id) }))
    .filter((x) => x.m)
    .sort((a, b) => compararVersaoDesc(a.m[1], b.m[1]))
    .map((x) => x.id);
  return existentes.has(FLASH_APELIDO) ? [...estaveis, FLASH_APELIDO] : estaveis;
}

// Modelos respondem JSON cercado por ```json, com texto antes ou
// depois, mesmo quando o prompt pede "só JSON". Tenta o conteúdo limpo e, se
// não der, o trecho entre o primeiro { ou [ e o último } ou ].
export function extrairJson(texto) {
  const limpo = String(texto ?? '')
    .replace(/```(?:json)?\s*/gi, '')
    .replace(/```/g, '')
    .trim();

  try {
    return JSON.parse(limpo);
  } catch {
    // segue para o recorte
  }

  const inicio = limpo.search(/[[{]/);
  const fim = Math.max(limpo.lastIndexOf('}'), limpo.lastIndexOf(']'));
  if (inicio === -1 || fim <= inicio) {
    throw new Error('resposta sem JSON');
  }
  return JSON.parse(limpo.slice(inicio, fim + 1));
}

function motivoDoErro(erro) {
  const status = erro?.response?.status;
  if (status) return `HTTP ${status}`;
  if (erro?.code === 'ECONNABORTED' || erro?.code === 'ETIMEDOUT') return 'timeout';
  return erro?.code || erro?.message || 'erro desconhecido';
}

// ---------------------------------------------------------------------------
// Cliente (http, env e relógio injetáveis para o teste rodar sem rede)
// ---------------------------------------------------------------------------

// Chave recusada. O Google responde 400 "API key not valid" (não 401) para
// chave errada, então o texto do erro também conta.
function ehErroDeChave(erro) {
  const status = erro?.response?.status;
  if (status === 401 || status === 403) return true;
  const msg = JSON.stringify(erro?.response?.data ?? '');
  return status === 400 && /API key|API_KEY_INVALID/i.test(msg);
}

function chaveDaEnv(env) {
  const chave = env.GEMINI_API_KEY;
  if (!chave) {
    throw new IaChaveInvalida(
      'GEMINI_API_KEY não definida. Crie uma chave gratuita no Google AI Studio (aistudio.google.com/apikey) e ponha em .env.local (dev) ou nas variáveis da Vercel.'
    );
  }
  return chave;
}

export function criarClienteIa({
  http = axios,
  env = process.env,
  agora = Date.now,
  log = console,
} = {}) {
  // Cache em memória. Na Vercel vive enquanto a instância da função estiver
  // quente; basta para não listar modelos a cada pedido.
  let cache = null; // { modelos: [{ id, pensa }], em }

  async function listarModelos() {
    if (cache && agora() - cache.em < TTL_MODELOS_MS) return cache.modelos;
    // Lida a cada chamada, não no import: o dev-api carrega .env.local depois
    // de montar o processo, e a Vercel pode trocar a env sem novo build.
    const chave = chaveDaEnv(env);

    try {
      // 1000 por página é o máximo da API; segue `nextPageToken` (até
      // MAX_PAGINAS) para um catálogo maior não perder modelos sem aviso.
      const lista = [];
      let pagina;
      for (let i = 0; i < MAX_PAGINAS; i++) {
        const { data } = await http.get(URL_MODELOS, {
          params: { pageSize: 1000, ...(pagina ? { pageToken: pagina } : {}) },
          headers: { 'x-goog-api-key': chave },
          timeout: 10000,
        });
        if (Array.isArray(data?.models)) lista.push(...data.models);
        pagina = data?.nextPageToken;
        if (!pagina) break;
      }
      const modelos = lista
        .filter(ehModeloDeTexto)
        .map((m) => ({ id: idPuro(m.name), pensa: m.thinking === true }));
      // Lista vazia é resposta estranha, não "não há modelos": nunca entra no
      // cache (senão travaria a IA por 1 h) nem apaga um cache bom.
      if (modelos.length === 0) return cache ? cache.modelos : modelos;
      cache = { modelos, em: agora() };
      return modelos;
    } catch (erro) {
      if (ehErroDeChave(erro)) {
        throw new IaChaveInvalida(
          `O Google recusou a chave (${motivoDoErro(erro)}). Confira GEMINI_API_KEY (chave revogada, copiada pela metade ou de outro projeto).`
        );
      }
      // Sem rede para a listagem, a última lista conhecida é melhor que nada:
      // ids não somem de hora em hora.
      if (cache) {
        log.warn?.(`[ia] listagem de modelos falhou (${motivoDoErro(erro)}); usando cache`);
        return cache.modelos;
      }
      throw new IaIndisponivel(
        'Não foi possível consultar os modelos do Gemini. Tente novamente em alguns minutos.'
      );
    }
  }

  async function modelosEmOrdem() {
    const modelos = await listarModelos();
    const ordem = ordenarModelos(
      modelos.map((m) => m.id),
      lerPreferidos(env)
    );
    return ordem;
  }

  // `mensagens` é o histórico no formato da API ({ role, content }) — o mesmo
  // que um chat vai acumular turno a turno, então a assinatura já serve para
  // ele. Streaming entraria aqui; fica para quando o chat existir, porque a
  // troca de modelo no meio de um stream muda o desenho.
  async function completar({
    sistema,
    mensagens = [],
    json = false,
    maxTokens = 1024,
    timeoutMs = 30000,
    temperatura = 0.3,
  } = {}) {
    const chave = chaveDaEnv(env);

    if (!Array.isArray(mensagens) || mensagens.length === 0) {
      throw new TypeError('completar: `mensagens` precisa ser um array não vazio de { role, content }');
    }

    const messages = sistema ? [{ role: 'system', content: sistema }, ...mensagens] : mensagens;

    const listados = await listarModelos();
    const pensa = new Map(listados.map((m) => [m.id, m.pensa]));
    const modelos = ordenarModelos(
      listados.map((m) => m.id),
      lerPreferidos(env)
    ).slice(0, MAX_TENTATIVAS);
    if (modelos.length === 0) {
      throw new IaIndisponivel('O Gemini não lista nenhum modelo flash disponível no momento.');
    }

    const tentativas = [];

    for (const modelo of modelos) {
      const corpo = { model: modelo, messages, max_tokens: maxTokens, temperature: temperatura };
      // Modelo que raciocina gasta tokens de raciocínio do mesmo teto da
      // resposta: pouco raciocínio e uma folga, senão o texto sai cortado.
      if (pensa.get(modelo)) {
        corpo.reasoning_effort = 'low';
        corpo.max_tokens = maxTokens + 2048;
      }

      let resposta;
      try {
        resposta = await http.post(URL_CHAT, corpo, {
          headers: { Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json' },
          timeout: timeoutMs,
        });
      } catch (erro) {
        // Chave inválida vale para TODOS os modelos: tentar o próximo só
        // multiplicaria o mesmo erro e esconderia a causa.
        if (ehErroDeChave(erro)) {
          throw new IaChaveInvalida(
            `O Google recusou a chave (${motivoDoErro(erro)}). Confira GEMINI_API_KEY (chave revogada, copiada pela metade ou de outro projeto).`
          );
        }
        // 429 (cota do modelo), 503 (sobrecarga, comum no plano gratuito),
        // 404 (id que sumiu entre a listagem e o pedido), timeout: o próximo
        // modelo tem cota e fila próprias.
        // Um 400 pode ser defeito NOSSO (corpo, role ou parâmetro recusado):
        // o texto do Google vai para o log (ele não traz a chave), senão o
        // bug some atrás de um "tente mais tarde".
        const motivo = motivoDoErro(erro);
        const detalhe = erro?.response?.status === 400 ? erro?.response?.data?.error?.message : null;
        tentativas.push({ modelo, motivo });
        log.warn?.(`[ia] ${modelo}: ${motivo}${detalhe ? ` (${String(detalhe).slice(0, 200)})` : ''}, tentando o próximo`);
        continue;
      }

      const texto = resposta?.data?.choices?.[0]?.message?.content;
      if (resposta?.data?.error || typeof texto !== 'string' || !texto.trim()) {
        tentativas.push({ modelo, motivo: 'resposta sem conteúdo' });
        continue;
      }

      if (!json) return { texto, modelo };

      try {
        return { texto, modelo, json: extrairJson(texto) };
      } catch {
        // Outro modelo pode seguir melhor a instrução de formato.
        tentativas.push({ modelo, motivo: 'JSON inválido' });
        continue;
      }
    }

    throw new IaIndisponivel(
      'Nenhum modelo de IA respondeu agora (limite de uso ou indisponibilidade). Tente novamente em alguns minutos.',
      tentativas
    );
  }

  return { listarModelos, modelosEmOrdem, completar };
}

// Instância padrão, usada pelas rotas.
const padrao = criarClienteIa();
export const listarModelos = padrao.listarModelos;
export const modelosEmOrdem = padrao.modelosEmOrdem;
export const completar = padrao.completar;
