// O cronograma.
//
// A tela anterior era um cartaz: "180 dias", "início 03/03/2025", "65% do
// plano concluído", "312h 45m estudadas", "4.312 questões respondidas",
// calendário parado em maio de 2025 com o dia 13 aceso. Nada disso vinha de
// lugar nenhum, e o botão "Iniciar estudo" somava 40% na barra a cada clique.
//
// Um cronograma honesto neste app só pode ser duas coisas: uma SUGESTÃO
// derivada do que a pessoa erra mais, e um REGISTRO do que ela de fato fez.
// As duas estão aqui, e a tela deixa claro qual é qual.

import { dateKey } from './metrics.js';
import { prioridadeDeEstudo } from './disciplinas.js';

const DOW = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB'];
const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

/** Quantas questões foram respondidas em cada dia. Base dos dois blocos. */
export function respondidasPorDia(tentativas = {}) {
  const contagem = {};

  for (const registro of Object.values(tentativas)) {
    for (const t of registro?.tentativas || []) {
      const dia = t.data ? dateKey(t.data) : null;
      if (dia) contagem[dia] = (contagem[dia] || 0) + 1;
    }
  }

  return contagem;
}

/**
 * Sete dias a partir de hoje, cada um com uma disciplina sugerida.
 *
 * A sugestão sai da ordem de prioridade (o que se erra mais primeiro) e não se
 * repete enquanto houver matéria nova — com 18 disciplinas no acervo, a semana
 * inteira sai sem repetir. O progresso do dia é real: questões respondidas
 * naquele dia sobre a meta diária. Dias futuros não têm progresso, e a tela
 * mostra isso como "planejado" em vez de uma barra em zero.
 */
export function planoDaSemana({ disciplinas = [], tentativas = {}, meta = 20, hoje = new Date() } = {}) {
  const prioridade = prioridadeDeEstudo(disciplinas);
  const porDia = respondidasPorDia(tentativas);
  const hojeChave = dateKey(hoje);

  return Array.from({ length: 7 }, (_, i) => {
    const data = new Date(hoje);
    data.setDate(data.getDate() + i);
    const chave = dateKey(data);

    const sugerida = prioridade.length > 0 ? prioridade[i % prioridade.length] : null;
    const respondidas = porDia[chave] || 0;

    return {
      chave,
      dow: DOW[data.getDay()],
      dia: data.getDate(),
      hoje: chave === hojeChave,
      futuro: chave > hojeChave,
      disciplina: sugerida?.nome || null,
      cor: sugerida?.cor || null,
      // O motivo da sugestão vai junto: conselho sem motivo é palpite.
      motivo: sugerida ? motivoDaSugestao(sugerida) : null,
      questoesDisponiveis: sugerida?.total || 0,
      respondidas,
      meta,
      pct: meta > 0 ? Math.min(100, Math.round((respondidas / meta) * 100)) : 0,
    };
  });
}

function motivoDaSugestao(d) {
  if (d.status === 'novo') return `${d.total} ${d.total === 1 ? 'questão' : 'questões'} que você ainda não respondeu`;
  if (d.status === 'necessita') return `sua taxa aqui é de ${d.pct}%`;
  if (d.status === 'em-desenvolvimento') return `${d.pct}% de acerto — dá para subir`;
  return `${d.pct}% de acerto, só para manter`;
}

/**
 * O mês corrente com os dias em que houve atividade.
 *
 * Começa alinhado no domingo (as células vazias no início existem para o dia
 * 1 cair na coluna certa — sem elas o calendário mostra a data debaixo do dia
 * da semana errado, que é pior que não ter calendário).
 */
export function diasDoMes(tentativas = {}, hoje = new Date()) {
  const porDia = respondidasPorDia(tentativas);
  const ano = hoje.getFullYear();
  const mes = hoje.getMonth();
  const hojeChave = dateKey(hoje);

  const primeiro = new Date(ano, mes, 1);
  const totalDeDias = new Date(ano, mes + 1, 0).getDate();

  const celulas = Array.from({ length: primeiro.getDay() }, () => ({ vazia: true }));

  for (let n = 1; n <= totalDeDias; n++) {
    const chave = dateKey(new Date(ano, mes, n));
    celulas.push({
      vazia: false,
      n,
      chave,
      respondidas: porDia[chave] || 0,
      hoje: chave === hojeChave,
    });
  }

  return { rotulo: `${MESES[mes]} ${ano}`, celulas };
}

/**
 * O resumo do lado direito. Todo número aqui é contado, não estimado — por
 * isso não há "horas estudadas": o app registra o tempo de cada questão, e
 * somar isso e chamar de "horas de estudo" seria contar só o tempo com a
 * questão aberta na tela.
 */
export function resumoDoPlano({ tentativas = {}, disciplinas = [], hoje = new Date() } = {}) {
  const porDia = respondidasPorDia(tentativas);
  const dias = Object.keys(porDia);

  const respondidas = Object.values(porDia).reduce((soma, n) => soma + n, 0);
  const acervo = disciplinas.reduce((soma, d) => soma + d.total, 0);
  const questoesTocadas = disciplinas.reduce((soma, d) => soma + d.respondidas, 0);

  return {
    diasAtivos: dias.length,
    respondidas,
    acervo,
    questoesTocadas,
    cobertura: acervo > 0 ? Math.round((questoesTocadas / acervo) * 100) : 0,
    hojeRespondidas: porDia[dateKey(hoje)] || 0,
  };
}
