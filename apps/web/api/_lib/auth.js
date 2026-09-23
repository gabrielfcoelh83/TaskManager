// api/_lib/auth.js
//
// Exige um JWT válido antes de rotas que chamam serviço pago/externo
// (OpenRouter, DATAJUD). Sem isto, qualquer um na internet podia chamar
// /api/gerar-questoes e gastar a cota da OpenRouter sem estar logado.
//
// Verifica contra o gateway (POST /api/auth/verify -> auth-service /verify)
// em vez de reimplementar jwt.verify aqui: evita duplicar JWT_SECRET numa
// segunda plataforma (Vercel) e mantém um único lugar de verdade sobre o
// que é um token válido — se o auth-service um dia ganhar revogação, esta
// checagem já herda o comportamento sem mudar nada aqui.

import axios from 'axios';

const API_URL = process.env.VITE_API_URL || 'https://api.mlkoab.tech';

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
