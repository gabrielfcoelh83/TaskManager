export function Sparkline({ points, color, height = 90 }) {
  const w = 380, h = height;
  const max = Math.max(...points), min = Math.min(...points);
  const stepX = w / (points.length - 1);
  const norm = (v) => h - 10 - ((v - min) / (max - min || 1)) * (h - 20);
  const coords = points.map((v, i) => [i * stepX, norm(v)]);
  const path = coords.map((c, i) => (i === 0 ? 'M' : 'L') + c[0] + ',' + c[1]).join(' ');
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <path d={path} fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
      {coords.map((c, i) => <circle key={i} cx={c[0]} cy={c[1]} r={3.5} fill={color} />)}
    </svg>
  );
}

export function MiniBars({ points, color, width = 120, height = 60 }) {
  const w = width, h = height, max = Math.max(...points);
  const bw = w / points.length - 4;
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`}>
      {points.map((v, i) => (
        <rect key={i} x={i * (bw + 4)} y={h - (v / max) * h} width={bw} height={(v / max) * h} rx={3} fill={color} />
      ))}
    </svg>
  );
}

export function AreaLine({ points, color, width = 760, height = 160 }) {
  const w = width, h = height;
  const max = Math.max(...points), min = Math.min(...points);
  const stepX = w / (points.length - 1);
  const norm = (v) => h - 14 - ((v - min) / (max - min || 1)) * (h - 28);
  const coords = points.map((v, i) => [i * stepX, norm(v)]);
  const path = coords.map((c, i) => (i === 0 ? 'M' : 'L') + c[0] + ',' + c[1]).join(' ');
  const area = `${path} L${coords[coords.length - 1][0]},${h} L0,${h} Z`;
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <path d={area} fill={color} opacity={0.12} />
      <path d={path} fill="none" stroke={color} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
      {coords.map((c, i) => <circle key={i} cx={c[0]} cy={c[1]} r={4} fill="#fff" stroke={color} strokeWidth={2.5} />)}
    </svg>
  );
}

export function LabeledBars({ points, labels, color, width = 340, height = 140 }) {
  const w = width, h = height, max = Math.max(...points);
  const bw = w / points.length - 8;
  return (
    <svg width="100%" height={h + 18} viewBox={`0 0 ${w} ${h + 18}`}>
      {points.map((v, i) => (
        <rect key={i} x={i * (bw + 8)} y={h - (v / max) * h} width={bw} height={(v / max) * h} rx={4} fill={color} />
      ))}
      {labels.map((l, i) => (
        <text key={'t' + i} x={i * (bw + 8) + bw / 2} y={h + 14} fontSize={10} fill="#8b8391" textAnchor="middle">{l}</text>
      ))}
    </svg>
  );
}
