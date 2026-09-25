import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { THEMES, buildStyles } from './lib/theme';
import { Icon } from './lib/icons';
import { NAV, PAGE_META, FASE_PADRAO, faseValida } from './lib/navegacao';
import {
  loadState, saveState, limparEstado, carregarDadosDaConta, salvarDadosDaConta, estadoDaConta,
  dadosNaAbertura, lerDadosDaConta, contaDaChave, registrarRecebido,
} from './lib/storage';
import { diasAteProva, metaDiaria, sequenciaAtual } from './lib/metrics';
import { montarDisciplinas } from './lib/disciplinas';
import { planoDaSemana } from './lib/agenda';
import { embaralhar } from './lib/questions/acervo';
import { classificarRevisao } from './lib/revisao';
import { mesclarTentativas } from './lib/historico';
import { enviarEmFila } from './lib/fila';
import { payloadDoToken, saudacao, iniciais, nomeDeExibicao } from './lib/perfil';
import {
  TOKEN_KEY, getToken, logout, listarTentativas, listarQuestoes, registrarTentativa,
  buscarPerfil, salvarPerfil, salvarRespostaDiscursiva,
} from './lib/api/api';
import SeletorDeFase from './components/ui/SeletorDeFase';
import { mesmoRascunho } from './lib/discursivas';
import { fichaConcluida, montarFicha, respostasIniciais, opcoesDeDificuldade } from './lib/ficha';
import { criarFilaDePreferencias, configuracoesDoPerfil } from './lib/preferencias';

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
import SegundaFase from './screens/SegundaFase';
import FichaDeBoasVindas from './screens/FichaDeBoasVindas';

// O que é da INTERFACE começa aqui. O que é da PESSOA — nome, e-mail, meta,
// data da prova — vem do servidor: até esta versão, `configuracoes` trazia
// "Maria Laís / maria.lais@email.com" escrito no código, e todo mundo que
// entrava no app virava Maria Laís.
//
// `__usuario` guarda de quem é o estado salvo neste navegador. Sem ele, sair
// de uma conta e entrar em outra no mesmo computador herdava favoritos,
// anotações e histórico de simulado da pessoa anterior. Esses três também
// ficam guardados por conta (`salvarDadosDaConta`), e é de lá que voltam
// quando a mesma pessoa entra de novo.
//
// `fase` e `segundaFase.questaoId` são da interface, como `screen`: qual prova
// e qual questão discursiva estão na tela. Os rascunhos ainda não conferidos
// (`segundaFase.rascunhos`) são da conta, como as anotações: vão para a chave
// dela, sobrevivem ao "Sair" e passam entre abas. A resposta conferida vai
// para o servidor, e aí o rascunho sai.
const DEFAULT_STATE = {
  __usuario: null,
  theme: 'rosa',
  fase: FASE_PADRAO,
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
  segundaFase: { questaoId: null, rascunhos: {} },
};

const TELA_ESTREITA = '(max-width: 760px)';

// Novas tentativas de buscar o perfil depois de uma falha (ms). Conta recém
// criada ainda não tem perfil no user-service — ele nasce do evento
// `user.registered`, um instante depois do cadastro — e a primeira busca
// volta 404. Sem repetir, a ficha de boas-vindas só apareceria no próximo
// acesso. As duas primeiras esperas acontecem com a tela de "carregando";
// daí em diante o app abre como antes (nome vazio) e a busca segue por trás:
// quando o perfil vier, a ficha aparece se ainda não foi feita.
const ESPERAS_DO_PERFIL = [1000, 2000, 5000, 10000, 20000, 30000];
const TENTATIVAS_COM_TELA_DE_ESPERA = 2;

const PERFIL_VAZIO = { estado: 'carregando', id: null, name: null, email: null, preferencias: null };

// O PUT de `profile_data` (ver `lib/preferencias.js`): só as chaves que
// mudaram, que o user-service mescla. `extra.nome` vai junto quando é a ficha
// que grava.
const novaFilaDePreferencias = () => criarFilaDePreferencias(
  (preferencias, extra) => salvarPerfil(extra.id, { nome: extra.nome, preferencias }),
);

// A conta dona do estado sai do token, que está aqui na hora; o perfil só a
// confirma depois, pela rede. Esperar por ele deixava quem entrava ver, por um
// instante, os favoritos de quem tinha saído por token vencido — e, com os
// dados guardados por conta, um clique nesse instante gravaria na conta errada.
function contaDoToken() {
  const payload = payloadDoToken(getToken());
  return payload ? { id: payload.id, dados: carregarDadosDaConta(payload.id) } : null;
}

