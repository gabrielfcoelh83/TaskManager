const express = require('express');
const pg = require('pg');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { createClient } = require('redis');
const { OAuth2Client } = require('google-auth-library');
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

  // E-mail sem distinção de maiúsculas: `Joao@x.com` e `joao@x.com` são a
  // mesma caixa postal. Com o login do Google — que grava em minúsculas — a
  // diferença virava duas contas para a mesma pessoa.
  const emailNormalizado = String(email).trim().toLowerCase();

  try {
    // Verificar se usuário já existe
    const existingUser = await pool.query('SELECT 1 FROM users WHERE lower(email) = $1', [emailNormalizado]);
    if (existingUser.rows.length > 0) {
      return res.status(409).json({ error: 'Email já registrado' });
    }

    // Hash da senha
    const hashedPassword = await bcrypt.hash(password, 10);

    // Inserir usuário
    const result = await pool.query(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email',
      [emailNormalizado, hashedPassword]
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
    // Buscar usuário — sem distinção de maiúsculas, como no cadastro. Contas
    // antigas gravadas com maiúsculas continuam achadas.
    const result = await pool.query(
      'SELECT * FROM users WHERE lower(email) = $1 ORDER BY id LIMIT 1',
      [String(email).trim().toLowerCase()]
    );
    const user = result.rows[0];

    if (!user) {
      return res.status(401).json({ error: 'Email ou senha incorretos' });
    }

    // Conta criada pelo Google não tem senha: `bcrypt.compare` com hash nulo
    // lançaria e a resposta sairia 500. Para quem tenta, é o mesmo "email ou
    // senha incorretos" de sempre — não dizemos que a conta existe.
    if (!user.password_hash) {
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

// ───────────────────────────────────────────────────────────────
// Login com o Google
// ───────────────────────────────────────────────────────────────
//
// O navegador recebe do Google um ID token (JWT assinado pelo Google) e o
// manda aqui. Conferir a assinatura e o `aud` é o que impede alguém de
// entrar com um token que o Google emitiu para OUTRO app: sem o `aud`, o
// token de qualquer site com "Fazer login com o Google" valeria aqui.
//
// Sem GOOGLE_CLIENT_ID configurado a rota responde 503 — o código pode ir
// para produção antes de o Client ID existir.
const clienteGoogle = new OAuth2Client();

// Trocável nos testes: eles não têm como pedir um token de verdade ao Google.
let verificarTokenGoogle = async (credential, clientId) => {
  const ticket = await clienteGoogle.verifyIdToken({ idToken: credential, audience: clientId });
  return ticket.getPayload();
};
function definirVerificadorGoogle(fn) {
  verificarTokenGoogle = fn;
}

const emitirToken = (user) => jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });

app.post('/google', async (req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return res.status(503).json({ error: 'Login com o Google não está configurado' });
  }

  const { credential } = req.body || {};
  if (typeof credential !== 'string' || credential === '') {
    return res.status(400).json({ error: 'credential é obrigatório' });
  }

  let dados;
  try {
    dados = await verificarTokenGoogle(credential, clientId);
  } catch {
    return res.status(401).json({ error: 'Token do Google inválido' });
  }

  // E-mail não verificado pelo Google não pode ligar a conta a um usuário
  // que já existe com esse e-mail — seria entrar na conta de outra pessoa.
  if (!dados?.sub || !dados.email || dados.email_verified !== true) {
    return res.status(401).json({ error: 'A conta do Google precisa ter o e-mail verificado' });
  }

  const email = String(dados.email).toLowerCase();

  try {
    // 1. Já entrou pelo Google antes.
    let { rows } = await pool.query('SELECT id, email FROM users WHERE google_sub = $1', [dados.sub]);
    if (rows[0]) {
      return res.json({ message: 'Login realizado com sucesso', user: rows[0], token: emitirToken(rows[0]), novo: false });
    }

    // 2. Já tem conta com esse e-mail (criada com senha): liga a conta do
    //    Google a ela — e APAGA a senha. O cadastro por senha não confirma
    //    o e-mail, então quem o criou pode não ser o dono dele: um atacante
    //    cadastra o e-mail da vítima com uma senha sua, a vítima entra depois
    //    pelo Google e passa a estudar numa conta que o atacante também abre.
    //    O Google provou que a pessoa é dona do e-mail; a senha não provou
    //    nada. A partir daqui a conta entra só pelo Google.
    ({ rows } = await pool.query(
      `UPDATE users SET google_sub = $1, password_hash = NULL
        WHERE id = (
          SELECT id FROM users
           WHERE lower(email) = $2 AND google_sub IS NULL
           ORDER BY id LIMIT 1
        )
        RETURNING id, email`,
      [dados.sub, email]
    ));
    if (rows[0]) {
      return res.json({ message: 'Login realizado com sucesso', user: rows[0], token: emitirToken(rows[0]), novo: false });
    }

    // O e-mail já é de uma conta ligada a OUTRA conta do Google: não cria uma
    // segunda conta com o mesmo e-mail em outra caixa de letras.
    const outra = await pool.query('SELECT 1 FROM users WHERE lower(email) = $1', [email]);
    if (outra.rows.length > 0) {
      return res.status(409).json({ error: 'Este e-mail já está ligado a outra conta do Google' });
    }

    // 3. Primeira vez: cria o usuário sem senha e avisa o user-service, como
    //    no cadastro.
    ({ rows } = await pool.query(
      'INSERT INTO users (email, password_hash, google_sub) VALUES ($1, NULL, $2) RETURNING id, email',
      [email, dados.sub]
    ));
    const user = rows[0];

    try {
      const msgId = await redis.xAdd(STREAM, '*', {
        tipo: 'user.registered',
        id: String(user.id),
        email: user.email,
        name: dados.name || email.split('@')[0],
      });
      console.log(`📥 Evento gravado na fila (${msgId}) para ${user.email} (Google)`);
    } catch (err) {
      console.error('Não foi possível gravar o evento:', err.message);
    }

    return res.status(201).json({ message: 'Usuário registrado com sucesso', user, token: emitirToken(user), novo: true });
  } catch (error) {
    // Corrida entre dois logins simultâneos da mesma pessoa, ou e-mail já
    // ligado a OUTRA conta do Google: a restrição de unicidade recusa.
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Este e-mail já está ligado a outra conta do Google' });
    }
    console.error('Erro no login com o Google:', error);
    return res.status(500).json({ error: 'Erro no login com o Google' });
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

// Exportado sem listen() para que os testes possam exercitar as rotas
// direto, sem subir servidor nem ocupar porta.
module.exports = { app, pool, redis, definirVerificadorGoogle };
