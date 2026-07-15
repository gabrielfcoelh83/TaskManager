import { Icon } from '../lib/icons';
import { topicosPorDisciplina } from '../lib/mockData';

export default function Disciplinas({ theme, s, data, disc, setDisc }) {
  const list = data.DISCIPLINAS || [];
  const open = list.find((d) => d.nome === disc.openNome) || null;

  if (!open) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16 }}>
        {list.map((d) => (
          <div key={d.nome} style={{ ...s.card, cursor: 'pointer' }} onClick={() => setDisc({ openNome: d.nome })}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 42, height: 42, borderRadius: 12, background: d.cor, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
                <Icon name="library" color="#fff" size={20} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14.5, fontWeight: 700, color: '#2c2530' }}>{d.nome}</div>
                <div style={{ fontSize: 12, color: '#8b8391' }}>{d.horas} estudadas</div>
              </div>
            </div>
            <div style={{ marginTop: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#8b8391', marginBottom: 6 }}><span>Progresso</span><span style={{ fontWeight: 700, color: '#2c2530' }}>{d.pct}%</span></div>
              <div style={s.progressTrack}><div style={{ width: d.pct + '%', height: '100%', background: d.cor, borderRadius: 5 }} /></div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  const topicos = topicosPorDisciplina(open.nome);

  return (
    <div style={s.card}>
      <button style={{ background: 'none', border: 'none', color: theme.primary, fontSize: 13, fontWeight: 600 }} onClick={() => setDisc({ openNome: null })}>← Voltar às disciplinas</button>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 14 }}>
        <div style={{ width: 56, height: 56, borderRadius: 16, background: open.cor, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
          <Icon name="library" color="#fff" size={26} />
        </div>
        <div>
          <div style={{ fontSize: 19, fontWeight: 700, color: '#2c2530' }}>{open.nome}</div>
          <div style={{ fontSize: 13, color: '#8b8391' }}>{open.horas} estudadas · {open.pct}% de aproveitamento</div>
        </div>
      </div>
      <div style={{ ...s.progressTrack, marginTop: 16 }}><div style={{ width: open.pct + '%', height: '100%', background: open.cor, borderRadius: 5 }} /></div>
      <div style={{ ...s.sectionTitle, marginTop: 22 }}>Tópicos</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
        {topicos.map((t) => (
          <div key={t.nome} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '12px 14px', background: '#faf9fb', borderRadius: 12 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: '#2c2530' }}>{t.nome}</div>
              <div style={{ ...s.progressTrack, marginTop: 6, width: 220 }}><div style={{ width: t.pct + '%', height: '100%', background: open.cor, borderRadius: 5 }} /></div>
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#2c2530', width: 40, textAlign: 'right' }}>{t.pct}%</div>
            <button style={s.btnOutline}>Estudar</button>
          </div>
        ))}
      </div>
    </div>
  );
}
