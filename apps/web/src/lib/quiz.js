// Tamanho e sorteio do quiz.
//
// O quiz mede a meta do dia: a pessoa com meta de 4 questões faz 4, não as 80
// da matéria. Abrir tudo o que as fontes marcadas têm transforma um objetivo
// alcançável numa lista sem fim, e a barra de progresso do quiz passaria a
// medir outra coisa que não a meta. A mesma regra vale para o quiz montado na
// tela de Questões e para o atalho "Foco de hoje".

import { embaralhar } from './questions/acervo.js';

/**
 * Quantas questões o quiz tem: o que falta para a meta de hoje. Com a meta já
 * batida, quem pede outro quiz quer continuar — abre mais uma rodada do
 * tamanho da meta, e não "tudo".
 */
export function tamanhoDoQuiz(meta) {
  const alvo = Number(meta?.meta) > 0 ? Number(meta.meta) : 20;
  if (!meta || meta.batida) return alvo;
  return Math.max(1, Number(meta.faltam) || alvo);
}

const jaRespondida = (usuarioTentativas, q) =>
  (usuarioTentativas?.[q.id]?.tentativas?.length || 0) > 0;

/**
 * Sorteia `quantas` questões do `pool`, as nunca respondidas primeiro: com um
 * quiz curto, gastar a vaga com questão já vista é desperdiçar a meta. Dentro
 * de cada grupo a ordem é aleatória.
 */
export function sortearQuiz(pool, quantas, usuarioTentativas = {}, sortear = embaralhar) {
  const embaralhadas = sortear(pool || []);
  const novas = embaralhadas.filter((q) => !jaRespondida(usuarioTentativas, q));
  const vistas = embaralhadas.filter((q) => jaRespondida(usuarioTentativas, q));
  return [...novas, ...vistas].slice(0, Math.max(0, quantas));
}
