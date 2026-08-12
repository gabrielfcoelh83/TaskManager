import { Icon } from '../lib/icons';

export default function Favoritos({ theme, s, toggleFavorito, revisao, revisarQuestoes }) {
  const favoritas = revisao?.favoritas || [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ ...s.card, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 260 }}>
          <div style={s.sectionTitle}><Icon name="star" color={theme.primary} size={20} />Suas questões favoritas</div>
          <div style={{ fontSize: 13, color: '#8b8391', marginTop: 4 }}>
            {favoritas.length > 0
              ? `${favoritas.length} ${favoritas.length === 1 ? 'questão marcada' : 'questões marcadas'} · guardadas neste navegador`
              : 'Marque questões com a estrela para revisá-las rapidamente aqui.'}
          </div>
        </div>
        {favoritas.length > 0 && (
          <button style={s.btnPrimary} onClick={() => revisarQuestoes(favoritas.map((x) => x.questao))}>
            <Icon name="play" color="#fff" size={13} /> Revisar todas
          </button>
        )}
      </div>

      {favoritas.length === 0 ? (
        <div style={{ ...s.card, textAlign: 'center', color: '#8b8391', fontSize: 13.5, padding: '40px 20px', lineHeight: 1.6 }}>
          Você ainda não marcou nenhuma questão como favorita.
          <br />A estrela aparece em Revisões, ao lado de cada questão.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {favoritas.map((item) => {
            const q = item.questao;
            return (
              <div key={q.id} style={{ ...s.card, display: 'flex', alignItems: 'center', gap: 16 }}>
                <button
                  title="Desmarcar"
                  onClick={() => toggleFavorito(q.id)}
                  style={{ background: 'none', border: 'none', flex: 'none', cursor: 'pointer' }}
                >
                  <Icon name="star" color="#F59E0B" size={19} />
                </button>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {/* A questão do acervo oficial pode ainda não ter disciplina;
                      o cabeçalho antigo mostrava `undefined` nesse caso. */}
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#2c2530' }}>
                    {q.disciplina || (q.exame ? `${q.exame}º Exame de Ordem` : 'Sem classificação')}
                  </div>
                  <div style={{ fontSize: 13, color: '#5c5462', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{q.enunciado}</div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                    {q.topico && <span style={s.pill('#f3f1f5', '#8b8391')}>{q.topico}</span>}
                    {item.tentativas > 0
                      ? <span style={s.pill('#f3f1f5', '#8b8391')}>{item.acertos}/{item.tentativas} · {item.pct}%</span>
                      : <span style={s.pill('#f3f1f5', '#8b8391')}>ainda não respondida</span>}
                  </div>
                </div>
                <button style={s.btnPrimary} onClick={() => revisarQuestoes([q])}>
                  <Icon name="play" color="#fff" size={13} /> Revisar agora
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
