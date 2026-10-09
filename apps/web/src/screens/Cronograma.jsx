import { useEffect, useRef, useState } from 'react';
import { Icon } from '../lib/icons';
import {
  planoDaSemana, diasDoMes, resumoDoPlano, ritmoDaSemana, blocoLegivel, duracaoLegivel, eventosDoPlano, intervaloDoPlano,
  fusoDoNavegador, resumoDaSincronizacao, mensagemDoCalendario, retornoDoGoogle, searchSemRetorno,
  mesDeslocado, limitesDoCalendario, horarioValido, HORARIO_PADRAO, MINUTOS_PADRAO,
} from '../lib/agenda';
import { DIAS_DA_SEMANA } from '../lib/ficha';
import { diasAteProva } from '../lib/metrics';
import { ICONE_POR_DISCIPLINA } from '../lib/navegacao';
import { HaloBadge } from '@/components/ui/halo-badge';
import {
  iniciarConexaoGoogleCalendar,
  confirmarGoogleCalendar,
  statusGoogleCalendar,
  sincronizarGoogleCalendar,
  desconectarGoogleCalendar,
} from '../lib/api/api';

const SEMANA = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

// O código do retorno do Google vale uma vez. Em desenvolvimento o
// StrictMode monta o efeito duas vezes: sem guardar a promessa por código, o
// segundo POST de `confirm` voltaria "código já usado" e a tela mostraria
// erro numa conexão que deu certo.
const confirmacoes = new Map();
function confirmarUmaVez(codigo) {
  if (!confirmacoes.has(codigo)) confirmacoes.set(codigo, confirmarGoogleCalendar(codigo));
  return confirmacoes.get(codigo);
}

function Stat({ label, value, accent, testId }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 105 }} data-testid={testId}>
      <span style={{ fontSize: 11, color: '#817b76', letterSpacing: '.03em' }}>{label}</span>
      <strong style={{ color: accent || '#272226', fontSize: 15, fontWeight: 650 }}>{value}</strong>
    </div>
  );
}

function CalendarDay({ cell, theme }) {
  if (cell.vazia) return <div aria-hidden="true" />;
  const ativo = cell.respondidas > 0;
  const titulo = ativo
    ? `${cell.respondidas} ${cell.respondidas === 1 ? 'questão' : 'questões'}`
    : cell.planejado ? 'dia de estudo planejado' : 'sem estudo';
  return (
    <div
      title={titulo}
      data-testid={`cal-${cell.chave}`}
      style={{
        minHeight: 31,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 9,
        fontSize: 11.5,
        color: cell.hoje ? '#fff' : ativo ? theme.primaryDark : '#5d5755',
        background: cell.hoje ? theme.primary : ativo ? theme.primarySoft : 'transparent',
        border: cell.planejado && !cell.hoje ? `1px dashed ${theme.primary}70` : '1px solid transparent',
        boxShadow: cell.hoje ? `0 4px 10px ${theme.primary}30` : 'none',
        fontWeight: cell.hoje || ativo ? 700 : 450,
      }}
    >
      {cell.n}
    </div>
  );
}

