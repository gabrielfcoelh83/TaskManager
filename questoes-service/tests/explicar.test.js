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
  conferirGravadas,
  interpretarResposta,
  interpretarConferencia,
  montarPrompt,
  montarPromptConferencia,
  chamarOpenRouter,
  chamarConferencia,
  PROMPT_CONFERENCIA,
  letraAfirmadaNoTexto,
  citacaoNumerada,
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

// Conferente que aprova tudo o que recebe, com modelo diferente do gerador.
function conferenteQueAprova(modelo = 'conferente-teste') {
  return jest.fn(async (prompt) => ({
    conteudo: JSON.stringify(itensDaConferencia(prompt).map((q) => ({ id: q.id, aprovada: true, problemas: [] }))),
    modelo,
  }));
}

// A lista que o prompt de conferência carrega.
const itensDaConferencia = (prompt) =>
  JSON.parse(prompt.slice(prompt.indexOf('['), prompt.indexOf(']\n\nResponda') + 1));

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

  it('o prompt de sistema proíbe número de dispositivo, mesmo com certeza', () => {
    expect(PROMPT_SISTEMA).toMatch(/É PROIBIDO ESCREVER QUALQUER NÚMERO DE DISPOSITIVO/);
    expect(PROMPT_SISTEMA).toMatch(/mesmo\s+que você tenha certeza/);
    for (const termo of ['artigo', 'parágrafo', 'inciso', 'alínea', 'súmula', 'lei', 'decreto', 'tema', 'enunciado', 'REsp', 'ADI', '§']) {
      expect(PROMPT_SISTEMA).toContain(termo);
    }
    // nomear o diploma sem número continua permitido
    expect(PROMPT_SISTEMA).toMatch(/"a Lei do\s+Inquilinato"/);
    // e a regra antiga, que deixava citar "com certeza", não volta
    expect(PROMPT_SISTEMA).not.toMatch(/QUANDO VOCÊ TIVER CERTEZA/);
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

  // Os três erros reais da rodada no 45º Exame (ver explicar.js): todos em
  // citação numerada, todos escritos com "certeza".
  it('recusa os três erros reais de citação numerada do 45º Exame', () => {
    const casos = [
      ['A Súmula 37 do STJ admite cumular dano estético e moral.', 'Súmula 37'],
      ['A Lei 9.514/97, que regula a alienação fiduciária de bens móveis, autoriza a busca.', 'Lei 9.514/97'],
      ['A procuração pode ser outorgada oralmente, nos termos do art. 112 do ECA.', 'art. 112'],
    ];
    for (const [frase, trecho] of casos) {
      const { aceitas, recusadas } = interpretarResposta(
        resp([{ id: 1, correta: 'C', explicacao: `${textoBom()} ${frase}` }]),
        [lote[0]]
      );
      expect(aceitas).toEqual([]);
      expect(recusadas).toEqual([{ id: 1, motivo: `cita dispositivo numerado: ${trecho}` }]);
    }
  });

  it('aceita texto com números que não são citação e diplomas nomeados sem número', () => {
    const frase =
      'O prazo é de 15 dias, a multa chega a R$ 10.000,00 e o réu era maior de 18 anos; a prova tem 80 questões ' +
      'e o contrato durou 2 anos. A CF/88, a Constituição de 1988, o Código Civil de 2002, o CPC/2015, ' +
      'a Lei do Inquilinato, o Estatuto da Advocacia, o ECA, a LINDB, a jurisprudência do STJ e o parágrafo ' +
      'único do dispositivo tratam do tema; o 1º grau decidiu em 30% do valor.';
    const { aceitas, recusadas } = interpretarResposta(
      resp([{ id: 1, correta: 'C', explicacao: `${textoBom()} ${frase}` }]),
      [lote[0]]
    );
    expect(recusadas).toEqual([]);
    expect(aceitas).toHaveLength(1);
  });

  describe('citacaoNumerada', () => {
    it.each([
      ['art 112 do ECA', 'art 112'],
      ['Art.5º', 'Art.5º'],
      ['arts. 1.228 e 1.229', 'arts. 1.228'],
      ['artigo 37 da Constituição', 'artigo 37'],
      ['nos termos do § 2º', '§ 2º'],
      ['no § único', '§'],
      ['parágrafo 2º', 'parágrafo 2º'],
      ['inciso IV', 'inciso IV'],
      ['incisos ii e iii', 'incisos ii'],
      ['inciso 3', 'inciso 3'],
      ['alínea "a"', 'alínea "a"'],
      ['alinea b', 'alinea b'],
      ['Súmula Vinculante 13', 'Súmula Vinculante 13'],
      ['súmula nº 7 do STJ', 'súmula nº 7'],
      ['SV 13', 'SV 13'],
      ['Lei nº 8.245/1991', 'Lei nº 8.245/1991'],
      ['Lei n. 8.078', 'Lei n. 8.078'],
      ['Lei Complementar 123', 'Lei Complementar 123'],
      ['Decreto-Lei 911/69', 'Decreto-Lei 911/69'],
      ['DL 911/69', 'DL 911/69'],
      ['decreto 3.000', 'decreto 3.000'],
      ['MP 2.200', 'MP 2.200'],
      ['LC 123', 'LC 123'],
      ['Medida Provisória 1.000', 'Medida Provisória 1.000'],
      ['Tema 1.046 do STF', 'Tema 1.046'],
      ['Enunciado 22 da Jornada', 'Enunciado 22'],
      ['REsp 1.234.567', 'REsp 1.234.567'],
      ['AgRg no AREsp 123', 'AREsp 123'],
      ['RE 574.706', 'RE 574.706'],
      ['HC 126.292', 'HC 126.292'],
      ['ADI 4.277', 'ADI 4.277'],
      ['ADPF 132', 'ADPF 132'],
      ['ADC 43', 'ADC 43'],
      ['a Lei do Inquilinato (8.245/91)', '8.245/91'],
      ['processo nº 123', 'nº 123'],
    ])('recusa %j', (texto, trecho) => {
      expect(citacaoNumerada(texto)).toBe(trecho);
    });

    it.each([
      'prazo de 15 dias',
      '80 questões',
      '2 anos',
      'R$ 10.000',
      'CF/88',
      'a Constituição de 1988',
      'CPC/2015',
      '1º grau e 2ª fase',
      'o 45º Exame',
      'o parágrafo único do dispositivo',
      'o enunciado no 2º parágrafo',
      'a lei de 1990',
      'a súmula do STJ, editada em 2009,',
      'o artigo de lei',
      'a parte 2',
      'inciso do artigo',
      'a alínea é clara',
      'RE e REsp',
    ])('aceita %j', (texto) => {
      expect(citacaoNumerada(texto)).toBeNull();
    });
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

    expect(r).toEqual({ conteudo: '[]', modelo: 'm3', tentativas: 3 });
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

    const r = await explicar({ exame: EXAME_TESTE, aplicar: true, log: silencio, chamarModelo: modelo, conferirModelo: conferenteQueAprova() });

    expect(r).toMatchObject({ lidas: 1, geradas: 1, aprovadas: 1, gravadas: 1, recusadas: [], reprovadas: [], modelos: ['modelo-teste'], pedidos: 2 });
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
      conferirModelo: conferenteQueAprova(),
      exame: EXAME_TESTE,
      aplicar: true,
      log: silencio,
      chamarModelo: modeloQueConcorda({ letra: () => 'A' }),
    });

    expect(r.gravadas).toBe(0);
    expect(r.recusadas).toEqual([{ id, motivo: 'modelo discorda do gabarito (disse A, oficial C)' }]);
    expect((await buscar(id)).explicacao).toBeNull();

    const segunda = await explicar({
      conferirModelo: conferenteQueAprova(),
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
      await explicar({ exame: EXAME_TESTE, aplicar: true, refazerIa, log: silencio, chamarModelo: modelo, conferirModelo: conferenteQueAprova() });
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

    const r = await explicar({ exame: EXAME_TESTE, aplicar: true, log: silencio, chamarModelo, conferirModelo: conferenteQueAprova() });

    expect(r.geradas).toBe(1);
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

    const r = await explicar({ exame: EXAME_TESTE, aplicar: true, log: silencio, chamarModelo, conferirModelo: conferenteQueAprova() });

    expect(r.gravadas).toBe(0);
    expect((await buscar(anulada)).explicacao).toBeNull();
    expect((await buscar(trocada)).explicacao).toBeNull();
  });

  it('pula anuladas', async () => {
    const MARCA = 'QUESTAO-ANULADA';
    const anulada = await inserir(1, { anulada: true, enunciado: `${MARCA}: a FGV anulou.` });
    await inserir(2);
    const modelo = modeloQueConcorda();

    const r = await explicar({ exame: EXAME_TESTE, aplicar: true, log: silencio, chamarModelo: modelo, conferirModelo: conferenteQueAprova() });

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
      conferirModelo: conferenteQueAprova(),
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
      conferirModelo: conferenteQueAprova(),
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

  it('prévia (sem --aplicar) não grava, mas gera, confere e percorre a fila inteira', async () => {
    const ids = [];
    for (let n = 1; n <= 5; n++) ids.push(await inserir(n));
    const modelo = modeloQueConcorda();

    const r = await explicar({ exame: EXAME_TESTE, lote: 2, aplicar: false, log: silencio, chamarModelo: modelo, conferirModelo: conferenteQueAprova() });

    expect(r).toMatchObject({ lidas: 5, geradas: 5, aprovadas: 5, gravadas: 0 });
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

    const r = await explicar({ exame: EXAME_TESTE, lote: 2, aplicar: true, log: silencio, chamarModelo, conferirModelo: conferenteQueAprova() });

    expect(r.lotesComErro).toBe(1);
    expect(r.errosDeLote[0].ids).toEqual(ids.slice(0, 2));
    expect(r.gravadas).toBe(2);
    expect((await buscar(ids[0])).explicacao).toBeNull();
    expect((await buscar(ids[2])).explicacao_fonte).toBe('ia');

    // Próxima rodada: as duas do lote quebrado são as únicas na fila.
    const modelo = modeloQueConcorda();
    const segunda = await explicar({ exame: EXAME_TESTE, lote: 2, aplicar: true, log: silencio, chamarModelo: modelo, conferirModelo: conferenteQueAprova() });
    expect(segunda).toMatchObject({ lidas: 2, gravadas: 2, lotesComErro: 0 });
  });

  it('para a rodada quando a cota está esgotada, em vez de gastar mais pedidos', async () => {
    for (let n = 1; n <= 4; n++) await inserir(n);
    const chamarModelo = jest.fn(async () => {
      const e = new Error('m: HTTP 429');
      e.cotaEsgotada = true;
      throw e;
    });

    const r = await explicar({ exame: EXAME_TESTE, lote: 1, aplicar: true, log: silencio, chamarModelo, conferirModelo: conferenteQueAprova() });

    expect(chamarModelo).toHaveBeenCalledTimes(1);
    expect(r.interrompida).toMatch(/429/);
    expect(r.lidas).toBe(1);
  });

  it('respeita --total', async () => {
    for (let n = 1; n <= 5; n++) await inserir(n);
    const r = await explicar({
      conferirModelo: conferenteQueAprova(),
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

// ---------------------------------------------------------------------------
// CONFERÊNCIA POR UM SEGUNDO MODELO
//
// Os dois erros jurídicos reais da primeira rodada do 46º Exame (Ética):
// letra oficial certa, nenhum número de dispositivo, tamanho dentro da faixa
// — passam em todos os filtros de texto, e por isso a conferência existe.
// ---------------------------------------------------------------------------

// 46º/1 — gabarito D. Erro: Procuradoria do Estado tratada como Ministério
// Público (o fundamento é a legitimação exclusiva para a advocacia vinculada
// à função, no Estatuto da Advocacia).
const REAL_46_1 = {
  gabarito: 3,
  enunciado:
    'Danilo, advogado, foi nomeado Procurador-Geral do Estado. Ele pretende continuar advogando em causas particulares.',
  explicacao:
    'A alternativa D está correta. Ao assumir a chefia da procuradoria, Danilo passa a integrar a carreira do ' +
    'Ministério Público, e por isso fica impedido de exercer a advocacia fora das atribuições do cargo. A ' +
    'alternativa A está errada porque não há licença automática da inscrição nesse caso. A alternativa B está ' +
    'errada porque a restrição não alcança apenas as causas contra o Estado. A alternativa C está errada porque ' +
    'a inscrição não é cancelada; apenas a advocacia privada fica vedada enquanto durar a chefia do órgão.',
  problemas: [
    'Diz que a chefia da procuradoria integra a carreira do Ministério Público; a Procuradoria do Estado não é MP — o fundamento é a legitimação exclusiva para a advocacia vinculada à função, no Estatuto da Advocacia.',
  ],
};

// 46º/4 — gabarito A. Erros: nega a participação em bens particulares (o
// Código de Ética a admite excepcionalmente) e diz que a quota litis não
// precisa ser em pecúnia (precisa).
const REAL_46_4 = {
  gabarito: 0,
  enunciado:
    'Uma cliente teve os bens bloqueados e propôs ao advogado pagar os honorários com parte do que vier a ser liberado.',
  explicacao:
    'A alternativa A está correta, pois o advogado pode ajustar os honorários com a cliente desde que observe os ' +
    'limites éticos da cobrança. A alternativa B está errada porque não há previsão de participação do advogado ' +
    'nos bens particulares do cliente. A alternativa C está errada porque a cláusula de quota litis não exige que ' +
    'a contraprestação seja exclusivamente pecuniária, podendo o advogado receber bens. A alternativa D está errada ' +
    'porque o bloqueio dos bens não autoriza o advogado a reter valores sem previsão no contrato de honorários.',
  problemas: [
    'Diz que não há previsão de participação do advogado em bens particulares do cliente; o Código de Ética a admite excepcionalmente.',
    'Diz que a quota litis não precisa ser exclusivamente em pecúnia; o Código de Ética exige que seja em pecúnia.',
  ],
};

// Só o que a questão tem no banco antes de ser explicada.
const pendente = (real) => ({ gabarito: real.gabarito, enunciado: real.enunciado });

// Gerador que devolve, por id, o texto de `textos` (ou o texto bom).
function geradorComTextos(textos, modelo = 'modelo-teste') {
  return jest.fn(async (prompt) => ({
    conteudo: JSON.stringify(
      itensDoPrompt(prompt).map((q) => ({
        id: q.id,
        correta: q.gabarito_oficial,
        explicacao: textos[q.id] ?? textoBom(`[${q.id}]`),
      }))
    ),
    modelo,
  }));
}

// Conferente que reprova os ids de `reprovar` (id -> problemas) e aprova o resto.
function conferenteQueReprova(reprovar, modelo = 'conferente-teste') {
  return jest.fn(async (prompt) => ({
    conteudo: JSON.stringify(
      itensDaConferencia(prompt).map((q) =>
        reprovar[q.id]
          ? { id: q.id, aprovada: false, problemas: reprovar[q.id] }
          : { id: q.id, aprovada: true, problemas: [] }
      )
    ),
    modelo,
  }));
}

describe('conferência: prompt e interpretação', () => {
  it('o prompt manda reprovar erro jurídico, contradição, justificativa genérica e citação inventada — e na dúvida', () => {
    expect(PROMPT_CONFERENCIA).toMatch(/REPROVE/);
    expect(PROMPT_CONFERENCIA).toMatch(/afirmação jurídica falsa/);
    expect(PROMPT_CONFERENCIA).toMatch(/instituto, órgão, carreira, lei, regra/);
    expect(PROMPT_CONFERENCIA).toMatch(/contradição com a letra oficial/);
    expect(PROMPT_CONFERENCIA).toMatch(/justificativa genérica/);
    expect(PROMPT_CONFERENCIA).toMatch(/citação inventada/);
    expect(PROMPT_CONFERENCIA).toMatch(/Na dúvida, REPROVE/);
    expect(PROMPT_CONFERENCIA).toMatch(/APENAS com JSON/);
  });

  it('montarPromptConferencia leva enunciado, alternativas, letra oficial e a explicação', () => {
    const q = { id: 9, enunciado: 'Caso.', alternativas: ['a', 'b', 'c', 'd'], gabarito: 3, disciplina: 'Ética', tema: null };
    const prompt = montarPromptConferencia([{ id: 9, explicacao: 'Texto da explicação.' }], [q]);
    expect(itensDaConferencia(prompt)).toEqual([
      {
        id: 9,
        disciplina: 'Ética',
        enunciado: 'Caso.',
        alternativas: { A: 'a', B: 'b', C: 'c', D: 'd' },
        gabarito_oficial: 'D',
        explicacao: 'Texto da explicação.',
      },
    ]);
    expect(prompt).toMatch(/"aprovada"/);
    expect(prompt).toMatch(/"problemas"/);
  });

  it('lê aprovada e reprovada, com os problemas', () => {
    const v = interpretarConferencia(
      JSON.stringify([
        { id: 1, aprovada: true, problemas: [] },
        { id: 2, aprovada: false, problemas: ['Erro de instituto.'] },
      ]),
      [1, 2]
    );
    expect(v.get(1)).toEqual({ aprovada: true, problemas: [] });
    expect(v.get(2)).toEqual({ aprovada: false, problemas: ['Erro de instituto.'] });
  });

  it('aprovada com problemas apontados conta como reprovada; reprovada muda ganha motivo', () => {
    const v = interpretarConferencia(
      JSON.stringify([
        { id: 1, aprovada: true, problemas: ['Mas cita prazo errado.'] },
        { id: 2, aprovada: false, problemas: [] },
      ]),
      [1, 2]
    );
    expect(v.get(1).aprovada).toBe(false);
    expect(v.get(1).problemas[0]).toBe('Mas cita prazo errado.');
    expect(v.get(2)).toEqual({ aprovada: false, problemas: ['(conferente reprovou sem dizer por quê)'] });
  });

  it('aceita cerca ```json em volta', () => {
    const v = interpretarConferencia('```json\n[{"id": 1, "aprovada": true, "problemas": []}]\n```', [1]);
    expect(v.get(1).aprovada).toBe(true);
  });

  it.each([
    ['texto sem JSON', 'Todas as explicações estão corretas.'],
    ['JSON cortado', '[{"id": 1, "aprovada": tr'],
    ['objeto em vez de lista', '{"id": 1, "aprovada": true}'],
    ['"aprovada" em string', '[{"id": 1, "aprovada": "true", "problemas": []}]'],
    ['"aprovada" ausente', '[{"id": 1, "problemas": []}]'],
    ['"problemas" que não é lista', '[{"id": 1, "aprovada": false, "problemas": "erro"}]'],
    ['id faltando', '[{"id": 1, "aprovada": true, "problemas": []}]', [1, 2]],
    ['id fora do lote', '[{"id": 1, "aprovada": true, "problemas": []}, {"id": 7, "aprovada": true, "problemas": []}]'],
    ['id repetido', '[{"id": 1, "aprovada": false, "problemas": ["x"]}, {"id": 1, "aprovada": true, "problemas": []}]'],
  ])('JSON inválido da conferência LANÇA, nunca aprova: %s', (_caso, texto, ids = [1]) => {
    expect(() => interpretarConferencia(texto, ids)).toThrow();
  });

  it('os dois erros reais do 46º passam em todos os filtros de texto (por isso a conferência)', () => {
    const { aceitas, recusadas } = interpretarResposta(
      JSON.stringify([
        { id: 1, correta: 'D', explicacao: REAL_46_1.explicacao },
        { id: 4, correta: 'A', explicacao: REAL_46_4.explicacao },
      ]),
      [
        { id: 1, gabarito: REAL_46_1.gabarito },
        { id: 4, gabarito: REAL_46_4.gabarito },
      ]
    );
    expect(recusadas).toEqual([]);
    expect(aceitas.map((a) => a.id)).toEqual([1, 4]);
  });
});

describe('explicar com conferência', () => {
  it('grava a aprovada e NÃO grava as reprovadas (os dois casos reais do 46º), que voltam na próxima rodada', async () => {
    const q1 = await inserir(1, pendente(REAL_46_1));
    const q4 = await inserir(4, pendente(REAL_46_4));
    const boa = await inserir(5, { gabarito: 1 });

    const gerador = geradorComTextos({ [q1]: REAL_46_1.explicacao, [q4]: REAL_46_4.explicacao });
    const conferente = conferenteQueReprova({ [q1]: REAL_46_1.problemas, [q4]: REAL_46_4.problemas });
    const linhas = [];

    const r = await explicar({
      exame: EXAME_TESTE,
      aplicar: true,
      log: (m) => linhas.push(m),
      chamarModelo: gerador,
      conferirModelo: conferente,
    });

    expect(r).toMatchObject({ lidas: 3, geradas: 3, aprovadas: 1, gravadas: 1, pedidos: 2, lotesComErro: 0 });
    expect(r.reprovadas).toEqual([
      { id: q1, exame: EXAME_TESTE, numero: 1, problemas: REAL_46_1.problemas },
      { id: q4, exame: EXAME_TESTE, numero: 4, problemas: REAL_46_4.problemas },
    ]);
    // Os problemas vão para a tela.
    const saida = linhas.join('\n');
    expect(saida).toContain('REPROVADA na conferência');
    expect(saida).toContain(REAL_46_4.problemas[1]);

    // O conferente recebeu as três explicações num pedido só, com a letra oficial.
    expect(conferente).toHaveBeenCalledTimes(1);
    const enviados = itensDaConferencia(conferente.mock.calls[0][0]);
    expect(enviados.find((i) => i.id === q1)).toMatchObject({ gabarito_oficial: 'D', explicacao: REAL_46_1.explicacao });

    // Reprovada não marca nada no banco.
    for (const id of [q1, q4]) {
      const q = await buscar(id);
      expect(q.explicacao).toBeNull();
      expect(q.explicacao_fonte).toBeNull();
    }
    expect((await buscar(boa)).explicacao_fonte).toBe('ia');

    // Próxima rodada: só as duas reprovadas estão na fila.
    const modelo = modeloQueConcorda();
    const segunda = await explicar({
      exame: EXAME_TESTE,
      aplicar: true,
      log: silencio,
      chamarModelo: modelo,
      conferirModelo: conferenteQueAprova(),
    });
    expect(idsDoPrompt(modelo.mock.calls[0][0]).sort((a, b) => a - b)).toEqual([q1, q4].sort((a, b) => a - b));
    expect(segunda.gravadas).toBe(2);
  });

  it('JSON inválido da conferência não grava nada: o lote falha e volta depois', async () => {
    const ids = [await inserir(1), await inserir(2)];
    const conferente = jest.fn(async () => ({ conteudo: '[{"id": 1, "aprovada": tru', modelo: 'conferente-teste' }));

    const r = await explicar({
      exame: EXAME_TESTE,
      aplicar: true,
      log: silencio,
      chamarModelo: modeloQueConcorda(),
      conferirModelo: conferente,
    });

    expect(r).toMatchObject({ geradas: 2, aprovadas: 0, gravadas: 0, lotesComErro: 1, pedidos: 2 });
    expect(r.errosDeLote[0].motivo).toMatch(/conferência/);
    for (const id of ids) expect((await buscar(id)).explicacao).toBeNull();
  });

  it('"aprovada": "true" (string) não vale como aprovação', async () => {
    const id = await inserir(1);
    const conferente = jest.fn(async (prompt) => ({
      conteudo: JSON.stringify(itensDaConferencia(prompt).map((q) => ({ id: q.id, aprovada: 'true', problemas: [] }))),
      modelo: 'conferente-teste',
    }));
    const r = await explicar({
      exame: EXAME_TESTE,
      aplicar: true,
      log: silencio,
      chamarModelo: modeloQueConcorda(),
      conferirModelo: conferente,
    });
    expect(r.gravadas).toBe(0);
    expect((await buscar(id)).explicacao).toBeNull();
  });

  it('a conferência é pedida excluindo o gerador; conferente igual ao gerador não grava', async () => {
    const id = await inserir(1);
    const conferente = conferenteQueAprova('modelo-teste'); // mesmo id do gerador

    const r = await explicar({
      exame: EXAME_TESTE,
      aplicar: true,
      log: silencio,
      chamarModelo: modeloQueConcorda(),
      conferirModelo: conferente,
    });

    expect(conferente.mock.calls[0][1]).toEqual({ excluir: ['modelo-teste'] });
    expect(r.gravadas).toBe(0);
    expect(r.errosDeLote[0].motivo).toMatch(/próprio gerador/);
    expect((await buscar(id)).explicacao).toBeNull();
  });

  it('lote todo recusado nos filtros de texto não vai à conferência (não gasta o pedido)', async () => {
    await inserir(1, { gabarito: 2 });
    const conferente = conferenteQueAprova();
    const r = await explicar({
      exame: EXAME_TESTE,
      aplicar: true,
      log: silencio,
      chamarModelo: modeloQueConcorda({ letra: () => 'A' }),
      conferirModelo: conferente,
    });
    expect(conferente).not.toHaveBeenCalled();
    expect(r.pedidos).toBe(1);
  });

  it('sem conferirModelo, explicar se recusa a rodar', async () => {
    await expect(explicar({ exame: EXAME_TESTE, aplicar: true, log: silencio, chamarModelo: modeloQueConcorda() })).rejects.toThrow(
      /conferirModelo/
    );
  });
});

// Ponta a ponta pelo cliente HTTP real (chamarOpenRouter / chamarConferencia),
// com `fetch` simulado: nenhum pedido sai para a OpenRouter.
describe('explicar + OpenRouter (fetch simulado)', () => {
  const fetchOriginal = global.fetch;
  afterEach(() => {
    global.fetch = fetchOriginal;
  });

  const ok = (conteudo) => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: conteudo } }] }) });

  // Responde como gerador quando o system prompt é o de explicação, e como
  // conferente (aprovando) quando é o de conferência. `falhar` = modelos que
  // devolvem 429 na geração.
  function fetchSimulado({ falharNaGeracao = [], reprovar = {} } = {}) {
    return jest.fn(async (_url, opts) => {
      const corpo = JSON.parse(opts.body);
      const [sistema, usuario] = corpo.messages.map((m) => m.content);
      if (sistema === PROMPT_SISTEMA) {
        if (falharNaGeracao.includes(corpo.model)) return { ok: false, status: 429 };
        const itens = itensDoPrompt(usuario);
        return ok(JSON.stringify(itens.map((q) => ({ id: q.id, correta: q.gabarito_oficial, explicacao: textoBom(`[${q.id}]`) }))));
      }
      if (sistema === PROMPT_CONFERENCIA) {
        const itens = itensDaConferencia(usuario);
        return ok(
          JSON.stringify(
            itens.map((q) => (reprovar[q.id] ? { id: q.id, aprovada: false, problemas: reprovar[q.id] } : { id: q.id, aprovada: true, problemas: [] }))
          )
        );
      }
      throw new Error('prompt de sistema desconhecido');
    });
  }

  const ligar = (modelos) => ({
    chamarModelo: (p) => chamarOpenRouter(p, { chave: 'k', modelos }),
    conferirModelo: (p, { excluir }) => chamarConferencia(p, { chave: 'k', modelos, excluir }),
  });

  const modelosDosPedidos = () =>
    global.fetch.mock.calls.map(([, o]) => {
      const c = JSON.parse(o.body);
      return [c.messages[0].content === PROMPT_SISTEMA ? 'gera' : 'confere', c.model, c.temperature];
    });

  it('o conferente é um modelo diferente do que escreveu', async () => {
    const id = await inserir(1);
    global.fetch = fetchSimulado();

    const r = await explicar({ exame: EXAME_TESTE, aplicar: true, log: silencio, ...ligar(['m1', 'm2', 'm3']) });

    expect(modelosDosPedidos()).toEqual([
      ['gera', 'm1', 0.2],
      ['confere', 'm2', 0],
    ]);
    expect(r).toMatchObject({ gravadas: 1, pedidos: 2, modelos: ['m1'], modelosConferencia: ['m2'] });
    expect((await buscar(id)).explicacao_fonte).toBe('ia');
  });

  it('se o gerador foi o 2º da lista (o 1º deu 429), o conferente pode ser o 1º — nunca o gerador', async () => {
    await inserir(1);
    global.fetch = fetchSimulado({ falharNaGeracao: ['m1'] });

    const r = await explicar({ exame: EXAME_TESTE, aplicar: true, log: silencio, ...ligar(['m1', 'm2']) });

    expect(modelosDosPedidos()).toEqual([
      ['gera', 'm1', 0.2],
      ['gera', 'm2', 0.2],
      ['confere', 'm1', 0],
    ]);
    expect(r).toMatchObject({ gravadas: 1, pedidos: 3 });
  });

  it('reprovada pelo conferente não é gravada', async () => {
    const id = await inserir(1, pendente(REAL_46_1));
    global.fetch = fetchSimulado({ reprovar: { [id]: REAL_46_1.problemas } });

    const r = await explicar({ exame: EXAME_TESTE, aplicar: true, log: silencio, ...ligar(['m1', 'm2']) });

    expect(r).toMatchObject({ geradas: 1, aprovadas: 0, gravadas: 0 });
    expect(r.reprovadas[0].problemas).toEqual(REAL_46_1.problemas);
    expect((await buscar(id)).explicacao).toBeNull();
  });

  it('com um só modelo disponível não há conferência: não grava e para a rodada', async () => {
    const ids = [];
    for (let n = 1; n <= 4; n++) ids.push(await inserir(n));
    global.fetch = fetchSimulado();

    const r = await explicar({ exame: EXAME_TESTE, lote: 3, aplicar: true, log: silencio, ...ligar(['m1']) });

    // Um pedido de geração e nenhum de conferência; o 2º lote nem é gerado.
    expect(modelosDosPedidos()).toEqual([['gera', 'm1', 0.2]]);
    expect(r).toMatchObject({ geradas: 3, aprovadas: 0, gravadas: 0, semConferente: 3, pedidos: 1 });
    expect(r.interrompida).toMatch(/sem segundo modelo/);
    for (const id of ids) expect((await buscar(id)).explicacao).toBeNull();
  });
});

describe('conferirGravadas (--conferir-gravadas)', () => {
  async function cenario() {
    return {
      reprovada: await inserir(1, { ...REAL_46_1, explicacao_fonte: 'ia' }),
      aprovada: await inserir(2, { explicacao: textoBom('[ok]').trim(), explicacao_fonte: 'ia' }),
      revisada: await inserir(3, { explicacao: 'IA revisada por pessoa.', explicacao_fonte: 'ia', revisada: true }),
      humana: await inserir(4, { explicacao: 'MARCA-HUMANA: escrita por pessoa.', explicacao_fonte: 'humano' }),
      vazia: await inserir(5),
    };
  }

  it('prévia: confere só as ia não revisadas e não muda nada', async () => {
    const c = await cenario();
    const conferente = conferenteQueReprova({ [c.reprovada]: REAL_46_1.problemas });

    const r = await conferirGravadas({ exame: EXAME_TESTE, aplicar: false, log: silencio, conferirModelo: conferente });

    const enviados = conferente.mock.calls.flatMap(([p]) => itensDaConferencia(p).map((i) => i.id)).sort((a, b) => a - b);
    expect(enviados).toEqual([c.reprovada, c.aprovada].sort((a, b) => a - b));
    expect(conferente.mock.calls[0][0]).not.toContain('MARCA-HUMANA');
    expect(r).toMatchObject({ lidas: 2, aprovadas: 1, limpas: 0, pedidos: 1 });
    expect(r.reprovadas).toEqual([{ id: c.reprovada, exame: EXAME_TESTE, numero: 1, problemas: REAL_46_1.problemas }]);
    expect((await buscar(c.reprovada)).explicacao).toBe(REAL_46_1.explicacao);
  });

  it('com --aplicar limpa SÓ a ia reprovada, que volta à fila; aprovada, revisada e humana ficam', async () => {
    const c = await cenario();
    const r = await conferirGravadas({
      exame: EXAME_TESTE,
      aplicar: true,
      log: silencio,
      conferirModelo: conferenteQueReprova({ [c.reprovada]: REAL_46_1.problemas }),
    });

    expect(r.limpas).toBe(1);
    const limpa = await buscar(c.reprovada);
    expect(limpa.explicacao).toBeNull();
    expect(limpa.explicacao_fonte).toBeNull();
    expect(limpa.gabarito).toBe(REAL_46_1.gabarito);
    expect((await buscar(c.aprovada)).explicacao_fonte).toBe('ia');
    expect((await buscar(c.revisada)).explicacao).toBe('IA revisada por pessoa.');
    const humana = await buscar(c.humana);
    expect(humana.explicacao).toBe('MARCA-HUMANA: escrita por pessoa.');
    expect(humana.explicacao_fonte).toBe('humano');

    // A limpa volta para a fila normal de geração.
    const modelo = modeloQueConcorda();
    await explicar({ exame: EXAME_TESTE, aplicar: false, log: silencio, chamarModelo: modelo, conferirModelo: conferenteQueAprova() });
    expect(idsDoPrompt(modelo.mock.calls[0][0]).sort((a, b) => a - b)).toEqual([c.reprovada, c.vazia].sort((a, b) => a - b));
  });

  it('nunca limpa humano, mesmo se a reprovada virar humana durante a conferência', async () => {
    const id = await inserir(1, { ...REAL_46_1, explicacao_fonte: 'ia' });
    const base = conferenteQueReprova({ [id]: REAL_46_1.problemas });
    const conferente = jest.fn(async (prompt, opts) => {
      await pool.query(`UPDATE questoes SET explicacao = 'Corrigida à mão.', explicacao_fonte = 'humano' WHERE id = $1`, [id]);
      return base(prompt, opts);
    });

    const r = await conferirGravadas({ exame: EXAME_TESTE, aplicar: true, log: silencio, conferirModelo: conferente });

    expect(r.reprovadas).toHaveLength(1);
    expect(r.limpas).toBe(0);
    expect(await buscar(id)).toMatchObject({ explicacao: 'Corrigida à mão.', explicacao_fonte: 'humano' });
  });

  it('JSON inválido da conferência não limpa nada', async () => {
    const c = await cenario();
    const r = await conferirGravadas({
      exame: EXAME_TESTE,
      aplicar: true,
      log: silencio,
      conferirModelo: jest.fn(async () => ({ conteudo: 'não sei', modelo: 'm' })),
    });
    expect(r).toMatchObject({ lotesComErro: 1, limpas: 0 });
    expect((await buscar(c.reprovada)).explicacao).toBe(REAL_46_1.explicacao);
  });
});
