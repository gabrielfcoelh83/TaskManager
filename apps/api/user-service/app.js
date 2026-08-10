const express = require('express');
const pg = require('pg');
const { createClient } = require('redis');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3002;

app.use(express.json());

// Configuração do Banco de Dados
const pool = new pg.Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});


const STREAM = 'user-events';
const GRUPO = 'user-service';
const CONSUMIDOR = process.env.HOSTNAME || 'worker-1';

// Cria o perfil a partir de um evento da fila
async function processarEvento(evento) {
  if (evento.tipo !== 'user.registered') return;

  // ON CONFLICT: se a mesma mensagem for reentregue, não duplica o perfil.
  // Repetir a operação precisa ser inofensivo — isso se chama idempotência.
  await pool.query(
    'INSERT INTO users (user_id, name, email) VALUES ($1, $2, $3) ON CONFLICT (user_id) DO NOTHING',
    [Number(evento.id), evento.name, evento.email]
  );
  console.log(`👤 Perfil criado para ${evento.email} (user_id=${evento.id})`);
}

async function escutarEventos() {
  const redis = createClient({ url: process.env.REDIS_URL || 'redis://localhost:6379' });
  redis.on('error', (err) => console.error('Erro no Redis:', err.message));
  await redis.connect();

  // Registra o grupo de consumo a partir do início da fila ('0').
  // MKSTREAM cria a fila caso o auth-service ainda não tenha gravado nada.
  try {
    await redis.xGroupCreate(STREAM, GRUPO, '0', { MKSTREAM: true });
    console.log(`🆕 Grupo de consumo "${GRUPO}" criado`);
  } catch (err) {
    if (!err.message.includes('BUSYGROUP')) throw err;
    console.log(`♻️  Grupo "${GRUPO}" já existia, retomando de onde parou`);
  }

  console.log('👂 Lendo a fila user-events');

  while (true) {
    try {
      // '>' = só o que este grupo ainda não recebeu.
      // BLOCK: espera até 5s por novidade em vez de ficar perguntando sem parar.
      const resposta = await redis.xReadGroup(
        GRUPO,
        CONSUMIDOR,
        [{ key: STREAM, id: '>' }],
        { COUNT: 10, BLOCK: 5000 }
      );

      if (!resposta) continue; // nada chegou nesses 5s

      for (const fila of resposta) {
        for (const { id: msgId, message } of fila.messages) {
          try {
            await processarEvento(message);
            // Só confirma depois de gravar. Se travar antes daqui,
            // a mensagem segue pendente e é reentregue.
            await redis.xAck(STREAM, GRUPO, msgId);
          } catch (err) {
            console.error(`Falha ao processar ${msgId}:`, err.message);
          }
        }
      }
    } catch (err) {
      console.error('Erro ao ler a fila:', err.message);
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}

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

// Autenticação diz quem você é; autorização diz o que você pode.
// verifyToken só resolve a primeira. Sem o middleware abaixo, qualquer
// usuário autenticado alcança os dados de qualquer outro.
const requireOwnership = (req, res, next) => {
  if (String(req.user.id) !== String(req.params.id)) {
    // 404 em vez de 403: 403 confirmaria que aquele id existe.
    return res.status(404).json({ error: 'Usuário não encontrado' });
  }
  next();
};

// Não há coluna de papel no schema, e sem migrations criar uma agora seria
// um problema maior que o resolvido. A lista de admins vem do ambiente, e
// vazia por padrão: ninguém lista a base inteira até ser autorizado.
const ADMIN_IDS = (process.env.ADMIN_USER_IDS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const requireAdmin = (req, res, next) => {
  if (!ADMIN_IDS.includes(String(req.user.id))) {
    return res.status(403).json({ error: 'Acesso restrito' });
  }
  next();
};

// Health Check
app.get('/health', (req, res) => {
  res.json({ status: 'User Service is running', timestamp: new Date().toISOString() });
});

// Obter perfil do usuário
app.get('/users/:id', verifyToken, requireOwnership, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, user_id, name, email, profile_data, created_at FROM users WHERE user_id = $1',
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Erro ao buscar usuário:', error);
    res.status(500).json({ error: 'Erro ao buscar usuário' });
  }
});

// Criar perfil de usuário (chamado após registro)
app.post('/users', verifyToken, async (req, res) => {
  const { name, email } = req.body;
  const userId = req.user.id;

  if (!name || !email) {
    return res.status(400).json({ error: 'Nome e email são obrigatórios' });
  }

  try {
    const result = await pool.query(
      'INSERT INTO users (user_id, name, email) VALUES ($1, $2, $3) RETURNING *',
      [userId, name, email]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Erro ao criar perfil:', error);
    res.status(500).json({ error: 'Erro ao criar perfil' });
  }
});

// Atualizar perfil de usuário
app.put('/users/:id', verifyToken, requireOwnership, async (req, res) => {
  const { name, email, profile_data } = req.body;

  try {
    const result = await pool.query(
      'UPDATE users SET name = COALESCE($1, name), email = COALESCE($2, email), profile_data = COALESCE($3, profile_data), updated_at = NOW() WHERE user_id = $4 RETURNING *',
      [name, email, profile_data ? JSON.stringify(profile_data) : null, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Erro ao atualizar usuário:', error);
    res.status(500).json({ error: 'Erro ao atualizar usuário' });
  }
});

// Listar todos os usuários — restrito a ADMIN_USER_IDS
app.get('/users', verifyToken, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query('SELECT id, user_id, name, email, created_at FROM users LIMIT 100');
    res.json(result.rows);
  } catch (error) {
    console.error('Erro ao listar usuários:', error);
    res.status(500).json({ error: 'Erro ao listar usuários' });
  }
});

// Exportado sem listen() e sem iniciar o consumidor da fila: o laço
// infinito de escutarEventos() impediria os testes de terminar.
module.exports = { app, pool, escutarEventos };
