const request = require('supertest');
const axios = require('axios');

const { app, http, breakers } = require('./index');

describe('gateway downstream behavior', () => {
  let adapter;

  beforeEach(() => {
    breakers.clear();
    adapter = jest.fn(async (config) => ({
      data: { ok: true },
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
    }));
    http.defaults.adapter = adapter;
  });

  test('propagates a valid request ID downstream and back to the client', async () => {
    const requestId = '11111111-1111-4111-8111-111111111111';
    const response = await request(app)
      .post('/api/auth/register')
      .set('X-Request-ID', requestId)
      .send({ email: 'person@example.com' });

    expect(response.status).toBe(200);
    expect(response.headers['x-request-id']).toBe(requestId);
    expect(adapter.mock.calls[0][0].headers.get('X-Request-ID')).toBe(requestId);
  });

  test('preserves successful downstream status and payload', async () => {
    adapter.mockImplementationOnce(async (config) => ({
      data: { created: true },
      status: 201,
      statusText: 'Created',
      headers: {},
      config,
    }));

    const response = await request(app).post('/api/auth/register').send({});

    expect(response.status).toBe(201);
    expect(response.body).toEqual({ created: true });
  });

  test('preserves downstream error status and message', async () => {
    const error = new axios.AxiosError('bad request', 'ERR_BAD_REQUEST', {}, {}, {
      status: 422,
      data: { error: 'invalid input' },
    });
    adapter.mockRejectedValueOnce(error);

    const response = await request(app).post('/api/auth/register').send({});

    expect(response.status).toBe(422);
    expect(response.body).toEqual({ error: 'invalid input' });
  });

  test('returns gateway error on downstream timeout without retrying a mutation', async () => {
    adapter.mockRejectedValueOnce(new axios.AxiosError('timeout', 'ECONNABORTED'));

    const response = await request(app).post('/api/auth/register').send({});

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Erro na autenticação' });
    expect(adapter).toHaveBeenCalledTimes(1);
    expect(adapter.mock.calls[0][0].timeout).toBe(5000);
  });

  test('opens the circuit after repeated downstream failures', async () => {
    adapter.mockRejectedValue(new Error('connection refused'));

    await request(app).get('/api/questoes');
    await request(app).get('/api/questoes');
    await request(app).get('/api/questoes');
    await request(app).get('/api/questoes');

    expect(adapter).toHaveBeenCalledTimes(3);
  });
});

