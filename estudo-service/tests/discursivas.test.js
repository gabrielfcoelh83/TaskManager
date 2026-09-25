const request = require('supertest');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'segredo-de-teste';

const jwt = require('jsonwebtoken');
const { app, pool } = require('../app');
const { migrate } = require('../migrate');

// Usuários próprios desta suíte, diferentes dos de tentativas.test.js, para
// a limpeza de uma não apagar o que a outra está conferindo.
const DONO = 3001;
const OUTRO = 3002;

const como = (id) =>
  `Bearer ${jwt.sign({ id, email: `u${id}@exemplo.local` }, process.env.JWT_SECRET)}`;

const limpar = () =>
  pool.query('DELETE FROM respostas_discursivas WHERE user_id = ANY($1)', [[DONO, OUTRO]]);

const enviar = (corpo, quem = DONO) =>
  request(app).post('/discursivas/respostas').set('Authorization', como(quem)).send(corpo);

const listar = (query = '', quem = DONO) =>
  request(app).get(`/discursivas/respostas${query}`).set('Authorization', como(quem));

const valido = (extra = {}) => ({
  questao_id: 12,
  respostas: { A: 'Não, nos termos do Art. 1.659, I, do CC.', B: 'Sim, Art. 876, §5º, do CPC.' },
  ...extra,
});

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
  it('POST e GET recusam sem token', async () => {
    expect((await request(app).post('/discursivas/respostas').send(valido())).status).toBe(401);
    expect((await request(app).get('/discursivas/respostas')).status).toBe(401);
  });

  it('recusa token assinado com outro segredo', async () => {
    const forjado = jwt.sign({ id: DONO }, 'outro-segredo');
    const res = await request(app)
      .get('/discursivas/respostas')
      .set('Authorization', `Bearer ${forjado}`);
    expect(res.status).toBe(401);
  });
});

describe('POST /discursivas/respostas', () => {
  it('grava e devolve a linha, com ids numéricos', async () => {
    const res = await enviar(valido({ fundamentos: { citados: 1, esperados: 2 } }));

    expect(res.status).toBe(201);
    expect(typeof res.body.id).toBe('number');
    expect(res.body.questao_id).toBe(12);
    expect(res.body.respostas).toEqual(valido().respostas);
    expect(res.body.fundamentos).toEqual({ citados: 1, esperados: 2 });
    expect(res.body.criada_em).toBeDefined();
    expect(res.body.user_id).toBeUndefined();
  });

  it('fundamentos é opcional', async () => {
    const res = await enviar(valido());
    expect(res.status).toBe(201);
    expect(res.body.fundamentos).toBeNull();
  });

  it('ignora user_id vindo do corpo e usa o do token', async () => {
    const res = await enviar({ ...valido(), user_id: OUTRO });
    expect(res.status).toBe(201);

    const { rows } = await pool.query(
      'SELECT user_id FROM respostas_discursivas WHERE id = $1', [res.body.id]
    );
    expect(rows[0].user_id).toBe(DONO);
  });

  it('aceita questao_id como texto de dígitos', async () => {
    const res = await enviar(valido({ questao_id: '12' }));
    expect(res.status).toBe(201);
    expect(res.body.questao_id).toBe(12);
  });

  it('aceita item em branco se outro foi respondido', async () => {
    const res = await enviar(valido({ respostas: { A: 'Resposta', B: '' } }));
    expect(res.status).toBe(201);
  });

  it.each([
    ['sem questao_id', { questao_id: undefined }],
    ['questao_id zero', { questao_id: 0 }],
    ['questao_id negativo', { questao_id: -3 }],
    ['questao_id fracionário', { questao_id: 1.5 }],
    ['questao_id texto', { questao_id: 'abc' }],
    ['questao_id além do int', { questao_id: 99999999999 }],
  ])('recusa %s', async (_, extra) => {
    const res = await enviar(valido(extra));
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/questao_id/);
  });

  it.each([
    ['respostas ausente', { respostas: undefined }],
    ['respostas lista', { respostas: ['a', 'b'] }],
    ['respostas texto', { respostas: 'texto' }],
    ['respostas vazio', { respostas: {} }],
    ['letra fora de A–E', { respostas: { F: 'x' } }],
    ['letra minúscula', { respostas: { a: 'x' } }],
    ['chave de duas letras', { respostas: { AB: 'x' } }],
    ['valor não texto', { respostas: { A: 42 } }],
    ['valor nulo', { respostas: { A: null } }],
    ['tudo em branco', { respostas: { A: '   ', B: '' } }],
    ['texto longo demais', { respostas: { A: 'x'.repeat(6001) } }],
  ])('recusa %s', async (_, extra) => {
    const res = await enviar(valido(extra));
    expect(res.status).toBe(400);
  });

  it('aceita exatamente 6000 caracteres', async () => {
    const res = await enviar(valido({ respostas: { A: 'x'.repeat(6000) } }));
    expect(res.status).toBe(201);
  });

  it.each([
    ['lista', []],
    ['negativo', { citados: -1, esperados: 2 }],
    ['fracionário', { citados: 1.5, esperados: 2 }],
    ['texto', { citados: '1', esperados: 2 }],
    ['sem esperados', { citados: 1 }],
    ['campo a mais', { citados: 1, esperados: 2, nota: 10 }],
  ])('recusa fundamentos %s', async (_, fundamentos) => {
    const res = await enviar(valido({ fundamentos }));
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/fundamentos/);
  });
});

describe('GET /discursivas/respostas', () => {
  it('só devolve as respostas do próprio usuário', async () => {
    await enviar(valido(), DONO);
    await enviar(valido(), OUTRO);

    const res = await listar();
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);

    const { rows } = await pool.query(
      'SELECT user_id FROM respostas_discursivas WHERE id = $1', [res.body[0].id]
    );
    expect(rows[0].user_id).toBe(DONO);
  });

  it('mais recente primeiro', async () => {
    const primeira = (await enviar(valido({ respostas: { A: 'primeira' } }))).body.id;
    const segunda = (await enviar(valido({ respostas: { A: 'segunda' } }))).body.id;
    // Mesmo carimbo de tempo: o desempate por id é o que decide.
    await pool.query(
      'UPDATE respostas_discursivas SET criada_em = NOW() WHERE id = ANY($1)',
      [[primeira, segunda]]
    );
    const terceira = (await enviar(valido({ respostas: { A: 'terceira' } }))).body.id;

    const res = await listar();
    expect(res.body.map((r) => r.id)).toEqual([terceira, segunda, primeira]);
  });

  it('filtra por questao_id', async () => {
    await enviar(valido({ questao_id: 12 }));
    await enviar(valido({ questao_id: 13 }));

    const res = await listar('?questao_id=13');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].questao_id).toBe(13);
  });

  it('recusa questao_id malformado', async () => {
    for (const q of ['abc', '0', '-1', '1.5', '99999999999']) {
      const res = await listar(`?questao_id=${q}`);
      expect(res.status).toBe(400);
    }
  });

  it('respeita o teto de 200', async () => {
    await pool.query(
      `INSERT INTO respostas_discursivas (user_id, questao_id, respostas)
       SELECT $1, 12, '{"A":"x"}'::jsonb FROM generate_series(1, 205)`,
      [DONO]
    );
    const res = await listar();
    expect(res.body).toHaveLength(200);
  });

  it('lista vazia é array vazio, não 404', async () => {
    const res = await listar();
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});
