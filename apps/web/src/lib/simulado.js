// Regras do simulado sem React: o que entra na prova, como ela é corrigida e
// como a origem de cada questão é escrita na tela. Ficam aqui para rodar no
// `node` (tests/simulado.test.js) — a tela só desenha.

import { embaralhar } from './questions/acervo.js';

// Procedência real da questão, vinda do acervo. O layout "estilo LEGJUR"
// original escrevia "PROVA-FGV-BR/2023", um código com cara de oficial que não
// existe — e, com o acervo real, virava "PROVA-FGV-BR/undefined" quando a
// questão chegava sem ano. Quiz e simulado usam esta mesma função.
export function origemDaQuestao(q) {
  if (!q) return 'Exame de Ordem';
  let texto = q.exame ? `${q.exame}º Exame de Ordem` : 'Exame de Ordem';
  if (q.numero) texto += ` · questão ${q.numero}`;
  if (q.banca) texto += ` · ${q.banca}`;
  return texto;
}

// Quantas questões cada escolha do formulário tem à disposição. A contagem
// vem do acervo carregado, não de uma lista fixa: disciplina vazia (questão
// ainda não classificada) só entra no simulado geral.
export function questoesDisponiveis(questoes = [], { tipo, disciplina } = {}) {
  if (tipo === 'disciplina') {
    if (!disciplina) return [];
    return questoes.filter((q) => q.disciplina === disciplina);
  }
  return questoes.slice();
}

// Sorteia a prova. O `sort(() => Math.random() - 0.5)` de antes não embaralha
// por igual (as primeiras do caderno tendiam a ficar no começo); o
// Fisher-Yates de `embaralhar` sim. Devolve lista vazia se não houver o que
// sortear — quem chama não deve abrir uma prova de zero questões.
export function sortearQuestoes(questoes = [], config = {}) {
  const pool = questoesDisponiveis(questoes, config);
  const quantidade = Math.max(0, Number(config.quantidade) || 0);
  return embaralhar(pool).slice(0, Math.min(quantidade, pool.length));
}

// Tempo de prova: 1,5 min por questão, arredondado para cima. É o mesmo que o
// formulário anuncia e o cronômetro conta.
export function tempoDeProvaMinutos(quantidade) {
  return Math.ceil(Math.max(0, quantidade) * 1.5);
}

// Correção. Em branco não é erro de conteúdo — conta à parte, para a pessoa
// saber se perdeu ponto por não saber ou por não chegar a responder.
export function corrigirSimulado(questoes = [], respostas = {}) {
  let acertos = 0;
  let emBranco = 0;
  for (const q of questoes) {
    const r = respostas[q.id];
    if (r === undefined || r === null) emBranco += 1;
    else if (r === q.correta) acertos += 1;
  }
  const total = questoes.length;
  return {
    total,
    acertos,
    erros: total - acertos - emBranco,
    emBranco,
    nota: total > 0 ? Math.round((acertos / total) * 100) : 0,
  };
}

// Situação de uma questão na revisão do resultado.
export function situacaoDaResposta(q, respostas = {}) {
  const r = respostas[q.id];
  if (r === undefined || r === null) return 'em-branco';
  return r === q.correta ? 'certa' : 'errada';
}
