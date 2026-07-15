import { Icon } from '../lib/icons';

const DIFICULDADE_COR = { 'Fácil': '#10B981', 'Média': '#F59E0B', 'Difícil': '#EF4444' };

export default function Questoes({ theme, s, data, quest, setQuest }) {
  const all = data.QUESTOES || [];
  const disciplinas = Array.from(new Set(all.map((q) => q.disciplina)));
  const selected = quest.selected ?? disciplinas;
  const counts = {};
  all.forEach((q) => { counts[q.disciplina] = (counts[q.disciplina] || 0) + 1; });

  const toggleSource = (nome) => {
    const next = selected.includes(nome) ? selected.filter((n) => n !== nome) : [...selected, nome];
    setQuest({ selected: next });
  };

  const toggleAll = () => {
    setQuest({ selected: selected.length === disciplinas.length ? [] : disciplinas });
  };

  const startQuiz = () => {
    const pool = all.filter((q) => selected.includes(q.disciplina));
    setQuest({ quiz: pool, idx: 0, selectedAlt: null, certas: 0, erradas: 0, done: false });
  };

  const exitQuiz = () => setQuest({ quiz: null, idx: 0, selectedAlt: null, certas: 0, erradas: 0, done: false });

  const pickAlt = (i) => {
    if (quest.selectedAlt !== null) return;
    const q = quest.quiz[quest.idx];
    const correct = i === q.correta;
    setQuest({ selectedAlt: i, certas: quest.certas + (correct ? 1 : 0), erradas: quest.erradas + (correct ? 0 : 1) });
  };

  const nextQuestion = () => {
    const nextIdx = quest.idx + 1;
    if (nextIdx >= quest.quiz.length) setQuest({ done: true });
    else setQuest({ idx: nextIdx, selectedAlt: null });
  };

  const availablePool = all.filter((q) => selected.includes(q.disciplina));
  const quizActive = !!quest.quiz && !quest.done;
  const quizDone = !!quest.quiz && quest.done;

  let current = null, alternativas = [], dificuldadePill = {};
  if (quizActive) {
    current = quest.quiz[quest.idx];
    dificuldadePill = s.pill('#faf9fb', DIFICULDADE_COR[current.dificuldade] || '#8b8391');
    const answered = quest.selectedAlt !== null;
    alternativas = current.alternativas.map((texto, i) => {
      const isCorrect = i === current.correta;
      const isSelected = i === quest.selectedAlt;
      let bg = '#faf9fb', border = 'rgba(0,0,0,.08)', icon = null, show = false;
      if (answered) {
        if (isCorrect) { bg = '#D1FAE5'; border = '#10B981'; icon = <Icon name="check" color="#10B981" size={18} />; show = true; }
        else if (isSelected) { bg = '#FEE2E2'; border = '#EF4444'; icon = <Icon name="x" color="#EF4444" size={18} />; show = true; }
      }
      return {
        texto, letter: String.fromCharCode(65 + i), i, showIcon: show, icon,
        style: { display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 12, border: `1.5px solid ${border}`, background: bg, cursor: answered ? 'default' : 'pointer' },
        letterStyle: { width: 26, height: 26, borderRadius: '50%', background: answered && isCorrect ? '#10B981' : (answered && isSelected ? '#EF4444' : theme.primarySoft), color: answered && (isCorrect || isSelected) ? '#fff' : theme.primaryDark, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12.5, fontWeight: 700, flex: 'none' },
      };
    });
  }

  const total = quest.quiz ? quest.quiz.length : 0;
  const position = Math.min(quest.idx + 1, total);
  const scorePct = total ? Math.round(quest.certas / total * 100) : 0;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '270px 1fr', gap: 18, alignItems: 'start', height: '100%' }}>
      <div style={{ ...s.card, padding: 16, position: 'sticky', top: 0 }}>
        <div style={{ ...s.sectionTitle, fontSize: 14 }}><Icon name="library" color={theme.primary} size={20} />Disciplinas</div>
        <div style={{ fontSize: 11.5, color: '#8b8391', marginTop: 4 }}>Selecione as fontes do seu quiz</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 14 }}>
          {disciplinas.map((nome) => {
            const on = selected.includes(nome);
            return (
              <div
                key={nome}
                onClick={() => toggleSource(nome)}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', borderRadius: 10, cursor: 'pointer', background: on ? theme.primarySoft : '#faf9fb' }}
              >
                <div style={{ width: 18, height: 18, borderRadius: 5, border: `1.5px solid ${on ? theme.primary : '#d5d0da'}`, background: on ? theme.primary : '#fff', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, flex: 'none' }}>
                  {on ? '✓' : ''}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: '#2c2530', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{nome}</div>
                  <div style={{ fontSize: 10.5, color: '#8b8391' }}>{counts[nome]} questões</div>
                </div>
              </div>
            );
          })}
        </div>
        <button
          style={{ width: '100%', marginTop: 14, background: '#fff', border: `1px solid ${theme.primarySoft}`, color: theme.primary, borderRadius: 9, padding: 8, fontSize: 12, fontWeight: 600 }}
          onClick={toggleAll}
        >
          {selected.length === disciplinas.length ? 'Limpar seleção' : 'Selecionar todas'}
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {!quizActive && !quizDone && (
          <div style={{ background: '#fff', border: '1px solid rgba(0,0,0,.05)', borderRadius: 18, padding: '48px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
            <div style={{ width: 72, height: 72, borderRadius: 22, background: `linear-gradient(135deg, ${theme.gradA}, ${theme.gradB})`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto' }}>
              <Icon name="brain" color="#fff" size={34} />
            </div>
            <div style={{ fontSize: 19, fontWeight: 700, color: '#2c2530', marginTop: 14 }}>Monte seu quiz</div>
            <div style={{ fontSize: 13.5, color: '#8b8391', marginTop: 6, maxWidth: 420, textAlign: 'center' }}>Escolha uma ou mais disciplinas ao lado e gere um quiz com as questões dessas fontes.</div>
            <div style={{ fontSize: 12.5, color: '#5c5462', marginTop: 14 }}>{selected.length === 0 ? 'Nenhuma disciplina selecionada' : `${selected.length} disciplina(s) selecionada(s)`}</div>
            <button style={{ ...s.btnPrimary, marginTop: 18, padding: '12px 22px', fontSize: 13.5, opacity: availablePool.length === 0 ? 0.5 : 1, cursor: availablePool.length === 0 ? 'not-allowed' : 'pointer' }} onClick={startQuiz} disabled={availablePool.length === 0}>
              ▶ Gerar quiz ({availablePool.length} questões)
            </button>
          </div>
        )}

        {quizActive && current && (
          <div style={s.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button style={{ background: 'none', border: 'none', color: theme.primary, fontSize: 13, fontWeight: 600 }} onClick={exitQuiz}>← Encerrar quiz</button>
              <div style={{ fontSize: 12.5, color: '#8b8391' }}>Questão {position} de {total}</div>
            </div>
            <div style={{ ...s.progressTrack, marginTop: 10 }}><div style={{ width: total ? (position / total * 100) + '%' : '0%', height: '100%', background: `linear-gradient(90deg, ${theme.gradA}, ${theme.gradB})`, borderRadius: 5 }} /></div>

            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <span style={s.pill('#f3f1f5', '#8b8391')}>{current.disciplina}</span>
              <span style={s.pill('#f3f1f5', '#8b8391')}>{current.banca} · {current.ano}</span>
              <span style={dificuldadePill}>{current.dificuldade}</span>
            </div>
            <div style={{ fontSize: 15.5, color: '#2c2530', lineHeight: 1.55, marginTop: 16 }}>{current.enunciado}</div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 18 }}>
              {alternativas.map((alt) => (
                <div key={alt.i} style={alt.style} onClick={() => pickAlt(alt.i)}>
                  <div style={alt.letterStyle}>{alt.letter}</div>
                  <div style={{ flex: 1, fontSize: 13.5 }}>{alt.texto}</div>
                  {alt.showIcon && alt.icon}
                </div>
              ))}
            </div>

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
          <div style={{ background: '#fff', border: '1px solid rgba(0,0,0,.05)', borderRadius: 18, padding: '48px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
            <div style={{ width: 72, height: 72, borderRadius: 22, background: 'linear-gradient(135deg, #FBBF24, #D97706)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto' }}>
              <Icon name="trophy" color="#fff" size={34} />
            </div>
            <div style={{ fontSize: 19, fontWeight: 700, color: '#2c2530', marginTop: 14 }}>Quiz concluído!</div>
            <div style={{ fontSize: 13.5, color: '#8b8391', marginTop: 6 }}>Você acertou {quest.certas} de {total} questões ({scorePct}%)</div>
            <button style={{ ...s.btnPrimary, marginTop: 18, padding: '12px 22px', fontSize: 13.5 }} onClick={exitQuiz}>Montar novo quiz</button>
          </div>
        )}
      </div>
    </div>
  );
}
