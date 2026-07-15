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

export const PAGE_META = {
  dashboard: { title: 'Olá, Maria! 💜', sub: 'Vamos continuar rumo à aprovação na OAB?' },
  cronograma: { title: 'Cronograma', sub: 'Seu plano de estudos organizado especialmente para você.' },
  questoes: { title: 'Questões', sub: 'Pratique questões filtradas por disciplina, banca e dificuldade.' },
  simulados: { title: 'Simulados', sub: 'Treine em condições reais de prova.' },
  revisoes: { title: 'Revisões', sub: 'Sua revisão inteligente para fixar o que realmente importa.' },
  desempenho: { title: 'Desempenho', sub: 'Acompanhe sua evolução ao longo do tempo.' },
  estatisticas: { title: 'Estatísticas', sub: 'Números detalhados do seu estudo.' },
  favoritos: { title: 'Favoritos', sub: 'Questões que você marcou como favoritas.' },
  disciplinas: { title: 'Disciplinas', sub: 'Organize seu estudo por matéria.' },
  anotacoes: { title: 'Anotações', sub: 'Organize seus resumos, mapas mentais e ideias.' },
  configuracoes: { title: 'Configurações', sub: 'Preferências da sua conta.' },
};

export const DISCIPLINAS = [
  { nome: 'Direito Constitucional', pct: 85, horas: '35h 20m', cor: '#8B5CF6' },
  { nome: 'Direito Administrativo', pct: 72, horas: '28h 10m', cor: '#EC4899' },
  { nome: 'Direito Civil', pct: 68, horas: '20h 30m', cor: '#06B6D4' },
  { nome: 'Direito Penal', pct: 65, horas: '18h 40m', cor: '#F59E0B' },
  { nome: 'Direito do Trabalho', pct: 60, horas: '14h 05m', cor: '#10B981' },
  { nome: 'Direito Tributário', pct: 35, horas: '9h 15m', cor: '#EF4444' },
  { nome: 'Direito Empresarial', pct: 40, horas: '8h 50m', cor: '#6366F1' },
  { nome: 'Direito Internacional', pct: 45, horas: '7h 30m', cor: '#0EA5E9' },
];

export const QUESTOES = [
  { id: 1, disciplina: 'Direito Constitucional', dificuldade: 'Média', banca: 'FGV', ano: 2023, enunciado: 'Sobre os direitos e garantias fundamentais, assinale a alternativa correta.', alternativas: ['São absolutos e não admitem restrição.', 'Podem ser objeto de cláusula pétrea.', 'Aplicam-se apenas a brasileiros natos.', 'Excluem os estrangeiros residentes.'], correta: 1 },
  { id: 2, disciplina: 'Direito Administrativo', dificuldade: 'Fácil', banca: 'CEBRASPE', ano: 2022, enunciado: 'A administração pública direta e indireta de qualquer dos Poderes obedecerá, entre outros, ao princípio da:', alternativas: ['Discricionariedade plena', 'Legalidade', 'Autotutela irrestrita', 'Hierarquia absoluta'], correta: 1 },
  { id: 3, disciplina: 'Direito Penal', dificuldade: 'Difícil', banca: 'FGV', ano: 2023, enunciado: 'Quanto ao crime de furto, é correto afirmar que:', alternativas: ['Admite tentativa', 'É crime unissubsistente', 'Não admite qualificadoras', 'Exige violência à pessoa'], correta: 0 },
  { id: 4, disciplina: 'Direito Civil', dificuldade: 'Média', banca: 'CEBRASPE', ano: 2022, enunciado: 'Nos termos do Código Civil, a personalidade civil da pessoa começa:', alternativas: ['Na concepção', 'Do nascimento com vida', 'Aos 16 anos', 'Com o registro civil'], correta: 1 },
  { id: 5, disciplina: 'Direito do Trabalho', dificuldade: 'Fácil', banca: 'FGV', ano: 2023, enunciado: 'A relação de emprego é caracterizada pela pessoalidade, onerosidade, não eventualidade e:', alternativas: ['Subordinação', 'Autonomia plena', 'Eventualidade', 'Gratuidade'], correta: 0 },
  { id: 6, disciplina: 'Direito Tributário', dificuldade: 'Difícil', banca: 'FGV', ano: 2021, enunciado: 'O princípio da anterioridade tributária determina que:', alternativas: ['O tributo pode ser cobrado imediatamente', 'A lei deve ser anterior ao exercício de cobrança', 'Não se aplica a impostos', 'É exclusivo de taxas'], correta: 1 },
];

export const SIMULADOS = [
  { id: 1, nome: 'Simulado OAB - 1ª Fase Completo', questoes: 80, tempo: '5h', status: 'disponivel', ultimaNota: null },
  { id: 2, nome: 'Simulado Direito Constitucional', questoes: 20, tempo: '1h 30m', status: 'em_andamento', progresso: 45 },
  { id: 3, nome: 'Simulado Direito Civil e Processual', questoes: 20, tempo: '1h 30m', status: 'concluido', ultimaNota: 72 },
  { id: 4, nome: 'Simulado Ético-Profissional', questoes: 15, tempo: '1h', status: 'concluido', ultimaNota: 88 },
];

