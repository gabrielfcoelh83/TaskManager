// Gemini gerando e OpenRouter conferindo, pelo cliente HTTP real
// (criarRoteador) com `fetch` simulado: nenhum pedido sai para o Google nem
// para a OpenRouter. As listas de modelos são injetadas (a descoberta tem
// teste próprio em gemini.test.js).

process.env.JWT_SECRET = process.env.JWT_SECRET || 'segredo-de-teste';

const { pool } = require('../app');
const { migrate } = require('../migrate');
const {
  explicar,
  conferirGravadas,
  criarRoteador,
  linhaDeCusto,
  PROMPT_SISTEMA,
  PROMPT_CONFERENCIA,
  GEMINI_URL,
} = require('../explicar');

const EXAME_TESTE = 94;
const silencio = () => {};
const CHAVE_GEMINI = 'gk-teste-0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHI';
const CHAVE_OR = 'sk-or-teste-chave';
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

const limpar = () => pool.query('DELETE FROM questoes WHERE exame = $1', [EXAME_TESTE]);

async function inserir(numero, campos = {}) {
  const { rows } = await pool.query(
    `INSERT INTO questoes
       (exame, tipo_prova, numero, ano, enunciado, alternativas, gabarito, anulada,
        explicacao, explicacao_fonte, revisada, explicacao_modelo)
     VALUES ($1,1,$2,2025,$3,$4,$5,FALSE,$6,$7,FALSE,$8)
     RETURNING id`,
    [
      EXAME_TESTE,
      numero,
      `Enunciado da questão ${numero}, com texto suficiente.`,
      JSON.stringify(['alfa', 'beta', 'gama', 'delta']),
      2,
      campos.explicacao ?? null,
      campos.explicacao_fonte ?? null,
      campos.explicacao_modelo ?? null,
    ]
  );
  return Number(rows[0].id);
}

const buscar = async (id) =>
  (await pool.query('SELECT explicacao, explicacao_fonte, explicacao_modelo FROM questoes WHERE id = $1', [id])).rows[0];

const textoBom = (marca = '') =>
  `${marca} A alternativa indicada está correta porque reproduz a regra legal aplicável ao caso narrado. ` +
  'As demais alternativas estão erradas: uma inverte o requisito, outra troca o prazo e a última ' +
  'confunde o instituto com outro parecido. '.repeat(4);

const itens = (prompt) => JSON.parse(prompt.slice(prompt.indexOf('['), prompt.indexOf(']\n\nResponda') + 1));
const ok = (conteudo) => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: conteudo } }] }) });

const LISTAS = {
  openrouter: async () => [
    'nvidia/nemotron-3-ultra-550b-a55b:free',
    'google/gemma-4-31b-it:free',
    'nvidia/nemotron-3-super-120b-a12b:free',
  ],
  gemini: async () => [
    { id: 'gemini-3.8-flash', pensa: true },
    { id: 'gemini-3.7-flash', pensa: true },
    { id: 'gemma-4-31b-it', pensa: false },
  ],
};

// Responde pelo provedor da URL; `falhar` = { '<provedor>:<modelo>': status };
// `lancar` = provedor:modelo cujo fetch rejeita com `lancar[...]` (mensagem).
function fetchSimulado({ falhar = {}, lancar = {} } = {}) {
  return jest.fn(async (url, opts) => {
    const provedor = url === GEMINI_URL ? 'gemini' : url === OPENROUTER_URL ? 'openrouter' : null;
    if (!provedor) throw new Error(`URL inesperada: ${url}`);
    const corpo = JSON.parse(opts.body);
    const nome = `${provedor}:${corpo.model}`;
    if (lancar[nome]) throw new Error(lancar[nome]);
    if (falhar[nome]) return { ok: false, status: falhar[nome] };
    const [sistema, usuario] = corpo.messages.map((m) => m.content);
    if (sistema === PROMPT_SISTEMA) {
      return ok(JSON.stringify(itens(usuario).map((q) => ({ id: q.id, correta: q.gabarito_oficial, explicacao: textoBom(`[${q.id}]`) }))));
    }
    if (sistema === PROMPT_CONFERENCIA) {
      return ok(JSON.stringify(itens(usuario).map((q) => ({ id: q.id, aprovada: true, problemas: [] }))));
    }
    throw new Error('prompt de sistema desconhecido');
  });
}

// [papel, provedor:modelo] de cada pedido feito.
const pedidos = () =>
  global.fetch.mock.calls.map(([url, o]) => {
    const c = JSON.parse(o.body);
    const provedor = url === GEMINI_URL ? 'gemini' : 'openrouter';
    return [c.messages[0].content === PROMPT_SISTEMA ? 'gera' : 'confere', `${provedor}:${c.model}`];
  });

