import { useEffect, useMemo, useState } from 'react';
import { THEMES } from './lib/theme';
import { buildStyles } from './lib/theme';
import { Icon } from './lib/icons';
import { NAV, PAGE_META, DISCIPLINAS, SIMULADOS, CRONOGRAMA_DIAS, ANOTACOES, ANOTACOES_FOLDERS } from './lib/mockData';
import { loadState, saveState } from './lib/storage';
import { diasAteProva } from './lib/metrics';
import { getToken, logout, listarTentativas, listarQuestoes, registrarTentativa } from './lib/api';

import Login from './screens/Login';
import Dashboard from './screens/Dashboard';
import Cronograma from './screens/Cronograma';
import Questoes from './screens/Questoes';
import Simulados from './screens/Simulados';
import Revisoes from './screens/Revisoes';
import Desempenho from './screens/Desempenho';
import Estatisticas from './screens/Estatisticas';
import Disciplinas from './screens/Disciplinas';
import Anotacoes from './screens/Anotacoes';
import Favoritos from './screens/Favoritos';
import Configuracoes from './screens/Configuracoes';

const DEFAULT_STATE = {
  theme: 'rosa',
  screen: 'dashboard',
  dashboard: { period: '7' },
  cronograma: { tab: 'semanal', progress: null },
  questoes: { selected: null, quiz: null, idx: 0, selectedAlt: null, certas: 0, erradas: 0, done: false },
  simulados: { running: {}, resultados_historico: [] },
  revisoes: { tab: 'todas' },
  desempenho: { period: '7' },
  estatisticas: { range: '30d', disc: 'Todas' },
  disciplinas: { openNome: null },
  anotacoes: { folder: 'Todas', activeId: null, edits: {}, extra: [] },
  favoritos: [],
  configuracoes: { name: 'Maria Laís', email: 'maria.lais@email.com', meta: 20, dataProva: '2027-02-28', notif: [true, true, false] },
  usuarioTentativas: {},
  resultados_historico: [],
};

function calcularDesempenho(usuarioTentativas, questoes) {
  const porTopico = {};

  Object.entries(usuarioTentativas).forEach(([qId, hist]) => {
    // Comparação por texto: a chave vem do banco como string, e o id gerado
    // por IA ("q-1786...-a3f9x") não é numérico. Um parseInt aqui devolveria
    // NaN e a questão sumiria da conta sem erro nenhum.
    const questao = questoes.find(q => String(q.id) === String(qId));
    if (!questao) return;

    // Sem classificação por matéria, `topico` vem nulo do acervo. Agrupar
    // tudo sob "undefined" produziria uma linha de desempenho sem nome; é
    // melhor deixar a questão de fora da conta por tópico até ela ter um.
    const topico = questao.topico;
    if (!topico) return;
    if (!porTopico[topico]) {
      porTopico[topico] = { acertos: 0, total: 0 };
    }

    const tentativas = hist.tentativas || [];
    porTopico[topico].total += tentativas.length;
    porTopico[topico].acertos += tentativas.filter(t => t.correta === true).length;
  });

  return Object.entries(porTopico).map(([topico, stats]) => ({
    topico,
    pct: stats.total > 0 ? Math.round((stats.acertos / stats.total) * 100) : 0,
    status: stats.total === 0 ? 'novo' : (stats.acertos / stats.total) > 0.8 ? 'domina' :
            (stats.acertos / stats.total) > 0.4 ? 'em-desenvolvimento' : 'necessita'
  }));
}

