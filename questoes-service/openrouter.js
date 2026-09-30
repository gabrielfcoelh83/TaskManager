// Descoberta dos modelos GRATUITOS da OpenRouter.
//
// Por que descobrir em vez de fixar: os ids da OpenRouter somem sem aviso, e
// este projeto já quebrou duas vezes por isso — a rota de geração do front
// tinha três ids que não existiam mais, e a lista que o classificar.js herdou
// perdeu `openai/gpt-oss-20b:free` depois de conferida. Id que não existe
// devolve 404, o laço cai para o próximo, o último também falha, e o
// resultado é "nenhum modelo respondeu" — que parece rede ruim ou chave
// inválida. Aqui a preferência só vale para os ids que a API confirma AGORA.
//
// É a mesma regra de api/_lib/ia.js no MlDireito, reescrita em CommonJS: o
// serviço é empacotado sozinho numa imagem e não pode importar de outro repo.
// Mudou a regra lá, mude aqui.
//
// Gratuito = id terminado em `:free` E preço zero de entrada e de saída. Só o
// sufixo não garante custo zero; só o preço deixaria entrar modelo pago em
// promoção, que passa a cobrar quando a promoção acaba. Plano gratuito: 20
// pedidos/min e 50/dia por chave (1000/dia depois de US$ 10 em créditos).

const URL_MODELOS = 'https://openrouter.ai/api/v1/models';

// A lista muda devagar; 1h poupa uma ida à rede por lote sem prender o script
// a um id que acabou de sumir.
const TTL_MODELOS_MS = 60 * 60 * 1000;

// Teto de modelos por pedido: se a própria chave estourou o limite do dia,
// todos devolvem 429, e varrer a lista inteira só gastaria o resto da cota.
const MAX_TENTATIVAS = 4;

function ehGratuito(modelo) {
  const p = modelo && modelo.pricing;
  if (!modelo || typeof modelo.id !== 'string' || !modelo.id.endsWith(':free')) return false;
  if (!p || String(p.prompt) !== '0' || String(p.completion) !== '0') return false;
  // Modelo que só gera imagem ou áudio não classifica texto. Sem a informação
  // de modalidades, não dá para excluir — fica.
  const saidas = modelo.architecture && modelo.architecture.output_modalities;
  if (Array.isArray(saidas) && !saidas.includes('text')) return false;
  return true;
}

// A env IA_MODELOS (ids separados por vírgula) SUBSTITUI a preferência do
// chamador: trocar de modelo não deveria exigir mudar código.
function lerPreferidos(padrao, env = process.env) {
  const bruto = env.IA_MODELOS;
  if (!bruto || !bruto.trim()) return padrao;
  return bruto
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function ordenarModelos(gratuitos, preferidos) {
  const existentes = new Set(gratuitos.map((m) => m.id));
  const escolhidos = preferidos.filter((id) => existentes.has(id));
  if (escolhidos.length > 0) return escolhidos;

  // Nenhum preferido existe mais: usa o que houver de gratuito, maior contexto
  // primeiro — é o critério objetivo da API que mais se aproxima de "modelo
  // maior", e lote de enunciados precisa de contexto folgado.
  return [...gratuitos]
    .sort((a, b) => (b.context_length || 0) - (a.context_length || 0))
    .map((m) => m.id);
}

// `buscar` (fetch), `agora` e `env` injetáveis para o teste rodar sem rede.
function criarDescoberta({ buscar = (...args) => fetch(...args), agora = Date.now, env = process.env } = {}) {
  let cache = null; // { modelos, em }

  async function listarModelosGratuitos() {
    if (cache && agora() - cache.em < TTL_MODELOS_MS) return cache.modelos;

    try {
      // Endpoint público: listar não exige chave nem gasta cota.
      const res = await buscar(URL_MODELOS, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const corpo = await res.json();
      const lista = Array.isArray(corpo && corpo.data) ? corpo.data : [];
      const modelos = lista.filter(ehGratuito);
      // Lista vazia é resposta estranha, não "não há modelos": não apaga um
      // cache bom por causa dela.
      if (modelos.length === 0 && cache) return cache.modelos;
      cache = { modelos, em: agora() };
      return modelos;
    } catch (err) {
      // Sem rede para a listagem, a última lista conhecida serve: ids não
      // somem de hora em hora.
      if (cache) return cache.modelos;
      throw new Error(`não foi possível listar os modelos da OpenRouter (${err.message})`);
    }
  }

  async function modelosEmOrdem(preferidos) {
    const gratuitos = await listarModelosGratuitos();
    return ordenarModelos(gratuitos, lerPreferidos(preferidos, env)).slice(0, MAX_TENTATIVAS);
  }

  return { listarModelosGratuitos, modelosEmOrdem };
}

const padrao = criarDescoberta();

module.exports = {
  ehGratuito,
  lerPreferidos,
  ordenarModelos,
  criarDescoberta,
  listarModelosGratuitos: padrao.listarModelosGratuitos,
  modelosEmOrdem: padrao.modelosEmOrdem,
  MAX_TENTATIVAS,
};
