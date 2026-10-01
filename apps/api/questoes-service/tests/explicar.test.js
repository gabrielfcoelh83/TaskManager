// A explicação é o único texto longo que um modelo escreve neste banco, e ele
// fica ao lado do gabarito oficial. O teste prova três coisas: o modelo
// recebe a letra OFICIAL; uma explicação que discorda dela (ou que é
// lixo) não entra; e nada escrito por pessoa é sobrescrito, nem em corrida.
//
// Nenhuma chamada de rede: `chamarModelo` é injetado, e onde se testa o
// cliente HTTP, `fetch` é substituído.

process.env.JWT_SECRET = process.env.JWT_SECRET || 'segredo-de-teste';

const { pool } = require('../app');
const { migrate } = require('../migrate');
const {
  explicar,
  interpretarResposta,
  montarPrompt,
  chamarOpenRouter,
  letraAfirmadaNoTexto,
  PROMPT_SISTEMA,
} = require('../explicar');

const EXAME_TESTE = 95;
const LETRAS = ['A', 'B', 'C', 'D'];
const silencio = () => {};

const limpar = () => pool.query('DELETE FROM questoes WHERE exame = $1', [EXAME_TESTE]);

async function inserir(numero, campos = {}) {
  const { rows } = await pool.query(
    `INSERT INTO questoes
       (exame, tipo_prova, numero, ano, enunciado, alternativas, gabarito, anulada,
        disciplina, tema, explicacao, explicacao_fonte, revisada)
     VALUES ($1,1,$2,2025,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     RETURNING id`,
    [
      EXAME_TESTE,
      numero,
      campos.enunciado || `Enunciado da questão ${numero}, com texto suficiente.`,
      JSON.stringify(['alfa', 'beta', 'gama', 'delta']),
      campos.gabarito ?? 2,
      campos.anulada ?? false,
      campos.disciplina ?? null,
      campos.tema ?? null,
      campos.explicacao ?? null,
      campos.explicacao_fonte ?? null,
      campos.revisada ?? false,
    ]
  );
  return Number(rows[0].id);
}

const buscar = async (id) => {
  const { rows } = await pool.query(
    `SELECT enunciado, alternativas, gabarito, anulada, disciplina, tema,
            explicacao, explicacao_fonte, revisada
       FROM questoes WHERE id = $1`,
    [id]
  );
  return rows[0];
};

// Texto que passa na validação (80 palavras, sem afirmar outra letra).
const textoBom = (marca = '') =>
  `${marca} A alternativa indicada está correta porque reproduz a regra legal aplicável ao caso narrado. ` +
  'As demais alternativas estão erradas: uma inverte o requisito, outra troca o prazo e a última ' +
  'confunde o instituto com outro parecido. '.repeat(4);

// A lista de questões que o prompt carrega, sem o exemplo de formato do fim.
const itensDoPrompt = (prompt) =>
  JSON.parse(prompt.slice(prompt.indexOf('['), prompt.indexOf(']\n\nResponda') + 1));
const idsDoPrompt = (prompt) => itensDoPrompt(prompt).map((q) => q.id);

// Responde a cada questão do prompt com a letra OFICIAL — o modelo "bom".
function modeloQueConcorda({ texto = textoBom, letra } = {}) {
  return jest.fn(async (prompt) => {
    const itens = itensDoPrompt(prompt);
    return {
      conteudo: JSON.stringify(
        itens.map((q) => ({
          id: q.id,
          correta: letra ? letra(q) : q.gabarito_oficial,
          explicacao: texto(`[${q.id}]`),
        }))
      ),
      modelo: 'modelo-teste',
    };
  });
}

beforeAll(async () => {
  await migrate(pool);
  await limpar();
});

afterEach(limpar);

afterAll(async () => {
  await limpar();
  await pool.end();
});

