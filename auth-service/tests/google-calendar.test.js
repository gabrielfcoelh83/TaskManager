// Integração do Google Agenda. O banco é de verdade (como em auth.test.js);
// só o Google é simulado, trocando o fetch global.
process.env.GOOGLE_CLIENT_ID = 'cliente-teste.apps.googleusercontent.com';
process.env.GOOGLE_CLIENT_SECRET = 'segredo-teste';
process.env.GOOGLE_TOKEN_ENCRYPTION_KEY = 'a'.repeat(64);
process.env.FRONTEND_BASE_URL = 'https://front.exemplo';

const request = require('supertest');
const { app, pool, redis } = require('../app');
const { migrate } = require('../migrate');
const calendar = require('../google-calendar');

const fetchOriginal = global.fetch;
let respostas; // (url, init) => { status, body } | undefined
let chamadas;

function resposta(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => {
      if (body === undefined) throw new Error('sem corpo');
      return body;
    },
  };
}

beforeAll(async () => {
  await migrate(pool);
});

beforeEach(() => {
  chamadas = [];
  respostas = () => undefined;
  global.fetch = jest.fn(async (url, init = {}) => {
    const method = init.method || 'GET';
    chamadas.push({ url: String(url), method, body: init.body });
    const custom = respostas(String(url), { ...init, method });
    if (custom) return resposta(custom.status, custom.body);
    if (String(url) === 'https://oauth2.googleapis.com/token') {
      return resposta(200, { access_token: 'access-1', refresh_token: 'refresh-novo' });
    }
    if (String(url) === 'https://oauth2.googleapis.com/revoke') return resposta(200, {});
    if (method === 'DELETE') return resposta(204);
    return resposta(200, { id: 'ok' });
  });
});

afterAll(async () => {
  global.fetch = fetchOriginal;
  await pool.end();
  if (redis.isOpen) await redis.quit();
});

const email = () => `agenda-${Date.now()}-${Math.random().toString(36).slice(2)}@exemplo.local`;

async function novoUsuario() {
  const res = await request(app).post('/register').send({ email: email(), password: 'senha-forte-123' });
  expect(res.status).toBe(201);
  return { id: res.body.user.id, token: res.body.token };
}

async function conectar(user, refresh = 'refresh-salvo') {
  await pool.query(
    `INSERT INTO google_calendar_connections (user_id, refresh_token) VALUES ($1, $2)
     ON CONFLICT (user_id) DO UPDATE SET refresh_token = EXCLUDED.refresh_token`,
    [user.id, calendar.encrypt(refresh)]
  );
}

const auth = (user) => ({ Authorization: `Bearer ${user.token}` });
const tokenCalls = () => chamadas.filter((c) => c.url === 'https://oauth2.googleapis.com/token');
const eventCalls = () => chamadas.filter((c) => c.url.startsWith('https://www.googleapis.com/calendar/v3'));

function evento(dia, extra = {}) {
  return {
    dia,
    summary: `Estudo ${dia}`,
    description: 'Direito Civil',
    start: `${dia}T19:00:00`,
    end: `${dia}T21:00:00`,
    timeZone: 'America/Sao_Paulo',
    ...extra,
  };
}

describe('ids de evento', () => {
  it('são gerados no servidor só com base32hex (a–v, 0–9)', () => {
    const id = calendar.eventId('2026-10-09');
    expect(id).toBe('mlkoab20261009');
    expect(id).toMatch(/^[a-v0-9]{5,1024}$/);
  });
});

