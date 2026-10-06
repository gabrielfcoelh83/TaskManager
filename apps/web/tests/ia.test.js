// O que este arquivo protege.
//
// A camada de IA (api/_lib/ia.js) existe porque ids de modelo da OpenRouter
// somem: o projeto já quebrou duas vezes com lista fixa. Os erros que ela
// evita são silenciosos — modelo pago entrando como "gratuito", preferido que
// não existe mais sendo tentado, chave inválida virando "IA indisponível" — e
// só aparecem na conta ou no suporte. Por isso cada regra roda aqui, contra
// uma OpenRouter de mentira: sem rede e sem chave.
//
// Integração opcional: IA_TESTE_REDE=1 lista os modelos de verdade (endpoint
// público, sem chave e sem gastar cota).

import {
  criarClienteIa,
  ehGratuito,
  extrairJson,
  ordenarModelos,
  IaChaveInvalida,
  IaIndisponivel,
  PREFERIDOS,
} from '../api/_lib/ia.js';

const falhas = [];
const exigir = (condicao, mensagem) => {
  if (!condicao) falhas.push(mensagem);
};

const gratis = (id, contexto = 8000) => ({
  id,
  context_length: contexto,
  pricing: { prompt: '0', completion: '0' },
});

const CATALOGO = [
  gratis('google/gemma-4-31b-it:free', 131072),
  gratis('nvidia/nemotron-3-ultra-550b-a55b:free', 262144),
  gratis('outro/pequeno:free', 4096),
  // Pago, mesmo com nome parecido: não pode entrar.
  { id: 'google/gemma-4-31b-it', context_length: 131072, pricing: { prompt: '0.0000001', completion: '0.0000002' } },
  // Sufixo :free mas cobrando: não pode entrar.
  { id: 'enganoso/modelo:free', context_length: 999999, pricing: { prompt: '0', completion: '0.00001' } },
  // Preço zero sem :free (promoção): não pode entrar.
  { id: 'promo/modelo', context_length: 999999, pricing: { prompt: '0', completion: '0' } },
  // Gratuito, mas só gera imagem.
  { ...gratis('imagem/gerador:free', 999999), architecture: { output_modalities: ['image'] } },
];

// Axios de mentira: `aoPost` decide a resposta por modelo; erros imitam o
// formato do axios ({ response: { status } } ou { code }).
function httpFalso({ catalogo = CATALOGO, aoPost = () => ({ data: resposta('ok') }), falharGet = false } = {}) {
  const chamadas = { get: 0, post: [] };
  return {
    chamadas,
    async get() {
      chamadas.get++;
      if (typeof falharGet === 'function' ? falharGet(chamadas.get) : falharGet) {
        const e = new Error('getaddrinfo ENOTFOUND');
        e.code = 'ENOTFOUND';
        throw e;
      }
      return { data: { data: catalogo } };
    },
    async post(url, corpo, config) {
      chamadas.post.push({ modelo: corpo.model, corpo, config });
      return aoPost(corpo.model, chamadas.post.length);
    },
  };
}

const resposta = (texto) => ({ choices: [{ message: { content: texto } }] });
const erroHttp = (status) => Object.assign(new Error(`HTTP ${status}`), { response: { status } });
const silencioso = { warn() {} };
const ENV = { OPENROUTER_API_KEY: 'test-openrouter-key' };
const MSG = [{ role: 'user', content: 'Explique a questão.' }];

async function rejeita(promessa) {
  try {
    await promessa;
    return null;
  } catch (e) {
    return e;
  }
}

// ---------------------------------------------------------------------------
// Filtragem de gratuitos
// ---------------------------------------------------------------------------
{
  const ids = CATALOGO.filter(ehGratuito).map((m) => m.id);
  exigir(
    JSON.stringify(ids) ===
      JSON.stringify(['google/gemma-4-31b-it:free', 'nvidia/nemotron-3-ultra-550b-a55b:free', 'outro/pequeno:free']),
    `gratuitos filtrados errado: ${JSON.stringify(ids)}`
  );
  exigir(!ehGratuito({ id: 'x:free' }), 'modelo sem pricing não pode contar como gratuito');
}