describe('montarPrompt', () => {
  it('leva a letra oficial, as quatro alternativas, disciplina e tema', () => {
    const prompt = montarPrompt([
      {
        id: 7,
        enunciado: 'Caso de furto.',
        alternativas: ['alfa', 'beta', 'gama', 'delta'],
        gabarito: 3,
        disciplina: 'Direito Penal',
        tema: 'Furto',
      },
    ]);
    const item = JSON.parse(prompt.slice(prompt.indexOf('['), prompt.indexOf(']\n\nResponda') + 1))[0];
    expect(item).toEqual({
      id: 7,
      disciplina: 'Direito Penal',
      tema: 'Furto',
      enunciado: 'Caso de furto.',
      alternativas: { A: 'alfa', B: 'beta', C: 'gama', D: 'delta' },
      gabarito_oficial: 'D',
    });
  });

  it('omite disciplina e tema quando não existem', () => {
    const prompt = montarPrompt([
      { id: 1, enunciado: 'x', alternativas: ['a', 'b', 'c', 'd'], gabarito: 0, disciplina: null, tema: null },
    ]);
    expect(prompt).not.toMatch(/"disciplina"/);
    expect(prompt).not.toMatch(/"tema"/);
    expect(prompt).toMatch(/"gabarito_oficial": "A"/);
  });

  it('o prompt de sistema proíbe inventar número de artigo', () => {
    expect(PROMPT_SISTEMA).toMatch(/NÃO INVENTE NÚMERO DE ARTIGO/);
    expect(PROMPT_SISTEMA).toMatch(/sem citar número/);
  });
});

describe('interpretarResposta', () => {
  const lote = [
    { id: 1, gabarito: 2 }, // C
    { id: 2, gabarito: 0 }, // A
  ];
  const resp = (itens) => JSON.stringify(itens);

  it('aceita explicação com a letra oficial', () => {
    const { aceitas, recusadas } = interpretarResposta(
      resp([
        { id: 1, correta: 'C', explicacao: textoBom() },
        { id: 2, correta: 'a', explicacao: textoBom() },
      ]),
      lote
    );
    expect(recusadas).toEqual([]);
    expect(aceitas.map((a) => a.id)).toEqual([1, 2]);
  });

  it('recusa quando a letra do modelo diverge do gabarito oficial', () => {
    const { aceitas, recusadas } = interpretarResposta(
      resp([
        { id: 1, correta: 'B', explicacao: textoBom() },
        { id: 2, correta: 'A', explicacao: textoBom() },
      ]),
      lote
    );
    expect(aceitas.map((a) => a.id)).toEqual([2]);
    expect(recusadas).toEqual([{ id: 1, motivo: 'modelo discorda do gabarito (disse B, oficial C)' }]);
  });

  it('recusa quando o modelo discorda e devolve explicacao null, como o prompt pede', () => {
    const { aceitas, recusadas } = interpretarResposta(resp([{ id: 1, correta: 'D', explicacao: null }]), [lote[0]]);
    expect(aceitas).toEqual([]);
    expect(recusadas[0].motivo).toMatch(/discorda/);
  });

  it('recusa quando falta a letra', () => {
    const { recusadas } = interpretarResposta(resp([{ id: 1, explicacao: textoBom() }]), [lote[0]]);
    expect(recusadas[0].motivo).toMatch(/não informou a letra/);
  });

  it('recusa texto que afirma outra alternativa como correta, mesmo com a letra certa no campo', () => {
    const texto = `${textoBom()} Portanto, a alternativa correta é a B.`;
    const { aceitas, recusadas } = interpretarResposta(resp([{ id: 1, correta: 'C', explicacao: texto }]), [lote[0]]);
    expect(aceitas).toEqual([]);
    expect(recusadas[0].motivo).toMatch(/afirma outra alternativa/);
  });

  it('letraAfirmadaNoTexto não confunde o artigo "a" com a alternativa A', () => {
    expect(letraAfirmadaNoTexto('A resposta correta é a afirmação de que...')).toEqual([]);
    expect(letraAfirmadaNoTexto('A alternativa correta é a (C).')).toEqual(['C']);
    expect(letraAfirmadaNoTexto('Resposta correta: letra D')).toEqual(['D']);
  });

  it('recusa texto vazio, curto, gigante ou com cerca markdown', () => {
    const casos = [
      ['', /vazia/],
      ['   ', /vazia/],
      ['Ver gabarito.', /curto demais/],
      ['palavra '.repeat(1000), /longo demais/],
      [`${textoBom()} ${'x'.repeat(4000)}`, /longo demais/],
      [`${textoBom()}\n\`\`\`\ncódigo\n\`\`\``, /cerca de markdown/],
    ];
    for (const [explicacao, motivo] of casos) {
      const { aceitas, recusadas } = interpretarResposta(resp([{ id: 1, correta: 'C', explicacao }]), [lote[0]]);
      expect(aceitas).toEqual([]);
      expect(recusadas[0].motivo).toMatch(motivo);
    }
  });

  it('recusa id fora do lote e id repetido, e registra questão sem resposta', () => {
    const { aceitas, recusadas } = interpretarResposta(
      resp([
        { id: 99, correta: 'C', explicacao: textoBom() },
        { id: 1, correta: 'C', explicacao: textoBom() },
        { id: 1, correta: 'C', explicacao: textoBom('outra') },
      ]),
      lote
    );
    expect(aceitas).toEqual([]);
    expect(recusadas).toEqual([
      { id: 99, motivo: 'id fora do lote' },
      { id: 1, motivo: 'id repetido na resposta' },
      { id: 2, motivo: 'modelo não respondeu esta questão' },
    ]);
  });

  it('sobrevive a cerca ```json em volta da resposta inteira', () => {
    const { aceitas } = interpretarResposta(
      '```json\n' + resp([{ id: 1, correta: 'C', explicacao: textoBom() }]) + '\n```',
      [lote[0]]
    );
    expect(aceitas).toHaveLength(1);
  });

  it('lança com JSON quebrado, em vez de devolver lista vazia', () => {
    expect(() => interpretarResposta('Desculpe, não posso ajudar.', lote)).toThrow();
    expect(() => interpretarResposta('[{"id":1,"correta":"C","explicacao":"corta no me]', lote)).toThrow();
  });
});

