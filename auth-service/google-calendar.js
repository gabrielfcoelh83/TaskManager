const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const FRONTEND_BASE_URL = (process.env.FRONTEND_BASE_URL || 'https://mlkoab.tech').replace(/\/+$/, '');
const CALLBACK_URL = process.env.GOOGLE_CALENDAR_REDIRECT_URI
  || 'https://api.mlkoab.tech/api/calendar/google/callback';
const SCOPES = ['https://www.googleapis.com/auth/calendar.events'];
const STATE_SECRET = process.env.JWT_SECRET;
const TOKEN_KEY = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY;
const CALENDAR_API = 'https://www.googleapis.com/calendar/v3';
const GOOGLE_TIMEOUT_MS = 8000;
// Prazo total de um sync, abaixo dos 25 s que o gateway espera por ele.
const SYNC_DEADLINE_MS = Number(process.env.GOOGLE_SYNC_DEADLINE_MS) || 20000;

// Prefixo dos ids de evento. O Google só aceita base32hex (a–v e 0–9) no id;
// m, l, k, o, a, b estão todas entre a e v.
const EVENT_ID_PREFIX = 'mlkoab';
const DESCRICAO_PADRAO = 'Plano de estudos mlkoab';
const MAX_DIAS = 31;

function configError() {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return 'Google Calendar não está configurado no servidor';
  }
  if (!TOKEN_KEY || !/^[a-f0-9]{64}$/i.test(TOKEN_KEY)) {
    return 'GOOGLE_TOKEN_ENCRYPTION_KEY ausente ou inválida';
  }
  return null;
}

function authorizationUrl(state) {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: CALLBACK_URL,
    response_type: 'code',
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES.join(' '),
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

function createState(userId) {
  return jwt.sign({ purpose: 'google-calendar', userId }, STATE_SECRET, { expiresIn: '10m' });
}

function readState(state) {
  const data = jwt.verify(state, STATE_SECRET);
  if (data.purpose !== 'google-calendar' || !Number.isInteger(data.userId)) throw new Error('Estado OAuth inválido');
  return data;
}

function encrypt(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(TOKEN_KEY, 'hex'), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return `${iv.toString('hex')}.${cipher.getAuthTag().toString('hex')}.${encrypted.toString('hex')}`;
}

function decrypt(value) {
  const [ivHex, tagHex, encryptedHex] = value.split('.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(TOKEN_KEY, 'hex'), Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return Buffer.concat([decipher.update(Buffer.from(encryptedHex, 'hex')), decipher.final()]).toString('utf8');
}

// Código de uso único da conexão pendente: vai em claro para o front (na URL
// de retorno) e fica no banco só como hash.
function novoCodigo() {
  const codigo = crypto.randomBytes(32).toString('hex');
  return { codigo, hash: hashCodigo(codigo) };
}

function hashCodigo(codigo) {
  return crypto.createHash('sha256').update(String(codigo)).digest('hex');
}

async function exchangeCode(code) {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: CALLBACK_URL,
      grant_type: 'authorization_code',
    }),
    signal: AbortSignal.timeout(GOOGLE_TIMEOUT_MS),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.refresh_token) throw new Error('Google não devolveu um refresh token');
  return data;
}

// O Google recusou o refresh token (o usuário revogou o acesso, por exemplo):
// a conexão guardada não serve mais.
class AutorizacaoRevogada extends Error {
  constructor() {
    super('Autorização do Google revogada');
    this.name = 'AutorizacaoRevogada';
  }
}

// O sync passou do prazo total; repetir é seguro (ids fixos por dia).
class PrazoEsgotado extends Error {
  constructor() {
    super('A sincronização demorou demais');
    this.name = 'PrazoEsgotado';
  }
}

// Junta o timeout por chamada com o prazo total do sync, se houver.
function sinal(prazo) {
  const porChamada = AbortSignal.timeout(GOOGLE_TIMEOUT_MS);
  return prazo ? AbortSignal.any([porChamada, prazo]) : porChamada;
}

async function accessToken(refreshToken, prazo) {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      grant_type: 'refresh_token',
    }),
    signal: sinal(prazo),
  });
  const data = await response.json().catch(() => null);
  if (response.status === 400 && data?.error === 'invalid_grant') throw new AutorizacaoRevogada();
  if (!response.ok || !data?.access_token) throw new Error('Não foi possível renovar a autorização do Google');
  return data.access_token;
}