// O horário do bloco de estudo (`profile_data.agenda.horario`). Vai para a
// conta pela fila de preferências do App; a duração é o tempo por dia da ficha.
function HorarioDoBloco({ theme, s, bloco, salvarAgenda, perfilCarregado, conectado }) {
  const [rascunho, setRascunho] = useState(bloco.horario);
  const [estado, setEstado] = useState({ salvando: false, salvo: false, erro: null });
  const montado = useRef(true);
  // `true` também na montagem: o StrictMode desmonta e monta de novo, e só
  // a limpeza deixaria a ref em `false` — a resposta seria ignorada.
  useEffect(() => {
    montado.current = true;
    return () => { montado.current = false; };
  }, []);
  // O valor salvo pode chegar depois (perfil carregando, outra aba).
  useEffect(() => { setRascunho(bloco.horario); }, [bloco.horario]);

  const valido = horarioValido(rascunho);
  const mudou = valido && valido !== bloco.horario;

  const salvar = async (e) => {
    e.preventDefault();
    if (!mudou) return;
    setEstado({ salvando: true, salvo: false, erro: null });
    try {
      const ok = await salvarAgenda({ horario: valido });
      if (montado.current) setEstado({ salvando: false, salvo: Boolean(ok), erro: null });
    } catch (err) {
      if (montado.current) setEstado({ salvando: false, salvo: false, erro: `O horário não foi salvo: ${err.message}` });
    }
  };

  return (
    <form onSubmit={salvar} style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        <label htmlFor="horario-do-bloco" style={{ fontSize: 11, color: '#817b76' }}>Horário do estudo</label>
        <input
          id="horario-do-bloco"
          data-testid="horario-do-bloco"
          type="time"
          value={rascunho}
          onChange={(e) => { setRascunho(e.target.value); setEstado({ salvando: false, salvo: false, erro: null }); }}
          disabled={!perfilCarregado}
          style={{ fontSize: 12.5, border: '1px solid rgba(0,0,0,.12)', borderRadius: 8, padding: '4px 7px', fontFamily: 'inherit', color: '#2c282b', background: '#fff' }}
        />
        {mudou && (
          <button type="submit" data-testid="salvar-horario" disabled={estado.salvando} style={{ ...s.btnPrimary, padding: '5px 10px', fontSize: 11 }}>
            {estado.salvando ? 'Salvando…' : 'Salvar'}
          </button>
        )}
      </div>
      <div aria-live="polite" style={{ fontSize: 10.5, color: estado.erro ? '#9a3f3f' : '#817b76', maxWidth: 260, textAlign: 'right' }}>
        {estado.erro
          || (!perfilCarregado ? 'Seu perfil ainda não carregou.' : null)
          || (estado.salvo
            ? (conectado ? 'Horário salvo. Sincronize de novo para levá-lo à agenda.' : 'Horário salvo.')
            : `Duração: ${duracaoLegivel(bloco.minutos)} (o tempo por dia da sua ficha).`)}
      </div>
      {!valido && rascunho !== '' && <span style={{ fontSize: 10.5, color: theme.primaryDark }}>Use o formato HH:MM.</span>}
    </form>
  );
}

