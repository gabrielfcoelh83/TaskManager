import { useState } from 'react';

export default function ConfigSimulado({ theme, s, onConfirm }) {
  const [tipo, setTipo] = useState('geral');
  const [disciplina, setDisciplina] = useState(null);
  const [quantidade, setQuantidade] = useState(30);

  return (
    <div style={{ ...s.card, padding: 24 }}>
      <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 24 }}>
        ⚙️ Configurar Simulado
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Tipo */}
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>
            Tipo de simulado
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            {['geral', 'disciplina'].map(t => (
              <button
                key={t}
                onClick={() => { setTipo(t); setDisciplina(null); }}
                style={{
                  flex: 1,
                  padding: 12,
                  border: tipo === t ? `2px solid ${theme.primary}` : '1px solid rgba(0,0,0,.1)',
                  borderRadius: 8,
                  background: tipo === t ? `${theme.primary}10` : 'transparent',
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: 600,
                  color: tipo === t ? theme.primary : '#666'
                }}
              >
                {t === 'geral' ? '📚 Geral' : '📖 Por disciplina'}
              </button>
            ))}
          </div>
        </div>

        {/* Disciplina (if tipo === 'disciplina') */}
        {tipo === 'disciplina' && (
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>
              Selecione a disciplina
            </div>
            <select
              value={disciplina || ''}
              onChange={(e) => setDisciplina(e.target.value || null)}
              style={{
                width: '100%',
                padding: 12,
                border: '1px solid rgba(0,0,0,.1)',
                borderRadius: 8,
                fontSize: 13,
                cursor: 'pointer'
              }}
            >
              <option value="">-- Escolha uma disciplina --</option>
              <option value="Direito Constitucional">Direito Constitucional</option>
              <option value="Direito Administrativo">Direito Administrativo</option>
              <option value="Direito Penal">Direito Penal</option>
              <option value="Direito Civil">Direito Civil</option>
            </select>
          </div>
        )}

        {/* Quantidade */}
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>
            Número de questões: {quantidade}
          </div>
          <input
            type="range"
            min="10"
            max="80"
            step="5"
            value={quantidade}
            onChange={(e) => setQuantidade(parseInt(e.target.value))}
            style={{ width: '100%', cursor: 'pointer' }}
          />
          <div style={{ fontSize: 12, color: '#999', marginTop: 8 }}>
            Tempo estimado: ~{Math.ceil(quantidade * 1.5)} minutos
          </div>
        </div>

        {/* Botão */}
        <button
          onClick={() => onConfirm({ tipo, disciplina, quantidade })}
          disabled={tipo === 'disciplina' && !disciplina}
          style={{
            padding: 14,
            background: theme.primary,
            color: 'white',
            border: 'none',
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 600,
            cursor: tipo === 'disciplina' && !disciplina ? 'not-allowed' : 'pointer',
            opacity: tipo === 'disciplina' && !disciplina ? 0.5 : 1
          }}
        >
          Iniciar Simulado 🚀
        </button>
      </div>
    </div>
  );
}
