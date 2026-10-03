// Paletas sóbrias, de papel e tinta: uma cor de marca escura, um acento
// terroso e neutros quentes. O violeta→rosa em degradê que estava aqui é a
// paleta padrão de todo app gerado às pressas, e fazia o estudo de OAB parecer
// um template. `gradA`/`gradB` continuam existindo porque várias telas montam
// `linear-gradient(gradA, gradB)` — com as duas iguais, o "degradê" é uma cor
// chapada, que é o que queremos.
// Cada paleta: uma cor de marca escura, um acento que conversa com ela e um
// papel levemente tingido. A regra entre elas é a mesma — saturação contida,
// nada de neon — para que trocar de paleta mude o humor sem mudar o produto.
export const THEMES = {
  bordo: { primary: '#7A2E2E', primaryDark: '#5C1F1F', accent: '#B4532A', accentSoft: '#F5ECE4', primarySoft: '#F2E7E4', bg: '#F7F5F0', gradA: '#7A2E2E', gradB: '#7A2E2E' },
  tinta: { primary: '#1F3A5F', primaryDark: '#142842', accent: '#3D6B8C', accentSoft: '#E7EDF2', primarySoft: '#E5EBF2', bg: '#F5F5F2', gradA: '#1F3A5F', gradB: '#1F3A5F' },
  oliva: { primary: '#3F5A3A', primaryDark: '#2C4129', accent: '#7A8B3E', accentSoft: '#EDEFE2', primarySoft: '#E7EDE3', bg: '#F6F6F1', gradA: '#3F5A3A', gradB: '#3F5A3A' },
  ameixa: { primary: '#5B3A64', primaryDark: '#432A4A', accent: '#9A5B7C', accentSoft: '#F3EAF0', primarySoft: '#EEE7F0', bg: '#F7F5F5', gradA: '#5B3A64', gradB: '#5B3A64' },
  rose: { primary: '#9A4A5F', primaryDark: '#7A3548', accent: '#C27A5A', accentSoft: '#F7ECE6', primarySoft: '#F5E8EB', bg: '#F9F6F4', gradA: '#9A4A5F', gradB: '#9A4A5F' },
  petroleo: { primary: '#1E5560', primaryDark: '#143E46', accent: '#B07A1F', accentSoft: '#F5EEDC', primarySoft: '#E3EEEF', bg: '#F4F6F4', gradA: '#1E5560', gradB: '#1E5560' },
  grafite: { primary: '#2E2D2B', primaryDark: '#1C1B19', accent: '#B4532A', accentSoft: '#F5ECE4', primarySoft: '#ECEAE6', bg: '#F6F5F2', gradA: '#2E2D2B', gradB: '#2E2D2B' },
};

export const THEME_NAMES = { bordo: 'Bordô', tinta: 'Tinta', oliva: 'Oliva', ameixa: 'Ameixa', rose: 'Rosé', petroleo: 'Petróleo', grafite: 'Grafite' };

// Uma linha sobre o humor de cada paleta, mostrada na escolha em Configurações.
export const THEME_DESCRICOES = {
  bordo: 'Clássica de escritório de advocacia',
  tinta: 'Azul de caneta-tinteiro, sóbria',
  oliva: 'Verde calmo para sessões longas',
  ameixa: 'Roxo discreto, sem degradê',
  rose: 'Rosa queimado, quente',
  petroleo: 'Azul-esverdeado com acento âmbar',
  grafite: 'Quase monocromática',
};

export const TEMA_PADRAO = 'bordo';

// Quem escolheu uma paleta antiga continua com a equivalente.
const LEGADO = { rosa: 'rose', azul: 'tinta', verde: 'oliva' };

/** A chave de tema válida para o que estiver salvo (inclusive as antigas). */
export function chaveDeTema(chave) {
  if (THEMES[chave]) return chave;
  return LEGADO[chave] || TEMA_PADRAO;
}

/** Leva a paleta para as variáveis CSS que os componentes do shadcn leem. */
export function aplicarTemaNoDocumento(theme, raiz = document.documentElement) {
  raiz.style.setProperty('--primary', theme.primary);
  raiz.style.setProperty('--primary-soft', theme.primarySoft);
  raiz.style.setProperty('--tema-acento', theme.accent);
}

export const FONTE_TEXTO = "'Geist', system-ui, sans-serif";
export const FONTE_TITULO = "'Newsreader', Georgia, serif";

const TINTA = '#1c1b19';
const MUDO = '#7a766f';
const LINHA = '#e6e2da';

