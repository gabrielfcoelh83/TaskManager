import { useEffect, useMemo, useState } from 'react';
import { Icon } from '../lib/icons';
import { planoDaSemana, diasDoMes, resumoDoPlano } from '../lib/agenda';
import { diasAteProva } from '../lib/metrics';
import { ICONE_POR_DISCIPLINA } from '../lib/navegacao';
import { HaloBadge } from '@/components/ui/halo-badge';
import {
  iniciarConexaoGoogleCalendar,
  statusGoogleCalendar,
  sincronizarGoogleCalendar,
  desconectarGoogleCalendar,
} from '../lib/api/api';

const SEMANA = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

function Stat({ label, value, accent }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 105 }}>
      <span style={{ fontSize: 11, color: '#817b76', letterSpacing: '.03em' }}>{label}</span>
      <strong style={{ color: accent || '#272226', fontSize: 15, fontWeight: 650 }}>{value}</strong>
    </div>
  );
}

function CalendarDay({ cell, theme }) {
  if (cell.vazia) return <div aria-hidden="true" />;
  const ativo = cell.respondidas > 0;
  return (
    <div
      title={ativo ? `${cell.respondidas} ${cell.respondidas === 1 ? 'questão' : 'questões'}` : 'sem estudo'}
      style={{
        minHeight: 31,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 9,
        fontSize: 11.5,
        color: cell.hoje ? '#fff' : ativo ? theme.primaryDark : '#5d5755',
        background: cell.hoje ? theme.primary : ativo ? theme.primarySoft : 'transparent',
        boxShadow: cell.hoje ? `0 4px 10px ${theme.primary}30` : 'none',
        fontWeight: cell.hoje || ativo ? 700 : 450,
      }}
    >
      {cell.n}
    </div>
  );
}

