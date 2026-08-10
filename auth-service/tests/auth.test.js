const request = require('supertest');
const jwt = require('jsonwebtoken');
const { app, pool, redis } = require('../app');

// Estes testes falam com um Postgres de verdade — é o ponto de serem de
// integração. Hash de senha, constraint de unicidade e assinatura do JWT
// são exatamente onde mock esconderia o erro.

const email = () => `teste-${Date.now()}-${Math.random().toString(36).slice(2)}@exemplo.local`;

beforeAll(async () => {
  await pool.query('SELECT 1');
});

afterAll(async () => {
  await pool.end();
  if (redis.isOpen) await redis.quit();
});

describe('POST /register', () => {
  it('registra um usuário e devolve token', async () => {
    const res = await request(app)
      .post('/register')
      .send({ email: email(), password: 'senha-forte-123', name: 'Fulano' });

    expect(res.status).toBe(201);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.id).toBeDefined();
    expect(res.body.user.password_hash).toBeUndefined();
  });

  it('nunca devolve a senha nem o hash na resposta', async () => {
    const res = await request(app)
      .post('/register')
      .send({ email: email(), password: 'senha-forte-123' });

    expect(JSON.stringify(res.body)).not.toContain('senha-forte-123');
    expect(JSON.stringify(res.body)).not.toContain('$2');
  });

  it('guarda a senha como hash, nunca em texto', async () => {
    const e = email();
    await request(app).post('/register').send({ email: e, password: 'senha-forte-123' });

    const { rows } = await pool.query('SELECT password_hash FROM users WHERE email = $1', [e]);
    expect(rows[0].password_hash).not.toBe('senha-forte-123');
    expect(rows[0].password_hash).toMatch(/^\$2[aby]\$/); // formato bcrypt
  });

  it('rejeita email duplicado com 409', async () => {
    const e = email();
    await request(app).post('/register').send({ email: e, password: 'senha-forte-123' });
    const res = await request(app).post('/register').send({ email: e, password: 'outra-senha' });

    expect(res.status).toBe(409);
  });

  it('exige email e senha', async () => {
    expect((await request(app).post('/register').send({ email: email() })).status).toBe(400);
    expect((await request(app).post('/register').send({ password: 'x' })).status).toBe(400);
  });
});

describe('POST /login', () => {
  it('autentica com credenciais corretas', async () => {
    const e = email();
    await request(app).post('/register').send({ email: e, password: 'senha-forte-123' });

    const res = await request(app).post('/login').send({ email: e, password: 'senha-forte-123' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
  });

  it('recusa senha errada', async () => {
    const e = email();
    await request(app).post('/register').send({ email: e, password: 'senha-forte-123' });

    const res = await request(app).post('/login').send({ email: e, password: 'senha-errada' });
    expect(res.status).toBe(401);
  });

  it('responde igual para usuário inexistente e senha errada', async () => {
    // Mensagens diferentes revelariam quais emails existem na base.
    const e = email();
    await request(app).post('/register').send({ email: e, password: 'senha-forte-123' });

    const senhaErrada = await request(app).post('/login').send({ email: e, password: 'nope' });
    const inexistente = await request(app).post('/login').send({ email: email(), password: 'nope' });

    expect(senhaErrada.status).toBe(inexistente.status);
    expect(senhaErrada.body.error).toBe(inexistente.body.error);
  });
});

describe('POST /verify', () => {
  it('aceita token emitido pelo próprio serviço', async () => {
    const reg = await request(app)
      .post('/register')
      .send({ email: email(), password: 'senha-forte-123' });

    const res = await request(app)
      .post('/verify')
      .set('Authorization', `Bearer ${reg.body.token}`);

    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(true);
    expect(res.body.user.id).toBe(reg.body.user.id);
  });

  it('recusa token assinado com outro segredo', async () => {
    const falso = jwt.sign({ id: 1, email: 'invasor@exemplo.local' }, 'segredo-errado');

    const res = await request(app).post('/verify').set('Authorization', `Bearer ${falso}`);
    expect(res.status).toBe(401);
  });

  it('recusa token expirado', async () => {
    const expirado = jwt.sign(
      { id: 1, email: 'x@exemplo.local' },
      process.env.JWT_SECRET,
      { expiresIn: '-1s' }
    );

    const res = await request(app).post('/verify').set('Authorization', `Bearer ${expirado}`);
    expect(res.status).toBe(401);
  });

  it('recusa requisição sem token', async () => {
    expect((await request(app).post('/verify')).status).toBe(401);
  });
});
