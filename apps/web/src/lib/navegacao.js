// Menu lateral e cabeçalho de cada tela.
//
// É o que sobrou do antigo `mockData.js` depois que as questões foram para o
// questoes-service, as disciplinas para `disciplinas.js` e o cronograma para
// `agenda.js`. Nada aqui é dado de ninguém: são rótulos da interface.

export const NAV = [
  { key: 'dashboard', icon: 'layout-grid', label: 'Dashboard' },
  { key: 'cronograma', icon: 'calendar', label: 'Cronograma' },
  { key: 'questoes', icon: 'book-open', label: 'Questões' },
  { key: 'simulados', icon: 'timer', label: 'Simulados' },
  { key: 'revisoes', icon: 'repeat', label: 'Revisões' },
  { key: 'desempenho', icon: 'trending-up', label: 'Desempenho' },
  { key: 'estatisticas', icon: 'chart-column', label: 'Estatísticas' },
  { key: 'favoritos', icon: 'star', label: 'Favoritos' },
  { key: 'disciplinas', icon: 'library', label: 'Disciplinas' },
  { key: 'anotacoes', icon: 'notebook-pen', label: 'Anotações' },
  { key: 'configuracoes', icon: 'settings', label: 'Configurações' },
];

// O título do dashboard é o único que depende de quem entrou, e por isso é
// montado em tempo de render (`saudacao`) em vez de ficar escrito aqui — era
// "Olá, Maria!" para qualquer conta.
export const PAGE_META = {
  dashboard: { sub: 'Vamos continuar rumo à aprovação na OAB?' },
  cronograma: { title: 'Cronograma', sub: 'Uma sugestão de semana, montada a partir do seu desempenho.' },
  questoes: { title: 'Questões', sub: 'Questões dos Exames de Ordem, com o gabarito oficial da FGV.' },
  simulados: { title: 'Simulados', sub: 'Treine em condições reais de prova.' },
  revisoes: { title: 'Revisões', sub: 'O que você errou e o que marcou para rever.' },
  desempenho: { title: 'Desempenho', sub: 'Acompanhe sua evolução ao longo do tempo.' },
  estatisticas: { title: 'Estatísticas', sub: 'Números detalhados do seu estudo.' },
  favoritos: { title: 'Favoritos', sub: 'Questões que você marcou como favoritas.' },
  disciplinas: { title: 'Disciplinas', sub: 'Seu aproveitamento em cada matéria do acervo.' },
  anotacoes: { title: 'Anotações', sub: 'Seus resumos e ideias, guardados neste navegador.' },
  configuracoes: { title: 'Configurações', sub: 'Preferências da sua conta.' },
};

export const ICONE_POR_DISCIPLINA = {
  'Direito Constitucional': 'landmark',
  'Direito Administrativo': 'clipboard-list',
  'Direito Civil': 'users',
  'Direito Penal': 'gavel',
  'Direito Processual Penal': 'gavel',
  'Direito Processual Civil': 'file-text',
  'Direito do Trabalho': 'briefcase',
  'Direito Processual do Trabalho': 'briefcase',
  'Direito Tributário': 'file-text',
  'Direito Empresarial': 'building-2',
  'Direito Internacional': 'book-open',
  'Direito Ambiental': 'library',
  'Direito do Consumidor': 'clipboard-list',
  'Direito da Criança e do Adolescente': 'users',
  'Direito Previdenciário': 'clipboard-list',
  'Direitos Humanos': 'scale',
  'Ética Profissional': 'scale',
  'Filosofia do Direito': 'brain',
};

export const TAG_CORES = {
  'Resumo': ['#EDE9FE', null], // o segundo valor vira theme.primaryDark na tela
  'Mapa mental': ['#FCE7F3', '#BE185D'],
  'Lei seca': ['#FEF3C7', '#B45309'],
  'Jurisprudência': ['#DBEAFE', '#1D4ED8'],
};

export const TAGS = Object.keys(TAG_CORES);
