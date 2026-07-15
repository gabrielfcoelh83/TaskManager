// api/gerar-questoes.js
//
// Rota serverless (Vercel): POST { tema, quantidade=5, disciplina }.
// Gera questões de OAB via OpenRouter com fallback sequencial de modelos
// gratuitos (Qwen -> Llama -> Gemini). Em 429/503/401/erro tenta o próximo
// modelo; se todos falharem responde 503 com mensagem clara (sem stack trace).
//
// Cada questão é enriquecida com jurisprudência do DATAJUD chamando a função
// compartilhada DIRETAMENTE (import de ./_lib/datajud.js) — NUNCA via fetch a
// localhost, que quebra em ambiente serverless.

import axios from 'axios';
import {
  buscarJurisprudencia,
  gerarTextoEnriquecimento,
} from './_lib/datajud.js';

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

// Modelos gratuitos em ordem de preferência (fallback automático).
const MODELOS = [
  'qwen/qwen-3-coder:free',
  'meta/llama-4-maverick:free',
  'google/gemini-2.0-flash:free',
];

const PROMPT_SISTEMA = `Você é professor especializado em Direito para OAB.
Gere questões de múltipla escolha em JSON puro, sem markdown, sem comentários.
RESPONDA APENAS COM JSON VÁLIDO.`;

function idUnico() {
  return `q-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  const { tema, quantidade = 5, disciplina = 'Direito Constitucional' } =
    req.body || {};

  if (!tema) {
    return res.status(400).json({ error: 'Parâmetro "tema" obrigatório' });
  }

  console.log(`[API/gerar] Gerando ${quantidade} questões sobre: ${tema}`);

  const mensagem = `Gere ${quantidade} questões múltipla escolha sobre "${tema}" em ${disciplina}.

Responda APENAS com JSON (nenhum texto extra):
[
  {
    "numero": 1,
    "enunciado": "...",
    "alternativas": [
      { "letra": "a", "texto": "..." },
      { "letra": "b", "texto": "..." },
      { "letra": "c", "texto": "..." },
      { "letra": "d", "texto": "..." }
    ],
    "gabarito": "c",
    "explicacao": "...",
    "referencias": ["CF/88 Art. 5º"]
  }
]`;

  let resposta = null;
  let modeloUsado = null;

  // Fallback sequencial. Qualquer falha (429/503/401/timeout/rede) -> próximo modelo.
  for (const modelo of MODELOS) {
    try {
      console.log(`[API/gerar] Tentando modelo: ${modelo}`);

      resposta = await axios.post(
        OPENROUTER_URL,
        {
          model: modelo,
          messages: [
            { role: 'system', content: PROMPT_SISTEMA },
            { role: 'user', content: mensagem },
          ],
          temperature: 0.7,
          max_tokens: 2048,
          top_p: 0.9,
        },
        {
          headers: {
            Authorization: `Bearer ${OPENROUTER_API_KEY}`,
            'HTTP-Referer': 'http://localhost:3000',
            'X-Title': 'MA Questoes',
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        }
      );

      modeloUsado = modelo;
      console.log(`[API/gerar] Sucesso com ${modelo}`);
      break;
    } catch (erro) {
      const status = erro?.response?.status;
      if (status === 429 || status === 503) {
        console.log(`[API/gerar] ${modelo}: rate limit/indisponível (${status}), próximo...`);
      } else if (status === 401 || status === 403) {
        console.log(`[API/gerar] ${modelo}: auth inválida (${status}), próximo...`);
      } else {
        console.error(`[API/gerar] ${modelo}: erro (${status || erro.code || erro.message}), próximo...`);
      }
      // segue para o próximo modelo
    }
  }

  // Todos os modelos falharam (inclui key placeholder / 401).
  if (!resposta) {
    return res.status(503).json({
      error:
        'Não foi possível gerar questões no momento: todos os modelos de IA estão indisponíveis ou a chave da OpenRouter é inválida. Verifique OPENROUTER_API_KEY e tente novamente em alguns minutos.',
    });
  }

  // Parse do conteúdo (limpando fences ```json).
  const conteudo = resposta?.data?.choices?.[0]?.message?.content ?? '';
  let questoes;
  try {
    const jsonLimpo = conteudo
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();

    questoes = JSON.parse(jsonLimpo);
    if (!Array.isArray(questoes)) questoes = [questoes];
  } catch (erro) {
    console.error('[API/gerar] Falha ao parsear JSON:', erro.message);
    return res.status(502).json({
      error: 'A IA retornou uma resposta em formato inválido. Tente novamente.',
      debug: String(conteudo).slice(0, 200),
    });
  }

  // Enriquecer metadados de cada questão.
  const dataGeracao = new Date().toISOString();
  questoes = questoes.map((q) => ({
    ...q,
    id: idUnico(),
    disciplina,
    topico: tema,
    fonte: 'openrouter-ia-gerada',
    modelo_usado: modeloUsado,
    data_geracao: dataGeracao,
  }));

  // Enriquecer com DATAJUD (direto, sem fetch a localhost). Falha é graciosa
  // e NUNCA bloqueia o retorno das questões.
  for (const q of questoes) {
    try {
      const jurisprudencia = await buscarJurisprudencia(
        q.topico || tema,
        'STJ'
      );
      const texto = gerarTextoEnriquecimento(jurisprudencia);
      if (texto) {
        q.explicacao = `${q.explicacao || ''}\n\n${texto}`.trim();
      }
      q.datajud = {
        total_precedentes: jurisprudencia.total,
        tendencia: jurisprudencia.tendencia,
      };
    } catch (erro) {
      console.warn('[API/gerar] DATAJUD ignorado:', erro.message);
      q.datajud = { total_precedentes: 0, tendencia: null };
    }
  }

  return res.status(200).json({
    sucesso: true,
    questoes_geradas: questoes.length,
    modelo: modeloUsado,
    questoes,
  });
}
