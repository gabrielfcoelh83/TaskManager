import { Icon } from '../lib/icons';
import { planoDaSemana, diasDoMes, resumoDoPlano } from '../lib/agenda';
import { diasAteProva } from '../lib/metrics';
import { ICONE_POR_DISCIPLINA } from '../lib/navegacao';

// O que esta tela mostrava antes: "Período do cronograma: 180 dias", "Início
// do plano: 03/03/2025", "Término previsto: 09/08/2025", "65% do plano
// concluído", "78 de 180 dias", "312h 45m estudadas", "4.312 questões
// respondidas", um calendário de maio de 2025 com o dia 13 aceso, e sete dias
// de plano fixos. Nenhum desses números existia em lugar nenhum — e o botão
// "Iniciar estudo" só somava 40% numa barra local.
//
// O que ela mostra agora: uma SUGESTÃO de semana (derivada do que você erra
// mais) e um REGISTRO do que você fez (derivado das tentativas). O botão abre
// a disciplina do dia na tela de questões.

const SEMANA = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

export default function Cronograma({ theme, s, usuarioTentativas, disciplinas, config, praticarDisciplina, go }) {
  const meta = Number(config?.meta) > 0 ? Number(config.meta) : 20;
  const plano = planoDaSemana({ disciplinas, tentativas: usuarioTentativas, meta });
  const calendario = diasDoMes(usuarioTentativas);
  const resumo = resumoDoPlano({ tentativas: usuarioTentativas, disciplinas });
  const faltam = diasAteProva(config);

  const cabecalho = [
    { rotulo: 'Meta diária', valor: `${meta} questões` },
    { rotulo: 'Respondidas hoje', valor: `${resumo.hojeRespondidas}` },
    { rotulo: 'Dias com estudo', valor: `${resumo.diasAtivos}` },
    { rotulo: 'Prova', valor: faltam != null ? `em ${faltam} dias` : 'sem data' },
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '2.2fr 1fr', gap: 18, alignItems: 'start' }}>
      <div style={s.card}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, justifyContent: 'space-between', alignItems: 'center', paddingBottom: 16, borderBottom: '1px solid rgba(0,0,0,.06)' }}>
          {cabecalho.map((c) => (
            <div key={c.rotulo} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <div style={{ fontSize: 11.5, color: '#8b8391' }}>{c.rotulo}</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#2c2530' }}>{c.valor}</div>
            </div>
          ))}
          <button style={{ ...s.btnOutline, display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => go('configuracoes')}>
            <Icon name="pencil" color={theme.primary} size={13} />Ajustar meta e data
          </button>
        </div>

        <div style={{ marginTop: 16, fontSize: 12.5, color: '#8b8391', lineHeight: 1.55 }}>
          A ordem abaixo é uma <b style={{ color: '#5c5462' }}>sugestão</b>, montada a
          partir do seu desempenho: primeiro o que você erra mais, depois o que
          ainda não respondeu. Não é um plano fechado — estude na ordem que
          quiser.
        </div>

        {plano.every((d) => !d.disciplina) ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: '#8b8391', fontSize: 13.5, lineHeight: 1.6 }}>
            Nenhuma disciplina classificada no acervo ainda — sem isso não dá
            para sugerir uma ordem de estudo.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
            {plano.map((d) => (
              <div
                key={d.chave}
                data-testid={`dia-${d.chave}`}
                style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 14, borderRadius: 12, background: d.hoje ? theme.primarySoft : '#faf9fb', flexWrap: 'wrap' }}
              >
                <div style={{ width: 52, textAlign: 'center', flex: 'none' }}>
                  <div style={{ fontSize: 10.5, color: '#8b8391', fontWeight: 700 }}>{d.dow}</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#2c2530' }}>{d.dia}</div>
                  {d.hoje && <div style={{ marginTop: 2, fontSize: 9, fontWeight: 700, color: '#fff', background: theme.primary, borderRadius: 6, padding: '1px 5px' }}>Hoje</div>}
                </div>

                <div style={{ width: 42, height: 42, borderRadius: 11, background: d.cor || '#c9c3cf', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
                  <Icon name={ICONE_POR_DISCIPLINA[d.disciplina] || 'book-open'} color="#fff" size={20} />
                </div>

                <div style={{ flex: 1, minWidth: 180 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#2c2530' }}>{d.disciplina || 'Livre'}</div>
                  <div style={{ fontSize: 12, color: '#8b8391' }}>{d.motivo}</div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                    <span style={{ ...s.pill('#f3f1f5', '#8b8391'), display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <Icon name="file-text" color="#8b8391" size={13} />{d.questoesDisponiveis} no acervo
                    </span>
                    <span style={{ ...s.pill('#f3f1f5', '#8b8391'), display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <Icon name="target" color="#8b8391" size={13} />meta {d.meta}
                    </span>
                  </div>
                </div>

                <div style={{ width: 150 }}>
                  {d.futuro ? (
                    <div style={{ fontSize: 11.5, color: '#8b8391' }}>planejado</div>
                  ) : (
                    <>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: '#8b8391', marginBottom: 5 }}>
                        <span>Respondidas</span>
                        <span style={{ fontWeight: 700, color: '#2c2530' }}>{d.respondidas}/{d.meta}</span>
                      </div>
                      <div style={s.progressTrack}>
                        <div style={{ width: d.pct + '%', height: '100%', background: d.pct >= 100 ? '#10B981' : `linear-gradient(90deg, ${theme.gradA}, ${theme.gradB})`, borderRadius: 5, transition: 'width 320ms var(--ease-out)' }} />
                      </div>
                    </>
                  )}
                </div>

                <button
                  style={{ ...s.btnPrimary, flex: 'none' }}
                  disabled={!d.disciplina}
                  onClick={() => d.disciplina && praticarDisciplina(d.disciplina)}
                >
                  <Icon name="play" color="#fff" size={13} />
                  {d.hoje ? 'Estudar agora' : 'Adiantar'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={s.card}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={s.sectionTitle}><Icon name="calendar" color={theme.primary} size={20} />Calendário</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#2c2530' }}>{calendario.rotulo}</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4, marginTop: 14, textAlign: 'center' }}>
            {SEMANA.map((w, i) => <div key={i} style={{ fontSize: 10.5, color: '#8b8391', fontWeight: 700 }}>{w}</div>)}
            {calendario.celulas.map((c, i) => {
              if (c.vazia) return <div key={`v${i}`} />;
              const ativo = c.respondidas > 0;
              return (
                <div
                  key={c.chave}
                  title={ativo ? `${c.respondidas} ${c.respondidas === 1 ? 'questão' : 'questões'}` : 'sem estudo'}
                  style={{
                    fontSize: 11.5, padding: '6px 0', borderRadius: 8,
                    color: c.hoje ? '#fff' : ativo ? theme.primaryDark : '#5c5462',
                    background: c.hoje ? theme.primary : ativo ? theme.primarySoft : 'transparent',
                    fontWeight: c.hoje || ativo ? 700 : 400,
                  }}
                >
                  {c.n}
                </div>
              );
            })}
          </div>
          <div style={{ fontSize: 11, color: '#8b8391', marginTop: 10, lineHeight: 1.5 }}>
            Dias destacados são dias em que você respondeu ao menos uma questão.
          </div>
        </div>

        <div style={s.card}>
          <div style={s.sectionTitle}>Seu registro</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 14 }}>
            <div style={{ width: 96, height: 96, borderRadius: '50%', background: `conic-gradient(${theme.primary} 0% ${resumo.cobertura}%, #f1eef4 ${resumo.cobertura}% 100%)`, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
              <div style={{ width: 72, height: 72, borderRadius: '50%', background: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ fontSize: 17, fontWeight: 700, color: '#2c2530' }}>{resumo.cobertura}%</div>
                <div style={{ fontSize: 9.5, color: '#8b8391' }}>do acervo visto</div>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12 }}>
              <div><div style={{ color: '#8b8391' }}>Dias com estudo</div><div style={{ fontWeight: 700, color: '#2c2530' }}>{resumo.diasAtivos}</div></div>
              <div><div style={{ color: '#8b8391' }}>Respostas registradas</div><div style={{ fontWeight: 700, color: '#2c2530' }}>{resumo.respondidas}</div></div>
              <div><div style={{ color: '#8b8391' }}>Questões distintas</div><div style={{ fontWeight: 700, color: '#2c2530' }}>{resumo.questoesTocadas} de {resumo.acervo}</div></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
