import { useState } from 'react';
import { Icon } from '../lib/icons';
import ConfigSimulado from '../components/ConfigSimulado';
import Cronometro from '../components/Cronometro';

export default function Simulados({ theme, s, data, sim, setSim, setResultadosHistorico, resultados_historico }) {
  const [etapa, setEtapa] = useState('lista'); // lista | config | execucao | resultado
  const [simulado, setSimulado] = useState(null);

  const QUESTOES = data.QUESTOES || [];

  const iniciarSimulado = (config) => {
    const { tipo, disciplina, quantidade } = config;

    let pool = [...QUESTOES];
    if (tipo === 'disciplina' && disciplina) {
      pool = pool.filter(q => q.disciplina === disciplina);
    }

    pool = pool.sort(() => Math.random() - 0.5).slice(0, Math.min(quantidade, pool.length));

    const novo = {
      id: `sim-${Date.now()}`,
      tipo,
      disciplina,
      quantidade: pool.length,
      questoes_pool: pool,
      tempo_inicio: Date.now(),
      tempo_total_minutos: Math.ceil(pool.length * 1.5),
      idx_atual: 0,
      respostas: {},
      acertos: 0
    };

    setSimulado(novo);
    setEtapa('execucao');
  };

  const responderQuestao = (respostaIdx) => {
    const q = simulado.questoes_pool[simulado.idx_atual];
    const acertou = respostaIdx === q.correta;

    const novasRespostas = {
      ...simulado.respostas,
      [q.id]: {
        resposta: respostaIdx,
        correta: acertou,
        tempo_gasto: Math.round((Date.now() - simulado.tempo_inicio) / 1000)
      }
    };

    const novosAcertos = simulado.acertos + (acertou ? 1 : 0);

    if (simulado.idx_atual < simulado.questoes_pool.length - 1) {
      setSimulado({
        ...simulado,
        idx_atual: simulado.idx_atual + 1,
        respostas: novasRespostas,
        acertos: novosAcertos
      });
    } else {
      finalizarSimulado(novasRespostas, novosAcertos);
    }
  };

  const finalizarSimulado = (respostas, acertos) => {
    const tempoTotalMinutos = Math.round((Date.now() - simulado.tempo_inicio) / 60000);
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

  // ETAPA: Lista de simulados anteriores
  if (etapa === 'lista') {
    const stats = [
      { label: 'Simulados realizados', value: (resultados_historico || []).length },
      { label: 'Melhor nota', value: resultados_historico && resultados_historico.length > 0 ? Math.max(...resultados_historico.map(r => r.nota_final)) + '%' : '-' },
      { label: 'Média de acertos', value: resultados_historico && resultados_historico.length > 0 ? Math.round(resultados_historico.reduce((a, b) => a + b.nota_final, 0) / resultados_historico.length) + '%' : '-' },
      { label: 'Tempo total', value: resultados_historico && resultados_historico.length > 0 ? resultados_historico.reduce((a, b) => a + b.tempo_total_minutos, 0) + 'min' : '-' },
    ];

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14 }}>
          {stats.map((st, i) => (
            <div key={i} style={s.card}>
              <div style={{ fontSize: 11.5, color: '#8b8391' }}>{st.label}</div>
              <div style={{ ...s.statNum, marginTop: 4 }}>{st.value}</div>
            </div>
          ))}
        </div>

        {resultados_historico && resultados_historico.length > 0 && (
          <div style={s.card}>
            <div style={s.sectionTitle}>📊 Histórico de Simulados</div>
            {resultados_historico.map(r => (
              <div key={r.id} style={{ padding: 12, borderBottom: '1px solid rgba(0,0,0,.05)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{r.nome}</div>
                    <div style={{ fontSize: 12, color: '#999', marginTop: 4 }}>
                      {r.acertos}/{r.quantidade} acertos • {r.tempo_total_minutos}min
                    </div>
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: theme.primary }}>
                    {r.nota_final}%
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <button
          onClick={() => setEtapa('config')}
          style={{
            padding: 16,
            background: theme.primary,
            color: 'white',
            border: 'none',
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer'
          }}
        >
          + Novo Simulado
        </button>
      </div>
    );
  }

  // ETAPA: Configuração
  if (etapa === 'config') {
    return (
      <div>
        <button
          onClick={() => setEtapa('lista')}
          style={{
            marginBottom: 16,
            padding: 8,
            border: `1px solid ${theme.primary}`,
            background: 'transparent',
            color: theme.primary,
            borderRadius: 6,
            fontSize: 12,
            cursor: 'pointer',
            fontWeight: 600
          }}
        >
          ← Voltar
        </button>
        <ConfigSimulado
          theme={theme}
          s={s}
          onConfirm={iniciarSimulado}
        />
      </div>
    );
  }

  // ETAPA: Execução
  if (etapa === 'execucao' && simulado) {
    const questaoAtual = simulado.questoes_pool[simulado.idx_atual];
    const progresso = Math.round(((simulado.idx_atual + 1) / simulado.quantidade) * 100);
    const errados = simulado.idx_atual - simulado.acertos;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <Cronometro
          tempoTotalMinutos={simulado.tempo_total_minutos}
          aoTerminar={() => finalizarSimulado(simulado.respostas, simulado.acertos)}
          theme={theme}
        />

        <div style={s.card}>
          <div style={{ fontSize: 12, color: '#999', marginBottom: 8 }}>
            Questão {simulado.idx_atual + 1} de {simulado.quantidade}
          </div>
          <div style={{
            width: '100%',
            height: 4,
            background: '#f0f0f0',
            borderRadius: 2,
            marginBottom: 16,
            overflow: 'hidden'
          }}>
            <div style={{
              width: `${progresso}%`,
              height: '100%',
              background: theme.primary,
              transition: 'width 0.3s'
            }} />
          </div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <span style={s.pill('#f3f1f5', '#8b8391')}>{questaoAtual.disciplina}</span>
            <span style={s.pill('#f3f1f5', '#8b8391')}>{questaoAtual.banca} · {questaoAtual.ano}</span>
            <span style={s.pill('#faf9fb', '#8b8391')}>{questaoAtual.dificuldade}</span>
          </div>

          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16, lineHeight: 1.6 }}>
            {questaoAtual.enunciado}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {questaoAtual.alternativas.map((alt, idx) => {
              const jaRespondeu = questaoAtual.id in simulado.respostas;
              const ehCorreta = idx === questaoAtual.correta;
              const foiEscolhida = simulado.respostas[questaoAtual.id]?.resposta === idx;

              let bg = '#faf9fb', border = 'rgba(0,0,0,.08)';
              if (jaRespondeu) {
                if (ehCorreta) {
                  bg = '#D1FAE5';
                  border = '#10B981';
                } else if (foiEscolhida) {
                  bg = '#FEE2E2';
                  border = '#EF4444';
                }
              }

              return (
                <button
                  key={idx}
                  data-testid={`alt-${idx}`}
                  onClick={() => !jaRespondeu && responderQuestao(idx)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '12px 14px',
                    borderRadius: 12,
                    border: `1.5px solid ${border}`,
                    background: bg,
                    cursor: jaRespondeu ? 'default' : 'pointer',
                    textAlign: 'left',
                    fontSize: 13.5,
                    fontFamily: 'inherit',
                    transition: 'all 0.2s'
                  }}
                >
                  <div style={{
                    width: 26,
                    height: 26,
                    borderRadius: '50%',
                    background: jaRespondeu && (ehCorreta || foiEscolhida)
                      ? (ehCorreta ? '#10B981' : '#EF4444')
                      : theme.primarySoft,
                    color: jaRespondeu && (ehCorreta || foiEscolhida) ? '#fff' : theme.primaryDark,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 12.5,
                    fontWeight: 700,
                    flex: 'none'
                  }}>
                    {String.fromCharCode(65 + idx)}
                  </div>
                  <div>{alt}</div>
                  {jaRespondeu && ehCorreta && <Icon name="check" color="#10B981" size={18} style={{ marginLeft: 'auto' }} />}
                  {jaRespondeu && foiEscolhida && !ehCorreta && <Icon name="x" color="#EF4444" size={18} style={{ marginLeft: 'auto' }} />}
                </button>
              );
            })}
          </div>
        </div>

        <div style={s.card}>
          <div style={{ display: 'flex', justifyContent: 'space-around', textAlign: 'center' }}>
            <div>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#10B981' }}>{simulado.acertos}</div>
              <div style={{ fontSize: 12, color: '#8b8391' }}>Acertos</div>
            </div>
            <div>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#EF4444' }}>{errados}</div>
              <div style={{ fontSize: 12, color: '#8b8391' }}>Erros</div>
            </div>
            <div>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#F59E0B' }}>{simulado.quantidade - simulado.idx_atual - 1}</div>
              <div style={{ fontSize: 12, color: '#8b8391' }}>Faltam</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ETAPA: Resultado
  if (etapa === 'resultado' && resultados_historico && resultados_historico.length > 0) {
    const resultado = resultados_historico[resultados_historico.length - 1];

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18, alignItems: 'center', textAlign: 'center' }}>
        <div style={{ fontSize: 64, marginTop: 20 }}>
          {resultado.nota_final >= 70 ? '🎉' : resultado.nota_final >= 50 ? '👍' : '💪'}
        </div>

        <div style={{ ...s.card, width: '100%', textAlign: 'center', padding: 24 }}>
          <div style={{ fontSize: 14, color: '#999', marginBottom: 8 }}>
            Nota final
          </div>
          <div style={{ fontSize: 48, fontWeight: 700, color: theme.primary }}>
            {resultado.nota_final}%
          </div>
          <div style={{ fontSize: 13, marginTop: 16 }}>
            {resultado.acertos} acertos em {resultado.quantidade} questões
          </div>
          <div style={{ fontSize: 12, color: '#999', marginTop: 8 }}>
            Tempo total: {resultado.tempo_total_minutos} minutos
          </div>
        </div>

        <button
          onClick={() => setEtapa('lista')}
          style={{
            padding: 12,
            background: theme.primary,
            color: 'white',
            border: 'none',
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer'
          }}
        >
          Voltar para simulados
        </button>
      </div>
    );
  }

  return null;
}
