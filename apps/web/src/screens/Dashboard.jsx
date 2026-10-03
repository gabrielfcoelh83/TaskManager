import { Link002 } from '@/components/ui/skiper-ui/skiper40';
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

// Ladrilho do ícone: fundo com um véu da cor e o ícone na própria cor, em vez
// de ícone branco sobre degradê saturado.
function iw(_from, to) {
  return { width: 36, height: 36, borderRadius: 8, background: `${to}14`, color: to, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' };
}

// Filtra resultados de simulado pelos últimos N dias (por data_conclusao).
function filtrarPorPeriodo(resultados, dias) {
  if (!dias) return resultados;
  const limite = Date.now() - dias * 86400000;
  return resultados.filter((r) => r.data_conclusao && new Date(r.data_conclusao).getTime() >= limite);
}

const STATUS_META = {
  domina: { label: 'Domina', color: '#4A7A4A', bg: '#E4EEE1' },
  'em-desenvolvimento': { label: 'Em desenvolvimento', color: '#94661A', bg: '#F5EEDC' },
  necessita: { label: 'Precisa reforço', color: '#B4413A', bg: '#F6E4E1' },
  novo: { label: 'Não iniciado', color: '#7a766f', bg: '#f1efea' },
};

function EmptyHint({ children }) {
  return <div style={{ fontSize: 12.5, color: '#7a766f', padding: '10px 0', lineHeight: 1.5 }}>{children}</div>;
}

export default function Dashboard({ theme, s, data, go, dash, setDash, config, usuarioTentativas, resultados_historico, disciplinas, praticarDisciplina, acervo, dificuldades }) {
  const tentativas = usuarioTentativas || {};
  const resultados = resultados_historico || [];
  const questoes = data.QUESTOES || [];

  // ---- Métricas (derivadas dos dados reais) ----
  const taxa = taxaDeAcertos(tentativas, resultados, questoes);
  const streak = sequenciaAtual(tentativas, resultados);
  const meta = metaDiaria(config || {}, tentativas, resultados);

  const period = dash.period;
  const resultadosPeriodo = filtrarPorPeriodo(resultados, Number(period));
  const simResumo = resumoSimulados(resultadosPeriodo);
  const simPorTipo = desempenhoPorSimulado(resultadosPeriodo);

  const prioridade = prioridadeDeEstudo(disciplinas || [], { dificuldades });
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
      iconWrap: iw('#7A2E2E', '#7A2E2E'), icon: 'target', label: 'Taxa de acertos',
      value: taxa.pct != null ? `${taxa.pct}%` : '—',
      sub: taxa.total > 0 ? `${taxa.acertos}/${taxa.total} questões` : 'sem dados ainda',
    },
    {
      iconWrap: iw('#4A7A4A', '#3E6B3E'), icon: 'trending-up', label: 'Sequência atual',
      value: `${streak.dias} ${streak.dias === 1 ? 'dia' : 'dias'}`,
      sub: streak.dias > 0 ? 'estudando' : 'comece hoje!',
    },
    {
      iconWrap: iw('#B07A1F', '#94661A'), icon: 'flag', label: 'Meta diária',
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
            <div style={{ fontSize: 12.5, color: '#7a766f' }}>{st.label}</div>
            <div style={{ ...s.statNum, fontSize: 30, marginTop: 6 }}>{st.value}</div>
            <div style={s.statLabel}>{st.sub}</div>
          </div>
        ))}
      </div>

      {/* Meta de hoje + Desempenho em simulados */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 18, alignItems: 'start' }}>
        <div style={s.card}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={s.sectionTitle}><Icon name="calendar" color={theme.primary} size={20} />Hoje</div>
            <Link002 href="#" onClick={(e) => { e.preventDefault(); go('cronograma'); }} style={s.link}>Ver a semana</Link002>
          </div>
          <div style={{ marginTop: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: '#4f4b45', marginBottom: 8 }}>
              <span>Meta de hoje</span><span style={{ fontWeight: 700, color: '#1c1b19' }}>{meta.respondidas}/{meta.meta} questões</span>
            </div>
            <div style={s.progressTrack}><div style={{ width: `${meta.pct}%`, height: '100%', background: `linear-gradient(90deg, ${theme.gradA}, ${theme.gradB})`, borderRadius: 5, transition: 'width 320ms var(--ease-out)' }} /></div>
            <div style={{ fontSize: 12, color: '#7a766f', marginTop: 8 }}>
              {meta.batida ? 'Meta de hoje batida.' : `Faltam ${meta.faltam} questões para bater a meta de hoje.`}
            </div>
          </div>

          {/* O "próximo passo" agora aponta para uma disciplina de verdade e diz
              por que ela: antes era sempre o mesmo cartão, e o botão levava
              para a tela de questões sem filtrar nada. */}
          <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid #eeebe5' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#7a766f', textTransform: 'uppercase', letterSpacing: '.08em' }}>Próximo passo</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 10, flexWrap: 'wrap' }}>
              <div style={{ width: 40, height: 40, borderRadius: 8, background: `${proxima ? proxima.cor : theme.primary}14`, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
                <Icon name="book-open" color={proxima ? proxima.cor : theme.primary} size={18} />
              </div>
              <div style={{ flex: 1, minWidth: 180 }}>
                <div style={{ fontSize: 14.5, fontWeight: 700, color: '#1c1b19' }}>
                  {proxima ? proxima.nome : 'Praticar questões'}
                </div>
                <div style={{ fontSize: 12.5, color: '#7a766f' }}>
                  {proxima
                    ? proxima.pontoFraco
                      ? 'Você marcou como ponto fraco na sua ficha'
                      : proxima.pct != null
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
              style={{ fontSize: 12, border: '1px solid rgba(0,0,0,.08)', borderRadius: 8, padding: '5px 8px', color: '#4f4b45', background: '#fff' }}
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
                <div style={{ flex: 1, background: '#faf9f6', borderRadius: 10, padding: '8px 10px' }}>
                  <div style={{ fontSize: 11, color: '#7a766f' }}>Acertos</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#4A7A4A' }}>{simResumo.acertos}</div>
                </div>
                <div style={{ flex: 1, background: '#faf9f6', borderRadius: 10, padding: '8px 10px' }}>
                  <div style={{ fontSize: 11, color: '#7a766f' }}>Erros</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#B4413A' }}>{simResumo.erros}</div>
                </div>
                <div style={{ flex: 1, background: '#faf9f6', borderRadius: 10, padding: '8px 10px' }}>
                  <div style={{ fontSize: 11, color: '#7a766f' }}>% Acertos</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: theme.primary }}>{simResumo.pct}%</div>
                </div>
              </div>
              {simResumo.serie.length >= 2 && (
                <div style={{ marginTop: 14 }}><Sparkline points={simResumo.serie} labels={simResumo.serie.map((_, i) => `${i + 1}º simulado`)} color={theme.primary} /></div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 12 }}>
                {simPorTipo.map((sim, i) => (
                  <div
                    key={i}
                    title={`${sim.nome}\nAcertos: ${sim.acertos}/${sim.questoes}\nTaxa: ${sim.pct}%\nTentativas: ${sim.tentativas}\nTempo médio: ${sim.tempoMedioMin} min${sim.ultima ? `\nÚltima: ${new Date(sim.ultima).toLocaleDateString('pt-BR')}` : ''}`}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12, cursor: 'default' }}
                  >
                    <span style={{ color: '#4f4b45', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70%' }}>{sim.nome}</span>
                    <span style={{ fontWeight: 700, color: sim.pct >= 70 ? '#4A7A4A' : sim.pct >= 50 ? '#94661A' : '#B4413A' }}>{sim.pct}%</span>
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
          <div style={s.sectionTitle}>Evolução dos estudos <span style={{ fontSize: 12, fontWeight: 400, color: '#7a766f' }}>· por disciplina</span></div>
          <Link002 href="#" onClick={(e) => { e.preventDefault(); go('desempenho'); }} style={s.link}>Ver mais</Link002>
        </div>
        {evolucao.length ? (
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${evolucao.length}, 1fr)`, gap: 16, marginTop: 16 }}>
            {evolucao.map((ev, i) => {
              const deltaColor = ev.delta == null ? '#7a766f' : ev.delta >= 0 ? '#4A7A4A' : '#B4413A';
              const deltaTxt = ev.delta == null ? 'só uma semana' : `${ev.delta >= 0 ? '+' : ''}${ev.delta} pp no período`;
              return (
                <div key={i}>
                  <div style={{ fontSize: 12, color: '#7a766f', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.disciplina}</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: '#1c1b19', marginTop: 2 }}>{ev.taxaAtual != null ? `${ev.taxaAtual}%` : '—'}</div>
                  <div style={{ fontSize: 11.5, color: deltaColor, fontWeight: 600 }}>{deltaTxt}</div>
                  {ev.pontos.length >= 2 && (
                    <div style={{ marginTop: 10 }}>
                      <Sparkline
                        points={ev.pontos}
                        labels={ev.pontos.map((_, k) => { const n = ev.pontos.length - 1 - k; return n === 0 ? 'esta semana' : `${n} sem. atrás`; })}
                        color={theme.primary}
                        height={70}
                      />
                    </div>
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
            <div style={s.sectionTitle}>Matérias mais estudadas</div><Link002 href="#" onClick={(e) => { e.preventDefault(); go('disciplinas'); }} style={s.link}>ver todas</Link002>
          </div>
          {maisEstudadas.length ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 14 }}>
              {maisEstudadas.map((d) => (
                <div key={d.nome}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                    <span style={{ color: '#1c1b19', fontWeight: 500 }}>{d.nome}</span>
                    <span style={{ color: '#7a766f' }}>{d.tentativas} {d.tentativas === 1 ? 'resposta' : 'respostas'}</span>
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
            <div style={s.sectionTitle}>Menor desempenho</div><Link002 href="#" onClick={(e) => { e.preventDefault(); go('desempenho'); }} style={s.link}>ver todas</Link002>
          </div>
          {piores.length ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 14 }}>
              {piores.map((d) => (
                <div key={d.nome}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                    <span style={{ color: '#1c1b19', fontWeight: 500 }}>{d.nome}</span>
                    <span style={{ color: '#B4413A', fontWeight: 600 }}>{d.pct}%</span>
                  </div>
                  <div style={{ ...s.progressTrack, marginTop: 6 }}><div style={{ width: d.pct + '%', height: '100%', background: '#B4413A', borderRadius: 5 }} /></div>
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
          <Link002 href="#" onClick={(e) => { e.preventDefault(); go('desempenho'); }} style={s.link}>Abrir análise</Link002>
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
                <tr style={{ textAlign: 'left', color: '#7a766f', fontSize: 11.5 }}>
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
                    <tr key={d.nome} style={{ borderTop: '1px solid #e6e2da' }}>
                      <td style={{ padding: '9px 10px', color: '#1c1b19' }}>
                        <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: d.cor, marginRight: 8 }} />
                        {d.nome}
                      </td>
                      <td style={{ padding: '9px 10px', textAlign: 'right', color: '#4f4b45' }}>{d.total}</td>
                      <td style={{ padding: '9px 10px', textAlign: 'right', color: '#4f4b45' }}>{d.respondidas}</td>
                      <td style={{ padding: '9px 10px', textAlign: 'right', color: '#4f4b45' }}>{d.acertos}</td>
                      <td style={{ padding: '9px 10px', textAlign: 'right', fontWeight: 700, color: d.pct == null ? '#7a766f' : d.pct >= 70 ? '#4A7A4A' : d.pct >= 50 ? '#94661A' : '#B4413A' }}>
                        {d.pct == null ? '—' : `${d.pct}%`}
                      </td>
                      <td style={{ padding: '9px 10px' }}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: st.color, background: st.bg, padding: '3px 8px', borderRadius: 10 }}>{st.label}</span>
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
