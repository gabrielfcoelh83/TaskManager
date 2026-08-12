import { Icon } from '../lib/icons';
import { Sparkline } from '../lib/charts';
import {
  taxaDeAcertos,
  sequenciaAtual,
  metaDiaria,
  resumoSimulados,
  desempenhoPorSimulado,
  evolucaoPorDisciplina,
} from '../lib/metrics';
import { prioridadeDeEstudo } from '../lib/disciplinas';

function iw(from, to) {
  return { width: 38, height: 38, borderRadius: 11, background: `linear-gradient(135deg, ${from}, ${to})`, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' };
}

// Filtra resultados de simulado pelos últimos N dias (por data_conclusao).
function filtrarPorPeriodo(resultados, dias) {
  if (!dias) return resultados;
  const limite = Date.now() - dias * 86400000;
  return resultados.filter((r) => r.data_conclusao && new Date(r.data_conclusao).getTime() >= limite);
}

const STATUS_META = {
  domina: { label: 'Domina', color: '#10B981', bg: '#D1FAE5' },
  'em-desenvolvimento': { label: 'Em desenvolvimento', color: '#B45309', bg: '#FEF3C7' },
  necessita: { label: 'Precisa reforço', color: '#EF4444', bg: '#FEE2E2' },
  novo: { label: 'Não iniciado', color: '#8b8391', bg: '#F3F4F6' },
};

function EmptyHint({ children }) {
  return <div style={{ fontSize: 12.5, color: '#8b8391', padding: '10px 0', lineHeight: 1.5 }}>{children}</div>;
}

export default function Dashboard({ theme, s, data, go, dash, setDash, config, usuarioTentativas, resultados_historico, disciplinas, praticarDisciplina, acervo }) {
  const tentativas = usuarioTentativas || {};
  const resultados = resultados_historico || [];
  const questoes = data.QUESTOES || [];
  const corPorDisciplina = Object.fromEntries((disciplinas || []).map((d) => [d.nome, d.cor]));

  // ---- Métricas (derivadas dos dados reais) ----
  const taxa = taxaDeAcertos(tentativas, resultados, questoes);
  const streak = sequenciaAtual(tentativas, resultados);
  const meta = metaDiaria(config || {}, tentativas, resultados);

  const period = dash.period;
  const resultadosPeriodo = filtrarPorPeriodo(resultados, Number(period));
  const simResumo = resumoSimulados(resultadosPeriodo);
  const simPorTipo = desempenhoPorSimulado(resultadosPeriodo);

  const prioridade = prioridadeDeEstudo(disciplinas || []);
  const proxima = prioridade[0] || null;

  const maisEstudadas = [...(disciplinas || [])]
    .filter((d) => d.tentativas > 0)
    .sort((a, b) => b.tentativas - a.tentativas)
    .slice(0, 3);

  const piores = (disciplinas || [])
    .filter((d) => d.pct != null)
    .sort((a, b) => a.pct - b.pct)
    .slice(0, 3);

  const evolucao = evolucaoPorDisciplina(tentativas, questoes).slice(0, 3);
  const maxTentativas = Math.max(1, ...maisEstudadas.map((d) => d.tentativas));

  const stats = [
    {
      iconWrap: iw('#F472B6', '#DB2777'), icon: 'target', label: 'Taxa de acertos',
      value: taxa.pct != null ? `${taxa.pct}%` : '—',
      sub: taxa.total > 0 ? `${taxa.acertos}/${taxa.total} questões` : 'sem dados ainda',
    },
    {
      iconWrap: iw('#34D399', '#059669'), icon: 'trending-up', label: 'Sequência atual',
      value: `${streak.dias} ${streak.dias === 1 ? 'dia' : 'dias'}`,
      sub: streak.dias > 0 ? 'estudando' : 'comece hoje!',
    },
    {
      iconWrap: iw('#FBBF24', '#D97706'), icon: 'flag', label: 'Meta diária',
      value: `${meta.respondidas}/${meta.meta}`,
      sub: meta.batida ? '✓ meta batida!' : `faltam ${meta.faltam}`,
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, paddingTop: 2 }}>
      {/* Cards de topo */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
        {stats.map((st, i) => (
          <div key={i} style={s.card}>
            <div style={st.iconWrap}><Icon name={st.icon} color="#fff" size={20} /></div>
            <div style={{ fontSize: 11.5, color: '#8b8391', marginTop: 10 }}>{st.label}</div>
            <div style={s.statNum}>{st.value}</div>
            <div style={s.statLabel}>{st.sub}</div>
          </div>
        ))}
      </div>

      {/* Meta de hoje + Desempenho em simulados */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 18, alignItems: 'start' }}>
        <div style={s.card}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={s.sectionTitle}><Icon name="calendar" color={theme.primary} size={20} />Hoje</div>
            <a href="#" onClick={(e) => { e.preventDefault(); go('cronograma'); }} style={s.link}>Ver a semana</a>
          </div>
          <div style={{ marginTop: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: '#5c5462', marginBottom: 8 }}>
              <span>Meta de hoje</span><span style={{ fontWeight: 700, color: '#2c2530' }}>{meta.respondidas}/{meta.meta} questões</span>
            </div>
            <div style={s.progressTrack}><div style={{ width: `${meta.pct}%`, height: '100%', background: `linear-gradient(90deg, ${theme.gradA}, ${theme.gradB})`, borderRadius: 5, transition: 'width 320ms var(--ease-out)' }} /></div>
            <div style={{ fontSize: 12, color: '#8b8391', marginTop: 8 }}>
              {meta.batida ? '🎉 Você bateu a meta de hoje!' : `Faltam ${meta.faltam} questões para bater a meta de hoje.`}
            </div>
          </div>

          {/* O "próximo passo" agora aponta para uma disciplina de verdade e diz
              por que ela: antes era sempre o mesmo cartão, e o botão levava
              para a tela de questões sem filtrar nada. */}
          <div style={{ marginTop: 18, background: theme.primarySoft, borderRadius: 14, padding: 16 }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: theme.primary, textTransform: 'uppercase', letterSpacing: '.3px' }}>Próximo passo</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 10, flexWrap: 'wrap' }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: proxima ? proxima.cor : `linear-gradient(135deg, ${theme.gradA}, ${theme.gradB})`, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
                <Icon name="book-open" color="#fff" size={20} />
              </div>
              <div style={{ flex: 1, minWidth: 180 }}>
                <div style={{ fontSize: 14.5, fontWeight: 700, color: '#2c2530' }}>
                  {proxima ? proxima.nome : 'Praticar questões'}
                </div>
                <div style={{ fontSize: 12.5, color: '#8b8391' }}>
                  {proxima
                    ? proxima.pct != null
                      ? `${proxima.pct}% de acerto em ${proxima.tentativas} ${proxima.tentativas === 1 ? 'resposta' : 'respostas'}`
                      : `${proxima.total} ${proxima.total === 1 ? 'questão' : 'questões'} que você ainda não respondeu`
                    : acervo?.estado === 'carregando' ? 'carregando o acervo…' : 'o acervo ainda não tem questões classificadas'}
                </div>
              </div>
              <button
                style={s.btnPrimary}
                onClick={() => (proxima ? praticarDisciplina(proxima.nome) : go('questoes'))}
              >
                <Icon name="play" color="#fff" size={13} /> Praticar
              </button>
            </div>
          </div>
        </div>

        <div style={s.card}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={s.sectionTitle}>Simulados</div>
            <select
              style={{ fontSize: 12, border: '1px solid rgba(0,0,0,.08)', borderRadius: 8, padding: '5px 8px', color: '#5c5462', background: '#fff' }}
              value={period}
              onChange={(e) => setDash({ period: e.target.value })}
            >
              <option value="7">Últimos 7 dias</option>
              <option value="30">Últimos 30 dias</option>
            </select>
          </div>
          {simResumo.questoes > 0 ? (
            <>
              <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
                <div style={{ flex: 1, background: '#faf9fb', borderRadius: 10, padding: '8px 10px' }}>
                  <div style={{ fontSize: 11, color: '#8b8391' }}>Acertos</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#10B981' }}>{simResumo.acertos}</div>
                </div>
                <div style={{ flex: 1, background: '#faf9fb', borderRadius: 10, padding: '8px 10px' }}>
                  <div style={{ fontSize: 11, color: '#8b8391' }}>Erros</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#EF4444' }}>{simResumo.erros}</div>
                </div>
                <div style={{ flex: 1, background: '#faf9fb', borderRadius: 10, padding: '8px 10px' }}>
                  <div style={{ fontSize: 11, color: '#8b8391' }}>% Acertos</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: theme.primary }}>{simResumo.pct}%</div>
                </div>
              </div>
              {simResumo.serie.length >= 2 && (
                <div style={{ marginTop: 14 }}><Sparkline points={simResumo.serie} color={theme.primary} /></div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 12 }}>
                {simPorTipo.map((sim, i) => (
                  <div
                    key={i}
                    title={`${sim.nome}\nAcertos: ${sim.acertos}/${sim.questoes}\nTaxa: ${sim.pct}%\nTentativas: ${sim.tentativas}\nTempo médio: ${sim.tempoMedioMin} min${sim.ultima ? `\nÚltima: ${new Date(sim.ultima).toLocaleDateString('pt-BR')}` : ''}`}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12, cursor: 'default' }}
                  >
                    <span style={{ color: '#5c5462', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70%' }}>{sim.nome}</span>
                    <span style={{ fontWeight: 700, color: sim.pct >= 70 ? '#10B981' : sim.pct >= 50 ? '#B45309' : '#EF4444' }}>{sim.pct}%</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <EmptyHint>Nenhum simulado concluído neste período. Faça um simulado para ver seu desempenho aqui.</EmptyHint>
          )}
        </div>
      </div>

      {/* Evolução dos estudos — por disciplina */}
      <div style={s.card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={s.sectionTitle}>Evolução dos estudos <span style={{ fontSize: 12, fontWeight: 400, color: '#8b8391' }}>· por disciplina</span></div>
          <a href="#" onClick={(e) => { e.preventDefault(); go('desempenho'); }} style={s.link}>Ver mais</a>
        </div>
        {evolucao.length ? (
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${evolucao.length}, 1fr)`, gap: 16, marginTop: 16 }}>
            {evolucao.map((ev, i) => {
              const cor = corPorDisciplina[ev.disciplina] || theme.primary;
              const deltaColor = ev.delta == null ? '#8b8391' : ev.delta >= 0 ? '#10B981' : '#EF4444';
              const deltaTxt = ev.delta == null ? 'só uma semana' : `${ev.delta >= 0 ? '+' : ''}${ev.delta} pp no período`;
              return (
                <div key={i}>
                  <div style={{ fontSize: 12, color: '#8b8391', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.disciplina}</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: '#2c2530', marginTop: 2 }}>{ev.taxaAtual != null ? `${ev.taxaAtual}%` : '—'}</div>
                  <div style={{ fontSize: 11.5, color: deltaColor, fontWeight: 600 }}>{deltaTxt}</div>
                  {ev.pontosPreenchidos.length >= 2 && (
                    <div style={{ marginTop: 10 }}><Sparkline points={ev.pontosPreenchidos} color={cor} height={70} /></div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyHint>Ainda não há histórico suficiente. Responda questões em dias diferentes para acompanhar sua evolução por disciplina.</EmptyHint>
        )}
      </div>

      {/* Matérias mais estudadas + Menor desempenho */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
        <div style={s.card}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={s.sectionTitle}>Matérias mais estudadas</div><a href="#" onClick={(e) => { e.preventDefault(); go('disciplinas'); }} style={s.link}>ver todas</a>
          </div>
          {maisEstudadas.length ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 14 }}>
              {maisEstudadas.map((d) => (
                <div key={d.nome}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                    <span style={{ color: '#2c2530', fontWeight: 500 }}>{d.nome}</span>
                    <span style={{ color: '#8b8391' }}>{d.tentativas} {d.tentativas === 1 ? 'resposta' : 'respostas'}</span>
                  </div>
                  <div style={{ ...s.progressTrack, marginTop: 6 }}><div style={{ width: `${Math.round((d.tentativas / maxTentativas) * 100)}%`, height: '100%', background: d.cor, borderRadius: 5 }} /></div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyHint>Você ainda não respondeu questões. Comece a praticar!</EmptyHint>
          )}
        </div>
        <div style={s.card}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={s.sectionTitle}>Menor desempenho</div><a href="#" onClick={(e) => { e.preventDefault(); go('desempenho'); }} style={s.link}>ver todas</a>
          </div>
          {piores.length ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 14 }}>
              {piores.map((d) => (
                <div key={d.nome}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                    <span style={{ color: '#2c2530', fontWeight: 500 }}>{d.nome}</span>
                    <span style={{ color: '#EF4444', fontWeight: 600 }}>{d.pct}%</span>
                  </div>
                  <div style={{ ...s.progressTrack, marginTop: 6 }}><div style={{ width: d.pct + '%', height: '100%', background: '#EF4444', borderRadius: 5 }} /></div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyHint>Sem dados suficientes para identificar pontos fracos ainda.</EmptyHint>
          )}
        </div>
      </div>

      {/* Desempenho completo — todas as disciplinas DO ACERVO */}
      <div style={s.card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={s.sectionTitle}>Desempenho completo</div>
          <a href="#" onClick={(e) => { e.preventDefault(); go('desempenho'); }} style={s.link}>Abrir análise</a>
        </div>
        {(disciplinas || []).length === 0 ? (
          <EmptyHint>
            {acervo?.estado === 'carregando'
              ? 'Carregando o acervo…'
              : 'Nenhuma disciplina no acervo ainda. As matérias aparecem aqui conforme as provas são carregadas e classificadas.'}
          </EmptyHint>
        ) : (
          <div style={{ overflowX: 'auto', marginTop: 12 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: '#8b8391', fontSize: 11.5 }}>
                  <th style={{ padding: '8px 10px', fontWeight: 600 }}>Disciplina</th>
                  <th style={{ padding: '8px 10px', fontWeight: 600, textAlign: 'right' }}>No acervo</th>
                  <th style={{ padding: '8px 10px', fontWeight: 600, textAlign: 'right' }}>Respondidas</th>
                  <th style={{ padding: '8px 10px', fontWeight: 600, textAlign: 'right' }}>Acertos</th>
                  <th style={{ padding: '8px 10px', fontWeight: 600, textAlign: 'right' }}>% Acerto</th>
                  <th style={{ padding: '8px 10px', fontWeight: 600 }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {disciplinas.map((d) => {
                  const st = STATUS_META[d.status] || STATUS_META.novo;
                  return (
                    <tr key={d.nome} style={{ borderTop: '1px solid rgba(0,0,0,.05)' }}>
                      <td style={{ padding: '9px 10px', color: '#2c2530' }}>
                        <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: d.cor, marginRight: 8 }} />
                        {d.nome}
                      </td>
                      <td style={{ padding: '9px 10px', textAlign: 'right', color: '#5c5462' }}>{d.total}</td>
                      <td style={{ padding: '9px 10px', textAlign: 'right', color: '#5c5462' }}>{d.respondidas}</td>
                      <td style={{ padding: '9px 10px', textAlign: 'right', color: '#5c5462' }}>{d.acertos}</td>
                      <td style={{ padding: '9px 10px', textAlign: 'right', fontWeight: 700, color: d.pct == null ? '#8b8391' : d.pct >= 70 ? '#10B981' : d.pct >= 50 ? '#B45309' : '#EF4444' }}>
                        {d.pct == null ? '—' : `${d.pct}%`}
                      </td>
                      <td style={{ padding: '9px 10px' }}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: st.color, background: st.bg, padding: '3px 8px', borderRadius: 20 }}>{st.label}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
