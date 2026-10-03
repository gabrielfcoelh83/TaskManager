import { useEffect, useId, useRef, useState } from 'react';
import { Icon } from '../lib/icons';
import { montarFontes } from '../lib/questions/acervo';
import { metaDiaria } from '../lib/metrics';
import { tamanhoDoQuiz, sortearQuiz } from '../lib/quiz';
import { alternarRisco, historicoDaQuestao } from '../lib/cardDeQuestao';
import {
  BotaoRiscar, GabaritoComentado, ListaDoHistorico, OrigemDaQuestao, SeloRespondida, TrilhaDaQuestao,
} from '../components/ui/CardDeQuestao';

const DIFICULDADE_COR = { 'Fácil': '#4A7A4A', 'Média': '#B07A1F', 'Difícil': '#B4413A' };

function Esqueleto({ s }) {
  return (
    <div style={{ ...s.card }} data-testid="acervo-carregando">
      <div className="esqueleto" style={{ height: 12, width: 160 }} />
      <div className="esqueleto" style={{ height: 8, width: '100%', marginTop: 14 }} />
      <div className="esqueleto" style={{ height: 16, width: '92%', marginTop: 22 }} />
      <div className="esqueleto" style={{ height: 16, width: '78%', marginTop: 8 }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 22 }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="esqueleto" style={{ height: 46 }} />
        ))}
      </div>
    </div>
  );
}

