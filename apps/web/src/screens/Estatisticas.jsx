import { estatisticasDoPeriodo, formatarDuracao } from '../lib/metrics';

// Esta tela era inteira uma vitrine. Os quatro cartões de cima liam
//   const mult = { '7d': 0.25, '30d': 1, 'all': 3.4 }[range]
// e mostravam `1248 * mult` questões resolvidas, 73% de acerto e "+12% vs. o
// período anterior" — para qualquer conta, inclusive uma criada há um minuto.
// O seletor de disciplina não filtrava nada, e a rosca de dificuldade dividia
// o acervo em fácil/média/difícil, dado que a FGV não publica.
//
// Agora todo número vem de `estatisticasDoPeriodo`, que filtra as tentativas
// de verdade e só mostra comparação quando existe período anterior com dados.

const PERIODOS = { '7d': 7, '30d': 30, all: null };

function Delta({ valor, sufixo = '%', bom = 'positivo' }) {
  if (valor == null) return <div style={{ fontSize: 11, color: '#8b8391', marginTop: 4 }}>sem período anterior para comparar</div>;

  const positivo = valor >= 0;
  const desejado = bom === 'positivo' ? positivo : !positivo;

  return (
    <div style={{ fontSize: 11, color: valor === 0 ? '#8b8391' : desejado ? '#10B981' : '#EF4444', marginTop: 4 }}>
      {positivo ? '+' : ''}{valor}{sufixo} vs. período anterior
    </div>
  );
}