describe('chamarOpenRouter (fetch simulado)', () => {
  const fetchOriginal = global.fetch;
  afterEach(() => {
    global.fetch = fetchOriginal;
  });

  const respostaOk = (conteudo) => ({
    ok: true,
    status: 200,
    json: async () => ({ choices: [{ message: { content: conteudo } }] }),
  });

  it('envia o prompt com a letra oficial e cai para o próximo modelo em 429/503', async () => {
    const prompt = montarPrompt([
      { id: 5, enunciado: 'Caso.', alternativas: ['a', 'b', 'c', 'd'], gabarito: 1 },
    ]);
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 429 })
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce(respostaOk('[]'));

    const r = await chamarOpenRouter(prompt, { chave: 'k', modelos: ['m1', 'm2', 'm3'] });

    expect(r).toEqual({ conteudo: '[]', modelo: 'm3' });
    expect(global.fetch).toHaveBeenCalledTimes(3);
    const corpo = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(corpo.messages[0].content).toBe(PROMPT_SISTEMA);
    expect(corpo.messages[1].content).toContain('"gabarito_oficial": "B"');
    expect(global.fetch.mock.calls[0][1].signal).toBeDefined();
  });

  it('marca cota esgotada quando todos os modelos devolvem 429', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 429 });
    await expect(chamarOpenRouter('p', { chave: 'k', modelos: ['m1', 'm2'] })).rejects.toMatchObject({
      cotaEsgotada: true,
    });
  });

  it('não marca cota esgotada quando a falha é outra', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 429 })
      .mockResolvedValueOnce({ ok: false, status: 503 });
    const err = await chamarOpenRouter('p', { chave: 'k', modelos: ['m1', 'm2'] }).catch((e) => e);
    expect(err.cotaEsgotada).toBeUndefined();
  });

  it('recusa rodar sem chave', async () => {
    await expect(chamarOpenRouter('p', { modelos: ['m1'] })).rejects.toThrow(/OPENROUTER_API_KEY/);
  });
});

