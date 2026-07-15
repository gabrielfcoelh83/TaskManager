import { useEffect, useMemo, useState } from 'react';
import { THEMES } from './lib/theme';
import { buildStyles } from './lib/theme';
import { Icon } from './lib/icons';
import { NAV, PAGE_META, DISCIPLINAS, QUESTOES, SIMULADOS, CRONOGRAMA_DIAS, ANOTACOES, ANOTACOES_FOLDERS } from './lib/mockData';
import { loadState, saveState } from './lib/storage';

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
  configuracoes: { name: 'Maria Laís', email: 'maria.lais@email.com', meta: 20, notif: [true, true, false] },
  usuarioTentativas: {},
  resultados_historico: [],
};

function calcularDesempenho(usuarioTentativas) {
  const porTopico = {};

  Object.entries(usuarioTentativas).forEach(([qId, hist]) => {
    const questao = QUESTOES.find(q => q.id === parseInt(qId));
    if (!questao) return;

    const topico = questao.topico;
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

const DATA = { DISCIPLINAS, QUESTOES, SIMULADOS, CRONOGRAMA_DIAS, ANOTACOES, ANOTACOES_FOLDERS };

export default function App() {
  const [state, setState] = useState(() => loadState(DEFAULT_STATE));
  const [notifOpen, setNotifOpen] = useState(false);

  useEffect(() => { saveState(state); }, [state]);

  const theme = THEMES[state.theme] || THEMES.rosa;
  const s = useMemo(() => buildStyles(theme), [theme]);

  const goTo = (screen) => setState((st) => ({ ...st, screen }));
  const updateSlice = (key, partial) =>
    setState((st) => ({ ...st, [key]: typeof partial === 'function' ? partial(st[key]) : { ...st[key], ...partial } }));

  const toggleFavorito = (id) =>
    setState((st) => ({
      ...st,
      favoritos: st.favoritos.includes(id) ? st.favoritos.filter((x) => x !== id) : [...st.favoritos, id],
    }));

  const setTheme = (themeKey) => setState((st) => ({ ...st, theme: themeKey }));

  const meta = PAGE_META[state.screen];
  const notifCount = notifOpen ? 0 : 3;

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

  const screenProps = { theme, s, data: DATA, go: goTo, usuarioTentativas: state.usuarioTentativas, calcularDesempenho, resultados_historico: state.resultados_historico };

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
                <div style={{ fontSize: 16, fontWeight: 700, color: '#2c2530' }}>128 dias</div>
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
          {state.screen === 'dashboard' && (
            <Dashboard {...screenProps} dash={state.dashboard} setDash={(p) => updateSlice('dashboard', p)} />
          )}
          {state.screen === 'cronograma' && (
            <Cronograma {...screenProps} cronograma={state.cronograma} setCronograma={(p) => updateSlice('cronograma', p)} />
          )}
          {state.screen === 'questoes' && (
            <Questoes {...screenProps} quest={state.questoes} setQuest={(p) => updateSlice('questoes', p)} setUsuarioTentativas={(p) => updateSlice('usuarioTentativas', p)} />
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
            <Desempenho {...screenProps} perf={state.desempenho} setPerf={(p) => updateSlice('desempenho', p)} usuarioTentativas={state.usuarioTentativas} calcularDesempenho={calcularDesempenho} />
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
