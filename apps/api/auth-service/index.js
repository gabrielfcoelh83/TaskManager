const express = require('express');
const pg = require('pg');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { createClient } = require('redis');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());

// Configuração do Banco de Dados
const pool = new pg.Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

const JWT_SECRET = process.env.JWT_SECRET || 'seu_jwt_secret';

// Fila de eventos: o que é gravado aqui fica guardado até alguém confirmar a leitura
const STREAM = 'user-events';
const redis = createClient({ url: process.env.REDIS_URL || 'redis://localhost:6379' });
redis.on('error', (err) => console.error('Erro no Redis:', err.message));
redis.connect()
  .then(() => console.log('📢 Conectado ao Redis'))
  .catch((err) => console.error('Falha ao conectar no Redis:', err.message));

// Health Check
app.get('/health', (req, res) => {
  res.json({ status: 'Auth Service is running', timestamp: new Date().toISOString() });
});

// Registrar novo usuário
app.post('/register', async (req, res) => {
  const { email, password, name } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email e senha são obrigatórios' });
  }

  try {
    // Verificar se usuário já existe
    const existingUser = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (existingUser.rows.length > 0) {
      return res.status(409).json({ error: 'Email já registrado' });
    }

    // Hash da senha
    const hashedPassword = await bcrypt.hash(password, 10);

    // Inserir usuário
    const result = await pool.query(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email',
      [email, hashedPassword]
    );

    const user = result.rows[0];

    // Grava o evento na fila. Fica lá até o consumidor confirmar a leitura,
    // mesmo que ninguém esteja rodando neste momento.
    try {
      const msgId = await redis.xAdd(STREAM, '*', {
        tipo: 'user.registered',
        id: String(user.id),
        email: user.email,
        name: name || email.split('@')[0],
      });
      console.log(`📥 Evento gravado na fila (${msgId}) para ${user.email}`);
    } catch (err) {
      console.error('Não foi possível gravar o evento:', err.message);
    }

    // Gerar token JWT
    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, {
      expiresIn: '7d',
    });

    res.status(201).json({
      message: 'Usuário registrado com sucesso',
      user: { id: user.id, email: user.email },
      token,
    });
  } catch (error) {
    console.error('Erro ao registrar:', error);
    res.status(500).json({ error: 'Erro ao registrar usuário' });
  }
});

// Login
app.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email e senha são obrigatórios' });
  }

  try {
    // Buscar usuário
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = result.rows[0];

    if (!user) {
      return res.status(401).json({ error: 'Email ou senha incorretos' });
    }

    // Verificar senha
    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Email ou senha incorretos' });
    }

    // Gerar token JWT
    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, {
      expiresIn: '7d',
    });

    res.json({
      message: 'Login realizado com sucesso',
      user: { id: user.id, email: user.email },
      token,
    });
  } catch (error) {
    console.error('Erro ao fazer login:', error);
    res.status(500).json({ error: 'Erro ao fazer login' });
  }
});

// Verificar token (para outros serviços)
app.post('/verify', (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({ error: 'Token não fornecido' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    res.json({ valid: true, user: decoded });
  } catch (error) {
    res.status(401).json({ error: 'Token inválido' });
  }
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`🔐 Auth Service rodando em http://localhost:${PORT}`);
  // Teste de conexão com BD
  pool.query('SELECT NOW()', (err) => {
    if (err) console.error('Erro ao conectar ao BD:', err);
    else console.log('✅ Conectado ao banco de dados');
  });
});
