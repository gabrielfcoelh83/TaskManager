const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const FRONTEND_BASE_URL = process.env.FRONTEND_BASE_URL || 'https://mlkoab.tech';
const CALLBACK_URL = process.env.GOOGLE_CALENDAR_REDIRECT_URI
  || 'https://api.mlkoab.tech/api/calendar/google/callback';
const SCOPES = ['https://www.googleapis.com/auth/calendar.events'];
const STATE_SECRET = process.env.JWT_SECRET;
const TOKEN_KEY = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY;

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
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.refresh_token) throw new Error('Google não devolveu um refresh token');
  return data;
}

async function accessToken(refreshToken) {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      grant_type: 'refresh_token',
    }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.access_token) throw new Error('Não foi possível renovar a autorização do Google');
  return data.access_token;
}

async function calendarRequest(refreshToken, path, options = {}) {
  const token = await accessToken(refreshToken);
  const response = await fetch(`https://www.googleapis.com/calendar/v3${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...options.headers },
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error?.message || 'Google Calendar recusou a operação');
  return data;
}

function callbackUrl(status) {
  return `${FRONTEND_BASE_URL}/?calendar=${encodeURIComponent(status)}`;
}

module.exports = {
  configError,
  authorizationUrl,
  createState,
  readState,
  encrypt,
  decrypt,
  exchangeCode,
  calendarRequest,
  callbackUrl,
};
