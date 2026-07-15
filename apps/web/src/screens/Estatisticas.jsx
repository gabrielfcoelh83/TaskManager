function dot(c) {
  return { width: 8, height: 8, borderRadius: '50%', background: c, display: 'inline-block' };
}

export default function Estatisticas({ theme, s, data, filtros, setFiltros }) {
  const disciplinas = data.DISCIPLINAS || [];
  const mult = { '7d': 0.25, '30d': 1, 'all': 3.4 }[filtros.range];

  const metrics = [
    { label: 'Questões resolvidas', value: Math.round(1248 * mult).toLocaleString('pt-BR'), delta: '+12% vs. período anterior', deltaColor: '#10B981' },
    { label: 'Taxa de acertos', value: '73%', delta: '+3pp vs. período anterior', deltaColor: '#10B981' },
    { label: 'Tempo total de estudo', value: Math.round(96 * mult) + 'h', delta: '+8% vs. período anterior', deltaColor: '#10B981' },
    { label: 'Dias ativos', value: Math.min(180, Math.round(18 * mult)), delta: 'sequência atual', deltaColor: '#8b8391' },
  ];

  const totalQ = Math.round(1248 * mult).toLocaleString('pt-BR');
  const bancas = [{ nome: 'FGV', pct: 48 }, { nome: 'CEBRASPE', pct: 39 }, { nome: 'Outras', pct: 13 }];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ ...s.card, display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'end' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <div style={{ fontSize: 11.5, color: '#8b8391' }}>Período</div>
          <select
            style={{ fontSize: 13, border: '1px solid rgba(0,0,0,.1)', borderRadius: 9, padding: '8px 12px', color: '#2c2530', background: '#fff', minWidth: 170 }}
            value={filtros.range}
            onChange={(e) => setFiltros({ range: e.target.value })}
          >
            <option value="7d">Últimos 7 dias</option><option value="30d">Últimos 30 dias</option><option value="all">Desde o início</option>
          </select>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <div style={{ fontSize: 11.5, color: '#8b8391' }}>Disciplina</div>
          <select
            style={{ fontSize: 13, border: '1px solid rgba(0,0,0,.1)', borderRadius: 9, padding: '8px 12px', color: '#2c2530', background: '#fff', minWidth: 170 }}
            value={filtros.disc}
            onChange={(e) => setFiltros({ disc: e.target.value })}
          >
            {['Todas', ...disciplinas.map((d) => d.nome)].map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14 }}>
        {metrics.map((m, i) => (
          <div key={i} style={s.card}>
            <div style={s.statLabel}>{m.label}</div>
            <div style={{ ...s.statNum, marginTop: 6 }}>{m.value}</div>
            <div style={{ fontSize: 11, color: m.deltaColor, marginTop: 4 }}>{m.delta}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
        <div style={s.card}>
          <div style={s.sectionTitle}>Questões por dificuldade</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginTop: 16 }}>
            <div style={{ width: 100, height: 100, borderRadius: '50%', background: 'conic-gradient(#10B981 0% 42%, #F59E0B 42% 80%, #EF4444 80% 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
              <div style={{ width: 74, height: 74, borderRadius: '50%', background: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ fontSize: 16, fontWeight: 700 }}>{totalQ}</div>
                <div style={{ fontSize: 9, color: '#8b8391' }}>questões</div>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12.5 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={dot('#10B981')}></span>Fácil <b style={{ marginLeft: 'auto' }}>42%</b></div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={dot('#F59E0B')}></span>Média <b style={{ marginLeft: 'auto' }}>38%</b></div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={dot('#EF4444')}></span>Difícil <b style={{ marginLeft: 'auto' }}>20%</b></div>
            </div>
          </div>
        </div>
        <div style={s.card}>
          <div style={s.sectionTitle}>Questões por banca</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 11, marginTop: 16 }}>
            {bancas.map((b) => (
              <div key={b.nome}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}><span>{b.nome}</span><span style={{ color: '#8b8391' }}>{b.pct}%</span></div>
                <div style={{ ...s.progressTrack, marginTop: 5 }}><div style={{ width: b.pct + '%', height: '100%', background: theme.primary, borderRadius: 5 }} /></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
