// api/buscar-datajud.js
//
// Rota serverless (Vercel) de teste do DATAJUD: POST { tema, tribunal }.
// Retorna o total de precedentes e uma amostra de processos. Falha graciosa.

import { buscarJurisprudencia } from './_lib/datajud.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  const { tema, tribunal = 'STJ' } = req.body || {};

  if (!tema) {
    return res.status(400).json({ error: 'Parâmetro "tema" obrigatório' });
  }

  const jurisprudencia = await buscarJurisprudencia(tema, tribunal);

  return res.status(200).json({
    tema,
    tribunal,
    total: jurisprudencia.total,
    processos: jurisprudencia.processos,
    tendencia: jurisprudencia.tendencia,
    ...(jurisprudencia.erro ? { aviso: jurisprudencia.erro } : {}),
  });
}
