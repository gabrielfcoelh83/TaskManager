import { Icon } from '../lib/icons';
import { topicosPorDisciplina } from '../lib/mockData';

const DISC_ICONS = {
  'Direito Constitucional': 'landmark',
  'Direito Administrativo': 'scale',
  'Direito Civil': 'users',
  'Direito Penal': 'gavel',
  'Direito do Trabalho': 'briefcase',
  'Direito Tributário': 'file-text',
  'Direito Empresarial': 'building-2',
  'Direito Internacional': 'book-open',
};

export default function Disciplinas({ theme, s, data, disc, setDisc, iniciarSimuladoDe }) {
  const list = data.DISCIPLINAS || [];
  const QUESTOES = data.QUESTOES || [];
  const open = list.find((d) => d.nome === disc.openNome) || null;

  if (!open) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16 }}>
        {list.map((d) => {
          const qtd = QUESTOES.filter(q => q.disciplina === d.nome).length;
          const temQuestoes = qtd > 0;
          return (
            <div key={d.nome} style={{ ...s.card, display: 'flex', flexDirection: 'column', gap: 12, padding: 22 }}>
              <div style={{ width: 52, height: 52, borderRadius: 14, background: `${d.cor}1e`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name={DISC_ICONS[d.nome] || 'library'} color={d.cor} size={26} />
              </div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#2c2530' }}>{d.nome}</div>
                <div style={{ fontSize: 12.5, color: '#8b8391', marginTop: 3 }}>
                  {temQuestoes ? `${qtd} questões focadas e comentadas.` : 'Questões em breve.'} · {d.horas} estudadas
                </div>
              </div>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#8b8391', marginBottom: 6 }}>
                  <span>Progresso</span><span style={{ fontWeight: 700, color: '#2c2530' }}>{d.pct}%</span>
                </div>
                <div style={s.progressTrack}><div style={{ width: d.pct + '%', height: '100%', background: d.cor, borderRadius: 5 }} /></div>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <button
                  onClick={() => temQuestoes && iniciarSimuladoDe && iniciarSimuladoDe(d.nome)}
                  disabled={!temQuestoes}
                  style={{ flex: 1, padding: '10px 12px', background: temQuestoes ? '#343a46' : '#c3c8d2', color: '#fff', border: 'none', borderRadius: 9, fontSize: 12.5, fontWeight: 600, cursor: temQuestoes ? 'pointer' : 'not-allowed' }}
                >
                  ▶ Iniciar Simulado
                </button>
                <button
                  onClick={() => setDisc({ openNome: d.nome })}
                  style={{ padding: '10px 14px', background: '#fff', color: '#5c5462', border: '1px solid #e3e7ee', borderRadius: 9, fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}
                >
                  Estudar
                </button>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  const topicos = topicosPorDisciplina(open.nome);

  return (
    <div style={s.card}>
      <button style={{ background: 'none', border: 'none', color: theme.primary, fontSize: 13, fontWeight: 600, cursor: 'pointer' }} onClick={() => setDisc({ openNome: null })}>← Voltar às disciplinas</button>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 14 }}>
        <div style={{ width: 56, height: 56, borderRadius: 16, background: `${open.cor}1e`, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
          <Icon name={DISC_ICONS[open.nome] || 'library'} color={open.cor} size={28} />
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
