import { Icon } from '../lib/icons';
import { DAY_ICON_MAP } from '../lib/mockData';

const TABS = [
  { key: 'semanal', label: 'Plano semanal' },
  { key: 'mensal', label: 'Plano mensal' },
  { key: 'todas', label: 'Todas as disciplinas' },
];

const WEEK_LABELS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

export default function Cronograma({ theme, s, data, cronograma, setCronograma }) {
  const diasRaw = data.CRONOGRAMA_DIAS || [];
  const progress = cronograma.progress || diasRaw.map((d) => d.progresso);

  const startDay = (i) => {
    const prog = [...progress];
    prog[i] = prog[i] >= 100 ? 100 : Math.min(100, (prog[i] || 0) + 40);
    setCronograma({ progress: prog });
  };

  const dias = diasRaw.map((d, i) => {
    const pct = progress[i] || 0;
    const done = pct >= 100;
    return {
      ...d,
      progresso: pct,
      done,
      barStyle: { width: pct + '%', height: '100%', background: done ? '#10B981' : `linear-gradient(90deg, ${theme.gradA}, ${theme.gradB})`, borderRadius: 5 },
      btnStyle: done
        ? { background: '#D1FAE5', color: '#047857', border: 'none', borderRadius: 10, padding: '9px 16px', fontSize: 12.5, fontWeight: 600, flex: 'none' }
        : { ...s.btnPrimary, flex: 'none' },
      btnLabel: done ? '✓ Concluído' : (pct > 0 ? '▶ Continuar estudo' : '▶ Iniciar estudo'),
    };
  });

  const calDays = Array.from({ length: 31 }, (_, i) => {
    const n = i + 1, active = n === 13;
    return { n, active };
  });

  const foco = (data.DISCIPLINAS || []).slice(0, 5);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '2.2fr 1fr', gap: 18, alignItems: 'start' }}>
      <div style={s.card}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, justifyContent: 'space-between', alignItems: 'center', paddingBottom: 16, borderBottom: '1px solid rgba(0,0,0,.06)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}><div style={{ fontSize: 11.5, color: '#8b8391' }}>Período do cronograma</div><div style={{ fontSize: 14, fontWeight: 700, color: '#2c2530' }}>180 dias</div></div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}><div style={{ fontSize: 11.5, color: '#8b8391' }}>Horas disponíveis por dia</div><div style={{ fontSize: 14, fontWeight: 700, color: '#2c2530' }}>4h</div></div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}><div style={{ fontSize: 11.5, color: '#8b8391' }}>Início do plano</div><div style={{ fontSize: 14, fontWeight: 700, color: '#2c2530' }}>03/03/2025</div></div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}><div style={{ fontSize: 11.5, color: '#8b8391' }}>Término previsto</div><div style={{ fontSize: 14, fontWeight: 700, color: '#2c2530' }}>09/08/2025</div></div>
          <button style={s.btnOutline}>✎ Editar plano</button>
        </div>

        <div style={{ display: 'flex', gap: 6, marginTop: 16 }}>
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setCronograma({ tab: t.key })}
              style={{
                background: cronograma.tab === t.key ? theme.primarySoft : 'transparent',
                color: cronograma.tab === t.key ? theme.primaryDark : '#8b8391',
                border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 12.5, fontWeight: 600,
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
          {dias.map((d, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 14, borderRadius: 12, background: d.hoje ? theme.primarySoft : '#faf9fb', flexWrap: 'wrap' }}>
              <div style={{ width: 52, textAlign: 'center', flex: 'none' }}>
                <div style={{ fontSize: 10.5, color: '#8b8391', fontWeight: 700 }}>{d.dow}</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#2c2530' }}>{d.dia}</div>
                {d.hoje && <div style={{ marginTop: 2, fontSize: 9, fontWeight: 700, color: '#fff', background: theme.primary, borderRadius: 6, padding: '1px 5px' }}>Hoje</div>}
              </div>
              <div style={{ width: 42, height: 42, borderRadius: 11, background: `linear-gradient(135deg, ${theme.gradA}, ${theme.gradB})`, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
                <Icon name={DAY_ICON_MAP[d.disciplina] || 'book-open'} color="#fff" size={20} />
              </div>
              <div style={{ flex: 1, minWidth: 180 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#2c2530' }}>{d.disciplina}</div>
                <div style={{ fontSize: 12, color: '#8b8391' }}>{d.topico}</div>
                <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                  <span style={{ ...s.pill('#f3f1f5', '#8b8391'), display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon name="clock" color="#8b8391" size={13} />{d.tempo}</span>
                  <span style={{ ...s.pill('#f3f1f5', '#8b8391'), display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon name="file-text" color="#8b8391" size={13} />{d.qtd}</span>
                </div>
              </div>
              <div style={{ width: 150 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: '#8b8391', marginBottom: 5 }}><span>Progresso do dia</span><span style={{ fontWeight: 700, color: '#2c2530' }}>{d.progresso}%</span></div>
                <div style={s.progressTrack}><div style={d.barStyle} /></div>
              </div>
              <button style={d.btnStyle} onClick={() => startDay(i)}>{d.btnLabel}</button>
            </div>
          ))}
        </div>
        <button style={{ width: '100%', marginTop: 6, background: '#fff', border: `1px solid ${theme.primarySoft}`, color: theme.primary, borderRadius: 10, padding: 10, fontSize: 13, fontWeight: 600 }}>Ver próximas semanas ⌄</button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={s.card}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={s.sectionTitle}><Icon name="calendar" color={theme.primary} size={20} />Calendário</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#2c2530' }}>Maio 2025</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4, marginTop: 14, textAlign: 'center' }}>
            {WEEK_LABELS.map((w, i) => <div key={i} style={{ fontSize: 10.5, color: '#8b8391', fontWeight: 700 }}>{w}</div>)}
            {calDays.map((c) => (
              <div key={c.n} style={{ fontSize: 11.5, padding: '6px 0', borderRadius: 8, color: c.active ? '#fff' : '#5c5462', background: c.active ? theme.primary : 'transparent', fontWeight: c.active ? 700 : 400 }}>{c.n}</div>
            ))}
          </div>
        </div>

        <div style={s.card}>
          <div style={s.sectionTitle}>Resumo do plano</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 14 }}>
            <div style={{ width: 96, height: 96, borderRadius: '50%', background: `conic-gradient(${theme.primary} 0% 65%, #f1eef4 65% 100%)`, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
              <div style={{ width: 72, height: 72, borderRadius: '50%', background: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ fontSize: 17, fontWeight: 700, color: '#2c2530' }}>65%</div>
                <div style={{ fontSize: 9.5, color: '#8b8391' }}>do plano concluído</div>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12 }}>
              <div><div style={{ color: '#8b8391' }}>Dias estudados</div><div style={{ fontWeight: 700, color: '#2c2530' }}>78 de 180</div></div>
              <div><div style={{ color: '#8b8391' }}>Horas estudadas</div><div style={{ fontWeight: 700, color: '#2c2530' }}>312h 45m</div></div>
              <div><div style={{ color: '#8b8391' }}>Questões respondidas</div><div style={{ fontWeight: 700, color: '#2c2530' }}>4.312</div></div>
            </div>
          </div>
        </div>

        <div style={s.card}>
          <div style={s.sectionTitle}>Disciplinas em foco</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 11, marginTop: 14 }}>
            {foco.map((f) => (
              <div key={f.nome}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}><span style={{ color: '#2c2530' }}>{f.nome}</span><span style={{ color: '#8b8391' }}>{f.pct}%</span></div>
                <div style={{ ...s.progressTrack, marginTop: 5 }}><div style={{ width: f.pct + '%', height: '100%', background: f.cor, borderRadius: 5 }} /></div>
              </div>
            ))}
          </div>
          <button style={{ width: '100%', marginTop: 6, background: '#fff', border: `1px solid ${theme.primarySoft}`, color: theme.primary, borderRadius: 10, padding: 10, fontSize: 13, fontWeight: 600 }}>Ver todas as disciplinas</button>
        </div>
      </div>
    </div>
  );
}
