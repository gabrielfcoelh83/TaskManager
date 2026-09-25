import { useEffect, useState } from 'react';
import { Icon } from '../lib/icons';
import { ICONE_POR_DISCIPLINA } from '../lib/navegacao';
import { corrigirSimulado, origemDaQuestao, situacaoDaResposta, sortearQuestoes, tempoDeProvaMinutos } from '../lib/simulado';
import ConfigSimulado from '../components/ui/ConfigSimulado';
import Cronometro from '../components/ui/Cronometro';

const LETRA = (i) => String.fromCharCode(65 + i);

const SITUACAO = {
  certa: { rotulo: 'Acertou', icone: 'circle-check', cor: '#10B981', borda: '#10B98140', fundo: '#10B98108' },
  errada: { rotulo: 'Errou', icone: 'circle-x', cor: '#EF4444', borda: '#EF444440', fundo: '#EF444408' },
  'em-branco': { rotulo: 'Em branco', icone: 'circle-x', cor: '#F59E0B', borda: '#F59E0B40', fundo: '#F59E0B08' },
};

// Botões escuros do layout LEGJUR — o mesmo tom já usado no hub e no config.
const btnEscuro = { background: '#343a46', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 };

export default function Simulados({ theme, s, data, sim, setSim, setResultadosHistorico, resultados_historico, go, registrarRespostas, praticarDisciplina, acervo, recarregarAcervo }) {
  const preDisciplina = sim?.preDisciplina || null;
  const [etapa, setEtapa] = useState(preDisciplina ? 'config' : 'lista');
  const [simulado, setSimulado] = useState(null);
  const [resultado, setResultado] = useState(null);
  const [filtroRevisao, setFiltroRevisao] = useState('todas');
  const [configInicial, setConfigInicial] = useState(preDisciplina);

  const QUESTOES = data.QUESTOES || [];
  const DISCIPLINAS = data.DISCIPLINAS || [];
  // O `filter(Boolean)` não é defensivo à toa: questão do acervo oficial vem
  // sem disciplina até ser classificada, e sem isto o seletor de simulado
  // ofereceria uma opção em branco que não filtra nada.
  const disciplinasComQuestoes = Array.from(new Set(QUESTOES.map((q) => q.disciplina))).filter(Boolean);

  // A pré-seleção (vinda do "Iniciar Simulado" de Disciplinas) vale para UMA
  // abertura: fica no estado salvo, e sem consumir aqui, quem saísse pelo menu
  // sem iniciar cairia no formulário daquela matéria em toda visita seguinte.
  useEffect(() => {
    if (preDisciplina) setSim({ preDisciplina: null });
    // Só na montagem: o valor já foi copiado para `configInicial`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const abrirConfig = (disciplina = null) => {
    setConfigInicial(disciplina);
    setEtapa('config');
  };

  const iniciarSimulado = (config) => {
    const { tipo, disciplina } = config;
    const pool = sortearQuestoes(QUESTOES, config);
    if (pool.length === 0) return;

    setSimulado({
      id: `sim-${Date.now()}`,
      tipo,
      disciplina,
      quantidade: pool.length,
      questoes_pool: pool,
      tempo_inicio: Date.now(),
      tempo_total_minutos: tempoDeProvaMinutos(pool.length),
      respostas: {},
    });
    setResultado(null);
    setFiltroRevisao('todas');
    setEtapa('execucao');
  };

  const selecionarResposta = (questaoId, respostaIdx) => {
    setSimulado((prev) => ({
      ...prev,
      respostas: { ...prev.respostas, [questaoId]: respostaIdx },
    }));
  };

  const finalizarSimulado = () => {
    // O simulado gravava a nota num histórico local e jogava fora as respostas
    // — então responder 80 questões em prova não mexia em nada no desempenho
    // por disciplina, na taxa de acertos nem na revisão. Cada resposta agora
    // vira uma tentativa no servidor, igual às do quiz.
    //
    // `tempoSeg` vai nulo de propósito: o simulado tem um cronômetro só para a
    // prova inteira, e dividir o total pelo número de questões seria inventar
    // um tempo por questão que ninguém mediu.
    //
    // Vão em fila, não todas juntas: um POST por resposta, ao mesmo tempo,
    // passava do limite do nginx numa prova de 80 questões. A fila corre em
    // segundo plano — a tela de resultado abre na hora — e o App avisa na
    // faixa do topo se alguma não foi salva.
    if (registrarRespostas) {
      const respostas = simulado.questoes_pool
        .filter((q) => simulado.respostas[q.id] !== undefined)   // em branco não é resposta
        .map((q) => ({
          questaoId: q.id,
          correta: simulado.respostas[q.id] === q.correta,
          alternativa: simulado.respostas[q.id],
          tempoSeg: null,
        }));
      registrarRespostas(respostas);
    }

    const correcao = corrigirSimulado(simulado.questoes_pool, simulado.respostas);
    const tempoTotalMinutos = Math.max(1, Math.round((Date.now() - simulado.tempo_inicio) / 60000));

    const novo = {
      id: simulado.id,
      nome: `Simulado ${simulado.tipo === 'geral' ? 'OAB 1ª Fase' : simulado.disciplina}`,
      tipo: simulado.tipo,
      disciplina: simulado.disciplina,
      quantidade: simulado.quantidade,
      acertos: correcao.acertos,
      // `errados` segue sendo "não acertou" (inclui em branco), como as
      // métricas já leem; `em_branco` é o detalhe novo.
      errados: simulado.quantidade - correcao.acertos,
      em_branco: correcao.emBranco,
      nota_final: correcao.nota,
      tempo_total_minutos: tempoTotalMinutos,
      tempo_limite_minutos: simulado.tempo_total_minutos,
      data_conclusao: new Date().toISOString(),
    };

    // Forma funcional: updateSlice faz spread de objetos em partials diretos,
    // o que corromperia um array ({0: ...}); a função substitui o valor inteiro.
    setResultadosHistorico((prev) => [...(prev || []), novo]);
    // O resultado da tela é o desta prova, guardado aqui — não "o último do
    // histórico", que outra aba da mesma conta pode ter acabado de trocar.
    setResultado(novo);
    setEtapa('resultado');
  };

  // ---- ETAPA: Hub (Simulado Geral + Treino por Matéria) ----
  if (etapa === 'lista') {
    const hist = resultados_historico || [];
    const stats = [
      { label: 'Simulados realizados', value: hist.length },
      { label: 'Melhor nota', value: hist.length > 0 ? Math.max(...hist.map((r) => r.nota_final)) + '%' : '-' },
      { label: 'Média de acertos', value: hist.length > 0 ? Math.round(hist.reduce((a, b) => a + b.nota_final, 0) / hist.length) + '%' : '-' },
      { label: 'Tempo total', value: hist.length > 0 ? hist.reduce((a, b) => a + b.tempo_total_minutos, 0) + 'min' : '-' },
    ];
    const materias = DISCIPLINAS.filter((d) => d.classificada !== false && d.total > 0);
    // Lista vazia tem três causas, e só uma é "acervo sem questões": a carga
    // pode estar em curso ou ter falhado. Dizer "ainda não tem questões" a
    // quem teve erro de rede manda a pessoa esperar por algo que não vem.
    const estadoAcervo = acervo?.estado || 'pronto';
    const semAcervo = QUESTOES.length === 0;
    const carregando = semAcervo && estadoAcervo === 'carregando';
    const erroAcervo = semAcervo && estadoAcervo === 'erro';
    const textoHero = carregando
      ? 'Carregando o acervo de questões…'
      : erroAcervo
        ? 'O acervo não carregou, então ainda não há questões para sortear.'
        : semAcervo
          ? 'O acervo ainda não tem questões carregadas.'
          : `Sorteio entre ${QUESTOES.length} ${QUESTOES.length === 1 ? 'questão' : 'questões'} dos Exames de Ordem, com gabarito oficial da FGV e tempo de prova real.`;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14 }}>
          {stats.map((st, i) => (
            <div key={i} style={s.card}>
              <div style={s.statLabel}>{st.label}</div>
              <div style={{ ...s.statNum, marginTop: 4 }}>{st.value}</div>
            </div>
          ))}
        </div>

        {erroAcervo && (
          <div
            role="alert"
            data-testid="simulados-acervo-erro"
            style={{ ...s.card, display: 'flex', alignItems: 'center', gap: 14, background: '#FEF2F2', border: '1px solid #FECACA' }}
          >
            <Icon name="circle-x" color="#DC2626" size={22} />
            <div style={{ flex: 1, fontSize: 13, color: '#B91C1C', lineHeight: 1.5 }}>
              <b>O acervo não carregou.</b> {acervo?.erro ? `${acervo.erro}. ` : ''}As questões vêm do servidor, então sem esta chamada não há simulado.
            </div>
            {recarregarAcervo && (
              <button style={{ ...s.btnPrimary, flex: 'none', cursor: 'pointer' }} onClick={recarregarAcervo}>
                Tentar de novo
              </button>
            )}
          </div>
        )}

        {/* Hero: Simulado Geral */}
        <div data-testid="hero-simulado-geral" style={{ ...s.card, display: 'flex', alignItems: 'center', gap: 20, padding: 24, background: `linear-gradient(120deg, ${theme.gradA}12, ${theme.gradB}10), #fff` }}>
          <div style={{ width: 60, height: 60, borderRadius: 16, background: `linear-gradient(135deg, ${theme.gradA}, ${theme.gradB})`, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
            <Icon name="graduation-cap" color="#fff" size={30} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: '#2c2530' }}>Simulado Geral — OAB 1ª Fase</div>
            <div style={{ fontSize: 13, color: '#8b8391', marginTop: 4, lineHeight: 1.5 }}>
              {textoHero}
            </div>
          </div>
          <button
            data-testid="novo-simulado"
            onClick={() => abrirConfig(null)}
            disabled={semAcervo}
            style={{ ...btnEscuro, padding: '13px 22px', borderRadius: 10, fontSize: 13.5, flex: 'none', opacity: semAcervo ? 0.5 : 1, cursor: semAcervo ? 'not-allowed' : 'pointer' }}
          >
            <Icon name="play" color="#fff" size={13} /> Iniciar Simulado
          </button>
        </div>

        {/* Treino por Matéria — some com o erro do acervo: o aviso acima já
            diz o que falta, e um título sem nada embaixo parece tela quebrada. */}
        {!erroAcervo && (
          <div>
            <div style={{ textAlign: 'center', margin: '8px 0 4px' }}>
              <div style={{ fontSize: 21, fontWeight: 700, color: '#2c2530' }}>Treino por Matéria</div>
              <div style={{ width: 120, height: 3, borderRadius: 2, margin: '8px auto 0', background: `linear-gradient(90deg, ${theme.gradA}, ${theme.gradB})` }} />
            </div>

            {/* As matérias aqui eram uma lista fixa de oito nomes; hoje vêm do
                acervo real. Questão ainda sem disciplina (o enriquecimento não
                passou) não forma card: ela só entra no simulado geral. */}
            {carregando ? (
              <div data-testid="treino-carregando" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16, marginTop: 18 }}>
                {[0, 1, 2].map((i) => <div key={i} className="esqueleto" style={{ height: 170, borderRadius: 16 }} />)}
              </div>
            ) : materias.length === 0 ? (
              <div data-testid="treino-vazio" style={{ ...s.card, textAlign: 'center', padding: '32px 20px', color: '#8b8391', fontSize: 13.5, marginTop: 18, lineHeight: 1.6 }}>
                {semAcervo
                  ? 'Nenhuma disciplina no acervo ainda.'
                  : 'As questões do acervo ainda não foram separadas por matéria. Enquanto isso, o Simulado Geral usa todas elas.'}
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16, marginTop: 18 }}>
                {materias.map((d) => (
                  <div key={d.nome} data-testid="card-materia" style={{ ...s.card, display: 'flex', flexDirection: 'column', gap: 12, padding: 22 }}>
                    <div style={{ width: 52, height: 52, borderRadius: 14, background: `${d.cor}1e`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Icon name={ICONE_POR_DISCIPLINA[d.nome] || 'library'} color={d.cor} size={26} />
                    </div>
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: '#2c2530' }}>{d.nome}</div>
                      <div style={{ fontSize: 12.5, color: '#8b8391', marginTop: 3 }}>
                        {d.total} {d.total === 1 ? 'questão' : 'questões'} no acervo
                        {d.pct != null ? ` · ${d.pct}% de acerto seu` : ''}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 'auto' }}>
                      <button
                        data-testid="simular-materia"
                        onClick={() => abrirConfig(d.nome)}
                        style={{ ...btnEscuro, flex: 1, padding: '10px 12px', borderRadius: 9, fontSize: 12.5, gap: 7, whiteSpace: 'nowrap' }}
                      >
                        <Icon name="graduation-cap" color="#fff" size={13} /> Iniciar Simulado
                      </button>
                      {/* Mesmo nome e destino do "Praticar" de Disciplinas: o quiz da matéria. */}
                      <button
                        data-testid="praticar-materia"
                        onClick={() => (praticarDisciplina ? praticarDisciplina(d.nome) : go && go('questoes'))}
                        style={{ padding: '10px 14px', background: '#fff', color: '#5c5462', border: '1px solid #e3e7ee', borderRadius: 9, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
                      >
                        <Icon name="play" color="#5c5462" size={12} /> Praticar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Histórico */}
        {hist.length > 0 && (
          <div style={s.card}>
            <div style={s.sectionTitle}><Icon name="chart-column" color={theme.primary} size={18} />Histórico de Simulados</div>
            <div style={{ fontSize: 11.5, color: '#8b8391', marginTop: 6, lineHeight: 1.5 }}>
              As respostas de cada simulado entram no seu histórico no servidor
              e contam no desempenho por disciplina. Já a nota final da prova
              fica guardada neste navegador — ainda não existe rota de simulado
              na API.
            </div>
            {hist.slice().reverse().map((r) => (
              <div key={r.id} style={{ padding: 12, borderBottom: '1px solid rgba(0,0,0,.05)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{r.nome}</div>
                    <div style={{ fontSize: 12, color: '#8b8391', marginTop: 4 }}>
                      {r.acertos}/{r.quantidade} acertos • {r.tempo_total_minutos}min
                      {r.data_conclusao ? ` • ${new Date(r.data_conclusao).toLocaleDateString('pt-BR')}` : ''}
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

  // ---- ETAPA: Configuração ("Vamos começar!") ----
  if (etapa === 'config') {
    return (
      <div>
        <button
          onClick={() => setEtapa('lista')}
          style={{ marginBottom: 16, padding: '8px 14px', border: '1px solid #e3e7ee', background: '#fff', color: '#5c5462', borderRadius: 8, fontSize: 12.5, cursor: 'pointer', fontWeight: 600 }}
        >
          ← Voltar
        </button>
        <ConfigSimulado
          theme={theme}
          s={s}
          onConfirm={iniciarSimulado}
          disciplinas={disciplinasComQuestoes}
          questoes={QUESTOES}
          disciplinaInicial={configInicial}
        />
      </div>
    );
  }

  // ---- ETAPA: Execução (todas as questões em uma página, sem feedback) ----
  if (etapa === 'execucao' && simulado) {
    const respondidas = Object.keys(simulado.respostas).length;
    const pctRespondidas = simulado.quantidade ? (respondidas / simulado.quantidade) * 100 : 0;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18, position: 'relative' }}>
        <div style={{ ...s.card, textAlign: 'center', padding: 20 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#2c2530' }}>
            {simulado.tipo === 'geral' ? 'Simulado Geral — OAB 1ª Fase' : `Simulado — ${simulado.disciplina}`}
          </div>
          <div style={{ fontSize: 13, color: '#8b8391', marginTop: 4 }}>
            Você selecionou <b style={{ color: '#2c2530' }}>{simulado.quantidade} {simulado.quantidade === 1 ? 'questão' : 'questões'}</b>. Gerencie seu tempo e boa sorte!
          </div>
          <div style={{ fontSize: 12, color: '#8b8391', marginTop: 6 }}>
            Sem correção durante a prova — o gabarito aparece quando você finalizar.
          </div>
        </div>

        {simulado.questoes_pool.map((q, i) => (
          <div key={q.id} data-testid={`sim-q-${i}`} style={s.card}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingBottom: 14, borderBottom: '1px solid #eef0f4', flexWrap: 'wrap' }}>
              <span style={{ background: theme.primarySoft, color: theme.primaryDark, fontWeight: 700, fontSize: 12.5, padding: '5px 14px', borderRadius: 8 }}>
                Questão {i + 1}
              </span>
              {/* Procedência real (exame, número, banca) — a mesma do quiz. */}
              <span data-testid="origem-da-questao" style={{ fontSize: 11.5, color: '#8b93a1', fontWeight: 600, letterSpacing: '.3px', textTransform: 'uppercase' }}>
                {origemDaQuestao(q)}
              </span>
              {q.disciplina && simulado.tipo === 'geral' && (
                <span style={{ ...s.pill(theme.primarySoft, theme.primaryDark), marginLeft: 'auto' }}>{q.disciplina}</span>
              )}
            </div>

            <div style={{ fontSize: 14.5, color: '#2c2530', lineHeight: 1.65, margin: '16px 0', whiteSpace: 'pre-wrap' }}>{q.enunciado}</div>

            <div role="radiogroup" aria-label={`Alternativas da questão ${i + 1}`} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {q.alternativas.map((alt, idx) => {
                const escolhida = simulado.respostas[q.id] === idx;
                return (
                  <button
                    key={idx}
                    role="radio"
                    aria-checked={escolhida}
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
                      transition: 'all 0.15s',
                    }}
                  >
                    <div style={{
                      width: 18, height: 18, borderRadius: '50%', flex: 'none',
                      border: escolhida ? `5px solid ${theme.primary}` : '2px solid #cfd6e0',
                      background: '#fff', boxSizing: 'border-box',
                    }} />
                    <b style={{ color: escolhida ? theme.primaryDark : '#8b8391', flex: 'none' }}>{LETRA(idx)})</b>
                    <div>{alt}</div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        {/* Barra fixa inferior: cronômetro, contador e Finalizar */}
        <div
          data-testid="barra-simulado"
          style={{
            position: 'sticky', bottom: 12, zIndex: 20,
            background: '#fff', border: '1px solid rgba(0,0,0,.06)', borderRadius: 14,
            boxShadow: '0 6px 24px rgba(0,0,0,.12)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
            padding: '12px 20px',
          }}
        >
          <Cronometro tempoTotalMinutos={simulado.tempo_total_minutos} aoTerminar={finalizarSimulado} />
          <div style={{ flex: 1, maxWidth: 260, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <div data-testid="contador-respondidas" style={{ fontSize: 13, color: '#5c5462', fontWeight: 600 }}>
              {respondidas}/{simulado.quantidade} respondidas
            </div>
            <div style={{ ...s.progressTrack, height: 6, width: '100%' }}>
              <div style={{ width: `${pctRespondidas}%`, height: '100%', background: `linear-gradient(90deg, ${theme.gradA}, ${theme.gradB})`, borderRadius: 5, transition: 'width 200ms' }} />
            </div>
          </div>
          <button
            data-testid="finalizar-simulado"
            onClick={finalizarSimulado}
            style={{ ...btnEscuro, padding: '11px 24px', borderRadius: 24, fontSize: 13.5 }}
          >
            Finalizar <Icon name="check" color="#fff" size={16} />
          </button>
        </div>
      </div>
    );
  }

  // ---- ETAPA: Resultado + revisão questão a questão ----
  if (etapa === 'resultado' && simulado && resultado) {
    const correcao = corrigirSimulado(simulado.questoes_pool, simulado.respostas);
    const nota = resultado.nota_final;
    const faixa = nota >= 70
      ? { icone: 'trophy', cor: '#10B981', fundo: '#D1FAE5' }
      : nota >= 50
        ? { icone: 'target', cor: '#F59E0B', fundo: '#FEF3C7' }
        : { icone: 'trending-up', cor: '#EF4444', fundo: '#FEE2E2' };

    const itens = simulado.questoes_pool
      .map((q, i) => ({ q, i, situacao: situacaoDaResposta(q, simulado.respostas) }))
      .filter((it) => filtroRevisao === 'todas'
        || (filtroRevisao === 'erradas' && it.situacao !== 'certa'));

    const resumo = [
      { rotulo: 'Acertos', valor: correcao.acertos, cor: '#10B981' },
      { rotulo: 'Erros', valor: correcao.erros, cor: '#EF4444' },
      { rotulo: 'Em branco', valor: correcao.emBranco, cor: '#F59E0B' },
      { rotulo: 'Tempo', valor: `${resultado.tempo_total_minutos} min`, cor: '#2c2530' },
    ];

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ ...s.card, textAlign: 'center', padding: 28 }}>
          <div style={{ width: 76, height: 76, borderRadius: '50%', margin: '0 auto', background: faixa.fundo, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name={faixa.icone} color={faixa.cor} size={38} />
          </div>
          <div style={{ fontSize: 14, color: '#8b8391', marginTop: 8 }}>Nota final</div>
          <div data-testid="nota-final" style={{ fontSize: 48, fontWeight: 700, color: theme.primary }}>{nota}%</div>
          <div style={{ fontSize: 13, marginTop: 4, color: '#5c5462' }}>{resultado.acertos} acertos em {resultado.quantidade} questões</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginTop: 20, maxWidth: 520, marginLeft: 'auto', marginRight: 'auto' }}>
            {resumo.map((r) => (
              <div key={r.rotulo} style={{ background: '#faf9fb', borderRadius: 12, padding: '10px 6px' }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: r.cor }}>{r.valor}</div>
                <div style={s.statLabel}>{r.rotulo}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={s.card}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div style={s.sectionTitle}><Icon name="clipboard-list" color={theme.primary} size={18} />Revisão do simulado</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {[['todas', 'Todas'], ['erradas', 'Erradas e em branco']].map(([k, rotulo]) => (
                <button
                  key={k}
                  data-testid={`revisao-${k}`}
                  onClick={() => setFiltroRevisao(k)}
                  style={{
                    padding: '6px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    border: `1px solid ${filtroRevisao === k ? theme.primary : '#e3e7ee'}`,
                    background: filtroRevisao === k ? theme.primarySoft : '#fff',
                    color: filtroRevisao === k ? theme.primaryDark : '#5c5462',
                  }}
                >
                  {rotulo}
                </button>
              ))}
            </div>
          </div>

          {itens.length === 0 && (
            <div style={{ fontSize: 13, color: '#8b8391', marginTop: 14 }}>Nenhuma questão errada ou em branco. Gabaritou!</div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 14 }}>
            {itens.map(({ q, i, situacao }) => {
              const sit = SITUACAO[situacao];
              const resposta = simulado.respostas[q.id];
              return (
                <div key={q.id} data-testid={`revisao-q-${i}`} style={{ padding: 16, borderRadius: 12, border: `1px solid ${sit.borda}`, background: sit.fundo }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <Icon name={sit.icone} color={sit.cor} size={18} />
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#2c2530' }}>Questão {i + 1}</span>
                    <span style={{ fontSize: 11.5, color: sit.cor, fontWeight: 700 }}>{sit.rotulo}</span>
                    <span style={{ fontSize: 11, color: '#8b93a1', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.3px' }}>{origemDaQuestao(q)}</span>
                    {q.disciplina && <span style={{ ...s.pill('#fff', '#5c5462'), marginLeft: 'auto' }}>{q.disciplina}</span>}
                  </div>
                  <div style={{ fontSize: 13, color: '#5c5462', marginTop: 8, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{q.enunciado}</div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
                    {q.alternativas.map((alt, idx) => {
                      const eGabarito = idx === q.correta;
                      const eMarcada = idx === resposta;
                      const cor = eGabarito ? '#10B981' : eMarcada ? '#EF4444' : null;
                      return (
                        <div
                          key={idx}
                          style={{
                            display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12.5, lineHeight: 1.5,
                            padding: '7px 10px', borderRadius: 8, background: '#fff',
                            border: `1px solid ${cor ? cor + '60' : '#eef0f4'}`,
                            color: '#2c2530',
                          }}
                        >
                          <b style={{ color: cor || '#8b8391', flex: 'none' }}>{LETRA(idx)})</b>
                          <span style={{ flex: 1 }}>{alt}</span>
                          {eGabarito && <span style={{ fontSize: 11, fontWeight: 700, color: '#10B981', flex: 'none' }}>Gabarito</span>}
                          {eMarcada && !eGabarito && <span style={{ fontSize: 11, fontWeight: 700, color: '#EF4444', flex: 'none' }}>Sua resposta</span>}
                        </div>
                      );
                    })}
                  </div>

                  {/* Mesma etiqueta do quiz: explicação que não passou por
                      revisão humana é avisada antes de a pessoa decorar. */}
                  {q.explicacao && (
                    <div style={{ fontSize: 12.5, color: '#5c5462', marginTop: 10, padding: 12, background: '#fff', borderRadius: 8, lineHeight: 1.55 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                        <Icon name="lightbulb" color="#F59E0B" size={15} />
                        <b style={{ color: '#2c2530' }}>Por que essa é a resposta</b>
                        {!q.revisada && (
                          <span data-testid="explicacao-nao-revisada" style={s.pill('#FEF3C7', '#B45309')}>
                            {q.explicacaoFonte === 'ia' ? 'Gerada por IA · não revisada' : 'Não revisada'}
                          </span>
                        )}
                      </div>
                      {q.explicacao}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <button
          data-testid="voltar-simulados"
          onClick={() => { setSimulado(null); setResultado(null); setEtapa('lista'); }}
          style={{ ...btnEscuro, padding: 13, borderRadius: 10, fontSize: 14 }}
        >
          Voltar para simulados
        </button>
      </div>
    );
  }

  return null;
}
