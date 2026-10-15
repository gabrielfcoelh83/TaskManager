// Cadernos da tela de Questões (src/lib/cadernos.js). O risco aqui é mostrar
// número que não é da pessoa: taxa com amostra pequena, peso de matéria
// inventado, selo repetido ou a matéria do plano fora do primeiro lugar.

import { montarCadernos, AMOSTRA_MINIMA } from '../src/lib/cadernos.js';

const falhas = [];
const exigir = (condicao, mensagem) => {
  if (!condicao) falhas.push(mensagem);
};

let seq = 0;
const lote = (disciplina, n, topico = null) =>
  Array.from({ length: n }, () => ({ id: String(++seq), disciplina, topico }));
const responder = (questoes, certas, erradas) => {
  const mapa = {};
  questoes.slice(0, certas).forEach((q) => (mapa[q.id] = { tentativas: [{ correta: true }] }));
  questoes.slice(certas, certas + erradas).forEach((q) => (mapa[q.id] = { tentativas: [{ correta: false }] }));
  return mapa;
};

const etica = lote('Ética Profissional', 12, 'Honorários');
const civil = [...lote('Direito Civil', 8, 'Contratos'), ...lote('Direito Civil', 3, 'Família'), ...lote('Direito Civil', 2)];
const penal = lote('Direito Penal', 15);
const semMateria = lote(null, 4);
const acervo = [...etica, ...civil, ...penal, ...semMateria];

// Penal: 3 de 12 (25%), amostra suficiente. Ética: 2 de 2, amostra pequena.
const tentativas = { ...responder(penal, 3, 9), ...responder(etica, 2, 0) };

// --- dados reais por matéria ---
{
  const { materias } = montarCadernos(acervo, tentativas);
  const porNome = Object.fromEntries(materias.map((m) => [m.nome, m]));

  exigir(materias.length === 3, `"Sem classificação" não é caderno: esperava 3, vieram ${materias.length}`);
  exigir(porNome['Direito Civil'].peso === 6, 'peso de Civil deveria ser 6 (a tabela da prova)');
  exigir(porNome['Direito Civil'].disponiveis === 13, 'disponíveis de Civil deveria ser 13');
  exigir(porNome['Direito Penal'].nuncaRespondidas === 3, 'Penal tem 12 respondidas de 15');
  exigir(porNome['Direito Penal'].pct === 25, `Penal deveria ter 25%, veio ${porNome['Direito Penal'].pct}`);
  exigir(porNome['Ética Profissional'].pct === null, `com menos de ${AMOSTRA_MINIMA} tentativas a taxa não aparece`);
  exigir(porNome['Direito Civil'].temas.join() === 'Contratos,Família', `temas por frequência, sem "Sem tema": ${porNome['Direito Civil'].temas}`);
}

// --- ordem e selos ---
{
  const { materias } = montarCadernos(acervo, tentativas, { materiaDoPlano: 'Direito Civil' });
  exigir(materias[0].nome === 'Direito Civil', 'a matéria do plano abre a lista');
  exigir(materias[0].selo === 'plano', 'a matéria do plano leva o selo do plano');
  exigir(materias.find((m) => m.nome === 'Ética Profissional').selo === 'peso', 'Ética (8) é a de maior peso');
  exigir(materias.find((m) => m.nome === 'Direito Penal').selo === 'fraco', 'Penal com 25% é o ponto fraco');

  const selos = materias.map((m) => m.selo).filter(Boolean);
  exigir(new Set(selos).size === selos.length, 'um selo não pode aparecer em dois cards');

  const pendentes = montarCadernos(acervo, tentativas, { ordem: 'pendentes' }).materias;
  exigir(pendentes[0].nome === 'Direito Civil', `por pendentes, Civil (13 nunca respondidas) vem primeiro, veio ${pendentes[0].nome}`);
}

// --- misto ---
{
  const { misto } = montarCadernos(acervo, tentativas);
  exigir(misto.disponiveis === 40, `o misto cobre só o que tem matéria: esperava 40, veio ${misto.disponiveis}`);
  exigir(misto.materias === 3, 'o misto conta 3 matérias');
  exigir(misto.pct === 36, `5 acertos em 14 tentativas dão 36%, veio ${misto.pct}`);
}

// --- acervo vazio ---
{
  const { misto, materias } = montarCadernos([], {});
  exigir(materias.length === 0 && misto.disponiveis === 0 && misto.pct === null, 'acervo vazio não pode inventar caderno');
}

if (falhas.length > 0) {
  console.error(`\n❌ ${falhas.length} problema(s):`);
  for (const f of falhas) console.error('   - ' + f);
  process.exit(1);
}

console.log('✅ cadernos: dados reais, taxa só com amostra, plano primeiro, selos únicos');
