import { TAG_COLORS } from '../lib/mockData';

export default function Anotacoes({ theme, s, data, notas, setNotas }) {
  const base = data.ANOTACOES || [];
  const folders = data.ANOTACOES_FOLDERS || ['Todas'];
  const extra = notas.extra || [];
  const edits = notas.edits || {};

  const all = [...extra, ...base].map((n) => ({ ...n, ...(edits[n.id] || {}) }));
  const visible = notas.folder === 'Todas' ? all : all.filter((n) => n.disciplina === notas.folder);
  const activeId = notas.activeId ?? all[0]?.id;
  const active = all.find((n) => n.id === activeId) || all[0];

  const tagStyle = (tag) => {
    const [bg, fg] = TAG_COLORS[tag] || ['#f3f1f5', '#8b8391'];
    return s.pill(bg, fg === null ? theme.primaryDark : fg);
  };

  const newNote = () => {
    const id = 'new-' + Date.now();
    const note = { id, titulo: 'Nova anotação', disciplina: 'Direito Constitucional', tag: 'Resumo', data: 'Agora', conteudo: '' };
    setNotas({ extra: [...extra, note], activeId: id });
  };

  const editField = (id, field, value) => {
    setNotas({ edits: { ...edits, [id]: { ...edits[id], [field]: value } } });
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr 1.3fr', gap: 16, alignItems: 'start' }}>
      <div style={{ ...s.card, padding: 14 }}>
        <div style={{ ...s.sectionTitle, fontSize: 13.5 }}>Pastas</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 10 }}>
          {folders.map((f) => (
            <div
              key={f}
              onClick={() => setNotas({ folder: f })}
              style={{ padding: '8px 10px', borderRadius: 9, fontSize: 13, cursor: 'pointer', background: notas.folder === f ? theme.primarySoft : 'transparent', color: notas.folder === f ? theme.primaryDark : '#5c5462', fontWeight: notas.folder === f ? 600 : 500 }}
            >
              {f}
            </div>
          ))}
        </div>
      </div>

      <div style={{ ...s.card, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ ...s.sectionTitle, fontSize: 13.5 }}>Minhas anotações ({visible.length})</div>
          <button style={{ ...s.btnPrimary, padding: '6px 12px', fontSize: 12 }} onClick={newNote}>+ Nova</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 640, overflow: 'auto' }}>
          {visible.map((n) => (
            <div
              key={n.id}
              onClick={() => setNotas({ activeId: n.id })}
              style={{ padding: '10px 12px', borderRadius: 10, cursor: 'pointer', background: activeId === n.id ? theme.primarySoft : '#faf9fb' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#2c2530' }}>{n.titulo}</div>
                <span style={tagStyle(n.tag)}>{n.tag}</span>
              </div>
              <div style={{ fontSize: 11.5, color: '#8b8391', marginTop: 4 }}>{n.disciplina} · {n.data}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={s.card}>
        {active && (
          <div>
            <input
              style={{ fontSize: 19, fontWeight: 700, color: '#2c2530', border: 'none', outline: 'none', width: '100%', fontFamily: "'Poppins',sans-serif" }}
              value={active.titulo}
              onChange={(e) => editField(active.id, 'titulo', e.target.value)}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
              <span style={s.pill('#f3f1f5', '#8b8391')}>{active.disciplina}</span>
              <span style={tagStyle(active.tag)}>{active.tag}</span>
            </div>
            <textarea
              style={{ width: '100%', minHeight: 420, marginTop: 18, border: 'none', outline: 'none', resize: 'vertical', fontSize: 14, lineHeight: 1.7, color: '#3a3540', fontFamily: 'inherit' }}
              value={active.conteudo}
              onChange={(e) => editField(active.id, 'conteudo', e.target.value)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
