import { motion, useReducedMotion } from 'motion/react';

// A carinha do Kepy: um ladrilho no véu da paleta com olhos, boca e
// bochechas na cor escura dela — o mesmo par de cores dos ladrilhos de ícone
// (DESIGN.md), então troca de paleta junto com o resto do app.
//
// humor:
//   'normal'   olhos ovais, sorriso leve
//   'feliz'    olhos "^ ^" e sorriso aberto (meta batida)
//   'pensando' olhos para cima e de lado, boca em "o" (respondendo)
//   'atento'   olhos um pouco maiores (painel aberto)
//
// Pisca sozinho a cada poucos segundos, a não ser com movimento reduzido.

const ease = [0.22, 1, 0.36, 1];

// Posição das pupilas por humor: deslocamento (x, y) e tamanho.
const OLHOS = {
  normal: { dx: 0, dy: 0, rx: 2.1, ry: 2.9 },
  atento: { dx: 0, dy: -0.3, rx: 2.4, ry: 3.3 },
  pensando: { dx: 1.4, dy: -1.6, rx: 2, ry: 2.7 },
};

const BOCAS = {
  normal: 'M13.5 22.5 Q18 25.5 22.5 22.5',
  atento: 'M14 22.5 Q18 25 22 22.5',
  feliz: 'M12.5 21.5 Q18 27.5 23.5 21.5',
};

function Olho({ cx, cor, humor, piscar }) {
  if (humor === 'feliz') {
    // "^": um arco no lugar do olho.
    return <path d={`M${cx - 2.6} 17.2 Q${cx} 13.6 ${cx + 2.6} 17.2`} fill="none" stroke={cor} strokeWidth={1.9} strokeLinecap="round" />;
  }
  const o = OLHOS[humor] || OLHOS.normal;
  return (
    <motion.ellipse
      cx={cx}
      cy={16}
      rx={o.rx}
      ry={o.ry}
      fill={cor}
      initial={false}
      animate={{
        cx: cx + o.dx,
        cy: 16 + o.dy,
        rx: o.rx,
        // Piscar = achatar o olho por um instante, de tempos em tempos.
        ry: piscar ? [o.ry, o.ry, 0.35, o.ry] : o.ry,
      }}
      transition={{
        cx: { duration: 0.35, ease },
        cy: { duration: 0.35, ease },
        rx: { duration: 0.25, ease },
        ry: piscar
          ? { duration: 4.2, times: [0, 0.94, 0.97, 1], repeat: Infinity, ease: 'easeInOut' }
          : { duration: 0.25, ease },
      }}
    />
  );
}

export function KepyFace({ cores, humor = 'normal', tamanho = 36, raio = 8 }) {
  const reduzido = !!useReducedMotion();
  const tinta = cores.primaryDark;
  const piscar = !reduzido && humor !== 'pensando';

  return (
    <svg
      width={tamanho}
      height={tamanho}
      viewBox="0 0 36 36"
      aria-hidden="true"
      style={{ display: 'block', flex: 'none', borderRadius: raio, background: cores.primarySoft }}
    >
      {/* Bochechas: o acento da paleta, bem apagado. */}
      <circle cx={9.6} cy={21.4} r={2.4} fill={cores.accent} opacity={humor === 'feliz' ? 0.45 : 0.28} />
      <circle cx={26.4} cy={21.4} r={2.4} fill={cores.accent} opacity={humor === 'feliz' ? 0.45 : 0.28} />

      <Olho cx={13} cor={tinta} humor={humor} piscar={piscar} />
      <Olho cx={23} cor={tinta} humor={humor} piscar={piscar} />

      {humor === 'pensando' ? (
        <motion.ellipse
          cx={19} cy={23.4} rx={1.7} ry={1.9} fill="none" stroke={tinta} strokeWidth={1.7}
          initial={reduzido ? false : { scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.2, ease }}
          style={{ transformOrigin: '19px 23.4px' }}
        />
      ) : (
        <motion.path
          d={BOCAS[humor] || BOCAS.normal}
          fill="none" stroke={tinta} strokeWidth={1.8} strokeLinecap="round"
          initial={false}
          animate={{ d: BOCAS[humor] || BOCAS.normal }}
          transition={{ duration: 0.3, ease }}
        />
      )}
    </svg>
  );
}

export default KepyFace;
