// Validação estrutural do banco de questões.
//
// Nasceu de dois gabaritos errados que passaram despercebidos: a questão 12
// marcava "15 a 40 anos" para homicídio qualificado enquanto a própria
// explicação dizia "12 a 30", e a 13 marcava o voto como facultativo aos 18
// com a explicação dizendo o contrário.
//
// Seja franco sobre o alcance disto: NENHUMA das duas seria pega aqui. Elas
// foram encontradas lendo. O que este arquivo cobre é a parte mecanizável —
// índice fora da faixa, alternativa repetida, "erro comum" apontando para a
// resposta certa. O resto depende de o gabarito vir de uma fonte oficial em
// vez de ser digitado, que é para onde o questoes-service vai.

import { QUESTOES } from '../src/lib/mockData.js';

const falhas = [];
const exigir = (condicao, mensagem) => {
  if (!condicao) falhas.push(mensagem);
};

const vazio = (v) => typeof v !== 'string' || v.trim() === '';

const vistos = new Set();

for (const q of QUESTOES) {
  const onde = `questão ${q.id}`;

  exigir(!vistos.has(q.id), `${onde}: id repetido`);
  vistos.add(q.id);

  // A prova da OAB é sempre de quatro alternativas. Uma questão com três ou
  // cinco não é "quase certa" — ela não é uma questão da OAB.
  exigir(
    Array.isArray(q.alternativas) && q.alternativas.length === 4,
    `${onde}: esperadas 4 alternativas, veio ${q.alternativas?.length}`
  );

  if (Array.isArray(q.alternativas)) {
    q.alternativas.forEach((alt, i) =>
      exigir(!vazio(alt), `${onde}: alternativa ${i} vazia`)
    );

    // Duas alternativas iguais tornam a questão insolúvel: existiriam duas
    // respostas certas, e o aluno erraria "acertando".
    const unicas = new Set(q.alternativas.map((a) => String(a).trim().toLowerCase()));
    exigir(
      unicas.size === q.alternativas.length,
      `${onde}: alternativas repetidas`
    );

    // Fora da faixa, a tela mostraria `undefined` como resposta certa.
    exigir(
      Number.isInteger(q.correta) && q.correta >= 0 && q.correta < q.alternativas.length,
      `${onde}: correta=${q.correta} fora da faixa`
    );
  }

  exigir(!vazio(q.enunciado), `${onde}: sem enunciado`);
  exigir(!vazio(q.disciplina), `${onde}: sem disciplina`);
  exigir(!vazio(q.topico), `${onde}: sem tópico`);

  // Sem explicação a questão só informa que você errou, que é a parte inútil.
  exigir(!vazio(q.explicacao), `${onde}: sem explicação`);

  exigir(
    Array.isArray(q.referencias) && q.referencias.length > 0,
    `${onde}: sem referência legal`
  );

  for (const erro of q.errosComuns || []) {
    exigir(
      Number.isInteger(erro.alternativa) &&
        erro.alternativa >= 0 &&
        erro.alternativa < (q.alternativas?.length || 0),
      `${onde}: errosComuns aponta alternativa ${erro.alternativa}, que não existe`
    );

    // Contradição interna: se a alternativa marcada como "erro comum" é a
    // mesma marcada como certa, uma das duas está errada. É o parente
    // mecanizável do bug que motivou este arquivo.
    exigir(
      erro.alternativa !== q.correta,
      `${onde}: errosComuns aponta a alternativa ${erro.alternativa}, que é a CORRETA`
    );

    exigir(!vazio(erro.motivo), `${onde}: erro comum sem motivo`);
  }
}

console.log(`${QUESTOES.length} questões verificadas`);

if (falhas.length > 0) {
  console.error(`\n❌ ${falhas.length} problema(s):`);
  for (const f of falhas) console.error('   - ' + f);
  process.exit(1);
}

console.log('✅ banco de questões íntegro');
