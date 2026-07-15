import { useState } from 'react';
import { Icon } from '../lib/icons';

export default function GeradorQuestoes({ theme, s, onQuestoesGeradas }) {
  const [tema, setTema] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');

  const gerar = async () => {
    if (!tema.trim()) {
      setErro('Digite um tema');
      return;
    }

    setCarregando(true);
    setErro('');

    try {
      const response = await fetch('/api/gerar-questoes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tema: tema,
          quantidade: 5,
          disciplina: 'Direito Constitucional'
        })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Erro ao gerar questões');
      }

      const data = await response.json();
      if (data.questoes) {
        onQuestoesGeradas(data.questoes);
        setTema('');
      }
    } catch (err) {
      setErro(err.message || 'Erro ao conectar com API. Certifique-se de que o servidor está rodando.');
    } finally {
      setCarregando(false);
    }
  };

  return (
    <div style={{ ...s.card, padding: 24, marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <Icon name="wand-2" color={theme.primary} size={22} />
        <div style={{ fontSize: 16, fontWeight: 700 }}>Gerar Questões com IA</div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <input
          type="text"
          value={tema}
          onChange={(e) => setTema(e.target.value)}
          placeholder="Ex: Direitos Fundamentais..."
          style={{
            width: '100%',
            padding: 10,
            border: `1px solid ${erro ? '#EF4444' : 'rgba(0,0,0,.08)'}`,
            borderRadius: 8,
            fontSize: 13,
            fontFamily: 'inherit'
          }}
        />
        {erro && (
          <div style={{ background: '#FEE2E2', color: '#B91C1C', padding: 10, borderRadius: 8, fontSize: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="triangle-alert" color="#B91C1C" size={15} /> {erro}
          </div>
        )}
        <button
          onClick={gerar}
          disabled={carregando || !tema.trim()}
          style={{
            ...s.btnPrimary,
            opacity: carregando || !tema.trim() ? 0.5 : 1,
            cursor: carregando || !tema.trim() ? 'not-allowed' : 'pointer'
          }}
        >
          {carregando ? 'Gerando…' : (<><Icon name="sparkles" color="#fff" size={15} /> Gerar com IA</>)}
        </button>
      </div>
    </div>
  );
}
