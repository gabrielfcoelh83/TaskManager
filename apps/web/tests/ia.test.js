// O que este arquivo protege.
//
// A camada de IA (api/_lib/ia.js) existe porque ids de modelo somem: o
// projeto já quebrou duas vezes com lista fixa. Os erros que ela evita são
// silenciosos — modelo sem cota gratuita (pro) entrando na lista, preferido
// que não existe mais sendo tentado, chave inválida virando "IA
// indisponível", chave vazando em URL — e só aparecem na conta ou no suporte.
// Por isso cada regra roda aqui, contra um Gemini de mentira: sem rede e sem
// chave de verdade.
//
// Integração opcional: IA_TESTE_REDE=1 com GEMINI_API_KEY lista os modelos de
// verdade (listar não gasta cota de geração).

import {
  criarClienteIa,
  ehModeloDeTexto,
  extrairJson,
  ordenarModelos,
  IaChaveInvalida,
  IaIndisponivel,
} from '../api/_lib/ia.js';

const falhas = [];
const exigir = (condicao, mensagem) => {
  if (!condicao) falhas.push(mensagem);
};

const texto = (id, extra = {}) => ({
  name: `models/${id}`,
  supportedGenerationMethods: ['generateContent', 'countTokens'],
  ...extra,
});

const CATALOGO = [
  texto('gemini-3.7-flash'),
  texto('gemini-3.8-flash', { thinking: true }),
  texto('gemini-flash-latest'),
  texto('gemini-3.5-flash'),
  // Fora da regra padrão: pro (sem cota grátis), lite, preview, gemma.
  texto('gemini-pro-latest'),
  texto('gemini-3.5-flash-lite'),
  texto('gemini-3-flash-preview'),
  texto('gemma-4-31b-it'),
  // Não gera texto.
  { name: 'models/gemini-embedding-2', supportedGenerationMethods: ['embedContent'] },
];

// Axios de mentira: `aoPost` decide a resposta por modelo; erros imitam o
// formato do axios ({ response: { status, data } } ou { code }).
function httpFalso({ catalogo = CATALOGO, aoPost = () => ({ data: resposta('ok') }), falharGet = false } = {}) {
  const chamadas = { get: [], post: [] };
  return {
    chamadas,
    async get(url, config) {
      chamadas.get.push({ url, config });
      const falha = typeof falharGet === 'function' ? falharGet(chamadas.get.length) : falharGet;
      if (falha) {
        if (falha instanceof Error) throw falha;
        throw Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' });
      }
      return { data: { models: catalogo } };
    },
    async post(url, corpo, config) {
      chamadas.post.push({ url, modelo: corpo.model, corpo, config });
      return aoPost(corpo.model, chamadas.post.length);
    },
  };
}

const resposta = (t) => ({ choices: [{ message: { content: t } }] });
const erroHttp = (status, data) => Object.assign(new Error(`HTTP ${status}`), { response: { status, data } });
const silencioso = { warn() {} };
const CHAVE = 'test-gemini-key';
const ENV = { GEMINI_API_KEY: CHAVE };
const MSG = [{ role: 'user', content: 'Explique a questão.' }];
const ORDEM_PADRAO = ['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.5-flash', 'gemini-flash-latest'];

async function rejeita(promessa) {
  try {
    await promessa;
    return null;
  } catch (e) {
    return e;
  }
}

// ---------------------------------------------------------------------------
// Regra padrão: flash estável por versão, depois o apelido; o resto fica fora
// ---------------------------------------------------------------------------
{
  exigir(ehModeloDeTexto(CATALOGO[0]), 'modelo com generateContent deveria contar como de texto');
  exigir(!ehModeloDeTexto(CATALOGO.at(-1)), 'modelo só de embedding não pode contar como de texto');

  const ids = CATALOGO.filter(ehModeloDeTexto).map((m) => m.name.replace('models/', ''));
  const ordem = ordenarModelos(ids);
  exigir(JSON.stringify(ordem) === JSON.stringify(ORDEM_PADRAO), `regra padrão errada: ${JSON.stringify(ordem)}`);

  // GEMINI_MODELOS substitui a regra, mas só com o que existe.
  const http = httpFalso();
  const ia = criarClienteIa({
    http,
    env: { ...ENV, GEMINI_MODELOS: ' gemma-4-31b-it , models/nao-existe , gemini:gemini-3.5-flash' },
    log: silencioso,
  });
  const pelaEnv = await ia.modelosEmOrdem();
  exigir(
    JSON.stringify(pelaEnv) === JSON.stringify(['gemma-4-31b-it', 'gemini-3.5-flash']),
    `GEMINI_MODELOS não foi respeitada: ${JSON.stringify(pelaEnv)}`
  );

  // Nenhum da env existe: volta à regra padrão em vez de ficar sem modelo.
  const ia2 = criarClienteIa({ http: httpFalso(), env: { ...ENV, GEMINI_MODELOS: 'sumiu' }, log: silencioso });
  const semNada = await ia2.modelosEmOrdem();
  exigir(JSON.stringify(semNada) === JSON.stringify(ORDEM_PADRAO), `GEMINI_MODELOS inexistente deveria cair na regra: ${JSON.stringify(semNada)}`);
}