describe('explicar', () => {
  it('grava explicação, fonte ia e revisada=false — e não toca o fato da FGV', async () => {
    const id = await inserir(1, { disciplina: 'Direito Penal', tema: 'Furto', gabarito: 2 });
    const antes = await buscar(id);
    const modelo = modeloQueConcorda();

    const r = await explicar({ exame: EXAME_TESTE, aplicar: true, log: silencio, chamarModelo: modelo });

    expect(r).toMatchObject({ lidas: 1, explicadas: 1, gravadas: 1, recusadas: [], modelos: ['modelo-teste'] });
    expect(modelo.mock.calls[0][0]).toContain('"gabarito_oficial": "C"');

    const depois = await buscar(id);
    expect(depois.explicacao).toBe(textoBom(`[${id}]`).trim());
    expect(depois.explicacao_fonte).toBe('ia');
    expect(depois.revisada).toBe(false);
    for (const col of ['enunciado', 'alternativas', 'gabarito', 'anulada', 'disciplina', 'tema']) {
      expect(depois[col]).toEqual(antes[col]);
    }
  });

  it('não grava quando a letra do modelo diverge, e a questão volta na próxima rodada', async () => {
    const id = await inserir(1, { gabarito: 2 });

    const r = await explicar({
      exame: EXAME_TESTE,
      aplicar: true,
      log: silencio,
      chamarModelo: modeloQueConcorda({ letra: () => 'A' }),
    });

    expect(r.gravadas).toBe(0);
    expect(r.recusadas).toEqual([{ id, motivo: 'modelo discorda do gabarito (disse A, oficial C)' }]);
    expect((await buscar(id)).explicacao).toBeNull();

    const segunda = await explicar({
      exame: EXAME_TESTE,
      aplicar: true,
      log: silencio,
      chamarModelo: modeloQueConcorda(),
    });
    expect(segunda.gravadas).toBe(1);
  });

  it('nunca envia nem toca explicação humana, nem com --refazer-ia', async () => {
    const MARCA = 'ENUNCIADO-HUMANO-NAO-PODE-SER-ENVIADO';
    const humana = await inserir(1, {
      enunciado: `${MARCA}: já explicada por uma pessoa.`,
      explicacao: 'Explicação escrita por uma professora.',
      explicacao_fonte: 'humano',
    });
    await inserir(2);

    for (const refazerIa of [false, true]) {
      const modelo = modeloQueConcorda();
      await explicar({ exame: EXAME_TESTE, aplicar: true, refazerIa, log: silencio, chamarModelo: modelo });
      for (const [prompt] of modelo.mock.calls) expect(prompt).not.toContain(MARCA);
    }

    const intacta = await buscar(humana);
    expect(intacta.explicacao).toBe('Explicação escrita por uma professora.');
    expect(intacta.explicacao_fonte).toBe('humano');
  });

  it('corrida: se uma pessoa escreve durante a chamada ao modelo, o texto da IA é descartado', async () => {
    const id = await inserir(1);

    const base = modeloQueConcorda();
    const chamarModelo = jest.fn(async (prompt) => {
      // A pessoa grava entre a leitura da fila e a gravação do script.
      await pool.query(
        `UPDATE questoes SET explicacao = 'Texto humano.', explicacao_fonte = 'humano' WHERE id = $1`,
        [id]
      );
      return base(prompt);
    });

    const r = await explicar({ exame: EXAME_TESTE, aplicar: true, log: silencio, chamarModelo });

    expect(r.explicadas).toBe(1);
    expect(r.gravadas).toBe(0);
    const q = await buscar(id);
    expect(q.explicacao).toBe('Texto humano.');
    expect(q.explicacao_fonte).toBe('humano');
  });

  it('corrida: anulação ou troca de gabarito no meio descarta a explicação', async () => {
    const anulada = await inserir(1, { gabarito: 2 });
    const trocada = await inserir(2, { gabarito: 2 });

    const base = modeloQueConcorda();
    const chamarModelo = jest.fn(async (prompt) => {
      await pool.query('UPDATE questoes SET anulada = TRUE WHERE id = $1', [anulada]);
      await pool.query('UPDATE questoes SET gabarito = 1 WHERE id = $1', [trocada]);
      return base(prompt);
    });

    const r = await explicar({ exame: EXAME_TESTE, aplicar: true, log: silencio, chamarModelo });

    expect(r.gravadas).toBe(0);
    expect((await buscar(anulada)).explicacao).toBeNull();
    expect((await buscar(trocada)).explicacao).toBeNull();
  });

  it('pula anuladas', async () => {
    const MARCA = 'QUESTAO-ANULADA';
    const anulada = await inserir(1, { anulada: true, enunciado: `${MARCA}: a FGV anulou.` });
    await inserir(2);
    const modelo = modeloQueConcorda();

    const r = await explicar({ exame: EXAME_TESTE, aplicar: true, log: silencio, chamarModelo: modelo });

    expect(r.lidas).toBe(1);
    expect(modelo.mock.calls[0][0]).not.toContain(MARCA);
    expect((await buscar(anulada)).explicacao).toBeNull();
  });

  it('sem --refazer-ia, explicação da IA fica; com ele, só a ia não revisada é refeita', async () => {
    const vazia = await inserir(1);
    const ia = await inserir(2, { explicacao: 'Antiga da IA.', explicacao_fonte: 'ia' });
    const iaRevisada = await inserir(3, { explicacao: 'IA conferida.', explicacao_fonte: 'ia', revisada: true });
    const humana = await inserir(4, { explicacao: 'Humana.', explicacao_fonte: 'humano' });

    const normal = await explicar({
      exame: EXAME_TESTE,
      aplicar: true,
      log: silencio,
      chamarModelo: modeloQueConcorda(),
    });
    expect(normal.lidas).toBe(1);
    expect((await buscar(vazia)).explicacao_fonte).toBe('ia');
    expect((await buscar(ia)).explicacao).toBe('Antiga da IA.');

    const modelo = modeloQueConcorda();
    const refeita = await explicar({
      exame: EXAME_TESTE,
      aplicar: true,
      refazerIa: true,
      log: silencio,
      chamarModelo: modelo,
    });

    // Pega as duas 'ia' não revisadas (a recém-gravada e a antiga), e só elas.
    // Ids lidos do JSON, e não por substring: num banco novo os ids são
    // pequenos e `"id": 1` casaria com `"id": 10` ou com o `123` do exemplo.
    const enviados = modelo.mock.calls.flatMap(([p]) => idsDoPrompt(p)).sort((a, b) => a - b);
    expect(enviados).toEqual([vazia, ia].sort((a, b) => a - b));
    expect(refeita.gravadas).toBe(2);

    expect((await buscar(ia)).explicacao).toBe(textoBom(`[${ia}]`).trim());
    expect((await buscar(iaRevisada)).explicacao).toBe('IA conferida.');
    expect((await buscar(humana)).explicacao).toBe('Humana.');
  });

  it('modo conferência não grava, mas percorre a fila inteira', async () => {
    const ids = [];
    for (let n = 1; n <= 5; n++) ids.push(await inserir(n));
    const modelo = modeloQueConcorda();

    const r = await explicar({ exame: EXAME_TESTE, lote: 2, aplicar: false, log: silencio, chamarModelo: modelo });

    expect(r).toMatchObject({ lidas: 5, explicadas: 5, gravadas: 0 });
    expect(modelo).toHaveBeenCalledTimes(3);
    for (const id of ids) expect((await buscar(id)).explicacao).toBeNull();
  });

  it('lote com JSON quebrado não derruba a rodada e volta na próxima', async () => {
    const ids = [];
    for (let n = 1; n <= 4; n++) ids.push(await inserir(n));

    const bom = modeloQueConcorda();
    let chamadas = 0;
    const chamarModelo = jest.fn(async (prompt) => {
      chamadas++;
      if (chamadas === 1) return { conteudo: '[{"id": 1, "correta": "C", "explicacao": "cortad', modelo: 'm' };
      return bom(prompt);
    });

    const r = await explicar({ exame: EXAME_TESTE, lote: 2, aplicar: true, log: silencio, chamarModelo });

    expect(r.lotesComErro).toBe(1);
    expect(r.errosDeLote[0].ids).toEqual(ids.slice(0, 2));
    expect(r.gravadas).toBe(2);
    expect((await buscar(ids[0])).explicacao).toBeNull();
    expect((await buscar(ids[2])).explicacao_fonte).toBe('ia');

    // Próxima rodada: as duas do lote quebrado são as únicas na fila.
    const modelo = modeloQueConcorda();
    const segunda = await explicar({ exame: EXAME_TESTE, lote: 2, aplicar: true, log: silencio, chamarModelo: modelo });
    expect(segunda).toMatchObject({ lidas: 2, gravadas: 2, lotesComErro: 0 });
  });

  it('para a rodada quando a cota está esgotada, em vez de gastar mais pedidos', async () => {
    for (let n = 1; n <= 4; n++) await inserir(n);
    const chamarModelo = jest.fn(async () => {
      const e = new Error('m: HTTP 429');
      e.cotaEsgotada = true;
      throw e;
    });

    const r = await explicar({ exame: EXAME_TESTE, lote: 1, aplicar: true, log: silencio, chamarModelo });

    expect(chamarModelo).toHaveBeenCalledTimes(1);
    expect(r.interrompida).toMatch(/429/);
    expect(r.lidas).toBe(1);
  });

  it('respeita --total', async () => {
    for (let n = 1; n <= 5; n++) await inserir(n);
    const r = await explicar({
      exame: EXAME_TESTE,
      lote: 2,
      total: 3,
      aplicar: true,
      log: silencio,
      chamarModelo: modeloQueConcorda(),
    });
    expect(r.lidas).toBe(3);
    expect(r.gravadas).toBe(3);
  });
});

// O banco guarda índice (001_baseline.sql); o modelo precisa da letra. A
// conversão errada por um seria um gabarito errado entregue ao modelo.
test('gabarito é índice 0..3 e vira A..D no prompt', () => {
  LETRAS.forEach((letra, i) => {
    const p = montarPrompt([{ id: 1, enunciado: 'x', alternativas: ['a', 'b', 'c', 'd'], gabarito: i }]);
    expect(p).toContain(`"gabarito_oficial": "${letra}"`);
  });
});
