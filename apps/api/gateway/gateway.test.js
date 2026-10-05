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
