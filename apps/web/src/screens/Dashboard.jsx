import { Icon } from '../lib/icons';
import { Sparkline, MiniBars } from '../lib/charts';

const PERF_BY_PERIOD = {
  '7': { acertos: 512, erros: 188, pct: 73, series: [40, 55, 48, 62, 58, 70, 68] },
  '30': { acertos: 1980, erros: 720, pct: 71, series: [30, 45, 42, 60, 55, 68, 64, 72, 66, 80, 75, 90] },
};

function iw(from, to) {
  return { width: 38, height: 38, borderRadius: 11, background: `linear-gradient(135deg, ${from}, ${to})`, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' };
}

export default function Dashboard({ theme, s, data, go, dash, setDash }) {
  const disciplinas = data.DISCIPLINAS || [];
  const period = dash.period;
  const perf = PERF_BY_PERIOD[period];

  const stats = [
    { iconWrap: iw('#4F8EF7', '#2F6FE0'), icon: 'book-open', label: 'Questões respondidas', value: '1.248', sub: 'questões' },
    { iconWrap: iw('#F472B6', '#DB2777'), icon: 'target', label: 'Taxa de acertos', value: '73%', sub: 'média geral' },
    { iconWrap: iw('#2DD4BF', '#0D9488'), icon: 'timer', label: 'Tempo médio', value: '1m 45s', sub: 'por questão' },
    { iconWrap: iw('#34D399', '#059669'), icon: 'trending-up', label: 'Sequência atual', value: '18 dias', sub: 'estudando' },
    { iconWrap: iw('#FBBF24', '#D97706'), icon: 'flag', label: 'Meta diária', value: '20 questões', sub: '15/20' },
  ];

  const maisEstudadas = disciplinas.slice(0, 3);
  const menorDesempenho = [...disciplinas].sort((a, b) => a.pct - b.pct).slice(0, 3);

  const evolucao = [
    { label: 'Evolução semanal', value: '+12%', sub: 'em relação à semana passada', color: '#10B981', chart: <Sparkline points={[20, 25, 22, 30, 28, 34, 32]} color="#EC4899" /> },
    { label: 'Evolução mensal', value: '+28%', sub: 'em relação ao mês passado', color: '#10B981', chart: <Sparkline points={[10, 18, 15, 25, 22, 32, 30, 40]} color={theme.primary} /> },
    { label: 'Questões este mês', value: '1.248', sub: '+320 em relação ao mês passado', color: '#2c2530', chart: <MiniBars points={[30, 45, 38, 55, 48, 60, 52]} color={theme.accent} /> },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, paddingTop: 2 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 14 }}>
        {stats.map((st, i) => (
          <div key={i} style={s.card}>
            <div style={st.iconWrap}><Icon name={st.icon} color="#fff" size={20} /></div>
            <div style={{ fontSize: 11.5, color: '#8b8391', marginTop: 10 }}>{st.label}</div>
            <div style={s.statNum}>{st.value}</div>
            <div style={s.statLabel}>{st.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 18, alignItems: 'start' }}>
        <div style={s.card}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={s.sectionTitle}><Icon name="calendar" color={theme.primary} size={20} />Cronograma</div>
            <a href="#" onClick={(e) => { e.preventDefault(); go('cronograma'); }} style={s.link}>Ver calendário</a>
          </div>
          <div style={{ marginTop: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: '#5c5462', marginBottom: 8 }}>
              <span>Progresso do cronograma</span><span style={{ fontWeight: 700, color: '#2c2530' }}>65%</span>
            </div>
            <div style={s.progressTrack}><div style={{ width: '65%', height: '100%', background: `linear-gradient(90deg, ${theme.gradA}, ${theme.gradB})`, borderRadius: 5 }} /></div>
            <div style={{ fontSize: 12, color: '#8b8391', marginTop: 8 }}>Você está no dia 52 de 180</div>
          </div>
          <div style={{ marginTop: 18, background: theme.primarySoft, borderRadius: 14, padding: 16 }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: theme.primary, textTransform: 'uppercase', letterSpacing: '.3px' }}>Próximo de hoje</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 10 }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: `linear-gradient(135deg, ${theme.gradA}, ${theme.gradB})`, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
                <Icon name="scale" color="#fff" size={20} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14.5, fontWeight: 700, color: '#2c2530' }}>Direito Constitucional</div>
                <div style={{ fontSize: 12.5, color: '#8b8391' }}>Direitos e Garantias Fundamentais</div>
                <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                  <span style={s.pill('#fff', '#8b8391')}>30 questões</span>
                  <span style={s.pill('#fff', '#8b8391')}>2h de estudo</span>
                </div>
              </div>
              <button style={s.btnPrimary} onClick={() => go('cronograma')}>▶ Iniciar estudo</button>
            </div>
          </div>
        </div>

        <div style={s.card}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={s.sectionTitle}>Desempenho geral</div>
            <select
              style={{ fontSize: 12, border: '1px solid rgba(0,0,0,.08)', borderRadius: 8, padding: '5px 8px', color: '#5c5462', background: '#fff' }}
              value={period}
              onChange={(e) => setDash({ period: e.target.value })}
            >
              <option value="7">Últimos 7 dias</option>
              <option value="30">Últimos 30 dias</option>
            </select>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
            <div style={{ flex: 1, background: '#faf9fb', borderRadius: 10, padding: '8px 10px' }}>
              <div style={{ fontSize: 11, color: '#8b8391' }}>Acertos</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#10B981' }}>{perf.acertos}</div>
            </div>
            <div style={{ flex: 1, background: '#faf9fb', borderRadius: 10, padding: '8px 10px' }}>
              <div style={{ fontSize: 11, color: '#8b8391' }}>Erros</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#EF4444' }}>{perf.erros}</div>
            </div>
            <div style={{ flex: 1, background: '#faf9fb', borderRadius: 10, padding: '8px 10px' }}>
              <div style={{ fontSize: 11, color: '#8b8391' }}>% Acertos</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: theme.primary }}>{perf.pct}%</div>
            </div>
          </div>
          <div style={{ marginTop: 14 }}><Sparkline points={perf.series} color={theme.primary} /></div>
        </div>
      </div>

      <div style={s.card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={s.sectionTitle}>Evolução dos estudos</div>
          <span style={s.link}>Ver mais</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginTop: 16 }}>
          {evolucao.map((ev, i) => (
            <div key={i}>
              <div style={{ fontSize: 12, color: '#8b8391' }}>{ev.label}</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: ev.color, marginTop: 2 }}>{ev.value}</div>
              <div style={{ fontSize: 11.5, color: '#8b8391' }}>{ev.sub}</div>
              <div style={{ marginTop: 10 }}>{ev.chart}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
        <div style={s.card}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={s.sectionTitle}>Matérias mais estudadas</div><span style={s.link}>ver todas</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 14 }}>
            {maisEstudadas.map((d) => (
              <div key={d.nome}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}><span style={{ color: '#2c2530', fontWeight: 500 }}>{d.nome}</span><span style={{ color: '#8b8391' }}>{d.horas}</span></div>
                <div style={{ ...s.progressTrack, marginTop: 6 }}><div style={{ width: d.pct + '%', height: '100%', background: d.cor, borderRadius: 5 }} /></div>
              </div>
            ))}
          </div>
        </div>
        <div style={s.card}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={s.sectionTitle}>Menor desempenho</div><span style={s.link}>ver todas</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 14 }}>
            {menorDesempenho.map((d) => (
              <div key={d.nome}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}><span style={{ color: '#2c2530', fontWeight: 500 }}>{d.nome}</span><span style={{ color: '#EF4444', fontWeight: 600 }}>{d.pct}%</span></div>
                <div style={{ ...s.progressTrack, marginTop: 6 }}><div style={{ width: d.pct + '%', height: '100%', background: '#EF4444', borderRadius: 5 }} /></div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ marginTop: 4, background: `linear-gradient(135deg, ${theme.gradA}, ${theme.gradB})`, borderRadius: 18, padding: '24px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#fff', gap: 20, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 10 }}><Icon name="trophy" color="#fff" size={28} />Continue assim!</div>
          <div style={{ fontSize: 13, opacity: .92, marginTop: 4, maxWidth: 520 }}>Você está cada dia mais perto da aprovação!</div>
        </div>
        <button style={{ background: 'rgba(255,255,255,.18)', border: '1px solid rgba(255,255,255,.5)', color: '#fff', borderRadius: 10, padding: '10px 18px', fontSize: 13, fontWeight: 600, flex: 'none' }} onClick={() => go('desempenho')}>
          Ver desempenho completo
        </button>
      </div>
    </div>
  );
}
