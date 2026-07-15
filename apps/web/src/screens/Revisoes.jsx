import { Icon } from '../lib/icons';

const TAB_DEFS = [
  { key: 'todas', label: 'Todas para revisar' },
  { key: 'errei', label: 'Errei' },
  { key: 'favoritas', label: 'Favoritas' },
  { key: 'marcadas', label: 'Marcadas' },
  { key: 'menor', label: 'Menor desempenho' },
];

function iw(from, to) {
  return { width: 38, height: 38, borderRadius: 11, background: `linear-gradient(135deg, ${from}, ${to})`, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' };
}

function dot(c) {
  return { width: 8, height: 8, borderRadius: '50%', background: c, display: 'inline-block' };
}

export default function Revisoes({ theme, s, data, rev, setRev, favoritos, toggleFavorito }) {
  const all = data.QUESTOES || [];

  let filtered = all;
  if (rev.tab === 'favoritas') filtered = all.filter((q) => favoritos.includes(q.id));
  if (rev.tab === 'menor') filtered = [...all].sort((a, b) => a.id - b.id).slice(0, 3);

  const visibleItems = filtered.map((q, i) => ({ ...q, idx: i + 1, favActive: favoritos.includes(q.id) }));

  const stats = [
    { iconWrap: iw('#F87171', '#DC2626'), icon: 'circle-x', value: 212, label: 'Errei' },
    { iconWrap: iw(theme.gradA, theme.gradB), icon: 'star', value: favoritos.length || 48, label: 'Favoritas' },
    { iconWrap: iw('#4F8EF7', '#2F6FE0'), icon: 'bookmark', value: 36, label: 'Marcadas' },
    { iconWrap: iw('#FBBF24', '#D97706'), icon: 'trending-down', value: 15, label: 'Menor desempenho' },
  ];

  const menores = (data.DISCIPLINAS || []).slice().sort((a, b) => a.pct - b.pct).slice(0, 5);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '2.2fr 1fr', gap: 18, alignItems: 'start' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14 }}>
          {stats.map((st, i) => (
            <div key={i} style={s.card}>
              <div style={st.iconWrap}><Icon name={st.icon} color="#fff" size={20} /></div>
              <div style={{ ...s.statNum, marginTop: 8 }}>{st.value}</div>
              <div style={s.statLabel}>{st.label}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {TAB_DEFS.map((t) => (
            <button
              key={t.key}
              onClick={() => setRev({ tab: t.key })}
              style={{
                background: rev.tab === t.key ? theme.primarySoft : '#fff',
                color: rev.tab === t.key ? theme.primaryDark : '#5c5462',
                border: rev.tab === t.key ? 'none' : '1px solid rgba(0,0,0,.08)',
                borderRadius: 10, padding: '9px 14px', fontSize: 12.5, fontWeight: 600,
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {visibleItems.map((q) => (
            <div key={q.id} style={{ ...s.card, display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: theme.primarySoft, color: theme.primaryDark, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, flex: 'none' }}>{q.idx}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#2c2530' }}>{q.disciplina}</div>
                <div style={{ fontSize: 13, color: '#5c5462', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{q.enunciado}</div>
                <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                  <span style={s.pill('#f3f1f5', '#8b8391')}>Ano: {q.ano}</span>
                  <span style={s.pill('#f3f1f5', '#8b8391')}>Banca: {q.banca}</span>
                  <span style={s.pill('#f3f1f5', '#8b8391')}>Dificuldade: {q.dificuldade}</span>
                </div>
              </div>
              <span style={s.pill('#FEE2E2', '#B91C1C')}>{q.favActive ? 'Favorita' : 'Errei'}</span>
              <button data-testid={`fav-toggle-${q.id}`} style={{ background: 'none', border: 'none', flex: 'none' }} onClick={() => toggleFavorito(q.id)}>
                <Icon name="star" color={q.favActive ? '#F59E0B' : '#c9c3cf'} size={19} />
              </button>
              <button style={s.btnPrimary}>▶ Revisar agora</button>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={s.card}>
          <div style={s.sectionTitle}>Seu desempenho nas revisões</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 16 }}>
            <div style={{ width: 88, height: 88, borderRadius: '50%', background: 'conic-gradient(#10B981 0% 68%, #EF4444 68% 90%, #e5e2ea 90% 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
              <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#2c2530' }}>68%</div>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12.5 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={dot('#10B981')}></span>Acertos <b style={{ marginLeft: 'auto' }}>146</b></div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={dot('#EF4444')}></span>Erros <b style={{ marginLeft: 'auto' }}>68</b></div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={dot('#8b8391')}></span>Em aberto <b style={{ marginLeft: 'auto' }}>24</b></div>
            </div>
          </div>
        </div>
        <div style={s.card}>
          <div style={s.sectionTitle}>Assuntos com menor desempenho</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 11, marginTop: 14 }}>
            {menores.map((d) => (
              <div key={d.nome}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}><span style={{ color: '#2c2530' }}>{d.nome}</span><span style={{ color: '#8b8391' }}>{d.pct}%</span></div>
                <div style={{ ...s.progressTrack, marginTop: 5 }}><div style={{ width: d.pct + '%', height: '100%', background: '#EF4444', borderRadius: 5 }} /></div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ background: `linear-gradient(135deg, ${theme.gradA}, ${theme.gradB})`, borderRadius: 16, padding: '18px 20px', color: '#fff' }}>
          <div style={{ fontSize: 14.5, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}><Icon name="lightbulb" color="#fff" size={22} />Dica de hoje</div>
          <div style={{ fontSize: 12.5, marginTop: 8, opacity: .92, lineHeight: 1.5 }}>Revise diariamente o que errou e transforme seus pontos fracos em pontos fortes!</div>
        </div>
      </div>
    </div>
  );
}
