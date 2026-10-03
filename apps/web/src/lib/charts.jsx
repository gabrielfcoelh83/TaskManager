import { useEffect, useState } from 'react';

// Gráficos do app. Regras que valem para todos (ver DESIGN.md):
// - O SVG é desenhado na largura real do contêiner, medida por ResizeObserver.
//   Nada de `preserveAspectRatio="none"`: ele achatava os pontos em elipses e
//   engrossava a linha conforme a tela.
// - Taxa de acerto usa a escala fixa 0–100. Escala min–max fazia 62% → 65%
//   parecer uma escalada do chão ao teto.
// - Semana sem atividade é `null` e vira um buraco na linha, não um 0%.
// - Texto (rótulos, valores, eixo) usa tinta/mudo; só a marca usa a cor.
// - Passar o mouse (ou focar e usar as setas) mostra o valor de cada ponto/barra.

const TINTA = '#1c1b19';
const MUDO = '#7a766f';
const GRADE = '#eeebe5';
const SUPERFICIE = '#fff';

const pct = (v) => `${v}%`;

// Callback ref (e não useRef + efeito com []): o gráfico pode montar vazio,
// devolvendo null, e só ganhar o <div> quando os dados chegam.
function useLargura() {
  const [el, setEl] = useState(null);
  const [largura, setLargura] = useState(0);
  useEffect(() => {
    if (!el) return undefined;
    const medir = () => setLargura(Math.floor(el.getBoundingClientRect().width));
    medir();
    const ro = new window.ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return [setEl, largura];
}

function Dica({ x, y, largura, valor, rotulo }) {
  // Fica dentro do card: encosta na borda em vez de vazar.
  const meia = 56;
  const left = Math.min(Math.max(x, meia), Math.max(meia, largura - meia));
  return (
    <div
      role="presentation"
      style={{
        position: 'absolute', left, top: y, transform: 'translate(-50%, calc(-100% - 10px))',
        background: SUPERFICIE, borderRadius: 8, padding: '6px 10px', pointerEvents: 'none',
        boxShadow: '0 0 0 1px rgba(28,27,25,.08), 0 4px 12px -2px rgba(28,27,25,.12)',
        whiteSpace: 'nowrap', textAlign: 'center', zIndex: 2,
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 700, color: TINTA, fontVariantNumeric: 'tabular-nums' }}>{valor}</div>
      {rotulo && <div style={{ fontSize: 11, color: MUDO, marginTop: 1 }}>{rotulo}</div>}
    </div>
  );
}

// Teclado: setas andam entre os índices que têm valor.
function vizinho(indices, atual, passo) {
  if (!indices.length) return null;
  if (atual == null) return passo > 0 ? indices[0] : indices[indices.length - 1];
  const pos = indices.indexOf(atual);
  return indices[Math.min(Math.max(pos + passo, 0), indices.length - 1)];
}

/**
 * Linha de uma série. `points` aceita `null` (buraco). `labels` nomeia cada
 * ponto na dica. `axis` liga a grade 0/50/100 com rótulos; sem ela é sparkline.
 */
export function LineChart({
  points, labels, color, height = 160, domain = [0, 100], format = pct,
  axis = true, area = true, endLabel = true, ariaLabel = 'Gráfico de linha',
}) {
  const [ref, largura] = useLargura();
  const [ativo, setAtivo] = useState(null);

  const valores = (points || []).map((v) => (v == null || Number.isNaN(v) ? null : v));
  const indices = valores.map((v, i) => (v == null ? null : i)).filter((i) => i != null);
  // Um ponto só não é linha: o passo horizontal viraria Infinity.
  if (valores.length < 2 || indices.length < 1) return null;

  const [lo, hi] = domain;
  const margemEsq = axis ? 34 : 6;
  const margemDir = endLabel ? 40 : 6;
  const margemTopo = 10, margemBase = 8;
  const w = Math.max(largura, 1);
  const larguraUtil = Math.max(w - margemEsq - margemDir, 1);
  const altUtil = height - margemTopo - margemBase;
  const xDe = (i) => margemEsq + (i / (valores.length - 1)) * larguraUtil;
  const yDe = (v) => margemTopo + (1 - (Math.min(Math.max(v, lo), hi) - lo) / (hi - lo || 1)) * altUtil;

  // Trechos contínuos (quebra onde há null).
  const trechos = [];
  let atual = [];
  valores.forEach((v, i) => {
    if (v == null) { if (atual.length) trechos.push(atual); atual = []; }
    else atual.push([xDe(i), yDe(v)]);
  });
  if (atual.length) trechos.push(atual);
  const linha = (t) => t.map((c, k) => `${k ? 'L' : 'M'}${c[0]},${c[1]}`).join(' ');
  const base = yDe(lo);

  const ultimo = indices[indices.length - 1];
  const mostrarPontos = valores.length <= 16;

  const aoMover = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - r.left;
    let melhor = null, dist = Infinity;
    for (const i of indices) {
      const d = Math.abs(xDe(i) - x);
      if (d < dist) { dist = d; melhor = i; }
    }
    setAtivo(melhor);
  };
  const aoTeclar = (e) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      setAtivo(vizinho(indices, ativo, e.key === 'ArrowRight' ? 1 : -1));
    } else if (e.key === 'Escape') setAtivo(null);
  };

  const ticks = axis ? [lo, (lo + hi) / 2, hi] : [];

  return (
    <div ref={ref} style={{ position: 'relative', width: '100%', height }}>
      {largura > 0 && (
        <svg
          width={w} height={height} viewBox={`0 0 ${w} ${height}`}
          role="img" aria-label={ariaLabel} tabIndex={0}
          onPointerMove={aoMover} onPointerLeave={() => setAtivo(null)}
          onFocus={() => setAtivo((a) => a ?? ultimo)} onBlur={() => setAtivo(null)} onKeyDown={aoTeclar}
          style={{ display: 'block', overflow: 'visible', outline: 'none', touchAction: 'pan-y' }}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line x1={margemEsq} x2={w - margemDir} y1={yDe(t)} y2={yDe(t)} stroke={GRADE} strokeWidth={1} shapeRendering="crispEdges" />
              <text x={margemEsq - 8} y={yDe(t)} dy="0.32em" fontSize={10.5} fill={MUDO} textAnchor="end" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {format(t)}
              </text>
            </g>
          ))}

          {area && trechos.filter((t) => t.length > 1).map((t, k) => (
            <path key={'a' + k} d={`${linha(t)} L${t[t.length - 1][0]},${base} L${t[0][0]},${base} Z`} fill={color} opacity={0.1} />
          ))}
          {trechos.map((t, k) => (
            <path key={'l' + k} d={linha(t)} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          ))}

          {ativo != null && (
            <line x1={xDe(ativo)} x2={xDe(ativo)} y1={margemTopo} y2={base} stroke={MUDO} strokeOpacity={0.45} strokeWidth={1} shapeRendering="crispEdges" />
          )}

          {indices.map((i) => {
            const realce = i === ativo || i === ultimo;
            // Trecho de um ponto só (vizinhos vazios) precisa do ponto para existir.
            const isolado = valores[i - 1] == null && valores[i + 1] == null;
            if (!mostrarPontos && !realce && !isolado) return null;
            return (
              <circle
                key={i} cx={xDe(i)} cy={yDe(valores[i])} r={realce ? 5 : 3.5}
                fill={color} stroke={SUPERFICIE} strokeWidth={2}
              />
            );
          })}

          {endLabel && (
            <text x={xDe(ultimo) + 9} y={yDe(valores[ultimo])} dy="0.32em" fontSize={11.5} fontWeight={600} fill={TINTA} style={{ fontVariantNumeric: 'tabular-nums' }}>
              {format(valores[ultimo])}
            </text>
          )}
        </svg>
      )}
      {ativo != null && largura > 0 && (
        <Dica x={xDe(ativo)} y={yDe(valores[ativo])} largura={w} valor={format(valores[ativo])} rotulo={labels?.[ativo]} />
      )}
    </div>
  );
}

