const request = require('supertest');

// A verificação do token é local, então o teste assina JWT de verdade em
// vez de simular o auth-service — exercita o mesmo caminho da produção.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'segredo-de-teste';

const jwt = require('jsonwebtoken');
const { app, pool } = require('../app');
const { migrate } = require('../migrate');

const DONO = 2001;
const OUTRO = 2002;

const como = (id) =>
  `Bearer ${jwt.sign({ id, email: `u${id}@exemplo.local` }, process.env.JWT_SECRET)}`;

const limpar = () =>
  pool.query('DELETE FROM tentativas WHERE user_id = ANY($1)', [[DONO, OUTRO]]);

beforeAll(async () => {
  await migrate(pool); // o teste também exercita as migrations
  await limpar();
});

afterAll(async () => {
  await limpar();
  await pool.end();
});

describe('POST /tentativas — registro', () => {
  it('registra uma tentativa do usuário autenticado', async () => {
    const res = await request(app)
      .post('/tentativas')
      .set('Authorization', como(DONO))
      .send({ questao_id: 'q-1', correta: true, alternativa: 1, tempo_seg: 42 });

    expect(res.status).toBe(201);
    expect(res.body.questao_id).toBe('q-1');
    expect(res.body.correta).toBe(true);

    // O que importa não é o 201, é o que ficou gravado — e para quem.
    const { rows } = await pool.query(
      'SELECT user_id, questao_id FROM tentativas WHERE id = $1',
      [res.body.id]
    );
    expect(rows[0].user_id).toBe(DONO);
  });

  it('aceita id de questão gerado por IA, não só numérico', async () => {
    const id = 'q-1786108995123-a3f9xk2p1';
    const res = await request(app)
      .post('/tentativas')
      .set('Authorization', como(DONO))
      .send({ questao_id: id, correta: false });

    expect(res.status).toBe(201);
    expect(res.body.questao_id).toBe(id);
  });

  it('ignora user_id vindo do corpo e usa o do token', async () => {
    const res = await request(app)
      .post('/tentativas')
      .set('Authorization', como(DONO))
      .send({ questao_id: 'q-forjada', correta: true, user_id: OUTRO });

    expect(res.status).toBe(201);

    const { rows } = await pool.query(
      'SELECT user_id FROM tentativas WHERE questao_id = $1',
      ['q-forjada']
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].user_id).toBe(DONO); // não OUTRO
  });

  it('exige autenticação', async () => {
    const res = await request(app)
      .post('/tentativas')
      .send({ questao_id: 'q-1', correta: true });

    expect(res.status).toBe(401);
  });

  it('recusa corpo sem questao_id', async () => {
    const res = await request(app)
      .post('/tentativas')
      .set('Authorization', como(DONO))
      .send({ correta: true });

    expect(res.status).toBe(400);
  });

  it('recusa `correta` ausente em vez de tratar como erro do usuário', async () => {
    const res = await request(app)
      .post('/tentativas')
      .set('Authorization', como(DONO))
      .send({ questao_id: 'q-sem-correta' });

    expect(res.status).toBe(400);

    // Um corpo malformado não pode virar "errou" e contaminar a taxa.
    const { rows } = await pool.query(
      'SELECT 1 FROM tentativas WHERE questao_id = $1',
      ['q-sem-correta']
    );
    expect(rows).toHaveLength(0);
  });
});

describe('GET /tentativas — leitura por dono', () => {
  beforeAll(async () => {
    await limpar();
    await pool.query(
      `INSERT INTO tentativas (user_id, questao_id, correta, respondida_em) VALUES
         ($1, 'q-antiga', true,  NOW() - INTERVAL '10 days'),
         ($1, 'q-recente', false, NOW() - INTERVAL '1 day'),
         ($2, 'q-do-outro', true, NOW())`,
      [DONO, OUTRO]
    );
  });

  it('devolve só as tentativas do próprio usuário', async () => {
    const res = await request(app).get('/tentativas').set('Authorization', como(DONO));

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(JSON.stringify(res.body)).not.toContain('q-do-outro');
  });

  it('não vaza tentativa alheia nem com limite alto', async () => {
    const res = await request(app)
      .get('/tentativas?limite=1000')
      .set('Authorization', como(OUTRO));

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].questao_id).toBe('q-do-outro');
  });

  it('ordena da mais recente para a mais antiga', async () => {
    const res = await request(app).get('/tentativas').set('Authorization', como(DONO));
    expect(res.body[0].questao_id).toBe('q-recente');
  });

  it('filtra por ?desde=', async () => {
    const desde = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
    const res = await request(app)
      .get(`/tentativas?desde=${encodeURIComponent(desde)}`)
      .set('Authorization', como(DONO));

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].questao_id).toBe('q-recente');
  });

  it('recusa ?desde= inválido em vez de ignorar o filtro', async () => {
    const res = await request(app)
      .get('/tentativas?desde=ontem')
      .set('Authorization', como(DONO));

    // Ignorar o filtro devolveria mais dados do que o cliente pediu,
    // silenciosamente. Melhor recusar.
    expect(res.status).toBe(400);
  });

  it('exige autenticação', async () => {
    expect((await request(app).get('/tentativas')).status).toBe(401);
  });

  it('rejeita token assinado com outro segredo', async () => {
    const forjado = `Bearer ${jwt.sign({ id: DONO }, 'segredo-errado')}`;
    const res = await request(app).get('/tentativas').set('Authorization', forjado);
    expect(res.status).toBe(401);
  });
});
