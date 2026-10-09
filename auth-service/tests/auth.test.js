const request = require('supertest');
const jwt = require('jsonwebtoken');
const { app, pool, redis, definirVerificadorGoogle } = require('../app');
const { migrate } = require('../migrate');

// Estes testes falam com um Postgres de verdade — é o ponto de serem de
// integração. Hash de senha, constraint de unicidade e assinatura do JWT
// são exatamente onde mock esconderia o erro.

const email = () => `teste-${Date.now()}-${Math.random().toString(36).slice(2)}@exemplo.local`;

beforeAll(async () => {
  await migrate(pool); // o teste também exercita as migrations
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

describe('e-mail sem distinção de maiúsculas', () => {
  it('cadastro com maiúsculas entra pelo login em minúsculas', async () => {
    const e = email();
    await request(app).post('/register').send({ email: e.toUpperCase(), password: 'senha-forte-123' });
    const res = await request(app).post('/login').send({ email: e, password: 'senha-forte-123' });
    expect(res.status).toBe(200);
  });

  it('não deixa cadastrar o mesmo e-mail em outra caixa de letras', async () => {
    const e = email();
    await request(app).post('/register').send({ email: e, password: 'senha-forte-123' });
    const res = await request(app).post('/register').send({ email: e.toUpperCase(), password: 'outra-senha-123' });
    expect(res.status).toBe(409);
  });
});

describe('POST /google', () => {
  // O Google de mentira: devolve o payload que um ID token verdadeiro teria.
  // A conferência de assinatura e de `aud` é da biblioteca do Google; aqui se
  // testa o que o serviço faz com o resultado dela.
  const sub = () => `google-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let payload;
  let audienciaPedida;

  beforeAll(() => {
    process.env.GOOGLE_CLIENT_ID = 'client-id-de-teste.apps.googleusercontent.com';
    definirVerificadorGoogle(async (credential, clientId) => {
      audienciaPedida = clientId;
      if (credential === 'token-invalido') throw new Error('assinatura inválida');
      return payload;
    });
  });

  afterAll(() => {
    delete process.env.GOOGLE_CLIENT_ID;
  });

  it('cria a conta na primeira vez, sem senha, e devolve token', async () => {
    const e = email();
    payload = { sub: sub(), email: e, email_verified: true, name: 'Pessoa do Google' };
    const res = await request(app).post('/google').send({ credential: 'ok' });

    expect(res.status).toBe(201);
    expect(res.body.novo).toBe(true);
    expect(jwt.verify(res.body.token, process.env.JWT_SECRET || 'seu_jwt_secret').email).toBe(e);
    // A audiência conferida é a do nosso app — é o que barra token de outro site.
    expect(audienciaPedida).toBe('client-id-de-teste.apps.googleusercontent.com');

    const { rows } = await pool.query('SELECT password_hash, google_sub FROM users WHERE email = $1', [e]);
    expect(rows[0].password_hash).toBeNull();
    expect(rows[0].google_sub).toBe(payload.sub);
  });

  it('na segunda vez entra na mesma conta, sem criar outra', async () => {
    const e = email();
    payload = { sub: sub(), email: e, email_verified: true };
    const primeira = await request(app).post('/google').send({ credential: 'ok' });
    const segunda = await request(app).post('/google').send({ credential: 'ok' });

    expect(segunda.status).toBe(200);
    expect(segunda.body.novo).toBe(false);
    expect(segunda.body.user.id).toBe(primeira.body.user.id);
    const { rows } = await pool.query('SELECT count(*)::int AS n FROM users WHERE email = $1', [e]);
    expect(rows[0].n).toBe(1);
  });

  it('conta com senha e e-mail confirmado: o Google liga, entra, e a senha continua valendo', async () => {
    const e = email();
    await request(app).post('/register').send({ email: e, password: 'senha-forte-123' });
    await pool.query('UPDATE users SET email_verified_at = NOW() WHERE lower(email) = $1', [e]);
    payload = { sub: sub(), email: e.toUpperCase(), email_verified: true };
    const res = await request(app).post('/google').send({ credential: 'ok' });

    expect(res.status).toBe(200);
    expect(res.body.novo).toBe(false);
    expect(jwt.verify(res.body.token, process.env.JWT_SECRET || 'seu_jwt_secret').email).toBe(e);
    const { rows } = await pool.query('SELECT google_sub, password_hash FROM users WHERE lower(email) = $1', [e]);
    expect(rows).toHaveLength(1);
    expect(rows[0].google_sub).toBe(payload.sub);
    expect(rows[0].password_hash).not.toBeNull();
    expect((await request(app).post('/login').send({ email: e, password: 'senha-forte-123' })).status).toBe(200);
    // E da próxima vez o Google entra direto pela ligação.
    const denovo = await request(app).post('/google').send({ credential: 'ok' });
    expect(denovo.status).toBe(200);
    expect(denovo.body.user.id).toBe(res.body.user.id);
  });

  it('conta com senha NÃO confirmada: o Google assume a conta e a senha de quem a criou deixa de valer', async () => {
    process.env.GOOGLE_ASSUME_NAO_CONFIRMADA_DESDE = '2000-01-01T00:00:00Z';
    // Pré-sequestro: alguém cadastrou o e-mail de outra pessoa com uma senha
    // e nunca confirmou. O dono real entra pelo Google.
    const e = email();
    await request(app).post('/register').send({ email: e, password: 'senha-do-atacante' });
    await pool.query('UPDATE users SET email_verified_at = NULL WHERE lower(email) = $1', [e]);
    payload = { sub: sub(), email: e, email_verified: true };
    const res = await request(app).post('/google').send({ credential: 'ok' });

    expect(res.status).toBe(200);
    const { rows } = await pool.query(
      'SELECT google_sub, password_hash, email_verified_at, status FROM users WHERE lower(email) = $1', [e]
    );
    expect(rows[0].google_sub).toBe(payload.sub);
    expect(rows[0].password_hash).toBeNull();
    expect(rows[0].email_verified_at).not.toBeNull();
    expect(rows[0].status).toBe('active');
    expect((await request(app).post('/login').send({ email: e, password: 'senha-do-atacante' })).status).toBe(401);
    // Links pendentes de quem criou a conta também deixam de valer.
    const id = (await pool.query('SELECT id FROM users WHERE lower(email) = $1', [e])).rows[0].id;
    const pend = await pool.query(
      `SELECT (SELECT count(*) FROM email_verification_tokens WHERE user_id = $1)::int AS conf,
              (SELECT count(*) FROM password_reset_tokens WHERE user_id = $1 AND used_at IS NULL)::int AS reset`, [id]
    );
    expect(pend.rows[0]).toEqual({ conf: 0, reset: 0 });
    delete process.env.GOOGLE_ASSUME_NAO_CONFIRMADA_DESDE;
  });

  it('conta NÃO confirmada antes da data de corte continua 409 (token antigo ainda pode valer)', async () => {
    process.env.GOOGLE_ASSUME_NAO_CONFIRMADA_DESDE = '2999-01-01T00:00:00Z';
    const e = email();
    await request(app).post('/register').send({ email: e, password: 'senha-forte-123' });
    await pool.query('UPDATE users SET email_verified_at = NULL WHERE lower(email) = $1', [e]);
    payload = { sub: sub(), email: e, email_verified: true };
    const res = await request(app).post('/google').send({ credential: 'ok' });
    delete process.env.GOOGLE_ASSUME_NAO_CONFIRMADA_DESDE;

    expect(res.status).toBe(409);
    const { rows } = await pool.query('SELECT google_sub, password_hash FROM users WHERE lower(email) = $1', [e]);
    expect(rows[0].google_sub).toBeNull();
    expect(rows[0].password_hash).not.toBeNull();
  });

  it('e-mail já ligado a outro Google continua 409', async () => {
    const e = email();
    await request(app).post('/register').send({ email: e, password: 'senha-forte-123' });
    await pool.query('UPDATE users SET email_verified_at = NOW(), google_sub = $2 WHERE lower(email) = $1', [e, sub()]);
    payload = { sub: sub(), email: e, email_verified: true };
    const res = await request(app).post('/google').send({ credential: 'ok' });
    expect(res.status).toBe(409);
  });

  it('"Esqueci minha senha" atende conta só com Google e não atende conta bloqueada', async () => {
    const e = email();
    payload = { sub: sub(), email: e, email_verified: true };
    await request(app).post('/google').send({ credential: 'ok' });
    await request(app).post('/forgot-password').send({ email: e });
    const conta = (await pool.query('SELECT id FROM users WHERE lower(email) = $1', [e])).rows[0].id;
    const n = async () => (await pool.query(
      'SELECT count(*)::int AS n FROM password_reset_tokens WHERE user_id = $1 AND used_at IS NULL', [conta]
    )).rows[0].n;
    expect(await n()).toBe(1);

    await pool.query('DELETE FROM password_reset_tokens WHERE user_id = $1', [conta]);
    await pool.query(`UPDATE users SET status = 'blocked' WHERE id = $1`, [conta]);
    await request(app).post('/forgot-password').send({ email: e });
    expect(await n()).toBe(0);
  });

  it('conta bloqueada não é ligada nem entra pelo Google', async () => {
    const e = email();
    await request(app).post('/register').send({ email: e, password: 'senha-forte-123' });
    await pool.query(`UPDATE users SET status = 'blocked' WHERE lower(email) = $1`, [e]);
    payload = { sub: sub(), email: e, email_verified: true };
    const res = await request(app).post('/google').send({ credential: 'ok' });
    expect(res.status).toBe(403);
    const { rows } = await pool.query('SELECT google_sub FROM users WHERE lower(email) = $1', [e]);
    expect(rows[0].google_sub).toBeNull();
  });

  it('cadastro por senha depois do Google, com o mesmo e-mail, é recusado', async () => {
    const e = email();
    payload = { sub: sub(), email: e, email_verified: true };
    await request(app).post('/google').send({ credential: 'ok' });
    const res = await request(app).post('/register').send({ email: e.toUpperCase(), password: 'senha-do-atacante' });
    expect(res.status).toBe(409);
  });

  it('e-mail ligado a outra conta do Google, com outra caixa de letras, não vira segunda conta', async () => {
    // Linha antiga gravada com maiúsculas, já ligada a um Google A. O mesmo
    // e-mail em minúsculas chega por um Google B: o UNIQUE de `email` não
    // pegaria (caixas diferentes) — é a busca por lower(email) que recusa.
    const e = email();
    await pool.query('INSERT INTO users (email, password_hash, google_sub) VALUES ($1, NULL, $2)', [e.toUpperCase(), sub()]);
    payload = { sub: sub(), email: e, email_verified: true };
    const res = await request(app).post('/google').send({ credential: 'ok' });

    expect(res.status).toBe(409);
    const { rows } = await pool.query('SELECT count(*)::int AS n FROM users WHERE lower(email) = $1', [e]);
    expect(rows[0].n).toBe(1);
  });

  it('recusa e-mail não verificado pelo Google — senão entraria na conta de outra pessoa', async () => {
    const e = email();
    await request(app).post('/register').send({ email: e, password: 'senha-forte-123' });
    payload = { sub: sub(), email: e, email_verified: false };
    const res = await request(app).post('/google').send({ credential: 'ok' });

    expect(res.status).toBe(401);
    const { rows } = await pool.query('SELECT google_sub FROM users WHERE email = $1', [e]);
    expect(rows[0].google_sub).toBeNull();
  });

  it('não troca a conta do Google já ligada a um e-mail por outra', async () => {
    const e = email();
    payload = { sub: sub(), email: e, email_verified: true };
    await request(app).post('/google').send({ credential: 'ok' });
    payload = { sub: sub(), email: e, email_verified: true };
    const res = await request(app).post('/google').send({ credential: 'ok' });

    expect(res.status).toBe(409);
  });

  it('recusa token que o Google não confirma', async () => {
    const res = await request(app).post('/google').send({ credential: 'token-invalido' });
    expect(res.status).toBe(401);
  });

  it('exige o credential', async () => {
    expect((await request(app).post('/google').send({})).status).toBe(400);
  });

  it('conta sem senha não entra pelo login de senha, e responde 401 em vez de 500', async () => {
    const e = email();
    payload = { sub: sub(), email: e, email_verified: true };
    await request(app).post('/google').send({ credential: 'ok' });
    const res = await request(app).post('/login').send({ email: e, password: 'qualquer-coisa' });

    expect(res.status).toBe(401);
  });

  it('sem GOOGLE_CLIENT_ID responde 503, e não aceita token nenhum', async () => {
    const antes = process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_ID;
    const res = await request(app).post('/google').send({ credential: 'ok' });
    process.env.GOOGLE_CLIENT_ID = antes;

    expect(res.status).toBe(503);
  });
});
