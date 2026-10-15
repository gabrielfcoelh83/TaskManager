// Tamanho e sorteio do quiz (src/lib/quiz.js). O quiz mede a meta do dia:
// abrir todas as questões das fontes marcadas foi o que fez um quiz de "meta
// 4" virar uma lista de 80.

import { tamanhoDoQuiz, sortearQuiz } from '../src/lib/quiz.js';

const falhas = [];
const exigir = (condicao, mensagem) => {
  if (!condicao) falhas.push(mensagem);
};

const semSortear = (lista) => lista.slice();
const q = (id) => ({ id });
const respondida = { tentativas: [{ data: '2026-09-01', resposta: 0, correta: true }] };

// --- tamanho ---
{
  exigir(tamanhoDoQuiz({ meta: 4, faltam: 4, batida: false }) === 4, 'meta 4 sem nada respondido deveria dar 4');
  exigir(tamanhoDoQuiz({ meta: 20, faltam: 3, batida: false }) === 3, 'faltando 3 deveria dar 3');
  exigir(tamanhoDoQuiz({ meta: 4, faltam: 0, batida: true }) === 4, 'meta batida abre outra rodada do tamanho da meta, não tudo');
  exigir(tamanhoDoQuiz({ meta: 4, faltam: 0, batida: false }) >= 1, 'quiz nunca tem zero questões');
  exigir(tamanhoDoQuiz(null) === 20, 'sem meta, o padrão do app (20)');
}

// --- sorteio ---
{
  const pool = [q('a'), q('b'), q('c'), q('d'), q('e')];
  exigir(sortearQuiz(pool, 3, {}, semSortear).length === 3, 'deveria cortar no tamanho pedido');
  exigir(sortearQuiz(pool, 10, {}, semSortear).length === 5, 'com menos questões que a meta, usa as que houver');
  exigir(sortearQuiz(pool, 0, {}, semSortear).length === 0, 'tamanho zero');

  const vistas = { a: respondida, b: respondida };
  const ids = sortearQuiz(pool, 3, vistas, semSortear).map((x) => x.id).join('');
  exigir(ids === 'cde', `as nunca respondidas vêm primeiro: esperado cde, veio ${ids}`);
  const todas = sortearQuiz(pool, 5, vistas, semSortear).map((x) => x.id).join('');
  exigir(todas === 'cdeab', `faltando novas, completa com as vistas: esperado cdeab, veio ${todas}`);

  exigir(pool.length === 5 && pool[0].id === 'a', 'o sorteio não pode mexer na lista original');
  exigir(sortearQuiz(null, 3).length === 0, 'pool nulo vira quiz vazio');
}

if (falhas.length > 0) {
  console.error(`\n❌ ${falhas.length} problema(s):`);
  for (const f of falhas) console.error('   - ' + f);
  process.exit(1);
}

console.log('✅ tamanho e sorteio do quiz seguem a meta do dia');