describe('callback do OAuth', () => {
  it('com ?error=access_denied redireciona para o front com calendar=error', async () => {
    const res = await request(app).get('/calendar/google/callback').query({ error: 'access_denied', state: 'x' });
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('https://front.exemplo/?calendar=error');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('sem code redireciona com calendar=error', async () => {
    const res = await request(app).get('/calendar/google/callback').query({ state: 'x' });
    expect(res.headers.location).toBe('https://front.exemplo/?calendar=error');
  });

  it('com state inválido redireciona com calendar=error e não grava nada', async () => {
    const res = await request(app).get('/calendar/google/callback').query({ code: 'c', state: 'forjado' });
    expect(res.headers.location).toBe('https://front.exemplo/?calendar=error');
  });

  it('não conecta direto: cria pendência e manda o código ao front', async () => {
    const user = await novoUsuario();
    const res = await request(app)
      .get('/calendar/google/callback')
      .query({ code: 'codigo-google', state: calendar.createState(user.id) });

    expect(res.status).toBe(302);
    const url = new URL(res.headers.location);
    expect(url.origin).toBe('https://front.exemplo');
    expect(url.searchParams.get('calendar')).toBe('confirmar');
    const codigo = url.searchParams.get('codigo');
    expect(codigo).toMatch(/^[a-f0-9]{64}$/);

    const conn = await pool.query('SELECT 1 FROM google_calendar_connections WHERE user_id = $1', [user.id]);
    expect(conn.rows).toHaveLength(0);
    const pend = await pool.query(
      'SELECT codigo_hash, refresh_token FROM google_calendar_pending_connections WHERE user_id = $1',
      [user.id]
    );
    expect(pend.rows).toHaveLength(1);
    expect(pend.rows[0].codigo_hash).toBe(calendar.hashCodigo(codigo)); // só o hash fica no banco
    expect(pend.rows[0].refresh_token).not.toContain('refresh-novo'); // criptografado
  });
});

describe('POST /calendar/google/confirm', () => {
  async function pendencia(user) {
    const res = await request(app)
      .get('/calendar/google/callback')
      .query({ code: 'codigo-google', state: calendar.createState(user.id) });
    return new URL(res.headers.location).searchParams.get('codigo');
  }

  it('dono certo: conecta, apaga a pendência e o status passa a conectado', async () => {
    const user = await novoUsuario();
    const codigo = await pendencia(user);

    const res = await request(app).post('/calendar/google/confirm').set(auth(user)).send({ codigo });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ connected: true });

    const { rows } = await pool.query('SELECT refresh_token FROM google_calendar_connections WHERE user_id = $1', [user.id]);
    expect(calendar.decrypt(rows[0].refresh_token)).toBe('refresh-novo');
    const pend = await pool.query('SELECT 1 FROM google_calendar_pending_connections WHERE user_id = $1', [user.id]);
    expect(pend.rows).toHaveLength(0);

    const status = await request(app).get('/calendar/google/status').set(auth(user));
    expect(status.body.connected).toBe(true);
    expect(status.body.connectedAt).toBeTruthy();
  });

  it('dono errado: recusa, não conecta ninguém e o código deixa de valer', async () => {
    const atacante = await novoUsuario();
    const vitima = await novoUsuario();
    // O atacante gerou o state da própria conta; a vítima autorizou e caiu
    // no front logada como ela mesma.
    const codigo = await pendencia(atacante);

    const res = await request(app).post('/calendar/google/confirm').set(auth(vitima)).send({ codigo });
    expect(res.status).toBe(403);
    expect(JSON.stringify(res.body)).not.toMatch(/user|atacante|expir/i);

    for (const u of [atacante, vitima]) {
      const conn = await pool.query('SELECT 1 FROM google_calendar_connections WHERE user_id = $1', [u.id]);
      expect(conn.rows).toHaveLength(0);
    }
    const depois = await request(app).post('/calendar/google/confirm').set(auth(atacante)).send({ codigo });
    expect(depois.status).toBe(400);
  });

  it('código expirado é recusado', async () => {
    const user = await novoUsuario();
    const { codigo, hash } = calendar.novoCodigo();
    await pool.query(
      `INSERT INTO google_calendar_pending_connections (codigo_hash, user_id, refresh_token, expires_at)
       VALUES ($1, $2, $3, NOW() - INTERVAL '1 minute')`,
      [hash, user.id, calendar.encrypt('refresh-velho')]
    );
    const res = await request(app).post('/calendar/google/confirm').set(auth(user)).send({ codigo });
    expect(res.status).toBe(400);
    const conn = await pool.query('SELECT 1 FROM google_calendar_connections WHERE user_id = $1', [user.id]);
    expect(conn.rows).toHaveLength(0);
  });

  it('código não pode ser reutilizado', async () => {
    const user = await novoUsuario();
    const codigo = await pendencia(user);
    expect((await request(app).post('/calendar/google/confirm').set(auth(user)).send({ codigo })).status).toBe(200);
    expect((await request(app).post('/calendar/google/confirm').set(auth(user)).send({ codigo })).status).toBe(400);
  });

  it('exige login e código bem formado', async () => {
    const user = await novoUsuario();
    expect((await request(app).post('/calendar/google/confirm').send({ codigo: 'a'.repeat(64) })).status).toBe(401);
    expect((await request(app).post('/calendar/google/confirm').set(auth(user)).send({ codigo: 'x' })).status).toBe(400);
    expect((await request(app).post('/calendar/google/confirm').set(auth(user)).send({ codigo: 'a'.repeat(64) })).status).toBe(400);
  });

  it('limpa pendências expiradas', async () => {
    const user = await novoUsuario();
    const { hash } = calendar.novoCodigo();
    await pool.query(
      `INSERT INTO google_calendar_pending_connections (codigo_hash, user_id, refresh_token, expires_at)
       VALUES ($1, $2, 'x', NOW() - INTERVAL '1 hour')`,
      [hash, user.id]
    );
    await pendencia(user);
    const { rows } = await pool.query('SELECT 1 FROM google_calendar_pending_connections WHERE codigo_hash = $1', [hash]);
    expect(rows).toHaveLength(0);
  });
});

