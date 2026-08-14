import { useEffect, useMemo, useRef, useState } from 'react';
import { THEMES, buildStyles } from './lib/theme';
import { Icon } from './lib/icons';
import { NAV, PAGE_META } from './lib/navegacao';
import { loadState, saveState, limparEstado } from './lib/storage';
import { diasAteProva, metaDiaria, sequenciaAtual } from './lib/metrics';
import { montarDisciplinas } from './lib/disciplinas';
import { planoDaSemana } from './lib/agenda';
import { embaralhar } from './lib/questions/acervo';
import { classificarRevisao } from './lib/revisao';
import { payloadDoToken, saudacao, iniciais, nomeDeExibicao } from './lib/perfil';
import {
  getToken, logout, listarTentativas, listarQuestoes, registrarTentativa,
  anotarFeedbackTentativa, buscarPerfil, salvarPerfil,
} from './lib/api/api';

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

// O que é da INTERFACE começa aqui. O que é da PESSOA — nome, e-mail, meta,
// data da prova — vem do servidor: até esta versão, `configuracoes` trazia
// "Maria Laís / maria.lais@email.com" escrito no código, e todo mundo que
// entrava no app virava Maria Laís.
//
// `__usuario` guarda de quem é o estado salvo neste navegador. Sem ele, sair
// de uma conta e entrar em outra no mesmo computador herdava favoritos,
// anotações e histórico de simulado da pessoa anterior.
const DEFAULT_STATE = {
  __usuario: null,
  theme: 'rosa',
  screen: 'dashboard',
  dashboard: { period: '7' },
  cronograma: {},
  questoes: { selected: null, quiz: null, idx: 0, selectedAlt: null, certas: 0, erradas: 0, done: false },
  simulados: { running: {}, resultados_historico: [] },
  revisoes: { tab: 'todas' },
  desempenho: { period: '6' },
  estatisticas: { range: '30d', disc: 'Todas' },
  disciplinas: { openNome: null },
  anotacoes: { folder: 'Todas', activeId: null, itens: [] },
  favoritos: [],
  configuracoes: { meta: 20, dataProva: null },
  resultados_historico: [],
};