// ---------------------------------------------------------------------------
// Preferência respeitando só os que existem
// ---------------------------------------------------------------------------
{
  const gratuitos = CATALOGO.filter(ehGratuito);

  // O primeiro preferido (qwen) não está no catálogo: some da ordem, sem erro.
  const ordem = ordenarModelos(gratuitos, PREFERIDOS);
  exigir(
    JSON.stringify(ordem) === JSON.stringify(['google/gemma-4-31b-it:free', 'nvidia/nemotron-3-ultra-550b-a55b:free']),
    `preferidos existentes na ordem errada ou com inexistente: ${JSON.stringify(ordem)}`
  );

  // Nenhum preferido existe: cai para todos os gratuitos, maior contexto primeiro.
  const semPreferido = ordenarModelos(gratuitos, ['sumiu/modelo:free']);
  exigir(
    JSON.stringify(semPreferido) ===
      JSON.stringify(['nvidia/nemotron-3-ultra-550b-a55b:free', 'google/gemma-4-31b-it:free', 'outro/pequeno:free']),
    `fallback por context_length errado: ${JSON.stringify(semPreferido)}`
  );

  // IA_MODELOS substitui a lista padrão.
  const http = httpFalso();
  const ia = criarClienteIa({ http, env: { ...ENV, IA_MODELOS: ' outro/pequeno:free , nao/existe:free' }, log: silencioso });
  const pelaEnv = await ia.modelosEmOrdem();
  exigir(
    JSON.stringify(pelaEnv) === JSON.stringify(['outro/pequeno:free']),
    `IA_MODELOS não foi respeitada: ${JSON.stringify(pelaEnv)}`
  );
}

// ---------------------------------------------------------------------------
// Fallback em 429 (e nos outros erros transitórios)
// ---------------------------------------------------------------------------
{
  const http = httpFalso({
    aoPost: (modelo) => {
      if (modelo === 'google/gemma-4-31b-it:free') throw erroHttp(429);
      return { data: resposta('resposta do segundo') };
    },
  });
  const ia = criarClienteIa({ http, env: ENV, log: silencioso });
  const r = await ia.completar({ sistema: 'Você é professor.', mensagens: MSG });

  exigir(r.modelo === 'nvidia/nemotron-3-ultra-550b-a55b:free', `depois do 429 deveria usar o próximo, usou ${r.modelo}`);
  exigir(r.texto === 'resposta do segundo', 'texto da resposta não veio');
  exigir(http.chamadas.post.length === 2, `esperadas 2 chamadas, houve ${http.chamadas.post.length}`);

  const enviado = http.chamadas.post[0];
  exigir(enviado.corpo.messages[0].role === 'system', 'a mensagem de sistema tem de ir na frente');
  exigir(enviado.config.headers.Authorization === 'Bearer test-openrouter-key', 'Authorization Bearer não enviado');
}
{
  // 404 (id que sumiu), 503 e timeout: todos caem para o próximo; todos
  // falhando viram IaIndisponivel com 503 e o motivo de cada tentativa.
  const erros = [erroHttp(404), erroHttp(503)];
  const http = httpFalso({
    catalogo: [...CATALOGO, gratis('qwen/qwen3.8-27b:free')],
    aoPost: (_m, n) => {
      if (n <= 2) throw erros[n - 1];
      throw Object.assign(new Error('timeout of 30000ms exceeded'), { code: 'ECONNABORTED' });
    },
  });
  const ia = criarClienteIa({ http, env: ENV, log: silencioso });
  const e = await rejeita(ia.completar({ mensagens: MSG }));

  exigir(e instanceof IaIndisponivel, `todos falhando deveria dar IaIndisponivel, deu ${e?.name}`);
  exigir(e?.status === 503, 'IaIndisponivel precisa carregar status 503');
  exigir(
    JSON.stringify(e?.tentativas?.map((t) => t.motivo)) === JSON.stringify(['HTTP 404', 'HTTP 503', 'timeout']),
    `motivos das tentativas: ${JSON.stringify(e?.tentativas)}`
  );
}

{
  // Todos com 404: a causa provável é a política de privacidade da conta, e
  // a mensagem tem de apontar para ela, não para "tente mais tarde".
  const http = httpFalso({
    aoPost: () => {
      throw erroHttp(404);
    },
  });
  const ia = criarClienteIa({ http, env: ENV, log: silencioso });
  const e = await rejeita(ia.completar({ mensagens: MSG }));
  exigir(/settings\/privacy/.test(e?.message || ''), `só 404 deveria apontar para a privacidade, veio: ${e?.message}`);
}

// ---------------------------------------------------------------------------
// Parada em 401: chave inválida não é tentada em outro modelo
// ---------------------------------------------------------------------------
{
  const http = httpFalso({
    aoPost: () => {
      throw erroHttp(401);
    },
  });
  const ia = criarClienteIa({ http, env: ENV, log: silencioso });
  const e = await rejeita(ia.completar({ mensagens: MSG }));

  exigir(e instanceof IaChaveInvalida, `401 deveria dar IaChaveInvalida, deu ${e?.name}`);
  exigir(http.chamadas.post.length === 1, `401 deveria parar na 1ª tentativa, houve ${http.chamadas.post.length}`);
  exigir(e?.status !== 401, 'erro de chave do servidor não pode virar 401 (o front deslogaria a pessoa)');
}

