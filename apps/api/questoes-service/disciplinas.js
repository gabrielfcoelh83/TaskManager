// Disciplinas da 1ª fase e de onde a disciplina de cada questão vem.
//
// A FGV monta a prova objetiva em BLOCOS FIXOS: as questões de Ética vêm
// primeiro, depois Filosofia, depois Constitucional, e assim por diante até
// Processual do Trabalho no fim. A disciplina de uma questão, portanto, não é
// opinião de ninguém: é a posição dela no caderno. Isto é fato da banca, do
// mesmo jeito que o gabarito, e é por isso que sai daqui e não de um modelo.
//
// Antes a disciplina era escolhida pela IA (classificar.js). No 45º Exame ela
// errou 16 de 72. Quatro erros eram inevitáveis: a lista que ela podia
// escolher nem tinha Direito Eleitoral e Direito Financeiro, e a prestação de
// contas do Fundo Partidário virou Direito Administrativo. Os outros doze
// confundem disciplinas vizinhas — revisão criminal e cadeia de custódia
// viraram Direito Penal, perda de nacionalidade virou Internacional. Um rótulo errado não ensina Direito errado, mas põe a questão na
// gaveta errada, e a gaveta é o filtro que o aluno usa para estudar.
//
// Este arquivo é a ÚNICA fonte da lista de disciplinas. O classificar.js
// importa daqui; uma segunda cópia lá dentro seria a forma de a lista fechada
// da IA e a tabela da prova divergirem sem ninguém perceber.

// Lista oficial, na ordem em que os blocos aparecem na prova. É também a
// lista fechada que a IA usa quando precisa escolher disciplina (questão de
// exame ou tipo que a tabela abaixo não conhece).
const DISCIPLINAS = [
  'Ética Profissional',
  'Filosofia do Direito',
  'Direito Constitucional',
  'Direitos Humanos',
  'Direito Eleitoral',
  'Direito Internacional',
  'Direito Financeiro',
  'Direito Tributário',
  'Direito Administrativo',
  'Direito Ambiental',
  'Direito Civil',
  'Direito da Criança e do Adolescente',
  'Direito do Consumidor',
  'Direito Empresarial',
  'Direito Processual Civil',
  'Direito Penal',
  'Direito Processual Penal',
  'Direito Previdenciário',
  'Direito do Trabalho',
  'Direito Processual do Trabalho',
];

// Blocos da prova, [disciplina, primeira questão, última questão].
//
// Conferida pelo conteúdo, nas fronteiras (última questão de cada bloco e
// primeira do seguinte), no 44º e no 45º Exame: as duas provas têm
// exatamente esta distribuição. Exemplos do que decide uma fronteira: no 45º,
// a 62 é coação moral irresistível (Penal) e a 63 pede "a providência de
// Direito Processual Penal" contra condenação transitada; a 18 é proteção
// judicial na Corte Interamericana (Direitos Humanos) e a 19 é cessão de
// escola a partido para convenção (Eleitoral).
const BLOCOS_44_45 = [
  ['Ética Profissional', 1, 8],
  ['Filosofia do Direito', 9, 10],
  ['Direito Constitucional', 11, 16],
  ['Direitos Humanos', 17, 18],
  ['Direito Eleitoral', 19, 20],
  ['Direito Internacional', 21, 22],
  ['Direito Financeiro', 23, 24],
  ['Direito Tributário', 25, 29],
  ['Direito Administrativo', 30, 34],
  ['Direito Ambiental', 35, 36],
  ['Direito Civil', 37, 42],
  ['Direito da Criança e do Adolescente', 43, 44],
  ['Direito do Consumidor', 45, 46],
  ['Direito Empresarial', 47, 50],
  ['Direito Processual Civil', 51, 56],
  ['Direito Penal', 57, 62],
  ['Direito Processual Penal', 63, 68],
  ['Direito Previdenciário', 69, 70],
  ['Direito do Trabalho', 71, 75],
  ['Direito Processual do Trabalho', 76, 80],
];

// Exames conferidos → blocos e tipos de prova. SÓ entra aqui exame cujas
// fronteiras alguém conferiu contra o caderno. Não há "padrão para o resto"
// de propósito: o edital define a composição da 1ª fase e pode mudá-la de um
// exame para outro, e um exame de outra composição aplicado a esta tabela
// teria as fronteiras deslocadas — Penal gravado como Processual Penal, com
// fonte 'prova', que é justamente a fonte em que se confia sem olhar. Exame
// fora daqui devolve null e continua com a IA, que ao menos sai marcada 'ia'.
//
// TIPOS DE PROVA. Os tipos 1 a 4 são a mesma prova com as questões
// embaralhadas — mas só DENTRO de cada bloco. No 44º, comparando os quatro
// cadernos, 7 a 16 questões ficam na mesma posição entre tipos, e as 80 de
// cada tipo caem no mesmo bloco do tipo 1 (a questão 1 do tipo 1 é a 6 do
// tipo 2, ainda em Ética). Então a tabela vale para os quatro tipos daquele
// exame. Mesmo assim os tipos são listados por exame, e não presumidos: no
// 45º só o tipo 1 foi conferido, e é o único que o acervo importa.
//
// Para acrescentar um exame: importar o tipo 1, ler a última questão de cada
// bloco e a primeira do seguinte, e só então apontar para a tabela certa (ou
// criar outra, se a distribuição for diferente).
const TABELAS_POR_EXAME = {
  44: { blocos: BLOCOS_44_45, tipos: [1, 2, 3, 4] },
  45: { blocos: BLOCOS_44_45, tipos: [1] },
};

// Devolve o nome da disciplina daquela posição, ou null quando a tabela não
// conhece o exame/tipo. null não é erro: é "não sei", e quem chama deixa a
// disciplina como está.
function disciplinaPorPosicao(exame, tipo, numero) {
  const tabela = TABELAS_POR_EXAME[Number(exame)];
  if (!tabela || !tabela.tipos.includes(Number(tipo))) return null;

  const n = Number(numero);
  const bloco = tabela.blocos.find(([, primeira, ultima]) => n >= primeira && n <= ultima);
  return bloco ? bloco[0] : null;
}

module.exports = { DISCIPLINAS, TABELAS_POR_EXAME, disciplinaPorPosicao };
