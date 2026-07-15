import { useEffect, useState } from 'react';

export default function Cronometro({ tempoTotalMinutos, aoTerminar, theme }) {
  const [tempoRestante, setTempoRestante] = useState(tempoTotalMinutos * 60);

  useEffect(() => {
    const interval = setInterval(() => {
      setTempoRestante(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          aoTerminar();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [aoTerminar]);

  const minutos = Math.floor(tempoRestante / 60);
  const segundos = tempoRestante % 60;
  const pct = (tempoRestante / (tempoTotalMinutos * 60)) * 100;

  let cor = '#10B981'; // verde
  if (pct <= 25) cor = '#EF4444'; // vermelho
  else if (pct <= 50) cor = '#F59E0B'; // âmbar

  return (
    <div style={{
      padding: 16,
      background: `${cor}10`,
      border: `2px solid ${cor}`,
      borderRadius: 12,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 16
    }}>
      <div style={{
        fontSize: 40,
        fontWeight: 700,
        fontFamily: 'monospace',
        color: cor,
        letterSpacing: '0.1em'
      }}>
        {String(minutos).padStart(2, '0')}:{String(segundos).padStart(2, '0')}
      </div>
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 4
      }}>
        <div style={{ fontSize: 12, color: '#666', fontWeight: 600 }}>
          Tempo restante
        </div>
        <div style={{ fontSize: 11, color: '#999' }}>
          {pct > 50 ? '✅ No ritmo' : pct > 25 ? '⚠️ Acelera' : '🔴 Pouco tempo'}
        </div>
      </div>
    </div>
  );
}
