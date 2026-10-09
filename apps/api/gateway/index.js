const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const { AsyncLocalStorage } = require('async_hooks');
const { CircuitBreaker } = require('./circuit-breaker');
require('dotenv').config();

const app = express();
const PORT = 3000;
const requestContext = new AsyncLocalStorage();
const http = axios.create({ timeout: 5000 });
const breakers = new Map();

http.interceptors.request.use((config) => {
  const requestId = requestContext.getStore()?.requestId;
  if (requestId) config.headers.set('X-Request-ID', requestId);
  return config;
});

function downstream(service, method, ...args) {
  if (!breakers.has(service)) breakers.set(service, new CircuitBreaker());
  // Deliberately no retry is performed here. In particular, repeating POST,
  // PUT or PATCH could duplicate a mutation that reached the service.
  return breakers.get(service).execute(service, () => http[method](...args));
}

// Sem `cors()` aqui de propósito: em produção o gateway não tem porta
// publicada, então tudo chega pelo nginx, e é lá que a lista de origens
// autorizadas mora. Dois responsáveis pelo mesmo cabeçalho não somam
// segurança — somam literalmente o cabeçalho, e o navegador recusa a
// resposta com dois Access-Control-Allow-Origin. Ver nginx/proxy.conf.
app.use(express.json());

app.use((req, res, next) => {
  const recebido = req.get('X-Request-ID');
  const requestId = recebido && /^[0-9a-f-]{36}$/i.test(recebido)
    ? recebido
    : crypto.randomUUID();
  req.requestId = requestId;
  res.set('X-Request-ID', requestId);
  requestContext.run({ requestId }, next);
});

// URLs dos serviços
const services = {
  auth: process.env.AUTH_SERVICE_URL || 'http://localhost:3001',
  user: process.env.USER_SERVICE_URL || 'http://localhost:3002',
  estudo: process.env.ESTUDO_SERVICE_URL || 'http://localhost:3004',
  questoes: process.env.QUESTOES_SERVICE_URL || 'http://localhost:3005',
};

// Middleware para logging de requisições
app.use((req, res, next) => {
  const startedAt = process.hrtime.bigint();
  res.on('finish', () => {
    console.log(JSON.stringify({
      component: 'gateway',
      requestId: req.requestId,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      durationMs: Number(process.hrtime.bigint() - startedAt) / 1e6,
    }));
  });
  next();
});

// Health Check
app.get('/health', (req, res) => {
  res.json({ status: 'Gateway is running', timestamp: new Date().toISOString() });
});

// ===== ROTAS DE AUTENTICAÇÃO =====
app.post('/api/auth/register', async (req, res) => {
  try {
    const response = await downstream('auth', 'post', `${services.auth}/register`, req.body);
    res.status(response.status).json(response.data);
  } catch (error) {
    res.status(error.response?.status || 500).json({
      error: error.response?.data?.error || 'Erro na autenticação',
    });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const response = await downstream('auth', 'post', `${services.auth}/login`, req.body);
    res.json(response.data);
  } catch (error) {
    res.status(error.response?.status || 500).json({
      error: error.response?.data?.error || 'Erro na autenticação',
    });
  }
});

app.post('/api/auth/forgot-password', async (req, res) => {
  try {
    const response = await downstream('auth', 'post', `${services.auth}/forgot-password`, req.body);
    res.status(response.status).json(response.data);
  } catch (error) {
    res.status(error.response?.status || 500).json({
      error: error.response?.data?.error || 'Erro ao solicitar redefinição de senha',
    });
  }
});

app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const response = await downstream('auth', 'post', `${services.auth}/reset-password`, req.body);
    res.status(response.status).json(response.data);
  } catch (error) {
    res.status(error.response?.status || 500).json({
      error: error.response?.data?.error || 'Erro ao redefinir senha',
    });
  }
});

