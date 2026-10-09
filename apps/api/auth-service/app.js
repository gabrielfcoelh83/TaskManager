const express = require('express');
const pg = require('pg');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { createClient } = require('redis');
const { OAuth2Client } = require('google-auth-library');
const { criarToken, enviarConfirmacao, enviarRedefinicaoSenha } = require('./email');
const calendar = require('./google-calendar');
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

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET ausente ou muito curto (mínimo de 32 caracteres)');
}

const acessoNegado = (res) => res.status(403).json({ error: 'Acesso não autorizado' });
const emailValido = (email) => (
  typeof email === 'string'
  && email.length <= 254
  && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)
);
const exigirConfirmacao = process.env.NODE_ENV !== 'test';

function usuarioDoToken(req, res) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) {
    res.status(401).json({ error: 'Token não fornecido' });
    return null;
  }
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    res.status(401).json({ error: 'Token inválido' });
    return null;
  }
}

async function solicitarConfirmacao(user) {
  const confirmacao = criarToken();
  await pool.query('DELETE FROM email_verification_tokens WHERE user_id = $1 AND used_at IS NULL', [user.id]);
  await pool.query(
    `INSERT INTO email_verification_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, NOW() + INTERVAL '24 hours')`,
    [user.id, confirmacao.hash]
  );
  await enviarConfirmacao({ email: user.email, token: confirmacao.token });
}

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

app.get('/calendar/google/start', (req, res) => {
  const user = usuarioDoToken(req, res);
  if (!user) return;
  const error = calendar.configError();
  if (error) return res.status(503).json({ error });
  res.json({ url: calendar.authorizationUrl(calendar.createState(user.id)) });
});

app.get('/calendar/google/callback', async (req, res) => {
  try {
    const user = calendar.readState(req.query.state);
    const error = calendar.configError();
    if (error) return res.redirect(calendar.callbackUrl('error'));
    const tokens = await calendar.exchangeCode(req.query.code);
    await pool.query(
      `INSERT INTO google_calendar_connections (user_id, refresh_token)
       VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET refresh_token = EXCLUDED.refresh_token, updated_at = NOW()`,
      [user.userId, calendar.encrypt(tokens.refresh_token)]
    );
    return res.redirect(calendar.callbackUrl('connected'));
  } catch (error) {
    console.error('Erro ao conectar Google Calendar:', error.message);
    return res.redirect(calendar.callbackUrl('error'));
  }
});

app.get('/calendar/google/status', async (req, res) => {
  const user = usuarioDoToken(req, res);
  if (!user) return;
  const result = await pool.query(
    'SELECT connected_at FROM google_calendar_connections WHERE user_id = $1',
    [user.id]
  );
  res.json({ connected: result.rows.length > 0, connectedAt: result.rows[0]?.connected_at || null });
});