// ---------------------------------------------------------------------------
// JSON: cercas de markdown, texto em volta, e JSON inválido troca de modelo
// ---------------------------------------------------------------------------
{
  const cercado = extrairJson('```json\n{"resposta": "c", "motivo": "art. 5º"}\n```');
  exigir(cercado?.resposta === 'c', 'JSON dentro de ```json não foi lido');

  const comTexto = extrairJson('Claro! Aqui está:\n[{"a":1}]\nEspero ter ajudado.');
  exigir(Array.isArray(comTexto) && comTexto[0].a === 1, 'JSON com texto em volta não foi lido');

  let lancou = false;
  try {
    extrairJson('Desculpe, não posso ajudar.');
  } catch {
    lancou = true;
  }
  exigir(lancou, 'texto sem JSON tem de lançar, não devolver vazio');

  const http = httpFalso({
    aoPost: (_m, n) => ({ data: resposta(n === 1 ? 'isto não é json' : '```json\n{"ok": true}\n```') }),
  });
  const ia = criarClienteIa({ http, env: ENV, log: silencioso });
  const r = await ia.completar({ mensagens: MSG, json: true });
  exigir(r.json?.ok === true, 'json=true deveria devolver o objeto parseado');
  exigir(http.chamadas.post.length === 2, 'JSON inválido do 1º modelo deveria levar ao 2º');
}

// ---------------------------------------------------------------------------
// Sem chave: erro claro, e nenhuma ida à rede
// ---------------------------------------------------------------------------
{
  const http = httpFalso();
  const ia = criarClienteIa({ http, env: {}, log: silencioso });
  const e = await rejeita(ia.completar({ mensagens: MSG }));

  exigir(e instanceof IaChaveInvalida, `sem chave deveria dar IaChaveInvalida, deu ${e?.name}`);
  exigir(/OPENROUTER_API_KEY/.test(e?.message || ''), 'a mensagem precisa dizer qual variável falta');
  exigir(http.chamadas.get === 0 && http.chamadas.post.length === 0, 'sem chave não pode haver chamada de rede');
}

// ---------------------------------------------------------------------------
// Cache: uma listagem por TTL, e o último cache quando a rede cai
// ---------------------------------------------------------------------------
{
  let relogio = 1_000_000;
  const http = httpFalso({ falharGet: (n) => n >= 2 });
  const ia = criarClienteIa({ http, env: ENV, agora: () => relogio, log: silencioso });

  const primeira = await ia.listarModelosGratuitos();
  await ia.listarModelosGratuitos();
  exigir(http.chamadas.get === 1, `dentro do TTL deveria listar 1 vez, listou ${http.chamadas.get}`);

  relogio += 2 * 60 * 60 * 1000; // passou do TTL; a próxima listagem falha
  const depois = await ia.listarModelosGratuitos();
  exigir(http.chamadas.get === 2, 'passado o TTL deveria tentar listar de novo');
  exigir(depois.length === primeira.length && depois.length > 0, 'com a rede fora, deveria usar o último cache');

  // Sem cache nenhum e sem rede: IaIndisponivel, não lista vazia.
  const semCache = criarClienteIa({ http: httpFalso({ falharGet: true }), env: ENV, log: silencioso });
  const e = await rejeita(semCache.listarModelosGratuitos());
  exigir(e instanceof IaIndisponivel, `sem rede e sem cache deveria dar IaIndisponivel, deu ${e?.name}`);
}

// ---------------------------------------------------------------------------
// Integração opcional: a listagem real
// ---------------------------------------------------------------------------
if (process.env.IA_TESTE_REDE === '1') {
  const ia = criarClienteIa({ env: {}, log: silencioso });
  const modelos = await ia.listarModelosGratuitos();
  exigir(modelos.length > 0, 'a OpenRouter real não listou nenhum modelo gratuito');
  exigir(modelos.every(ehGratuito), 'a listagem real deixou passar modelo não gratuito');
  const ordem = await ia.modelosEmOrdem();
  console.log(`   rede: ${modelos.length} gratuitos; ordem de uso: ${ordem.slice(0, 4).join(', ')}`);
  const sumiram = PREFERIDOS.filter((id) => !modelos.some((m) => m.id === id));
  if (sumiram.length > 0) console.log(`   ⚠ preferidos que não existem mais: ${sumiram.join(', ')}`);
}

if (falhas.length > 0) {
  console.error(`\n❌ ${falhas.length} problema(s):`);
  for (const f of falhas) console.error('   - ' + f);
  process.exit(1);
}

console.log(
  '✅ ia: só gratuitos, preferidos só se existem, fallback em 429/404/5xx/timeout, para em 401, JSON com cercas, sem chave não chama a rede, cache com TTL' +
    (process.env.IA_TESTE_REDE === '1' ? ', listagem real OK' : ' (rede não testada; IA_TESTE_REDE=1 para testar)')
);