export default function Cronograma({ theme, s, usuarioTentativas, disciplinas, config, praticarDisciplina, go, dificuldades }) {
  const [calendar, setCalendar] = useState({ connected: false, loading: true, syncing: false, error: null });
  const meta = Number(config?.meta) > 0 ? Number(config.meta) : 20;
  const plano = planoDaSemana({ disciplinas, tentativas: usuarioTentativas, meta, dificuldades });
  const calendario = diasDoMes(usuarioTentativas);
  const resumo = resumoDoPlano({ tentativas: usuarioTentativas, disciplinas });
  const faltam = diasAteProva(config);
  const hoje = plano[0];
  const semanaRespondida = plano.reduce((total, dia) => total + dia.respondidas, 0);
  const semanaMeta = plano.reduce((total, dia) => total + dia.meta, 0);
  const progressoSemana = semanaMeta ? Math.min(100, Math.round((semanaRespondida / semanaMeta) * 100)) : 0;
  const eventos = useMemo(() => plano.map((dia, index) => {
    const data = new Date();
    data.setDate(data.getDate() + index);
    const start = new Date(data);
    start.setHours(8, 0, 0, 0);
    const end = new Date(start);
    end.setMinutes(end.getMinutes() + 90);
    return {
      id: `maquestoes-${dia.chave}-${(dia.disciplina || 'livre').toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      summary: `Estudo — ${dia.disciplina || 'revisão livre'}`,
      description: `Meta: ${dia.meta} questões. ${dia.motivo || ''}`.trim(),
      start: start.toISOString(),
      end: end.toISOString(),
      timeZone: 'UTC',
    };
  }), [plano]);

  useEffect(() => {
    let ativo = true;
    statusGoogleCalendar()
      .then((status) => ativo && setCalendar((atual) => ({ ...atual, ...status, loading: false })))
      .catch((error) => ativo && setCalendar((atual) => ({ ...atual, loading: false, error: error.message })));
    return () => { ativo = false; };
  }, []);

  useEffect(() => {
    const resultado = new URLSearchParams(window.location.search).get('calendar');
    if (resultado === 'connected') setCalendar((atual) => ({ ...atual, connected: true, loading: false }));
    if (resultado === 'error') setCalendar((atual) => ({ ...atual, loading: false, error: 'Não foi possível conectar o Google Calendar.' }));
  }, []);

  const conectarCalendar = async () => {
    setCalendar((atual) => ({ ...atual, error: null }));
    try {
      const { url } = await iniciarConexaoGoogleCalendar();
      window.location.assign(url);
    } catch (error) {
      setCalendar((atual) => ({ ...atual, error: error.message }));
    }
  };

  const sincronizarCalendar = async () => {
    setCalendar((atual) => ({ ...atual, syncing: true, error: null }));
    try {
      await sincronizarGoogleCalendar(eventos);
    } catch (error) {
      setCalendar((atual) => ({ ...atual, error: error.message }));
    } finally {
      setCalendar((atual) => ({ ...atual, syncing: false }));
    }
  };

  const desconectarCalendar = async () => {
    await desconectarGoogleCalendar();
    setCalendar((atual) => ({ ...atual, connected: false }));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <section
        style={{
          ...s.card,
          padding: 24,
          background: `linear-gradient(135deg, #fff 0%, ${theme.primarySoft} 100%)`,
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div style={{ position: 'absolute', right: -36, top: -62, width: 190, height: 190, borderRadius: '50%', border: `1px solid ${theme.primary}20` }} />
        <div style={{ position: 'absolute', right: 24, top: 24, width: 74, height: 74, borderRadius: '50%', border: `1px solid ${theme.primary}15` }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 20, alignItems: 'flex-start', position: 'relative' }}>
          <div>
            <div style={{ fontSize: 11, color: theme.primary, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase' }}>Seu ritmo de estudo</div>
            <h2 style={{ ...s.pageTitle, fontSize: 30, margin: '8px 0 4px', maxWidth: 520 }}>Uma semana possível, não perfeita.</h2>
            <p style={{ ...s.pageSub, maxWidth: 500, lineHeight: 1.55, margin: 0 }}>
              O cronograma combina sua meta com os assuntos que mais precisam de atenção.
            </p>
          </div>
          <button type="button" style={{ ...s.btnOutline, display: 'flex', alignItems: 'center', gap: 7, background: '#ffffffb8' }} onClick={() => go('configuracoes')}>
            <Icon name="settings" color={theme.primary} size={14} />
            Ajustar plano
          </button>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 22, marginTop: 25, paddingTop: 18, borderTop: `1px solid ${theme.primary}18`, position: 'relative' }}>
          <Stat label="Meta diária" value={`${meta} questões`} />
          <Stat label="Hoje" value={`${hoje.respondidas}/${meta} respondidas`} accent={hoje.pct >= 100 ? '#4a7a4a' : theme.primaryDark} />
          <Stat label="Prova" value={faltam != null ? `${faltam} dias` : 'sem data'} />
          <div style={{ flex: 1, minWidth: 180, maxWidth: 330, marginLeft: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#817b76', marginBottom: 7 }}>
              <span>Ritmo da semana</span>
              <strong style={{ color: theme.primaryDark }}>{progressoSemana}%</strong>
            </div>
            <div style={{ height: 7, borderRadius: 8, background: '#ffffffa8', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${progressoSemana}%`, background: theme.primary, borderRadius: 8, transition: 'width 320ms var(--ease-out)' }} />
            </div>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.65fr)_minmax(280px,.85fr)]" style={{ gap: 18, alignItems: 'start' }}>
        <section style={{ ...s.card, padding: 22 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 14, marginBottom: 17 }}>
            <div>
              <div style={{ ...s.sectionTitle, fontFamily: "'Newsreader', Georgia, serif", fontSize: 22, fontWeight: 500 }}>Próximos dias</div>
              <div style={{ fontSize: 12, color: '#817b76', marginTop: 4 }}>Uma sugestão que se adapta ao seu desempenho.</div>
            </div>
            <span style={{ fontSize: 11, color: '#817b76' }}>7 dias</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            {plano.map((dia) => (
              <div
                key={dia.chave}
                data-testid={`dia-${dia.chave}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 13,
                  padding: '12px 13px',
                  borderRadius: 12,
                  background: dia.hoje ? theme.primarySoft : '#fff',
                  border: `1px solid ${dia.hoje ? `${theme.primary}22` : '#eeeae5'}`,
                  flexWrap: 'wrap',
                  transition: 'border-color 160ms ease, transform 160ms ease',
                }}
              >
                <div style={{ width: 43, textAlign: 'center', flex: 'none' }}>
                  <div style={{ fontSize: 10, color: dia.hoje ? theme.primary : '#817b76', fontWeight: 700 }}>{dia.dow}</div>
                  <div style={{ fontSize: 19, lineHeight: 1.25, fontWeight: 700, color: '#2c282b' }}>{dia.dia}</div>
                  {dia.hoje && <HaloBadge live interactive={false} layout={false} style={{ marginTop: 3 }}>Hoje</HaloBadge>}
                </div>

                <div style={{ width: 36, height: 36, borderRadius: 11, background: `${dia.cor || theme.primary}14`, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
                  <Icon name={ICONE_POR_DISCIPLINA[dia.disciplina] || 'book-open'} color={dia.cor || theme.primary} size={18} />
                </div>

                <div style={{ flex: 1, minWidth: 170 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: '#2c282b' }}>{dia.disciplina || 'Livre'}</div>
                  <div style={{ fontSize: 11.5, color: '#817b76', marginTop: 2 }}>{dia.motivo || 'Nenhuma disciplina disponível ainda'}</div>
                </div>

                <div style={{ width: 118, minWidth: 105 }}>
                  {dia.futuro ? (
                    <div style={{ fontSize: 11.5, color: '#9a938e' }}>planejado</div>
                  ) : (
                    <>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: '#817b76', marginBottom: 5 }}>
                        <span>Progresso</span><strong style={{ color: '#4a4544' }}>{dia.respondidas}/{dia.meta}</strong>
                      </div>
                      <div style={{ height: 6, borderRadius: 8, background: '#eeeae5', overflow: 'hidden' }}>
                        <div style={{ width: `${dia.pct}%`, height: '100%', background: dia.pct >= 100 ? '#4a7a4a' : theme.primary, borderRadius: 8 }} />
                      </div>
                    </>
                  )}
                </div>

                <button
                  type="button"
                  style={{ ...(dia.hoje ? s.btnPrimary : s.btnOutline), flex: 'none', padding: dia.hoje ? '8px 12px' : '7px 11px', fontSize: 11.5, display: 'flex', alignItems: 'center', gap: 5 }}
                  disabled={!dia.disciplina}
                  onClick={() => dia.disciplina && praticarDisciplina(dia.disciplina)}
                >
                  <Icon name="play" color={dia.hoje ? '#fff' : '#3f393c'} size={11} />
                  {dia.hoje ? 'Estudar' : 'Adiantar'}
                </button>
              </div>
            ))}
          </div>
        </section>

        <aside style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <section style={{ ...s.card, padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ ...s.sectionTitle, fontSize: 14 }}><Icon name="calendar" color={theme.primary} size={17} />Calendário</div>
              <span style={{ fontSize: 12, fontWeight: 650, color: '#3d373b' }}>{calendario.rotulo}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 3, marginTop: 15, textAlign: 'center' }}>
              {SEMANA.map((dia, i) => <div key={i} style={{ fontSize: 10, color: '#9a938e', fontWeight: 700, paddingBottom: 4 }}>{dia}</div>)}
              {calendario.celulas.map((cell, i) => <CalendarDay key={cell.chave || `v${i}`} cell={cell} theme={theme} />)}
            </div>
            <div style={{ display: 'flex', gap: 12, marginTop: 14, fontSize: 10.5, color: '#817b76' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><i style={{ width: 7, height: 7, borderRadius: '50%', background: theme.primary, display: 'block' }} />Hoje</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><i style={{ width: 7, height: 7, borderRadius: '50%', background: theme.primarySoft, display: 'block' }} />Estudou</span>
            </div>
          </section>

          <section style={{ ...s.card, padding: 20, background: theme.primaryDark, color: '#fff' }}>
            <div style={{ fontSize: 10.5, color: '#eadde6', fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase' }}>Seu registro</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 15 }}>
              <div style={{ width: 88, height: 88, borderRadius: '50%', background: `conic-gradient(${theme.accent} 0% ${resumo.cobertura}%, #ffffff20 ${resumo.cobertura}% 100%)`, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
                <div style={{ width: 67, height: 67, borderRadius: '50%', background: theme.primaryDark, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                  <strong style={{ fontSize: 16 }}>{resumo.cobertura}%</strong>
                  <span style={{ fontSize: 9, color: '#eadde6' }}>do acervo</span>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 11.5 }}>
                <div><span style={{ color: '#cdbcc8' }}>Dias com estudo</span><strong style={{ display: 'block', fontSize: 14 }}>{resumo.diasAtivos}</strong></div>
                <div><span style={{ color: '#cdbcc8' }}>Respostas registradas</span><strong style={{ display: 'block', fontSize: 14 }}>{resumo.respondidas}</strong></div>
              </div>
            </div>
          </section>

          <section style={{ ...s.card, padding: 20, border: `1px dashed ${theme.primary}45`, background: '#fffdfb' }}>
            <div style={{ display: 'flex', gap: 11, alignItems: 'flex-start' }}>
              <div style={{ width: 34, height: 34, borderRadius: 10, background: '#f1ece8', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
                <Icon name="calendar" color={theme.primary} size={17} />
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#352e33' }}>Google Calendar</div>
                <p style={{ margin: '4px 0 0', fontSize: 11.5, lineHeight: 1.5, color: '#817b76' }}>
                  Leve os blocos da sua semana para a agenda que já usa.
                </p>
                {calendar.error && <div role="alert" style={{ marginTop: 9, fontSize: 11, color: '#9a3f3f' }}>{calendar.error}</div>}
                {calendar.loading ? (
                  <span style={{ display: 'inline-block', marginTop: 10, fontSize: 10.5, color: '#817b76' }}>Verificando conexão...</span>
                ) : calendar.connected ? (
                  <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                    <button type="button" style={{ ...s.btnPrimary, padding: '7px 10px', fontSize: 10.5 }} onClick={sincronizarCalendar} disabled={calendar.syncing}>
                      {calendar.syncing ? 'Sincronizando...' : 'Sincronizar plano'}
                    </button>
                    <button type="button" style={{ ...s.btnOutline, padding: '6px 9px', fontSize: 10.5 }} onClick={desconectarCalendar}>Desconectar</button>
                  </div>
                ) : (
                  <button type="button" style={{ ...s.btnPrimary, marginTop: 10, padding: '7px 10px', fontSize: 10.5 }} onClick={conectarCalendar}>
                    Conectar Google Calendar
                  </button>
                )}
              </div>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
