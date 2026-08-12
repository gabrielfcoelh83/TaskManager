// O que este arquivo protege mudou de lugar.
//
// Antes existia um banco de questões escrito à mão em `mockData.js`, e este
// teste conferia a integridade dele: alternativa vazia, índice fora da faixa,
// "erro comum" apontando para a resposta certa. Esse banco não existe mais —
// as questões vêm do questoes-service, que só aceita o que foi extraído dos
// cadernos e gabaritos publicados pela FGV, e o schema de lá já recusa
// gabarito fora da faixa e questão sem quatro alternativas.
//
// O que sobrou do lado do front é a TRADUÇÃO entre o formato do acervo e o
// formato das telas. Ela é pequena e parece boba, e é exatamente por isso que
// merece teste: `gabarito` vira `correta`, e trocar essas duas de lugar
// transforma resposta certa em errada sem lançar erro nenhum, sem quebrar
// nenhuma tela, e sem aparecer em revisão de código. O aluno é quem descobre.

import { paraQuestaoDeTela, montarFontes, embaralhar } from '../src/lib/acervo.js';

const falhas = [];
const exigir = (condicao, mensagem) => {
  if (!condicao) falhas.push(mensagem);
};

// Uma questão como o questoes-service devolve: nomes de coluna do banco.
const daApi = (extra = {}) => ({
  id: 101,
  exame: 45,
  tipo_prova: 1,
  numero: 7,
  banca: 'FGV',
  ano: 2025,
  enunciado: 'Enunciado de exemplo, longo o bastante para parecer real.',
  alternativas: ['alfa', 'beta', 'gama', 'delta'],
  gabarito: 2,
  anulada: false,
  disciplina: null,
  tema: null,
  explicacao: null,
  explicacao_fonte: null,
  revisada: false,
  ...extra,
});

// ---------------------------------------------------------------------------
// A tradução do gabarito
// ---------------------------------------------------------------------------

{
  const q = paraQuestaoDeTela(daApi({ gabarito: 2 }));

  exigir(q.correta === 2, `correta deveria ser 2, veio ${q.correta}`);

  // A asserção que importa não é "correta === gabarito", é esta: o texto
  // apontado pelo índice traduzido tem de ser o mesmo texto que o acervo
  // marcou como certo. Um deslocamento de um passa pela igualdade numérica de
  // um jeito e falha aqui.
  exigir(
    q.alternativas[q.correta] === 'gama',
    `o índice traduzido aponta para "${q.alternativas[q.correta]}", esperado "gama"`
  );

  // As quatro posições, uma a uma. O erro clássico de tradução de índice
  // aparece nas pontas (0 e 3), não no meio.
  for (let i = 0; i < 4; i++) {
    const t = paraQuestaoDeTela(daApi({ gabarito: i }));
    exigir(t.correta === i, `gabarito ${i} virou correta ${t.correta}`);
    exigir(
      t.alternativas[t.correta] === ['alfa', 'beta', 'gama', 'delta'][i],
      `gabarito ${i} aponta para a alternativa errada`
    );
  }
}

// ---------------------------------------------------------------------------
// Os campos que a tela precisa saber que podem faltar
// ---------------------------------------------------------------------------

{
  const cru = paraQuestaoDeTela(daApi());

  // Null e não undefined: `undefined` some do JSON e some do React sem deixar
  // rastro, então um campo ausente vira "esqueci de mapear" indistinguível de
  // "o acervo não tem esse dado".
  exigir(cru.disciplina === null, 'disciplina não classificada deveria ser null');
  exigir(cru.topico === null, 'tema ausente deveria virar topico null');
  exigir(cru.explicacao === null, 'explicação ausente deveria ser null');

  // A FGV não publica dificuldade. Se algum dia isto deixar de ser null sem
  // que exista a coluna, é porque alguém começou a inventar o dado.
  exigir(cru.dificuldade === null, 'dificuldade deveria ser null (o acervo não tem)');

  // `revisada` decide se a tela mostra o aviso de "não revisada". Qualquer
  // coisa que não seja `true` tem de contar como não revisada — um `null`
  // vindo do banco não pode virar "revisada" por descuido de coerção.
  exigir(cru.revisada === false, 'revisada ausente deveria ser false');
  exigir(paraQuestaoDeTela(daApi({ revisada: null })).revisada === false, 'revisada null deveria ser false');
  exigir(paraQuestaoDeTela(daApi({ revisada: true })).revisada === true, 'revisada true deveria ser true');

  const completa = paraQuestaoDeTela(
    daApi({ disciplina: 'Direito Penal', tema: 'Furto', explicacao: 'porque sim', explicacao_fonte: 'ia', revisada: false })
  );
  exigir(completa.disciplina === 'Direito Penal', 'disciplina não passou');
  exigir(completa.topico === 'Furto', 'tema deveria virar topico');
  exigir(completa.explicacaoFonte === 'ia', 'explicacao_fonte deveria virar explicacaoFonte');

  // Procedência: é o que a tela mostra no lugar do rótulo inventado antigo.
  exigir(completa.exame === 45 && completa.numero === 7, 'exame/numero deveriam passar');
}