// Login com o Google: o navegador manda o ID token que recebeu do Google, e
// o auth-service confere e devolve o JWT da plataforma, como no login.
app.post('/api/auth/google', async (req, res) => {
  try {
    const response = await downstream('auth', 'post', `${services.auth}/google`, req.body);
    // 201 quando a conta acabou de ser criada, 200 quando já existia.
    res.status(response.status).json(response.data);
  } catch (error) {
    res.status(error.response?.status || 500).json({
      error: error.response?.data?.error || 'Erro na autenticação',
    });
  }
});

app.get('/api/auth/verify-email', async (req, res) => {
  try {
    const response = await downstream('auth', 'get', `${services.auth}/verify-email`, {
      params: req.query,
    });
    res.status(response.status).json(response.data);
  } catch (error) {
    res.status(error.response?.status || 500).json({
      error: error.response?.data?.error || 'Erro ao confirmar e-mail',
    });
  }
});

// Google Agenda. As rotas usam um circuit breaker próprio ('auth-calendar'),
// separado do 'auth' do login. E 502/503/504 respondidos pelo auth-service
// nessas rotas são erro do Google, de configuração ou do prazo do sync — não
// sinal de serviço fora do ar —, então passam como resposta normal e não
// contam para abrir o circuito. Só falha de rede, timeout e outro 5xx contam.
// Callback e confirm ficam fora do breaker: com o circuito aberto, o callback
// perderia o `code` do Google, que é de uso único.
const FRONTEND_BASE_URL = (process.env.FRONTEND_BASE_URL || 'https://mlkoab.tech').replace(/\/+$/, '');
const calendarErro = `${FRONTEND_BASE_URL}/?calendar=error`;
// O sync faz várias chamadas ao Google; o nginx espera até 30s.
const SYNC_TIMEOUT_MS = 25000;

const STATUS_DO_GOOGLE = new Set([502, 503, 504]);
const validateCalendarStatus = (status) => (status >= 200 && status < 300) || STATUS_DO_GOOGLE.has(status);

function calendarProxy(method, path, { comCorpo = false, timeout, semBreaker = false } = {}) {
  return async (req, res) => {
    try {
      const config = {
        headers: { authorization: req.headers.authorization },
        validateStatus: validateCalendarStatus,
      };
      if (timeout) config.timeout = timeout;
      const args = [`${services.auth}/calendar/google${path}`, ...(comCorpo ? [req.body, config] : [config])];
      const response = semBreaker
        ? await http[method](...args)
        : await downstream('auth-calendar', method, ...args);
      if (response.status === 204) return res.status(204).end();
      res.status(response.status).json(response.data);
    } catch (error) {
      res.status(error.response?.status || 500).json({ error: error.response?.data?.error || 'Erro no Google Calendar' });
    }
  };
}

app.get('/api/calendar/google/status', calendarProxy('get', '/status'));
app.get('/api/calendar/google/start', calendarProxy('get', '/start'));
app.post('/api/calendar/google/sync', calendarProxy('post', '/sync', { comCorpo: true, timeout: SYNC_TIMEOUT_MS }));
app.post('/api/calendar/google/confirm', calendarProxy('post', '/confirm', { comCorpo: true, semBreaker: true, timeout: 15000 }));
app.delete('/api/calendar/google', calendarProxy('delete', ''));

app.get('/api/calendar/google/callback', async (req, res) => {
  try {
    const response = await http.get(`${services.auth}/calendar/google/callback`, {
      params: req.query,
      maxRedirects: 0,
      validateStatus: (status) => status < 400,
    });
    const location = response.headers.location;
    // Só segue redirecionamento para o próprio front.
    const destino = typeof location === 'string' && location.startsWith(`${FRONTEND_BASE_URL}/`)
      ? location
      : calendarErro;
    res.redirect(destino);
  } catch (error) {
    res.redirect(calendarErro);
  }
});

