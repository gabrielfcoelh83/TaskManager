// api/_lib/datajud.js
//
// Lógica compartilhada de busca de jurisprudência na API pública DATAJUD do CNJ.
// Prefixo "_" na pasta para a Vercel NÃO expor este arquivo como rota HTTP.
//
// A API pública do DATAJUD é um cluster Elasticsearch. Cada tribunal tem seu
// próprio índice (alias): api_publica_stj, api_publica_stf, api_publica_trf1, etc.
// A busca é um POST com query DSL do Elasticsearch e header:
//   Authorization: APIKey <chave pública documentada>
//
// Docs: https://datajud-wiki.cnj.jus.br/api-publica/acesso
//
// IMPORTANTE: toda falha (rede, timeout, auth, formato inesperado) é tratada de
// forma graciosa — retornamos jurisprudência VAZIA em vez de lançar erro, para
// nunca bloquear a geração de questões.

import axios from 'axios';

const DATAJUD_BASE = 'https://api-publica.datajud.cnj.jus.br';

// Chave pública documentada do DATAJUD (a mesma para todos — não é secreta).
// Pode ser sobrescrita por env var caso o CNJ rotacione a chave.
const DATAJUD_APIKEY =
  process.env.DATAJUD_APIKEY ||
  'cDZHYzJ5QUJSTUR1L1hjWTIrTS9hOFYzTGtaYzJ5QUJSTUR1L1hjWA==';

// Mapa de siglas de tribunal -> alias do índice Elasticsearch.
function aliasTribunal(tribunal = 'STJ') {
  const t = String(tribunal || 'STJ').trim().toLowerCase();
  return `api_publica_${t}`;
}

/**
 * Busca jurisprudência no DATAJUD por tema/assunto num tribunal.
 * Nunca lança: em qualquer falha retorna { total: 0, processos: [], ... , erro }.
 *
 * @param {string} tema - assunto a buscar (ex: "Responsabilidade Civil")
 * @param {string} tribunal - sigla do tribunal (default STJ)
 * @returns {Promise<{total:number, processos:Array, pct_procedentes:number, tendencia:object|null, erro?:string}>}
 */
export async function buscarJurisprudencia(tema, tribunal = 'STJ') {
  const vazio = (erro) => ({
    total: 0,
    processos: [],
    pct_procedentes: 0,
    tendencia: null,
    ...(erro ? { erro } : {}),
  });

  if (!tema || !String(tema).trim()) {
    return vazio('tema vazio');
  }

  const url = `${DATAJUD_BASE}/${aliasTribunal(tribunal)}/_search`;

  // Query DSL do Elasticsearch: busca textual no nome do assunto.
  const body = {
    size: 5,
    query: {
      match: {
        'assuntos.nome': String(tema).trim(),
      },
    },
  };

  try {
    console.log(`[DATAJUD] Buscando "${tema}" em ${tribunal}`);

    const response = await axios.post(url, body, {
      headers: {
        Authorization: `APIKey ${DATAJUD_APIKEY}`,
        'Content-Type': 'application/json',
      },
      timeout: 15000,
    });

    const hits = response?.data?.hits;
    // total pode vir como número (ES antigo) ou objeto { value } (ES novo).
    const total =
      typeof hits?.total === 'number'
        ? hits.total
        : hits?.total?.value ?? 0;

    const lista = Array.isArray(hits?.hits) ? hits.hits : [];
    const processos = lista.map((hit) => {
      const src = hit?._source || {};
      const movimentos = Array.isArray(src.movimentos) ? src.movimentos : [];
      const ultimo = movimentos[movimentos.length - 1] || {};
      return {
        numero: src.numeroProcesso || src.numero || hit?._id || null,
        data:
          src.dataAjuizamento ||
          src.dataRegistro ||
          src['@timestamp'] ||
          null,
        tribunal: src.tribunal || tribunal,
        assunto:
          (Array.isArray(src.assuntos) && src.assuntos[0]?.nome) ||
          src.assunto?.nome ||
          null,
        resultado: ultimo.nome || ultimo.resultado || null,
      };
    });

    const tendencia = calcularTendencia(processos);

    return {
      total,
      processos,
      pct_procedentes: tendencia ? tendencia.pct_procedentes : 0,
      tendencia,
    };
  } catch (erro) {
    // Graceful: rede/timeout/auth/404 -> jurisprudência vazia.
    const detalhe = erro?.response?.status
      ? `HTTP ${erro.response.status}`
      : erro?.code || erro?.message || 'erro desconhecido';
    console.error(`[DATAJUD] Falha graciosa (${detalhe})`);
    return vazio(detalhe);
  }
}

/**
 * Calcula a tendência (procedente/improcedente) a partir dos resultados.
 * @returns {object|null}
 */
export function calcularTendencia(processos) {
  if (!Array.isArray(processos) || processos.length === 0) return null;

  const procedentes = processos.filter((p) =>
    p?.resultado?.toLowerCase?.().includes('procedente')
  ).length;

  const pctProcedente = Math.round((procedentes / processos.length) * 100);

  return {
    total_analisados: processos.length,
    procedentes,
    improcedentes: processos.length - procedentes,
    pct_procedentes: pctProcedente,
    tendencia:
      pctProcedente >= 60
        ? 'Favorável'
        : pctProcedente <= 40
        ? 'Desfavorável'
        : 'Equilibrada',
  };
}

/**
 * Gera texto de enriquecimento para o gabarito a partir da jurisprudência.
 * @returns {string|null} - null quando não há precedentes.
 */
export function gerarTextoEnriquecimento(jurisprudencia) {
  if (!jurisprudencia || !jurisprudencia.total || jurisprudencia.total === 0) {
    return null;
  }

  const primeiro = jurisprudencia.processos?.[0];
  const siglaTribunal =
    (primeiro && (primeiro.tribunal?.sigla || primeiro.tribunal)) || 'STJ';

  let texto = `Conforme jurisprudência consolidada do ${siglaTribunal}, `;
  texto += `existem ${jurisprudencia.total} precedentes sobre este tema.`;

  if (jurisprudencia.tendencia) {
    texto += ` Tendência: ${jurisprudencia.tendencia.pct_procedentes}% procedentes.`;
  }

  if (primeiro?.numero) {
    const dataFmt = primeiro.data ? String(primeiro.data).split('T')[0] : null;
    texto += ` Precedente recente: ${primeiro.numero}${
      dataFmt ? ` (${dataFmt})` : ''
    }.`;
  }

  return texto;
}
