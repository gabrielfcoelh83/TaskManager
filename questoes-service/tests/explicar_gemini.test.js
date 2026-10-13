// Gemini gerando (flash) e conferindo (Gemma, de preferência), pelo cliente
// HTTP real (criarRoteador) com `fetch` simulado: nenhum pedido sai para o
// Google. As listas de modelos são injetadas (a descoberta tem teste próprio
// em gemini.test.js), e `esperar` também (nenhuma espera de verdade).

process.env.JWT_SECRET = process.env.JWT_SECRET || 'segredo-de-teste';

const { pool } = require('../app');
const { migrate } = require('../migrate');
const {
  explicar,
  conferirGravadas,
  criarRoteador,
  linhaDeCusto,
  linhasDeConferentes,
  ESPERA_429_MS,
  ESPERAS_TRANSITORIAS_MS,
  LOTE_PADRAO,
  PROMPT_SISTEMA,
  PROMPT_CONFERENCIA,
  GEMINI_URL,
} = require('../explicar');

const EXAME_TESTE = 94;
const silencio = () => {};
const CHAVE = 'gk-teste-0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHI';

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

const GERADORES = [
  { id: 'gemini-3.8-flash', pensa: true },
  { id: 'gemini-3.7-flash', pensa: true },
];
const CONFERENTES = [
  { id: 'gemma-4-31b-it', pensa: false },
  { id: 'gemma-4-26b-a4b-it', pensa: false },
  { id: 'gemini-3.8-flash', pensa: true },
  { id: 'gemini-3.7-flash', pensa: true },
];
const LISTAS = { geradores: async () => GERADORES, conferentes: async () => CONFERENTES };

// Papel e prompt do usuário de um pedido. Para gemma, o sistema vem no
// começo da única mensagem (sem `system`).
function lerPedido(opts) {
  const corpo = JSON.parse(opts.body);
  const ultimo = corpo.messages[corpo.messages.length - 1].content;
  const sistema = corpo.messages.length > 1 ? corpo.messages[0].content : ultimo;
  const papel = sistema.startsWith(PROMPT_SISTEMA) ? 'gera' : sistema.startsWith(PROMPT_CONFERENCIA) ? 'confere' : null;
  const prefixo = papel === 'gera' ? PROMPT_SISTEMA : PROMPT_CONFERENCIA;
  const usuario = corpo.messages.length > 1 ? ultimo : ultimo.slice(prefixo.length + 2);
  return { corpo, papel, usuario };
}

// `falhar` = { 'gemini:<modelo>': status | (n-ésima chamada) => status|null };
// `lancar` = { 'gemini:<modelo>': mensagem } (o fetch rejeita).
function fetchSimulado({ falhar = {}, lancar = {} } = {}) {
  const chamadas = {};
  return jest.fn(async (url, opts) => {
    if (url !== GEMINI_URL) throw new Error(`URL inesperada: ${url}`);
    const { corpo, papel, usuario } = lerPedido(opts);
    const nome = `gemini:${corpo.model}`;
    chamadas[nome] = (chamadas[nome] || 0) + 1;
    if (lancar[nome]) throw new Error(lancar[nome]);
    const f = falhar[nome];
    const status = typeof f === 'function' ? f(chamadas[nome]) : f;
    if (status) return { ok: false, status };
    if (papel === 'gera') {
      return ok(JSON.stringify(itens(usuario).map((q) => ({ id: q.id, correta: q.gabarito_oficial, explicacao: textoBom(`[${q.id}]`) }))));
    }
    if (papel === 'confere') {
      return ok(JSON.stringify(itens(usuario).map((q) => ({ id: q.id, aprovada: true, problemas: [] }))));
    }
    throw new Error('prompt de sistema desconhecido');
  });
}

// [papel, gemini:modelo] de cada pedido feito.
const pedidos = () =>
  global.fetch.mock.calls.map(([, o]) => {
    const { corpo, papel } = lerPedido(o);
    return [papel, `gemini:${corpo.model}`];
  });

const semEspera = () => jest.fn(async () => {});