app.post('/calendar/google/sync', async (req, res) => {
  const user = usuarioDoToken(req, res);
  if (!user) return;
  const events = req.body?.events;
  if (!Array.isArray(events) || events.length > 60) return res.status(400).json({ error: 'Lista de eventos inválida' });
  const connection = await pool.query(
    'SELECT refresh_token, calendar_id FROM google_calendar_connections WHERE user_id = $1',
    [user.id]
  );
  if (!connection.rows[0]) return res.status(409).json({ error: 'Google Calendar não conectado' });
  try {
    const refreshToken = calendar.decrypt(connection.rows[0].refresh_token);
    const calendarId = encodeURIComponent(connection.rows[0].calendar_id);
    const synced = [];
    for (const event of events) {
      if (!event?.id || !event?.start || !event?.end || !event?.summary) continue;
      const data = await calendar.calendarRequest(refreshToken, `/calendars/${calendarId}/events`, {
        method: 'POST',
        body: JSON.stringify({
          id: event.id.replace(/[^a-z0-9_-]/gi, '').slice(0, 100),
          summary: event.summary,
          description: event.description || 'Plano de estudos MA Questões',
          start: { dateTime: event.start, timeZone: event.timeZone || 'America/Sao_Paulo' },
          end: { dateTime: event.end, timeZone: event.timeZone || 'America/Sao_Paulo' },
        }),
      }).catch(async (error) => {
        if (!/already exists/i.test(error.message)) throw error;
        return calendar.calendarRequest(refreshToken, `/calendars/${calendarId}/events/${event.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ summary: event.summary, description: event.description, start: { dateTime: event.start, timeZone: event.timeZone || 'America/Sao_Paulo' }, end: { dateTime: event.end, timeZone: event.timeZone || 'America/Sao_Paulo' } }),
        });
      });
      synced.push(data.id);
    }
    return res.json({ synced: synced.length });
  } catch (error) {
    console.error('Erro ao sincronizar Google Calendar:', error.message);
    return res.status(502).json({ error: error.message });
  }
});

app.delete('/calendar/google', async (req, res) => {
  const user = usuarioDoToken(req, res);
  if (!user) return;
  await pool.query('DELETE FROM google_calendar_connections WHERE user_id = $1', [user.id]);
  res.status(204).end();
});

app.post('/forgot-password', async (req, res) => {
  const emailNormalizado = typeof req.body?.email === 'string'
    ? req.body.email.trim().toLowerCase()
    : '';
  const resposta = {
    message: 'Se existir uma conta com esse e-mail, enviaremos instruções para redefinir a senha.',
  };

  if (!emailValido(emailNormalizado)) return res.json(resposta);

  try {
    const result = await pool.query(
      // Inclui conta só com Google: o link vai para a caixa postal, e usá-lo
      // é o jeito de essa pessoa criar uma senha.
      "SELECT id, email FROM users WHERE lower(email) = $1 AND status <> 'blocked' ORDER BY id LIMIT 1",
      [emailNormalizado]
    );
    const user = result.rows[0];
    if (!user) return res.json(resposta);

    const reset = criarToken();
    await pool.query('DELETE FROM password_reset_tokens WHERE user_id = $1 AND used_at IS NULL', [user.id]);
    await pool.query(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '1 hour')`,
      [user.id, reset.hash]
    );
    await enviarRedefinicaoSenha({ email: user.email, token: reset.token });
    return res.json(resposta);
  } catch (error) {
    console.error('Erro ao solicitar redefinição de senha:', error);
    return res.json(resposta);
  }
});

app.post('/reset-password', async (req, res) => {
  const { token, password } = req.body || {};
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/i.test(token)) {
    return res.status(400).json({ error: 'Token de redefinição inválido' });
  }
  if (typeof password !== 'string' || password.length < 8) {
    return res.status(400).json({ error: 'A nova senha deve ter pelo menos 8 caracteres' });
  }

  const hash = require('crypto').createHash('sha256').update(token).digest('hex');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const found = await client.query(
      `SELECT u.id
         FROM users u
         JOIN password_reset_tokens t ON t.user_id = u.id
        WHERE t.token_hash = $1
          AND t.used_at IS NULL
          AND t.expires_at > NOW()
          AND u.status <> 'blocked'
        FOR UPDATE OF t`,
      [hash]
    );
    if (found.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Token expirado ou já utilizado' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    // O token só é enviado para o e-mail cadastrado. Usá-lo com sucesso prova
    // a posse dessa caixa postal e permite ativar contas que ainda estavam
    // pendentes de confirmação.
    await client.query(
      `UPDATE users
          SET password_hash = $1,
              status = 'active',
              email_verified_at = COALESCE(email_verified_at, NOW())
        WHERE id = $2`,
      [passwordHash, found.rows[0].id]
    );
    await client.query('UPDATE password_reset_tokens SET used_at = NOW() WHERE token_hash = $1', [hash]);
    await client.query('DELETE FROM password_reset_tokens WHERE user_id = $1 AND used_at IS NULL', [found.rows[0].id]);
    await client.query('COMMIT');
    return res.json({ message: 'Senha redefinida com sucesso. Faça login novamente.' });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Erro ao redefinir senha:', error);
    return res.status(500).json({ error: 'Erro ao redefinir senha' });
  } finally {
    client.release();
  }
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
  if (!emailValido(emailNormalizado)) {
    return res.status(400).json({ error: 'Informe um e-mail válido' });
  }

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
      `INSERT INTO users (email, password_hash, status)
       VALUES ($1, $2, $3) RETURNING id, email`,
      [emailNormalizado, hashedPassword, exigirConfirmacao ? 'pending' : 'active']
    );

    const user = result.rows[0];
    let token;
    if (exigirConfirmacao) {
      try {
        await solicitarConfirmacao(user);
      } catch (emailError) {
        await pool.query('DELETE FROM users WHERE id = $1', [user.id]);
        throw emailError;
      }
    } else {
      token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
    }

    // Grava o evento na fila. Fica lá até o consumidor confirmar a leitura,
    // mesmo que ninguém esteja rodando neste momento.
    try {
      const msgId = await redis.xAdd(
        STREAM,
        '*',
        {
          tipo: 'user.registered',
          id: String(user.id),
          email: user.email,
          name: name || emailNormalizado.split('@')[0],
        },
        { TRIM: { strategy: 'MAXLEN', strategyModifier: '~', threshold: 10000, limit: 1000 } }
      );
      console.log(`📥 Evento gravado na fila (${msgId}) para ${user.email}`);
    } catch (err) {
      console.error('Não foi possível gravar o evento:', err.message);
    }

    res.status(201).json({
      message: exigirConfirmacao
        ? 'Cadastro criado. Confirme seu e-mail para ativar o acesso.'
        : 'Usuário registrado com sucesso',
      user: { id: user.id, email: user.email },
      ...(token ? { token } : {}),
    });
  } catch (error) {
    // Unicidade recusou: o mesmo e-mail entrou ao mesmo tempo (pelo Google,
    // por exemplo). É o mesmo "já registrado" de cima, não erro do servidor.
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Email já registrado' });
    }
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

  const emailNormalizado = String(email).trim().toLowerCase();
  if (!emailValido(emailNormalizado)) {
    return res.status(400).json({ error: 'Informe um e-mail válido' });
  }

  try {
    // Buscar usuário — sem distinção de maiúsculas, como no cadastro. Contas
    // antigas gravadas com maiúsculas continuam achadas.
    const result = await pool.query(
      // Se houver duas contas antigas que só diferem na caixa, a de grafia
      // exata vem primeiro — senão o dono da segunda ficaria trancado fora.
      'SELECT * FROM users WHERE lower(email) = $1 ORDER BY (email = $2) DESC, id LIMIT 1',
      [emailNormalizado, String(email).trim()]
    );
    const user = result.rows[0];

    if (!user) {
      return res.status(401).json({ error: 'Email ou senha incorretos' });
    }
    if (user.status === 'blocked') return acessoNegado(res);
    if (user.status !== 'active') {
      return res.status(403).json({ error: 'Confirme seu e-mail antes de entrar' });
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

    if (exigirConfirmacao && !user.email_verified_at) {
      try {
        await solicitarConfirmacao(user);
      } catch (emailError) {
        console.error('Erro ao reenviar confirmação:', emailError);
        return res.status(503).json({ error: 'Não foi possível enviar o e-mail de confirmação' });
      }
      return res.status(403).json({ error: 'Confirme seu e-mail antes de entrar' });
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

// Ver o caso 2 do POST /google. Testes podem antecipar com a variável.
const assumirNaoConfirmadaDesde = () => Date.parse(
  process.env.GOOGLE_ASSUME_NAO_CONFIRMADA_DESDE || '2026-10-14T00:00:00Z'
);

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
    let { rows } = await pool.query(
      'SELECT id, email, status, email_verified_at FROM users WHERE google_sub = $1',
      [dados.sub]
    );
    if (rows[0]) {
      if (rows[0].status === 'blocked') return acessoNegado(res);
      if (rows[0].status !== 'active' || (exigirConfirmacao && !rows[0].email_verified_at)) {
        if (exigirConfirmacao) {
          try {
            await solicitarConfirmacao(rows[0]);
          } catch (emailError) {
            console.error('Erro ao reenviar confirmação:', emailError);
            return res.status(503).json({ error: 'Não foi possível enviar o e-mail de confirmação' });
          }
        }
        return res.status(403).json({ error: 'Confirme seu e-mail antes de entrar' });
      }
      return res.json({ message: 'Login realizado com sucesso', user: rows[0], token: emitirToken(rows[0]), novo: false });
    }

    // 2. Já existe conta com esse e-mail, ainda sem Google: liga e entra.
    //    O Google acabou de provar que esta pessoa controla a caixa postal
    //    (`email_verified`). Dois casos:
    //    - a conta já confirmou o e-mail: o dono dela provou a MESMA caixa
    //      postal. Liga o Google e mantém a senha;
    //    - a conta nunca confirmou: quem a criou pode não ser o dono do
    //      e-mail (pré-sequestro). O login por senha recusa conta não
    //      confirmada, então essa pessoa nunca recebeu token. O dono real
    //      assume a conta pelo Google: a senha desconhecida é apagada, os
    //      links pendentes de confirmação/redefinição são invalidados e o
    //      e-mail fica confirmado. Quem quiser senha depois usa "Esqueci
    //      minha senha" (que vai para a caixa postal confirmada).
    const existente = await pool.query(
      `SELECT id, email, status, email_verified_at, google_sub
         FROM users WHERE lower(email) = $1 ORDER BY id LIMIT 1`,
      [email]
    );
    const conta = existente.rows[0];
    if (conta) {
      if (conta.google_sub) {
        return res.status(409).json({ error: 'Este e-mail já está ligado a outra conta do Google' });
      }
      if (conta.status === 'blocked') return acessoNegado(res);

      const confirmada = Boolean(conta.email_verified_at);
      // Conta não confirmada só é assumida depois que nenhum token antigo
      // pode estar valendo: antes da migration 004 o /register emitia JWT de
      // 7 dias sem confirmar o e-mail, e os serviços conferem o JWT só pela
      // assinatura — apagar a senha não o revogaria. A 004 foi publicada até
      // 2026-10-06; 7 dias depois, com folga, esses tokens já expiraram.
      if (!confirmada && Date.now() < assumirNaoConfirmadaDesde()) {
        return res.status(409).json({ error: 'Este e-mail já tem conta com senha. Entre com e-mail e senha.' });
      }

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const ligada = await client.query(
          `UPDATE users
              SET google_sub = $1,
                  status = 'active',
                  email_verified_at = COALESCE(email_verified_at, NOW()),
                  password_hash = CASE WHEN $3 THEN password_hash ELSE NULL END
            WHERE id = $2 AND google_sub IS NULL AND status <> 'blocked'
            RETURNING id, email`,
          [dados.sub, conta.id, confirmada]
        );
        // Outra chamada ligou um Google a esta conta (ou ela foi bloqueada)
        // entre o SELECT e o UPDATE.
        if (ligada.rows.length === 0) {
          await client.query('ROLLBACK');
          return res.status(409).json({ error: 'Este e-mail já está ligado a outra conta do Google' });
        }
        if (!confirmada) {
          await client.query('DELETE FROM email_verification_tokens WHERE user_id = $1', [conta.id]);
          await client.query('DELETE FROM password_reset_tokens WHERE user_id = $1 AND used_at IS NULL', [conta.id]);
        }
        await client.query('COMMIT');
        const user = ligada.rows[0];
        return res.json({ message: 'Login realizado com sucesso', user, token: emitirToken(user), novo: false, ligada: true });
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    }

    // 3. Primeira vez: cria o usuário sem senha e avisa o user-service, como
    //    no cadastro.
    ({ rows } = await pool.query(
      'INSERT INTO users (email, password_hash, google_sub) VALUES ($1, NULL, $2) RETURNING id, email',
      [email, dados.sub]
    ));
    const user = rows[0];

    try {
      const msgId = await redis.xAdd(
        STREAM,
        '*',
        {
          tipo: 'user.registered',
          id: String(user.id),
          email: user.email,
          name: dados.name || email.split('@')[0],
        },
        { TRIM: { strategy: 'MAXLEN', strategyModifier: '~', threshold: 10000, limit: 1000 } }
      );
      console.log(`📥 Evento gravado na fila (${msgId}) para ${user.email} (Google)`);
    } catch (err) {
      console.error('Não foi possível gravar o evento:', err.message);
    }

    if (exigirConfirmacao) {
      await solicitarConfirmacao(user);
      return res.status(201).json({
        message: 'Cadastro criado. Confirme seu e-mail para ativar o acesso.',
        user,
        novo: true,
      });
    }
    return res.status(201).json({ message: 'Usuário registrado com sucesso', user, token: emitirToken(user), novo: true });
  } catch (error) {
    // Unicidade recusou o INSERT: ou foi um duplo clique (a outra chamada da
    // mesma pessoa criou a conta um instante antes — então é só entrar), ou
    // um cadastro por senha com o mesmo e-mail chegou junto.
    if (error.code === '23505') {
      const jaCriada = await pool.query('SELECT id, email FROM users WHERE google_sub = $1', [dados.sub]).catch(() => ({ rows: [] }));
      if (jaCriada.rows[0]) {
        const u = jaCriada.rows[0];
        return res.json({ message: 'Login realizado com sucesso', user: u, token: emitirToken(u), novo: false });
      }
      return res.status(409).json({ error: 'Este e-mail já tem conta. Entre com e-mail e senha.' });
    }
    console.error('Erro no login com o Google:', error);
    return res.status(500).json({ error: 'Erro no login com o Google' });
  }
});

app.get('/verify-email', async (req, res) => {
  const { token } = req.query;
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/i.test(token)) {
    return res.status(400).json({ error: 'Token de confirmação inválido' });
  }

  const hash = require('crypto').createHash('sha256').update(token).digest('hex');
  try {
    const result = await pool.query(
      `UPDATE users
          SET status = 'active', email_verified_at = NOW()
        WHERE id = (
          SELECT user_id FROM email_verification_tokens
           WHERE token_hash = $1
             AND used_at IS NULL
             AND expires_at > NOW()
        )
        RETURNING id, email`,
      [hash]
    );
    if (result.rows.length === 0) return res.status(400).json({ error: 'Token expirado ou já utilizado' });
    await pool.query(
      'UPDATE email_verification_tokens SET used_at = NOW() WHERE token_hash = $1',
      [hash]
    );
    return res.json({ message: 'E-mail confirmado. Você já pode entrar.', user: result.rows[0] });
  } catch (error) {
    console.error('Erro ao confirmar e-mail:', error);
    return res.status(500).json({ error: 'Erro ao confirmar e-mail' });
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