// Anel de 1px + elevação curta + ambiente suave. Adapta a qualquer fundo de
// paleta, ao contrário de uma borda de cor fixa.
export const SOMBRA = '0 0 0 1px rgba(28,27,25,.07), 0 1px 2px -1px rgba(28,27,25,.08), 0 2px 4px 0 rgba(28,27,25,.04)';
export const SOMBRA_ALTA = '0 0 0 1px rgba(28,27,25,.09), 0 2px 4px -1px rgba(28,27,25,.10), 0 8px 16px -4px rgba(28,27,25,.08)';

export function buildStyles(theme) {
  return {
    app: { display: 'flex', height: '100vh', width: '100%', background: theme.bg, overflow: 'hidden' },
    // A largura anima ao recolher (ver `barraRecolhida` no App); 72px é o
    // ícone de 20px com o mesmo respiro dos itens abertos.
    sidebar: { width: '232px', transition: 'width 220ms var(--ease-out)', flex: 'none', background: theme.bg, borderRight: `1px solid ${LINHA}`, display: 'flex', flexDirection: 'column', padding: '20px 14px', gap: '10px', overflowY: 'auto' },
    logoRow: { display: 'flex', alignItems: 'center', gap: 8, padding: '2px 10px 14px' },
    logoMark: { width: 30, height: 30, borderRadius: 6, background: theme.primary, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15 },
    logoText: { fontFamily: FONTE_TITULO, fontWeight: 600, fontSize: 21, color: TINTA, lineHeight: 1, letterSpacing: '-0.01em' },
    logoSub: { fontSize: 10.5, letterSpacing: '1.5px', color: MUDO, fontWeight: 500, textTransform: 'uppercase' },
    focusCard: { marginTop: 14, background: '#fff', boxShadow: SOMBRA, borderLeft: `3px solid ${theme.accent}`, borderRadius: 8, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 2 },
    profileRow: { marginTop: 'auto', display: 'flex', alignItems: 'center', gap: 10, padding: '12px 8px 4px', borderTop: `1px solid ${LINHA}` },
    avatar: { width: 34, height: 34, borderRadius: '50%', background: theme.primarySoft, color: theme.primaryDark, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600, flex: 'none' },
    main: { flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, height: '100vh' },
    topbar: { flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '24px 32px 20px' },
    pageTitle: { fontFamily: FONTE_TITULO, fontSize: 28, fontWeight: 500, color: TINTA, letterSpacing: '-0.015em', lineHeight: 1.1, textWrap: 'balance' },
    pageSub: { fontSize: 13.5, color: MUDO, marginTop: 5, textWrap: 'pretty' },
    examCard: { display: 'flex', alignItems: 'center', gap: 10, background: '#fff', boxShadow: SOMBRA, borderRadius: 10, padding: '8px 14px' },
    bellWrap: { position: 'relative', width: 40, height: 40, borderRadius: 10, background: '#fff', boxShadow: SOMBRA, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' },
    bellBadge: { position: 'absolute', top: -5, right: -5, background: theme.accent, color: '#fff', fontSize: 10, fontWeight: 600, minWidth: 16, height: 16, padding: '0 4px', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontVariantNumeric: 'tabular-nums' },
    content: { flex: 1, overflowY: 'auto', padding: '0 32px 32px' },
    card: { background: '#fff', borderRadius: 12, boxShadow: SOMBRA, padding: 20 },
    sectionTitle: { fontSize: 15, fontWeight: 600, color: TINTA, display: 'flex', alignItems: 'center', gap: 8, letterSpacing: '-0.005em' },
    link: { fontSize: 12.5, color: theme.primary, fontWeight: 500 },
    statNum: { fontSize: 22, fontWeight: 600, color: TINTA, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.01em' },
    statLabel: { fontSize: 11.5, color: MUDO },
    progressTrack: { height: 6, borderRadius: 3, background: '#eeebe5', overflow: 'hidden' },
    btnPrimary: { background: theme.primary, color: '#fff', border: `1px solid ${theme.primaryDark}`, borderRadius: 7, padding: '9px 16px', fontSize: 13, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 },
    btnOutline: { background: '#fff', color: TINTA, border: `1px solid ${LINHA}`, borderRadius: 7, padding: '8px 14px', fontSize: 12.5, fontWeight: 500 },
    pill: (bg, fg) => ({ background: bg, color: fg, fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 4 }),
    theme,
  };
}