// Exposta para consumidores fora da rede interna (as rotas de IA do
// MlDireito, na Vercel) validarem um token antes de chamar serviço pago —
// o auth-service já tinha /verify, só não era alcançável de fora.
app.post('/api/auth/verify', async (req, res) => {
  try {
    const response = await downstream(
      'auth',
      'post',
      `${services.auth}/verify`,
      {},
      { headers: { authorization: req.headers.authorization } }
    );
    res.json(response.data);
  } catch (error) {
    res.status(error.response?.status || 500).json({
      error: error.response?.data?.error || 'Erro ao verificar token',
    });
  }
});

// ===== ROTAS DE USUÁRIOS =====
app.get('/api/users/:id', async (req, res) => {
  try {
    const response = await downstream('user', 'get', `${services.user}/users/${req.params.id}`, {
      headers: { authorization: req.headers.authorization },
    });
    res.json(response.data);
  } catch (error) {
    res.status(error.response?.status || 500).json({
      error: error.response?.data?.error || 'Erro ao buscar usuário',
    });
  }
});

app.put('/api/users/:id', async (req, res) => {
  try {
    const response = await downstream('user', 'put', `${services.user}/users/${req.params.id}`, req.body, {
      headers: { authorization: req.headers.authorization },
    });
    res.json(response.data);
  } catch (error) {
    res.status(error.response?.status || 500).json({
      error: error.response?.data?.error || 'Erro ao atualizar usuário',
    });
  }
});

// ===== ROTAS DE ESTUDO (MA Questões) =====
app.post('/api/tentativas', async (req, res) => {
  try {
    const response = await downstream('estudo', 'post', `${services.estudo}/tentativas`, req.body, {
      headers: { authorization: req.headers.authorization },
    });
    res.status(response.status).json(response.data);
  } catch (error) {
    res.status(error.response?.status || 500).json({
      error: error.response?.data?.error || 'Erro ao registrar tentativa',
    });
  }
});

app.get('/api/tentativas', async (req, res) => {
  try {
    const response = await downstream('estudo', 'get', `${services.estudo}/tentativas`, {
      headers: { authorization: req.headers.authorization },
      // A query string precisa ser repassada explicitamente: `desde` e
      // `limite` vivem nela, e sem isto o serviço receberia a rota nua.
      params: req.query,
    });
    res.json(response.data);
  } catch (error) {
    res.status(error.response?.status || 500).json({
      error: error.response?.data?.error || 'Erro ao buscar tentativas',
    });
  }
});

// O feedback ("foi chute?") chega depois da tentativa já gravada, então é
// PATCH sobre uma linha existente e não parte do POST. O `:id` entra na URL
// do serviço; o corpo segue como veio.
app.patch('/api/tentativas/:id', async (req, res) => {
  try {
    const response = await downstream(
      'estudo',
      'patch',
      `${services.estudo}/tentativas/${encodeURIComponent(req.params.id)}`,
      req.body,
      { headers: { authorization: req.headers.authorization } }
    );
    res.status(response.status).json(response.data);
  } catch (error) {
    res.status(error.response?.status || 500).json({
      error: error.response?.data?.error || 'Erro ao atualizar tentativa',
    });
  }
});

// ===== ROTAS DE QUESTÕES (acervo da OAB) =====
//
// Só leitura. A carga do acervo é feita por `carregar.js`, rodado à mão
// contra o banco — não existe rota de escrita, e é de propósito: um POST
// que aceite questão nova seria o caminho para um gabarito não oficial
// entrar no acervo, que é exatamente o que este serviço evita.
app.get('/api/questoes', async (req, res) => {
  try {
    const response = await downstream('questoes', 'get', `${services.questoes}/questoes`, {
      headers: { authorization: req.headers.authorization },
      // Sem isto, `disciplina`, `limite` e `aleatorio` somem no caminho e o
      // serviço recebe a rota nua — o mesmo detalhe de /api/tentativas.
      params: req.query,
    });
    res.json(response.data);
  } catch (error) {
    res.status(error.response?.status || 500).json({
      error: error.response?.data?.error || 'Erro ao buscar questões',
    });
  }
});