function Aviso({ s, icone, cor, titulo, texto, acao }) {
  return (
    <div
      className="entra"
      style={{ ...s.card, padding: '48px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}
    >
      <div style={{ width: 52, height: 52, borderRadius: 10, background: cor, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icone} color="#fff" size={24} />
      </div>
      <div style={{ fontSize: 19, fontWeight: 700, color: '#1c1b19', marginTop: 14 }}>{titulo}</div>
      <div style={{ fontSize: 13.5, color: '#7a766f', marginTop: 6, maxWidth: 440, lineHeight: 1.55 }}>{texto}</div>
      {acao && (
        <button style={{ ...s.btnPrimary, marginTop: 18, padding: '12px 22px', fontSize: 13.5 }} onClick={acao.onClick}>
          {acao.rotulo}
        </button>
      )}
    </div>
  );
}

export default function Questoes({ theme, s, data, quest, setQuest, registrar, acervo, recarregarAcervo, usuarioTentativas, config, resultados_historico, materiaDeHoje }) {
  const [tempoInicio, setTempoInicio] = useState(null);
  // O que é só desta tela, para a questão aberta: as alternativas riscadas e
  // o histórico aberto ou fechado. Guardado com o id da questão, e não em
  // `quest` (que vai para o localStorage): riscar é rascunho de raciocínio,
  // vale enquanto a questão está na tela e some ao trocar de questão —
  // inclusive quando o quiz é montado de fora (Revisões, Disciplinas), sem
  // passar por `startQuiz`. Comparar o id na leitura é o que zera sem efeito.
  const [cartao, setCartao] = useState({ questaoId: null, riscadas: [], historicoAberto: false });
  const idHistorico = useId();

  const all = data.QUESTOES || [];
  const estado = acervo?.estado || 'pronto';

  // O cronômetro de cada questão. Antes ele só começava a contar em
  // `startQuiz`, o que deixava sem tempo todo quiz que NÃO nasce aqui — o
  // "Revisar agora" das Revisões e o "Estudar" das Disciplinas montam o quiz
  // de fora, e as respostas iam para o servidor com `tempo_seg` nulo.
  //
  // Com ida e volta entre as questões, o tempo de cada uma é a soma das
  // passagens por ela (`tempos`, por posição). Fica só em memória: recarregar
  // no meio do quiz zera, e a resposta vai sem tempo — melhor que inventado.
  const tempos = useRef({});
  useEffect(() => {
    if (quest.quiz && !quest.done && !quest.revisando) setTempoInicio(Date.now());
  }, [quest.quiz, quest.idx, quest.done, quest.revisando]);

  // Quiz em andamento salvo antes do fluxo de prova (sem `marcadas`): as
  // respostas dele já foram gravadas uma a uma no modelo antigo, e sem saber
  // quais não dá para retomar sem arriscar gravar de novo. Volta à montagem.
  useEffect(() => {
    if (quest.quiz && !quest.done && quest.marcadas === undefined) {
      setQuest({ quiz: null, idx: 0, selectedAlt: null, marcadas: {}, conferidas: {}, certas: 0, erradas: 0, done: false, revisando: false, corrigindo: false });
    }
  }, [quest.quiz, quest.done, quest.marcadas, setQuest]);

  // A tela não é um gerador de quiz: ela entrega a meta do dia. A matéria sai
  // do mesmo plano do Cronograma e do "Foco de hoje" (`materiaDeHoje`), e o
  // tamanho, do que falta para a meta. Quem chega pelo "Praticar" de
  // Disciplinas ou Simulados troca a matéria só desta vez — e a tela diz
  // isso, com o caminho de volta para a matéria do plano.
  const { chaveDe, fontes } = montarFontes(all);
  const existe = (chave) => fontes.some((f) => f.chave === chave);
  const rotuloDe = (chave) => fontes.find((f) => f.chave === chave)?.rotulo || chave;
  const filtro = (quest.selected || []).filter(existe);
  const doPlano = materiaDeHoje?.disciplina && existe(materiaDeHoje.disciplina) ? [materiaDeHoje.disciplina] : [];
  const escolhidaFora = filtro.length > 0 && filtro.join() !== doPlano.join();
  const materias = filtro.length > 0 ? filtro : doPlano;
  const nomeDaMateria = materias.map(rotuloDe).join(', ');
  const voltarAoPlano = () => setQuest({ selected: null });

  // Sem matéria (acervo ainda sem classificação), a meta vale para o acervo todo.
  const availablePool = materias.length > 0 ? all.filter((q) => materias.includes(chaveDe(q))) : all;

  // O quiz tem o tamanho da meta do dia (ver lib/quiz.js), não o das fontes.
  const meta = metaDiaria(config, usuarioTentativas, resultados_historico);
  const tamanhoAlvo = tamanhoDoQuiz(meta);
  const tamanho = Math.min(tamanhoAlvo, availablePool.length);

  const startQuiz = () => {
    setQuest({ quiz: sortearQuiz(availablePool, tamanhoAlvo, usuarioTentativas), idx: 0, selectedAlt: null, marcadas: {}, conferidas: {}, certas: 0, erradas: 0, done: false, revisando: false, corrigindo: false });
    tempos.current = {};
    setTempoInicio(Date.now());
  };

  const exitQuiz = () => {
    setQuest({ quiz: null, idx: 0, selectedAlt: null, marcadas: {}, conferidas: {}, certas: 0, erradas: 0, done: false, revisando: false, corrigindo: false });
    setTempoInicio(null);
  };

  // Fluxo de prova. Durante o quiz, clicar só MARCA: dá para trocar, voltar e
  // avançar à vontade, sem gabarito à vista. No fim, a revisão lista o que foi
  // marcado e o que ficou em branco, e cada linha leva de volta à questão.
  // "Finalizar e conferir" grava as respostas de uma vez e só então abre o
  // gabarito — em modo leitura, porque remarcar depois de ver o gabarito
  // acertaria quase sempre e inflaria a taxa de acerto das estatísticas.
  //
  // `marcadas` e `conferidas` são por posição no quiz (a mesma questão não se
  // repete num quiz). `revisando` é a tela de revisão antes de finalizar;
  // `corrigindo`, a leitura das questões depois de finalizado.
  const marcadas = quest.marcadas || {};
  const conferidas = quest.conferidas || {};
  const quizActive = !!quest.quiz && !quest.done;
  const quizDone = !!quest.quiz && quest.done;
  const revisando = quizActive && !!quest.revisando;
  const respondendo = quizActive && !quest.revisando;
  const corrigindo = quizDone && !!quest.corrigindo;

  const acumularTempo = () => {
    if (!respondendo || tempoInicio === null) return;
    tempos.current[quest.idx] = (tempos.current[quest.idx] || 0) + (Date.now() - tempoInicio);
  };

  const marcar = (i) => {
    if (!respondendo) return;
    setQuest({ marcadas: { ...marcadas, [quest.idx]: i } });
  };

  // Ir para qualquer posição: anterior, próxima, pelo mapa ou pela revisão.
  // Respondendo, a questão volta com a marcação; corrigindo, com o gabarito.
  const irPara = (idx) => {
    if (!quest.quiz || idx < 0 || idx >= quest.quiz.length) return;
    acumularTempo();
    setQuest({ idx, revisando: false, selectedAlt: quest.done ? (conferidas[idx] ?? null) : null });
  };

  const abrirRevisao = () => {
    acumularTempo();
    setQuest({ revisando: true });
  };

  const previousQuestion = () => irPara(quest.idx - 1);
  const nextQuestion = () => {
    if (quest.idx + 1 < (quest.quiz?.length || 0)) irPara(quest.idx + 1);
    else if (respondendo) abrirRevisao();
  };

  const finalizar = () => {
    acumularTempo();
    const novas = {};
    let certas = 0, erradas = 0;
    for (const [chave, alt] of Object.entries(marcadas)) {
      const pos = Number(chave);
      const q = quest.quiz[pos];
      if (!q || alt == null) continue;
      const correta = alt === q.correta;
      novas[pos] = alt;
      if (correta) certas += 1; else erradas += 1;
      const ms = tempos.current[pos];
      // A tela muda na hora; cada registro vai junto e, se falhar, o App avisa.
      registrar({ questaoId: q.id, correta, alternativa: alt, tempoSeg: ms ? Math.round(ms / 1000) : null });
    }
    setQuest({ conferidas: novas, certas, erradas, done: true, revisando: false, corrigindo: false, selectedAlt: null });
  };

  const verCorrecao = (idx) => setQuest({ corrigindo: true, idx, selectedAlt: conferidas[idx] ?? null });
  const voltarAoResultado = () => setQuest({ corrigindo: false });

  const respondidas = Object.values(marcadas).filter((a) => a != null).length;

  // Teclado: ← → navegam (respondendo e corrigindo), A–D ou 1–4 marcam.
  // Sem lista de dependências de propósito: o ouvinte é trocado a cada render
  // e sempre vê o estado atual — é um ouvinte só, e trocar custa nada.
  useEffect(() => {
    if (!respondendo && !corrigindo) return undefined;
    const aoTeclar = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const alvo = e.target;
      if (alvo && (alvo.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(alvo.tagName))) return;
      const q = quest.quiz[quest.idx];
      if (!q) return;
      const tecla = e.key.toLowerCase();
      const porLetra = 'abcde'.indexOf(tecla);
      const alt = porLetra >= 0 ? porLetra : '12345'.indexOf(tecla);
      if (e.key === 'ArrowLeft') previousQuestion();
      else if (e.key === 'ArrowRight') nextQuestion();
      else if (respondendo && alt >= 0 && alt < (q.alternativas || []).length) marcar(alt);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  });

  // Cada troca de questão ou de etapa (revisão, resultado, correção) volta ao
  // topo da coluna: a rolagem é do contêiner do App e sobrevive à troca, e a
  // pessoa caía no meio da lista longa da etapa anterior.
  const colunaDoQuiz = useRef(null);
  useEffect(() => {
    colunaDoQuiz.current?.scrollIntoView?.({ block: 'start' });
  }, [quest.idx, quest.revisando, quest.done, quest.corrigindo]);

  let current = null, alternativas = [], dificuldadePill = {};
  if (respondendo || corrigindo) current = quest.quiz[quest.idx];

  const doCartao = current && cartao.questaoId === current.id ? cartao : { riscadas: [], historicoAberto: false };
  const atualizarCartao = (mudanca) => setCartao({ ...doCartao, ...mudanca, questaoId: current.id });

  // Riscar não responde nem seleciona: a alternativa riscada continua
  // clicável e vale como resposta se a pessoa clicar nela. Travar o clique
  // obrigaria a desfazer o risco antes de mudar de ideia — e o risco é só
  // anotação visual.
  const alternarRiscoDe = (i) => atualizarCartao({ riscadas: alternarRisco(doCartao.riscadas, i) });

  // Tentativas anteriores desta questão, pelo id do acervo — a mesma chave que
  // `registrar` usa. A resposta dada agora também entra assim que o servidor
  // confirma: o selo passa a dizer a data de hoje, que é verdade.
  const historico = current ? historicoDaQuestao(usuarioTentativas, current.id) : null;

  if (current) {
    if (current.dificuldade) {
      dificuldadePill = s.pill('#faf9f6', DIFICULDADE_COR[current.dificuldade] || '#7a766f');
    }
    // Corrigindo, a questão está "respondida" mesmo em branco: o gabarito
    // aparece igual, só sem alternativa da pessoa para marcar de vermelho.
    const answered = corrigindo;
    const dada = corrigindo ? conferidas[quest.idx] : undefined;
    const marcadaAqui = respondendo ? marcadas[quest.idx] : undefined;
    alternativas = (current.alternativas || []).map((texto, i) => {
      const isCorrect = i === current.correta;
      const isSelected = i === dada;
      const riscada = doCartao.riscadas.includes(i);
      let bg = '#fff', border = '#e6e2da', icon = null, show = false, radioBorder = '2px solid #d6d1c8';
      if (!answered && i === marcadaAqui) { bg = theme.primarySoft; border = theme.primary; radioBorder = `5px solid ${theme.primary}`; }
      if (answered) {
        if (isCorrect) { bg = '#E4EEE1'; border = '#4A7A4A'; icon = <Icon name="check" color="#4A7A4A" size={18} />; show = true; radioBorder = '5px solid #4A7A4A'; }
        else if (isSelected) { bg = '#F6E4E1'; border = '#B4413A'; icon = <Icon name="x" color="#B4413A" size={18} />; show = true; radioBorder = '5px solid #B4413A'; }
      }
      return {
        texto, i, showIcon: show, icon, answered, riscada,
        marcada: !answered && i === marcadaAqui,
        escolhida: answered ? isSelected : i === marcadaAqui,
        // O `--ordem` alimenta o atraso escalonado da entrada, e as duas cores
        // de foco alimentam o :hover — que mora no CSS porque objeto de estilo
        // inline não tem pseudo-classe. Escrever `':hover'` num style do React
        // não é erro de sintaxe: é uma chave ignorada em silêncio.
        style: {
          '--ordem': i,
          '--cor-foco': theme.primary,
          '--cor-foco-suave': theme.primarySoft,
          display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px', borderRadius: 10,
          border: `1px solid ${border}`, background: bg, cursor: answered ? 'default' : 'pointer',
        },
        radioStyle: { width: 18, height: 18, borderRadius: '50%', flex: 'none', border: radioBorder, background: '#fff', boxSizing: 'border-box' },
      };
    });
  }

  const total = quest.quiz ? quest.quiz.length : 0;
  const position = Math.min(quest.idx + 1, total);
  const scorePct = total ? Math.round(quest.certas / total * 100) : 0;

  const semQuiz = !quizActive && !quizDone;
  const brancas = total - respondidas;
  const letra = (i) => String.fromCharCode(65 + i);

  return (
    <div>
      <div ref={colunaDoQuiz} style={{ display: 'flex', flexDirection: 'column', gap: 16, scrollMarginTop: 24 }}>
        {semQuiz && estado === 'carregando' && <Esqueleto s={s} />}

        {semQuiz && estado === 'erro' && (
          <Aviso
            s={s}
            icone="circle-x"
            cor="#A33A32"
            titulo="O acervo não carregou"
            texto={`${acervo.erro}. As questões vêm do servidor, então sem esta chamada não há o que estudar.`}
            acao={{ rotulo: 'Tentar de novo', onClick: recarregarAcervo }}
          />
        )}

        {semQuiz && estado === 'pronto' && all.length === 0 && (
          <Aviso
            s={s}
            icone="book-open"
            cor="#6b6760"
            titulo="O acervo ainda está vazio"
            texto="Nenhuma prova foi carregada até agora. As questões vêm dos cadernos e gabaritos publicados pela FGV, importados prova a prova."
          />
        )}

        {semQuiz && estado === 'pronto' && all.length > 0 && (
          <div className="entra" data-testid="meta-do-dia" style={{ ...s.card, padding: 28, maxWidth: 640 }}>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '1.2px', textTransform: 'uppercase', color: theme.accent }}>
              {meta.batida ? 'Meta de hoje batida' : 'Meta de hoje'}
            </div>
            <div data-testid="titulo-da-meta" style={{ ...s.pageTitle, fontSize: 26, marginTop: 8 }}>
              {meta.batida && 'Mais '}{tamanho} {tamanho === 1 ? 'questão' : 'questões'}
              {nomeDaMateria && <> de {nomeDaMateria}</>}
            </div>
            <div style={{ fontSize: 13.5, color: '#7a766f', marginTop: 6, lineHeight: 1.55, textWrap: 'pretty' }}>
              {escolhidaFora
                ? 'Matéria escolhida por você, no lugar da do plano.'
                : materiaDeHoje?.motivo
                  ? `Do seu plano de estudo: ${materiaDeHoje.motivo}.`
                  : 'Questões dos Exames de Ordem, com o gabarito oficial da FGV.'}
            </div>

            <div style={{ marginTop: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#7a766f', marginBottom: 6, fontVariantNumeric: 'tabular-nums' }}>
                <span>Feitas hoje</span>
                <span>{meta.respondidas} de {meta.meta}</span>
              </div>
              <div style={s.progressTrack}>
                <div style={{ height: '100%', width: `${Math.min(100, Math.round((meta.respondidas / Math.max(1, meta.meta)) * 100))}%`, background: theme.primary, borderRadius: 3 }} />
              </div>
            </div>

            {escolhidaFora && (
              <div data-testid="filtro-materia" style={{ marginTop: 14, fontSize: 12.5, color: '#4f4b45' }}>
                Você escolheu {nomeDaMateria}.{' '}
                <button
                  type="button"
                  data-testid="limpar-filtro"
                  style={{ background: 'none', border: 'none', padding: 0, color: theme.primary, fontSize: 12.5, fontWeight: 600 }}
                  onClick={voltarAoPlano}
                >
                  {doPlano.length > 0 ? `Voltar para ${rotuloDe(doPlano[0])}` : 'Voltar à meta geral'}
                </button>
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 22, flexWrap: 'wrap' }}>
              <button
                data-testid="gerar-quiz"
                style={{ ...s.btnPrimary, padding: '11px 20px', fontSize: 13.5, opacity: availablePool.length === 0 ? 0.5 : 1, cursor: availablePool.length === 0 ? 'not-allowed' : 'pointer' }}
                onClick={startQuiz}
                disabled={availablePool.length === 0}
              >
                <Icon name="play" color="#fff" size={14} /> Começar ({tamanho} {tamanho === 1 ? 'questão' : 'questões'})
              </button>
              {/* Quando a matéria tem menos questões que a meta, o número do
                  botão não bate com o que falta — e precisa dizer por quê. */}
              <div data-testid="tamanho-do-quiz" style={{ fontSize: 12, color: '#7a766f', lineHeight: 1.5 }}>
                {availablePool.length < tamanhoAlvo && `${nomeDaMateria || 'O acervo'} tem só ${availablePool.length}. `}
                Nunca respondidas vêm primeiro.
              </div>
            </div>
          </div>
        )}

        {current && (
          <div style={s.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              {corrigindo ? (
                <button type="button" data-testid="voltar-resultado" style={{ background: 'none', border: 'none', color: theme.primary, fontSize: 13, fontWeight: 600 }} onClick={voltarAoResultado}>← Voltar ao resultado</button>
              ) : (
                <button type="button" style={{ background: 'none', border: 'none', color: theme.primary, fontSize: 13, fontWeight: 600 }} onClick={exitQuiz}>← Encerrar quiz</button>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ fontSize: 12.5, color: '#7a766f', fontVariantNumeric: 'tabular-nums' }}>Questão {position} de {total}</div>
                {respondendo && (
                  <button type="button" data-testid="revisar-respostas" style={{ ...s.btnOutline, padding: '5px 10px', fontSize: 12 }} onClick={abrirRevisao}>
                    Revisar e finalizar
                  </button>
                )}
              </div>
            </div>
            <div style={{ ...s.progressTrack, marginTop: 10 }}>
              {/* A barra é a única coisa aqui que anima largura, e é de
                  propósito: ela mede progresso, e a transição é a informação. */}
              <div style={{ width: total ? (position / total * 100) + '%' : '0%', height: '100%', background: theme.primary, borderRadius: 5, transition: 'width 260ms var(--ease-out)' }} />
            </div>

            {/* Mapa do quiz: um quadradinho por questão. Respondendo, ele diz
                só o que foi marcado — o gabarito ainda não existe para a
                pessoa. Corrigindo, diz o que acertou, errou ou deixou em
                branco. Clicar leva direto à questão. */}
            <nav data-testid="mapa-quiz" aria-label="Questões do quiz" style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 12 }}>
              {quest.quiz.map((q, pos) => {
                const estadoPos = corrigindo
                  ? (conferidas[pos] == null ? 'branco' : conferidas[pos] === q.correta ? 'certa' : 'errada')
                  : (marcadas[pos] != null ? 'marcada' : 'vazia');
                const cores = {
                  certa: { background: '#4A7A4A', color: '#fff', border: '1px solid #3E6B3E' },
                  errada: { background: '#B4413A', color: '#fff', border: '1px solid #9E3630' },
                  branco: { background: '#eeebe5', color: '#7a766f', border: '1px solid #e6e2da' },
                  marcada: { background: theme.primary, color: '#fff', border: `1px solid ${theme.primaryDark}` },
                  vazia: { background: '#fff', color: '#7a766f', border: '1px solid #e6e2da' },
                }[estadoPos];
                const rotulo = { certa: 'certa', errada: 'errada', branco: 'em branco', marcada: 'respondida', vazia: 'sem resposta' }[estadoPos];
                const atual = pos === quest.idx;
                return (
                  <button
                    key={q.id}
                    type="button"
                    data-testid={`mapa-${pos}`}
                    data-estado={estadoPos}
                    aria-label={`Questão ${pos + 1}: ${rotulo}`}
                    aria-current={atual ? 'step' : undefined}
                    title={`Questão ${pos + 1}: ${rotulo}`}
                    onClick={() => irPara(pos)}
                    style={{
                      ...cores, width: 24, height: 24, padding: 0, borderRadius: 6, fontSize: 10.5, fontWeight: 600,
                      fontVariantNumeric: 'tabular-nums', boxShadow: atual ? `0 0 0 2px #fff, 0 0 0 3.5px ${theme.primaryDark}` : 'none',
                    }}
                  >
                    {pos + 1}
                  </button>
                );
              })}
            </nav>

            {/* A `key` com o id da questão é o que faz a entrada tocar a cada
                questão nova: sem ela o React reaproveitaria o nó e o conteúdo
                trocaria sem transição nenhuma. */}
            <div key={current.id} className="entra">
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16, paddingBottom: 14, borderBottom: '1px solid #eeebe5', flexWrap: 'wrap' }}>
                <span style={{ background: theme.primarySoft, color: theme.primaryDark, fontWeight: 700, fontSize: 12.5, padding: '5px 14px', borderRadius: 8 }}>
                  Questão {position}
                </span>
                {/* Procedência real, vinda do acervo. O rótulo antigo era um
                    texto montado ("PROVA-FGV-BR/2023") que parecia um código
                    oficial sem ser um. */}
                <OrigemDaQuestao questao={current} />
                <TrilhaDaQuestao s={s} theme={theme} questao={current} />
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, marginLeft: 'auto', flexWrap: 'wrap' }}>
                  <SeloRespondida
                    s={s}
                    theme={theme}
                    historico={historico}
                    aberto={doCartao.historicoAberto}
                    onAlternar={() => atualizarCartao({ historicoAberto: !doCartao.historicoAberto })}
                    idLista={idHistorico}
                  />
                  {current.dificuldade && <span style={dificuldadePill}>{current.dificuldade}</span>}
                </span>
              </div>
              {/* Fechado por padrão: aberto antes de responder, ele mostra se
                  as tentativas anteriores acertaram e com qual letra. Quem
                  quer ver clica; quem não quer não leva o gabarito de brinde. */}
              {doCartao.historicoAberto && historico?.total > 0 && <ListaDoHistorico historico={historico} id={idHistorico} />}
              <div data-testid="enunciado" style={{ fontSize: 15, color: '#1c1b19', lineHeight: 1.65, marginTop: 16, whiteSpace: 'pre-wrap' }}>{current.enunciado}</div>

              <div role="radiogroup" aria-label="Alternativas" style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 18 }}>
                {alternativas.map((alt) => (
                  <div
                    key={`${current.id}-${alt.i}`}
                    className="alternativa"
                    data-clicavel={alt.answered ? 'nao' : 'sim'}
                    data-testid={`alt-${alt.i}`}
                    data-marcada={alt.marcada ? 'sim' : 'nao'}
                    role="radio"
                    aria-checked={alt.escolhida}
                    style={alt.style}
                    onClick={() => marcar(alt.i)}
                  >
                    <div style={alt.radioStyle} />
                    <b style={{ fontSize: 13.5, color: '#7a766f', flex: 'none', opacity: alt.riscada ? 0.5 : 1 }}>{letra(alt.i)})</b>
                    <div
                      data-riscada={alt.riscada ? 'sim' : 'nao'}
                      style={{ flex: 1, fontSize: 13.5, textDecoration: alt.riscada ? 'line-through' : 'none', opacity: alt.riscada ? 0.5 : 1 }}
                    >
                      {alt.texto}
                    </div>
                    {alt.showIcon && alt.icon}
                    <BotaoRiscar theme={theme} indice={alt.i} riscada={alt.riscada} onAlternar={alternarRiscoDe} />
                  </div>
                ))}
              </div>
            </div>

            {/* Veredito e gabarito comentado: só na correção, depois de
                finalizar. Mostrar antes entregaria a resposta. */}
            {corrigindo && (() => {
              const dada = conferidas[quest.idx];
              const tipo = dada == null ? 'branco' : dada === current.correta ? 'certa' : 'errada';
              const cor = { certa: '#3E6B3E', errada: '#9E3630', branco: '#5f5b55' }[tipo];
              return (
                <div data-testid="veredito" className="entra" style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 18, fontSize: 15, fontWeight: 700, color: cor }}>
                  <Icon name={tipo === 'certa' ? 'circle-check' : tipo === 'errada' ? 'circle-x' : 'clock'} color={cor} size={20} />
                  {tipo === 'certa' ? 'Acertou!' : tipo === 'errada' ? 'Errou' : 'Em branco'}
                  {tipo !== 'certa' && (
                    <span style={{ fontSize: 13, fontWeight: 500, color: '#5f5b55' }}>· gabarito: alternativa {letra(current.correta)}</span>
                  )}
                </div>
              );
            })()}

            {/* A explicação vem assinada por quem escreveu — a da IA, pelo
                assistente (lib/assistente.js). O prefixo da `key` não é enfeite: o
                bloco do enunciado, irmão deste, já usa `current.id`, e duas
                chaves iguais entre irmãos deixavam a questão anterior na tela. */}
            {corrigindo && current.explicacao && (
              <GabaritoComentado
                key={`gabarito-${current.id}`}
                className="entra"
                s={s}
                questao={current}
                style={{ marginTop: 18, padding: 16, borderRadius: 12, background: '#faf9f6', border: '1px solid #eeebe5' }}
              >
                <div style={{ fontSize: 11.5, color: '#7a766f', marginTop: 10 }}>
                  Gabarito oficial: alternativa {letra(current.correta)}.
                </div>
              </GabaritoComentado>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginTop: 20, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 12.5, color: '#7a766f', fontVariantNumeric: 'tabular-nums' }}>
                {corrigindo ? (
                  <>Acertos: <b style={{ color: '#4A7A4A' }}>{quest.certas}</b> · Erros: <b style={{ color: '#B4413A' }}>{quest.erradas}</b> · Em branco: <b>{brancas}</b></>
                ) : (
                  <>Respondidas: <b style={{ color: '#1c1b19' }}>{respondidas}</b> de {total}</>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {quest.idx > 0 && (
                  <button type="button" data-testid="questao-anterior" style={s.btnOutline} onClick={previousQuestion} title="Questão anterior (←)">
                    ← Anterior
                  </button>
                )}
                {quest.idx + 1 < total ? (
                  <button type="button" data-testid="proxima-questao" style={s.btnPrimary} onClick={nextQuestion} title="Próxima questão (→)">
                    Próxima →
                  </button>
                ) : respondendo ? (
                  <button type="button" data-testid="proxima-questao" style={s.btnPrimary} onClick={abrirRevisao}>
                    Revisar respostas →
                  </button>
                ) : (
                  <button type="button" data-testid="proxima-questao" style={s.btnPrimary} onClick={voltarAoResultado}>
                    Voltar ao resultado
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {revisando && (
          <div data-testid="tela-revisao" className="entra" style={s.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <div style={{ ...s.pageTitle, fontSize: 22 }}>Revise antes de finalizar</div>
                <div style={{ fontSize: 13, color: '#7a766f', marginTop: 6, maxWidth: 560, lineHeight: 1.5 }}>
                  Clique numa questão para voltar a ela e mudar a resposta. O gabarito só aparece depois de finalizar.
                </div>
              </div>
              <div style={{ fontSize: 13, color: '#4f4b45', fontVariantNumeric: 'tabular-nums' }}>
                <b style={{ color: '#1c1b19' }}>{respondidas}</b> de {total} respondidas
              </div>
            </div>

            {brancas > 0 && (
              <div data-testid="aviso-em-branco" style={{ marginTop: 16, padding: '12px 14px', borderRadius: 8, background: theme.accentSoft, borderLeft: `3px solid ${theme.accent}`, fontSize: 13, color: '#1c1b19', lineHeight: 1.5 }}>
                <b>{brancas} {brancas === 1 ? 'questão em branco' : 'questões em branco'}.</b>{' '}
                Questão em branco não entra no seu histórico e conta como não acertada no resultado.
              </div>
            )}

            <ol style={{ listStyle: 'none', margin: '16px 0 0', padding: 0, display: 'flex', flexDirection: 'column', borderTop: '1px solid #eeebe5' }}>
              {quest.quiz.map((q, pos) => {
                const alt = marcadas[pos];
                return (
                  <li key={q.id} style={{ borderBottom: '1px solid #eeebe5' }}>
                    <button
                      type="button"
                      data-testid={`revisao-${pos}`}
                      className="linha-fonte"
                      onClick={() => irPara(pos)}
                      style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '10px 8px', border: 'none', background: 'transparent', textAlign: 'left', borderRadius: 6 }}
                    >
                      <span style={{ width: 28, flex: 'none', fontSize: 12.5, fontWeight: 600, color: '#7a766f', fontVariantNumeric: 'tabular-nums' }}>{pos + 1}</span>
                      <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: '#4f4b45', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {q.disciplina && <b style={{ color: '#1c1b19', fontWeight: 600 }}>{q.disciplina} · </b>}{q.enunciado}
                      </span>
                      {alt != null ? (
                        <span style={s.pill(theme.primarySoft, theme.primaryDark)}>Marcou {letra(alt)}</span>
                      ) : (
                        <span style={s.pill('#f1efea', '#7a766f')}>Em branco</span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ol>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18, flexWrap: 'wrap' }}>
              <button type="button" data-testid="voltar-questoes" style={s.btnOutline} onClick={() => irPara(quest.idx)}>
                ← Voltar às questões
              </button>
              <button type="button" data-testid="finalizar-quiz" style={s.btnPrimary} onClick={finalizar}>
                Finalizar e conferir
              </button>
            </div>
          </div>
        )}

        {quizDone && !corrigindo && (
          <div className="entra" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ ...s.card, padding: '36px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
              <div style={{ width: 52, height: 52, borderRadius: 10, background: '#8A6D1F', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto' }}>
                <Icon name="trophy" color="#fff" size={24} />
              </div>
              <div style={{ fontSize: 19, fontWeight: 700, color: '#1c1b19', marginTop: 14 }}>Quiz concluído!</div>
              <div style={{ fontSize: 13.5, color: '#7a766f', marginTop: 6 }}>Você acertou {quest.certas} de {total} questões ({scorePct}%)</div>
              <div data-testid="resumo-resultado" style={{ fontSize: 12.5, color: '#7a766f', marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>
                {quest.erradas} {quest.erradas === 1 ? 'errada' : 'erradas'} · {total - quest.certas - quest.erradas} em branco
                {total - quest.certas - quest.erradas > 0 && ' (não entraram no histórico)'}
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 18, flexWrap: 'wrap', justifyContent: 'center' }}>
                <button type="button" data-testid="ver-correcao" style={{ ...s.btnPrimary, padding: '11px 20px', fontSize: 13.5 }} onClick={() => verCorrecao(0)}>
                  Ver correção questão a questão
                </button>
                <button type="button" style={{ ...s.btnOutline, padding: '10px 18px', fontSize: 13.5 }} onClick={exitQuiz}>
                  Montar novo quiz
                </button>
              </div>
            </div>

            <div style={s.card}>
              <div style={s.sectionTitle}>Gabarito</div>
              <ol style={{ listStyle: 'none', margin: '12px 0 0', padding: 0, display: 'flex', flexDirection: 'column', borderTop: '1px solid #eeebe5' }}>
                {quest.quiz.map((q, pos) => {
                  const dada = conferidas[pos];
                  const tipo = dada == null ? 'branco' : dada === q.correta ? 'certa' : 'errada';
                  const icone = { certa: ['circle-check', '#4A7A4A'], errada: ['circle-x', '#B4413A'], branco: ['clock', '#9a958d'] }[tipo];
                  return (
                    <li key={q.id} style={{ borderBottom: '1px solid #eeebe5' }}>
                      <button
                        type="button"
                        data-testid={`corrigir-${pos}`}
                        data-estado={tipo}
                        className="linha-fonte"
                        onClick={() => verCorrecao(pos)}
                        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '10px 8px', border: 'none', background: 'transparent', textAlign: 'left', borderRadius: 6 }}
                      >
                        <Icon name={icone[0]} color={icone[1]} size={18} />
                        <span style={{ width: 24, flex: 'none', fontSize: 12.5, fontWeight: 600, color: '#7a766f', fontVariantNumeric: 'tabular-nums' }}>{pos + 1}</span>
                        <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: '#4f4b45', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {q.disciplina && <b style={{ color: '#1c1b19', fontWeight: 600 }}>{q.disciplina} · </b>}{q.enunciado}
                        </span>
                        <span style={{ flex: 'none', fontSize: 12, color: '#5f5b55', fontVariantNumeric: 'tabular-nums' }}>
                          {dada == null ? 'Em branco' : `Sua: ${letra(dada)}`} · Gabarito: <b style={{ color: '#1c1b19' }}>{letra(q.correta)}</b>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