function rodar(chaves, { gerador, excluir = [], ...resto } = {}) {
  const roteador = criarRoteador({ chaves, gerador, listar: LISTAS });
  return explicar({
    exame: EXAME_TESTE,
    aplicar: true,
    log: silencio,
    excluir,
    chamarModelo: (p) => roteador.gerar(p, { excluir }),
    conferirModelo: (p, { excluir: fora }) => roteador.conferir(p, { excluir: fora }),
    ...resto,
  });
}

const fetchOriginal = global.fetch;

beforeAll(async () => {
  await migrate(pool);
  await limpar();
});

afterEach(async () => {
  global.fetch = fetchOriginal;
  await limpar();
});

afterAll(async () => {
  await limpar();
  await pool.end();
});

describe('Gemini gera, OpenRouter confere', () => {
  it('grava com explicacao_modelo "gemini:..." e conferente de outro fabricante (não o gemma)', async () => {
    const id = await inserir(1);
    global.fetch = fetchSimulado();

    const r = await rodar({ gemini: CHAVE_GEMINI, openrouter: CHAVE_OR });

    expect(pedidos()).toEqual([
      ['gera', 'gemini:gemini-3.8-flash'],
      ['confere', 'openrouter:nvidia/nemotron-3-ultra-550b-a55b:free'],
    ]);
    expect(r).toMatchObject({
      gravadas: 1,
      pedidos: 2,
      pedidosPorProvedor: { gemini: 1, openrouter: 1 },
      modelos: ['gemini:gemini-3.8-flash'],
      modelosConferencia: ['openrouter:nvidia/nemotron-3-ultra-550b-a55b:free'],
    });
    expect(await buscar(id)).toMatchObject({ explicacao_fonte: 'ia', explicacao_modelo: 'gemini:gemini-3.8-flash' });
    expect(linhaDeCusto(r)).toMatch(/OpenRouter 1 .*Gemini 1/);
  });

  it('pedido ao Gemini: rota compatível, Bearer, chave fora da URL, reasoning_effort só para quem pensa', async () => {
    await inserir(1);
    global.fetch = fetchSimulado();
    await rodar({ gemini: CHAVE_GEMINI, openrouter: CHAVE_OR });

    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions');
    expect(url).not.toContain(CHAVE_GEMINI);
    expect(opts.headers.Authorization).toBe(`Bearer ${CHAVE_GEMINI}`);
    const corpo = JSON.parse(opts.body);
    expect(corpo).toMatchObject({ model: 'gemini-3.8-flash', temperature: 0.2, reasoning_effort: 'low' });
    expect(corpo.max_tokens).toBeGreaterThan(4096);
    // O conferente da OpenRouter recebe o corpo de sempre, sem campo do Gemini.
    const conf = JSON.parse(global.fetch.mock.calls[1][1].body);
    expect(conf.reasoning_effort).toBeUndefined();
    expect(conf).toMatchObject({ temperature: 0, max_tokens: 1500 });
    expect(global.fetch.mock.calls[1][1].headers.Authorization).toBe(`Bearer ${CHAVE_OR}`);
  });

  it('429 no Gemini passa ao próximo modelo Gemini (não à OpenRouter)', async () => {
    const id = await inserir(1);
    global.fetch = fetchSimulado({ falhar: { 'gemini:gemini-3.8-flash': 429 } });

    const r = await rodar({ gemini: CHAVE_GEMINI, openrouter: CHAVE_OR });

    expect(pedidos()).toEqual([
      ['gera', 'gemini:gemini-3.8-flash'],
      ['gera', 'gemini:gemini-3.7-flash'],
      ['confere', 'openrouter:nvidia/nemotron-3-ultra-550b-a55b:free'],
    ]);
    expect(r).toMatchObject({ gravadas: 1, pedidosPorProvedor: { gemini: 2, openrouter: 1 } });
    expect((await buscar(id)).explicacao_modelo).toBe('gemini:gemini-3.7-flash');
  });

  it('todos os Gemini em 429: rodada interrompida com mensagem clara, sem gerar pela OpenRouter', async () => {
    for (let n = 1; n <= 4; n++) await inserir(n);
    global.fetch = fetchSimulado({
      falhar: { 'gemini:gemini-3.8-flash': 429, 'gemini:gemini-3.7-flash': 429, 'gemini:gemma-4-31b-it': 429 },
    });

    const r = await rodar({ gemini: CHAVE_GEMINI, openrouter: CHAVE_OR }, { lote: 2 });

    expect(pedidos().every(([papel, m]) => papel === 'gera' && m.startsWith('gemini:'))).toBe(true);
    expect(pedidos()).toHaveLength(3); // só o 1º lote; o 2º nem é tentado
    expect(r.interrompida).toMatch(/429.*\(gemini\).*|\(gemini\) devolveram 429/);
    expect(r.interrompida).toMatch(/cota/);
    expect(r).toMatchObject({ gravadas: 0, pedidosPorProvedor: { gemini: 3 } });
  });

  it('OpenRouter toda em 429 na conferência: cai para outro modelo Gemini, nunca o gerador', async () => {
    const id = await inserir(1);
    global.fetch = fetchSimulado({
      falhar: {
        'openrouter:nvidia/nemotron-3-ultra-550b-a55b:free': 429,
        'openrouter:google/gemma-4-31b-it:free': 429,
        'openrouter:nvidia/nemotron-3-super-120b-a12b:free': 429,
      },
    });

    const r = await rodar({ gemini: CHAVE_GEMINI, openrouter: CHAVE_OR });

    const confere = pedidos().filter(([p]) => p === 'confere').map(([, m]) => m);
    expect(confere).toEqual([
      'openrouter:nvidia/nemotron-3-ultra-550b-a55b:free',
      'openrouter:nvidia/nemotron-3-super-120b-a12b:free',
      'openrouter:google/gemma-4-31b-it:free',
      'gemini:gemini-3.7-flash',
    ]);
    expect(confere).not.toContain('gemini:gemini-3.8-flash');
    expect(r).toMatchObject({ gravadas: 1, modelosConferencia: ['gemini:gemini-3.7-flash'] });
    expect((await buscar(id)).explicacao_modelo).toBe('gemini:gemini-3.8-flash');
  });

  it('só com GEMINI_API_KEY: confere com outro modelo Gemini, nunca o gerador', async () => {
    await inserir(1);
    global.fetch = fetchSimulado();

    const r = await rodar({ gemini: CHAVE_GEMINI });

    expect(pedidos()).toEqual([
      ['gera', 'gemini:gemini-3.8-flash'],
      ['confere', 'gemini:gemini-3.7-flash'],
    ]);
    expect(r.gravadas).toBe(1);
    expect(global.fetch.mock.calls.every(([url]) => url === GEMINI_URL)).toBe(true);
  });

  it('só um modelo Gemini e nenhuma OpenRouter: não grava e para (sem conferente)', async () => {
    const id = await inserir(1);
    global.fetch = fetchSimulado();
    const roteador = criarRoteador({ chaves: { gemini: CHAVE_GEMINI }, listar: { gemini: async () => ['gemini-3.8-flash'] } });
    const r = await explicar({
      exame: EXAME_TESTE,
      aplicar: true,
      log: silencio,
      chamarModelo: (p) => roteador.gerar(p),
      conferirModelo: (p, o) => roteador.conferir(p, o),
    });
    expect(r).toMatchObject({ gravadas: 0, semConferente: 1 });
    expect(r.interrompida).toMatch(/sem segundo modelo/);
    expect((await buscar(id)).explicacao).toBeNull();
  });
});