// Antes de /api/questoes/:id — o Express casa na ordem, e invertido
// "disciplinas" cairia no :id.
app.get('/api/questoes/disciplinas', async (req, res) => {
  try {
    const response = await downstream('questoes', 'get', `${services.questoes}/questoes/disciplinas`, {
      headers: { authorization: req.headers.authorization },
    });
    res.json(response.data);
  } catch (error) {
    res.status(error.response?.status || 500).json({
      error: error.response?.data?.error || 'Erro ao buscar disciplinas',
    });
  }
});

app.get('/api/questoes/:id', async (req, res) => {
  try {
    const response = await downstream('questoes', 'get', `${services.questoes}/questoes/${req.params.id}`, {
      headers: { authorization: req.headers.authorization },
    });
    res.json(response.data);
  } catch (error) {
    res.status(error.response?.status || 500).json({
      error: error.response?.data?.error || 'Erro ao buscar questão',
    });
  }
});

// ===== DISCURSIVAS DA 2ª FASE =====
//
// Duas origens sob o mesmo prefixo: as QUESTÕES (enunciado e padrão de
// resposta da FGV) vêm do questoes-service; as RESPOSTAS de cada pessoa vêm
// do estudo-service, como as tentativas das objetivas.
//
// As rotas de /respostas vêm ANTES de /api/discursivas/:id — o Express casa
// na ordem, e invertido "respostas" cairia no :id e iria parar no serviço
// errado, que devolveria 400 de id inválido.
app.post('/api/discursivas/respostas', async (req, res) => {
  try {
    const response = await downstream('estudo', 'post', `${services.estudo}/discursivas/respostas`, req.body, {
      headers: { authorization: req.headers.authorization },
    });
    res.status(response.status).json(response.data);
  } catch (error) {
    res.status(error.response?.status || 500).json({
      error: error.response?.data?.error || 'Erro ao salvar resposta',
    });
  }
});

app.get('/api/discursivas/respostas', async (req, res) => {
  try {
    const response = await downstream('estudo', 'get', `${services.estudo}/discursivas/respostas`, {
      headers: { authorization: req.headers.authorization },
      params: req.query, // questao_id
    });
    res.status(response.status).json(response.data);
  } catch (error) {
    res.status(error.response?.status || 500).json({
      error: error.response?.data?.error || 'Erro ao buscar respostas',
    });
  }
});

app.get('/api/discursivas', async (req, res) => {
  try {
    const response = await downstream('questoes', 'get', `${services.questoes}/discursivas`, {
      headers: { authorization: req.headers.authorization },
      params: req.query, // area
    });
    res.status(response.status).json(response.data);
  } catch (error) {
    res.status(error.response?.status || 500).json({
      error: error.response?.data?.error || 'Erro ao buscar questões discursivas',
    });
  }
});

app.get('/api/discursivas/:id', async (req, res) => {
  try {
    const response = await downstream(
      'questoes',
      'get',
      `${services.questoes}/discursivas/${encodeURIComponent(req.params.id)}`,
      { headers: { authorization: req.headers.authorization } }
    );
    res.status(response.status).json(response.data);
  } catch (error) {
    res.status(error.response?.status || 500).json({
      error: error.response?.data?.error || 'Erro ao buscar questão discursiva',
    });
  }
});

// Health Check de Serviços
app.get('/health/services', async (req, res) => {
  const health = {};
  for (const [name, url] of Object.entries(services)) {
    try {
      await downstream(name, 'get', `${url}/health`, { timeout: 2000 });
      health[name] = 'UP';
    } catch {
      health[name] = 'DOWN';
    }
  }
  res.json({ gateway: 'UP', services: health });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`🚪 API Gateway rodando em http://localhost:${PORT}`);
  });
}

module.exports = { app, http, breakers };
