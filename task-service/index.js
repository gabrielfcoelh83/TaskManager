const express = require('express');
const pg = require('pg');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3003;

app.use(express.json());

// Configuração do Banco de Dados
const pool = new pg.Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});


const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  // Falhar no arranque é melhor que subir aceitando o que não deveria.
  throw new Error('JWT_SECRET não definido');
}

// Verificação local da assinatura, sem ida ao auth-service.
//
// Antes, toda requisição custava uma chamada HTTP e ficava refém da
// disponibilidade daquele serviço: auth-service fora do ar derrubava
// user-service e task-service junto, mesmo saudáveis.
//
// O preço é revogação: um token roubado continua válido até expirar, em
// vez de poder ser invalidado na hora. Com expiração de 7 dias, essa é a
// janela. Reduzir o prazo, ou manter uma denylist no Redis, são os
// caminhos para recuperar isso sem voltar à chamada por requisição.
const verifyToken = (req, res, next) => {
  const header = req.headers.authorization;

  if (!header) {
    return res.status(401).json({ error: 'Token não fornecido' });
  }

  // O gateway repassa o header como veio do cliente, com ou sem "Bearer ".
  const token = header.startsWith('Bearer ') ? header.slice(7) : header;

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (error) {
    res.status(401).json({ error: 'Token inválido' });
  }
};

// Health Check
app.get('/health', (req, res) => {
  res.json({ status: 'Task Service is running', timestamp: new Date().toISOString() });
});

// Listar todas as tarefas do usuário
app.get('/tasks', verifyToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM tasks WHERE user_id = $1 ORDER BY created_at DESC',
      [req.user.id]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Erro ao listar tarefas:', error);
    res.status(500).json({ error: 'Erro ao listar tarefas' });
  }
});

// Obter uma tarefa específica
app.get('/tasks/:id', verifyToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM tasks WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Tarefa não encontrada' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Erro ao buscar tarefa:', error);
    res.status(500).json({ error: 'Erro ao buscar tarefa' });
  }
});

// Criar nova tarefa
app.post('/tasks', verifyToken, async (req, res) => {
  const { title, description, status } = req.body;

  if (!title) {
    return res.status(400).json({ error: 'Título é obrigatório' });
  }

  try {
    const result = await pool.query(
      'INSERT INTO tasks (user_id, title, description, status) VALUES ($1, $2, $3, $4) RETURNING *',
      [req.user.id, title, description || null, status || 'pending']
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Erro ao criar tarefa:', error);
    res.status(500).json({ error: 'Erro ao criar tarefa' });
  }
});

// Atualizar tarefa
app.put('/tasks/:id', verifyToken, async (req, res) => {
  const { title, description, status } = req.body;

  try {
    const result = await pool.query(
      'UPDATE tasks SET title = COALESCE($1, title), description = COALESCE($2, description), status = COALESCE($3, status), updated_at = NOW() WHERE id = $4 AND user_id = $5 RETURNING *',
      [title, description, status, req.params.id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Tarefa não encontrada' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Erro ao atualizar tarefa:', error);
    res.status(500).json({ error: 'Erro ao atualizar tarefa' });
  }
});

// Deletar tarefa
app.delete('/tasks/:id', verifyToken, async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM tasks WHERE id = $1 AND user_id = $2 RETURNING id',
      [req.params.id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Tarefa não encontrada' });
    }

    res.json({ message: 'Tarefa deletada com sucesso', id: result.rows[0].id });
  } catch (error) {
    console.error('Erro ao deletar tarefa:', error);
    res.status(500).json({ error: 'Erro ao deletar tarefa' });
  }
});

const { migrate } = require('./migrate');

// Migrations antes de aceitar tráfego. Se falharem, o processo morre: o
// smoke test não passa, e o rollback devolve a versão anterior.
migrate(pool)
  .then(() => {
    app.listen(PORT, () => {
      console.log(`✅ Task Service rodando em http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('❌ Falha nas migrations:', err.message);
    process.exit(1);
  });