export default function Cronograma({
  theme, s, usuarioTentativas, disciplinas, config, praticarDisciplina, go, dificuldades,
  diasDeEstudo = null, bloco = { horario: HORARIO_PADRAO, minutos: MINUTOS_PADRAO },
  salvarAgenda, perfilCarregado = true, sessaoExpirou,
}) {
  const [calendar, setCalendar] = useState({
    connected: false, loading: true, syncing: false, statusFalhou: false, confirmarDesconexao: false, desconectando: false, erro: null, aviso: null,
  });
  const [verificacao, setVerificacao] = useState(0);
  const [deslocamento, setDeslocamento] = useState(0);
  // O retorno do Google é lido UMA vez, na montagem; o efeito abaixo limpa a
  // URL logo em seguida, para recarregar a página não confirmar de novo.
  const [retorno] = useState(() => retornoDoGoogle(window.location.search));
  const montado = useRef(true);
  // `true` também na montagem: o StrictMode desmonta e monta de novo, e só
  // a limpeza deixaria a ref em `false` — a resposta seria ignorada.
  useEffect(() => {
    montado.current = true;
    return () => { montado.current = false; };
  }, []);

  const meta = Number(config?.meta) > 0 ? Number(config.meta) : 20;
  const hojeData = new Date();
  // Barato (sete dias sobre listas já derivadas): calcular por render é mais
  // simples que um useMemo cujas dependências mudam a cada render do App.
  const plano = planoDaSemana({ disciplinas, tentativas: usuarioTentativas, meta, dificuldades, diasDeEstudo, hoje: hojeData });
  const ritmo = ritmoDaSemana({ tentativas: usuarioTentativas, meta, diasDeEstudo, hoje: hojeData });
  const limites = limitesDoCalendario(hojeData);
  const mesVisto = mesDeslocado(hojeData, deslocamento);
  const calendario = diasDoMes(usuarioTentativas, {
    hoje: hojeData, ...mesVisto, planejados: plano.filter((d) => !d.folga).map((d) => d.chave),
  });
  const resumo = resumoDoPlano({ tentativas: usuarioTentativas, disciplinas });
  const faltam = diasAteProva(config);
  const hoje = plano[0];
  const bonusDeHoje = hoje.folga && hoje.respondidas > 0;
  const nomesDosDias = diasDeEstudo
    ? DIAS_DA_SEMANA.filter((d) => diasDeEstudo.includes(d.dia)).map((d) => d.curto.toLowerCase()).join(', ')
    : null;

  // O status é consultado SEMPRE ao abrir — antes só quando a URL trazia
  // `?calendar=connected`, e em qualquer outra visita a tela oferecia
  // "Conectar" a quem já estava conectado. Antes do status, trata o retorno
  // do Google: `confirmar` conclui a conexão (autenticado), `error` avisa.
  useEffect(() => {
    let cancelado = false;
    if (retorno) {
      const { pathname, search, hash } = window.location;
      window.history.replaceState(window.history.state, '', `${pathname}${searchSemRetorno(search)}${hash}`);
    }
    const primeira = verificacao === 0;
    setCalendar((c) => ({ ...c, loading: true, statusFalhou: false }));

    (async () => {
      let aviso = null;
      let erro = null;
      if (primeira && retorno?.tipo === 'erro') {
        erro = 'O Google Agenda não foi conectado: a autorização foi negada ou falhou. Tente de novo.';
      }
      if (primeira && retorno?.tipo === 'confirmar') {
        try {
          await confirmarUmaVez(retorno.codigo);
          aviso = 'Google Agenda conectado. Agora é só sincronizar o plano.';
        } catch (err) {
          if (cancelado) return;
          if (err.status === 401) { sessaoExpirou?.(); return; }
          erro = mensagemDoCalendario(err, 'confirmar');
        }
      }
      try {
        const status = await statusGoogleCalendar();
        if (cancelado) return;
        setCalendar((c) => ({
          ...c, loading: false, connected: Boolean(status?.connected), statusFalhou: false,
          aviso: aviso ?? c.aviso, erro: erro ?? (primeira ? c.erro : null),
        }));
      } catch (err) {
        if (cancelado) return;
        if (err.status === 401) { sessaoExpirou?.(); return; }
        setCalendar((c) => ({
          ...c, loading: false, connected: false, statusFalhou: true, aviso, erro: erro || mensagemDoCalendario(err, 'status'),
        }));
      }
    })();
    return () => { cancelado = true; };
  }, [retorno, verificacao, sessaoExpirou]);

  const conectarCalendar = async () => {
    setCalendar((c) => ({ ...c, erro: null, aviso: null }));
    try {
      const { url } = await iniciarConexaoGoogleCalendar();
      window.location.assign(url);
    } catch (err) {
      if (!montado.current) return;
      if (err.status === 401) { sessaoExpirou?.(); return; }
      setCalendar((c) => ({ ...c, erro: mensagemDoCalendario(err, 'conectar') }));
    }
  };

  // Os eventos saem na hora do clique, do plano que está na tela: um por dia
  // de estudo, com o horário do bloco e o fuso do navegador.
  const sincronizarCalendar = async () => {
    setCalendar((c) => ({ ...c, syncing: true, erro: null, aviso: null }));
    try {
      // Plano recalculado na hora do clique: com a aba aberta desde ontem, o
      // `plano` do último render começaria ontem e deixaria hoje+6 de fora.
      const planoAgora = planoDaSemana({ disciplinas, tentativas: usuarioTentativas, meta, dificuldades, diasDeEstudo, hoje: new Date() });
      const resposta = await sincronizarGoogleCalendar({
        events: eventosDoPlano(planoAgora, { ...bloco, timeZone: fusoDoNavegador() }),
        intervalo: intervaloDoPlano(planoAgora),
      });
      if (!montado.current) return;
      setCalendar((c) => ({ ...c, syncing: false, aviso: resumoDaSincronizacao(resposta) }));
    } catch (err) {
      if (!montado.current) return;
      if (err.status === 401) { sessaoExpirou?.(); return; }
      // 409: o Google revogou o acesso e o servidor já apagou a conexão —
      // volta a "Conectar". 504 e o resto deixam o botão para tentar de novo
      // (o sync é idempotente: um evento por dia, regravado).
      setCalendar((c) => ({
        ...c, syncing: false, connected: err.status === 409 ? false : c.connected, erro: mensagemDoCalendario(err, 'sincronizar'),
      }));
    }
  };

  const desconectarCalendar = async () => {
    setCalendar((c) => ({ ...c, desconectando: true, erro: null, aviso: null }));
    try {
      await desconectarGoogleCalendar();
      if (!montado.current) return;
      setCalendar((c) => ({ ...c, desconectando: false, confirmarDesconexao: false, connected: false, aviso: 'Google Agenda desconectado.' }));
    } catch (err) {
      if (!montado.current) return;
      if (err.status === 401) { sessaoExpirou?.(); return; }
      setCalendar((c) => ({ ...c, desconectando: false, confirmarDesconexao: false, erro: mensagemDoCalendario(err, 'desconectar') }));
    }
  };

  const botaoMes = (lado) => {
    const proximo = lado === 'anterior' ? deslocamento - 1 : deslocamento + 1;
    const pode = proximo >= limites.min && proximo <= limites.max;
    return (
      <button
        type="button"
        aria-label={lado === 'anterior' ? 'Mês anterior' : 'Próximo mês'}
        data-testid={lado === 'anterior' ? 'mes-anterior' : 'mes-seguinte'}
        disabled={!pode}
        onClick={() => setDeslocamento(proximo)}
        style={{
          width: 26, height: 26, borderRadius: 8, border: '1px solid #eeeae5', background: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: pode ? 'pointer' : 'default', opacity: pode ? 1 : 0.35, padding: 0,
        }}
      >
        <Icon name="chevron-left" color="#5d5755" size={14} style={lado === 'anterior' ? undefined : { transform: 'rotate(180deg)' }} />
      </button>
    );
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
              O cronograma combina sua meta e seus dias de estudo com os assuntos que mais precisam de atenção.
            </p>
          </div>
          {/* Dias e tempo de estudo moram em "Meu perfil de estudo", no meio das
              Configurações: a âncora rola até lá. */}
          <button
            type="button"
            data-testid="ajustar-plano"
            style={{ ...s.btnOutline, display: 'flex', alignItems: 'center', gap: 7, background: '#ffffffb8' }}
            onClick={() => go('configuracoes', { ancora: 'meu-perfil-de-estudo' })}
          >
            <Icon name="settings" color={theme.primary} size={14} />
            Ajustar plano
          </button>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 22, marginTop: 25, paddingTop: 18, borderTop: `1px solid ${theme.primary}18`, position: 'relative' }}>
          <Stat label="Meta por dia de estudo" value={`${meta} questões`} />
          <Stat
            label="Hoje"
            testId="stat-hoje"
            value={hoje.folga ? (bonusDeHoje ? `Folga · ${hoje.respondidas} respondidas` : 'Folga') : `${hoje.respondidas}/${meta} respondidas`}
            accent={hoje.folga ? '#5d5755' : hoje.pct >= 100 ? '#4a7a4a' : theme.primaryDark}
          />
          <Stat label="Prova" value={faltam != null ? `${faltam} dias` : 'sem data'} />
          <div style={{ flex: 1, minWidth: 200, maxWidth: 340, marginLeft: 'auto' }} data-testid="ritmo-semana">
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#817b76', marginBottom: 7 }}>
              <span>Esta semana, até hoje</span>
              <strong style={{ color: theme.primaryDark }} data-testid="ritmo-pct">{ritmo.pct == null ? '—' : `${ritmo.pct}%`}</strong>
            </div>
            <div style={{ height: 7, borderRadius: 8, background: '#ffffffa8', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${Math.min(100, ritmo.pct || 0)}%`, background: theme.primary, borderRadius: 8, transition: 'width 320ms var(--ease-out)' }} />
            </div>
            <div style={{ fontSize: 10.5, color: '#817b76', marginTop: 6 }}>
              {ritmo.dias === 0
                ? 'Nenhum dia de estudo nesta semana ainda.'
                : `${ritmo.respondidas} de ${ritmo.meta} questões em ${ritmo.dias} ${ritmo.dias === 1 ? 'dia' : 'dias'} de estudo, desde domingo.`}
            </div>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.65fr)_minmax(280px,.85fr)]" style={{ gap: 18, alignItems: 'start' }}>
        <section style={{ ...s.card, padding: 22 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14, marginBottom: 17, flexWrap: 'wrap' }}>
            <div>
              <div style={{ ...s.sectionTitle, fontFamily: "'Newsreader', Georgia, serif", fontSize: 22, fontWeight: 500 }}>Próximos dias</div>
              <div style={{ fontSize: 12, color: '#817b76', marginTop: 4 }} data-testid="dias-de-estudo">
                {nomesDosDias
                  ? `Seus dias de estudo: ${nomesDosDias}. Os outros são folga.`
                  : 'Todo dia é dia de estudo. Escolha seus dias em "Ajustar plano".'}
              </div>
            </div>
            <HorarioDoBloco
              theme={theme}
              s={s}
              bloco={bloco}
              salvarAgenda={salvarAgenda}
              perfilCarregado={perfilCarregado && Boolean(salvarAgenda)}
              conectado={calendar.connected}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            {plano.map((dia) => (
              <div
                key={dia.chave}
                data-testid={`dia-${dia.chave}`}
                data-folga={dia.folga ? 'sim' : 'nao'}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 13,
                  padding: '12px 13px',
                  borderRadius: 12,
                  background: dia.hoje ? theme.primarySoft : dia.folga ? '#faf8f6' : '#fff',
                  border: `1px ${dia.folga ? 'dashed' : 'solid'} ${dia.hoje ? `${theme.primary}22` : '#eeeae5'}`,
                  flexWrap: 'wrap',
                  transition: 'border-color 160ms ease, transform 160ms ease',
                }}
              >
                <div style={{ width: 43, textAlign: 'center', flex: 'none' }}>
                  <div style={{ fontSize: 10, color: dia.hoje ? theme.primary : '#817b76', fontWeight: 700 }}>{dia.dow}</div>
                  <div style={{ fontSize: 19, lineHeight: 1.25, fontWeight: 700, color: dia.folga ? '#817b76' : '#2c282b' }}>{dia.dia}</div>
                  {dia.hoje && <HaloBadge live interactive={false} layout={false} style={{ marginTop: 3 }}>Hoje</HaloBadge>}
                </div>

                {dia.folga ? (
                  <>
                    <div style={{ width: 36, height: 36, borderRadius: 11, background: '#f1ece8', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
                      <Icon name="circle-check" color="#9a938e" size={18} />
                    </div>
                    <div style={{ flex: 1, minWidth: 170 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 700, color: '#5d5755' }}>Folga</div>
                      <div style={{ fontSize: 11.5, color: '#817b76', marginTop: 2 }}>
                        {dia.respondidas > 0
                          ? `Fora da sua rotina — ${dia.respondidas} ${dia.respondidas === 1 ? 'questão respondida' : 'questões respondidas'} mesmo assim.`
                          : 'Fora dos dias de estudo da sua ficha. Descansar também conta.'}
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ width: 36, height: 36, borderRadius: 11, background: `${dia.cor || theme.primary}14`, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
                      <Icon name={ICONE_POR_DISCIPLINA[dia.disciplina] || 'book-open'} color={dia.cor || theme.primary} size={18} />
                    </div>

                    <div style={{ flex: 1, minWidth: 170 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 700, color: '#2c282b' }}>{dia.disciplina || 'Livre'}</div>
                      <div style={{ fontSize: 11.5, color: '#817b76', marginTop: 2 }}>{dia.motivo || 'Nenhuma disciplina disponível ainda'}</div>
                      <div style={{ fontSize: 11, color: theme.primaryDark, marginTop: 3, display: 'flex', alignItems: 'center', gap: 4 }} data-testid="bloco-do-dia">
                        <Icon name="clock" color={theme.primary} size={11} />
                        {blocoLegivel(bloco)}
                      </div>
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

                    {/* Folga não tem botão: não há matéria sugerida para o dia.
                        Quem quiser estudar numa folga "adianta" o próximo dia
                        de estudo, no botão dele. */}
                    <button
                      type="button"
                      style={{ ...(dia.hoje ? s.btnPrimary : s.btnOutline), flex: 'none', padding: dia.hoje ? '8px 12px' : '7px 11px', fontSize: 11.5, display: 'flex', alignItems: 'center', gap: 5 }}
                      disabled={!dia.disciplina}
                      onClick={() => dia.disciplina && praticarDisciplina(dia.disciplina)}
                    >
                      <Icon name="play" color={dia.hoje ? '#fff' : '#3f393c'} size={11} />
                      {dia.hoje ? 'Estudar' : 'Adiantar'}
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        </section>

        <aside style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <section style={{ ...s.card, padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <div style={{ ...s.sectionTitle, fontSize: 14 }}><Icon name="calendar" color={theme.primary} size={17} />Calendário</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {botaoMes('anterior')}
                <span style={{ fontSize: 12, fontWeight: 650, color: '#3d373b', minWidth: 104, textAlign: 'center' }} data-testid="mes-do-calendario" aria-live="polite">{calendario.rotulo}</span>
                {botaoMes('seguinte')}
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 3, marginTop: 15, textAlign: 'center' }}>
              {SEMANA.map((dia, i) => <div key={i} style={{ fontSize: 10, color: '#9a938e', fontWeight: 700, paddingBottom: 4 }}>{dia}</div>)}
              {calendario.celulas.map((cell, i) => <CalendarDay key={cell.chave || `v${i}`} cell={cell} theme={theme} />)}
            </div>
            <div style={{ display: 'flex', gap: 12, marginTop: 14, fontSize: 10.5, color: '#817b76', flexWrap: 'wrap' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><i style={{ width: 7, height: 7, borderRadius: '50%', background: theme.primary, display: 'block' }} />Hoje</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><i style={{ width: 7, height: 7, borderRadius: '50%', background: theme.primarySoft, display: 'block' }} />Estudou</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><i style={{ width: 7, height: 7, borderRadius: '50%', border: `1px dashed ${theme.primary}`, display: 'block' }} />Planejado</span>
            </div>
            {deslocamento !== 0 && (
              <button type="button" onClick={() => setDeslocamento(0)} style={{ marginTop: 10, background: 'none', border: 'none', padding: 0, fontSize: 11, color: theme.primaryDark, cursor: 'pointer', textDecoration: 'underline' }}>
                Voltar ao mês atual
              </button>
            )}
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

          <section data-testid="card-google-agenda" style={{ ...s.card, padding: 20, border: `1px dashed ${theme.primary}45`, background: '#fffdfb' }}>
            <div style={{ display: 'flex', gap: 11, alignItems: 'flex-start' }}>
              <div style={{ width: 34, height: 34, borderRadius: 10, background: '#f1ece8', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
                <Icon name="calendar" color={theme.primary} size={17} />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#352e33' }}>Google Agenda</div>
                <p style={{ margin: '4px 0 0', fontSize: 11.5, lineHeight: 1.5, color: '#817b76' }}>
                  {calendar.connected
                    ? `Conectado. Sincronizar cria um evento por dia de estudo dos próximos 7 dias (${blocoLegivel(bloco)}) e tira os das folgas.`
                    : 'Leve os blocos da sua semana para a agenda que já usa.'}
                </p>
                {calendar.erro && <div role="alert" data-testid="google-erro" style={{ marginTop: 9, fontSize: 11, color: '#9a3f3f', lineHeight: 1.45 }}>{calendar.erro}</div>}
                {calendar.aviso && <div role="status" data-testid="google-aviso" style={{ marginTop: 9, fontSize: 11, color: '#3f6b3f', lineHeight: 1.45 }}>{calendar.aviso}</div>}
                {calendar.loading ? (
                  <span data-testid="google-verificando" style={{ display: 'inline-block', marginTop: 10, fontSize: 10.5, color: '#817b76' }}>Verificando conexão…</span>
                ) : calendar.statusFalhou ? (
                  <button type="button" data-testid="google-tentar-de-novo" style={{ ...s.btnOutline, marginTop: 10, padding: '6px 9px', fontSize: 10.5 }} onClick={() => setVerificacao((n) => n + 1)}>
                    Tentar de novo
                  </button>
                ) : calendar.connected ? (
                  calendar.confirmarDesconexao ? (
                    <div style={{ marginTop: 10 }}>
                      <div style={{ fontSize: 11, color: '#4a4544', marginBottom: 7 }}>Desconectar? O app deixa de atualizar os eventos na sua agenda.</div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button type="button" data-testid="google-confirmar-desconexao" style={{ ...s.btnPrimary, padding: '7px 10px', fontSize: 10.5 }} onClick={desconectarCalendar} disabled={calendar.desconectando}>
                          {calendar.desconectando ? 'Desconectando…' : 'Sim, desconectar'}
                        </button>
                        <button type="button" style={{ ...s.btnOutline, padding: '6px 9px', fontSize: 10.5 }} onClick={() => setCalendar((c) => ({ ...c, confirmarDesconexao: false }))} disabled={calendar.desconectando}>
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                      <button type="button" data-testid="google-sincronizar" style={{ ...s.btnPrimary, padding: '7px 10px', fontSize: 10.5 }} onClick={sincronizarCalendar} disabled={calendar.syncing}>
                        {calendar.syncing ? 'Sincronizando…' : 'Sincronizar plano'}
                      </button>
                      <button type="button" data-testid="google-desconectar" style={{ ...s.btnOutline, padding: '6px 9px', fontSize: 10.5 }} onClick={() => setCalendar((c) => ({ ...c, confirmarDesconexao: true, erro: null, aviso: null }))} disabled={calendar.syncing}>
                        Desconectar
                      </button>
                    </div>
                  )
                ) : (
                  <button type="button" data-testid="google-conectar" style={{ ...s.btnPrimary, marginTop: 10, padding: '7px 10px', fontSize: 10.5 }} onClick={conectarCalendar}>
                    Conectar Google Agenda
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
