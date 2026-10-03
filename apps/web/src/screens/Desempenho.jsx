import { AreaLine, LabeledBars } from '../lib/charts';
import { Icon } from '../lib/icons';
import { evolucaoGeral, tempoPorDisciplina, formatarDuracao } from '../lib/metrics';

// A série de evolução era esta constante, igual para todo mundo:
//   const SERIES = { '7': [60, 66, 63, 70, 68, 74, 73], ... }
// Quem nunca tinha respondido nada via a mesma curva ascendente de quem
// estudava há meses. Agora cada ponto é uma semana de tentativas reais.

const SEMANAS = { '6': 6, '12': 12 };

function Vazio({ children }) {
  return <div style={{ fontSize: 12.5, color: '#7a766f', padding: '14px 0', lineHeight: 1.5 }}>{children}</div>;
}

// "Direito Processual Civil" não cabe embaixo de uma barra de 40px.
function abreviar(nome) {
  return nome
    .replace(/^Direito(s)? (Processual )?(d[aoe]s? )?/i, (m) => (/Processual/i.test(m) ? 'Proc. ' : ''))
    .slice(0, 12);
}

export default function Desempenho({ theme, s, perf, setPerf, usuarioTentativas, disciplinas, data, revisao, revisarQuestoes }) {
  const tentativas = usuarioTentativas || {};
  const questoes = data.QUESTOES || [];
  const lista = disciplinas || [];

  const comAtividade = lista.filter((d) => d.tentativas > 0);
  const dominadas = comAtividade.filter((d) => d.status === 'domina');
  const fracas = comAtividade.filter((d) => d.status === 'necessita');

  const totalTentativas = comAtividade.reduce((soma, d) => soma + d.tentativas, 0);
  const totalAcertos = comAtividade.reduce((soma, d) => soma + d.acertos, 0);
  const taxaGeral = totalTentativas > 0 ? Math.round((totalAcertos / totalTentativas) * 100) : null;

  const semanas = SEMANAS[perf.period] || 6;
  const evolucao = evolucaoGeral(tentativas, semanas);
  const pontos = evolucao.filter((e) => e.pct != null);

  const tempos = tempoPorDisciplina(tentativas, questoes).slice(0, 7);

  const stats = [
    { label: 'Taxa de acertos geral', value: taxaGeral != null ? `${taxaGeral}%` : '—', color: theme.primary, sub: totalTentativas > 0 ? `${totalAcertos} de ${totalTentativas} respostas` : 'sem respostas ainda' },
    { label: 'Disciplinas praticadas', value: `${comAtividade.length}`, color: '#1c1b19', sub: `de ${lista.length} no acervo` },
    { label: 'Disciplinas dominadas', value: dominadas.length, color: '#4A7A4A', sub: '80% de acerto ou mais' },
    { label: 'Precisam de reforço', value: fracas.length, color: '#B4413A', sub: 'abaixo de 50%' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14 }}>
        {stats.map((st, i) => (
          <div key={i} style={s.card}>
            <div style={s.statLabel}>{st.label}</div>
            <div style={{ ...s.statNum, marginTop: 6, color: st.color }}>{st.value}</div>
            <div style={{ ...s.statLabel, marginTop: 2 }}>{st.sub}</div>
          </div>
        ))}
      </div>

      {fracas.length > 0 && (
        <div style={s.card}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
            <div style={s.sectionTitle}><Icon name="trending-down" color="#B4413A" size={18} />Onde você mais perde ponto</div>
            {revisao?.errei?.length > 0 && (
              <button
                style={s.btnOutline}
                onClick={() => revisarQuestoes(revisao.errei.map((x) => x.questao))}
              >
                Revisar as {revisao.errei.length} que errei
              </button>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}>
            {fracas.sort((a, b) => a.pct - b.pct).map((d) => (
              <div key={d.nome} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: d.cor, flex: 'none' }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                    <span style={{ color: '#1c1b19', fontWeight: 500 }}>{d.nome}</span>
                    <span style={{ color: '#B4413A', fontWeight: 700 }}>{d.pct}%</span>
                  </div>
                  <div style={{ ...s.progressTrack, marginTop: 5 }}><div style={{ width: d.pct + '%', height: '100%', background: '#B4413A', borderRadius: 5 }} /></div>
                </div>
                <span style={{ fontSize: 11.5, color: '#7a766f', width: 90, textAlign: 'right' }}>
                  {d.acertos}/{d.tentativas} respostas
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {dominadas.length > 0 && (
        <div style={s.card}>
          <div style={s.sectionTitle}><Icon name="trending-up" color="#4A7A4A" size={18} />Você domina {dominadas.length} {dominadas.length === 1 ? 'disciplina' : 'disciplinas'}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
            {dominadas.sort((a, b) => b.pct - a.pct).map((d) => (
              <span key={d.nome} style={s.pill('#E4EEE1', '#355E35')}>{d.nome} · {d.pct}%</span>
            ))}
          </div>
        </div>
      )}

      <div style={s.card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={s.sectionTitle}>Evolução da taxa de acertos</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {Object.keys(SEMANAS).map((p) => (
              <button
                key={p}
                onClick={() => setPerf({ period: p })}
                style={{ background: perf.period === p ? theme.primarySoft : 'transparent', color: perf.period === p ? theme.primaryDark : '#7a766f', border: 'none', borderRadius: 8, padding: '7px 12px', fontSize: 12, fontWeight: 600 }}
              >
                {p} semanas
              </button>
            ))}
          </div>
        </div>
        {pontos.length >= 2 ? (
          <>
            <div style={{ marginTop: 16 }}>
              <AreaLine
                points={evolucao.map((e) => e.pct)}
                labels={evolucao.map((e) => (e.total ? `${e.rotulo} · ${e.total} ${e.total === 1 ? 'questão' : 'questões'}` : e.rotulo))}
                color={theme.primary}
              />
            </div>
            {/* Recuos iguais às margens do gráfico, para os rótulos caírem sob o primeiro e o último ponto. */}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#7a766f', marginTop: 6, padding: '0 40px 0 34px' }}>
              <span style={{ transform: 'translateX(-50%)' }}>{evolucao[0].rotulo}</span>
              <span style={{ transform: 'translateX(50%)' }}>{evolucao[evolucao.length - 1].rotulo}</span>
            </div>
          </>
        ) : (
          <Vazio>
            {pontos.length === 1
              ? `Uma semana com atividade (${pontos[0].pct}% de acerto). O gráfico aparece quando houver uma segunda — comparar precisa de dois pontos.`
              : 'Nenhuma resposta registrada nas últimas semanas. Responda questões para o gráfico começar a existir.'}
          </Vazio>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, alignItems: 'start' }}>
        <div style={s.card}>
          <div style={s.sectionTitle}>Acertos e erros por disciplina</div>
          {comAtividade.length ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
              {[...comAtividade].sort((a, b) => b.tentativas - a.tentativas).map((d) => (
                <div key={d.nome}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 5 }}>
                    <span style={{ color: '#1c1b19' }}>{d.nome}</span>
                    <span style={{ color: '#7a766f' }}>{d.acertos} acertos · {d.tentativas - d.acertos} erros</span>
                  </div>
                  <div style={{ display: 'flex', height: 9, borderRadius: 5, overflow: 'hidden', background: '#eeebe5' }}>
                    <div style={{ width: d.pct + '%', background: '#4A7A4A' }} />
                    <div style={{ width: (100 - d.pct) + '%', background: '#B4413A' }} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <Vazio>Nada respondido ainda. Cada barra aqui é uma disciplina em que você já respondeu ao menos uma questão.</Vazio>
          )}
        </div>

        <div style={s.card}>
          <div style={s.sectionTitle}>Tempo médio por questão</div>
          {tempos.length ? (
            <>
              <div style={{ marginTop: 16 }}>
                <LabeledBars
                  points={tempos.map((t) => t.mediaSeg)}
                  labels={tempos.map((t) => abreviar(t.disciplina))}
                  fullLabels={tempos.map((t) => t.disciplina)}
                  format={formatarDuracao}
                  color={theme.accent}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 12 }}>
                {tempos.map((t) => (
                  <div key={t.disciplina} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                    <span style={{ color: '#4f4b45', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70%' }}>{t.disciplina}</span>
                    <span style={{ fontWeight: 600, color: '#1c1b19' }}>{formatarDuracao(t.mediaSeg)}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <Vazio>
              O tempo é cronometrado entre a questão aparecer e você clicar na alternativa. Responda algumas para esta comparação fazer sentido.
            </Vazio>
          )}
        </div>
      </div>
    </div>
  );
}
