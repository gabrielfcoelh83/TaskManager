// api/_lib/auth.js
//
// Exige um JWT válido antes de rotas que chamam serviço externo com cota
// (DATAJUD hoje; Gemini, via _lib/ia.js, quando o chat existir). Sem isto,
// qualquer um na internet podia chamar essas rotas e gastar a cota — a chave
// gratuita do Gemini tem cota diária por modelo — sem estar logado.
//
// Verifica contra o gateway (POST /api/auth/verify -> auth-service /verify)
// em vez de reimplementar jwt.verify aqui: evita duplicar JWT_SECRET numa
// segunda plataforma (Vercel) e mantém um único lugar de verdade sobre o
// que é um token válido — se o auth-service um dia ganhar revogação, esta
// checagem já herda o comportamento sem mudar nada aqui.

import axios from 'axios';

// Só o deploy de produção da Vercel pode cair na API de produção sem
// VITE_API_URL. Preview, dev-api local e CI caem no gateway local: antes o
// padrão era sempre api.mlkoab.tech, e um Preview sem a variável validava
// tokens contra produção sem ninguém perceber.
const API_URL =
  process.env.VITE_API_URL ||
  (process.env.VERCEL_ENV === 'production'
    ? 'https://api.mlkoab.tech'
    : 'http://localhost:3000');

export async function exigirAutenticacao(req, res) {
  const token = req.headers.authorization;
  if (!token) {
    res.status(401).json({ error: 'Token não fornecido' });
    return false;
  }

  try {
    await axios.post(
      `${API_URL}/api/auth/verify`,
      {},
      { headers: { authorization: token }, timeout: 5000 }
    );
    return true;
  } catch {
    res.status(401).json({ error: 'Token inválido ou expirado' });
    return false;
  }
}
