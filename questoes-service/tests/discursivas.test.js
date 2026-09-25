const request = require('supertest');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'segredo-de-teste';

const jwt = require('jsonwebtoken');
const { app, pool } = require('../app');
const { migrate } = require('../migrate');
const { carregarDiscursivas, validarDiscursivas } = require('../carregar_discursivas');

// Exames fictícios, fora da faixa real, para a suíte poder apagar o que é
// dela sem risco de levar acervo junto.
const EXAMES_TESTE = [97, 98, 99];

const TOKEN = `Bearer ${jwt.sign({ id: 2001, email: 'u2001@exemplo.local' }, process.env.JWT_SECRET)}`;

const limpar = () =>
  pool.query('DELETE FROM questoes_discursivas WHERE exame = ANY($1)', [EXAMES_TESTE]);

const item = (letra, extra = {}) => ({
  letra,
  pergunta: `Pergunta ${letra}? Justifique.`,
  valor: letra === 'A' ? 0.65 : 0.6,
  gabarito: `Resposta ${letra}, nos termos do Art. 1º do CC.`,
  ...extra,
});

const questao = (campos = {}) => ({
  exame: 99,
  area: 'civil',
  numero: 1,
  enunciado: 'Caso de teste. '.repeat(30).trim(),
  itens: [item('A'), item('B')],
  fonte: 'FGV – teste',
  ...campos,
});

const exame = (n, area = 'civil') =>
  [1, 2, 3, 4].map((numero) => questao({ exame: n, area, numero, enunciado: `Exame ${n} questão ${numero}. ${'texto '.repeat(60)}` }));

beforeAll(async () => {
  await migrate(pool);
  await limpar();
});

afterEach(limpar);

afterAll(async () => {
  await limpar();
  await pool.end();
});

describe('autenticação', () => {
  it('lista e detalhe recusam sem token', async () => {
    expect((await request(app).get('/discursivas?area=civil')).status).toBe(401);
    expect((await request(app).get('/discursivas/1')).status).toBe(401);
  });

  it('recusa token assinado com outro segredo', async () => {
    const forjado = jwt.sign({ id: 2001 }, 'outro-segredo');
    const res = await request(app)
      .get('/discursivas?area=civil')
      .set('Authorization', `Bearer ${forjado}`);
    expect(res.status).toBe(401);
  });
});

describe('GET /discursivas', () => {
  it('exige area', async () => {
    const res = await request(app).get('/discursivas').set('Authorization', TOKEN);
    expect(res.status).toBe(400);
  });

  it('recusa area fora da lista, em vez de devolver lista vazia', async () => {
    for (const area of ['Civil', 'direito civil', 'xyz']) {
      const res = await request(app)
        .get(`/discursivas?area=${encodeURIComponent(area)}`)
        .set('Authorization', TOKEN);
      expect(res.status).toBe(400);
    }
    // Parâmetro repetido chega como array; não pode passar pela validação.
    const res = await request(app)
      .get('/discursivas?area=civil&area=penal')
      .set('Authorization', TOKEN);
    expect(res.status).toBe(400);
  });

  it('ordena por exame DESC e numero ASC e filtra pela área', async () => {
    await carregarDiscursivas(pool, [...exame(98), ...exame(99), ...exame(97, 'penal')]);

    const res = await request(app).get('/discursivas?area=civil').set('Authorization', TOKEN);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);

    const nossos = res.body.filter((q) => EXAMES_TESTE.includes(q.exame));
    expect(nossos.map((q) => [q.exame, q.numero])).toEqual([
      [99, 1], [99, 2], [99, 3], [99, 4],
      [98, 1], [98, 2], [98, 3], [98, 4],
    ]);
    expect(nossos.every((q) => q.area === 'civil')).toBe(true);
  });

  it('devolve só os campos da lista, com resumo curto e id numérico', async () => {
    await carregarDiscursivas(pool, exame(99));

    const res = await request(app).get('/discursivas?area=civil').set('Authorization', TOKEN);
    const q = res.body.find((x) => x.exame === 99 && x.numero === 1);

    expect(Object.keys(q).sort()).toEqual(['area', 'exame', 'id', 'numero', 'resumo']);
    expect(typeof q.id).toBe('number');
    expect(q.resumo.startsWith('Exame 99 questão 1.')).toBe(true);
    // ~160 caracteres mais a reticência, sem cortar palavra.
    expect(q.resumo.length).toBeLessThanOrEqual(161);
    expect(q.resumo.endsWith('…')).toBe(true);
    expect(q.resumo).not.toMatch(/ tex…$/);
  });

  it('enunciado curto volta inteiro, sem reticência', async () => {
    await carregarDiscursivas(pool, [questao({ enunciado: 'Caso curto.' })]);
    const res = await request(app).get('/discursivas?area=civil').set('Authorization', TOKEN);
    const q = res.body.find((x) => x.exame === 99);
    expect(q.resumo).toBe('Caso curto.');
  });
});

