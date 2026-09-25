// Regras do simulado (src/lib/simulado.js): sorteio, correção e o rótulo de
// origem da questão. A correção é o ponto sensível — contar questão em branco
// como acerto, ou dividir por zero numa prova vazia, some sem erro na tela.

import {
  origemDaQuestao,
  questoesDisponiveis,
  sortearQuestoes,
  tempoDeProvaMinutos,
  corrigirSimulado,
  situacaoDaResposta,
} from '../src/lib/simulado.js';

const falhas = [];
const exigir = (condicao, mensagem) => {
  if (!condicao) falhas.push(mensagem);
};

const q = (id, extra = {}) => ({ id, correta: 1, alternativas: ['a', 'b', 'c', 'd'], disciplina: null, ...extra });

// --- origem ---
{
  exigir(
    origemDaQuestao({ exame: 45, numero: 7, banca: 'FGV', ano: 2025 }) === '45º Exame de Ordem · questão 7 · FGV',
    'origem completa mal escrita'
  );
  const semNada = origemDaQuestao({ exame: null, numero: null, banca: null, ano: null });
  exigir(semNada === 'Exame de Ordem', `origem sem dados deveria ser "Exame de Ordem", veio "${semNada}"`);
  exigir(!/undefined|null/.test(origemDaQuestao({})), 'origem vazou undefined/null');
  exigir(origemDaQuestao(null) === 'Exame de Ordem', 'origem de questão nula');
}

// --- disponíveis e sorteio ---
{
  const acervo = [
    q(1, { disciplina: 'Direito Penal' }),
    q(2, { disciplina: 'Direito Penal' }),
    q(3, { disciplina: 'Direito Civil' }),
    q(4), // ainda sem classificação
  ];

  exigir(questoesDisponiveis(acervo, { tipo: 'geral' }).length === 4, 'geral deveria usar o acervo inteiro, com as não classificadas');
  exigir(questoesDisponiveis(acervo, { tipo: 'disciplina', disciplina: 'Direito Penal' }).length === 2, 'filtro por disciplina');
  exigir(questoesDisponiveis(acervo, { tipo: 'disciplina', disciplina: null }).length === 0, 'por disciplina sem disciplina não pode virar geral');

  const pedidoMaior = sortearQuestoes(acervo, { tipo: 'disciplina', disciplina: 'Direito Penal', quantidade: 10 });
  exigir(pedidoMaior.length === 2, 'pedir mais do que existe deveria devolver o que existe');
  exigir(pedidoMaior.every((x) => x.disciplina === 'Direito Penal'), 'sorteio trouxe questão de outra disciplina');

  const geral = sortearQuestoes(acervo, { tipo: 'geral', quantidade: 3 });
  exigir(geral.length === 3, 'sorteio geral com quantidade 3');
  exigir(new Set(geral.map((x) => x.id)).size === 3, 'sorteio repetiu questão');

  exigir(sortearQuestoes([], { tipo: 'geral', quantidade: 10 }).length === 0, 'acervo vazio deveria sortear zero');
  exigir(acervo.map((x) => x.id).join() === '1,2,3,4', 'sorteio alterou a lista original');
}

// --- tempo ---
exigir(tempoDeProvaMinutos(10) === 15, 'tempo de 10 questões');
exigir(tempoDeProvaMinutos(7) === 11, 'tempo arredonda para cima');
exigir(tempoDeProvaMinutos(0) === 0, 'tempo de prova vazia');

// --- correção ---
{
  const prova = [q(1), q(2), q(3), q(4)];
  const r = corrigirSimulado(prova, { 1: 1, 2: 0, 3: 1 }); // 4 em branco
  exigir(r.total === 4 && r.acertos === 2 && r.erros === 1 && r.emBranco === 1, `correção errada: ${JSON.stringify(r)}`);
  exigir(r.nota === 50, `nota deveria ser 50, veio ${r.nota}`);

  // Alternativa 0 é resposta válida — um `if (!r)` a trataria como em branco.
  const zero = corrigirSimulado([q(9, { correta: 0 })], { 9: 0 });
  exigir(zero.acertos === 1 && zero.emBranco === 0, 'alternativa A (índice 0) tratada como em branco');

  const vazia = corrigirSimulado([], {});
  exigir(vazia.nota === 0 && Number.isFinite(vazia.nota), 'prova vazia não pode dar NaN');

  exigir(situacaoDaResposta(q(1), { 1: 1 }) === 'certa', 'situação certa');
  exigir(situacaoDaResposta(q(1), { 1: 3 }) === 'errada', 'situação errada');
  exigir(situacaoDaResposta(q(1), {}) === 'em-branco', 'situação em branco');
  exigir(situacaoDaResposta(q(5, { correta: 0 }), { 5: 0 }) === 'certa', 'situação com alternativa A');
}

if (falhas.length > 0) {
  console.error(`\n❌ ${falhas.length} problema(s):`);
  for (const f of falhas) console.error('   - ' + f);
  process.exit(1);
}

console.log('✅ sorteio, correção e origem do simulado íntegros');
