import { useState } from 'react';
import { Icon } from '../lib/icons';
import { MOTIVOS_DO_ERRO, NOTA_DO_MOTIVO_MAX, rotuloDoMotivo } from '../lib/revisao';

// A tela tinha cinco abas e nenhuma filtrava.
//
//   let filtered = all;
//   if (rev.tab === 'favoritas') filtered = all.filter(...)
//   if (rev.tab === 'menor')     filtered = [...all].sort((a,b) => a.id - b.id).slice(0,3)
//
// "Errei" e "Marcadas" caíam no `all` e listavam o acervo inteiro; "Menor
// desempenho" ordenava por id, que não mede desempenho nenhum. Os quatro
// números do topo (212, 48, 36, 15) eram constantes, e cada linha da lista
// ganhava a etiqueta vermelha "Errei" mesmo em questão acertada.
//
// Agora cada aba é uma lista de verdade, vinda de `classificarRevisao`.

const ABAS = [
  { key: 'todas', label: 'Para revisar', lista: (r) => r.todas },
  { key: 'errei', label: 'Errei', lista: (r) => r.errei },
  { key: 'favoritas', label: 'Favoritas', lista: (r) => r.favoritas },
  { key: 'aberto', label: 'Nunca respondi', lista: (r) => r.emAberto },
  { key: 'menor', label: 'Menor desempenho', lista: (r) => r.menorDesempenho },
];

const SITUACAO = {
  errou: { rotulo: 'Errei', bg: '#F6E4E1', fg: '#8F2F29' },
  acertou: { rotulo: 'Acertei', bg: '#E4EEE1', fg: '#355E35' },
  'em-aberto': { rotulo: 'Não respondida', bg: '#f1efea', fg: '#4f4b45' },
};

