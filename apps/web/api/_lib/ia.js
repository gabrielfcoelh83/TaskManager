// api/_lib/ia.js
//
// Camada ÚNICA de IA do app. Toda chamada a modelo de linguagem passa por
// aqui — hoje nenhuma rota a usa ainda; o próximo passo é um chat de estudo
// sobre as questões REAIS do acervo (a IA explica, não inventa questão).
//
// Provedor: OpenRouter, e só com modelos GRATUITOS (id terminado em `:free`
// e preço zero de entrada e de saída). O plano gratuito tem teto por chave —
// 20 pedidos/min e 50/dia (1000/dia depois de US$ 10 em créditos) —, e é por
// isso que o número de tentativas por pedido é limitado mais abaixo.
//
// Por que descobrir os modelos em vez de fixar uma lista: os ids da OpenRouter
// SOMEM sem aviso. Este projeto já quebrou duas vezes por isso — a rota antiga
// de geração tinha três ids que deixaram de existir, e o classificador do
// questoes-service herdou um deles. Id inexistente devolve 404, o fallback cai
// para o próximo, o último também falha, e o erro final parece rede ruim ou
// chave inválida. Aqui a lista de preferência só vale para os ids que a API
// confirma que existem AGORA.

import axios from 'axios';

const URL_MODELOS = 'https://openrouter.ai/api/v1/models';
const URL_CHAT = 'https://openrouter.ai/api/v1/chat/completions';

// Ordem de preferência. A env IA_MODELOS (ids separados por vírgula) SUBSTITUI
// esta lista — trocar de modelo em produção não deveria exigir deploy de código.
export const PREFERIDOS = [
  'qwen/qwen3.8-27b:free',
  'google/gemma-4-31b-it:free',
  'nvidia/nemotron-3-ultra-550b-a55b:free',
];

// A lista de modelos muda devagar; 1h poupa uma ida à rede a cada pedido sem
// deixar o app preso por muito tempo a um id que acabou de sumir.
const TTL_MODELOS_MS = 60 * 60 * 1000;

// Teto de modelos tentados por pedido. Cada tentativa gasta da cota diária
// (50/dia na chave gratuita): se a própria chave estourou o limite, todos os
// modelos devolvem 429 e varrer a lista inteira só queimaria o resto do dia.
const MAX_TENTATIVAS = 4;

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

// Gratuito = id `:free` E preço zero nos dois sentidos. Só o sufixo não basta
// para garantir custo zero, e só o preço deixaria entrar modelo pago em
// promoção, que some (ou passa a cobrar) quando a promoção acaba.
export function ehGratuito(modelo) {
  const p = modelo?.pricing;
  if (typeof modelo?.id !== 'string' || !modelo.id.endsWith(':free')) return false;
  if (!p || String(p.prompt) !== '0' || String(p.completion) !== '0') return false;
  // Modelo que só gera imagem/áudio não serve para texto; quando a API não
  // informa as modalidades, não dá para excluir — fica.
  const saidas = modelo?.architecture?.output_modalities;
  if (Array.isArray(saidas) && !saidas.includes('text')) return false;
  return true;
}