// Revoga a autorização no Google. Melhor esforço: quem chama não deve falhar
// por causa disso (o token pode já estar revogado ou expirado).
async function revokeToken(token) {
  try {
    const response = await fetch('https://oauth2.googleapis.com/revoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token }),
      signal: AbortSignal.timeout(GOOGLE_TIMEOUT_MS),
    });
    return response.ok;
  } catch {
    return false;
  }
}

class GoogleCalendarError extends Error {
  constructor(status, message) {
    super(message || 'Google Calendar recusou a operação');
    this.name = 'GoogleCalendarError';
    this.status = status;
  }
}

// Recebe o access token já renovado: uma sincronização pede um só ao Google.
// Erros carregam o status HTTP em `error.status` para quem chama decidir
// (409 = id já existe, 404/410 = evento não existe mais).
// `options.prazo` (AbortSignal) é o prazo total do sync, quando houver.
async function calendarRequest(token, path, options = {}) {
  const { prazo, ...init } = options;
  const response = await fetch(`${CALENDAR_API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...init.headers },
    signal: sinal(prazo),
  });
  const data = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) throw new GoogleCalendarError(response.status, data?.error?.message);
  return data;
}

// --- validação do corpo do sync -------------------------------------------

const DIA_RE = /^\d{4}-\d{2}-\d{2}$/;
const DATA_HORA_RE = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})$/;
const FUSO_RE = /^[A-Za-z][A-Za-z0-9_+-]*(\/[A-Za-z0-9_+-]+){0,2}$/;

// 'YYYY-MM-DD' -> ms UTC da meia-noite, ou null se a data não existe.
function diaParaMs(dia) {
  if (typeof dia !== 'string' || !DIA_RE.test(dia)) return null;
  const [y, m, d] = dia.split('-').map(Number);
  const ms = Date.UTC(y, m - 1, d);
  const data = new Date(ms);
  if (data.getUTCFullYear() !== y || data.getUTCMonth() !== m - 1 || data.getUTCDate() !== d) return null;
  return ms;
}

function msParaDia(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

function dataHoraValida(valor) {
  if (typeof valor !== 'string') return false;
  const m = DATA_HORA_RE.exec(valor);
  if (!m || diaParaMs(m[1]) === null) return false;
  return Number(m[2]) <= 23 && Number(m[3]) <= 59 && Number(m[4]) <= 59;
}

function fusoValido(tz) {
  if (typeof tz !== 'string' || tz.length > 64 || !FUSO_RE.test(tz)) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function eventId(dia) {
  return `${EVENT_ID_PREFIX}${dia.replace(/-/g, '')}`;
}

function diasDoIntervalo(de, ate) {
  const dias = [];
  for (let ms = diaParaMs(de); ms <= diaParaMs(ate); ms += 86400000) dias.push(msParaDia(ms));
  return dias;
}

// Devolve { erro } ou { eventos, dias } já normalizados.
function validarSync(body) {
  const intervalo = body?.intervalo;
  const deMs = diaParaMs(intervalo?.de);
  const ateMs = diaParaMs(intervalo?.ate);
  if (deMs === null || ateMs === null || ateMs < deMs) return { erro: 'Intervalo inválido' };
  if ((ateMs - deMs) / 86400000 + 1 > MAX_DIAS) return { erro: `Intervalo maior que ${MAX_DIAS} dias` };

  const events = body?.events;
  if (!Array.isArray(events) || events.length > MAX_DIAS) return { erro: 'Lista de eventos inválida' };

  const vistos = new Set();
  const eventos = [];
  for (const ev of events) {
    if (!ev || typeof ev !== 'object') return { erro: 'Evento inválido' };
    const diaMs = diaParaMs(ev.dia);
    if (diaMs === null || diaMs < deMs || diaMs > ateMs) return { erro: 'Dia do evento fora do intervalo' };
    if (vistos.has(ev.dia)) return { erro: 'Mais de um evento no mesmo dia' };
    vistos.add(ev.dia);

    if (typeof ev.summary !== 'string' || !ev.summary.trim() || ev.summary.length > 200) {
      return { erro: 'Título do evento inválido' };
    }
    if (ev.description !== undefined && ev.description !== null
      && (typeof ev.description !== 'string' || ev.description.length > 2000)) {
      return { erro: 'Descrição do evento inválida' };
    }
    if (!dataHoraValida(ev.start) || !dataHoraValida(ev.end)) return { erro: 'Horário do evento inválido' };
    if (ev.start.slice(0, 10) !== ev.dia) return { erro: 'Início do evento fora do dia' };
    // Mesmo formato fixo: a comparação de strings é cronológica.
    if (ev.end <= ev.start) return { erro: 'Fim do evento deve ser depois do início' };
    const timeZone = ev.timeZone === undefined ? 'America/Sao_Paulo' : ev.timeZone;
    if (!fusoValido(timeZone)) return { erro: 'Fuso horário inválido' };

    eventos.push({
      id: eventId(ev.dia),
      dia: ev.dia,
      body: {
        summary: ev.summary,
        description: ev.description || DESCRICAO_PADRAO,
        start: { dateTime: ev.start, timeZone },
        end: { dateTime: ev.end, timeZone },
      },
    });
  }

  return { eventos, dias: diasDoIntervalo(intervalo.de, intervalo.ate) };
}

// Executa `fn` sobre `itens` com no máximo `limite` em paralelo. Esgotado o
// `prazo`, não dispara mais nenhuma chamada.
async function emParalelo(itens, limite, prazo, fn) {
  const resultados = new Array(itens.length);
  let proximo = 0;
  async function trabalhador() {
    while (proximo < itens.length) {
      if (prazo.aborted) throw new PrazoEsgotado();
      const i = proximo++;
      resultados[i] = await fn(itens[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limite, itens.length) }, trabalhador));
  return resultados;
}

// Sincroniza um intervalo: cria/atualiza um evento por dia com evento e apaga
// o evento dos dias sem evento. Ids fixos por dia tornam a operação idempotente.
async function sincronizar({ refreshToken, calendarId, eventos, dias }) {
  const prazo = AbortSignal.timeout(SYNC_DEADLINE_MS);
  try {
    return await sincronizarComPrazo({ refreshToken, calendarId, eventos, dias, prazo });
  } catch (error) {
    // Chamada abortada pelo prazo total vira um erro só, claro.
    if (prazo.aborted && !(error instanceof AutorizacaoRevogada)) throw new PrazoEsgotado();
    throw error;
  }
}

async function sincronizarComPrazo({ refreshToken, calendarId, eventos, dias, prazo }) {
  const token = await accessToken(refreshToken, prazo);
  const base = `/calendars/${encodeURIComponent(calendarId)}/events`;

  await emParalelo(eventos, 4, prazo, async (ev) => {
    try {
      await calendarRequest(token, base, { method: 'POST', body: JSON.stringify({ id: ev.id, ...ev.body }), prazo });
    } catch (error) {
      if (error.status !== 409) throw error;
      if (prazo.aborted) throw new PrazoEsgotado();
      // Id já existe (inclusive evento apagado antes, que fica "cancelled"):
      // substitui o conteúdo e reativa.
      await calendarRequest(token, `${base}/${encodeURIComponent(ev.id)}`, {
        method: 'PUT',
        body: JSON.stringify({ ...ev.body, status: 'confirmed' }),
        prazo,
      });
    }
  });

  const comEvento = new Set(eventos.map((ev) => ev.dia));
  const sobras = dias.filter((dia) => !comEvento.has(dia));
  const apagados = await emParalelo(sobras, 4, prazo, async (dia) => {
    try {
      await calendarRequest(token, `${base}/${encodeURIComponent(eventId(dia))}`, { method: 'DELETE', prazo });
      return true;
    } catch (error) {
      if (error.status === 404 || error.status === 410) return false;
      throw error;
    }
  });

  return { sincronizados: eventos.length, removidos: apagados.filter(Boolean).length };
}

function callbackUrl(status, extra = {}) {
  const params = new URLSearchParams({ calendar: status, ...extra });
  return `${FRONTEND_BASE_URL}/?${params}`;
}

module.exports = {
  configError,
  authorizationUrl,
  createState,
  readState,
  encrypt,
  decrypt,
  novoCodigo,
  hashCodigo,
  exchangeCode,
  accessToken,
  revokeToken,
  calendarRequest,
  GoogleCalendarError,
  AutorizacaoRevogada,
  PrazoEsgotado,
  validarSync,
  sincronizar,
  eventId,
  callbackUrl,
  DESCRICAO_PADRAO,
};
