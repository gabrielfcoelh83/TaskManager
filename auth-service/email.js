const crypto = require('crypto');

const EMAIL_FROM = process.env.EMAIL_FROM || 'noreply@api.mlkoab.tech';
const APP_BASE_URL = process.env.APP_BASE_URL || 'https://api.mlkoab.tech';

function criarToken() {
  const token = crypto.randomBytes(32).toString('hex');
  return { token, hash: crypto.createHash('sha256').update(token).digest('hex') };
}

async function enviarEmail({ email, token, subject, html, enviar = fetch }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error('RESEND_API_KEY ausente');

  const response = await enviar('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: ['Bearer', apiKey].join(' '),
    },
    body: JSON.stringify({ from: EMAIL_FROM, to: [email], subject, html }),
  });

  if (!response.ok) {
    const detalhe = await response.text().catch(() => '');
    throw new Error(`Resend rejeitou o e-mail (${response.status}): ${detalhe.slice(0, 200)}`);
  }
}

function enviarConfirmacao({ email, token, enviar }) {
  const url = `${APP_BASE_URL}/api/auth/verify-email?token=${encodeURIComponent(token)}`;
  return enviarEmail({
    email,
    token,
    enviar,
    subject: 'Confirme seu acesso ao MA Questões',
    html: `<p>Confirme seu e-mail para ativar seu acesso ao MA Questões.</p><p><a href="${url}">Confirmar e-mail</a></p><p>O link expira em 24 horas.</p>`,
  });
}

function enviarRedefinicaoSenha({ email, token, enviar }) {
  const url = `${APP_BASE_URL}/reset-password?token=${encodeURIComponent(token)}`;
  return enviarEmail({
    email,
    token,
    enviar,
    subject: 'Redefina sua senha no MA Questões',
    html: `<p>Recebemos uma solicitação para redefinir sua senha.</p><p><a href="${url}">Criar nova senha</a></p><p>O link expira em 1 hora e só pode ser usado uma vez.</p>`,
  });
}

module.exports = { criarToken, enviarConfirmacao, enviarRedefinicaoSenha };