export default function Estatisticas({ theme, s, data, filtros, setFiltros, usuarioTentativas, disciplinas }) {
  const questoes = data.QUESTOES || [];
  const lista = disciplinas || [];
  const dias = PERIODOS[filtros.range];
  const disciplinaFiltro = filtros.disc === 'Todas' ? null : filtros.disc;

  const est = estatisticasDoPeriodo(usuarioTentativas || {}, { questoes, dias, disciplina: disciplinaFiltro });

  // Cobertura: quantas questões distintas do acervo já foram respondidas.
  // Substitui a rosca de dificuldade, que media uma coisa que não existe.
  const acervoFiltrado = disciplinaFiltro
    ? questoes.filter((q) => (q.disciplina || 'Sem classificação') === disciplinaFiltro)
    : questoes;
  const respondidasNoAcervo = disciplinaFiltro
    ? (lista.find((d) => d.nome === disciplinaFiltro)?.respondidas || 0)
    : lista.reduce((soma, d) => soma + d.respondidas, 0);
  const coberturaPct = acervoFiltrado.length > 0
    ? Math.round((respondidasNoAcervo / acervoFiltrado.length) * 100)
    : 0;

  // Distribuição das RESPOSTAS por disciplina no período — substitui a barra
  // de bancas ("FGV 48%, CEBRASPE 39%") num acervo que só tem FGV.
  const porDisciplina = [...lista]
    .filter((d) => d.tentativas > 0 && (!disciplinaFiltro || d.nome === disciplinaFiltro))
    .sort((a, b) => b.tentativas - a.tentativas)
    .slice(0, 8);
  const maiorVolume = Math.max(1, ...porDisciplina.map((d) => d.tentativas));

  const metrics = [
    { label: 'Respostas registradas', value: est.tentativas.toLocaleString('pt-BR'), delta: est.delta.tentativas, sufixo: '%' },
    { label: 'Taxa de acertos', value: est.pct != null ? `${est.pct}%` : '—', delta: est.delta.pct, sufixo: 'pp' },
    { label: 'Tempo respondendo', value: formatarDuracao(est.tempoTotalSeg) || '—', delta: est.delta.tempoTotalSeg, sufixo: '%' },
    { label: 'Dias ativos', value: est.diasAtivos, delta: est.delta.diasAtivos, sufixo: '%' },
  ];

  const seletor = { fontSize: 13, border: '1px solid rgba(0,0,0,.1)', borderRadius: 9, padding: '8px 12px', color: '#2c2530', background: '#fff', minWidth: 200 };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ ...s.card, display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'end' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <div style={{ fontSize: 11.5, color: '#8b8391' }}>Período</div>
          <select style={seletor} value={filtros.range} onChange={(e) => setFiltros({ range: e.target.value })}>
            <option value="7d">Últimos 7 dias</option>
            <option value="30d">Últimos 30 dias</option>
            <option value="all">Desde o início</option>
          </select>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <div style={{ fontSize: 11.5, color: '#8b8391' }}>Disciplina</div>
          <select style={seletor} value={filtros.disc} onChange={(e) => setFiltros({ disc: e.target.value })}>
            {['Todas', ...lista.map((d) => d.nome)].map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
        <div style={{ fontSize: 11.5, color: '#8b8391', marginLeft: 'auto', maxWidth: 320, lineHeight: 1.5 }}>
          Tudo nesta tela conta apenas as respostas que você registrou — o
          tempo é o que passou entre a questão abrir e a alternativa ser clicada.
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14 }}>
        {metrics.map((m, i) => (
          <div key={i} style={s.card}>
            <div style={s.statLabel}>{m.label}</div>
            <div style={{ ...s.statNum, marginTop: 6 }}>{m.value}</div>
            <Delta valor={m.delta} sufixo={m.sufixo} />
          </div>
        ))}
      </div>

      {est.tentativas === 0 && (
        <div style={{ ...s.card, textAlign: 'center', padding: '32px 20px', color: '#8b8391', fontSize: 13.5, lineHeight: 1.6 }}>
          Nenhuma resposta registrada {filtros.range === 'all' ? 'até agora' : `nos últimos ${dias} dias`}
          {disciplinaFiltro ? ` em ${disciplinaFiltro}` : ''}.
          <br />Os números acima só existem depois que você responde questões.
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, alignItems: 'start' }}>
        <div style={s.card}>
          <div style={s.sectionTitle}>Cobertura do acervo</div>
          <div style={{ fontSize: 12, color: '#8b8391', marginTop: 4 }}>
            Questões distintas que você já respondeu ao menos uma vez.
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginTop: 16 }}>
            <div style={{ width: 100, height: 100, borderRadius: '50%', background: `conic-gradient(${theme.primary} 0% ${coberturaPct}%, #f1eef4 ${coberturaPct}% 100%)`, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
              <div style={{ width: 74, height: 74, borderRadius: '50%', background: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ fontSize: 17, fontWeight: 700 }}>{coberturaPct}%</div>
                <div style={{ fontSize: 9, color: '#8b8391' }}>do acervo</div>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12.5 }}>
              <div>
                <div style={{ color: '#8b8391' }}>Respondidas</div>
                <div style={{ fontWeight: 700, color: '#2c2530' }}>{respondidasNoAcervo} questões</div>
              </div>
              <div>
                <div style={{ color: '#8b8391' }}>No acervo{disciplinaFiltro ? ` (${disciplinaFiltro})` : ''}</div>
                <div style={{ fontWeight: 700, color: '#2c2530' }}>{acervoFiltrado.length} questões</div>
              </div>
            </div>
          </div>
        </div>

        <div style={s.card}>
          <div style={s.sectionTitle}>Onde você mais respondeu</div>
          {porDisciplina.length ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 11, marginTop: 16 }}>
              {porDisciplina.map((d) => (
                <div key={d.nome}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
                    <span style={{ color: '#2c2530', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '72%' }}>{d.nome}</span>
                    <span style={{ color: '#8b8391' }}>{d.tentativas}</span>
                  </div>
                  <div style={{ ...s.progressTrack, marginTop: 5 }}>
                    <div style={{ width: Math.round((d.tentativas / maiorVolume) * 100) + '%', height: '100%', background: d.cor, borderRadius: 5 }} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 12.5, color: '#8b8391', marginTop: 14, lineHeight: 1.5 }}>
              Nada respondido ainda. Esta lista mostra em quais matérias você
              mais praticou, em número de respostas.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
