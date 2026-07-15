import { useState } from 'react';
import { Icon } from '../lib/icons';
import ConfigSimulado from '../components/ConfigSimulado';
import Cronometro from '../components/Cronometro';

const DISC_ICONS = {
  'Direito Constitucional': 'landmark',
  'Direito Administrativo': 'scale',
  'Direito Civil': 'users',
  'Direito Penal': 'gavel',
  'Direito do Trabalho': 'briefcase',
  'Direito Tributário': 'file-text',
  'Direito Empresarial': 'building-2',
  'Direito Internacional': 'book-open',
};

export default function Simulados({ theme, s, data, sim, setSim, setResultadosHistorico, resultados_historico, go }) {
  const preDisciplina = sim?.preDisciplina || null;
  const [etapa, setEtapa] = useState(preDisciplina ? 'config' : 'lista');
  const [simulado, setSimulado] = useState(null);
  const [configInicial, setConfigInicial] = useState(preDisciplina);

  const QUESTOES = data.QUESTOES || [];
  const DISCIPLINAS = data.DISCIPLINAS || [];
  const disciplinasComQuestoes = Array.from(new Set(QUESTOES.map(q => q.disciplina)));

  const limparPreSelecao = () => {
    if (preDisciplina) setSim({ preDisciplina: null });
  };

  const abrirConfig = (disciplina = null) => {
    setConfigInicial(disciplina);
    setEtapa('config');
  };

  const iniciarSimulado = (config) => {
    const { tipo, disciplina, quantidade } = config;
    limparPreSelecao();

    let pool = [...QUESTOES];
    if (tipo === 'disciplina' && disciplina) {
      pool = pool.filter(q => q.disciplina === disciplina);
    }

    pool = pool.sort(() => Math.random() - 0.5).slice(0, Math.min(quantidade, pool.length));

    setSimulado({
      id: `sim-${Date.now()}`,
      tipo,
      disciplina,
      quantidade: pool.length,
      questoes_pool: pool,
      tempo_inicio: Date.now(),
      tempo_total_minutos: Math.ceil(pool.length * 1.5),
      respostas: {}
    });
    setEtapa('execucao');
  };

  const selecionarResposta = (questaoId, respostaIdx) => {
    setSimulado(prev => ({
      ...prev,
      respostas: { ...prev.respostas, [questaoId]: respostaIdx }
    }));
  };

  const finalizarSimulado = () => {
    const acertos = simulado.questoes_pool.filter(q => simulado.respostas[q.id] === q.correta).length;
    const tempoTotalMinutos = Math.max(1, Math.round((Date.now() - simulado.tempo_inicio) / 60000));
    const notaFinal = Math.round((acertos / simulado.quantidade) * 100);

    const resultado = {
      id: simulado.id,
      nome: `Simulado ${simulado.tipo === 'geral' ? 'OAB 1ª Fase' : simulado.disciplina}`,
      tipo: simulado.tipo,
      disciplina: simulado.disciplina,
      quantidade: simulado.quantidade,
      acertos,
      errados: simulado.quantidade - acertos,
      nota_final: notaFinal,
      tempo_total_minutos: tempoTotalMinutos,
      tempo_limite_minutos: simulado.tempo_total_minutos,
      data_conclusao: new Date().toISOString()
    };

    // Forma funcional: updateSlice faz spread de objetos em partials diretos,
    // o que corromperia um array ({0: ...}); a função substitui o valor inteiro.
    setResultadosHistorico((prev) => [...(prev || []), resultado]);
    setEtapa('resultado');
  };

  // ---- ETAPA: Lista / Treino por Matéria ----
  if (etapa === 'lista') {
    const hist = resultados_historico || [];
    const stats = [
      { label: 'Simulados realizados', value: hist.length },
      { label: 'Melhor nota', value: hist.length > 0 ? Math.max(...hist.map(r => r.nota_final)) + '%' : '-' },
      { label: 'Média de acertos', value: hist.length > 0 ? Math.round(hist.reduce((a, b) => a + b.nota_final, 0) / hist.length) + '%' : '-' },
      { label: 'Tempo total', value: hist.length > 0 ? hist.reduce((a, b) => a + b.tempo_total_minutos, 0) + 'min' : '-' },
    ];

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14 }}>
          {stats.map((st, i) => (
            <div key={i} style={s.card}>
              <div style={{ fontSize: 11.5, color: '#8b8391' }}>{st.label}</div>
              <div style={{ ...s.statNum, marginTop: 4 }}>{st.value}</div>
            </div>
          ))}
        </div>

        {/* Hero: Simulado Geral */}
        <div style={{ ...s.card, display: 'flex', alignItems: 'center', gap: 20, padding: 24, background: `linear-gradient(120deg, ${theme.gradA}12, ${theme.gradB}10), #fff` }}>
          <div style={{ width: 60, height: 60, borderRadius: 16, background: `linear-gradient(135deg, ${theme.gradA}, ${theme.gradB})`, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
            <Icon name="graduation-cap" color="#fff" size={30} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: '#2c2530' }}>Simulado Geral — OAB 1ª Fase</div>
            <div style={{ fontSize: 13, color: '#8b8391', marginTop: 4 }}>Questões sortidas de diversos editais, com tempo de prova real.</div>
          </div>
          <button
            data-testid="novo-simulado"
            onClick={() => abrirConfig(null)}
            style={{ padding: '13px 22px', background: '#343a46', color: '#fff', border: 'none', borderRadius: 10, fontSize: 13.5, fontWeight: 600, cursor: 'pointer', flex: 'none', display: 'flex', alignItems: 'center', gap: 8 }}
          >
            <Icon name="play" color="#fff" size={13} /> Iniciar Simulado
          </button>
        </div>

        {/* Treino por Matéria */}
        <div>
          <div style={{ textAlign: 'center', margin: '8px 0 4px' }}>
            <div style={{ fontSize: 21, fontWeight: 700, color: '#2c2530' }}>Treino por Matéria</div>
            <div style={{ width: 120, height: 3, borderRadius: 2, margin: '8px auto 0', background: `linear-gradient(90deg, ${theme.gradA}, ${theme.gradB})` }} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16, marginTop: 18 }}>
            {DISCIPLINAS.map((d) => {
              const qtd = QUESTOES.filter(q => q.disciplina === d.nome).length;
              const temQuestoes = qtd > 0;
              return (
                <div key={d.nome} style={{ ...s.card, display: 'flex', flexDirection: 'column', gap: 12, padding: 22, opacity: temQuestoes ? 1 : 0.6 }}>
                  <div style={{ width: 52, height: 52, borderRadius: 14, background: `${d.cor}1e`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name={DISC_ICONS[d.nome] || 'library'} color={d.cor} size={26} />
                  </div>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: '#2c2530' }}>{d.nome}</div>
                    <div style={{ fontSize: 12.5, color: '#8b8391', marginTop: 3 }}>
                      {temQuestoes ? `${qtd} questões focadas e comentadas.` : 'Em breve.'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 'auto' }}>
                    <button
                      onClick={() => temQuestoes && abrirConfig(d.nome)}
                      disabled={!temQuestoes}
                      style={{ flex: 1, padding: '10px 12px', background: temQuestoes ? '#343a46' : '#c3c8d2', color: '#fff', border: 'none', borderRadius: 9, fontSize: 12.5, fontWeight: 600, cursor: temQuestoes ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}
                    >
                      <Icon name="play" color="#fff" size={12} /> Iniciar Simulado
                    </button>
                    <button
                      onClick={() => go && go('disciplinas')}
                      style={{ padding: '10px 14px', background: '#fff', color: '#5c5462', border: '1px solid #e3e7ee', borderRadius: 9, fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}
                    >
                      Estudar
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Histórico */}
        {hist.length > 0 && (
          <div style={s.card}>
            <div style={s.sectionTitle}><Icon name="chart-column" color={theme.primary} size={18} />Histórico de Simulados</div>
            {hist.map(r => (
              <div key={r.id} style={{ padding: 12, borderBottom: '1px solid rgba(0,0,0,.05)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{r.nome}</div>
                    <div style={{ fontSize: 12, color: '#999', marginTop: 4 }}>
                      {r.acertos}/{r.quantidade} acertos • {r.tempo_total_minutos}min
                    </div>
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: theme.primary }}>{r.nota_final}%</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ---- ETAPA: Configuração ----
  if (etapa === 'config') {
    return (
      <div>
        <button
          onClick={() => { limparPreSelecao(); setEtapa('lista'); }}
          style={{ marginBottom: 16, padding: '8px 14px', border: '1px solid #e3e7ee', background: '#fff', color: '#5c5462', borderRadius: 8, fontSize: 12.5, cursor: 'pointer', fontWeight: 600 }}
        >
          ← Voltar
        </button>
        <ConfigSimulado
          theme={theme}
          s={s}
          onConfirm={iniciarSimulado}
          disciplinas={disciplinasComQuestoes}
          disciplinaInicial={configInicial}
        />
      </div>
    );
  }

  // ---- ETAPA: Execução (todas as questões em uma página, sem feedback) ----
  if (etapa === 'execucao' && simulado) {
    const respondidas = Object.keys(simulado.respostas).length;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18, position: 'relative' }}>
        <div style={{ ...s.card, textAlign: 'center', padding: 20 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#2c2530' }}>
            {simulado.tipo === 'geral' ? 'Simulado Geral — OAB 1ª Fase' : `Simulado — ${simulado.disciplina}`}
          </div>
          <div style={{ fontSize: 13, color: '#8b8391', marginTop: 4 }}>
            Você selecionou <b style={{ color: '#2c2530' }}>{simulado.quantidade} questões</b>. Gerencie seu tempo e boa sorte!
          </div>
        </div>

        {simulado.questoes_pool.map((q, i) => (
          <div key={q.id} data-testid={`sim-q-${i}`} style={s.card}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingBottom: 14, borderBottom: '1px solid #eef0f4' }}>
              <span style={{ background: theme.primarySoft, color: theme.primaryDark, fontWeight: 700, fontSize: 12.5, padding: '5px 14px', borderRadius: 8 }}>
                Questão {i + 1}
              </span>
              <span style={{ fontSize: 11.5, color: '#8b93a1', fontWeight: 600, letterSpacing: '.4px' }}>
                PROVA-{(q.banca || 'OAB').toUpperCase()}-BR/{q.ano}
              </span>
            </div>

            <div style={{ fontSize: 14.5, color: '#2c2530', lineHeight: 1.65, margin: '16px 0' }}>{q.enunciado}</div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {q.alternativas.map((alt, idx) => {
                const escolhida = simulado.respostas[q.id] === idx;
                return (
                  <button
                    key={idx}
                    data-testid={`alt-${idx}`}
                    onClick={() => selecionarResposta(q.id, idx)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '13px 16px',
                      borderRadius: 10,
                      border: escolhida ? `1.5px solid ${theme.primary}` : '1px solid #e3e7ee',
                      background: escolhida ? theme.primarySoft : '#fff',
                      cursor: 'pointer',
                      textAlign: 'left',
                      fontSize: 13.5,
                      color: '#2c2530',
                      fontFamily: 'inherit',
                      transition: 'all 0.15s'
                    }}
                  >
                    <div style={{
                      width: 18, height: 18, borderRadius: '50%', flex: 'none',
                      border: escolhida ? `5px solid ${theme.primary}` : '2px solid #cfd6e0',
                      background: '#fff', boxSizing: 'border-box'
                    }} />
                    <div>{alt}</div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        {/* Barra fixa inferior */}
        <div style={{
          position: 'sticky', bottom: 12, zIndex: 20,
          background: '#fff', border: '1px solid rgba(0,0,0,.06)', borderRadius: 14,
          boxShadow: '0 6px 24px rgba(0,0,0,.12)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 20px'
        }}>
          <Cronometro tempoTotalMinutos={simulado.tempo_total_minutos} aoTerminar={finalizarSimulado} />
          <div style={{ fontSize: 13, color: '#8b8391', fontWeight: 600 }}>
            {respondidas}/{simulado.quantidade} respondidas
          </div>
          <button
            data-testid="finalizar-simulado"
            onClick={finalizarSimulado}
            style={{ padding: '11px 24px', background: '#343a46', color: '#fff', border: 'none', borderRadius: 24, fontSize: 13.5, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
          >
            Finalizar <Icon name="check" color="#fff" size={16} />
          </button>
        </div>
      </div>
    );
  }

  // ---- ETAPA: Resultado + revisão ----
  if (etapa === 'resultado' && simulado) {
    const hist = resultados_historico || [];
    const resultado = hist[hist.length - 1];
    if (!resultado) return null;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ ...s.card, textAlign: 'center', padding: 28 }}>
          <div style={{ width: 76, height: 76, borderRadius: '50%', margin: '0 auto', background: resultado.nota_final >= 70 ? '#D1FAE5' : resultado.nota_final >= 50 ? '#FEF3C7' : '#FEE2E2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon
              name={resultado.nota_final >= 70 ? 'trophy' : resultado.nota_final >= 50 ? 'target' : 'trending-up'}
              color={resultado.nota_final >= 70 ? '#10B981' : resultado.nota_final >= 50 ? '#F59E0B' : '#EF4444'}
              size={38}
            />
          </div>
          <div style={{ fontSize: 14, color: '#999', marginTop: 8 }}>Nota final</div>
          <div style={{ fontSize: 48, fontWeight: 700, color: theme.primary }}>{resultado.nota_final}%</div>
          <div style={{ fontSize: 13, marginTop: 12 }}>{resultado.acertos} acertos em {resultado.quantidade} questões</div>
          <div style={{ fontSize: 12, color: '#999', marginTop: 4 }}>Tempo total: {resultado.tempo_total_minutos} minutos</div>
        </div>

        {/* Revisão */}
        <div style={s.card}>
          <div style={s.sectionTitle}><Icon name="clipboard-list" color={theme.primary} size={18} />Revisão do simulado</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 14 }}>
            {simulado.questoes_pool.map((q, i) => {
              const resposta = simulado.respostas[q.id];
              const acertou = resposta === q.correta;
              const naoRespondeu = resposta === undefined;
              return (
                <div key={q.id} style={{ padding: 16, borderRadius: 12, border: `1px solid ${acertou ? '#10B98140' : '#EF444440'}`, background: acertou ? '#10B98108' : '#EF444408' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Icon name={acertou ? 'check' : 'circle-x'} color={acertou ? '#10B981' : '#EF4444'} size={18} />
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#2c2530' }}>Questão {i + 1}</span>
                    <span style={{ fontSize: 11.5, color: '#8b93a1' }}>{q.disciplina}</span>
                  </div>
                  <div style={{ fontSize: 13, color: '#5c5462', marginTop: 8, lineHeight: 1.55 }}>{q.enunciado}</div>
                  <div style={{ fontSize: 12.5, marginTop: 10 }}>
                    {naoRespondeu
                      ? <span style={{ color: '#F59E0B', fontWeight: 600 }}>Não respondida</span>
                      : <span style={{ color: acertou ? '#10B981' : '#EF4444', fontWeight: 600 }}>
                          Sua resposta: {String.fromCharCode(65 + resposta)}
                        </span>}
                    {!acertou && (
                      <span style={{ color: '#10B981', fontWeight: 600, marginLeft: 12 }}>
                        Gabarito: {String.fromCharCode(65 + q.correta)}
                      </span>
                    )}
                  </div>
                  {q.explicacao && !acertou && (
                    <div style={{ fontSize: 12.5, color: '#5c5462', marginTop: 8, padding: 10, background: '#fff', borderRadius: 8, lineHeight: 1.5, display: 'flex', gap: 8 }}>
                      <Icon name="lightbulb" color="#F59E0B" size={15} style={{ marginTop: 1 }} /> <span>{q.explicacao}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <button
          onClick={() => { setSimulado(null); setEtapa('lista'); }}
          style={{ padding: 13, background: '#343a46', color: 'white', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
        >
          Voltar para simulados
        </button>
      </div>
    );
  }

  return null;
}