export const CRONOGRAMA_DIAS = [
  { dow: 'SEG', dia: 13, disciplina: 'Direito Constitucional', topico: 'Direitos e Garantias Fundamentais', tempo: '2h de estudo', qtd: '30 questões', hoje: true, progresso: 60 },
  { dow: 'TER', dia: 14, disciplina: 'Direito Administrativo', topico: 'Atos Administrativos', tempo: '2h de estudo', qtd: '25 questões', hoje: false, progresso: 0 },
  { dow: 'QUA', dia: 15, disciplina: 'Direito Penal', topico: 'Princípios do Direito Penal', tempo: '2h de estudo', qtd: '30 questões', hoje: false, progresso: 0 },
  { dow: 'QUA', dia: 16, disciplina: 'Direito Civil', topico: 'Parte Geral — Pessoas Naturais', tempo: '2h de estudo', qtd: '25 questões', hoje: false, progresso: 0 },
  { dow: 'SEX', dia: 17, disciplina: 'Direito do Trabalho', topico: 'Relação de Trabalho', tempo: '2h de estudo', qtd: '20 questões', hoje: false, progresso: 0 },
  { dow: 'SAB', dia: 18, disciplina: 'Direito Empresarial', topico: 'Empresário e Sociedade Empresária', tempo: '2h de estudo', qtd: '25 questões', hoje: false, progresso: 0 },
  { dow: 'DOM', dia: 19, disciplina: 'Revisões e Questões', topico: 'Revisão geral da semana', tempo: '2h de estudo', qtd: '40 questões', hoje: false, progresso: 0 },
];

export const ANOTACOES_FOLDERS = ['Todas', 'Direito Constitucional', 'Direito Administrativo', 'Direito Penal', 'Direito Civil', 'Direito do Trabalho'];

export const ANOTACOES = [
  { id: 1, titulo: 'Princípios da Administração Pública', disciplina: 'Direito Administrativo', tag: 'Resumo', data: 'Hoje às 10:30', conteudo: 'Os princípios da Administração Pública são diretrizes que orientam a atuação do Estado: Legalidade, Impessoalidade, Moralidade, Publicidade e Eficiência (LIMPE).' },
  { id: 2, titulo: 'Controle de Constitucionalidade', disciplina: 'Direito Constitucional', tag: 'Resumo', data: 'Ontem às 22:15', conteudo: 'O controle pode ser difuso (qualquer juiz) ou concentrado (STF), preventivo ou repressivo, exercido pelos Poderes Legislativo, Executivo e Judiciário.' },
  { id: 3, titulo: 'Prazos Processuais', disciplina: 'Direito Civil', tag: 'Mapa mental', data: '12/05/2025', conteudo: 'Mapa mental relacionando prazos processuais cíveis: contestação (15 dias úteis), recursos (15 dias úteis), embargos de declaração (5 dias úteis).' },
  { id: 4, titulo: 'Crimes contra a Administração Pública', disciplina: 'Direito Penal', tag: 'Resumo', data: '12/05/2025', conteudo: 'Peculato, corrupção passiva e ativa, concussão, prevaricação — todos exigem sujeito ativo funcionário público, com exceções específicas de cada tipo.' },
  { id: 5, titulo: 'Improbidade Administrativa (Lei 8.429/92)', disciplina: 'Direito Administrativo', tag: 'Lei seca', data: '11/05/2025', conteudo: 'A lei classifica os atos de improbidade em três categorias: que causam enriquecimento ilícito, prejuízo ao erário, e que violam princípios da administração.' },
  { id: 6, titulo: 'Responsabilidade Civil', disciplina: 'Direito Civil', tag: 'Resumo', data: '10/05/2025', conteudo: 'A responsabilidade civil pode ser subjetiva (exige culpa) ou objetiva (independe de culpa, baseada no risco da atividade).' },
];

export const DAY_ICON_MAP = {
  'Direito Constitucional': 'scale',
  'Direito Administrativo': 'clipboard-list',
  'Direito Penal': 'gavel',
  'Direito Civil': 'book-open',
  'Direito do Trabalho': 'briefcase',
  'Direito Empresarial': 'building-2',
  'Revisões e Questões': 'repeat',
};

export const TAG_COLORS = {
  'Resumo': ['#EDE9FE', null], // fg resolved to theme.primaryDark at render time
  'Mapa mental': ['#FCE7F3', '#BE185D'],
  'Lei seca': ['#FEF3C7', '#B45309'],
};

export function topicosPorDisciplina(nome) {
  const seed = nome.length;
  return ['Fundamentos', 'Princípios gerais', 'Procedimentos', 'Jurisprudência aplicada', 'Casos práticos'].map((t, i) => ({
    nome: t, pct: Math.max(20, (seed * 7 + i * 13) % 100),
  }));
}
