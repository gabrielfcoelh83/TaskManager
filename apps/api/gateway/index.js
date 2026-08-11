const express = require('express');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = 3000;

// Sem `cors()` aqui de propósito: em produção o gateway não tem porta
// publicada, então tudo chega pelo nginx, e é lá que a lista de origens
// autorizadas mora. Dois responsáveis pelo mesmo cabeçalho não somam
// segurança — somam literalmente o cabeçalho, e o navegador recusa a
// resposta com dois Access-Control-Allow-Origin. Ver nginx/proxy.conf.
app.use(express.json());

// URLs dos serviços
const services = {
  auth: process.env.AUTH_SERVICE_URL || 'http://localhost:3001',
  user: process.env.USER_SERVICE_URL || 'http://localhost:3002',
  task: process.env.TASK_SERVICE_URL || 'http://localhost:3003',
  estudo: process.env.ESTUDO_SERVICE_URL || 'http://localhost:3004',
  questoes: process.env.QUESTOES_SERVICE_URL || 'http://localhost:3005',
};

// Middleware para logging de requisições
app.use((req, res, next) => {
  console.log(`[Gateway] ${req.method} ${req.path}`);
  next();
});

// Health Check
app.get('/health', (req, res) => {
  res.json({ status: 'Gateway is running', timestamp: new Date().toISOString() });
});

// ===== ROTAS DE AUTENTICAÇÃO =====
app.post('/api/auth/register', async (req, res) => {
  try {
    const response = await axios.post(`${services.auth}/register`, req.body);
    res.json(response.data);
  } catch (error) {
    res.status(error.response?.status || 500).json({
      error: error.response?.data?.error || 'Erro na autenticação',
    });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const response = await axios.post(`${services.auth}/login`, req.body);
    res.json(response.data);
  } catch (error) {
    res.status(error.response?.status || 500).json({
      error: error.response?.data?.error || 'Erro na autenticação',
    });
  }
});

// ===== ROTAS DE USUÁRIOS =====
app.get('/api/users/:id', async (req, res) => {
  try {
    const response = await axios.get(`${services.user}/users/${req.params.id}`, {
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
    const response = await axios.put(`${services.user}/users/${req.params.id}`, req.body, {
      headers: { authorization: req.headers.authorization },
    });
    res.json(response.data);
  } catch (error) {
    res.status(error.response?.status || 500).json({
      error: error.response?.data?.error || 'Erro ao atualizar usuário',
    });
  }
});

// ===== ROTAS DE TAREFAS =====
app.get('/api/tasks', async (req, res) => {
  try {
    const response = await axios.get(`${services.task}/tasks`, {
      headers: { authorization: req.headers.authorization },
    });
    res.json(response.data);
  } catch (error) {
    res.status(error.response?.status || 500).json({
      error: error.response?.data?.error || 'Erro ao buscar tarefas',
    });
  }
});

app.post('/api/tasks', async (req, res) => {
  try {
    const response = await axios.post(`${services.task}/tasks`, req.body, {
      headers: { authorization: req.headers.authorization },
    });
    res.json(response.data);
  } catch (error) {
    res.status(error.response?.status || 500).json({
      error: error.response?.data?.error || 'Erro ao criar tarefa',
    });
  }
});

app.put('/api/tasks/:id', async (req, res) => {
  try {
    const response = await axios.put(`${services.task}/tasks/${req.params.id}`, req.body, {
      headers: { authorization: req.headers.authorization },
    });
    res.json(response.data);
  } catch (error) {
    res.status(error.response?.status || 500).json({
      error: error.response?.data?.error || 'Erro ao atualizar tarefa',
    });
  }
});

app.delete('/api/tasks/:id', async (req, res) => {
  try {
    const response = await axios.delete(`${services.task}/tasks/${req.params.id}`, {
      headers: { authorization: req.headers.authorization },
    });
    res.json(response.data);
  } catch (error) {
    res.status(error.response?.status || 500).json({
      error: error.response?.data?.error || 'Erro ao deletar tarefa',
    });
  }
});

// ===== ROTAS DE ESTUDO (MA Questões) =====
app.post('/api/tentativas', async (req, res) => {
  try {
    const response = await axios.post(`${services.estudo}/tentativas`, req.body, {
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
    const response = await axios.get(`${services.estudo}/tentativas`, {
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

// ===== ROTAS DE QUESTÕES (acervo da OAB) =====
//
// Só leitura. A carga do acervo é feita por `carregar.js`, rodado à mão
// contra o banco — não existe rota de escrita, e é de propósito: um POST
// que aceite questão nova seria o caminho para um gabarito não oficial
// entrar no acervo, que é exatamente o que este serviço evita.
app.get('/api/questoes', async (req, res) => {
  try {
    const response = await axios.get(`${services.questoes}/questoes`, {
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
    const response = await axios.get(`${services.questoes}/questoes/disciplinas`, {
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
    const response = await axios.get(`${services.questoes}/questoes/${req.params.id}`, {
      headers: { authorization: req.headers.authorization },
    });
    res.json(response.data);
  } catch (error) {
    res.status(error.response?.status || 500).json({
      error: error.response?.data?.error || 'Erro ao buscar questão',
    });
  }
});

// Health Check de Serviços
app.get('/health/services', async (req, res) => {
  const health = {};
  for (const [name, url] of Object.entries(services)) {
    try {
      await axios.get(`${url}/health`, { timeout: 2000 });
      health[name] = 'UP';
    } catch {
      health[name] = 'DOWN';
    }
  }
  res.json({ gateway: 'UP', services: health });
});

app.listen(PORT, () => {
  console.log(`🚪 API Gateway rodando em http://localhost:${PORT}`);
});
