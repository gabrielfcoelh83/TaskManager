import { AreaLine, LabeledBars } from '../lib/charts';

const SERIES = {
  '7': [60, 66, 63, 70, 68, 74, 73],
  '30': [52, 58, 55, 62, 60, 68, 66, 70, 68, 73, 71, 73],
  '90': [45, 50, 52, 55, 58, 62, 65, 68, 70, 71, 72, 73],
};

export default function Desempenho({ theme, s, data, perf, setPerf }) {
  const disciplinas = data.DISCIPLINAS || [];
  const period = perf.period;
  const series = SERIES[period];

  const stats = [
    { label: 'Taxa de acertos geral', value: '73%', color: theme.primary },
    { label: 'Questões respondidas', value: '4.312', color: '#2c2530' },
    { label: 'Tempo médio', value: '1m 45s', color: '#2c2530' },
    { label: 'Melhor disciplina', value: 'Dir. Constitucional', color: '#10B981' },
  ];

  const porDisciplina = disciplinas.map((d) => ({ nome: d.nome, pct: d.pct }));
  const tempoLabels = disciplinas.slice(0, 7).map((d) => d.nome.split(' ')[1] || d.nome.slice(0, 4));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14 }}>
        {stats.map((st, i) => (
          <div key={i} style={s.card}>
            <div style={s.statLabel}>{st.label}</div>
            <div style={{ ...s.statNum, marginTop: 6, color: st.color }}>{st.value}</div>
          </div>
        ))}
      </div>

      <div style={s.card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={s.sectionTitle}>Evolução da taxa de acertos</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {['7', '30', '90'].map((p) => (
              <button
                key={p}
                onClick={() => setPerf({ period: p })}
                style={{ background: period === p ? theme.primarySoft : 'transparent', color: period === p ? theme.primaryDark : '#8b8391', border: 'none', borderRadius: 8, padding: '7px 12px', fontSize: 12, fontWeight: 600 }}
              >
                {p} dias
              </button>
            ))}
          </div>
        </div>
        <div style={{ marginTop: 16 }}><AreaLine points={series} color={theme.primary} /></div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
        <div style={s.card}>
          <div style={s.sectionTitle}>Acertos x Erros por disciplina</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
            {porDisciplina.map((d) => (
              <div key={d.nome}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 5 }}><span style={{ color: '#2c2530' }}>{d.nome}</span><span style={{ color: '#8b8391' }}>{d.pct}%</span></div>
                <div style={{ display: 'flex', height: 9, borderRadius: 5, overflow: 'hidden', background: '#f1eef4' }}>
                  <div style={{ width: d.pct + '%', background: '#10B981' }} />
                  <div style={{ width: (100 - d.pct) + '%', background: '#EF4444' }} />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div style={s.card}>
          <div style={s.sectionTitle}>Tempo médio por questão</div>
          <div style={{ marginTop: 16 }}><LabeledBars points={[95, 80, 70, 65, 60, 55, 50]} labels={tempoLabels} color={theme.accent} /></div>
        </div>
      </div>
    </div>
  );
}