describe('sem GEMINI_API_KEY nada muda', () => {
  it('gera e confere só pela OpenRouter, nos modelos de sempre', async () => {
    const id = await inserir(1);
    global.fetch = fetchSimulado();

    const roteador = criarRoteador({ chaves: { openrouter: CHAVE_OR }, listar: LISTAS });
    expect(roteador.gerador).toBe('openrouter');
    const r = await rodar({ openrouter: CHAVE_OR });

    expect(pedidos()).toEqual([
      ['gera', 'openrouter:nvidia/nemotron-3-ultra-550b-a55b:free'],
      ['confere', 'openrouter:google/gemma-4-31b-it:free'],
    ]);
    expect(global.fetch.mock.calls.every(([url]) => url === OPENROUTER_URL)).toBe(true);
    const corpo = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(Object.keys(corpo).sort()).toEqual(['max_tokens', 'messages', 'model', 'temperature']);
    expect(r).toMatchObject({ gravadas: 1, pedidosPorProvedor: { openrouter: 2 } });
    expect(linhaDeCusto(r)).toBe('custo: 2 pedido(s) à OpenRouter (cota gratuita: 50/dia)');
    expect((await buscar(id)).explicacao_modelo).toBe('openrouter:nvidia/nemotron-3-ultra-550b-a55b:free');
  });

  it('--gerador gemini sem GEMINI_API_KEY é recusado antes de qualquer pedido', () => {
    expect(() => criarRoteador({ chaves: { openrouter: CHAVE_OR }, gerador: 'gemini' })).toThrow(/GEMINI_API_KEY/);
  });

  it('--gerador openrouter com as duas chaves: OpenRouter gera, o Gemini pode conferir', async () => {
    await inserir(1);
    global.fetch = fetchSimulado();
    const r = await rodar({ gemini: CHAVE_GEMINI, openrouter: CHAVE_OR }, { gerador: 'openrouter' });
    expect(pedidos()).toEqual([
      ['gera', 'openrouter:nvidia/nemotron-3-ultra-550b-a55b:free'],
      ['confere', 'gemini:gemini-3.8-flash'],
    ]);
    expect(r.gravadas).toBe(1);
  });
});