function rodar({ excluir = [], listar = LISTAS, esperar = semEspera(), logRoteador = silencio, ...resto } = {}) {
  const roteador = criarRoteador({ chave: CHAVE, listar, log: logRoteador, esperar });
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

describe('flash gera, Gemma confere', () => {
  it('grava com explicacao_modelo "gemini:..." e conferente Gemma (outra família, nunca o gerador)', async () => {
    const id = await inserir(1);
    global.fetch = fetchSimulado();

    const r = await rodar();

    expect(pedidos()).toEqual([
      ['gera', 'gemini:gemini-3.8-flash'],
      ['confere', 'gemini:gemma-4-31b-it'],
    ]);
    expect(r).toMatchObject({
      gravadas: 1,
      pedidos: 2,
      pedidosPorProvedor: { gemini: 2 },
      modelos: ['gemini:gemini-3.8-flash'],
      modelosConferencia: ['gemini:gemma-4-31b-it'],
    });
    expect(r.conferencias).toEqual([{ ids: [id], modelo: 'gemini:gemma-4-31b-it', mesmaFamilia: false }]);
    expect(linhasDeConferentes(r).some((l) => /MESMA família/.test(l))).toBe(false);
    expect(await buscar(id)).toMatchObject({ explicacao_fonte: 'ia', explicacao_modelo: 'gemini:gemini-3.8-flash' });
    expect(linhaDeCusto(r)).toBe('custo: 2 pedido(s) ao Gemini (cota gratuita do Google: por modelo, ver AI Studio)');
  });

  it('pedidos: rota compatível, Bearer, chave fora da URL; reasoning_effort só para quem pensa; gemma sem `system`', async () => {
    await inserir(1);
    global.fetch = fetchSimulado();
    await rodar();

    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions');
    expect(url).not.toContain(CHAVE);
    expect(opts.headers.Authorization).toBe(`Bearer ${CHAVE}`);
    const corpo = JSON.parse(opts.body);
    expect(corpo).toMatchObject({ model: 'gemini-3.8-flash', temperature: 0.2, reasoning_effort: 'low' });
    expect(corpo.messages.map((m) => m.role)).toEqual(['system', 'user']);
    expect(corpo.max_tokens).toBeGreaterThan(4096);

    const conf = JSON.parse(global.fetch.mock.calls[1][1].body);
    expect(conf.model).toBe('gemma-4-31b-it');
    expect(conf.reasoning_effort).toBeUndefined();
    expect(conf).toMatchObject({ temperature: 0, max_tokens: 1500 });
    expect(conf.messages).toHaveLength(1);
    expect(conf.messages[0].role).toBe('user');
    expect(conf.messages[0].content.startsWith(`${PROMPT_CONFERENCIA}\n\n`)).toBe(true);
  });

  it('429 no 1º flash passa ao próximo flash; o conferente continua sendo o Gemma', async () => {
    const id = await inserir(1);
    global.fetch = fetchSimulado({ falhar: { 'gemini:gemini-3.8-flash': 429 } });

    const r = await rodar();

    expect(pedidos()).toEqual([
      ['gera', 'gemini:gemini-3.8-flash'],
      ['gera', 'gemini:gemini-3.7-flash'],
      ['confere', 'gemini:gemma-4-31b-it'],
    ]);
    expect(r).toMatchObject({ gravadas: 1, pedidos: 3 });
    expect((await buscar(id)).explicacao_modelo).toBe('gemini:gemini-3.7-flash');
  });

  it('todos os geradores em 429: rodada interrompida com mensagem de cota, sem conferir', async () => {
    for (let n = 1; n <= 4; n++) await inserir(n);
    global.fetch = fetchSimulado({ falhar: { 'gemini:gemini-3.8-flash': 429, 'gemini:gemini-3.7-flash': 429 } });
    const esperar = semEspera();

    const r = await rodar({ lote: 2, esperar });

    expect(pedidos()).toEqual([
      ['gera', 'gemini:gemini-3.8-flash'],
      ['gera', 'gemini:gemini-3.7-flash'],
    ]); // só o 1º lote; o 2º nem é tentado
    expect(esperar).not.toHaveBeenCalled(); // 429 em vários modelos é cota: não espera
    expect(r.interrompida).toMatch(/429/);
    expect(r.interrompida).toMatch(/cota/);
    expect(r).toMatchObject({ gravadas: 0, pedidos: 2 });
  });

  it('Gemmas em 429 na conferência: cai para outro flash (mesma família, marcada), nunca o gerador', async () => {
    const id = await inserir(1);
    global.fetch = fetchSimulado({ falhar: { 'gemini:gemma-4-31b-it': 429, 'gemini:gemma-4-26b-a4b-it': 429 } });
    const linhas = [];

    const r = await rodar({ log: (m) => linhas.push(m) });

    const confere = pedidos().filter(([p]) => p === 'confere').map(([, m]) => m);
    expect(confere).toEqual(['gemini:gemma-4-31b-it', 'gemini:gemma-4-26b-a4b-it', 'gemini:gemini-3.7-flash']);
    expect(confere).not.toContain('gemini:gemini-3.8-flash');
    expect(r).toMatchObject({ gravadas: 1, modelosConferencia: ['gemini:gemini-3.7-flash'] });
    expect(r.conferencias[0].mesmaFamilia).toBe(true);
    expect(linhas.some((m) => /conferido por gemini:gemini-3.7-flash \(MESMA família do autor\)/.test(m))).toBe(true);
    expect(linhasDeConferentes(r).pop()).toBe(
      '⚠️  1 de 1 lote(s) conferido(s) pela MESMA família do autor: gemini:gemini-3.7-flash (1)'
    );
    expect((await buscar(id)).explicacao_modelo).toBe('gemini:gemini-3.8-flash');
  });

  it('gerador Gemma (GEMINI_MODELOS apontando para um): a conferência prefere a outra família (flash)', async () => {
    await inserir(1);
    global.fetch = fetchSimulado();
    const r = await rodar({
      listar: { geradores: async () => [{ id: 'gemma-4-31b-it', pensa: false }], conferentes: LISTAS.conferentes },
    });
    expect(pedidos()).toEqual([
      ['gera', 'gemini:gemma-4-31b-it'],
      ['confere', 'gemini:gemini-3.8-flash'],
    ]);
    expect(r.conferencias[0].mesmaFamilia).toBe(false);
  });

  it('conferentes fixos (GEMINI_CONFERENTES) com o gerador entre eles: o gerador é pulado', async () => {
    await inserir(1);
    global.fetch = fetchSimulado();
    await rodar({
      listar: {
        geradores: LISTAS.geradores,
        conferentes: async () => [{ id: 'gemini-3.8-flash', pensa: true }, { id: 'gemini-3.7-flash', pensa: true }],
      },
    });
    expect(pedidos()).toEqual([
      ['gera', 'gemini:gemini-3.8-flash'],
      ['confere', 'gemini:gemini-3.7-flash'],
    ]);
  });

  it('nenhum conferente além do gerador: não grava e para (sem conferente)', async () => {
    const id = await inserir(1);
    global.fetch = fetchSimulado();
    const r = await rodar({
      listar: { geradores: async () => ['gemini-3.8-flash'], conferentes: async () => ['gemini-3.8-flash'] },
    });
    expect(pedidos()).toEqual([['gera', 'gemini:gemini-3.8-flash']]);
    expect(r).toMatchObject({ gravadas: 0, semConferente: 1 });
    expect(r.interrompida).toMatch(/sem segundo modelo/);
    expect((await buscar(id)).explicacao).toBeNull();
  });

  it('sem chave, o roteador nem é criado', () => {
    expect(() => criarRoteador({ listar: LISTAS })).toThrow(/GEMINI_API_KEY/);
  });

  it(`lote padrão de ${LOTE_PADRAO}: 7 pendentes = um pedido de 5 e um de 2`, async () => {
    expect(LOTE_PADRAO).toBe(5);
    for (let n = 1; n <= 7; n++) await inserir(n);
    global.fetch = fetchSimulado();
    const r = await rodar();
    const tamanhos = global.fetch.mock.calls
      .map(([, o]) => lerPedido(o))
      .filter((p) => p.papel === 'gera')
      .map((p) => itens(p.usuario).length);
    expect(tamanhos).toEqual([5, 2]);
    expect(r).toMatchObject({ gravadas: 7, pedidos: 4 });
  });
});

describe('chave fora das mensagens de erro', () => {
  it('erro de rede que traz a chave sai no resumo sem ela (depois das esperas de erro transitório)', async () => {
    await inserir(1);
    global.fetch = fetchSimulado({
      lancar: {
        'gemini:gemini-3.8-flash': `fetch failed: Authorization: Bearer ${CHAVE}`,
        'gemini:gemini-3.7-flash': `ECONNRESET ?key=${CHAVE}`,
      },
    });
    const avisos = [];

    const r = await rodar({ logRoteador: (m) => avisos.push(m) });

    expect(r.lotesComErro).toBe(1);
    expect(r.interrompida).toBeNull(); // falha transitória não para a rodada
    const texto = JSON.stringify(r) + avisos.join('\n');
    expect(texto).not.toContain(CHAVE);
    expect(texto).toContain('[chave oculta]');
  });

  it('falha de listagem no roteador não vaza a chave', async () => {
    const roteador = criarRoteador({
      chave: CHAVE,
      listar: {
        geradores: async (chave) => {
          throw new Error(`HTTP 403 para ${chave}`);
        },
      },
    });
    const err = await roteador.gerar('p').catch((e) => e);
    expect(err).toMatchObject({ listagem: true, tentativas: 0 });
    expect(err.message).not.toContain(CHAVE);
  });
});

describe('--excluir com e sem prefixo', () => {
  it('"gemini:gemini-3.8-flash" tira esse modelo da geração e da conferência', async () => {
    const id = await inserir(1);
    global.fetch = fetchSimulado({ falhar: { 'gemini:gemma-4-31b-it': 429, 'gemini:gemma-4-26b-a4b-it': 429 } });
    await rodar({ excluir: ['gemini:gemini-3.8-flash'] });
    expect(pedidos()).toEqual([
      ['gera', 'gemini:gemini-3.7-flash'],
      ['confere', 'gemini:gemma-4-31b-it'],
      ['confere', 'gemini:gemma-4-26b-a4b-it'],
      // nem o gerador (3.7) nem o excluído (3.8) são tentados como conferente
    ]);
    expect((await buscar(id)).explicacao).toBeNull();
  });

  it('sem prefixo vale como modelo Gemini', async () => {
    await inserir(1);
    global.fetch = fetchSimulado();
    await rodar({ excluir: ['gemini-3.8-flash', 'gemma-4-31b-it'] });
    expect(pedidos()).toEqual([
      ['gera', 'gemini:gemini-3.7-flash'],
      ['confere', 'gemini:gemma-4-26b-a4b-it'],
    ]);
  });

  it('id com prefixo antigo, "models/" ou maiúsculas exclui o mesmo modelo (mesmos pesos)', async () => {
    for (const forma of ['openrouter:gemini-3.8-flash', 'models/gemini-3.8-flash', 'Gemini:GEMINI-3.8-flash']) {
      await inserir(1);
      global.fetch = fetchSimulado();
      await rodar({ excluir: [forma] });
      expect(pedidos().some(([, m]) => m === 'gemini:gemini-3.8-flash')).toBe(false);
      await pool.query('DELETE FROM questoes WHERE exame = $1', [EXAME_TESTE]);
    }
  });
});

describe('conferente gemma com raciocínio no texto', () => {
  it('o rascunho dentro de <thought> é ignorado; vale a lista depois dele', async () => {
    const id = await inserir(1);
    const base = fetchSimulado();
    global.fetch = jest.fn(async (url, opts) => {
      const res = await base(url, opts);
      const { corpo } = lerPedido(opts);
      if (!corpo.model.startsWith('gemma')) return res;
      const lista = await res.json();
      const veredito = lista.choices[0].message.content;
      // Rascunho com o id real REPROVADO dentro do raciocínio: se fosse lido,
      // o lote não seria gravado.
      const rascunho = `<thought>Rascunho: [{"id": ${id}, "aprovada": false, "problemas": ["x"]}]</thought>`;
      return ok(`${rascunho}\`\`\`json\n${veredito}\n\`\`\``);
    });

    const r = await rodar();

    expect(r).toMatchObject({ gravadas: 1, aprovadas: 1 });
    expect(r.modelosConferencia).toEqual(['gemini:gemma-4-31b-it']);
  });

  it('raciocínio cortado (sem </thought>) não vira veredito: passa a outro conferente', async () => {
    await inserir(1);
    const base = fetchSimulado();
    global.fetch = jest.fn(async (url, opts) => {
      const { corpo } = lerPedido(opts);
      if (corpo.model === 'gemma-4-31b-it') return ok('<thought>pensando [{"id": 1, "aprovada": true}]');
      return base(url, opts);
    });

    const r = await rodar();

    expect(r.gravadas).toBe(1);
    expect(r.modelosConferencia).not.toContain('gemini:gemma-4-31b-it');
  });
});

describe('--conferir-gravadas com autores antigos e novos', () => {
  it('ids antigos (sem prefixo e "openrouter:...") em explicacao_modelo não quebram; o autor Gemini nunca confere', async () => {
    const semPrefixo = await inserir(1, {
      explicacao: textoBom('[a]').trim(),
      explicacao_fonte: 'ia',
      explicacao_modelo: 'nvidia/nemotron-3-ultra-550b-a55b:free',
    });
    const comPrefixoAntigo = await inserir(2, {
      explicacao: textoBom('[b]').trim(),
      explicacao_fonte: 'ia',
      explicacao_modelo: 'openrouter:google/gemma-4-31b-it:free',
    });
    const nova = await inserir(3, {
      explicacao: textoBom('[c]').trim(),
      explicacao_fonte: 'ia',
      explicacao_modelo: 'gemini:gemini-3.8-flash',
    });
    global.fetch = fetchSimulado();
    const roteador = criarRoteador({ chave: CHAVE, listar: LISTAS, log: silencio, esperar: semEspera() });

    const r = await conferirGravadas({
      exame: EXAME_TESTE,
      log: silencio,
      conferirModelo: (p, o) => roteador.conferir(p, o),
    });

    // O gemma antigo (outro provedor, mesmos pesos) e o flash autor ficam de
    // fora: nenhum deles confere o que escreveu.
    expect(r.modelosConferencia).not.toContain('gemini:gemma-4-31b-it');
    expect(r.modelosConferencia).not.toContain('gemini:gemini-3.8-flash');
    expect(r.modelosConferencia.length).toBeGreaterThan(0);
    expect(r).toMatchObject({ aprovadas: 3, lotesComErro: 0, interrompida: null });
    for (const id of [semPrefixo, comPrefixoAntigo, nova]) {
      expect(await buscar(id)).toMatchObject({ explicacao_fonte: 'ia' });
    }
    expect((await buscar(semPrefixo)).explicacao_modelo).toBe('nvidia/nemotron-3-ultra-550b-a55b:free');
  });

  it('autor gravado "gemini:gemma-4-31b-it" nunca confere a própria explicação', async () => {
    await inserir(1, { explicacao: textoBom('[g]').trim(), explicacao_fonte: 'ia', explicacao_modelo: 'gemini:gemma-4-31b-it' });
    global.fetch = fetchSimulado();
    const roteador = criarRoteador({ chave: CHAVE, listar: LISTAS, log: silencio, esperar: semEspera() });
    const r = await conferirGravadas({ exame: EXAME_TESTE, log: silencio, conferirModelo: (p, o) => roteador.conferir(p, o) });
    expect(r.modelosConferencia).toEqual(['gemini:gemini-3.8-flash']); // outra família primeiro
  });
});

describe('erro transitório (503 etc.): espera e tenta a lista de novo', () => {
  const roteadorCom = ({ esperar = semEspera(), avisos = [], geradores = GERADORES } = {}) =>
    criarRoteador({
      chave: CHAVE,
      listar: { geradores: async () => geradores, conferentes: LISTAS.conferentes },
      log: (m) => avisos.push(m),
      esperar,
    });

  it('429 misturado com 503: espera pelo sobrecarregado e não tenta mais o sem cota', async () => {
    global.fetch = fetchSimulado({
      falhar: { 'gemini:gemini-3.8-flash': 429, 'gemini:gemini-3.7-flash': (n) => (n === 1 ? 503 : 0) },
    });
    const esperar = semEspera();
    const avisos = [];
    const roteador = roteadorCom({ esperar, avisos });

    const r = await roteador.gerar(`Explique.\n\n${JSON.stringify([{ id: 1, gabarito_oficial: 'C' }])}\n\nResponda`);

    expect(esperar.mock.calls).toEqual([[20000]]);
    expect(r.modelo).toBe('gemini:gemini-3.7-flash');
    // 3.8 (429), 3.7 (503) e, depois da espera, só o 3.7.
    expect(pedidos().map(([, m]) => m)).toEqual(['gemini:gemini-3.8-flash', 'gemini:gemini-3.7-flash', 'gemini:gemini-3.7-flash']);
    // Um 429 só (pode ser o limite por minuto): ainda não sai da rodada.
    expect(roteador.foraDaRodada.size).toBe(0);
  });

  it('modelo com 429 em 2 pedidos ou sumido (404) não é tentado nos lotes seguintes', async () => {
    for (let n = 1; n <= 15; n++) await inserir(n);
    global.fetch = fetchSimulado({ falhar: { 'gemini:gemini-3.8-flash': 429, 'gemini:gemma-4-31b-it': 404 } });

    const r = await rodar({ lote: 5 });

    expect(r).toMatchObject({ gravadas: 15, lotesComErro: 0, interrompida: null });
    const contar = (m) => pedidos().filter(([, x]) => x === m).length;
    // O 3.8 gera nos lotes 1 e 2 (429 nos dois) e sai; o gemma-31b sai no 1º 404.
    expect(contar('gemini:gemini-3.8-flash')).toBe(2);
    expect(contar('gemini:gemma-4-31b-it')).toBe(1);
  });

  it('todos os geradores sem cota: a rodada para sem gastar mais pedidos', async () => {
    for (let n = 1; n <= 10; n++) await inserir(n);
    global.fetch = fetchSimulado({ falhar: { 'gemini:gemini-3.8-flash': 429, 'gemini:gemini-3.7-flash': 429 } });

    const r = await rodar({ lote: 5 });

    expect(r.gravadas).toBe(0);
    expect(r.interrompida).toMatch(/429|cota/);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('caso real da prévia: 429 → espera de 60 s → 503 → o modelo continua na lista e responde depois', async () => {
    // 3.8 sem cota o tempo todo; 3.7: 503, 429, 503, 200.
    const seq37 = [503, 429, 503, 0];
    global.fetch = fetchSimulado({
      falhar: { 'gemini:gemini-3.8-flash': 429, 'gemini:gemini-3.7-flash': (n) => seq37[n - 1] ?? 0 },
    });
    const esperar = semEspera();
    const roteador = roteadorCom({ esperar });

    const r = await roteador.gerar(`Explique.\n\n${JSON.stringify([{ id: 1, gabarito_oficial: 'C' }])}\n\nResponda`);

    expect(r.modelo).toBe('gemini:gemini-3.7-flash');
    // 20 s (503 + 429), 60 s (429 com um só), 40 s (503), e a 4ª chamada do 3.7 responde.
    expect(esperar.mock.calls).toEqual([[20000], [60000], [40000]]);
    expect(global.fetch).toHaveBeenCalledTimes(5); // 2 na 1ª passada, depois só o 3.7
  });

  it('um modelo só: 429, espera de 60 s, 200 — continua na rodada e o 2º lote também grava', async () => {
    for (let n = 1; n <= 10; n++) await inserir(n);
    global.fetch = fetchSimulado({ falhar: { 'gemini:gemini-3.8-flash': (n) => (n === 1 ? 429 : 0) } });
    const esperar = semEspera();
    const listar = { geradores: async () => [GERADORES[0]], conferentes: LISTAS.conferentes };

    const r = await rodar({ lote: 5, esperar, listar });

    expect(esperar.mock.calls).toEqual([[60000]]);
    expect(r).toMatchObject({ gravadas: 10, interrompida: null });
  });

  it('429 misturado com um 400 que não é cota: não espera (é defeito, não sobrecarga)', async () => {
    global.fetch = fetchSimulado({ falhar: { 'gemini:gemini-3.8-flash': 429, 'gemini:gemini-3.7-flash': 400 } });
    const esperar = semEspera();
    const err = await roteadorCom({ esperar }).gerar('p').catch((e) => e);
    expect(esperar).not.toHaveBeenCalled();
    expect(err.transitorio).toBeUndefined();
  });

  it('as esperas são 20 s, 40 s e 80 s', () => {
    expect(ESPERAS_TRANSITORIAS_MS).toEqual([20000, 40000, 80000]);
  });

  it('503 em todos: espera 20 s, tenta de novo e devolve, somando o custo', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce(ok('[]'));
    const esperar = semEspera();
    const avisos = [];

    const r = await roteadorCom({ esperar, avisos }).gerar('p');

    expect(esperar.mock.calls).toEqual([[20000]]);
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toMatch(/sobrecarregados.*HTTP 503.*20 s \(1\/3\)/);
    expect(r).toMatchObject({ modelo: 'gemini:gemini-3.8-flash', tentativas: 3, porProvedor: { gemini: 3 } });
  });

  it('desiste depois de 3 esperas (20, 40, 80 s): 4 passadas pela lista, erro transitório', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 503 });
    const esperar = semEspera();
    const avisos = [];

    const err = await roteadorCom({ esperar, avisos }).gerar('p').catch((e) => e);

    expect(esperar.mock.calls).toEqual([[20000], [40000], [80000]]);
    expect(avisos).toHaveLength(3);
    expect(global.fetch).toHaveBeenCalledTimes(8);
    expect(err).toMatchObject({ transitorio: true, tentativas: 8, porProvedor: { gemini: 8 } });
    expect(err.cotaEsgotada).toBeUndefined();
  });

  it('rodada para depois de 2 lotes seguidos com o Google sobrecarregado', async () => {
    for (let i = 1; i <= 15; i++) await inserir(i);
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 503 });
    const r = await rodar({ lote: 5 });
    expect(r.lotesComErro).toBe(2);
    expect(r.interrompida).toMatch(/2 lotes seguidos com o Google sobrecarregado/);
  });

  it('500, 502, 504, timeout e erro de rede também contam como transitórios', async () => {
    const timeout = Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' });
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValueOnce({ ok: false, status: 502 })
      .mockResolvedValueOnce({ ok: false, status: 504 })
      .mockRejectedValueOnce(timeout)
      .mockRejectedValueOnce(new Error('fetch failed'))
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce(ok('[]'));
    const esperar = semEspera();

    const r = await roteadorCom({ esperar }).gerar('p');

    expect(esperar.mock.calls).toEqual([[20000], [40000], [80000]]);
    expect(r).toMatchObject({ tentativas: 7 });
  });

  it('429 + 503 sem fim: espera 3 vezes, e as novas passadas vão só ao modelo com 503', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 429 })
      .mockResolvedValue({ ok: false, status: 503 });
    const esperar = semEspera();

    const err = await roteadorCom({ esperar }).gerar('p').catch((e) => e);

    expect(esperar.mock.calls).toEqual([[20000], [40000], [80000]]);
    expect(global.fetch).toHaveBeenCalledTimes(5); // 2 na 1ª passada + 1 em cada uma das 3 seguintes
    expect(err.transitorio).toBe(true);
    expect(err.cotaEsgotada).toBeUndefined();
    expect(err.semCota).toEqual(['gemini:gemini-3.8-flash']);
  });

  it('503 + 404: espera, sem tentar de novo o modelo que sumiu', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({ ok: false, status: 404 })
      .mockResolvedValueOnce(ok('[]'));
    const esperar = semEspera();
    const r = await roteadorCom({ esperar }).gerar('p');
    expect(esperar.mock.calls).toEqual([[20000]]);
    expect(r.modelo).toBe('gemini:gemini-3.8-flash');
  });

  it('erro que não é sobrecarga nem cota (400) não espera', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({ ok: false, status: 400 });
    const esperar = semEspera();
    const err = await roteadorCom({ esperar }).gerar('p').catch((e) => e);
    expect(esperar).not.toHaveBeenCalled();
    expect(err.transitorio).toBeUndefined();
  });

  it('na rodada: 503 nos Gemma na conferência, depois 200 — o lote é conferido e gravado', async () => {
    const id = await inserir(1);
    const primeiraVez = (n) => (n === 1 ? 503 : null);
    global.fetch = fetchSimulado({
      falhar: {
        'gemini:gemma-4-31b-it': primeiraVez,
        'gemini:gemma-4-26b-a4b-it': primeiraVez,
        'gemini:gemini-3.7-flash': primeiraVez,
      },
    });
    const esperar = semEspera();

    const r = await rodar({ esperar });

    expect(esperar.mock.calls).toEqual([[20000]]);
    expect(pedidos()).toEqual([
      ['gera', 'gemini:gemini-3.8-flash'],
      ['confere', 'gemini:gemma-4-31b-it'],
      ['confere', 'gemini:gemma-4-26b-a4b-it'],
      ['confere', 'gemini:gemini-3.7-flash'],
      ['confere', 'gemini:gemma-4-31b-it'],
    ]);
    expect(r).toMatchObject({ gravadas: 1, pedidos: 5, lotesComErro: 0 });
    expect((await buscar(id)).explicacao_fonte).toBe('ia');
  });

  it('na rodada: 503 sem fim na geração — o lote falha depois de 3 esperas; o 2º lote igual para a rodada', async () => {
    for (let n = 1; n <= 3; n++) await inserir(n);
    global.fetch = fetchSimulado({ falhar: { 'gemini:gemini-3.8-flash': 503, 'gemini:gemini-3.7-flash': 503 } });
    const esperar = semEspera();

    const r = await rodar({ lote: 1, esperar });

    expect(esperar).toHaveBeenCalledTimes(6); // 3 por lote
    expect(r).toMatchObject({ lotesComErro: 2, gravadas: 0, pedidos: 16 });
    expect(r.interrompida).toMatch(/2 lotes seguidos com o Google sobrecarregado/); // o 3º lote nem é tentado
  });

  it('com timer falso: a 2ª passada só sai depois dos 20 s', async () => {
    jest.useFakeTimers();
    try {
      global.fetch = jest
        .fn()
        .mockResolvedValueOnce({ ok: false, status: 503 })
        .mockResolvedValueOnce(ok('[]'));
      const roteador = criarRoteador({
        chave: CHAVE,
        listar: { geradores: async () => ['gemini-3.8-flash'], conferentes: LISTAS.conferentes },
        log: silencio,
      });
      const promessa = roteador.gerar('p');
      await jest.advanceTimersByTimeAsync(ESPERAS_TRANSITORIAS_MS[0] - 1);
      expect(global.fetch).toHaveBeenCalledTimes(1);
      await jest.advanceTimersByTimeAsync(1);
      const r = await promessa;
      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(r.tentativas).toBe(2);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('um só modelo: 429 espera 60 s e tenta uma vez (timer falso)', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  const roteadorUnico = (avisos = []) =>
    criarRoteador({
      chave: CHAVE,
      listar: { geradores: async () => [{ id: 'gemini-3.8-flash', pensa: true }], conferentes: LISTAS.conferentes },
      log: (m) => avisos.push(m),
    });

  it('429 e depois 200: espera os 60 s, tenta de novo e devolve, com custo 2', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce({ ok: false, status: 429 }).mockResolvedValueOnce(ok('[]'));
    const avisos = [];
    const promessa = roteadorUnico(avisos).gerar('p');

    await jest.advanceTimersByTimeAsync(ESPERA_429_MS - 1);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(avisos.join('\n')).toMatch(/limite por minuto/);
    await jest.advanceTimersByTimeAsync(1);

    const r = await promessa;
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(r).toMatchObject({ modelo: 'gemini:gemini-3.8-flash', tentativas: 2, porProvedor: { gemini: 2 } });
  });

  it('429 de novo depois da espera: cota esgotada, uma tentativa extra só', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 429 });
    const promessa = roteadorUnico().gerar('p').catch((e) => e);
    await jest.advanceTimersByTimeAsync(ESPERA_429_MS);
    const err = await promessa;
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(err).toMatchObject({ cotaEsgotada: true, tentativas: 2, porProvedor: { gemini: 2 } });
    expect(err.message).not.toContain(CHAVE);
  });

  it('com dois modelos, todos em 429 é a cota do dia: não espera', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 429 });
    const roteador = criarRoteador({
      chave: CHAVE,
      listar: { geradores: async () => ['gemini-3.8-flash', 'gemini-3.7-flash'], conferentes: LISTAS.conferentes },
      log: silencio,
    });
    const err = await roteador.gerar('p').catch((e) => e);
    expect(err).toMatchObject({ cotaEsgotada: true, tentativas: 2 });
    expect(jest.getTimerCount()).toBe(0);
  });
});
