const request = require('supertest');

// A verificação do token agora é local, então o teste assina JWT de
// verdade em vez de simular a resposta do auth-service — passou a
// exercitar o mesmo caminho que roda em produção.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'segredo-de-teste';
process.env.ADMIN_USER_IDS = '9001';

const jwt = require('jsonwebtoken');
const { app, pool } = require('../app');
const { migrate } = require('../migrate');

const DONO = 1001;
const OUTRO = 1002;
const ADMIN = 9001;

const como = (id) =>
  `Bearer ${jwt.sign({ id, email: `u${id}@exemplo.local` }, process.env.JWT_SECRET)}`;

beforeAll(async () => {
  await migrate(pool); // o teste também exercita as migrations
  for (const [uid, nome] of [[DONO, 'Dono'], [OUTRO, 'Outro'], [ADMIN, 'Admin']]) {
    await pool.query(
      `INSERT INTO users (user_id, name, email) VALUES ($1, $2, $3)
       ON CONFLICT (user_id) DO UPDATE SET name = EXCLUDED.name`,
      [uid, nome, `u${uid}@exemplo.local`]
    );
  }
});

afterAll(async () => {
  await pool.query('DELETE FROM users WHERE user_id = ANY($1)', [[DONO, OUTRO, ADMIN]]);
  await pool.end();
});

describe('GET /users/:id — leitura por dono', () => {
  it('deixa o dono ler o próprio perfil', async () => {
    const res = await request(app).get(`/users/${DONO}`).set('Authorization', como(DONO));
    expect(res.status).toBe(200);
    expect(res.body.user_id).toBe(DONO);
  });

  it('impede ler o perfil de outro usuário', async () => {
    const res = await request(app).get(`/users/${OUTRO}`).set('Authorization', como(DONO));
    expect(res.status).toBe(404);
    expect(JSON.stringify(res.body)).not.toContain('u1002@exemplo.local');
  });

  it('exige autenticação', async () => {
    expect((await request(app).get(`/users/${DONO}`)).status).toBe(401);
  });
});

describe('PUT /users/:id — escrita por dono', () => {
  it('deixa o dono atualizar o próprio perfil', async () => {
    const res = await request(app)
      .put(`/users/${DONO}`)
      .set('Authorization', como(DONO))
      .send({ name: 'Nome Novo' });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Nome Novo');
  });

  it('não altera o perfil de outro usuário', async () => {
    const res = await request(app)
      .put(`/users/${OUTRO}`)
      .set('Authorization', como(DONO))
      .send({ email: 'sequestrado@invasor.local' });

    expect(res.status).toBe(404);

    // O status sozinho não prova nada: o que importa é que o banco não mudou.
    const { rows } = await pool.query('SELECT email FROM users WHERE user_id = $1', [OUTRO]);
    expect(rows[0].email).toBe(`u${OUTRO}@exemplo.local`);
  });
});

describe('GET /users — listagem restrita', () => {
  it('recusa usuário comum com 403', async () => {
    const res = await request(app).get('/users').set('Authorization', como(DONO));
    expect(res.status).toBe(403);
  });

  it('não vaza a base inteira para quem não é admin', async () => {
    const res = await request(app).get('/users').set('Authorization', como(OUTRO));
    expect(Array.isArray(res.body)).toBe(false);
  });

  it('permite quem está em ADMIN_USER_IDS', async () => {
    const res = await request(app).get('/users').set('Authorization', como(ADMIN));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe('verificação local do token', () => {
  it('recusa token assinado com outro segredo', async () => {
    const falso = jwt.sign({ id: DONO, email: 'x@exemplo.local' }, 'segredo-errado');
    const res = await request(app).get(`/users/${DONO}`).set('Authorization', `Bearer ${falso}`);
    expect(res.status).toBe(401);
  });

  it('recusa token expirado', async () => {
    const expirado = jwt.sign({ id: DONO }, process.env.JWT_SECRET, { expiresIn: '-1s' });
    const res = await request(app).get(`/users/${DONO}`).set('Authorization', `Bearer ${expirado}`);
    expect(res.status).toBe(401);
  });

  it('aceita o token sem o prefixo Bearer', async () => {
    const cru = jwt.sign({ id: DONO, email: 'x@exemplo.local' }, process.env.JWT_SECRET);
    const res = await request(app).get(`/users/${DONO}`).set('Authorization', cru);
    expect(res.status).toBe(200);
  });
});