export function lerPreferidos(env = process.env) {
  const bruto = env.IA_MODELOS;
  if (!bruto || !bruto.trim()) return PREFERIDOS;
  return bruto
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

// Recebe a lista de gratuitos e devolve os ids na ordem em que serão tentados.
export function ordenarModelos(gratuitos, preferidos = PREFERIDOS) {
  const existentes = new Set(gratuitos.map((m) => m.id));
  const escolhidos = preferidos.filter((id) => existentes.has(id));
  if (escolhidos.length > 0) return escolhidos;

  // Nenhum preferido existe mais (o cenário que já quebrou o projeto): em vez
  // de falhar, usa o que houver de gratuito, maior contexto primeiro — é o
  // critério objetivo disponível na API que mais se aproxima de "modelo
  // maior", e contexto folgado importa para enunciados longos da OAB.
  return [...gratuitos]
    .sort((a, b) => (b.context_length || 0) - (a.context_length || 0))
    .map((m) => m.id);
}

// Modelos gratuitos respondem JSON cercado por ```json, com texto antes ou
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

export function criarClienteIa({
  http = axios,
  env = process.env,
  agora = Date.now,
  log = console,
} = {}) {
  // Cache em memória. Na Vercel vive enquanto a instância da função estiver
  // quente; basta para não listar modelos a cada pedido.
  let cache = null; // { modelos, em }

  async function listarModelosGratuitos() {
    if (cache && agora() - cache.em < TTL_MODELOS_MS) return cache.modelos;

    try {
      // Endpoint público: listar não exige chave nem gasta cota.
      const { data } = await http.get(URL_MODELOS, { timeout: 10000 });
      const lista = Array.isArray(data?.data) ? data.data : [];
      const modelos = lista.filter(ehGratuito);
      // Lista vazia é resposta estranha, não "não há modelos": não apaga um
      // cache bom por causa dela.
      if (modelos.length === 0 && cache) return cache.modelos;
      cache = { modelos, em: agora() };
      return modelos;
    } catch (erro) {
      // Sem rede para a listagem, a última lista conhecida é melhor que nada:
      // ids não somem de hora em hora.
      if (cache) {
        log.warn?.(`[ia] listagem de modelos falhou (${motivoDoErro(erro)}); usando cache`);
        return cache.modelos;
      }
      throw new IaIndisponivel(
        'Não foi possível consultar os modelos da OpenRouter. Tente novamente em alguns minutos.'
      );
    }
  }

  async function modelosEmOrdem() {
    const gratuitos = await listarModelosGratuitos();
    return ordenarModelos(gratuitos, lerPreferidos(env));
  }

  // `mensagens` é o histórico no formato da API ({ role, content }) — o mesmo
  // que um chat vai acumular turno a turno, então a assinatura já serve para
  // ele. Streaming entraria aqui: `stream: true` no corpo, `responseType:
  // 'stream'` no axios e um callback por pedaço; fica para quando o chat
  // existir, porque a troca de modelo no meio de um stream muda o desenho.
  async function completar({
    sistema,
    mensagens = [],
    json = false,
    maxTokens = 1024,
    timeoutMs = 30000,
    temperatura = 0.3,
  } = {}) {
    // Lida a cada chamada, não no import: o dev-api carrega .env.local depois
    // de montar o processo, e a Vercel pode trocar a env sem novo build.
    const chave = env.OPENROUTER_API_KEY;
    if (!chave) {
      throw new IaChaveInvalida(
        'OPENROUTER_API_KEY não definida. Crie uma chave gratuita em openrouter.ai/keys e ponha em .env.local (dev) ou nas variáveis da Vercel.'
      );
    }

    if (!Array.isArray(mensagens) || mensagens.length === 0) {
      throw new TypeError('completar: `mensagens` precisa ser um array não vazio de { role, content }');
    }

    const messages = sistema ? [{ role: 'system', content: sistema }, ...mensagens] : mensagens;

    const modelos = (await modelosEmOrdem()).slice(0, MAX_TENTATIVAS);
    if (modelos.length === 0) {
      throw new IaIndisponivel('A OpenRouter não lista nenhum modelo gratuito no momento.');
    }

    const tentativas = [];

    for (const modelo of modelos) {
      let resposta;
      try {
        resposta = await http.post(
          URL_CHAT,
          { model: modelo, messages, max_tokens: maxTokens, temperature: temperatura },
          {
            headers: {
              Authorization: `Bearer ${chave}`,
              'Content-Type': 'application/json',
              'HTTP-Referer': env.IA_REFERER || 'https://mlkoab.tech',
              'X-Title': 'MA Questoes',
            },
            timeout: timeoutMs,
          }
        );
      } catch (erro) {
        const status = erro?.response?.status;
        // Chave inválida ou sem permissão vale para TODOS os modelos: tentar o
        // próximo só multiplicaria o mesmo erro e esconderia a causa.
        if (status === 401 || status === 403) {
          throw new IaChaveInvalida(
            `A OpenRouter recusou a chave (HTTP ${status}). Confira OPENROUTER_API_KEY (chave revogada, copiada pela metade ou de outra conta).`
          );
        }
        // 429 (limite), 5xx (fora do ar), 404 (id que sumiu entre a listagem e
        // o pedido), timeout — e também 400, porque alguns provedores
        // gratuitos recusam parâmetros que outros aceitam (ex.: mensagem de
        // sistema): é defeito daquele modelo, não do pedido.
        const motivo = motivoDoErro(erro);
        tentativas.push({ modelo, motivo });
        log.warn?.(`[ia] ${modelo}: ${motivo}, tentando o próximo`);
        continue;
      }

      // A OpenRouter às vezes responde 200 com `error` no corpo ou sem texto.
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

    // Todos com 404 logo depois de a listagem confirmar que os ids existem
    // quase nunca é id sumido: é a conta sem permissão para modelos gratuitos
    // ("No endpoints found matching your data policy"). Dizer isso poupa
    // horas procurando defeito de rede.
    if (tentativas.every((t) => t.motivo === 'HTTP 404')) {
      throw new IaIndisponivel(
        'Nenhum modelo gratuito aceitou o pedido (HTTP 404). Habilite o uso de modelos gratuitos em openrouter.ai/settings/privacy.',
        tentativas
      );
    }

    throw new IaIndisponivel(
      'Nenhum modelo de IA gratuito respondeu agora (limite de uso ou indisponibilidade). Tente novamente em alguns minutos.',
      tentativas
    );
  }

  return { listarModelosGratuitos, modelosEmOrdem, completar };
}

// Instância padrão, usada pelas rotas.
const padrao = criarClienteIa();
export const listarModelosGratuitos = padrao.listarModelosGratuitos;
export const modelosEmOrdem = padrao.modelosEmOrdem;
export const completar = padrao.completar;