// ---------------------------------------------------------------------------
// Chave só em header, nunca na URL
// ---------------------------------------------------------------------------
{
  const http = httpFalso();
  const ia = criarClienteIa({ http, env: ENV, log: silencioso });
  await ia.completar({ sistema: 'Você é professor.', mensagens: MSG });

  const get = http.chamadas.get[0];
  exigir(get.config.headers['x-goog-api-key'] === CHAVE, 'a listagem deveria mandar a chave em x-goog-api-key');
  const post = http.chamadas.post[0];
  exigir(post.config.headers.Authorization === `Bearer ${CHAVE}`, 'o chat deveria mandar Authorization Bearer');
  const urls = [get.url, JSON.stringify(get.config.params || {}), post.url];
  exigir(urls.every((u) => !u.includes(CHAVE)), 'a chave não pode ir na URL nem em params');
  exigir(/\/v1beta\/openai\/chat\/completions$/.test(post.url), `rota de chat inesperada: ${post.url}`);
  exigir(post.corpo.messages[0].role === 'system', 'a mensagem de sistema tem de ir na frente');

  // O primeiro (3.8) raciocina: pouco raciocínio e folga no teto.
  exigir(post.modelo === 'gemini-3.8-flash', `deveria começar pelo 3.8, começou por ${post.modelo}`);
  exigir(post.corpo.reasoning_effort === 'low', 'modelo que pensa deveria receber reasoning_effort low');
  exigir(post.corpo.max_tokens > 1024, 'modelo que pensa deveria ganhar folga no max_tokens');
}

// ---------------------------------------------------------------------------
// Fallback em 429 e 503 (e nos outros erros transitórios)
// ---------------------------------------------------------------------------
{
  const http = httpFalso({
    aoPost: (modelo) => {
      if (modelo === 'gemini-3.8-flash') throw erroHttp(503);
      if (modelo === 'gemini-3.7-flash') throw erroHttp(429);
      return { data: resposta('resposta do terceiro') };
    },
  });
  const ia = criarClienteIa({ http, env: ENV, log: silencioso });
  const r = await ia.completar({ mensagens: MSG });

  exigir(r.modelo === 'gemini-3.5-flash', `depois de 503 e 429 deveria usar o terceiro, usou ${r.modelo}`);
  exigir(r.texto === 'resposta do terceiro', 'texto da resposta não veio');
  exigir(!('reasoning_effort' in http.chamadas.post[2].corpo), 'modelo que não pensa não recebe reasoning_effort');
}
{
  // 404 (id que sumiu), 503, 429 e timeout: todos falhando viram
  // IaIndisponivel com 503 e o motivo de cada tentativa.
  const erros = [erroHttp(404), erroHttp(503), erroHttp(429)];
  const http = httpFalso({
    aoPost: (_m, n) => {
      if (n <= 3) throw erros[n - 1];
      throw Object.assign(new Error('timeout of 30000ms exceeded'), { code: 'ECONNABORTED' });
    },
  });
  const ia = criarClienteIa({ http, env: ENV, log: silencioso });
  const e = await rejeita(ia.completar({ mensagens: MSG }));

  exigir(e instanceof IaIndisponivel, `todos falhando deveria dar IaIndisponivel, deu ${e?.name}`);
  exigir(e?.status === 503, 'IaIndisponivel precisa carregar status 503');
  exigir(
    JSON.stringify(e?.tentativas?.map((t) => t.motivo)) === JSON.stringify(['HTTP 404', 'HTTP 503', 'HTTP 429', 'timeout']),
    `motivos das tentativas: ${JSON.stringify(e?.tentativas)}`
  );
}

// ---------------------------------------------------------------------------
// Chave recusada: para na hora (401/403 e o 400 "API key not valid" do Google)
// ---------------------------------------------------------------------------
for (const erro of [
  erroHttp(401),
  erroHttp(403),
  erroHttp(400, { error: { message: 'API key not valid. Please pass a valid API key.' } }),
]) {
  const http = httpFalso({
    aoPost: () => {
      throw erro;
    },
  });
  const ia = criarClienteIa({ http, env: ENV, log: silencioso });
  const e = await rejeita(ia.completar({ mensagens: MSG }));

  exigir(e instanceof IaChaveInvalida, `${erro.message} deveria dar IaChaveInvalida, deu ${e?.name}`);
  exigir(http.chamadas.post.length === 1, `chave recusada deveria parar na 1ª tentativa, houve ${http.chamadas.post.length}`);
  exigir(e?.status !== 401, 'erro de chave do servidor não pode virar 401 (o front deslogaria a pessoa)');
  exigir(!String(e?.message).includes(CHAVE), 'a mensagem de erro não pode conter a chave');
}
{
  // 400 que não é de chave (ex.: parâmetro recusado) cai para o próximo.
  const http = httpFalso({
    aoPost: (_m, n) => {
      if (n === 1) throw erroHttp(400, { error: { message: 'Invalid value for max_tokens' } });
      return { data: resposta('ok') };
    },
  });
  const ia = criarClienteIa({ http, env: ENV, log: silencioso });
  const r = await ia.completar({ mensagens: MSG });
  exigir(r.texto === 'ok' && http.chamadas.post.length === 2, '400 que não é de chave deveria levar ao próximo modelo');
}
{
  // Chave recusada já na listagem: IaChaveInvalida, sem tentar o chat.
  const http = httpFalso({ falharGet: () => erroHttp(400, { error: { message: 'API key not valid.' } }) });
  const ia = criarClienteIa({ http, env: ENV, log: silencioso });
  const e = await rejeita(ia.completar({ mensagens: MSG }));
  exigir(e instanceof IaChaveInvalida, `chave recusada na listagem deveria dar IaChaveInvalida, deu ${e?.name}`);
  exigir(http.chamadas.post.length === 0, 'com a chave recusada na listagem, o chat não pode ser chamado');
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
  exigir(/GEMINI_API_KEY/.test(e?.message || ''), 'a mensagem precisa dizer qual variável falta');
  exigir(http.chamadas.get.length === 0 && http.chamadas.post.length === 0, 'sem chave não pode haver chamada de rede');
}