export default function App() {
  const [state, setState] = useState(() => loadState(DEFAULT_STATE));
  const [notifOpen, setNotifOpen] = useState(false);
  const [sessao, setSessao] = useState(() => (getToken() ? 'ativa' : 'ausente'));
  const [erroSync, setErroSync] = useState(null);

  // O acervo é do servidor, não do bundle. Guardar o estado do carregamento
  // junto com as questões — e não só a lista — é o que permite a tela
  // distinguir "ainda estou buscando" de "busquei e não veio nada", que para
  // quem estuda são situações completamente diferentes.
  const [acervo, setAcervo] = useState({ estado: 'carregando', questoes: [], erro: null });
  const [recarga, setRecarga] = useState(0);

  useEffect(() => {
    // `usuarioTentativas` fica de fora do localStorage: a fonte de verdade
    // passou a ser o servidor. Uma cópia local viraria uma segunda fonte,
    // que diverge em silêncio no primeiro POST que falhar.
    const local = { ...state };
    delete local.usuarioTentativas;
    saveState(local);
  }, [state]);

  useEffect(() => {
    if (sessao !== 'ativa') return undefined;

    // Sem isto o histórico só existiria enquanto a aba estivesse aberta —
    // é esta carga que faz a tentativa sobreviver ao localStorage limpo.
    let cancelado = false;

    listarTentativas()
      .then((tentativas) => {
        if (!cancelado) setState((st) => ({ ...st, usuarioTentativas: tentativas }));
      })
      .catch((err) => {
        if (cancelado) return;
        if (err.status === 401) { setSessao('ausente'); return; }
        setErroSync(`Não foi possível carregar seu histórico: ${err.message}`);
      });

    return () => { cancelado = true; };
  }, [sessao]);

  useEffect(() => {
    if (sessao !== 'ativa') return undefined;

    let cancelado = false;
    setAcervo((a) => ({ ...a, estado: 'carregando', erro: null }));

    listarQuestoes()
      .then((questoes) => {
        if (!cancelado) setAcervo({ estado: 'pronto', questoes, erro: null });
      })
      .catch((err) => {
        if (cancelado) return;
        if (err.status === 401) { setSessao('ausente'); return; }
        // Erro do acervo não vira o aviso de sincronização do topo: aquele
        // fala de resposta que não foi salva. Este impede o estudo inteiro,
        // e quem mostra é a própria tela de questões, com botão de tentar de
        // novo — que é a única coisa útil a fazer aqui.
        setAcervo({ estado: 'erro', questoes: [], erro: err.message });
      });

    return () => { cancelado = true; };
  }, [sessao, recarga]);

  const theme = THEMES[state.theme] || THEMES.rosa;
  const s = useMemo(() => buildStyles(theme), [theme]);

  const DATA = useMemo(
    () => ({ DISCIPLINAS, QUESTOES: acervo.questoes, SIMULADOS, CRONOGRAMA_DIAS, ANOTACOES, ANOTACOES_FOLDERS }),
    [acervo.questoes]
  );

  const goTo = (screen) => setState((st) => ({ ...st, screen }));
  const updateSlice = (key, partial) =>
    setState((st) => ({ ...st, [key]: typeof partial === 'function' ? partial(st[key]) : { ...st[key], ...partial } }));

  const toggleFavorito = (id) =>
    setState((st) => ({
      ...st,
      favoritos: st.favoritos.includes(id) ? st.favoritos.filter((x) => x !== id) : [...st.favoritos, id],
    }));

  const setTheme = (themeKey) => setState((st) => ({ ...st, theme: themeKey }));

  // Grava no servidor primeiro e só depois no estado: o que aparece na tela
  // como respondido é o que a API confirmou ter gravado.
  const registrar = async ({ questaoId, correta, alternativa, tempoSeg }) => {
    setErroSync(null);
    try {
      const tentativa = await registrarTentativa({ questaoId, correta, alternativa, tempoSeg });
      setState((st) => {
        const registro = st.usuarioTentativas[questaoId] || { tentativas: [], desempenho: 'necessita' };
        return {
          ...st,
          usuarioTentativas: {
            ...st.usuarioTentativas,
            [questaoId]: { ...registro, tentativas: [...registro.tentativas, tentativa] },
          },
        };
      });
      return true;
    } catch (err) {
      if (err.status === 401) { setSessao('ausente'); return false; }
      // O quiz continua andando; o que se perdeu foi o registro. Dizer isso
      // é melhor que deixar a pessoa achar que estudou e nada ficou gravado.
      setErroSync(`Esta resposta não foi salva: ${err.message}`);
      return false;
    }
  };

  // `tipo` e `certeza` não têm coluna na tabela: valem só para esta sessão.
  const anotarFeedback = (questaoId, tipo, certeza) =>
    setState((st) => {
      const registro = st.usuarioTentativas[questaoId];
      if (!registro || registro.tentativas.length === 0) return st;

      const tentativas = registro.tentativas.slice();
      tentativas[tentativas.length - 1] = { ...tentativas[tentativas.length - 1], tipo, certeza };

      return {
        ...st,
        usuarioTentativas: { ...st.usuarioTentativas, [questaoId]: { ...registro, tentativas } },
      };
    });

  const sair = () => {
    logout();
    // O histórico sai da memória junto com a sessão: ele pertence a quem
    // estava logado, não à aba.
    setState((st) => ({ ...st, usuarioTentativas: {} }));
    setErroSync(null);
    setSessao('ausente');
  };

  if (sessao !== 'ativa') {
    return <Login theme={theme} s={s} onEntrar={() => setSessao('ativa')} />;
  }

  const meta = PAGE_META[state.screen];
  const notifCount = notifOpen ? 0 : 3;
  const diasProva = diasAteProva(state.configuracoes);

  const navItems = NAV.map((n) => {
    const active = n.key === state.screen;
    return {
      key: n.key,
      label: n.label,
      icon: n.icon,
      active,
      style: {
        display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 10,
        fontSize: 13.5, fontWeight: active ? 600 : 500,
        color: active ? theme.primaryDark : '#5c5462',
        background: active ? theme.primarySoft : 'transparent',
      },
    };
  });

  // As telas chamam `calcularDesempenho(tentativas)` sem saber de onde vêm as
  // questões; amarrar o acervo aqui evita passar a lista por sete telas.
  const calcular = (tentativas) => calcularDesempenho(tentativas, acervo.questoes);

  const screenProps = { theme, s, data: DATA, go: goTo, usuarioTentativas: state.usuarioTentativas, calcularDesempenho: calcular, resultados_historico: state.resultados_historico };

  return (
    <div style={s.app}>
      <div style={s.sidebar}>
        <div style={s.logoRow}>
          <div style={s.logoMark}><Icon name="scale" color="#ffffff" size={17} /></div>
          <div>
            <div style={s.logoText}>ma.</div>
            <div style={s.logoSub}>questões</div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 8 }}>
          {navItems.map((item) => (
            <div key={item.key} data-testid={`nav-${item.key}`} onClick={() => goTo(item.key)} style={item.style}>
              <div style={{ width: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
                <Icon name={item.icon} color={item.active ? theme.primaryDark : '#9a93a1'} size={20} />
              </div>
              <span>{item.label}</span>
            </div>
          ))}
        </div>

        <div style={s.focusCard}>
          <div style={{ fontSize: 13, fontWeight: 700, color: theme.primaryDark, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon name="target" color={theme.primaryDark} size={15} />Foco de hoje
          </div>
          <div style={{ fontSize: 12.5, color: '#6b6470', marginTop: 6, lineHeight: 1.45 }}>
            Manter a consistência é o segredo do sucesso!
          </div>
        </div>

        <div style={s.profileRow}>
          <div style={s.avatar}>ML</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: '#2c2530' }}>Maria Laís</div>
            <div style={{ fontSize: 11.5, color: '#8b8391' }}>Ver perfil ›</div>
          </div>
          <div data-testid="sair" onClick={sair} style={{ fontSize: 11.5, color: theme.primary, fontWeight: 600 }}>
            Sair
          </div>
        </div>
      </div>

      <div style={s.main}>
        <div style={s.topbar}>
          <div>
            <div style={s.pageTitle}>{meta.title}</div>
            <div style={s.pageSub}>{meta.sub}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={s.examCard}>
              <Icon name="graduation-cap" color={theme.primary} size={20} />
              <div>
                <div style={{ fontSize: 11, color: theme.primary, fontWeight: 600 }}>Faltam</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#2c2530' }}>{diasProva != null ? `${diasProva} dias` : '—'}</div>
                <div style={{ fontSize: 10.5, color: '#8b8391' }}>para a prova da OAB</div>
              </div>
            </div>
            <div style={s.bellWrap} onClick={() => setNotifOpen(true)}>
              <Icon name="bell" color="#5c5462" size={19} />
              {notifCount > 0 && <div style={s.bellBadge}>{notifCount}</div>}
            </div>
          </div>
        </div>

        <div style={s.content}>
          {erroSync && (
            <div
              role="alert"
              data-testid="erro-sync"
              style={{
                background: '#FEF2F2', color: '#B91C1C', border: '1px solid #FECACA',
                borderRadius: 12, padding: '10px 14px', fontSize: 12.5, marginBottom: 14,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
              }}
            >
              <span>{erroSync}</span>
              <span onClick={() => setErroSync(null)} style={{ fontWeight: 700 }}>×</span>
            </div>
          )}
          {state.screen === 'dashboard' && (
            <Dashboard {...screenProps} dash={state.dashboard} setDash={(p) => updateSlice('dashboard', p)} config={state.configuracoes} />
          )}
          {state.screen === 'cronograma' && (
            <Cronograma {...screenProps} cronograma={state.cronograma} setCronograma={(p) => updateSlice('cronograma', p)} />
          )}
          {state.screen === 'questoes' && (
            <Questoes
              {...screenProps}
              quest={state.questoes}
              setQuest={(p) => updateSlice('questoes', p)}
              registrar={registrar}
              anotarFeedback={anotarFeedback}
              acervo={acervo}
              recarregarAcervo={() => setRecarga((n) => n + 1)}
            />
          )}
          {state.screen === 'simulados' && (
            <Simulados {...screenProps} sim={state.simulados} setSim={(p) => updateSlice('simulados', p)} setResultadosHistorico={(p) => updateSlice('resultados_historico', p)} />
          )}
          {state.screen === 'revisoes' && (
            <Revisoes
              {...screenProps}
              rev={state.revisoes}
              setRev={(p) => updateSlice('revisoes', p)}
              favoritos={state.favoritos}
              toggleFavorito={toggleFavorito}
            />
          )}
          {state.screen === 'desempenho' && (
            <Desempenho {...screenProps} perf={state.desempenho} setPerf={(p) => updateSlice('desempenho', p)} usuarioTentativas={state.usuarioTentativas} calcularDesempenho={calcular} />
          )}
          {state.screen === 'estatisticas' && (
            <Estatisticas {...screenProps} filtros={state.estatisticas} setFiltros={(p) => updateSlice('estatisticas', p)} />
          )}
          {state.screen === 'disciplinas' && (
            <Disciplinas
              {...screenProps}
              disc={state.disciplinas}
              setDisc={(p) => updateSlice('disciplinas', p)}
              iniciarSimuladoDe={(nome) => {
                updateSlice('simulados', { preDisciplina: nome });
                goTo('simulados');
              }}
            />
          )}
          {state.screen === 'anotacoes' && (
            <Anotacoes {...screenProps} notas={state.anotacoes} setNotas={(p) => updateSlice('anotacoes', p)} />
          )}
          {state.screen === 'favoritos' && <Favoritos {...screenProps} favoritos={state.favoritos} />}
          {state.screen === 'configuracoes' && (
            <Configuracoes
              {...screenProps}
              config={state.configuracoes}
              setConfig={(p) => updateSlice('configuracoes', p)}
              themeKey={state.theme}
              setTheme={setTheme}
            />
          )}
        </div>
      </div>
    </div>
  );
}