// ---------------------------------------------------------------------------
// De onde o quiz tira questão
// ---------------------------------------------------------------------------

{
  // Sem classificação, o critério tem de cair para o exame — senão a tela
  // mostra uma lista de fontes vazia e um botão que não gera quiz nenhum.
  const semDisciplina = [
    paraQuestaoDeTela(daApi({ id: 1, exame: 45 })),
    paraQuestaoDeTela(daApi({ id: 2, exame: 45 })),
    paraQuestaoDeTela(daApi({ id: 3, exame: 44 })),
  ];

  const porExame = montarFontes(semDisciplina);
  exigir(porExame.criterio === 'exame', `critério deveria ser exame, veio ${porExame.criterio}`);
  exigir(porExame.fontes.length === 2, `esperadas 2 fontes, vieram ${porExame.fontes.length}`);
  exigir(porExame.fontes[0].chave === '45', 'o exame mais recente deveria vir primeiro');
  exigir(porExame.fontes[0].total === 2, `o 45º deveria ter 2 questões, tem ${porExame.fontes[0].total}`);
  exigir(porExame.fontes[0].rotulo === '45º Exame de Ordem', `rótulo inesperado: ${porExame.fontes[0].rotulo}`);

  // A chave tem de casar com a questão, senão o filtro do quiz devolve vazio
  // com a fonte marcada — o pior tipo de falha, porque parece escolha do aluno.
  const chave = porExame.chaveDe(semDisciplina[0]);
  exigir(
    semDisciplina.filter((q) => porExame.chaveDe(q) === chave).length === 2,
    'chaveDe não casa com as fontes que ela mesma montou'
  );

  // Com classificação, o critério vira disciplina e o exame some da barra.
  const comDisciplina = [
    paraQuestaoDeTela(daApi({ id: 1, disciplina: 'Direito Penal' })),
    paraQuestaoDeTela(daApi({ id: 2, disciplina: 'Direito Penal' })),
    paraQuestaoDeTela(daApi({ id: 3, disciplina: 'Direito Civil' })),
  ];

  const porDisc = montarFontes(comDisciplina);
  exigir(porDisc.criterio === 'disciplina', `critério deveria ser disciplina, veio ${porDisc.criterio}`);
  exigir(porDisc.fontes[0].chave === 'Direito Penal', 'a disciplina com mais questões deveria vir primeiro');
  exigir(porDisc.fontes[0].total === 2, 'contagem por disciplina errada');

  // Acervo vazio não pode explodir: é o estado do primeiro dia.
  const vazio = montarFontes([]);
  exigir(Array.isArray(vazio.fontes) && vazio.fontes.length === 0, 'acervo vazio deveria dar lista de fontes vazia');
}

// ---------------------------------------------------------------------------
// Embaralhar não pode perder nem duplicar questão
// ---------------------------------------------------------------------------

{
  const original = Array.from({ length: 50 }, (_, i) => ({ id: i }));
  const misturado = embaralhar(original);

  exigir(misturado.length === original.length, 'embaralhar mudou o tamanho do quiz');
  exigir(
    new Set(misturado.map((q) => q.id)).size === original.length,
    'embaralhar duplicou ou perdeu questão'
  );
  exigir(original[0].id === 0, 'embaralhar não pode mexer na lista original');

  // Um Fisher-Yates escrito errado costuma travar elementos no lugar. Em 50
  // itens, sair idêntico é praticamente impossível por acaso.
  exigir(
    misturado.some((q, i) => q.id !== i),
    'embaralhar devolveu a lista na mesma ordem'
  );
}

if (falhas.length > 0) {
  console.error(`\n❌ ${falhas.length} problema(s):`);
  for (const f of falhas) console.error('   - ' + f);
  process.exit(1);
}

console.log('✅ tradução do acervo, seleção de fontes e embaralhamento íntegros');
