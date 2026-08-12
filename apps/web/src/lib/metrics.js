// src/lib/metrics.js
//
// Camada de MÉTRICAS. Funções PURAS que derivam os indicadores das telas a
// partir dos dados reais:
//   - usuarioTentativas: { [questaoId]: { tentativas: [ {data, correta, tempo_gasto_segundos, ...} ] } }
//     → vem do estudo-service (`GET /api/tentativas`), não do localStorage
//   - resultadosHistorico: [ { disciplina, quantidade, acertos, errados, nota_final, ... } ]
//     → simulados; ainda sem rota própria, vive neste navegador
//   - questoes: o acervo carregado (para mapear questaoId -> disciplina)
//   - config: { meta, dataProva }
//
// A regra desta camada: quando não há dado, o retorno é `null` — nunca zero,
// nunca um número plausível. Zero é uma medição ("respondi e errei tudo");
// ausência de dado é outra coisa, e quem desenha a tela precisa distinguir as
// duas para não mostrar 0% a quem nunca respondeu nada.
//
// O que É por disciplina mora em `disciplinas.js`, que enxerga também o
// tamanho do acervo — aqui só se sabe o que foi respondido.

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
  // O rótulo tem de ser o MESMO de `disciplinas.js`: com 'Outras' aqui e
  // 'Sem classificação' lá, a mesma questão aparecia com dois nomes em telas
  // diferentes e o filtro por disciplina não casava com nada.
  for (const q of questoes) idx[String(q.id)] = q.disciplina || 'Sem classificação';
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
    // Questão que não está no acervo carregado (respondida antes, hoje fora do
    // filtro): entra como não classificada em vez de sumir da conta.
    const disciplina = discPorId[String(qId)] || 'Sem classificação';
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
// 5) Estatísticas de um período, com comparação ao período anterior
// ---------------------------------------------------------------------------

/**
 * A tela de Estatísticas tinha um seletor de período que multiplicava um
 * número fixo por 0.25, 1 ou 3.4 — mexer no filtro mudava o número na tela sem
 * consultar dado nenhum. Aqui o período filtra as tentativas de verdade, e o
 * "vs. período anterior" compara com a janela imediatamente anterior, de mesmo
 * tamanho. Sem janela anterior com dados, o delta é `null` e a tela cala a
 * boca em vez de dizer "+12%".
 *
 * `dias = null` significa "desde o início": aí não existe período anterior.
 */
export function estatisticasDoPeriodo(usuarioTentativas = {}, { questoes = [], dias = null, disciplina = null, hoje = new Date() } = {}) {
  const todas = flattenTentativas(usuarioTentativas, questoes)
    .filter((t) => (disciplina ? t.disciplina === disciplina : true));

  const hojeKey = dateKey(hoje);
  const naJanela = (t, deDiasAtras, ateDiasAtras) => {
    if (!t.dia) return false;
    const distancia = diffDays(hojeKey, t.dia);
    return distancia >= ateDiasAtras && distancia < deDiasAtras;
  };

  const atual = dias == null ? todas : todas.filter((t) => naJanela(t, dias, 0));
  const anterior = dias == null ? [] : todas.filter((t) => naJanela(t, dias * 2, dias));

  const resumir = (lista) => {
    const acertos = lista.filter((t) => t.correta).length;
    const comTempo = lista.filter((t) => t.tempo != null);
    const tempoTotal = comTempo.reduce((soma, t) => soma + t.tempo, 0);

    return {
      tentativas: lista.length,
      questoes: new Set(lista.map((t) => String(t.questaoId))).size,
      acertos,
      erros: lista.length - acertos,
      pct: lista.length > 0 ? Math.round((acertos / lista.length) * 100) : null,
      tempoTotalSeg: comTempo.length > 0 ? tempoTotal : null,
      tempoMedioSeg: comTempo.length > 0 ? Math.round(tempoTotal / comTempo.length) : null,
      diasAtivos: new Set(lista.map((t) => t.dia).filter(Boolean)).size,
    };
  };

  const a = resumir(atual);
  const b = resumir(anterior);

  // Delta só existe quando os DOIS lados têm dado. Comparar com um período
  // vazio daria "+100%" para quem simplesmente começou a usar o app agora.
  const delta = (x, y) => (x == null || y == null || y === 0 ? null : Math.round(((x - y) / y) * 100));

  return {
    ...a,
    anterior: b,
    delta: {
      tentativas: delta(a.tentativas, b.tentativas),
      pct: a.pct != null && b.pct != null ? a.pct - b.pct : null,   // pontos percentuais
      tempoTotalSeg: delta(a.tempoTotalSeg, b.tempoTotalSeg),
      diasAtivos: delta(a.diasAtivos, b.diasAtivos),
    },
  };
}

