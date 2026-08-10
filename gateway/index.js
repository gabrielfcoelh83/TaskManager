const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// URLs dos serviços
const services = {
  auth: process.env.AUTH_SERVICE_URL || 'http://localhost:3001',
  user: process.env.USER_SERVICE_URL || 'http://localhost:3002',
  task: process.env.TASK_SERVICE_URL || 'http://localhost:3003',
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