describe('GET /discursivas/:id', () => {
  it('devolve a questão com itens e padrão de resposta', async () => {
    await carregarDiscursivas(pool, [questao({
      itens: [item('A', { distribuicao: 'A. Resposta (0,55), Art. 1º (0,10).' }), item('B')],
    })]);
    const { rows } = await pool.query(
      'SELECT id FROM questoes_discursivas WHERE exame = 99 AND numero = 1'
    );

    const res = await request(app)
      .get(`/discursivas/${rows[0].id}`)
      .set('Authorization', TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(Number(rows[0].id));
    expect(res.body).toMatchObject({ exame: 99, numero: 1, area: 'civil' });
    expect(res.body.enunciado).toContain('Caso de teste.');
    expect(res.body.itens).toHaveLength(2);
    expect(res.body.itens[0]).toMatchObject({
      letra: 'A',
      pergunta: 'Pergunta A? Justifique.',
      valor: 0.65,
      gabarito: 'Resposta A, nos termos do Art. 1º do CC.',
      distribuicao: 'A. Resposta (0,55), Art. 1º (0,10).',
    });
    expect(res.body.itens[1].distribuicao).toBeUndefined();
  });

  it('404 para id inexistente', async () => {
    const res = await request(app).get('/discursivas/99999999').set('Authorization', TOKEN);
    expect(res.status).toBe(404);
  });

  it('400 — e não 500 — para id malformado ou grande demais', async () => {
    for (const id of ['abc', '0', '-1', '1.5', '1e3', '99999999999999999999999']) {
      const res = await request(app).get(`/discursivas/${id}`).set('Authorization', TOKEN);
      expect(res.status).toBe(400);
    }
  });
});

describe('carga (carregar_discursivas.js)', () => {
  const contar = async () =>
    (await pool.query('SELECT COUNT(*)::int AS n FROM questoes_discursivas WHERE exame = ANY($1)',
      [EXAMES_TESTE])).rows[0].n;

  it('é idempotente: rodar de novo atualiza, não duplica', async () => {
    const primeira = await carregarDiscursivas(pool, exame(99));
    expect(primeira).toEqual({ inseridas: 4, atualizadas: 0 });

    const corrigido = exame(99);
    corrigido[2].itens[0].gabarito = 'Gabarito retificado pela banca, Art. 2º.';
    const segunda = await carregarDiscursivas(pool, corrigido);

    expect(segunda).toEqual({ inseridas: 0, atualizadas: 4 });
    expect(await contar()).toBe(4);
    const { rows } = await pool.query(
      `SELECT itens->0->>'gabarito' AS g FROM questoes_discursivas WHERE exame = 99 AND numero = 3`
    );
    expect(rows[0].g).toBe('Gabarito retificado pela banca, Art. 2º.');
  });

  it('questão repetida no lote é recusada antes de gravar qualquer coisa', async () => {
    const lote = exame(98);
    lote[3].numero = 1; // duplica (98, civil, 1)
    await expect(carregarDiscursivas(pool, lote)).rejects.toThrow(/repetida/);
    expect(await contar()).toBe(0);
  });

  it('rollback por exame: erro do schema desfaz o exame inteiro', async () => {
    const lote = exame(98);
    // Texto com NUL passa pela validação em JS e o Postgres recusa no INSERT
    // da última questão — as três primeiras precisam sumir junto.
    lote[3].enunciado = 'quebrado \u0000 aqui';
    await expect(carregarDiscursivas(pool, lote)).rejects.toThrow(/exame 98/);
    expect(await contar()).toBe(0);
  });

  it('descarta campos desconhecidos dos itens', async () => {
    await carregarDiscursivas(pool, [questao({ itens: [item('A', { lixo: 1 }), item('B')] })]);
    const { rows } = await pool.query(
      `SELECT itens->0 AS a FROM questoes_discursivas WHERE exame = 99 AND numero = 1`
    );
    expect(rows[0].a.lixo).toBeUndefined();
  });

  it('validação recusa questão torta antes de abrir transação', () => {
    expect(() => validarDiscursivas([])).toThrow(/vazio/);
    expect(() => validarDiscursivas([questao({ area: 'Civil' })])).toThrow(/area/);
    expect(() => validarDiscursivas([questao({ numero: 5 })])).toThrow(/numero/);
    expect(() => validarDiscursivas([questao({ itens: [item('A')] })])).toThrow(/itens/);
    expect(() => validarDiscursivas([questao({ itens: [item('A'), item('C')] })])).toThrow(/deveria ser B/);
    expect(() => validarDiscursivas([questao({ itens: [item('A'), item('B', { gabarito: ' ' })] })]))
      .toThrow(/sem gabarito/);
    expect(() => validarDiscursivas([questao({ itens: [item('A', { valor: '0,65' }), item('B')] })]))
      .toThrow(/valor/);
  });
});

describe('o banco recusa discursiva malformada', () => {
  const inserir = (campos) => {
    const q = questao(campos);
    return pool.query(
      `INSERT INTO questoes_discursivas (exame, area, numero, enunciado, itens)
       VALUES ($1, $2, $3, $4, $5)`,
      [q.exame, q.area, q.numero, q.enunciado, JSON.stringify(q.itens)]
    );
  };

  it('área fora do vocabulário', async () => {
    await expect(inserir({ area: 'Direito Civil' })).rejects.toThrow();
  });

  it('número fora de 1..4', async () => {
    await expect(inserir({ numero: 5 })).rejects.toThrow();
  });

  it('itens vazio ou que não é lista', async () => {
    await expect(inserir({ itens: [] })).rejects.toThrow();
    await expect(inserir({ itens: { A: 'x' } })).rejects.toThrow();
  });

  it('a mesma questão duas vezes', async () => {
    await inserir({});
    await expect(inserir({})).rejects.toThrow();
  });
});