export default function App() {
  const [state, setState] = useState(() => loadState(DEFAULT_STATE));
  const [notifOpen, setNotifOpen] = useState(false);
  const [sessao, setSessao] = useState(() => (getToken() ? 'ativa' : 'ausente'));
  const [erroSync, setErroSync] = useState(null);
  const [usuarioTentativas, setUsuarioTentativas] = useState({});
  const [perfil, setPerfil] = useState({ estado: 'carregando', id: null, name: null, email: null });

  // O acervo é do servidor, não do bundle. Guardar o estado do carregamento
  // junto com as questões — e não só a lista — é o que permite a tela
  // distinguir "ainda estou buscando" de "busquei e não veio nada", que para
  // quem estuda são situações completamente diferentes.
  const [acervo, setAcervo] = useState({ estado: 'carregando', questoes: [], erro: null });
  const [recarga, setRecarga] = useState(0);

  useEffect(() => {
    saveState(state);
  }, [state]);

  // ---- Perfil: quem está usando o app ----
  useEffect(() => {
    if (sessao !== 'ativa') return undefined;

    const payload = payloadDoToken(getToken());
    if (!payload) { setSessao('ausente'); return undefined; }

    let cancelado = false;

    buscarPerfil(payload.id)
      .then((p) => {
        if (cancelado) return;
        setPerfil({ estado: 'pronto', id: p.id, name: p.name, email: p.email || payload.email });

        setState((st) => {
          // Estado de outra conta neste navegador: recomeça do zero em vez de
          // mostrar os favoritos e as anotações de outra pessoa.
          const base = String(st.__usuario) === String(p.id) ? st : { ...DEFAULT_STATE, theme: st.theme };
          const prefs = p.preferencias || {};

          return {
            ...base,
            __usuario: p.id,
            configuracoes: {
              ...base.configuracoes,
              // O servidor manda em meta e data da prova: são as preferências
              // que precisam seguir a pessoa de um aparelho para o outro.
              ...(prefs.meta != null ? { meta: prefs.meta } : {}),
              ...(prefs.dataProva !== undefined ? { dataProva: prefs.dataProva } : {}),
            },
          };
        });
      })
      .catch((err) => {
        if (cancelado) return;
        if (err.status === 401) { setSessao('ausente'); return; }
        // Perfil é o nome no canto da tela: sem ele o app funciona inteiro.
        // Cair aqui não pode virar tela de erro — vira nome vazio.
        setPerfil({ estado: 'erro', id: payload.id, name: null, email: payload.email });
      });

    return () => { cancelado = true; };
  }, [sessao]);

  // ---- Histórico de tentativas ----
  useEffect(() => {
    if (sessao !== 'ativa') return undefined;

    // Sem isto o histórico só existiria enquanto a aba estivesse aberta —
    // é esta carga que faz a tentativa sobreviver ao localStorage limpo.
    let cancelado = false;

    listarTentativas()
      .then((tentativas) => { if (!cancelado) setUsuarioTentativas(tentativas); })
      .catch((err) => {
        if (cancelado) return;
        if (err.status === 401) { setSessao('ausente'); return; }
        setErroSync(`Não foi possível carregar seu histórico: ${err.message}`);
      });

    return () => { cancelado = true; };
  }, [sessao]);

  // ---- Acervo ----
  useEffect(() => {
    if (sessao !== 'ativa') return undefined;

    let cancelado = false;
    setAcervo((a) => ({ ...a, estado: 'carregando', erro: null }));

    listarQuestoes()
      .then((questoes) => { if (!cancelado) setAcervo({ estado: 'pronto', questoes, erro: null }); })
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

  // A lista de disciplinas é derivada do acervo carregado e do histórico. Era
  // uma constante de oito nomes com percentuais fixos; o acervo tem 18.
  const disciplinas = useMemo(
    () => montarDisciplinas(acervo.questoes, usuarioTentativas),
    [acervo.questoes, usuarioTentativas]
  );

  const revisao = useMemo(
    () => classificarRevisao(acervo.questoes, usuarioTentativas, state.favoritos),
    [acervo.questoes, usuarioTentativas, state.favoritos]
  );

  const DATA = useMemo(
    () => ({ QUESTOES: acervo.questoes, DISCIPLINAS: disciplinas }),
    [acervo.questoes, disciplinas]
  );

  const goTo = (screen) => setState((st) => ({ ...st, screen }));
  const updateSlice = (key, partial) =>
    setState((st) => ({ ...st, [key]: typeof partial === 'function' ? partial(st[key]) : { ...st[key], ...partial } }));

  const toggleFavorito = (id) =>
    setState((st) => ({
      ...st,
      favoritos: st.favoritos.map(String).includes(String(id))
        ? st.favoritos.filter((x) => String(x) !== String(id))
        : [...st.favoritos, id],
    }));

  const setTheme = (themeKey) => setState((st) => ({ ...st, theme: themeKey }));

  // A gravação em curso de cada questão, guardada pela promessa e não pelo
  // resultado. A tela de feedback abre no mesmo instante em que o POST sai
  // (`Questoes.jsx` não espera, de propósito, para o quiz não travar em rede
  // ruim), então quando a pessoa clica "Foi chute" o `id` da tentativa pode
  // ainda não ter voltado. Segurar a promessa deixa o feedback esperar por
  // ela em vez de ler um estado que talvez não esteja preenchido. Ver ADR-001.
  const registroPendente = useRef(new Map());

  // Contador de sessão. Toda escrita de estado que acontece *depois* de um
  // await compara este número com o que valia quando a operação começou —
  // é o mesmo cuidado do `let cancelado` no efeito de carga, e existe porque
  // sair do app não cancela um POST que já saiu. Sem isto, a resposta que
  // chega depois do logout reinsere a tentativa num app deslogado, e ela
  // fica esperando a próxima pessoa que entrar neste navegador.
  const sessaoEpoch = useRef(0);

  // As gravações de preferência entram numa fila de um só: quem edita a meta e
  // logo em seguida a data da prova dispara dois PUT, e sem a fila eles correm
  // soltos — se o primeiro chegar ao servidor depois do segundo, o valor mais
  // novo é sobrescrito pelo mais velho e a tela mostra uma coisa que o banco
  // não tem. Foi assim que o teste de e2e ficou intermitente.
  const gravacaoDePreferencias = useRef(Promise.resolve());

  // Meta e data da prova vão para o servidor (coluna profile_data); o estado
  // local muda na hora para a tela não ficar esperando a rede.
  const atualizarConfig = (partial) => {
    const configuracoes = { ...state.configuracoes, ...partial };

    // O `setState` fica com a função pura. Disparar a rede de dentro dele
    // seria efeito colateral num updater — o React pode reexecutá-lo (e em
    // StrictMode reexecuta sempre), o que dobrava cada gravação.
    setState((st) => ({ ...st, configuracoes: { ...st.configuracoes, ...partial } }));

    if (perfil.id == null) return;

    gravacaoDePreferencias.current = gravacaoDePreferencias.current
      .then(() => salvarPerfil(perfil.id, { preferencias: { meta: configuracoes.meta, dataProva: configuracoes.dataProva } }))
      .catch((err) => setErroSync(`Preferência não salva no servidor: ${err.message}`));
  };

  const atualizarNome = async (nome) => {
    if (perfil.id == null) return false;
    try {
      const p = await salvarPerfil(perfil.id, { nome });
      setPerfil((atual) => ({ ...atual, name: p.name }));
      return true;
    } catch (err) {
      setErroSync(`Nome não salvo: ${err.message}`);
      return false;
    }
  };

  // Grava no servidor primeiro e só depois no estado: o que aparece na tela
  // como respondido é o que a API confirmou ter gravado.
  const registrar = ({ questaoId, correta, alternativa, tempoSeg }) => {
    setErroSync(null);
    const epoch = sessaoEpoch.current;

    const pendente = (async () => {
      try {
        const tentativa = await registrarTentativa({ questaoId, correta, alternativa, tempoSeg });

        // Saiu enquanto o POST estava no ar: a tentativa foi gravada e
        // pertence a quem a respondeu, mas não pode voltar para a tela de
        // quem entrar depois. Devolvemos o valor para quem esperava a
        // promessa; só o estado da interface fica de fora.
        if (sessaoEpoch.current !== epoch) return tentativa;

        // O histórico saiu de `state` e virou estado próprio: ele é do
        // servidor e não do localStorage, e misturá-lo com a interface fazia
        // toda resposta gravada reescrever a fatia inteira de preferências.
        setUsuarioTentativas((atual) => {
          const registro = atual[questaoId] || { tentativas: [], desempenho: 'necessita' };
          return { ...atual, [questaoId]: { ...registro, tentativas: [...registro.tentativas, tentativa] } };
        });
        return tentativa;
      } catch (err) {
        if (err.status === 401) { setSessao('ausente'); return null; }
        // O quiz continua andando; o que se perdeu foi o registro. Dizer isso
        // é melhor que deixar a pessoa achar que estudou e nada ficou gravado.
        setErroSync(`Esta resposta não foi salva: ${err.message}`);
        return null;
      }
    })();

    registroPendente.current.set(questaoId, pendente);
    return pendente;
  };

  // "Como você chegou nessa resposta?" — chute, intuição, eliminação. É o que
  // separa acertar sabendo de acertar por sorte, e desde a migration 002 tem
  // coluna própria em vez de morrer junto com a sessão.
  const anotarFeedback = async (questaoId, tipo, certeza) => {
    const epoch = sessaoEpoch.current;

    // Espera a gravação que a alternativa disparou: sem o `id` não há o que
    // atualizar no servidor.
    const tentativa = await registroPendente.current.get(questaoId);
    registroPendente.current.delete(questaoId);

    // Mesmo motivo do `registrar`: este await pode ter atravessado um logout.
    if (sessaoEpoch.current !== epoch) return;

    // Atualização otimista. O quiz já avançou para a próxima questão quando
    // esta linha roda — devolver a tela ao estado anterior por causa de um
    // PATCH que falhou seria mais confuso que o erro.
    const aplicarLocal = (patch) =>
      setUsuarioTentativas((atual) => {
        const registro = atual[questaoId];
        if (!registro || registro.tentativas.length === 0) return atual;

        const tentativas = registro.tentativas.slice();
        // Por id quando ele existe: numa questão respondida mais de uma vez,
        // "a última do array" e "a que acabou de ser gravada" só coincidem
        // enquanto nada chega fora de ordem.
        const alvo = tentativa?.id
          ? tentativas.findIndex((t) => t.id === tentativa.id)
          : tentativas.length - 1;
        if (alvo < 0) return atual;

        tentativas[alvo] = { ...tentativas[alvo], ...patch };
        return { ...atual, [questaoId]: { ...registro, tentativas } };
      });

    aplicarLocal({ tipo, certeza });

    // Sem id, a tentativa não chegou a ser gravada — o erro disso já foi dito
    // ao registrar, e repetir aqui seria a segunda mensagem sobre a mesma falha.
    if (!tentativa?.id) return;

    try {
      await anotarFeedbackTentativa(tentativa.id, tipo, certeza);
    } catch (err) {
      if (err.status === 401) { setSessao('ausente'); return; }
      setErroSync(`A resposta foi salva, mas o "como você chegou" não: ${err.message}`);
    }
  };

  // "Revisar agora" e "Iniciar estudo" existiam como botões que não faziam
  // nada. Agora montam um quiz de verdade com as questões pedidas.
  const revisarQuestoes = (questoes) => {
    const lista = (questoes || []).filter(Boolean);
    if (lista.length === 0) return;

    setState((st) => ({
      ...st,
      screen: 'questoes',
      questoes: { ...st.questoes, quiz: lista, idx: 0, selectedAlt: null, certas: 0, erradas: 0, done: false },
    }));
  };

  // `iniciar` distingue os dois jeitos de chegar ao quiz de uma matéria.
  //
  // Sem ele — como Disciplinas, Simulados e Cronograma chamam — a tela abre
  // com a fonte marcada e o usuário decide quantas responder. Com ele, o quiz
  // já vem montado: é o caminho do "Foco de hoje", onde a pergunta "qual
  // matéria, quantas questões" já foi respondida pelo plano e repeti-la ao
  // usuário é só uma tela a mais entre ele e a primeira questão.
  const praticarDisciplina = (nome, { iniciar = false } = {}) => {
    const daMateria = acervo.questoes.filter((q) => (q.disciplina || 'Sem classificação') === nome);
    if (daMateria.length === 0) { goTo('questoes'); return; }

    if (!iniciar) {
      setState((st) => ({ ...st, screen: 'questoes', questoes: { ...st.questoes, selected: [nome], quiz: null, done: false } }));
      return;
    }

    // Quantas abrir: o que falta para a meta. Abrir as 80 da matéria quando
    // faltam 12 transforma um objetivo alcançável numa lista sem fim — e a
    // barra de progresso do quiz passaria a medir outra coisa que não a meta.
    // Com a meta já batida, quem clicou quer continuar: abre o que houver.
    const quantas = meta.batida ? daMateria.length : Math.max(1, meta.faltam);
    const lista = embaralhar(daMateria).slice(0, quantas);

    setState((st) => ({
      ...st,
      screen: 'questoes',
      questoes: { ...st.questoes, selected: [nome], quiz: lista, idx: 0, selectedAlt: null, certas: 0, erradas: 0, done: false },
    }));
  };

  const sair = () => {
    logout();
    // O histórico sai da memória junto com a sessão: ele pertence a quem
    // estava logado, não à aba. As gravações em curso vão junto — um PATCH
    // resolvido depois do logout escreveria com um token que já não vale.
    registroPendente.current.clear();
    // E o que já estava no ar não pode voltar para a tela depois daqui.
    sessaoEpoch.current += 1;
    setUsuarioTentativas({});
    // O que era desta conta sai junto — inclusive o que estava guardado neste
    // navegador: favoritos e anotações são de quem estava logado, e quem
    // entrar depois não pode encontrá-los na tela.
    limparEstado();
    setState({ ...DEFAULT_STATE, theme: state.theme });
    setPerfil({ estado: 'carregando', id: null, name: null, email: null });
    setErroSync(null);
    setSessao('ausente');
  };

  if (sessao !== 'ativa') {
    return <Login theme={theme} s={s} onEntrar={() => setSessao('ativa')} />;
  }

  const nome = nomeDeExibicao(perfil, perfil.email);
  const meta = metaDiaria(state.configuracoes, usuarioTentativas, state.resultados_historico);
  const sequencia = sequenciaAtual(usuarioTentativas, state.resultados_historico);
  const diasProva = diasAteProva(state.configuracoes);

  const cabecalho = state.screen === 'dashboard'
    ? { title: saudacao(nome), sub: PAGE_META.dashboard.sub }
    : PAGE_META[state.screen];

  // O sino mostrava um "3" fixo e abria coisa nenhuma. Estes avisos saem do
  // estado real e cada um leva para a tela onde dá para resolver o assunto.
  const notificacoes = [];
  if (!meta.batida) {
    notificacoes.push({
      icone: 'flag', cor: '#F59E0B',
      titulo: `Faltam ${meta.faltam} ${meta.faltam === 1 ? 'questão' : 'questões'} para a meta de hoje`,
      texto: `Você respondeu ${meta.respondidas} de ${meta.meta}.`,
      acao: { rotulo: 'Praticar', ir: 'questoes' },
    });
  }
  if (revisao.resumo.erros > 0) {
    notificacoes.push({
      icone: 'repeat', cor: '#EF4444',
      titulo: `${revisao.resumo.erros} ${revisao.resumo.erros === 1 ? 'questão errada' : 'questões erradas'} esperando revisão`,
      texto: 'São as que você errou na última tentativa.',
      acao: { rotulo: 'Revisar', ir: 'revisoes' },
    });
  }
  if (!state.configuracoes.dataProva) {
    notificacoes.push({
      icone: 'calendar', cor: '#8B5CF6',
      titulo: 'Defina a data da sua prova',
      texto: 'A contagem regressiva do topo depende dela.',
      acao: { rotulo: 'Definir', ir: 'configuracoes' },
    });
  } else if (diasProva != null && diasProva <= 30) {
    notificacoes.push({
      icone: 'graduation-cap', cor: '#EC4899',
      titulo: diasProva === 0 ? 'Sua prova é hoje' : `Faltam ${diasProva} dias para a prova`,
      texto: 'Reta final: priorize revisão do que você erra mais.',
      acao: { rotulo: 'Ver revisões', ir: 'revisoes' },
    });
  }
  if (sequencia.dias >= 2) {
    notificacoes.push({
      icone: 'trending-up', cor: '#10B981',
      titulo: `${sequencia.dias} dias seguidos de estudo`,
      texto: 'Responda hoje para não perder a sequência.',
    });
  }

  // A matéria de hoje sai do MESMO plano que o Cronograma desenha. Calcular
  // aqui por outro caminho — "a primeira da lista de prioridade", que era o
  // que este bloco fazia — dá certo hoje e diverge no dia em que o plano
  // mudar de regra, com a sidebar mandando estudar uma matéria e o cronograma
  // outra.
  // Sem useMemo de propósito: este trecho roda depois do early return do
  // Login, e hook após return condicional quebra a ordem entre renders — o
  // ESLint barrou a primeira versão. `planoDaSemana` percorre sete dias sobre
  // listas já derivadas, então o custo não justifica mover tudo para cima.
  const materiaDeHoje = planoDaSemana({
    disciplinas,
    tentativas: usuarioTentativas,
    meta: state.configuracoes.meta,
  }).find((d) => d.hoje) || null;

  // O foco dizia "faltam 12 questões" sem dizer de quê, e não levava a lugar
  // nenhum: para começar era preciso adivinhar a matéria, abrir Questões e
  // filtrar na mão. Agora ele nomeia a matéria em todos os estados e o cartão
  // inteiro abre o quiz já filtrado nela.
  const foco = meta.batida
    ? `Meta batida: ${meta.respondidas} ${meta.respondidas === 1 ? 'questão' : 'questões'} hoje. O que vier agora é lucro.`
    : materiaDeHoje?.disciplina
      ? meta.respondidas === 0
        ? `Comece por ${materiaDeHoje.disciplina} — ${materiaDeHoje.motivo || 'é onde você mais perde ponto'}.`
        : `Faltam ${meta.faltam} em ${materiaDeHoje.disciplina} para bater a meta.`
      : `Faltam ${meta.faltam} ${meta.faltam === 1 ? 'questão' : 'questões'} para bater a meta de hoje.`;

  const navItems = NAV.map((n) => {
    const active = n.key === state.screen;
    return {
      key: n.key,
      label: n.label,
      icon: n.icon,
      active,
      style: {
        display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 10,
        fontSize: 13.5, fontWeight: active ? 600 : 500, cursor: 'pointer',
        color: active ? theme.primaryDark : '#5c5462',
        background: active ? theme.primarySoft : 'transparent',
      },
    };
  });

  const screenProps = {
    theme, s, data: DATA, go: goTo,
    usuarioTentativas, disciplinas, revisao,
    resultados_historico: state.resultados_historico,
    config: state.configuracoes,
    revisarQuestoes, praticarDisciplina,
  };

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

        {/* Botão, e não div, quando há matéria: o cartão é o caminho mais
            curto entre "abri o app" e "estou respondendo questão da matéria
            certa". Sem matéria definida — acervo ainda sem classificação — ele
            continua sendo só o aviso que sempre foi, porque um botão que não
            leva a lugar nenhum é pior que texto. */}
        {materiaDeHoje?.disciplina ? (
          <button
            type="button"
            data-testid="foco-do-dia"
            onClick={() => praticarDisciplina(materiaDeHoje.disciplina, { iniciar: true })}
            style={{ ...s.focusCard, width: '100%', textAlign: 'left', border: 'none', cursor: 'pointer', font: 'inherit', display: 'block' }}
          >
            <div style={{ fontSize: 13, fontWeight: 700, color: theme.primaryDark, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Icon name="target" color={theme.primaryDark} size={15} />Foco de hoje
            </div>
            <div style={{ fontSize: 12.5, color: '#6b6470', marginTop: 6, lineHeight: 1.45 }}>{foco}</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: theme.primaryDark, marginTop: 8, display: 'flex', alignItems: 'center', gap: 5 }}>
              <Icon name="play" color={theme.primaryDark} size={12} />
              {meta.batida ? 'Continuar em ' : 'Estudar '}{materiaDeHoje.disciplina}
            </div>
          </button>
        ) : (
          <div style={s.focusCard}>
            <div style={{ fontSize: 13, fontWeight: 700, color: theme.primaryDark, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Icon name="target" color={theme.primaryDark} size={15} />Foco de hoje
            </div>
            <div style={{ fontSize: 12.5, color: '#6b6470', marginTop: 6, lineHeight: 1.45 }}>{foco}</div>
          </div>
        )}

        <div style={s.profileRow}>
          <div style={s.avatar} data-testid="avatar">{iniciais(nome, '·')}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div data-testid="perfil-nome" style={{ fontSize: 13.5, fontWeight: 600, color: '#2c2530', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {nome || (perfil.estado === 'carregando' ? '—' : 'Sem nome')}
            </div>
            <div onClick={() => goTo('configuracoes')} style={{ fontSize: 11.5, color: '#8b8391', cursor: 'pointer' }}>Ver perfil ›</div>
          </div>
          <div data-testid="sair" onClick={sair} style={{ fontSize: 11.5, color: theme.primary, fontWeight: 600, cursor: 'pointer' }}>
            Sair
          </div>
        </div>
      </div>

      <div style={s.main}>
        <div style={s.topbar}>
          <div>
            <div style={s.pageTitle}>{cabecalho.title}</div>
            <div style={s.pageSub}>{cabecalho.sub}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div
              style={{ ...s.examCard, cursor: diasProva == null ? 'pointer' : 'default' }}
              onClick={() => { if (diasProva == null) goTo('configuracoes'); }}
            >
              <Icon name="graduation-cap" color={theme.primary} size={20} />
              {diasProva != null ? (
                <div>
                  <div style={{ fontSize: 11, color: theme.primary, fontWeight: 600 }}>Faltam</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#2c2530' }}>{diasProva} dias</div>
                  <div style={{ fontSize: 10.5, color: '#8b8391' }}>para a prova da OAB</div>
                </div>
              ) : (
                <div>
                  <div style={{ fontSize: 11, color: theme.primary, fontWeight: 600 }}>Sua prova</div>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: '#2c2530' }}>Definir data</div>
                  <div style={{ fontSize: 10.5, color: '#8b8391' }}>para contar os dias</div>
                </div>
              )}
            </div>
            <div style={{ position: 'relative' }}>
              <div data-testid="sino" style={{ ...s.bellWrap, cursor: 'pointer' }} onClick={() => setNotifOpen((v) => !v)}>
                <Icon name="bell" color="#5c5462" size={19} />
                {notificacoes.length > 0 && <div style={s.bellBadge}>{notificacoes.length}</div>}
              </div>

              {notifOpen && (
                <div
                  className="entra"
                  data-testid="painel-notificacoes"
                  style={{
                    position: 'absolute', right: 0, top: 48, width: 320, zIndex: 500,
                    background: '#fff', borderRadius: 14, border: '1px solid rgba(0,0,0,.06)',
                    boxShadow: '0 12px 32px rgba(0,0,0,.14)', padding: 14,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: '#2c2530' }}>Avisos</div>
                    <span onClick={() => setNotifOpen(false)} style={{ color: '#8b8391', cursor: 'pointer', fontWeight: 700 }}>×</span>
                  </div>

                  {notificacoes.length === 0 ? (
                    <div style={{ fontSize: 12.5, color: '#8b8391', marginTop: 10, lineHeight: 1.5 }}>
                      Nada pendente por aqui. Meta batida e nenhuma questão errada esperando revisão.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
                      {notificacoes.map((n, i) => (
                        <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                          <div style={{ width: 30, height: 30, borderRadius: 9, background: `${n.cor}1e`, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
                            <Icon name={n.icone} color={n.cor} size={16} />
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 12.5, fontWeight: 600, color: '#2c2530', lineHeight: 1.35 }}>{n.titulo}</div>
                            <div style={{ fontSize: 11.5, color: '#8b8391', marginTop: 2 }}>{n.texto}</div>
                            {n.acao && (
                              <button
                                onClick={() => { setNotifOpen(false); goTo(n.acao.ir); }}
                                style={{ ...s.btnOutline, marginTop: 6, padding: '5px 10px', fontSize: 11.5 }}
                              >
                                {n.acao.rotulo}
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
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
              <span onClick={() => setErroSync(null)} style={{ fontWeight: 700, cursor: 'pointer' }}>×</span>
            </div>
          )}
          {state.screen === 'dashboard' && (
            <Dashboard {...screenProps} dash={state.dashboard} setDash={(p) => updateSlice('dashboard', p)} acervo={acervo} />
          )}
          {state.screen === 'cronograma' && <Cronograma {...screenProps} />}
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
            <Simulados
              {...screenProps}
              sim={state.simulados}
              setSim={(p) => updateSlice('simulados', p)}
              setResultadosHistorico={(p) => updateSlice('resultados_historico', p)}
              registrar={registrar}
            />
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
            <Desempenho {...screenProps} perf={state.desempenho} setPerf={(p) => updateSlice('desempenho', p)} />
          )}
          {state.screen === 'estatisticas' && (
            <Estatisticas {...screenProps} filtros={state.estatisticas} setFiltros={(p) => updateSlice('estatisticas', p)} />
          )}
          {state.screen === 'disciplinas' && (
            <Disciplinas
              {...screenProps}
              disc={state.disciplinas}
              setDisc={(p) => updateSlice('disciplinas', p)}
            />
          )}
          {state.screen === 'anotacoes' && (
            <Anotacoes {...screenProps} notas={state.anotacoes} setNotas={(p) => updateSlice('anotacoes', p)} />
          )}
          {state.screen === 'favoritos' && (
            <Favoritos {...screenProps} favoritos={state.favoritos} toggleFavorito={toggleFavorito} />
          )}
          {state.screen === 'configuracoes' && (
            <Configuracoes
              {...screenProps}
              perfil={perfil}
              nome={nome}
              atualizarNome={atualizarNome}
              atualizarConfig={atualizarConfig}
              themeKey={state.theme}
              setTheme={setTheme}
            />
          )}
        </div>
      </div>
    </div>
  );
}
