// Os "cadernos" da tela de Questões: um card por matéria, mais o misto.
//
// Tudo aqui sai de dado real — o acervo carregado, as tentativas da pessoa e a
// distribuição da prova (QUESTOES_NA_PROVA). O mockup que originou a tela
// trazia "17 matérias", "7 questões" de peso para Civil, "74% média" e uma
// descrição de conteúdo escrita à mão para cada matéria; nada disso entra.
// No lugar da descrição vão os temas que o acervo de fato tem.

import { montarDisciplinas, temasDaDisciplina } from './disciplinas.js';
import { QUESTOES_NA_PROVA } from './quiz.js';

// Abaixo disto a taxa de acerto não aparece: 2 de 2 viraria "100%" e
// mandaria a pessoa estudar outra coisa.
export const AMOSTRA_MINIMA = 10;

const taxa = (d) => (d.tentativas >= AMOSTRA_MINIMA ? d.pct : null);

/**
 * Selos, cada um num card só, nesta prioridade: o do plano, o de maior peso
 * na prova e o de pior desempenho (só com amostra suficiente). Matéria nunca
 * respondida, se não ganhou outro selo, ganha "Nunca estudada".
 */
function selar(materias, materiaDoPlano) {
  const selos = new Map();
  const dar = (nome, selo) => {
    if (nome && !selos.has(nome)) selos.set(nome, selo);
  };

  if (materias.some((m) => m.nome === materiaDoPlano)) dar(materiaDoPlano, 'plano');

  const maiorPeso = [...materias].filter((m) => m.peso != null).sort((a, b) => b.peso - a.peso)[0];
  dar(maiorPeso?.nome, 'peso');

  const pior = materias.filter((m) => m.pct != null).sort((a, b) => a.pct - b.pct)[0];
  if (pior && pior.pct < 50) dar(pior.nome, 'fraco');

  for (const m of materias) if (m.tentativas === 0) dar(m.nome, 'nova');

  return materias.map((m) => ({ ...m, selo: selos.get(m.nome) || null }));
}

/**
 * @param ordem 'peso' — o que a prova mais cobra primeiro;
 *              'pendentes' — o que tem mais questão nunca respondida primeiro.
 * Nos dois casos a matéria do plano abre a lista: é a recomendação do dia.
 */
export function montarCadernos(questoes = [], tentativas = {}, { materiaDoPlano = null, ordem = 'peso' } = {}) {
  const todas = montarDisciplinas(questoes, tentativas);
  const classificadas = todas.filter((d) => d.classificada);

  const materias = classificadas.map((d) => ({
    nome: d.nome,
    cor: d.cor,
    peso: QUESTOES_NA_PROVA[d.nome] ?? null,
    disponiveis: d.total,
    nuncaRespondidas: d.total - d.respondidas,
    tentativas: d.tentativas,
    pct: taxa(d),
    // Os três temas com mais questão no acervo. "Sem tema" não diz nada.
    temas: temasDaDisciplina(questoes, tentativas, d.nome)
      .filter((t) => t.nome !== 'Sem tema')
      .sort((a, b) => b.total - a.total)
      .slice(0, 3)
      .map((t) => t.nome),
  }));

  const criterio = ordem === 'pendentes'
    ? (a, b) => b.nuncaRespondidas - a.nuncaRespondidas || (b.peso ?? 0) - (a.peso ?? 0)
    : (a, b) => (b.peso ?? 0) - (a.peso ?? 0) || b.disponiveis - a.disponiveis;
  const doPlano = (m) => (m.nome === materiaDoPlano ? 0 : 1);
  const ordenadas = selar(materias, materiaDoPlano)
    .sort((a, b) => doPlano(a) - doPlano(b) || criterio(a, b) || a.nome.localeCompare(b.nome));

  // O misto cobre o que tem matéria — é o mesmo recorte que `sortearMisto` usa.
  const soma = (campo) => materias.reduce((n, m) => n + m[campo], 0);
  const acertos = classificadas.reduce((n, d) => n + d.acertos, 0);
  const tentativasMisto = soma('tentativas');

  return {
    misto: {
      disponiveis: soma('disponiveis'),
      nuncaRespondidas: soma('nuncaRespondidas'),
      materias: materias.length,
      pct: tentativasMisto >= AMOSTRA_MINIMA ? Math.round((acertos / tentativasMisto) * 100) : null,
    },
    materias: ordenadas,
  };
}