// Compatibilidade com as telas: sparkline = linha sem eixo nem área.
export function Sparkline({ points, labels, color, height = 90, domain }) {
  return (
    <LineChart
      points={points} labels={labels} color={color} height={height} domain={domain}
      axis={false} area={false} endLabel={false} ariaLabel="Tendência"
    />
  );
}

export function AreaLine({ points, labels, color, height = 160, domain, format }) {
  return <LineChart points={points} labels={labels} color={color} height={height} domain={domain} format={format} />;
}

/**
 * Colunas de uma série, a partir de uma linha de base. Barra com no máximo
 * 24px, ponta arredondada (4px) e base reta. `format` vira o texto da dica.
 */
export function BarChart({ points, labels, fullLabels, color, height = 140, format = String, ariaLabel = 'Gráfico de barras' }) {
  const [ref, largura] = useLargura();
  const [ativo, setAtivo] = useState(null);

  // `Math.max` de lista vazia é -Infinity, e dividir por um máximo zero dá
  // NaN: os dois viram `<rect y="NaN">`, que o React aceita e o navegador
  // desenha como nada. Aconteceu de verdade — o tempo por questão é medido em
  // segundos inteiros, e quem responde em menos de um segundo grava zero.
  // Devolver null deixa a tela mostrar o texto alternativo.
  const max = points?.length ? Math.max(...points) : 0;
  if (!points?.length || !(max > 0)) return null;

  const temRotulos = !!labels?.length;
  const altRotulo = temRotulos ? 20 : 0;
  const w = Math.max(largura, 1);
  const altUtil = height - 6;
  const faixa = w / points.length;
  const bw = Math.max(Math.min(24, faixa - 8), 2);
  const xDe = (i) => i * faixa + (faixa - bw) / 2;
  const indices = points.map((_, i) => i);

  // Retângulo com só os cantos de cima arredondados.
  const coluna = (x, v) => {
    const h = Math.max((v / max) * altUtil, v > 0 ? 2 : 0);
    const y = height - h;
    const r = Math.min(4, bw / 2, h);
    return `M${x},${height} V${y + r} Q${x},${y} ${x + r},${y} H${x + bw - r} Q${x + bw},${y} ${x + bw},${y + r} V${height} Z`;
  };

  const aoTeclar = (e) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      setAtivo(vizinho(indices, ativo, e.key === 'ArrowRight' ? 1 : -1));
    } else if (e.key === 'Escape') setAtivo(null);
  };

  return (
    <div ref={ref} style={{ position: 'relative', width: '100%', height: height + altRotulo }}>
      {largura > 0 && (
        <svg
          width={w} height={height + altRotulo} viewBox={`0 0 ${w} ${height + altRotulo}`}
          role="img" aria-label={ariaLabel} tabIndex={0}
          onPointerLeave={() => setAtivo(null)} onBlur={() => setAtivo(null)}
          onFocus={() => setAtivo((a) => a ?? 0)} onKeyDown={aoTeclar}
          style={{ display: 'block', overflow: 'visible', outline: 'none' }}
        >
          {points.map((v, i) => (
            <g key={i} onPointerEnter={() => setAtivo(i)}>
              {/* Alvo do mouse = a faixa inteira, não só a barra pintada. */}
              <rect x={i * faixa} y={0} width={faixa} height={height + altRotulo} fill="transparent" />
              <path d={coluna(xDe(i), v)} fill={color} opacity={ativo == null || ativo === i ? 1 : 0.55} style={{ transition: 'opacity .15s' }} />
              {temRotulos && (
                <text x={xDe(i) + bw / 2} y={height + 14} fontSize={10.5} fill={ativo === i ? TINTA : MUDO} textAnchor="middle">
                  {labels[i]}
                </text>
              )}
            </g>
          ))}
          <line x1={0} x2={w} y1={height + 0.5} y2={height + 0.5} stroke={GRADE} strokeWidth={1} shapeRendering="crispEdges" />
        </svg>
      )}
      {ativo != null && largura > 0 && (
        <Dica
          x={xDe(ativo) + bw / 2} y={height - (points[ativo] / max) * altUtil} largura={w}
          valor={format(points[ativo])} rotulo={fullLabels?.[ativo] ?? labels?.[ativo]}
        />
      )}
    </div>
  );
}

export function LabeledBars({ points, labels, fullLabels, color, height = 140, format }) {
  return <BarChart points={points} labels={labels} fullLabels={fullLabels} color={color} height={height} format={format} />;
}

export function MiniBars({ points, color, height = 60, format }) {
  return <BarChart points={points} color={color} height={height} format={format} />;
}
