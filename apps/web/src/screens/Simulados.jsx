import { Icon } from '../lib/icons';

const STATUS_META = {
  disponivel: { label: 'Disponível', bg: '#E0F2FE', fg: '#0369A1' },
  em_andamento: { label: 'Em andamento', bg: '#FEF3C7', fg: '#B45309' },
  concluido: { label: 'Concluído', bg: '#D1FAE5', fg: '#047857' },
};

export default function Simulados({ theme, s, data, sim, setSim }) {
  const list = data.SIMULADOS || [];
  const running = sim.running || {};

  const toggle = (id) => setSim({ running: { ...running, [id]: !running[id] } });

  const simulados = list.map((item) => {
    const isRunning = running[item.id];
    const status = isRunning ? 'em_andamento' : item.status;
    const meta = STATUS_META[status];
    const progresso = item.progresso || (isRunning ? 20 : 0);
    return {
      ...item,
      status,
      meta,
      showProgress: status === 'em_andamento',
      showNota: status === 'concluido' && item.ultimaNota != null,
      progresso,
      barStyle: { width: progresso + '%', height: '100%', background: `linear-gradient(90deg, ${theme.gradA}, ${theme.gradB})`, borderRadius: 5 },
    };
  });

  const stats = [
    { label: 'Simulados disponíveis', value: list.filter((x) => x.status === 'disponivel').length },
    { label: 'Em andamento', value: list.filter((x) => x.status === 'em_andamento').length },
    { label: 'Concluídos', value: list.filter((x) => x.status === 'concluido').length },
    { label: 'Média de acertos', value: '78%' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14 }}>
        {stats.map((st, i) => (
          <div key={i} style={s.card}>
            <div style={{ fontSize: 11.5, color: '#8b8391' }}>{st.label}</div>
            <div style={{ ...s.statNum, marginTop: 4 }}>{st.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {simulados.map((sm) => (
          <div key={sm.id} style={{ ...s.card, display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
            <div style={{ width: 46, height: 46, borderRadius: 13, background: `linear-gradient(135deg, ${theme.gradA}, ${theme.gradB})`, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
              <Icon name="timer" color="#fff" size={22} />
            </div>
            <div style={{ flex: 1, minWidth: 220 }}>
              <div style={{ fontSize: 14.5, fontWeight: 700, color: '#2c2530' }}>{sm.nome}</div>
              <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                <span style={s.pill('#f3f1f5', '#8b8391')}>{sm.questoes} questões</span>
                <span style={s.pill('#f3f1f5', '#8b8391')}>{sm.tempo}</span>
              </div>
            </div>
            {sm.showProgress && (
              <div style={{ width: 160 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: '#8b8391', marginBottom: 5 }}><span>Progresso</span><span style={{ fontWeight: 700, color: '#2c2530' }}>{sm.progresso}%</span></div>
                <div style={s.progressTrack}><div style={sm.barStyle} /></div>
              </div>
            )}
            {sm.showNota && (
              <div style={{ width: 52, height: 52, borderRadius: '50%', background: theme.primarySoft, color: theme.primaryDark, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, flex: 'none' }}>
                {sm.ultimaNota}%<div style={{ fontSize: 9.5, fontWeight: 500 }}>nota</div>
              </div>
            )}
            <span style={s.pill(sm.meta.bg, sm.meta.fg)}>{sm.meta.label}</span>
            <button
              style={sm.status === 'concluido' ? s.btnOutline : { ...s.btnPrimary, flex: 'none' }}
              onClick={() => sm.status !== 'concluido' && toggle(sm.id)}
            >
              {sm.status === 'concluido' ? 'Ver resultado' : (sm.status === 'em_andamento' ? '▶ Continuar' : '▶ Iniciar simulado')}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
