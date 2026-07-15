import { Icon } from '../lib/icons';

export default function Favoritos({ theme, s, data, favoritos }) {
  const all = data.QUESTOES || [];
  const favoritas = all.filter((q) => favoritos.includes(q.id));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={s.card}>
        <div style={s.sectionTitle}><Icon name="star" color={theme.primary} size={20} />Suas questões favoritas</div>
        <div style={{ fontSize: 13, color: '#8b8391', marginTop: 4 }}>Marque questões durante a prática para revisá-las rapidamente aqui.</div>
      </div>
      {favoritas.length === 0 ? (
        <div style={{ ...s.card, textAlign: 'center', color: '#8b8391', fontSize: 13.5, padding: '40px 20px' }}>
          Você ainda não marcou nenhuma questão como favorita. Marque uma em Revisões para vê-la aqui.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {favoritas.map((q) => (
            <div key={q.id} style={{ ...s.card, display: 'flex', alignItems: 'center', gap: 16 }}>
              <Icon name="star" color="#F59E0B" size={18} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#2c2530' }}>{q.disciplina}</div>
                <div style={{ fontSize: 13, color: '#5c5462', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{q.enunciado}</div>
              </div>
              <button style={s.btnPrimary}>▶ Revisar agora</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
