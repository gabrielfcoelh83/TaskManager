import { useEffect, useState } from 'react';
import { Icon } from '../lib/icons';
import { embaralhar, montarFontes } from '../lib/questions/acervo';

const DIFICULDADE_COR = { 'Fácil': '#10B981', 'Média': '#F59E0B', 'Difícil': '#EF4444' };

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
      style={{ background: '#fff', border: '1px solid rgba(0,0,0,.05)', borderRadius: 18, padding: '48px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}
    >
      <div style={{ width: 72, height: 72, borderRadius: 22, background: cor, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icone} color="#fff" size={34} />
      </div>
      <div style={{ fontSize: 19, fontWeight: 700, color: '#2c2530', marginTop: 14 }}>{titulo}</div>
      <div style={{ fontSize: 13.5, color: '#8b8391', marginTop: 6, maxWidth: 440, lineHeight: 1.55 }}>{texto}</div>
      {acao && (
        <button style={{ ...s.btnPrimary, marginTop: 18, padding: '12px 22px', fontSize: 13.5 }} onClick={acao.onClick}>
          {acao.rotulo}
        </button>
      )}
    </div>
  );
}

export default function Questoes({ theme, s, data, quest, setQuest, registrar, anotarFeedback, acervo, recarregarAcervo }) {
  const [tempoInicio, setTempoInicio] = useState(null);
  const [feedbackAberto, setFeedbackAberto] = useState(null);

  const all = data.QUESTOES || [];
  const estado = acervo?.estado || 'pronto';

  // O cronômetro de cada questão. Antes ele só começava a contar em
  // `startQuiz`, o que deixava sem tempo todo quiz que NÃO nasce aqui — o
  // "Revisar agora" das Revisões e o "Estudar" das Disciplinas montam o quiz
  // de fora, e as respostas iam para o servidor com `tempo_seg` nulo.
  useEffect(() => {
    if (quest.quiz && !quest.done && quest.selectedAlt === null) setTempoInicio(Date.now());
  }, [quest.quiz, quest.idx, quest.selectedAlt, quest.done]);

  const { criterio, chaveDe, fontes } = montarFontes(all);
  const chaves = fontes.map((f) => f.chave);
  const selected = quest.selected ?? chaves;

  const toggleSource = (chave) => {
    const next = selected.includes(chave) ? selected.filter((n) => n !== chave) : [...selected, chave];
    setQuest({ selected: next });
  };

  const toggleAll = () => {
    setQuest({ selected: selected.length === chaves.length ? [] : chaves });
  };

  const availablePool = all.filter((q) => selected.includes(chaveDe(q)));

  const startQuiz = () => {
    setQuest({ quiz: embaralhar(availablePool), idx: 0, selectedAlt: null, certas: 0, erradas: 0, done: false });
    setTempoInicio(Date.now());
  };

  const exitQuiz = () => {
    setQuest({ quiz: null, idx: 0, selectedAlt: null, certas: 0, erradas: 0, done: false });
    setTempoInicio(null);
    setFeedbackAberto(null);
  };

  const pickAlt = (i) => {
    if (quest.selectedAlt !== null) return;
    const q = quest.quiz[quest.idx];
    const correct = i === q.correta;

    // tempoInicio é null se o quiz foi retomado sem passar por startQuiz;
    // mandar um tempo inventado seria pior que mandar nulo.
    const tempoGasto = tempoInicio === null ? null : Math.round((Date.now() - tempoInicio) / 1000);

    // A alternativa marca a tela imediatamente — travar a interface até o
    // servidor responder faria o quiz parecer quebrado numa rede ruim. O
    // registro vai junto e, se falhar, o App avisa em vez de fingir que salvou.
    setQuest({ selectedAlt: i, certas: quest.certas + (correct ? 1 : 0), erradas: quest.erradas + (correct ? 0 : 1) });
    setFeedbackAberto(q.id);

    registrar({ questaoId: q.id, correta: correct, alternativa: i, tempoSeg: tempoGasto });
  };

  const avancarProxima = (tipo, certeza) => {
    const q = quest.quiz[quest.idx];
    // `anotarFeedback` é assíncrona e trata os próprios erros; o `.catch`
    // aqui não é redundância, é contrato: sem ele, qualquer erro futuro que
    // escape do try interno vira unhandledrejection silencioso — sem log,
    // sem aviso na tela e sem teste que perceba.
    anotarFeedback(q.id, tipo, certeza).catch(() => {});
    setFeedbackAberto(null);
    nextQuestion();
  };

  const nextQuestion = () => {
    const nextIdx = quest.idx + 1;
    if (nextIdx >= quest.quiz.length) setQuest({ done: true });
    else {
      setQuest({ idx: nextIdx, selectedAlt: null });
      setTempoInicio(Date.now());
    }
  };

  const quizActive = !!quest.quiz && !quest.done;
  const quizDone = !!quest.quiz && quest.done;

  let current = null, alternativas = [], dificuldadePill = {};
  if (quizActive) {
    current = quest.quiz[quest.idx];
    if (current?.dificuldade) {
      dificuldadePill = s.pill('#faf9fb', DIFICULDADE_COR[current.dificuldade] || '#8b8391');
    }
    const answered = quest.selectedAlt !== null;
    alternativas = (current?.alternativas || []).map((texto, i) => {
      const isCorrect = i === current.correta;
      const isSelected = i === quest.selectedAlt;
      let bg = '#fff', border = '#e3e7ee', icon = null, show = false, radioBorder = '2px solid #cfd6e0';
      if (answered) {
        if (isCorrect) { bg = '#D1FAE5'; border = '#10B981'; icon = <Icon name="check" color="#10B981" size={18} />; show = true; radioBorder = '5px solid #10B981'; }
        else if (isSelected) { bg = '#FEE2E2'; border = '#EF4444'; icon = <Icon name="x" color="#EF4444" size={18} />; show = true; radioBorder = '5px solid #EF4444'; }
      }
      return {
        texto, i, showIcon: show, icon, answered,
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

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '270px 1fr', gap: 18, alignItems: 'start', height: '100%' }}>
      <div style={{ ...s.card, padding: 16, position: 'sticky', top: 0 }}>
        <div style={{ ...s.sectionTitle, fontSize: 14 }}>
          <Icon name="library" color={theme.primary} size={20} />
          {criterio === 'disciplina' ? 'Disciplinas' : 'Provas'}
        </div>
        <div style={{ fontSize: 11.5, color: '#8b8391', marginTop: 4 }}>
          {criterio === 'disciplina' ? 'Selecione as fontes do seu quiz' : 'Selecione as provas do seu quiz'}
        </div>

        {estado === 'carregando' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 14 }}>
            {[0, 1, 2].map((i) => <div key={i} className="esqueleto" style={{ height: 46 }} />)}
          </div>
        )}

        {estado !== 'carregando' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 14 }}>
            {fontes.map((fonte) => {
              const on = selected.includes(fonte.chave);
              return (
                <div
                  key={fonte.chave}
                  data-testid={`fonte-${fonte.chave}`}
                  onClick={() => toggleSource(fonte.chave)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', borderRadius: 10, cursor: 'pointer', background: on ? theme.primarySoft : '#faf9fb' }}
                >
                  <div style={{ width: 18, height: 18, borderRadius: 5, border: `1.5px solid ${on ? theme.primary : '#d5d0da'}`, background: on ? theme.primary : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
                    {on && <Icon name="check" color="#fff" size={12} />}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: '#2c2530', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{fonte.rotulo}</div>
                    <div style={{ fontSize: 10.5, color: '#8b8391' }}>
                      {fonte.total} {fonte.total === 1 ? 'questão' : 'questões'}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {fontes.length > 0 && (
          <button
            data-testid="selecionar-todas"
            style={{ width: '100%', marginTop: 14, background: '#fff', border: `1px solid ${theme.primarySoft}`, color: theme.primary, borderRadius: 9, padding: 8, fontSize: 12, fontWeight: 600 }}
            onClick={toggleAll}
          >
            {selected.length === chaves.length ? 'Limpar seleção' : 'Selecionar todas'}
          </button>
        )}

        {criterio === 'exame' && fontes.length > 0 && (
          <div style={{ fontSize: 10.5, color: '#8b8391', marginTop: 12, lineHeight: 1.5 }}>
            O filtro por matéria aparece assim que as questões forem classificadas.
          </div>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {semQuiz && estado === 'carregando' && <Esqueleto s={s} />}

        {semQuiz && estado === 'erro' && (
          <Aviso
            s={s}
            icone="circle-x"
            cor="linear-gradient(135deg, #F87171, #DC2626)"
            titulo="O acervo não carregou"
            texto={`${acervo.erro}. As questões vêm do servidor, então sem esta chamada não há o que estudar.`}
            acao={{ rotulo: 'Tentar de novo', onClick: recarregarAcervo }}
          />
        )}

        {semQuiz && estado === 'pronto' && all.length === 0 && (
          <Aviso
            s={s}
            icone="book-open"
            cor="linear-gradient(135deg, #9CA3AF, #6B7280)"
            titulo="O acervo ainda está vazio"
            texto="Nenhuma prova foi carregada até agora. As questões vêm dos cadernos e gabaritos publicados pela FGV, importados prova a prova."
          />
        )}

        {semQuiz && estado === 'pronto' && all.length > 0 && (
          <div
            className="entra"
            style={{ background: '#fff', border: '1px solid rgba(0,0,0,.05)', borderRadius: 18, padding: '48px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}
          >
            <div style={{ width: 72, height: 72, borderRadius: 22, background: `linear-gradient(135deg, ${theme.gradA}, ${theme.gradB})`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto' }}>
              <Icon name="brain" color="#fff" size={34} />
            </div>
            <div style={{ fontSize: 19, fontWeight: 700, color: '#2c2530', marginTop: 14 }}>Monte seu quiz</div>
            <div style={{ fontSize: 13.5, color: '#8b8391', marginTop: 6, maxWidth: 440, textAlign: 'center', lineHeight: 1.55 }}>
              Questões dos Exames de Ordem, com o gabarito oficial da FGV. Escolha as fontes ao lado.
            </div>
            <div style={{ fontSize: 12.5, color: '#5c5462', marginTop: 14 }}>
              {selected.length === 0
                ? 'Nenhuma fonte selecionada'
                : `${selected.length} de ${fontes.length} ${criterio === 'disciplina' ? 'disciplina(s)' : 'prova(s)'}`}
            </div>
            <button
              data-testid="gerar-quiz"
              style={{ ...s.btnPrimary, marginTop: 18, padding: '12px 22px', fontSize: 13.5, opacity: availablePool.length === 0 ? 0.5 : 1, cursor: availablePool.length === 0 ? 'not-allowed' : 'pointer' }}
              onClick={startQuiz}
              disabled={availablePool.length === 0}
            >
              <Icon name="play" color="#fff" size={14} /> Gerar quiz ({availablePool.length} questões)
            </button>
          </div>
        )}

        {quizActive && current && (
          <div style={s.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button style={{ background: 'none', border: 'none', color: theme.primary, fontSize: 13, fontWeight: 600 }} onClick={exitQuiz}>← Encerrar quiz</button>
              <div style={{ fontSize: 12.5, color: '#8b8391' }}>Questão {position} de {total}</div>
            </div>
            <div style={{ ...s.progressTrack, marginTop: 10 }}>
              {/* A barra é a única coisa aqui que anima largura, e é de
                  propósito: ela mede progresso, e a transição é a informação. */}
              <div style={{ width: total ? (position / total * 100) + '%' : '0%', height: '100%', background: `linear-gradient(90deg, ${theme.gradA}, ${theme.gradB})`, borderRadius: 5, transition: 'width 260ms var(--ease-out)' }} />
            </div>

            {/* A `key` com o id da questão é o que faz a entrada tocar a cada
                questão nova: sem ela o React reaproveitaria o nó e o conteúdo
                trocaria sem transição nenhuma. */}
            <div key={current.id} className="entra">
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16, paddingBottom: 14, borderBottom: '1px solid #eef0f4', flexWrap: 'wrap' }}>
                <span style={{ background: theme.primarySoft, color: theme.primaryDark, fontWeight: 700, fontSize: 12.5, padding: '5px 14px', borderRadius: 8 }}>
                  Questão {position}
                </span>
                {/* Procedência real, vinda do acervo. O rótulo antigo era um
                    texto montado ("PROVA-FGV-BR/2023") que parecia um código
                    oficial sem ser um. */}
                <span style={{ fontSize: 11.5, color: '#8b93a1', fontWeight: 600 }}>
                  {current.exame ? `${current.exame}º Exame de Ordem` : 'Exame de Ordem'}
                  {current.numero ? ` · questão ${current.numero}` : ''}
                  {current.banca ? ` · ${current.banca}` : ''}
                </span>
                {current.disciplina && (
                  <span data-testid="disciplina-da-questao" style={s.pill(theme.primarySoft, theme.primaryDark)}>{current.disciplina}</span>
                )}
                {current.dificuldade && <span style={{ ...dificuldadePill, marginLeft: 'auto' }}>{current.dificuldade}</span>}
              </div>
              <div data-testid="enunciado" style={{ fontSize: 15, color: '#2c2530', lineHeight: 1.65, marginTop: 16, whiteSpace: 'pre-wrap' }}>{current.enunciado}</div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 18 }}>
                {alternativas.map((alt) => (
                  <div
                    key={`${current.id}-${alt.i}`}
                    className="alternativa"
                    data-clicavel={alt.answered ? 'nao' : 'sim'}
                    data-testid={`alt-${alt.i}`}
                    style={alt.style}
                    onClick={() => pickAlt(alt.i)}
                  >
                    <div style={alt.radioStyle} />
                    <div style={{ flex: 1, fontSize: 13.5 }}>{alt.texto}</div>
                    {alt.showIcon && alt.icon}
                  </div>
                ))}
              </div>
            </div>

            {/* A explicação só existe depois de a pessoa responder — mostrar
                antes entregaria a resposta. E ela vem com a etiqueta de quem
                escreveu: enquanto o texto não passou por revisão humana, quem
                lê precisa saber disso antes de decorar. */}
            {quest.selectedAlt !== null && current.explicacao && (
              <div className="entra" style={{ marginTop: 18, padding: 16, borderRadius: 12, background: '#faf9fb', border: '1px solid #eef0f4' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <Icon name="lightbulb" color="#F59E0B" size={16} />
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#2c2530' }}>Por que essa é a resposta</span>
                  {!current.revisada && (
                    <span data-testid="explicacao-nao-revisada" style={s.pill('#FEF3C7', '#B45309')}>
                      {current.explicacaoFonte === 'ia' ? 'Gerada por IA · não revisada' : 'Não revisada'}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 13, color: '#5c5462', lineHeight: 1.6, marginTop: 10 }}>{current.explicacao}</div>
                <div style={{ fontSize: 11.5, color: '#8b8391', marginTop: 10 }}>
                  Gabarito oficial: alternativa {String.fromCharCode(65 + current.correta)}.
                </div>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 20 }}>
              <div style={{ fontSize: 12.5, color: '#8b8391' }}>Acertos: <b style={{ color: '#10B981' }}>{quest.certas}</b> · Erros: <b style={{ color: '#EF4444' }}>{quest.erradas}</b></div>
              <button
                style={{ ...s.btnPrimary, opacity: quest.selectedAlt === null ? 0.4 : 1 }}
                onClick={nextQuestion}
                disabled={quest.selectedAlt === null}
              >
                {quest.idx + 1 >= total ? 'Finalizar quiz' : 'Próxima questão →'}
              </button>
            </div>
          </div>
        )}

        {quizDone && (
          <div
            className="entra"
            style={{ background: '#fff', border: '1px solid rgba(0,0,0,.05)', borderRadius: 18, padding: '48px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}
          >
            <div style={{ width: 72, height: 72, borderRadius: 22, background: 'linear-gradient(135deg, #FBBF24, #D97706)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto' }}>
              <Icon name="trophy" color="#fff" size={34} />
            </div>
            <div style={{ fontSize: 19, fontWeight: 700, color: '#2c2530', marginTop: 14 }}>Quiz concluído!</div>
            <div style={{ fontSize: 13.5, color: '#8b8391', marginTop: 6 }}>Você acertou {quest.certas} de {total} questões ({scorePct}%)</div>
            <button style={{ ...s.btnPrimary, marginTop: 18, padding: '12px 22px', fontSize: 13.5 }} onClick={exitQuiz}>Montar novo quiz</button>
          </div>
        )}
      </div>

      {feedbackAberto && current && (
        <div
          className="modal-fundo"
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
        >
          <div
            className="modal-caixa"
            style={{ background: '#fff', borderRadius: 16, padding: 32, maxWidth: 400, textAlign: 'center' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, fontSize: 18, fontWeight: 700, marginBottom: 16 }}>
              <Icon
                name={quest.selectedAlt === current.correta ? 'circle-check' : 'circle-x'}
                color={quest.selectedAlt === current.correta ? '#10B981' : '#EF4444'}
                size={24}
              />
              {quest.selectedAlt === current.correta ? 'Acertou!' : 'Errou'}
            </div>

            <div style={{ fontSize: 14, color: '#5c5462', marginBottom: 20 }}>
              Como você chegou nessa resposta?
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                { label: 'Tinha certeza absoluta', tipo: 'acerto-conceitual', certeza: 95 },
                { label: 'Tive uma boa intuição', tipo: 'acerto-conceitual', certeza: 70 },
                { label: 'Eliminei as erradas', tipo: 'acerto-chute', certeza: 50 },
                { label: 'Foi chute', tipo: 'chute', certeza: 30 }
              ].map(opt => (
                <button
                  key={opt.label}
                  className="opcao-feedback"
                  onClick={() => avancarProxima(opt.tipo, opt.certeza)}
                  style={{
                    '--cor-foco': theme.primary,
                    '--cor-foco-suave': theme.primarySoft,
                    padding: 10,
                    border: '1px solid rgba(0,0,0,.1)',
                    borderRadius: 8,
                    background: '#faf9fb',
                    cursor: 'pointer',
                    textAlign: 'left',
                    fontSize: 13,
                    fontWeight: 500,
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