describe('chave fora das mensagens de erro', () => {
  it('erro de rede que traz a chave sai no resumo sem ela', async () => {
    await inserir(1);
    global.fetch = fetchSimulado({
      lancar: {
        'gemini:gemini-3.8-flash': `fetch failed: Authorization: Bearer ${CHAVE_GEMINI}`,
        'gemini:gemini-3.7-flash': `ECONNRESET ?key=${CHAVE_GEMINI}`,
        'gemini:gemma-4-31b-it': `timeout ${CHAVE_GEMINI}`,
      },
    });

    const r = await rodar({ gemini: CHAVE_GEMINI, openrouter: CHAVE_OR });

    expect(r.lotesComErro).toBe(1);
    const texto = JSON.stringify(r);
    expect(texto).not.toContain(CHAVE_GEMINI);
    expect(texto).toContain('[chave oculta]');
  });

  it('falha de listagem do Gemini no roteador não vaza a chave', async () => {
    const roteador = criarRoteador({
      chaves: { gemini: CHAVE_GEMINI },
      listar: {
        gemini: async (chave) => {
          throw new Error(`HTTP 403 para ${chave}`);
        },
      },
    });
    const err = await roteador.gerar('p').catch((e) => e);
    expect(err).toMatchObject({ listagem: true, tentativas: 0 });
    expect(err.message).not.toContain(CHAVE_GEMINI);
  });
});

describe('--excluir com e sem prefixo', () => {
  it('"gemini:gemini-3.8-flash" tira esse modelo da geração e da conferência', async () => {
    const id = await inserir(1);
    global.fetch = fetchSimulado();
    await rodar({ gemini: CHAVE_GEMINI }, { excluir: ['gemini:gemini-3.8-flash'] });
    expect(pedidos()).toEqual([
      ['gera', 'gemini:gemini-3.7-flash'],
      ['confere', 'gemini:gemma-4-31b-it'],
    ]);
    expect((await buscar(id)).explicacao_modelo).toBe('gemini:gemini-3.7-flash');
  });

  it('sem prefixo exclui o id em qualquer provedor', async () => {
    await inserir(1);
    global.fetch = fetchSimulado();
    await rodar({ gemini: CHAVE_GEMINI }, { excluir: ['gemini-3.8-flash'] });
    expect(pedidos()[0]).toEqual(['gera', 'gemini:gemini-3.7-flash']);
  });

  it('"openrouter:<id>" não exclui o modelo de mesmo nome do Gemini', async () => {
    await inserir(1);
    global.fetch = fetchSimulado();
    await rodar({ gemini: CHAVE_GEMINI }, { excluir: ['openrouter:gemini-3.8-flash'] });
    expect(pedidos()[0]).toEqual(['gera', 'gemini:gemini-3.8-flash']);
  });
});

describe('--conferir-gravadas com autores antigos e novos', () => {
  it('autor gravado sem prefixo (OpenRouter, antes deste PR) nunca confere; "gemini:..." também não', async () => {
    const antiga = await inserir(1, {
      explicacao: textoBom('[a]').trim(),
      explicacao_fonte: 'ia',
      explicacao_modelo: 'nvidia/nemotron-3-ultra-550b-a55b:free',
    });
    const nova = await inserir(2, {
      explicacao: textoBom('[b]').trim(),
      explicacao_fonte: 'ia',
      explicacao_modelo: 'gemini:gemini-3.8-flash',
    });
    global.fetch = fetchSimulado();
    const roteador = criarRoteador({ chaves: { gemini: CHAVE_GEMINI, openrouter: CHAVE_OR }, listar: LISTAS });

    const r = await conferirGravadas({
      exame: EXAME_TESTE,
      log: silencio,
      conferirModelo: (p, o) => roteador.conferir(p, o),
    });

    // Autores: nvidia e google → nenhum fabricante "de fora"; o 1º não excluído.
    expect(r.modelosConferencia).toEqual(['openrouter:google/gemma-4-31b-it:free']);
    expect(r.modelosConferencia).not.toContain('openrouter:nvidia/nemotron-3-ultra-550b-a55b:free');
    expect(r.modelosConferencia).not.toContain('gemini:gemini-3.8-flash');
    expect(r.aprovadas).toBe(2);
    expect(await buscar(antiga)).toMatchObject({ explicacao_fonte: 'ia' });
    expect(await buscar(nova)).toMatchObject({ explicacao_fonte: 'ia' });
  });
});
