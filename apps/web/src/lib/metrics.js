// src/lib/metrics.js
//
// Camada de MÉTRICAS (local-first). Funções PURAS que derivam os indicadores
// do Dashboard a partir dos dados reais já coletados pelo app:
//   - usuarioTentativas: { [questaoId]: { tentativas: [ {data, correta, tempo_gasto_segundos, ...} ], desempenho } }
//   - resultadosHistorico: [ { disciplina, quantidade, acertos, errados, nota_final, tempo_total_minutos, data_conclusao, ... } ]
//   - questoes: banco de questões (para mapear questaoId -> disciplina)
//   - config: { meta, dataProva, ... }
//
// IMPORTANTE (arquitetura): estas funções são a "fonte da verdade" das métricas.
// Hoje leem do localStorage; no Tier 1 (cloud) a MESMA interface passa a ser
// alimentada por queries SQL/Supabase — a UI do Dashboard não muda.

// ---------------------------------------------------------------------------
// Helpers de data
// ---------------------------------------------------------------------------

/** 'YYYY-MM-DD' no fuso local a partir de um ISO ou Date. */
export function dateKey(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Diferença em dias inteiros entre duas chaves 'YYYY-MM-DD' (a - b). */
function diffDays(aKey, bKey) {
  const a = new Date(aKey + 'T00:00:00');
  const b = new Date(bKey + 'T00:00:00');
  return Math.round((a - b) / 86400000);
}

// ---------------------------------------------------------------------------
// Normalização: achatar todas as tentativas em uma lista única
// ---------------------------------------------------------------------------

/**
 * Constrói um índice questaoId -> disciplina a partir do banco de questões.
 * IDs desconhecidos (ex.: questões geradas por IA fora do mock) caem em 'Outras'.
 */
function indexDisciplinas(questoes = []) {
  const idx = {};
  for (const q of questoes) idx[q.id] = q.disciplina || 'Outras';
  return idx;
}

/**
 * Lista achatada de todas as tentativas de questões (prática).
 * Cada item: { questaoId, disciplina, correta, data, dia, tempo }
 */
export function flattenTentativas(usuarioTentativas = {}, questoes = []) {
  const discPorId = indexDisciplinas(questoes);
  const out = [];
  for (const [qId, registro] of Object.entries(usuarioTentativas)) {
    const disciplina = discPorId[qId] || discPorId[Number(qId)] || 'Outras';
    for (const t of registro.tentativas || []) {
      out.push({
        questaoId: qId,
        disciplina,
        correta: t.correta === true,
        data: t.data || null,
        dia: t.data ? dateKey(t.data) : null,
        tempo: t.tempo_gasto_segundos ?? null,
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// 1) Taxa de acertos (consolidada: prática + simulados)
// ---------------------------------------------------------------------------

export function taxaDeAcertos(usuarioTentativas = {}, resultadosHistorico = [], questoes = []) {
  const tentativas = flattenTentativas(usuarioTentativas, questoes);
  let acertos = tentativas.filter((t) => t.correta).length;
  let total = tentativas.length;

  for (const r of resultadosHistorico) {
    acertos += r.acertos || 0;
    total += r.quantidade || 0;
  }

  return {
    acertos,
    total,
    pct: total > 0 ? Math.round((acertos / total) * 100) : null, // null = sem dados
  };
}

// ---------------------------------------------------------------------------
// 2) Sequência atual (streak de dias consecutivos com atividade)
// ---------------------------------------------------------------------------

/**
 * Considera "atividade" qualquer tentativa de questão OU simulado concluído no dia.
 * Regra: conta dias consecutivos terminando no dia de atividade mais recente.
 * O streak só é "atual" se a última atividade foi hoje ou ontem (tolerância de 1 dia
 * para não zerar durante o dia). Caso contrário, retorna 0.
 */
export function sequenciaAtual(usuarioTentativas = {}, resultadosHistorico = [], hoje = new Date()) {
  const dias = new Set();
  for (const t of flattenTentativas(usuarioTentativas)) {
    if (t.dia) dias.add(t.dia);
  }
  for (const r of resultadosHistorico) {
    const k = r.data_conclusao ? dateKey(r.data_conclusao) : null;
    if (k) dias.add(k);
  }
  if (dias.size === 0) return { dias: 0, ultimaAtividade: null };

  const ordenados = [...dias].sort(); // asc
  const maisRecente = ordenados[ordenados.length - 1];
  const hojeKey = dateKey(hoje);
  const gap = diffDays(hojeKey, maisRecente); // dias desde a última atividade

  if (gap > 1) return { dias: 0, ultimaAtividade: maisRecente };

  // Conta para trás a partir do dia mais recente
  let streak = 1;
  for (let i = ordenados.length - 1; i > 0; i--) {
    if (diffDays(ordenados[i], ordenados[i - 1]) === 1) streak++;
    else break;
  }
  return { dias: streak, ultimaAtividade: maisRecente };
}

// ---------------------------------------------------------------------------
// 3) Meta diária (definida pelo usuário) + progresso de hoje
// ---------------------------------------------------------------------------

export function metaDiaria(config = {}, usuarioTentativas = {}, resultadosHistorico = [], hoje = new Date()) {
  const meta = Number(config.meta) > 0 ? Number(config.meta) : 20;
  const hojeKey = dateKey(hoje);

  let respondidas = 0;
  for (const t of flattenTentativas(usuarioTentativas)) {
    if (t.dia === hojeKey) respondidas++;
  }
  for (const r of resultadosHistorico) {
    if (r.data_conclusao && dateKey(r.data_conclusao) === hojeKey) respondidas += r.quantidade || 0;
  }

  const faltam = Math.max(0, meta - respondidas);
  return {
    meta,
    respondidas,
    faltam,
    pct: meta > 0 ? Math.min(100, Math.round((respondidas / meta) * 100)) : 0,
    batida: respondidas >= meta,
  };
}

// ---------------------------------------------------------------------------
// 4) Desempenho geral por simulado (com dados para hover)
// ---------------------------------------------------------------------------

/**
 * Agrupa o histórico de simulados por nome (tipo de simulado).
 * Retorna, por simulado: taxa média, acertos/erros totais, tentativas, última data e tempo médio.
 */
export function desempenhoPorSimulado(resultadosHistorico = []) {
  const grupos = {};
  for (const r of resultadosHistorico) {
    const chave = r.nome || r.disciplina || 'Simulado';
    if (!grupos[chave]) {
      grupos[chave] = {
        nome: chave,
        disciplina: r.disciplina || null,
        tentativas: 0,
        acertos: 0,
        erros: 0,
        questoes: 0,
        somaTempo: 0,
        ultima: null,
      };
    }
    const g = grupos[chave];
    g.tentativas += 1;
    g.acertos += r.acertos || 0;
    g.erros += r.errados ?? Math.max(0, (r.quantidade || 0) - (r.acertos || 0));
    g.questoes += r.quantidade || 0;
    g.somaTempo += r.tempo_total_minutos || 0;
    if (!g.ultima || (r.data_conclusao && r.data_conclusao > g.ultima)) g.ultima = r.data_conclusao || g.ultima;
  }

  return Object.values(grupos)
    .map((g) => ({
      ...g,
      pct: g.questoes > 0 ? Math.round((g.acertos / g.questoes) * 100) : 0,
      tempoMedioMin: g.tentativas > 0 ? Math.round(g.somaTempo / g.tentativas) : 0,
    }))
    .sort((a, b) => (b.ultima || '').localeCompare(a.ultima || ''));
}

/** Resumo agregado de todos os simulados (para os cards Acertos/Erros/%). */
export function resumoSimulados(resultadosHistorico = []) {
  let acertos = 0, erros = 0, questoes = 0;
  for (const r of resultadosHistorico) {
    acertos += r.acertos || 0;
    questoes += r.quantidade || 0;
    erros += r.errados ?? Math.max(0, (r.quantidade || 0) - (r.acertos || 0));
  }
  return {
    acertos,
    erros,
    questoes,
    pct: questoes > 0 ? Math.round((acertos / questoes) * 100) : null,
    // série = nota_final de cada simulado em ordem cronológica (para sparkline)
    serie: [...resultadosHistorico]
      .sort((a, b) => (a.data_conclusao || '').localeCompare(b.data_conclusao || ''))
      .map((r) => r.nota_final || 0),
  };
}

// ---------------------------------------------------------------------------
// Base compartilhada: estatísticas por disciplina (prática)
// ---------------------------------------------------------------------------

export function porDisciplina(usuarioTentativas = {}, questoes = []) {
  const mapa = {};
  for (const t of flattenTentativas(usuarioTentativas, questoes)) {
    if (!mapa[t.disciplina]) mapa[t.disciplina] = { disciplina: t.disciplina, respondidas: 0, acertos: 0, somaTempo: 0 };
    const m = mapa[t.disciplina];
    m.respondidas += 1;
    if (t.correta) m.acertos += 1;
    if (t.tempo != null) m.somaTempo += t.tempo;
  }
  return Object.values(mapa).map((m) => ({
    ...m,
    pct: m.respondidas > 0 ? Math.round((m.acertos / m.respondidas) * 100) : 0,
    status: statusDesempenho(m.respondidas, m.acertos),
  }));
}

function statusDesempenho(respondidas, acertos) {
  if (respondidas === 0) return 'novo';
  const r = acertos / respondidas;
  if (r >= 0.8) return 'domina';
  if (r >= 0.5) return 'em-desenvolvimento';
  return 'necessita';
}

// ---------------------------------------------------------------------------
// 5) Matérias mais estudadas (top N por volume)
// ---------------------------------------------------------------------------

export function materiasMaisEstudadas(usuarioTentativas = {}, questoes = [], limite = 3) {
  return porDisciplina(usuarioTentativas, questoes)
    .sort((a, b) => b.respondidas - a.respondidas)
    .slice(0, limite);
}

// ---------------------------------------------------------------------------
// 6) Menor desempenho (piores taxas, exigindo volume mínimo)
// ---------------------------------------------------------------------------

export function menorDesempenho(usuarioTentativas = {}, questoes = [], limite = 3, minRespondidas = 1) {
  return porDisciplina(usuarioTentativas, questoes)
    .filter((d) => d.respondidas >= minRespondidas)
    .sort((a, b) => a.pct - b.pct)
    .slice(0, limite);
}

// ---------------------------------------------------------------------------
// 7) Evolução dos estudos — Opção C: por disciplina, ao longo do tempo
// ---------------------------------------------------------------------------

/**
 * Para cada disciplina, calcula a taxa de acerto por semana (últimas `semanas`)
 * e a variação (delta) entre a primeira e a última semana com dados.
 * Retorna as disciplinas ordenadas por volume total.
 */
export function evolucaoPorDisciplina(usuarioTentativas = {}, questoes = [], semanas = 6, hoje = new Date()) {
  const tentativas = flattenTentativas(usuarioTentativas, questoes).filter((t) => t.dia);
  if (tentativas.length === 0) return [];

  // Limite inferior da janela (semanas * 7 dias atrás)
  const hojeKey = dateKey(hoje);
  const bucketDe = (dia) => {
    const dias = diffDays(hojeKey, dia);           // 0 = hoje
    const semanaAtras = Math.floor(dias / 7);      // 0 = semana atual
    return semanas - 1 - semanaAtras;              // índice 0..semanas-1 (crescente no tempo)
  };

  const porDisc = {};
  for (const t of tentativas) {
    const b = bucketDe(t.dia);
    if (b < 0 || b > semanas - 1) continue;
    if (!porDisc[t.disciplina]) {
      porDisc[t.disciplina] = {
        disciplina: t.disciplina,
        total: 0,
        buckets: Array.from({ length: semanas }, () => ({ acertos: 0, total: 0 })),
      };
    }
    const d = porDisc[t.disciplina];
    d.total += 1;
    d.buckets[b].total += 1;
    if (t.correta) d.buckets[b].acertos += 1;
  }

  return Object.values(porDisc)
    .map((d) => {
      const pontos = d.buckets.map((b) => (b.total > 0 ? Math.round((b.acertos / b.total) * 100) : null));
      const comDados = pontos.filter((p) => p != null);
      const delta =
        comDados.length >= 2 ? comDados[comDados.length - 1] - comDados[0] : null;
      return {
        disciplina: d.disciplina,
        total: d.total,
        pontos,                                   // taxa por semana (null onde não houve atividade)
        pontosPreenchidos: pontos.map((p) => p ?? 0), // para sparkline
        taxaAtual: comDados.length ? comDados[comDados.length - 1] : null,
        delta,                                    // variação percentual (pp) no período
      };
    })
    .sort((a, b) => b.total - a.total);
}

// ---------------------------------------------------------------------------
// 8) Desempenho completo — Opção A: tabela de TODAS as disciplinas
// ---------------------------------------------------------------------------

/**
 * Tabela completa. Inclui disciplinas sem atividade (status 'novo') quando
 * `disciplinasBase` é fornecido (ex.: nomes vindos do mock/catálogo).
 */
export function desempenhoCompleto(usuarioTentativas = {}, questoes = [], disciplinasBase = []) {
  const stats = {};
  for (const d of porDisciplina(usuarioTentativas, questoes)) stats[d.disciplina] = d;

  // Garante que disciplinas do catálogo apareçam mesmo sem atividade
  for (const nome of disciplinasBase) {
    if (!stats[nome]) {
      stats[nome] = { disciplina: nome, respondidas: 0, acertos: 0, somaTempo: 0, pct: 0, status: 'novo' };
    }
  }

  return Object.values(stats).sort((a, b) => b.pct - a.pct || b.respondidas - a.respondidas);
}

// ---------------------------------------------------------------------------
// 9) Dias até a prova (topbar) + progresso do cronograma
// ---------------------------------------------------------------------------

export function diasAteProva(config = {}, hoje = new Date()) {
  if (!config.dataProva) return null;
  const gap = diffDays(dateKey(config.dataProva), dateKey(hoje));
  return gap >= 0 ? gap : 0;
}

// ---------------------------------------------------------------------------
// Agregador: monta TODAS as métricas do Dashboard de uma vez
// ---------------------------------------------------------------------------

export function computeDashboard({ usuarioTentativas = {}, resultadosHistorico = [], questoes = [], disciplinasBase = [], config = {}, hoje = new Date() } = {}) {
  return {
    taxaAcertos: taxaDeAcertos(usuarioTentativas, resultadosHistorico, questoes),
    sequencia: sequenciaAtual(usuarioTentativas, resultadosHistorico, hoje),
    meta: metaDiaria(config, usuarioTentativas, resultadosHistorico, hoje),
    simulados: {
      resumo: resumoSimulados(resultadosHistorico),
      porSimulado: desempenhoPorSimulado(resultadosHistorico),
    },
    materiasMaisEstudadas: materiasMaisEstudadas(usuarioTentativas, questoes),
    menorDesempenho: menorDesempenho(usuarioTentativas, questoes),
    evolucao: evolucaoPorDisciplina(usuarioTentativas, questoes, 6, hoje),
    desempenhoCompleto: desempenhoCompleto(usuarioTentativas, questoes, disciplinasBase),
    diasAteProva: diasAteProva(config, hoje),
  };
}