// ---------------------------------------------------------------------------
// Cache: uma listagem por TTL, e o último cache quando a rede cai
// ---------------------------------------------------------------------------
{
  let relogio = 1_000_000;
  const http = httpFalso({ falharGet: (n) => n >= 2 });
  const ia = criarClienteIa({ http, env: ENV, agora: () => relogio, log: silencioso });

  const primeira = await ia.listarModelos();
  await ia.listarModelos();
  exigir(http.chamadas.get.length === 1, `dentro do TTL deveria listar 1 vez, listou ${http.chamadas.get.length}`);

  relogio += 2 * 60 * 60 * 1000; // passou do TTL; a próxima listagem falha
  const depois = await ia.listarModelos();
  exigir(http.chamadas.get.length === 2, 'passado o TTL deveria tentar listar de novo');
  exigir(depois.length === primeira.length && depois.length > 0, 'com a rede fora, deveria usar o último cache');

  // Sem cache nenhum e sem rede: IaIndisponivel, não lista vazia.
  const semCache = criarClienteIa({ http: httpFalso({ falharGet: true }), env: ENV, log: silencioso });
  const e = await rejeita(semCache.listarModelos());
  exigir(e instanceof IaIndisponivel, `sem rede e sem cache deveria dar IaIndisponivel, deu ${e?.name}`);
}

{
  // Listagem vazia numa instância nova não entra no cache: a próxima chamada
  // lista de novo (senão a IA ficaria travada por 1 h).
  let n = 0;
  const http = httpFalso();
  http.get = async () => {
    n++;
    return { data: { models: n === 1 ? [] : CATALOGO } };
  };
  const ia = criarClienteIa({ http, env: ENV, log: silencioso });
  const vazia = await ia.listarModelos();
  const cheia = await ia.listarModelos();
  exigir(vazia.length === 0 && cheia.length > 0 && n === 2, `lista vazia não pode ficar no cache (n=${n})`);
}
{
  // Paginação: segue nextPageToken.
  const pedidos = [];
  const http = httpFalso();
  http.get = async (_url, config) => {
    pedidos.push(config.params.pageToken || null);
    return config.params.pageToken
      ? { data: { models: [texto('gemini-3.9-flash')] } }
      : { data: { models: CATALOGO, nextPageToken: 'p2' } };
  };
  const ia = criarClienteIa({ http, env: ENV, log: silencioso });
  const ordem = await ia.modelosEmOrdem();
  exigir(JSON.stringify(pedidos) === JSON.stringify([null, 'p2']), `deveria pedir a 2ª página: ${JSON.stringify(pedidos)}`);
  exigir(ordem[0] === 'gemini-3.9-flash', `modelo da 2ª página deveria entrar (e primeiro): ${ordem[0]}`);
}

// ---------------------------------------------------------------------------
// Integração opcional: a listagem real
// ---------------------------------------------------------------------------
if (process.env.IA_TESTE_REDE === '1') {
  const ia = criarClienteIa({ log: silencioso });
  const modelos = await ia.listarModelos();
  exigir(modelos.length > 0, 'o Gemini real não listou nenhum modelo de texto');
  const ordem = await ia.modelosEmOrdem();
  exigir(ordem.length > 0, 'a regra padrão não achou nenhum flash na listagem real');
  console.log(`   rede: ${modelos.length} modelos de texto; ordem de uso: ${ordem.slice(0, 4).join(', ')}`);
}

if (falhas.length > 0) {
  console.error(`\n❌ ${falhas.length} problema(s):`);
  for (const f of falhas) console.error('   - ' + f);
  process.exit(1);
}

console.log(
  '✅ ia: só flash estável, GEMINI_MODELOS só se existe, chave só em header, fallback em 429/503/404/timeout, para em chave recusada, JSON com cercas, sem chave não chama a rede, cache com TTL' +
    (process.env.IA_TESTE_REDE === '1' ? ', listagem real OK' : ' (rede não testada; IA_TESTE_REDE=1 para testar)')
);
