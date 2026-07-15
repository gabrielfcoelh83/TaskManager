export const THEMES = {
  rosa: { primary: '#8B5CF6', primaryDark: '#6D28D9', accent: '#EC4899', accentSoft: '#FCE7F3', primarySoft: '#EDE9FE', bg: '#FBF7FA', gradA: '#8B5CF6', gradB: '#EC4899' },
  azul: { primary: '#2563EB', primaryDark: '#1D4ED8', accent: '#06B6D4', accentSoft: '#E0F2FE', primarySoft: '#DBEAFE', bg: '#F6F9FD', gradA: '#2563EB', gradB: '#06B6D4' },
  verde: { primary: '#059669', primaryDark: '#047857', accent: '#0D9488', accentSoft: '#D1FAE5', primarySoft: '#D1FAE5', bg: '#F5FBF8', gradA: '#059669', gradB: '#10B981' },
};

export const THEME_NAMES = { rosa: 'Rosa', azul: 'Azul', verde: 'Verde' };

export function buildStyles(theme) {
  return {
    app: { display: 'flex', height: '100vh', width: '100%', background: theme.bg, overflow: 'hidden' },
    sidebar: { width: '232px', flex: 'none', background: '#fff', borderRight: '1px solid rgba(0,0,0,.06)', display: 'flex', flexDirection: 'column', padding: '20px 14px', gap: '10px', overflowY: 'auto' },
    logoRow: { display: 'flex', alignItems: 'center', gap: 8, padding: '2px 10px 14px' },
    logoMark: { width: 30, height: 30, borderRadius: 9, background: `linear-gradient(135deg, ${theme.gradA}, ${theme.gradB})`, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15 },
    logoText: { fontFamily: "'Roboto',sans-serif", fontWeight: 700, fontSize: 19, color: '#2c2530', lineHeight: 1 },
    logoSub: { fontSize: 10.5, letterSpacing: '2px', color: theme.primary, fontWeight: 600, textTransform: 'uppercase' },
    focusCard: { marginTop: 14, background: theme.accentSoft, borderRadius: 14, padding: '14px 14px', display: 'flex', flexDirection: 'column', gap: 2 },
    profileRow: { marginTop: 'auto', display: 'flex', alignItems: 'center', gap: 10, padding: '12px 8px 4px', borderTop: '1px solid rgba(0,0,0,.06)' },
    avatar: { width: 36, height: 36, borderRadius: '50%', background: `linear-gradient(135deg, ${theme.gradA}, ${theme.gradB})`, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12.5, fontWeight: 700, flex: 'none' },
    main: { flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, height: '100vh' },
    topbar: { flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '22px 32px 18px' },
    pageTitle: { fontFamily: "'Roboto',sans-serif", fontSize: 23, fontWeight: 600, color: '#2c2530' },
    pageSub: { fontSize: 13.5, color: '#8b8391', marginTop: 3 },
    examCard: { display: 'flex', alignItems: 'center', gap: 10, background: '#fff', border: `1px solid ${theme.primarySoft}`, boxShadow: '0 2px 10px rgba(0,0,0,.04)', borderRadius: 14, padding: '10px 18px' },
    bellWrap: { position: 'relative', width: 40, height: 40, borderRadius: '50%', background: '#fff', boxShadow: '0 2px 10px rgba(0,0,0,.04)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' },
    bellBadge: { position: 'absolute', top: -2, right: -2, background: theme.accent, color: '#fff', fontSize: 10, fontWeight: 700, width: 16, height: 16, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' },
    content: { flex: 1, overflowY: 'auto', padding: '0 32px 32px' },
    card: { background: '#fff', borderRadius: 16, border: '1px solid rgba(0,0,0,.05)', boxShadow: '0 1px 3px rgba(0,0,0,.03)', padding: 20 },
    sectionTitle: { fontSize: 16, fontWeight: 700, color: '#2c2530', display: 'flex', alignItems: 'center', gap: 8 },
    link: { fontSize: 12.5, color: theme.primary, fontWeight: 600 },
    statNum: { fontSize: 20, fontWeight: 700, color: '#2c2530' },
    statLabel: { fontSize: 11.5, color: '#8b8391' },
    progressTrack: { height: 8, borderRadius: 5, background: '#f1eef4', overflow: 'hidden' },
    btnPrimary: { background: `linear-gradient(135deg, ${theme.gradA}, ${theme.gradB})`, color: '#fff', border: 'none', borderRadius: 10, padding: '10px 18px', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 },
    btnOutline: { background: '#fff', color: theme.primary, border: `1px solid ${theme.primarySoft}`, borderRadius: 10, padding: '9px 16px', fontSize: 12.5, fontWeight: 600 },
    pill: (bg, fg) => ({ background: bg, color: fg, fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 20 }),
    theme,
  };
}