describe('POST /calendar/google/sync', () => {
  const intervalo = { de: '2026-10-05', ate: '2026-10-11' };

  it('insere, faz update no 409, apaga os dias sem evento e pede um token só', async () => {
    const user = await novoUsuario();
    await conectar(user);
    respostas = (url, init) => {
      if (init.method === 'POST' && url.endsWith('/events')) {
        const { id } = JSON.parse(init.body);
        if (id === 'mlkoab20261007') return { status: 409, body: { error: { message: 'The requested identifier already exists.' } } };
        return { status: 200, body: { id } };
      }
      if (init.method === 'DELETE' && url.endsWith('/mlkoab20261005')) return { status: 404, body: {} };
      if (init.method === 'DELETE' && url.endsWith('/mlkoab20261006')) return { status: 410, body: {} };
      return undefined;
    };

    const res = await request(app)
      .post('/calendar/google/sync')
      .set(auth(user))
      .send({ events: [evento('2026-10-07'), evento('2026-10-09', { description: '' })], intervalo });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ sincronizados: 2, removidos: 3 }); // 08, 10, 11 (05 e 06 já não existiam)

    expect(tokenCalls()).toHaveLength(1);
    expect(tokenCalls()[0].body.get('refresh_token')).toBe('refresh-salvo');

    const inserts = eventCalls().filter((c) => c.method === 'POST');
    expect(inserts.map((c) => JSON.parse(c.body).id).sort()).toEqual(['mlkoab20261007', 'mlkoab20261009']);
    for (const c of inserts) expect(JSON.parse(c.body).id).toMatch(/^[a-v0-9]{5,1024}$/);
    const nove = JSON.parse(inserts.find((c) => JSON.parse(c.body).id === 'mlkoab20261009').body);
    expect(nove.description).toBe('Plano de estudos mlkoab');
    expect(nove.start).toEqual({ dateTime: '2026-10-09T19:00:00', timeZone: 'America/Sao_Paulo' });

    const updates = eventCalls().filter((c) => c.method === 'PUT');
    expect(updates).toHaveLength(1);
    expect(updates[0].url).toBe('https://www.googleapis.com/calendar/v3/calendars/primary/events/mlkoab20261007');
    expect(JSON.parse(updates[0].body).status).toBe('confirmed');
    expect(JSON.parse(updates[0].body).summary).toBe('Estudo 2026-10-07');

    const deletes = eventCalls().filter((c) => c.method === 'DELETE').map((c) => c.url.split('/').pop()).sort();
    expect(deletes).toEqual(['mlkoab20261005', 'mlkoab20261006', 'mlkoab20261008', 'mlkoab20261010', 'mlkoab20261011']);
  });

  it('decide pelo status: outro erro do Google no insert vira 502 sem update', async () => {
    const user = await novoUsuario();
    await conectar(user);
    respostas = (url, init) => (init.method === 'POST' && url.endsWith('/events')
      ? { status: 400, body: { error: { message: 'already exists (mas é 400)' } } }
      : undefined);
    const res = await request(app).post('/calendar/google/sync').set(auth(user))
      .send({ events: [evento('2026-10-07')], intervalo });
    expect(res.status).toBe(502);
    expect(eventCalls().filter((c) => c.method === 'PUT')).toHaveLength(0);
  });

  it('erro no delete que não é 404/410 vira 502', async () => {
    const user = await novoUsuario();
    await conectar(user);
    respostas = (url, init) => (init.method === 'DELETE' ? { status: 500, body: {} } : undefined);
    const res = await request(app).post('/calendar/google/sync').set(auth(user))
      .send({ events: [], intervalo: { de: '2026-10-05', ate: '2026-10-05' } });
    expect(res.status).toBe(502);
  });

  it('sem conexão responde 409 e não chama o Google', async () => {
    const user = await novoUsuario();
    const res = await request(app).post('/calendar/google/sync').set(auth(user)).send({ events: [], intervalo });
    expect(res.status).toBe(409);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  describe('validação do corpo', () => {
    const casos = [
      ['sem intervalo', { events: [] }],
      ['intervalo invertido', { events: [], intervalo: { de: '2026-10-10', ate: '2026-10-01' } }],
      ['data inexistente', { events: [], intervalo: { de: '2026-02-30', ate: '2026-03-01' } }],
      ['intervalo de 32 dias', { events: [], intervalo: { de: '2026-10-01', ate: '2026-11-01' } }],
      ['events não é lista', { events: 'x', intervalo }],
      ['dia fora do intervalo', { events: [evento('2026-10-12')], intervalo }],
      ['dois eventos no mesmo dia', { events: [evento('2026-10-07'), evento('2026-10-07')], intervalo }],
      ['end antes de start', { events: [evento('2026-10-07', { end: '2026-10-07T18:00:00' })], intervalo }],
      ['end igual a start', { events: [evento('2026-10-07', { end: '2026-10-07T19:00:00' })], intervalo }],
      ['start com Z', { events: [evento('2026-10-07', { start: '2026-10-07T19:00:00Z' })], intervalo }],
      ['start em outro dia', { events: [evento('2026-10-07', { start: '2026-10-08T19:00:00', end: '2026-10-08T20:00:00' })], intervalo }],
      ['hora inválida', { events: [evento('2026-10-07', { end: '2026-10-07T25:00:00' })], intervalo }],
      ['summary vazio', { events: [evento('2026-10-07', { summary: '  ' })], intervalo }],
      ['summary longo', { events: [evento('2026-10-07', { summary: 'x'.repeat(201) })], intervalo }],
      ['description longa', { events: [evento('2026-10-07', { description: 'x'.repeat(2001) })], intervalo }],
      ['fuso inexistente', { events: [evento('2026-10-07', { timeZone: 'Marte/Olympus' })], intervalo }],
      ['fuso com lixo', { events: [evento('2026-10-07', { timeZone: '../../etc' })], intervalo }],
    ];

    it.each(casos)('%s → 400 sem chamar o Google', async (_nome, corpo) => {
      const user = await novoUsuario();
      await conectar(user);
      const res = await request(app).post('/calendar/google/sync').set(auth(user)).send(corpo);
      expect(res.status).toBe(400);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('aceita 31 dias com 31 eventos e limites exatos de tamanho', async () => {
      const user = await novoUsuario();
      await conectar(user);
      const events = [];
      for (let d = 1; d <= 31; d++) {
        const dia = `2026-10-${String(d).padStart(2, '0')}`;
        events.push(evento(dia, { summary: 's'.repeat(200), description: 'd'.repeat(2000) }));
      }
      const res = await request(app).post('/calendar/google/sync').set(auth(user))
        .send({ events, intervalo: { de: '2026-10-01', ate: '2026-10-31' } });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ sincronizados: 31, removidos: 0 });
      expect(tokenCalls()).toHaveLength(1);
    });
  });
});

describe('DELETE /calendar/google', () => {
  it('revoga o token no Google e apaga a conexão', async () => {
    const user = await novoUsuario();
    await conectar(user, 'refresh-para-revogar');
    const res = await request(app).delete('/calendar/google').set(auth(user));
    expect(res.status).toBe(204);
    const revoke = chamadas.filter((c) => c.url === 'https://oauth2.googleapis.com/revoke');
    expect(revoke).toHaveLength(1);
    expect(revoke[0].body.get('token')).toBe('refresh-para-revogar');
    const conn = await pool.query('SELECT 1 FROM google_calendar_connections WHERE user_id = $1', [user.id]);
    expect(conn.rows).toHaveLength(0);
  });

  it('desconecta mesmo se a revogação falhar', async () => {
    const user = await novoUsuario();
    await conectar(user);
    global.fetch.mockImplementation(async () => { throw new Error('rede caiu'); });
    const res = await request(app).delete('/calendar/google').set(auth(user));
    expect(res.status).toBe(204);
    const conn = await pool.query('SELECT 1 FROM google_calendar_connections WHERE user_id = $1', [user.id]);
    expect(conn.rows).toHaveLength(0);
  });
});
