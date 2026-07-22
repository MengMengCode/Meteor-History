import { useMemo, useRef, useState } from 'react';
import { createDateTicks } from './dateTicks';
import { monotonePath } from './monotonePath';

const WIDTH = 1000;
const HEIGHT = 620;
const BOX = { left: 104, top: 100, right: 958, bottom: 530 };

function compact(value) {
  return Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

function yScale(max) {
  const safeMax = Math.max(1, max);
  const raw = safeMax / 5;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const normalized = raw / magnitude;
  const step = (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) * magnitude;
  const top = Math.ceil(safeMax / step) * step;
  return { top, values: Array.from({ length: Math.ceil(top / step) + 1 }, (_, index) => index * step) };
}

export function HistoryChart({ points, label }) {
  const [active, setActive] = useState(null);
  const svgRef = useRef(null);
  const model = useMemo(() => {
    const start = new Date(points[0].date).getTime();
    const end = Math.max(start + 86_400_000, new Date(points.at(-1).date).getTime());
    const y = yScale(Math.max(...points.map((point) => point.count)));
    const xAt = (date) => BOX.left + ((new Date(date).getTime() - start) / (end - start)) * (BOX.right - BOX.left);
    const yAt = (count) => BOX.bottom - (count / y.top) * (BOX.bottom - BOX.top);
    const mapped = points.map((point) => ({ ...point, x: xAt(point.date), y: yAt(point.count) }));
    const dotStep = Math.max(1, Math.ceil(mapped.length / 70));
    const dots = mapped.filter((_, index) => index % dotStep === 0 || index === mapped.length - 1);
    const dates = createDateTicks(start, end).map((tick) => ({
      ...tick,
      x: BOX.left + (BOX.right - BOX.left) * tick.ratio,
    }));
    return { mapped, dots, line: monotonePath(mapped), y, yAt, dates };
  }, [points]);

  function onPointerMove(event) {
    const rect = svgRef.current.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * WIDTH;
    let closest = model.mapped[0];
    for (const point of model.mapped) if (Math.abs(point.x - x) < Math.abs(closest.x - x)) closest = point;
    setActive(closest);
  }

  return <div className="chart-shell xkcd-chart">
    <svg ref={svgRef} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={`${label} star history chart`} onPointerMove={onPointerMove} onPointerLeave={() => setActive(null)}>
      <defs>
        <filter id="xkcdify" x="-2%" y="-2%" width="104%" height="104%">
          <feTurbulence type="fractalNoise" baseFrequency="0.012" numOctaves="1" seed="7" result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="1.25" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </defs>
      <text className="xkcd-title" x="36" y="46">Star History</text>
      <g className="xkcd-legend" transform="translate(42 70)"><circle r="5" fill="var(--chart-line)" /><text x="12" y="5">{label}</text></g>
      <text className="xkcd-axis-label" x={(BOX.left + BOX.right) / 2} y="600" textAnchor="middle">Date</text>
      <text className="xkcd-axis-label" transform={`translate(27 ${(BOX.top + BOX.bottom) / 2}) rotate(-90)`} textAnchor="middle">GitHub Stars</text>
      <g className="xkcd-axes" filter="url(#xkcdify)">
        <line x1={BOX.left} x2={BOX.left} y1={BOX.top} y2={BOX.bottom} />
        <line x1={BOX.left} x2={BOX.right} y1={BOX.bottom} y2={BOX.bottom} />
        {model.y.values.map((value) => <g key={value}>
          <line x1={BOX.left - 6} x2={BOX.left} y1={model.yAt(value)} y2={model.yAt(value)} />
          <text x={BOX.left - 12} y={model.yAt(value) + 5} textAnchor="end">{compact(value)}</text>
        </g>)}
        {model.dates.map((tick) => <g key={tick.value}>
          <line x1={tick.x} x2={tick.x} y1={BOX.bottom} y2={BOX.bottom + 6} />
          <text x={tick.x} y={BOX.bottom + 28} textAnchor={tick.ratio === 0 ? 'start' : tick.ratio === 1 ? 'end' : 'middle'}>{tick.label}</text>
        </g>)}
      </g>
      <path d={model.line} className="xkcd-line" filter="url(#xkcdify)" />
      <g filter="url(#xkcdify)">{model.dots.map((point) => <circle key={`${point.date}-${point.count}`} className="xkcd-dot" cx={point.x} cy={point.y} r="4" />)}</g>
      {active && <>
        <line className="chart-crosshair" x1={active.x} x2={active.x} y1={BOX.top} y2={BOX.bottom} />
        <circle className="xkcd-active-dot" cx={active.x} cy={active.y} r="6" />
      </>}
      <rect x={BOX.left} y={BOX.top} width={BOX.right - BOX.left} height={BOX.bottom - BOX.top} fill="transparent" />
      <text className="xkcd-watermark" x={BOX.right} y="600" textAnchor="end">meteor-history.com</text>
    </svg>
    {active && <div className="chart-tooltip xkcd-tooltip" style={{ left: `${Math.min(86, Math.max(14, (active.x / WIDTH) * 100))}%`, top: `${Math.max(10, (active.y / HEIGHT) * 100 - 2)}%` }}>
      <strong>{active.count.toLocaleString('en')} stars</strong>
      <span>{new Intl.DateTimeFormat('en', { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(active.date))}</span>
    </div>}
  </div>;
}
