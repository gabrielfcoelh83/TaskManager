// O que o Kepy responde (src/lib/kepy.js). Sem IA: cada pergunta cai numa
// regra, e a regra errada manda a pessoa para a tela errada — "quanto falta
// para a prova" respondido com a meta do dia, "processo penal" abrindo
// Direito Penal.

import { responder, guiaDoDia, statusDoDia, materiaCitada } from '../src/lib/kepy.js';

const falhas = [];
const exigir = (condicao, mensagem) => {
  if (!condicao) falhas.push(mensagem);
};

const DISCIPLINAS = ['Direito Penal', 'Direito Processual Penal', 'Direito Civil', 'Direito Processual Civil', 'Ética Profissional', 'Direito Constitucional'];
const ctx = (extra = {}) => ({
  meta: { meta: 40, respondidas: 25, faltam: 15, batida: false },
  materia: { disciplina: 'Direito Penal', motivo: 'é onde você mais erra' },
  foco: 'Faltam 15 em Direito Penal para bater a meta.',
  erros: 12, diasProva: 24, temDataProva: true, sequenciaDias: 4,
  disciplinas: DISCIPLINAS,
  ...extra,
});
const destino = (r) => r.acoes.map((a) => a.estudar || a.ir);

// --- matéria citada ---
{
  exigir(materiaCitada('quero fazer penal', DISCIPLINAS) === 'Direito Penal', '"penal" deveria achar Direito Penal');
  exigir(materiaCitada('processo penal agora', DISCIPLINAS) === 'Direito Processual Penal', '"processo penal" deveria achar Processual Penal, não Penal');
  exigir(materiaCitada('etica', DISCIPLINAS) === 'Ética Profissional', 'sem acento também acha');
  exigir(materiaCitada('constitucional', DISCIPLINAS) === 'Direito Constitucional', 'Constitucional');
  exigir(materiaCitada('direito', DISCIPLINAS) === null, '"direito" sozinho não identifica matéria');
  exigir(materiaCitada('oi', DISCIPLINAS) === null, 'saudação não é matéria');
}

// --- intenções ---
{
  exigir(destino(responder('Quanto falta para a meta?', ctx())).includes('Direito Penal'), 'meta leva à matéria de hoje');
  exigir(/25 de 40/.test(responder('quanto falta pra meta', ctx()).texto), 'meta diz o placar do dia');
  exigir(/24 dias/.test(responder('quanto falta para a prova?', ctx()).texto), '"quanto falta para a prova" é sobre a prova');
  exigir(destino(responder('quando é a prova', ctx({ temDataProva: false, diasProva: null }))).includes('configuracoes'), 'sem data, oferece definir');
  exigir(destino(responder('O que eu revisei mal?', ctx())).includes('revisoes'), 'revisão leva às revisões');
  exigir(destino(responder('o que errei', ctx({ erros: 0 }))).includes('Direito Penal'), 'sem erros, volta ao plano');
  exigir(destino(responder('O que estudar hoje?', ctx())).includes('cronograma'), '"estudar hoje" é plano, não meta');
  exigir(destino(responder('bora processo penal', ctx())).includes('Direito Processual Penal'), 'matéria citada abre o quiz dela');
  exigir(destino(responder('simulado', ctx())).includes('simulados'), 'simulado');
  exigir(/^Oi!/.test(responder('oi', ctx()).texto), 'saudação');
  exigir(!/^Oi!/.test(responder('dois', ctx()).texto), '"dois" não é "oi"');
  const nada = responder('qual a capital da França', ctx());
  exigir(/Ainda não converso/.test(nada.texto) && nada.acoes.length === 1, 'fora do que entende, diz isso e oferece o plano');
}

// --- guia e status ---
{
  const g = guiaDoDia(ctx());
  exigir(g.falas[0] === ctx().foco, 'a primeira fala é o foco do dia');
  exigir(g.falas.length === 3, 'sequência e reta final entram como falas');
  exigir(g.acoes[0].id === 'foco-do-dia', 'a primeira ação é a matéria de hoje');
  exigir(destino(g).includes('revisoes') && destino(g).includes('cronograma'), 'revisão e plano no guia');
  exigir(!destino(guiaDoDia(ctx({ erros: 0 }))).includes('revisoes'), 'sem erros, sem revisão');
  exigir(guiaDoDia(ctx({ meta: { meta: 40, respondidas: 40, faltam: 0, batida: true } })).acoes[0].rotulo === 'Continuar em Direito Penal', 'meta batida vira "Continuar em"');
  exigir(statusDoDia(ctx()) === '25/40 hoje · faltam 15', 'status do dia');
  exigir(/Meta batida/.test(statusDoDia(ctx({ meta: { meta: 40, respondidas: 41, faltam: 0, batida: true } }))), 'status com meta batida');
}

if (falhas.length > 0) {
  console.error(`\n❌ ${falhas.length} problema(s):`);
  for (const f of falhas) console.error('   - ' + f);
  process.exit(1);
}

console.log('✅ o Kepy responde pela regra certa e leva à tela certa');