export default function App() {
  const [state, setState] = useState(() => {
    const salvo = loadState(DEFAULT_STATE);
    const conta = contaDoToken();
    if (!conta) return salvo;
    return estadoDaConta(salvo, conta.id, DEFAULT_STATE, dadosNaAbertura(salvo, conta.dados));
  });
  const [notifOpen, setNotifOpen] = useState(false);

  // Tela estreita (celular). Só a página da 2ª fase se adapta por enquanto: a
  // barra lateral de 232px ocupava mais da metade da tela e espremia o campo
  // de resposta. A 1ª fase segue sem layout de celular (ver Pendências).
  const [estreita, setEstreita] = useState(() => window.matchMedia?.(TELA_ESTREITA).matches ?? false);
  useEffect(() => {
    const consulta = window.matchMedia?.(TELA_ESTREITA);
    if (!consulta) return undefined;
    const mudar = (e) => setEstreita(e.matches);
    consulta.addEventListener('change', mudar);
    return () => consulta.removeEventListener('change', mudar);
  }, []);
  const [sessao, setSessao] = useState(() => (getToken() ? 'ativa' : 'ausente'));
  const [erroSync, setErroSync] = useState(null);
  // A última resposta discursiva salva nesta sessão, por questão. É do
  // servidor e fica só em memória: serve para a questão aberta (ou reaberta
  // com o POST no ar) mostrar a resposta que acabou de ser salva, em vez da
  // carga que saiu antes dela.
  const [salvasNaSessao, setSalvasNaSessao] = useState({});
  const [usuarioTentativas, setUsuarioTentativas] = useState({});
  const [perfil, setPerfil] = useState(PERFIL_VAZIO);
  // A ficha continua na tela depois de gravada, para mostrar "Tudo pronto"
  // até a pessoa clicar em "Começar a estudar". Sem isto, o perfil voltando
  // com `concluidaEm` a tiraria da tela no mesmo instante.
  const [fichaAberta, setFichaAberta] = useState(false);
  // O perfil que chega tarde — depois de uma falha, com o app já aberto — não
  // derruba a tela em uso: a ficha espera a próxima troca de tela (menu,
  // aviso do sino, seletor de fase). Um simulado em andamento vive só na
  // tela de Simulados, e sair dela já o descarta; trocar a tela no meio dele
  // pela ficha perderia a prova sem a pessoa ter pedido nada.
  const [fichaAdiada, setFichaAdiada] = useState(false);
  const perfilEstado = useRef('carregando');

  // O acervo é do servidor, não do bundle. Guardar o estado do carregamento
  // junto com as questões — e não só a lista — é o que permite a tela
  // distinguir "ainda estou buscando" de "busquei e não veio nada", que para
  // quem estuda são situações completamente diferentes.
  const [acervo, setAcervo] = useState({ estado: 'carregando', questoes: [], erro: null });
  const [recarga, setRecarga] = useState(0);

  // Contador de sessão. Toda escrita de estado que acontece *depois* de um
  // await compara este número com o que valia quando a operação começou —
  // é o mesmo cuidado do `let cancelado` no efeito de carga, e existe porque
  // sair do app não cancela um POST que já saiu. Sem isto, a resposta que
  // chega depois do logout reinsere a tentativa num app deslogado, e ela
  // fica esperando a próxima pessoa que entrar neste navegador. Sobe em
  // `encerrarSessao`, que é por onde passam o "Sair" e o 401.
  const sessaoEpoch = useRef(0);

  // As gravações de `profile_data` (meta, data da prova, ficha) entram numa
  // fila de um só: quem edita a meta e logo em seguida a data da prova
  // dispara dois PUT, e sem a fila eles correm soltos — se o primeiro chegar
  // ao servidor depois do segundo, o valor mais novo é sobrescrito pelo mais
  // velho e a tela mostra uma coisa que o banco não tem. Foi assim que o
  // teste de e2e ficou intermitente. Cada PUT leva só as chaves que mudaram
  // (o user-service mescla), e a resposta — o `profile_data` inteiro — é o
  // que a tela passa a mostrar. Uma fila por sessão (`encerrarSessao` troca).
  const filaDePreferencias = useRef(null);
  if (filaDePreferencias.current == null) filaDePreferencias.current = novaFilaDePreferencias();

  // Quantas respostas de simulado ainda estão na fila (`registrarRespostas`).
  // Elas só existem na memória desta aba: fechar ou recarregar antes de a fila
  // terminar as perdia sem aviso nenhum.
  const respostasNaFila = useRef(0);

  // O fim de uma sessão, seja por "Sair" ou por token vencido (401).
  //
  // O 401 só trocava a tela para o login. Nada do que estava no ar era
  // invalidado: um POST da conta anterior que voltasse depois de outra pessoa
  // entrar caía no histórico dela, e um PUT de preferência ainda na fila saía
  // com o token de quem entrou. Por isso o epoch sobe aqui, nos dois
  // caminhos.
  //
  // A tela (`state`) fica: no 401, quem entra de novo com a mesma conta volta
  // ao que estava fazendo, e se entrar outra conta `estadoDaConta` troca o
  // estado no login. Limpar a tela é coisa do `sair`.
  const encerrarSessao = useCallback(() => {
    sessaoEpoch.current += 1;
    filaDePreferencias.current = novaFilaDePreferencias();
    setUsuarioTentativas({});
    setSalvasNaSessao({});
    setPerfil(PERFIL_VAZIO);
    perfilEstado.current = 'carregando';
    setFichaAberta(false);
    setFichaAdiada(false);
    setErroSync(null);
    setSessao('ausente');
  }, []);

  // Enquanto houver resposta na fila, o navegador pergunta antes de fechar ou
  // recarregar a aba. Não cobre a aba descartada pelo sistema (celular) —
  // ver Pendências no ARCHITECTURE.md.
  useEffect(() => {
    const avisar = (evento) => {
      if (respostasNaFila.current > 0) {
        evento.preventDefault();
        evento.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', avisar);
    return () => window.removeEventListener('beforeunload', avisar);
  }, []);

  // Quem esta aba mostra e se ela está logada, para o ouvinte de `storage`
  // abaixo, que é registrado uma vez só e não enxerga o render atual.
  const dono = useRef(state.__usuario);
  dono.current = state.__usuario;
  const sessaoAtual = useRef(sessao);
  sessaoAtual.current = sessao;

  // Outra aba mexeu no localStorage — o navegador avisa as demais pelo evento
  // `storage`. Sem ouvi-lo, cada aba seguia com o que leu ao abrir:
  //
  // - Mesma conta: a aba desatualizada regravava a chave da conta com a versão
  //   velha na primeira edição, e a nota criada na outra aba sumia. Agora os
  //   dados que a outra aba gravou entram nesta na hora.
  // - Conta diferente: o token é um só para o navegador. Se, noutra aba, a
  //   pessoa saía e entrava com outra conta, esta seguia mostrando a anterior
  //   e gravando com o token da nova — resposta de uma conta na outra. Agora
  //   esta aba recarrega já na conta nova; se o token some, volta ao login.
  useEffect(() => {
    const aoMudar = (evento) => {
      if (evento.storageArea !== localStorage) return;

      // `key` nula é um `localStorage.clear()` noutra aba: o token foi junto.
      if (evento.key === TOKEN_KEY || evento.key === null) {
        const novo = evento.key === null ? null : evento.newValue;
        if (!novo) {
          if (sessaoAtual.current === 'ativa') encerrarSessao();
          return;
        }
        const id = payloadDoToken(novo)?.id;
        if (sessaoAtual.current !== 'ativa' || String(id) !== String(dono.current)) {
          // O que esta aba ainda tinha na fila é da sessão anterior e já parou
          // (a fila confere o token); o aviso de sair só atrapalharia aqui.
          respostasNaFila.current = 0;
          window.location.reload();
        }
        return;
      }

      const id = contaDaChave(evento.key);
      if (id == null || String(id) !== String(dono.current)) return;
      const dados = lerDadosDaConta(evento.newValue);
      if (Object.keys(dados).length === 0) return;
      // Antes de aplicar: senão esta aba devolveria à chave, atrasada, a
      // versão que acabou de receber (ver `registrarRecebido`).
      registrarRecebido(id, evento.newValue);
      // Confere de novo no updater: um "Sair" na fila entre o evento e aqui
      // deixaria o estado sem dono, e os dados da conta entrariam nele.
      setState((st) => (String(st.__usuario) === String(id)
        ? estadoDaConta(st, st.__usuario, DEFAULT_STATE, dados)
        : st));
    };

    window.addEventListener('storage', aoMudar);
    return () => window.removeEventListener('storage', aoMudar);
  }, [encerrarSessao]);

  useEffect(() => {
    saveState(state);
    // Sem conta (depois do logout) não grava: o estado padrão escreveria
    // listas vazias por cima do que a pessoa acabou de deixar guardado.
    salvarDadosDaConta(state.__usuario, state);
  }, [state]);

  // ---- Perfil: quem está usando o app ----
  useEffect(() => {
    if (sessao !== 'ativa') return undefined;

    const payload = payloadDoToken(getToken());
    if (!payload) { encerrarSessao(); return undefined; }

    let cancelado = false;
    let espera = null;

    const tentar = (tentativa) => buscarPerfil(payload.id)
      .then((p) => {
        if (cancelado) return;
        // O app já estava aberto (o perfil tinha falhado): a ficha, se
        // faltar, espera a próxima troca de tela.
        if (perfilEstado.current === 'erro') setFichaAdiada(true);
        perfilEstado.current = 'pronto';
        setPerfil({ estado: 'pronto', id: p.id, name: p.name, email: p.email || payload.email, preferencias: p.preferencias || {} });

        const dadosDaConta = carregarDadosDaConta(p.id);
        setState((st) => {
          // A troca de conta normalmente já aconteceu ao entrar, pelo token.
          // Repetir aqui cobre o perfil que volte com outro id: o estado de
          // outra conta não pode ficar na tela de quem entrou.
          //
          // Com a mesma conta não reaplica a chave: a abertura e o `entrar` já
          // aplicaram, e fazê-lo aqui, depois de uma ida à rede, só estaria
          // certo enquanto toda edição for gravada antes desta resposta chegar.
          const mesmaConta = String(st.__usuario) === String(p.id);
          const base = estadoDaConta(st, p.id, DEFAULT_STATE, mesmaConta ? {} : dadosDaConta);
          return {
            ...base,
            __usuario: p.id,
            // O servidor manda em meta e data da prova: são as preferências
            // que precisam seguir a pessoa de um aparelho para o outro.
            configuracoes: { ...base.configuracoes, ...configuracoesDoPerfil(p.preferencias, base.configuracoes) },
          };
        });
      })
      .catch((err) => {
        if (cancelado) return;
        if (err.status === 401) { encerrarSessao(); return; }
        // Perfil é o nome no canto da tela: sem ele o app funciona inteiro.
        // Cair aqui não pode virar tela de erro — vira nome vazio. Só a ficha
        // espera por ele (ver ESPERAS_DO_PERFIL).
        if (tentativa >= TENTATIVAS_COM_TELA_DE_ESPERA || tentativa >= ESPERAS_DO_PERFIL.length) {
          if (perfilEstado.current !== 'pronto') perfilEstado.current = 'erro';
          setPerfil((atual) => (atual.estado === 'erro'
            ? atual
            : { estado: 'erro', id: payload.id, name: null, email: payload.email, preferencias: null }));
        }
        if (tentativa < ESPERAS_DO_PERFIL.length) {
          espera = setTimeout(() => { if (!cancelado) tentar(tentativa + 1); }, ESPERAS_DO_PERFIL[tentativa]);
        }
      });

    tentar(0);

    return () => { cancelado = true; clearTimeout(espera); };
  }, [sessao, encerrarSessao]);

  // ---- Histórico de tentativas ----
  useEffect(() => {
    if (sessao !== 'ativa') return undefined;

    // Sem isto o histórico só existiria enquanto a aba estivesse aberta —
    // é esta carga que faz a tentativa sobreviver ao localStorage limpo.
    let cancelado = false;

    // Recomeça vazio: o que estiver aqui é de antes desta carga — de outra
    // conta, se a sessão anterior terminou por token vencido (401), que não
    // passa pelo `sair`. Daqui em diante só entra o que `registrar` gravar
    // nesta sessão, e é isso que a mesclagem abaixo preserva.
    setUsuarioTentativas({});

    listarTentativas()
      .then((tentativas) => {
        if (!cancelado) setUsuarioTentativas((recentes) => mesclarTentativas(tentativas, recentes));
      })
      .catch((err) => {
        if (cancelado) return;
        if (err.status === 401) { encerrarSessao(); return; }
        setErroSync(`Não foi possível carregar seu histórico: ${err.message}`);
      });

    return () => { cancelado = true; };
  }, [sessao, encerrarSessao]);

  // ---- Acervo ----
  useEffect(() => {
    if (sessao !== 'ativa') return undefined;

    let cancelado = false;
    setAcervo((a) => ({ ...a, estado: 'carregando', erro: null }));

    listarQuestoes()
      .then((questoes) => { if (!cancelado) setAcervo({ estado: 'pronto', questoes, erro: null }); })
      .catch((err) => {
        if (cancelado) return;
        if (err.status === 401) { encerrarSessao(); return; }
        // Erro do acervo não vira o aviso de sincronização do topo: aquele
        // fala de resposta que não foi salva. Este impede o estudo inteiro,
        // e quem mostra é a própria tela de questões, com botão de tentar de
        // novo — que é a única coisa útil a fazer aqui.
        setAcervo({ estado: 'erro', questoes: [], erro: err.message });
      });

    return () => { cancelado = true; };
  }, [sessao, recarga, encerrarSessao]);

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

  const goTo = (screen) => {
    setFichaAdiada(false);
    setState((st) => ({ ...st, screen }));
  };
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

  // Meta e data da prova vão para o servidor (coluna profile_data); o estado
  // local muda na hora para a tela não ficar esperando a rede.
  const atualizarConfig = (partial) => {
    // Vai ao servidor só o que mudou: o user-service mescla o profile_data, e
    // mandar a meta local junto com uma data nova sobrescreveria a meta gravada
    // de lá quando o perfil ainda não carregou (aparelho novo, perfil fora do ar).
    const mudou = {};
    if ('meta' in partial) mudou.meta = partial.meta;
    if ('dataProva' in partial) mudou.dataProva = partial.dataProva;

    // O `setState` fica com a função pura. Disparar a rede de dentro dele
    // seria efeito colateral num updater — o React pode reexecutá-lo (e em
    // StrictMode reexecuta sempre), o que dobrava cada gravação.
    setState((st) => ({ ...st, configuracoes: { ...st.configuracoes, ...partial } }));

    if (perfil.id == null || Object.keys(mudou).length === 0) return;

    const epoch = sessaoEpoch.current;
    const id = perfil.id;
    // A fila pode andar depois do fim da sessão: um PUT que ainda esperava a
    // vez sairia com o token de quem entrou em seguida. Não sai.
    filaDePreferencias.current
      .gravar(
        mudou,
        { continuar: () => sessaoEpoch.current === epoch, extra: { id } },
      )
      .then((resposta) => {
        if (!resposta || sessaoEpoch.current !== epoch) return;
        setPerfil((atual) => ({ ...atual, preferencias: resposta.preferencias }));
      })
      .catch((err) => {
        if (sessaoEpoch.current !== epoch) return;
        // Token vencido volta ao login, como nas cargas. Antes a faixa dizia
        // "Sessão expirada" e deixava a pessoa numa tela que já não salvava nada.
        if (err.status === 401) { encerrarSessao(); return; }
        setErroSync(`Preferência não salva no servidor: ${err.message}`);
      });
  };

  // A ficha de boas-vindas (e a edição dela em Configurações). Vai pela mesma
  // fila da meta, com o nome no mesmo PUT. Devolve o que foi salvo, `null` se
  // a sessão acabou com o PUT no ar, e deixa o erro subir para a tela da
  // ficha, que o mostra sem perder as respostas — a faixa do topo nem existe
  // enquanto a ficha está na tela.
  //
  // Só a primeira conclusão escolhe a fase: editar pelas Configurações não
  // tira a pessoa da tela em que está (a fase se troca no seletor do menu).
  const salvarFicha = async (respostas) => {
    if (perfil.id == null) throw new Error('seu perfil ainda não carregou');
    const epoch = sessaoEpoch.current;
    const edicao = fichaConcluida(perfil.preferencias);
    const { nome: nomeNovo, preferencias } = montarFicha(respostas, {
      anterior: edicao ? perfil.preferencias.ficha : null,
    });
    if (!edicao) setFichaAberta(true);

    try {
      // Outra aba (ou aparelho) pode ter concluído a ficha enquanto esta a
      // mostrava. Aí vale a de lá: esta entra no app sem sobrescrever. Se a
      // consulta falhar, grava do mesmo jeito — é ela que é opcional.
      if (!edicao) {
        const atual = await buscarPerfil(perfil.id).catch((err) => {
          if (err.status === 401) throw err;
          return null;
        });
        if (sessaoEpoch.current !== epoch) return null;
        if (atual && fichaConcluida(atual.preferencias)) {
          setPerfil((p) => ({ ...p, name: atual.name ?? p.name, preferencias: atual.preferencias }));
          setState((st) => ({ ...st, configuracoes: { ...st.configuracoes, ...configuracoesDoPerfil(atual.preferencias, st.configuracoes) } }));
          setFichaAberta(false);
          return null;
        }
      }

      const resposta = await filaDePreferencias.current.gravar(preferencias, {
        continuar: () => sessaoEpoch.current === epoch,
        extra: { id: perfil.id, nome: nomeNovo },
      });
      if (!resposta || sessaoEpoch.current !== epoch) return null;

      setPerfil((atual) => ({ ...atual, name: resposta.name ?? atual.name, preferencias: resposta.preferencias }));
      setState((st) => ({
        ...st,
        ...(edicao ? {} : { fase: faseValida(respostas.fase).chave, screen: 'dashboard' }),
        configuracoes: { ...st.configuracoes, meta: preferencias.meta, dataProva: preferencias.dataProva },
      }));
      return { nome: resposta.name ?? nomeNovo, preferencias: resposta.preferencias };
    } catch (err) {
      if (sessaoEpoch.current !== epoch) return null;
      if (!edicao) setFichaAberta(false);
      if (err.status === 401) { encerrarSessao(); return null; }
      throw err;
    }
  };

  // Resposta discursiva: mesma regra das outras gravações. Devolve a linha
  // salva, ou `null` se a sessão acabou com o POST no ar (a tela não mostra
  // nada para quem entrar depois). Outro erro sobe para a tela, que o mostra
  // junto da própria resposta — a faixa do topo ficaria longe dela.
  //
  // O rascunho sai daqui, e não da tela: quem volta à lista com o POST no ar
  // desmonta a questão, e a resposta era salva com o rascunho ficando para
  // trás. Só sai se ainda for o texto enviado — senão é edição nova.
  const gravarRespostaDiscursiva = async (resposta) => {
    const epoch = sessaoEpoch.current;
    try {
      const salva = await salvarRespostaDiscursiva(resposta);
      if (sessaoEpoch.current !== epoch) return null;
      const id = String(resposta.questaoId);
      setSalvasNaSessao((atual) => ({ ...atual, [id]: salva }));
      setState((st) => {
        const rascunhos = st.segundaFase?.rascunhos || {};
        if (!(id in rascunhos) || !mesmoRascunho(rascunhos[id], resposta.respostas)) return st;
        const resto = { ...rascunhos };
        delete resto[id];
        return { ...st, segundaFase: { ...st.segundaFase, rascunhos: resto } };
      });
      return salva;
    } catch (err) {
      if (sessaoEpoch.current !== epoch) return null;
      if (err.status === 401) { encerrarSessao(); return null; }
      throw err;
    }
  };

  const trocarFase = (chave) => {
    setNotifOpen(false);
    setFichaAdiada(false);
    setState((st) => ({ ...st, fase: faseValida(chave).chave }));
  };

  const atualizarNome = async (nome) => {
    if (perfil.id == null) return false;
    const epoch = sessaoEpoch.current;
    try {
      const p = await salvarPerfil(perfil.id, { nome });
      // Saiu com o PUT no ar: o nome antigo não pode voltar ao perfil zerado,
      // nem a mensagem aparecer para quem entrar depois.
      if (sessaoEpoch.current !== epoch) return false;
      setPerfil((atual) => ({ ...atual, name: p.name }));
      return true;
    } catch (err) {
      if (sessaoEpoch.current !== epoch) return false;
      if (err.status === 401) { encerrarSessao(); return false; }
      setErroSync(`Nome não salvo: ${err.message}`);
      return false;
    }
  };

  // Grava no servidor primeiro e só depois no estado: o que aparece na tela
  // como respondido é o que a API confirmou ter gravado.
  // `emLote`: a fila do simulado (`registrarRespostas`) cuida da faixa de erro
  // uma vez só, no fim — resposta por resposta, cada chamada apagaria a
  // mensagem da falha anterior.
  const registrar = ({ questaoId, correta, alternativa, tempoSeg }, { emLote = false } = {}) => {
    if (!emLote) setErroSync(null);
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
        // Mesmo cuidado do caminho de sucesso: a falha de uma sessão que já
        // acabou não pode aparecer na faixa de erro de quem entrou depois.
        if (sessaoEpoch.current !== epoch) return null;
        if (err.status === 401) { encerrarSessao(); return null; }
        // O quiz continua andando; o que se perdeu foi o registro. Dizer isso
        // é melhor que deixar a pessoa achar que estudou e nada ficou gravado.
        if (!emLote) setErroSync(`Esta resposta não foi salva: ${err.message}`);
        return null;
      }
    })();

    return pendente;
  };

  // As respostas de um simulado inteiro, em fila (ver `lib/fila.js`: todas
  // juntas passavam do limite do nginx e parte voltava 429).
  //
  // A fila confere, antes de cada envio, que a sessão e o token ainda são os
  // do fim da prova. Ela leva alguns segundos; se nesse meio-tempo a pessoa
  // sair e outra entrar, o resto não sai com o token de quem entrou — seriam
  // respostas de uma conta gravadas na outra.
  //
  // Quatro de cada vez: em série, 80 respostas levavam dezenas de segundos em
  // rede ruim — tempo de sobra para alguém fechar a aba. Quatro no ar cabem
  // no limite do nginx (folga de 50, 30 por segundo), e o 429 que escapar é
  // repetido pelo `req`.
  const registrarRespostas = async (respostas) => {
    const epoch = sessaoEpoch.current;
    const token = getToken();
    setErroSync(null);
    respostasNaFila.current += respostas.length;

    try {
      const { salvos, falhas, interrompida } = await enviarEmFila(
        respostas,
        async (resposta) => (await registrar(resposta, { emLote: true })) !== null,
        {
          continuar: () => sessaoEpoch.current === epoch && getToken() === token,
          simultaneos: 4,
        },
      );

      if (sessaoEpoch.current !== epoch) return;
      // Interrompida (o token mudou em outra aba, por exemplo), o que não
      // chegou a sair também não foi salvo — não só o que falhou.
      const naoSalvas = interrompida ? respostas.length - salvos : falhas;
      if (naoSalvas > 0) {
        setErroSync(`${naoSalvas} de ${respostas.length} respostas deste simulado não foram salvas no servidor.`);
      }
    } finally {
      respostasNaFila.current -= respostas.length;
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
    // O histórico, as gravações em curso e o que já estava no ar saem junto
    // com a sessão — ver `encerrarSessao`.
    encerrarSessao();
    // O que era desta conta sai da tela — quem entrar depois não pode
    // encontrá-lo. Favoritos, anotações e histórico de simulado continuam
    // guardados na chave da conta (o efeito de gravação os mantém em dia a cada
    // mudança) e voltam quando a mesma pessoa entrar de novo. Apagá-los aqui,
    // como antes, fazia "Sair" destruir tudo o que ela tinha escrito.
    limparEstado();
    setState({ ...DEFAULT_STATE, theme: state.theme });
  };

  if (sessao !== 'ativa') {
    const entrar = () => {
      const conta = contaDoToken();
      if (conta) setState((st) => estadoDaConta(st, conta.id, DEFAULT_STATE, conta.dados));
      setSessao('ativa');
    };
    return <Login theme={theme} s={s} onEntrar={entrar} />;
  }

  // A ficha de boas-vindas é obrigatória: enquanto o perfil não disser que
  // ela foi concluída, ela fica no lugar das telas. Só com o perfil carregado
  // — até lá não dá para saber, e mostrar o Dashboard para trocá-lo pela
  // ficha um segundo depois seria pior que esperar. Se o perfil falhar, o app
  // abre como sempre abriu e a ficha aparece quando ele vier.
  if (perfil.estado === 'carregando') {
    return (
      <div style={{ ...s.app, alignItems: 'center', justifyContent: 'center' }}>
        <div role="status" data-testid="carregando-perfil" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, color: '#8b8391', fontSize: 13 }}>
          <div className="esqueleto" style={{ ...s.logoMark, width: 40, height: 40, borderRadius: 12 }} aria-hidden="true">
            <Icon name="scale" color="#fff" size={20} />
          </div>
          Carregando seu perfil…
          {/* Rede ruim pode deixar esta tela alguns segundos (cada busca tem
              10 s de prazo, e ela é repetida). Sair é a saída que não depende
              do servidor. */}
          <button type="button" data-testid="sair" onClick={sair} style={{ ...s.btnOutline, marginTop: 6 }}>Sair</button>
        </div>
      </div>
    );
  }

  const fichaPendente = perfil.estado === 'pronto' && !fichaConcluida(perfil.preferencias);
  if (fichaAberta || (fichaPendente && !fichaAdiada)) {
    return (
      <FichaDeBoasVindas
        theme={theme}
        s={s}
        email={perfil.email}
        iniciais={respostasIniciais({
          nome: perfil.name, configuracoes: state.configuracoes, fase: state.fase, preferencias: perfil.preferencias,
        })}
        opcoesDeDificuldade={(marcadas) => opcoesDeDificuldade(acervo.questoes, marcadas)}
        acervoCarregando={acervo.estado === 'carregando'}
        onSalvar={salvarFicha}
        onEntrar={() => setFichaAberta(false)}
        onSair={sair}
      />
    );
  }

  const dificuldades = perfil.preferencias?.ficha?.dificuldades || [];

  const nome = nomeDeExibicao(perfil, perfil.email);
  const fase = faseValida(state.fase);

  // "Ver perfil" leva às Configurações, que são da 1ª fase: da 2ª, troca de
  // fase junto — senão o clique mudaria uma tela que não está à vista.
  const verPerfil = () => setState((st) => ({ ...st, fase: FASE_PADRAO, screen: 'configuracoes' }));

  const linhaDoPerfil = (
    <div style={s.profileRow}>
      <div style={s.avatar} data-testid="avatar">{iniciais(nome, '·')}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div data-testid="perfil-nome" style={{ fontSize: 13.5, fontWeight: 600, color: '#2c2530', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {nome || (perfil.estado === 'carregando' ? '—' : 'Sem nome')}
        </div>
        <div onClick={verPerfil} style={{ fontSize: 11.5, color: '#8b8391', cursor: 'pointer' }}>Ver perfil ›</div>
      </div>
      <div data-testid="sair" onClick={sair} style={{ fontSize: 11.5, color: theme.primary, fontWeight: 600, cursor: 'pointer' }}>
        Sair
      </div>
    </div>
  );

  const faixaDeErro = erroSync && (
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
  );

  // 2ª fase: página própria, sem dashboard, menu, meta nem avisos — tudo isso
  // mede a 1ª fase. Fica o seletor, quem está logado e a faixa de erro.
  if (fase.chave !== FASE_PADRAO) {
    const segundaFase = (
      <SegundaFase
        theme={theme}
        s={s}
        fase={fase}
        estado={state.segundaFase}
        setEstado={(p) => updateSlice('segundaFase', p)}
        gravarResposta={gravarRespostaDiscursiva}
        salvasNaSessao={salvasNaSessao}
        sessaoExpirou={encerrarSessao}
      />
    );

    // No celular a barra lateral vira uma faixa no topo: seletor, iniciais e
    // "Sair". O resto dela (o item de menu e a explicação) é dispensável.
    if (estreita) {
      return (
        <div style={{ ...s.app, flexDirection: 'column' }}>
          <div style={{ flex: 'none', background: '#fff', borderBottom: '1px solid rgba(0,0,0,.06)', padding: '12px 14px', display: 'flex', alignItems: 'flex-end', gap: 12 }}>
            <SeletorDeFase theme={theme} s={s} fase={fase} onTrocar={trocarFase} compacto />
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 'none', paddingBottom: 4 }}>
              <div style={{ ...s.avatar, width: 30, height: 30, fontSize: 11 }} data-testid="avatar" title={nome || undefined}>{iniciais(nome, '·')}</div>
              <div data-testid="sair" onClick={sair} style={{ fontSize: 12, color: theme.primary, fontWeight: 600, cursor: 'pointer' }}>Sair</div>
            </div>
          </div>
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '14px 14px 28px' }}>
            <div style={{ ...s.pageTitle, fontSize: 19 }}>{fase.titulo}</div>
            <div style={{ ...s.pageSub, marginBottom: 14 }}>{fase.sub}</div>
            {faixaDeErro}
            {segundaFase}
          </div>
        </div>
      );
    }

    return (
      <div style={s.app}>
        <div style={s.sidebar}>
          <SeletorDeFase theme={theme} s={s} fase={fase} onTrocar={trocarFase} />
          <div
            data-testid="nav-discursivas"
            aria-current="page"
            style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 10, marginTop: 8,
              fontSize: 13.5, fontWeight: 600, color: theme.primaryDark, background: theme.primarySoft,
            }}
          >
            <Icon name="pencil" color={theme.primaryDark} size={20} />
            <span>Questões discursivas</span>
          </div>
          <div style={{ fontSize: 12, color: '#8b8391', lineHeight: 1.5, padding: '8px 12px 0' }}>
            As 4 questões de cada exame, com o padrão de resposta oficial da FGV. A peça não entra.
          </div>
          {linhaDoPerfil}
        </div>

        <div style={s.main}>
          <div style={s.topbar}>
            <div>
              <div style={s.pageTitle}>{fase.titulo}</div>
              <div style={s.pageSub}>{fase.sub}</div>
            </div>
          </div>
          <div style={s.content}>
            {faixaDeErro}
            {segundaFase}
          </div>
        </div>
      </div>
    );
  }

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
  if (fichaPendente) {
    notificacoes.push({
      icone: 'clipboard-list', cor: '#8B5CF6',
      titulo: 'Preencha sua ficha de boas-vindas',
      texto: 'Ela abre na próxima troca de tela.',
      acao: { rotulo: 'Preencher agora', ir: state.screen },
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
    dificuldades,
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
    revisarQuestoes, praticarDisciplina, dificuldades,
  };

  return (
    <div style={s.app}>
      <div style={s.sidebar}>
        <SeletorDeFase theme={theme} s={s} fase={fase} onTrocar={trocarFase} />

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
            {/* O dashboard já traz a mesma sugestão no card "Próximo passo",
                com o mesmo texto e mais espaço para ele. Repetir aqui, na
                mesma tela, é ruído — mas o atalho continua valendo, porque a
                barra acompanha todas as outras telas, onde aquele card não
                existe. Some o texto, fica o caminho. */}
            {state.screen !== 'dashboard' && (
              <div style={{ fontSize: 12.5, color: '#6b6470', marginTop: 6, lineHeight: 1.45 }}>{foco}</div>
            )}
            <div style={{ fontSize: 12, fontWeight: 600, color: theme.primaryDark, marginTop: state.screen === 'dashboard' ? 6 : 8, display: 'flex', alignItems: 'center', gap: 5 }}>
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

        {linhaDoPerfil}
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
          {faixaDeErro}
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
              registrarRespostas={registrarRespostas}
              acervo={acervo}
              recarregarAcervo={() => setRecarga((n) => n + 1)}
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
              simularDisciplina={(nome) => setState((st) => ({ ...st, screen: 'simulados', simulados: { ...st.simulados, preDisciplina: nome } }))}
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
              salvarFicha={salvarFicha}
              fase={state.fase}
              opcoesDeDificuldade={(marcadas) => opcoesDeDificuldade(acervo.questoes, marcadas)}
              acervoCarregando={acervo.estado === 'carregando'}
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
