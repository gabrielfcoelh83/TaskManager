// api/enriquecer-questao.js
//
// Rota serverless (Vercel): POST { questao } -> enriquece com jurisprudência
// real do DATAJUD (CNJ). Falha de rede/timeout é graciosa: retorna
// jurisprudência vazia e enriquecimento null, nunca erro 5xx por causa do DATAJUD.

import {
  buscarJurisprudencia,
  gerarTextoEnriquecimento,
} from './_lib/datajud.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  const { questao } = req.body || {};

  if (!questao) {
    return res.status(400).json({ error: 'Parâmetro "questao" obrigatório' });
  }

  // Deriva o tema: usa o tópico da questão ou as primeiras palavras do enunciado.
  const tema =
    questao.topico ||
    (typeof questao.enunciado === 'string'
      ? questao.enunciado.split(' ').slice(0, 5).join(' ')
      : '');

  const tribunal = questao.tribunal || 'STJ';

  console.log(`[API/enriquecer] Enriquecendo questão sobre: ${tema}`);

  // buscarJurisprudencia é graciosa e nunca lança.
  const jurisprudencia = await buscarJurisprudencia(tema, tribunal);
  const textoEnriquecimento = gerarTextoEnriquecimento(jurisprudencia);

  return res.status(200).json({
    sucesso: true,
    questao_id: questao.id || null,
    jurisprudencia,
    enriquecimento: {
      texto: textoEnriquecimento,
      total_precedentes: jurisprudencia.total,
      tendencia: jurisprudencia.tendencia,
    },
  });
}
