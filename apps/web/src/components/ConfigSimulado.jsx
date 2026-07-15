import { useState } from 'react';

const QUANTIDADES = [10, 20, 30, 40, 50, 60, 70, 80];

export default function ConfigSimulado({ theme, s, onConfirm, disciplinas = [], disciplinaInicial = null }) {
  const [tipo, setTipo] = useState(disciplinaInicial ? 'disciplina' : 'geral');
  const [disciplina, setDisciplina] = useState(disciplinaInicial);
  const [quantidade, setQuantidade] = useState(10);

  const invalido = tipo === 'disciplina' && !disciplina;

  return (
    <div style={{ ...s.card, padding: '36px 32px', maxWidth: 680, margin: '0 auto', textAlign: 'center' }}>
      <div style={{ fontSize: 24, fontWeight: 700, color: '#2c2530' }}>Vamos começar!</div>
      <div style={{ fontSize: 14, color: '#8b8391', marginTop: 8 }}>
        Você selecionou <b style={{ color: '#2c2530' }}>{quantidade} questões</b>. Gerencie seu tempo e boa sorte!
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20, marginTop: 28, textAlign: 'left' }}>
        {/* Tipo */}
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: '#2c2530' }}>Tipo de simulado</div>
          <div style={{ display: 'flex', gap: 12 }}>
            {['geral', 'disciplina'].map(t => (
              <button
                key={t}
                onClick={() => { setTipo(t); if (t === 'geral') setDisciplina(null); }}
                style={{
                  flex: 1,
                  padding: 12,
                  border: tipo === t ? `2px solid ${theme.primary}` : '1px solid #e3e7ee',
                  borderRadius: 10,
                  background: tipo === t ? theme.primarySoft : '#fff',
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: 600,
                  color: tipo === t ? theme.primaryDark : '#5c5462'
                }}
              >
                {t === 'geral' ? 'Geral — OAB 1ª Fase' : 'Por disciplina'}
              </button>
            ))}
          </div>
        </div>

        {/* Disciplina */}
        {tipo === 'disciplina' && (
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: '#2c2530' }}>Disciplina</div>
            <select
              value={disciplina || ''}
              onChange={(e) => setDisciplina(e.target.value || null)}
              style={{ width: '100%', padding: 12, border: '1px solid #e3e7ee', borderRadius: 10, fontSize: 13, cursor: 'pointer', background: '#fff' }}
            >
              <option value="">-- Escolha uma disciplina --</option>
              {disciplinas.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
        )}

        {/* Quantidade */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', background: '#f6f8fb', borderRadius: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#2c2530' }}>Qtd. Questões:</div>
          <select
            data-testid="qtd-questoes"
            value={quantidade}
            onChange={(e) => setQuantidade(parseInt(e.target.value))}
            style={{ padding: '8px 14px', border: '1px solid #e3e7ee', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', background: '#fff' }}
          >
            {QUANTIDADES.map(q => <option key={q} value={q}>{q}</option>)}
          </select>
        </div>

        <div style={{ fontSize: 12.5, color: '#8b8391', textAlign: 'center' }}>
          Tempo de prova: ~{Math.ceil(quantidade * 1.5)} minutos · sem feedback durante o simulado, como na prova real
        </div>

        <button
          onClick={() => onConfirm({ tipo, disciplina, quantidade })}
          disabled={invalido}
          style={{
            padding: 14,
            background: invalido ? '#c3c8d2' : '#343a46',
            color: '#fff',
            border: 'none',
            borderRadius: 10,
            fontSize: 14,
            fontWeight: 600,
            cursor: invalido ? 'not-allowed' : 'pointer'
          }}
        >
          ▶ Iniciar Simulado
        </button>
      </div>
    </div>
  );
}
