import { Icon } from '../lib/icons';
import { temasDaDisciplina } from '../lib/disciplinas';
import { ICONE_POR_DISCIPLINA } from '../lib/navegacao';

// A lista era fixa: oito matérias com "35h 20m estudadas" e "85% de
// aproveitamento" escritos no código. Abrir uma delas mostrava cinco tópicos
// genéricos ("Fundamentos", "Princípios gerais", "Casos práticos") com
// percentuais gerados por `(nome.length * 7 + i * 13) % 100` — literalmente o
// tamanho do nome da disciplina virando nota.
//
// Agora: as disciplinas são as do acervo, os temas são os que a classificação
// atribuiu a cada questão, e os percentuais são as suas respostas.

const STATUS = {
  domina: { label: 'Domina', color: '#047857', bg: '#D1FAE5' },
  'em-desenvolvimento': { label: 'Em desenvolvimento', color: '#B45309', bg: '#FEF3C7' },
  necessita: { label: 'Precisa reforço', color: '#B91C1C', bg: '#FEE2E2' },
  novo: { label: 'Não iniciada', color: '#5c5462', bg: '#F3F4F6' },
};

export default function Disciplinas({ theme, s, data, disc, setDisc, disciplinas, usuarioTentativas, praticarDisciplina, revisarQuestoes }) {
  const lista = disciplinas || [];
  const questoes = data.QUESTOES || [];
  const aberta = lista.find((d) => d.nome === disc.openNome) || null;

  if (!aberta) {
    if (lista.length === 0) {
      return (
        <div style={{ ...s.card, textAlign: 'center', padding: '48px 24px', color: '#8b8391', fontSize: 13.5, lineHeight: 1.6 }}>
          O acervo ainda não tem questões carregadas.
          <br />As disciplinas aparecem aqui conforme as provas entram.
        </div>
      );
    }

    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16 }}>
        {lista.map((d) => {
          const st = STATUS[d.status];
          return (
            <div key={d.nome} style={{ ...s.card, display: 'flex', flexDirection: 'column', gap: 12, padding: 22 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ width: 52, height: 52, borderRadius: 14, background: `${d.cor}1e`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name={ICONE_POR_DISCIPLINA[d.nome] || 'library'} color={d.cor} size={26} />
                </div>
                <span style={s.pill(st.bg, st.color)}>{st.label}</span>
              </div>

              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#2c2530' }}>{d.nome}</div>
                <div style={{ fontSize: 12.5, color: '#8b8391', marginTop: 3 }}>
                  {d.total} {d.total === 1 ? 'questão' : 'questões'} no acervo · {d.respondidas} já respondidas
                </div>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#8b8391', marginBottom: 6 }}>
                  <span>{d.pct != null ? 'Acerto' : 'Cobertura'}</span>
                  <span style={{ fontWeight: 700, color: '#2c2530' }}>
                    {d.pct != null ? `${d.pct}%` : `${d.cobertura}%`}
                  </span>
                </div>
                <div style={s.progressTrack}>
                  <div style={{ width: `${d.pct != null ? d.pct : d.cobertura}%`, height: '100%', background: d.cor, borderRadius: 5 }} />
                </div>
                <div style={{ fontSize: 11, color: '#8b8391', marginTop: 6 }}>
                  {d.pct != null
                    ? `${d.acertos} acertos em ${d.tentativas} ${d.tentativas === 1 ? 'resposta' : 'respostas'}`
                    : 'sem respostas ainda'}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, marginTop: 'auto' }}>
                <button
                  onClick={() => praticarDisciplina(d.nome)}
                  style={{ flex: 1, padding: '10px 12px', background: '#343a46', color: '#fff', border: 'none', borderRadius: 9, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}
                >
                  <Icon name="play" color="#fff" size={12} /> Praticar
                </button>
                <button
                  onClick={() => setDisc({ openNome: d.nome })}
                  style={{ padding: '10px 14px', background: '#fff', color: '#5c5462', border: '1px solid #e3e7ee', borderRadius: 9, fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}
                >
                  Ver temas
                </button>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  const temas = temasDaDisciplina(questoes, usuarioTentativas, aberta.nome);
  const naoRevisadas = aberta.semRevisao;

  return (
    <div style={s.card}>
      <button style={{ background: 'none', border: 'none', color: theme.primary, fontSize: 13, fontWeight: 600, cursor: 'pointer' }} onClick={() => setDisc({ openNome: null })}>
        ← Voltar às disciplinas
      </button>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 14, flexWrap: 'wrap' }}>
        <div style={{ width: 56, height: 56, borderRadius: 16, background: `${aberta.cor}1e`, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
          <Icon name={ICONE_POR_DISCIPLINA[aberta.nome] || 'library'} color={aberta.cor} size={28} />
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 19, fontWeight: 700, color: '#2c2530' }}>{aberta.nome}</div>
          <div style={{ fontSize: 13, color: '#8b8391' }}>
            {aberta.total} questões · {aberta.respondidas} respondidas
            {aberta.pct != null ? ` · ${aberta.pct}% de acerto` : ''}
          </div>
        </div>
        <button style={s.btnPrimary} onClick={() => praticarDisciplina(aberta.nome)}>
          <Icon name="play" color="#fff" size={13} /> Praticar {aberta.nome.split(' ').slice(-1)[0]}
        </button>
      </div>

      <div style={{ ...s.progressTrack, marginTop: 16 }}>
        <div style={{ width: `${aberta.pct != null ? aberta.pct : aberta.cobertura}%`, height: '100%', background: aberta.cor, borderRadius: 5 }} />
      </div>

      {/* Enquanto a classificação não passou por revisão humana, quem lê
          precisa saber — é a mesma etiqueta que aparece na explicação. */}
      {naoRevisadas > 0 && (
        <div style={{ marginTop: 14, padding: '10px 14px', background: '#FEF3C7', color: '#B45309', borderRadius: 10, fontSize: 12, lineHeight: 1.5 }}>
          {naoRevisadas === aberta.total
            ? 'A separação por matéria e tema desta disciplina foi feita por IA e ainda não passou por revisão humana.'
            : `${naoRevisadas} de ${aberta.total} questões desta disciplina foram classificadas por IA e ainda não passaram por revisão humana.`}
          {' '}O enunciado, as alternativas e o gabarito continuam sendo os oficiais da FGV.
        </div>
      )}

      <div style={{ ...s.sectionTitle, marginTop: 22 }}>Temas</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
        {temas.map((t) => (
          <div key={t.nome} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '12px 14px', background: '#faf9fb', borderRadius: 12, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 220 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: '#2c2530' }}>{t.nome}</div>
              <div style={{ fontSize: 11.5, color: '#8b8391', marginTop: 2 }}>
                {t.total} {t.total === 1 ? 'questão' : 'questões'}
                {t.tentativas > 0 ? ` · ${t.acertos}/${t.tentativas} respostas certas` : ' · sem respostas'}
              </div>
              <div style={{ ...s.progressTrack, marginTop: 6, maxWidth: 260 }}>
                <div style={{ width: `${t.pct ?? 0}%`, height: '100%', background: aberta.cor, borderRadius: 5 }} />
              </div>
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, color: t.pct == null ? '#8b8391' : '#2c2530', width: 44, textAlign: 'right' }}>
              {t.pct == null ? '—' : `${t.pct}%`}
            </div>
            <button
              style={s.btnOutline}
              onClick={() => revisarQuestoes(questoes.filter((q) => (q.disciplina || 'Sem classificação') === aberta.nome && (q.topico || 'Sem tema') === t.nome))}
            >
              Estudar
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
