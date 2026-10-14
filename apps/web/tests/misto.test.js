// Quiz misto (sortearMisto em src/lib/quiz.js): um pouco de cada matéria, na
// proporção da prova. O ponto sensível é a distribuição das vagas — dar o quiz
// inteiro à matéria de maior peso, ou deixar uma vaga sem questão quando a
// matéria se esgota, passaria despercebido na tela.

import { sortearMisto, QUESTOES_NA_PROVA } from '../src/lib/quiz.js';

const falhas = [];
const exigir = (condicao, mensagem) => {
  if (!condicao) falhas.push(mensagem);
};

const semSortear = (lista) => lista.slice();
let seq = 0;
const lote = (disciplina, n) => Array.from({ length: n }, () => ({ id: ++seq, disciplina }));
const contar = (quiz) =>
  quiz.reduce((m, q) => ({ ...m, [q.disciplina]: (m[q.disciplina] || 0) + 1 }), {});

// --- a tabela bate com a prova ---
{
  const total = Object.values(QUESTOES_NA_PROVA).reduce((a, b) => a + b, 0);
  exigir(total === 80, `a distribuição deveria somar 80, soma ${total}`);
  exigir(Object.keys(QUESTOES_NA_PROVA).length === 20, 'deveriam ser 20 disciplinas');
}

// --- quiz curto espalha pelas matérias de maior peso ---
{
  const pool = [
    ...lote('Ética Profissional', 10),
    ...lote('Direito Civil', 10),
    ...lote('Direito Penal', 10),
    ...lote('Direito Constitucional', 10),
    ...lote('Filosofia do Direito', 10),
  ];
  const quiz = sortearMisto(pool, 4, {}, undefined, semSortear);
  const n = contar(quiz);

  // Quocientes: Ética 8, as três de peso 6 dão 6 cada — a 2ª de Ética (4) não
  // chega. Ética + três matérias de peso 6, e Filosofia (2) fica de fora.
  exigir(quiz.length === 4, `esperava 4 questões, vieram ${quiz.length}`);
  exigir(n['Ética Profissional'] === 1, 'Ética deveria ter 1 vaga, não o quiz todo');
  exigir(n['Direito Civil'] === 1 && n['Direito Penal'] === 1 && n['Direito Constitucional'] === 1,
    `as três matérias de peso 6 deveriam entrar, veio ${JSON.stringify(n)}`);
  exigir(!n['Filosofia do Direito'], 'Filosofia (peso 2) não deveria tomar vaga num quiz de 4');
  exigir(new Set(quiz.map((q) => q.id)).size === 4, 'questão repetida no quiz');
}

// --- quiz longo segue a proporção ---
{
  const pool = [...lote('Ética Profissional', 50), ...lote('Filosofia do Direito', 50)];
  const n = contar(sortearMisto(pool, 20, {}, undefined, semSortear));
  // Pesos 8 e 2: 16 e 4.
  exigir(n['Ética Profissional'] === 16 && n['Filosofia do Direito'] === 4,
    `20 vagas com pesos 8 e 2 deveriam dar 16/4, deram ${JSON.stringify(n)}`);
}

// --- matéria esgotada passa a vaga adiante ---
{
  const pool = [...lote('Ética Profissional', 1), ...lote('Direito Civil', 10)];
  const quiz = sortearMisto(pool, 6, {}, undefined, semSortear);
  exigir(quiz.length === 6, `com Ética esgotada o quiz deveria ter 6 ainda, veio ${quiz.length}`);
  exigir(contar(quiz)['Ética Profissional'] === 1, 'Ética só tem 1 questão');
}

// --- pede mais do que o acervo tem ---
{
  const pool = [...lote('Direito Civil', 2), ...lote('Direito Penal', 1)];
  exigir(sortearMisto(pool, 10, {}, undefined, semSortear).length === 3, 'deveria parar no tamanho do acervo');
}

// --- nunca respondidas primeiro, dentro da matéria ---
{
  const civil = lote('Direito Civil', 3);
  const respondidas = { [civil[0].id]: { tentativas: [{ correta: true }] }, [civil[1].id]: { tentativas: [{ correta: false }] } };
  const quiz = sortearMisto(civil, 1, respondidas, undefined, semSortear);
  exigir(quiz[0].id === civil[2].id, 'a vaga deveria ir para a questão nunca respondida');
}

// --- acervo sem matéria cai no sorteio comum ---
{
  const pool = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  exigir(sortearMisto(pool, 2, {}, undefined, semSortear).length === 2, 'sem disciplina deveria sortear do acervo todo');
}

// --- disciplina fora da tabela ainda entra ---
{
  const pool = [...lote('Direito Novo', 5), ...lote('Direito Civil', 5)];
  exigir((contar(sortearMisto(pool, 4, {}, undefined, semSortear))['Direito Novo'] || 0) >= 1,
    'disciplina fora da tabela não pode sumir do misto');
}

if (falhas.length > 0) {
  console.error(`\n❌ ${falhas.length} problema(s):`);
  for (const f of falhas) console.error('   - ' + f);
  process.exit(1);
}

console.log('✅ quiz misto: proporção da prova, matéria esgotada, nunca respondidas primeiro');
