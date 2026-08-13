import { useEffect, useRef, useState } from 'react';
import { Icon } from '../lib/icons';

export default function Cronometro({ tempoTotalMinutos, aoTerminar }) {
  const [tempoRestante, setTempoRestante] = useState(tempoTotalMinutos * 60);
  const aoTerminarRef = useRef(aoTerminar);
  aoTerminarRef.current = aoTerminar;

  useEffect(() => {
    const interval = setInterval(() => {
      setTempoRestante(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          aoTerminarRef.current();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const horas = Math.floor(tempoRestante / 3600);
  const minutos = Math.floor((tempoRestante % 3600) / 60);
  const segundos = tempoRestante % 60;
  const pct = (tempoRestante / (tempoTotalMinutos * 60)) * 100;

  let cor = '#2c2530';
  if (pct <= 25) cor = '#EF4444';
  else if (pct <= 50) cor = '#F59E0B';

  return (
    <div data-testid="cronometro" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <Icon name="clock" color={cor} size={18} />
      <span style={{ fontSize: 20, fontWeight: 700, fontFamily: 'monospace', color: cor, letterSpacing: '0.05em' }}>
        {String(horas).padStart(2, '0')}:{String(minutos).padStart(2, '0')}:{String(segundos).padStart(2, '0')}
      </span>
    </div>
  );
}