// ---------------------------------------------------------------------------
// 6) Evolução geral da taxa de acertos, semana a semana
// ---------------------------------------------------------------------------

/**
 * Substitui a série `[60, 66, 63, 70, 68, 74, 73]` que estava escrita no
 * código da tela de Desempenho e não mudava para ninguém.
 *
 * Semanas sem atividade entram como `null` — o gráfico pula o ponto em vez de
 * desenhar uma queda a zero que nunca aconteceu.
 */
export function evolucaoGeral(usuarioTentativas = {}, semanas = 6, hoje = new Date()) {
  const tentativas = flattenTentativas(usuarioTentativas).filter((t) => t.dia);
  const hojeKey = dateKey(hoje);

  const baldes = Array.from({ length: semanas }, () => ({ acertos: 0, total: 0 }));

  for (const t of tentativas) {
    const semanaAtras = Math.floor(diffDays(hojeKey, t.dia) / 7);
    const i = semanas - 1 - semanaAtras;
    if (i < 0 || i > semanas - 1) continue;
    baldes[i].total += 1;
    if (t.correta) baldes[i].acertos += 1;
  }

  return baldes.map((b, i) => ({
    rotulo: i === semanas - 1 ? 'esta semana' : `${semanas - 1 - i} sem. atrás`,
    total: b.total,
    pct: b.total > 0 ? Math.round((b.acertos / b.total) * 100) : null,
  }));
}

// ---------------------------------------------------------------------------
// 7) Tempo por questão, por disciplina
// ---------------------------------------------------------------------------

/**
 * O tempo vem de `tempo_gasto_segundos`, cronometrado entre a questão aparecer
 * e a alternativa ser clicada. Disciplina sem nenhuma medição não entra na
 * lista — o gráfico antigo desenhava sete barras fixas para todo mundo.
 */
export function tempoPorDisciplina(usuarioTentativas = {}, questoes = []) {
  const mapa = {};

  for (const t of flattenTentativas(usuarioTentativas, questoes)) {
    if (t.tempo == null) continue;
    if (!mapa[t.disciplina]) mapa[t.disciplina] = { disciplina: t.disciplina, soma: 0, amostras: 0 };
    mapa[t.disciplina].soma += t.tempo;
    mapa[t.disciplina].amostras += 1;
  }

  return Object.values(mapa)
    .map((m) => ({ ...m, mediaSeg: Math.round(m.soma / m.amostras) }))
    .sort((a, b) => b.mediaSeg - a.mediaSeg);
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
// 8) Dias até a prova (topbar)
// ---------------------------------------------------------------------------

/**
 * `dataProva` é escolhida por quem estuda, na tela de Configurações. Antes ela
 * era uma constante ('2027-02-28') sem nenhum campo que a editasse: a topbar
 * contava os dias para uma prova que o app inventou.
 */
export function diasAteProva(config = {}, hoje = new Date()) {
  if (!config.dataProva) return null;
  const gap = diffDays(dateKey(config.dataProva), dateKey(hoje));
  return gap >= 0 ? gap : 0;
}

// ---------------------------------------------------------------------------
// Formatação de tempo (usada por Estatísticas e Desempenho)
// ---------------------------------------------------------------------------

export function formatarDuracao(segundos) {
  if (segundos == null) return null;
  if (segundos < 60) return `${segundos}s`;

  const minutos = Math.round(segundos / 60);
  if (minutos < 60) return `${minutos}min`;

  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  return resto === 0 ? `${horas}h` : `${horas}h ${String(resto).padStart(2, '0')}min`;
}