// Ladrilho do ícone: fundo com um véu da cor e o ícone na própria cor, em vez
// de ícone branco sobre degradê saturado.
function iw(_from, to) {
  return { width: 36, height: 36, borderRadius: 8, background: `${to}14`, color: to, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' };
}

function dot(c) {
  return { width: 8, height: 8, borderRadius: '50%', background: c, display: 'inline-block' };
}

// "Por que errei?" — a anotação do Caderno de Erros, presa à última tentativa
// (a errada). Opcional: fechado, é um link discreto; aberto, os motivos da
// lista e uma nota livre. Salvar sem nada escolhido apaga a anotação.
function MotivoDoErro({ theme, s, questaoId, tentativa, anotarMotivo }) {
  const [aberto, setAberto] = useState(false);
  const [motivo, setMotivo] = useState(tentativa.motivo || null);
  const [nota, setNota] = useState(tentativa.motivo_nota || '');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState(null);

  const temAnotacao = Boolean(tentativa.motivo || tentativa.motivo_nota);

  const abrir = () => {
    // Reabre com o que está salvo, não com o rascunho de uma edição cancelada.
    setMotivo(tentativa.motivo || null);
    setNota(tentativa.motivo_nota || '');
    setErro(null);
    setAberto(true);
  };

  const salvar = async () => {
    setSalvando(true);
    setErro(null);
    const falha = await anotarMotivo(questaoId, tentativa.id, { motivo, nota });
    setSalvando(false);
    if (falha) setErro(falha);
    else setAberto(false);
  };

  if (!aberto) {
    return temAnotacao ? (
      <div data-testid={`motivo-${questaoId}`} style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', fontSize: 12.5 }}>
        <span style={{ color: '#7a766f' }}>Por que errei:</span>
        {tentativa.motivo && <span style={s.pill('#F6E4E1', '#8F2F29')}>{rotuloDoMotivo(tentativa.motivo)}</span>}
        {tentativa.motivo_nota && <span style={{ color: '#4f4b45', fontStyle: 'italic' }}>{tentativa.motivo_nota}</span>}
        <button data-testid={`motivo-editar-${questaoId}`} onClick={abrir} style={{ background: 'none', border: 'none', color: theme.primaryDark, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', padding: 0 }}>
          Editar
        </button>
      </div>
    ) : (
      <button data-testid={`motivo-abrir-${questaoId}`} onClick={abrir} style={{ alignSelf: 'flex-start', background: 'none', border: 'none', color: theme.primaryDark, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', padding: 0 }}>
        + Por que errei? <span style={{ fontWeight: 400, color: '#7a766f' }}>(opcional)</span>
      </button>
    );
  }

  return (
    <div data-testid={`motivo-form-${questaoId}`} style={{ display: 'flex', flexDirection: 'column', gap: 10, borderTop: '1px solid rgba(0,0,0,.06)', paddingTop: 12 }}>
      <div style={{ fontSize: 12.5, fontWeight: 600, color: '#1c1b19' }}>Por que você errou esta questão?</div>
      <div role="radiogroup" aria-label="Motivo do erro" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {MOTIVOS_DO_ERRO.map((m) => {
          const escolhido = motivo === m.valor;
          return (
            <button
              key={m.valor}
              role="radio"
              aria-checked={escolhido}
              data-testid={`motivo-opcao-${m.valor}`}
              // Clicar no escolhido desmarca: dá para salvar só a nota.
              onClick={() => setMotivo(escolhido ? null : m.valor)}
              style={{
                background: escolhido ? theme.primarySoft : '#fff',
                color: escolhido ? theme.primaryDark : '#4f4b45',
                border: escolhido ? 'none' : '1px solid rgba(0,0,0,.08)',
                borderRadius: 10, padding: '7px 12px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
              }}
            >
              {m.rotulo}
            </button>
          );
        })}
      </div>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#7a766f' }}>
        Anotação (opcional)
        <textarea
          data-testid={`motivo-nota-${questaoId}`}
          value={nota}
          maxLength={NOTA_DO_MOTIVO_MAX}
          rows={2}
          placeholder="Ex.: troquei usucapião ordinária e extraordinária"
          onChange={(e) => setNota(e.target.value)}
          style={{ font: 'inherit', fontSize: 13, color: '#1c1b19', border: '1px solid rgba(0,0,0,.12)', borderRadius: 8, padding: '8px 10px', resize: 'vertical' }}
        />
        <span style={{ alignSelf: 'flex-end' }}>{nota.length}/{NOTA_DO_MOTIVO_MAX}</span>
      </label>
      {erro && <div role="alert" style={{ fontSize: 12.5, color: '#8F2F29' }}>{erro}</div>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button data-testid={`motivo-salvar-${questaoId}`} disabled={salvando} onClick={salvar} style={{ ...s.btnPrimary, opacity: salvando ? 0.6 : 1 }}>
          {salvando ? 'Salvando…' : 'Salvar'}
        </button>
        <button disabled={salvando} onClick={() => setAberto(false)} style={s.btnOutline}>
          Cancelar
        </button>
      </div>
    </div>
  );
}

export default function Revisoes({ theme, s, rev, setRev, favoritos, toggleFavorito, revisao, disciplinas, revisarQuestoes, anotarMotivo }) {
  const resumo = revisao.resumo;
  const marcados = new Set((favoritos || []).map(String));

  const aba = ABAS.find((a) => a.key === rev.tab) || ABAS[0];
  const itens = aba.lista(revisao) || [];

  const stats = [
    { iconWrap: iw('#B4413A', '#9E3630'), icon: 'circle-x', value: resumo.erros, label: 'Errei na última vez' },
    { iconWrap: iw(theme.gradA, theme.gradB), icon: 'star', value: resumo.favoritas, label: 'Favoritas' },
    { iconWrap: iw('#9CA3AF', '#6B7280'), icon: 'bookmark', value: resumo.emAberto, label: 'Nunca respondidas' },
    { iconWrap: iw('#4A7A4A', '#3E6B3E'), icon: 'check', value: resumo.acertos, label: 'Acertei na última vez' },
  ];

  // A rosca mede o acervo inteiro: acertadas, erradas e ainda em aberto. A
  // anterior era `conic-gradient(#4A7A4A 0% 68%, ...)` — um desenho fixo.
  const totalAcervo = Math.max(1, resumo.acervo);
  const fatiaAcertos = Math.round((resumo.acertos / totalAcervo) * 100);
  const fatiaErros = Math.round((resumo.erros / totalAcervo) * 100);

  const piores = (disciplinas || [])
    .filter((d) => d.pct != null)
    .sort((a, b) => a.pct - b.pct)
    .slice(0, 5);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2.2fr) minmax(0, 1fr)', gap: 18, alignItems: 'start' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14 }}>
          {stats.map((st, i) => (
            <div key={i} style={s.card}>
              <div style={{ fontSize: 12.5, color: '#7a766f' }}>{st.label}</div>
              <div style={{ ...s.statNum, fontSize: 30, marginTop: 6 }}>{st.value}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          {ABAS.map((t) => {
            const quantas = (t.lista(revisao) || []).length;
            return (
              <button
                key={t.key}
                data-testid={`aba-${t.key}`}
                onClick={() => setRev({ tab: t.key })}
                style={{
                  background: rev.tab === t.key ? theme.primarySoft : '#fff',
                  color: rev.tab === t.key ? theme.primaryDark : '#4f4b45',
                  border: rev.tab === t.key ? 'none' : '1px solid rgba(0,0,0,.08)',
                  borderRadius: 10, padding: '9px 14px', fontSize: 12.5, fontWeight: 600,
                }}
              >
                {t.label} <span style={{ opacity: 0.6 }}>{quantas}</span>
              </button>
            );
          })}

          {itens.length > 0 && (
            <button
              data-testid="revisar-tudo"
              style={{ ...s.btnPrimary, marginLeft: 'auto' }}
              onClick={() => revisarQuestoes(itens.map((x) => x.questao))}
            >
              <Icon name="play" color="#fff" size={13} /> Revisar {itens.length === 1 ? 'a questão' : `as ${itens.length}`}
            </button>
          )}
        </div>

        {(aba.key === 'errei' || aba.key === 'todas') && resumo.errosSemMotivo > 0 && (
          <div data-testid="lembrete-motivo" style={{ fontSize: 12.5, color: '#7a766f', lineHeight: 1.5 }}>
            {resumo.errosSemMotivo === 1 ? '1 erro sem motivo anotado' : `${resumo.errosSemMotivo} erros sem motivo anotado`}.
            {' '}Anotar é opcional, mas mostra se o problema é conteúdo ou atenção.
          </div>
        )}

        {itens.length === 0 ? (
          <div style={{ ...s.card, textAlign: 'center', padding: '40px 20px', color: '#7a766f', fontSize: 13.5, lineHeight: 1.6 }}>
            {rev.tab === 'errei' && 'Nenhuma questão errada na última tentativa. Quando você errar alguma, ela aparece aqui.'}
            {rev.tab === 'favoritas' && 'Você ainda não marcou nenhuma questão com a estrela.'}
            {rev.tab === 'aberto' && 'Você já respondeu todas as questões do acervo pelo menos uma vez.'}
            {rev.tab === 'menor' && 'Ainda não há histórico para ordenar por desempenho.'}
            {rev.tab === 'todas' && 'Nada para revisar: você não errou nada na última tentativa e não marcou nenhuma questão.'}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {itens.map((item, i) => {
              const q = item.questao;
              const sit = SITUACAO[item.situacao];
              const favorita = marcados.has(String(q.id));

              // O motivo é da tentativa errada; sem id (resposta ainda não
              // confirmada pelo servidor) não há onde gravá-lo.
              const podeAnotar = item.situacao === 'errou' && item.ultima?.id != null && anotarMotivo;

              return (
                <div key={q.id} data-testid={`revisao-item-${q.id}`} style={{ ...s.card, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: theme.primarySoft, color: theme.primaryDark, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, flex: 'none' }}>{i + 1}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#1c1b19' }}>
                      {q.disciplina || (q.exame ? `${q.exame}º Exame de Ordem` : 'Sem classificação')}
                    </div>
                    <div data-testid={`revisao-enunciado-${q.id}`} style={{ fontSize: 13, color: '#4f4b45', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{q.enunciado}</div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                      {q.exame && <span style={s.pill('#f1efea', '#7a766f')}>{q.exame}º Exame · questão {q.numero}</span>}
                      {q.topico && <span style={s.pill('#f1efea', '#7a766f')}>{q.topico}</span>}
                      {item.tentativas > 0 && (
                        <span style={s.pill('#f1efea', '#7a766f')}>
                          {item.acertos}/{item.tentativas} {item.tentativas === 1 ? 'tentativa' : 'tentativas'} · {item.pct}%
                        </span>
                      )}
                    </div>
                  </div>
                  <span style={s.pill(sit.bg, sit.fg)}>{sit.rotulo}</span>
                  <button
                    data-testid={`fav-toggle-${q.id}`}
                    title={favorita ? 'Desmarcar' : 'Marcar como favorita'}
                    style={{ background: 'none', border: 'none', flex: 'none', cursor: 'pointer' }}
                    onClick={() => toggleFavorito(q.id)}
                  >
                    <Icon name="star" color={favorita ? '#B07A1F' : '#cfcac2'} size={19} />
                  </button>
                  <button data-testid={`revisar-${q.id}`} style={{ ...s.btnOutline, display: "flex", alignItems: "center", gap: 6, flex: "none" }} onClick={() => revisarQuestoes([q])}>
                    <Icon name="play" color="#1c1b19" size={12} /> Revisar
                  </button>
                </div>
                {podeAnotar && (
                  // `key` pela tentativa: errar de novo traz outra tentativa, e
                  // o formulário recomeça vazio em vez de herdar o estado da
                  // anterior.
                  <MotivoDoErro
                    key={item.ultima.id}
                    theme={theme}
                    s={s}
                    questaoId={q.id}
                    tentativa={item.ultima}
                    anotarMotivo={anotarMotivo}
                  />
                )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={s.card}>
          <div style={s.sectionTitle}>Onde você está no acervo</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 16 }}>
            <div style={{ width: 88, height: 88, borderRadius: '50%', background: `conic-gradient(#4A7A4A 0% ${fatiaAcertos}%, #B4413A ${fatiaAcertos}% ${fatiaAcertos + fatiaErros}%, #e6e2da ${fatiaAcertos + fatiaErros}% 100%)`, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
              <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#1c1b19' }}>{resumo.pct != null ? `${resumo.pct}%` : '—'}</div>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12.5, flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={dot('#4A7A4A')}></span>Acertei <b style={{ marginLeft: 'auto' }}>{resumo.acertos}</b></div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={dot('#B4413A')}></span>Errei <b style={{ marginLeft: 'auto' }}>{resumo.erros}</b></div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={dot('#cfcac2')}></span>Em aberto <b style={{ marginLeft: 'auto' }}>{resumo.emAberto}</b></div>
            </div>
          </div>
          <div style={{ fontSize: 11.5, color: '#7a766f', marginTop: 12, lineHeight: 1.5 }}>
            Conta a ÚLTIMA tentativa de cada uma das {resumo.acervo} questões do acervo — quem errou e depois acertou já saiu da lista de revisão.
          </div>
        </div>

        <div style={s.card}>
          <div style={s.sectionTitle}>Disciplinas com menor desempenho</div>
          {piores.length ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 11, marginTop: 14 }}>
              {piores.map((d) => (
                <div key={d.nome}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
                    <span style={{ color: '#1c1b19', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '75%' }}>{d.nome}</span>
                    <span style={{ color: '#7a766f' }}>{d.pct}%</span>
                  </div>
                  <div style={{ ...s.progressTrack, marginTop: 5 }}><div style={{ width: d.pct + '%', height: '100%', background: '#B4413A', borderRadius: 5 }} /></div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 12.5, color: '#7a766f', marginTop: 12, lineHeight: 1.5 }}>
              Nenhuma disciplina tem resposta registrada ainda.
            </div>
          )}
        </div>

        <div style={{ ...s.card, borderLeft: `3px solid ${theme.accent}`, borderRadius: 8, padding: '16px 18px', color: '#1c1b19' }}>
          <div style={{ fontSize: 14.5, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="lightbulb" color={theme.accent} size={18} />Sobre as favoritas
          </div>
          <div style={{ fontSize: 12.5, marginTop: 8, color: '#5f5b55', lineHeight: 1.5 }}>
            A estrela fica guardada neste navegador — ainda não existe rota de
            favorito na API, então ela não segue você para outro aparelho.
          </div>
        </div>
      </div>
    </div>
  );
}