describe('gateway: Google Agenda', () => {
  let adapter;

  beforeEach(() => {
    breakers.clear();
    adapter = jest.fn(async (config) => ({ data: { ok: true }, status: 200, statusText: 'OK', headers: {}, config }));
    http.defaults.adapter = adapter;
  });

  test('sync repassa corpo e Authorization com timeout maior', async () => {
    const corpo = { events: [], intervalo: { de: '2026-10-01', ate: '2026-10-07' } };
    adapter.mockImplementationOnce(async (config) => ({
      data: { sincronizados: 0, removidos: 7 }, status: 200, statusText: 'OK', headers: {}, config,
    }));
    const res = await request(app).post('/api/calendar/google/sync').set('Authorization', 'Bearer t').send(corpo);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ sincronizados: 0, removidos: 7 });
    const config = adapter.mock.calls[0][0];
    expect(config.url).toMatch(/\/calendar\/google\/sync$/);
    expect(JSON.parse(config.data)).toEqual(corpo);
    expect(config.headers.get('authorization')).toBe('Bearer t');
    expect(config.timeout).toBe(25000);
  });

  test('confirm repassa o código e o status de recusa', async () => {
    adapter.mockRejectedValueOnce(new axios.AxiosError('forbidden', 'ERR_BAD_REQUEST', {}, {}, {
      status: 403, data: { error: 'Não foi possível confirmar a conexão' },
    }));
    const res = await request(app).post('/api/calendar/google/confirm').set('Authorization', 'Bearer t').send({ codigo: 'abc' });
    expect(res.status).toBe(403);
    expect(adapter.mock.calls[0][0].url).toMatch(/\/calendar\/google\/confirm$/);
    expect(JSON.parse(adapter.mock.calls[0][0].data)).toEqual({ codigo: 'abc' });
  });

  test('delete devolve 204', async () => {
    adapter.mockImplementationOnce(async (config) => ({ data: '', status: 204, statusText: 'No Content', headers: {}, config }));
    const res = await request(app).delete('/api/calendar/google').set('Authorization', 'Bearer t');
    expect(res.status).toBe(204);
    expect(adapter.mock.calls[0][0].method).toBe('delete');
  });

  test('callback segue o redirect do auth-service para o front', async () => {
    adapter.mockImplementationOnce(async (config) => ({
      data: '', status: 302, statusText: 'Found',
      headers: { location: 'https://mlkoab.tech/?calendar=confirmar&codigo=abc' }, config,
    }));
    const res = await request(app).get('/api/calendar/google/callback?code=x&state=y');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('https://mlkoab.tech/?calendar=confirmar&codigo=abc');
  });

  test('callback com falha cai no front, não no domínio da API', async () => {
    adapter.mockRejectedValueOnce(new Error('connection refused'));
    const res = await request(app).get('/api/calendar/google/callback?code=x&state=y');
    expect(res.headers.location).toBe('https://mlkoab.tech/?calendar=error');
  });

  test('callback não segue redirect para fora do front', async () => {
    adapter.mockImplementationOnce(async (config) => ({
      data: '', status: 302, statusText: 'Found', headers: { location: 'https://mlkoab.tech.evil.example/' }, config,
    }));
    const res = await request(app).get('/api/calendar/google/callback?code=x&state=y');
    expect(res.headers.location).toBe('https://mlkoab.tech/?calendar=error');
  });

  // Como o adapter http do axios: aplica o validateStatus da requisição.
  const responder = (status, data = {}, headers = {}) => async (config) => {
    const response = { data, status, statusText: String(status), headers, config };
    if (!config.validateStatus || config.validateStatus(status)) return response;
    throw new axios.AxiosError(`status ${status}`, 'ERR_BAD_RESPONSE', config, {}, response);
  };

  async function abrirCircuito() {
    adapter.mockRejectedValueOnce(new Error('connection refused'));
    adapter.mockRejectedValueOnce(new Error('connection refused'));
    adapter.mockRejectedValueOnce(new Error('connection refused'));
    for (let i = 0; i < 3; i++) await request(app).get('/api/calendar/google/status');
    const fechado = await request(app).get('/api/calendar/google/status');
    expect(fechado.status).toBe(503);
    expect(adapter).toHaveBeenCalledTimes(3);
  }

  test('callback funciona com o circuito da agenda aberto', async () => {
    await abrirCircuito();
    adapter.mockImplementationOnce(responder(302, '', { location: 'https://mlkoab.tech/?calendar=confirmar&codigo=abc' }));
    const res = await request(app).get('/api/calendar/google/callback?code=x&state=y');
    expect(res.headers.location).toBe('https://mlkoab.tech/?calendar=confirmar&codigo=abc');
    expect(adapter).toHaveBeenCalledTimes(4);
  });

  test('confirm funciona com o circuito da agenda aberto', async () => {
    await abrirCircuito();
    adapter.mockImplementationOnce(responder(200, { connected: true }));
    const res = await request(app).post('/api/calendar/google/confirm').set('Authorization', 'Bearer t').send({ codigo: 'abc' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ connected: true });
  });

  test('502/503 vindos do sync não abrem o circuito e chegam ao cliente', async () => {
    for (let i = 0; i < 4; i++) {
      adapter.mockImplementationOnce(responder(i % 2 ? 503 : 502, { error: 'Não foi possível sincronizar com o Google Calendar' }));
      const res = await request(app).post('/api/calendar/google/sync').send({});
      expect(res.status).toBe(i % 2 ? 503 : 502);
      expect(res.body.error).toBe('Não foi possível sincronizar com o Google Calendar');
    }
    expect(adapter).toHaveBeenCalledTimes(4);
    const status = await request(app).get('/api/calendar/google/status');
    expect(status.status).toBe(200);
    expect(adapter).toHaveBeenCalledTimes(5);
  });

  test('504 do prazo do sync chega ao cliente', async () => {
    adapter.mockImplementationOnce(responder(504, { error: 'A sincronização demorou demais; tente de novo' }));
    const res = await request(app).post('/api/calendar/google/sync').send({});
    expect(res.status).toBe(504);
    expect(res.body.error).toMatch(/demorou demais/);
  });

  test('500 inesperado do auth-service ainda conta para o circuito', async () => {
    for (let i = 0; i < 3; i++) {
      adapter.mockImplementationOnce(responder(500, { error: 'x' }));
      await request(app).get('/api/calendar/google/status');
    }
    const res = await request(app).get('/api/calendar/google/status');
    expect(res.status).toBe(503);
    expect(adapter).toHaveBeenCalledTimes(3);
  });

  test('falhas do Google não abrem o circuito do login', async () => {
    const erro = () => new axios.AxiosError('bad gateway', 'ERR_BAD_RESPONSE', {}, {}, { status: 502, data: { error: 'x' } });
    for (let i = 0; i < 3; i++) {
      adapter.mockRejectedValueOnce(erro());
      await request(app).post('/api/calendar/google/sync').send({});
    }
    const res = await request(app).post('/api/auth/login').send({ email: 'a@b.c', password: 'x' });
    expect(res.status).toBe(200);
  });
});
