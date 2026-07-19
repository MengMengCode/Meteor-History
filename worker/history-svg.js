import xkcdFontData from 'xkcd-font/static/xkcd-script.woff';
import { monotonePath } from '../src/monotonePath.js';

function encodeFont(value) {
  const bytes = new Uint8Array(value);
  let binary = '';
  for (let index = 0; index < bytes.length; index += 8192) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 8192));
  }
  return btoa(binary);
}

const xkcdFont = encodeFont(xkcdFontData);
const escapeXml = (value) => String(value ?? '').replace(/[<>&"']/g, (char) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[char]));
const namedColors = {
  brightgreen: '#44cc11', green: '#97ca00', yellowgreen: '#a4a61d', yellow: '#dfb317', orange: '#fe7d37',
  red: '#e05d44', blue: '#007ec6', grey: '#555555', gray: '#555555', lightgrey: '#9f9f9f',
  lightgray: '#9f9f9f', blueviolet: '#8a2be2', pink: '#ff69b4', black: '#000000', white: '#ffffff', transparent: 'transparent',
};

function color(value, fallback) {
  if (typeof value !== 'string' || !value.trim()) return fallback;
  const candidate = value.trim().toLowerCase();
  if (namedColors[candidate]) return namedColors[candidate];
  const hex = candidate.replace(/^#/, '');
  return /^(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/.test(hex) ? `#${hex}` : fallback;
}

function number(value, fallback, min, max) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

function boolean(value, fallback = true) {
  if (value == null || value === '') return fallback;
  return !['0', 'false', 'no', 'off'].includes(String(value).toLowerCase());
}

const chartStyles = new Set(['xkcd', 'clean', 'minimal', 'bold', 'neon']);

function normalize(raw = {}) {
  const theme = ['light', 'dark', 'auto'].includes(raw.theme) ? raw.theme : 'light';
  const defaults = theme === 'dark'
    ? { background: '#0d1117', text: '#ffffff', muted: '#c9d1d9', line: '#ff6b6b' }
    : { background: '#ffffff', text: '#000000', muted: '#333333', line: '#dd4528' };
  return {
    theme,
    style: chartStyles.has(raw.style) ? raw.style : 'xkcd',
    width: number(raw.width, 900, 600, 1400),
    height: number(raw.height, 600, 400, 900),
    lineWidth: number(raw.lineWidth, 3, 1, 8),
    line: color(raw.color, defaults.line),
    background: color(raw.background, defaults.background),
    text: color(raw.textColor, defaults.text),
    muted: defaults.muted,
    showTitle: boolean(raw.showTitle),
    showLegend: boolean(raw.showLegend),
    showDots: boolean(raw.showDots, false),
  };
}

function compact(value) {
  return Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

function ticks(max, count = 5) {
  const safeMax = Math.max(1, max);
  const raw = safeMax / count;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const normalized = raw / magnitude;
  const step = (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) * magnitude;
  const top = Math.ceil(safeMax / step) * step;
  return { values: Array.from({ length: Math.ceil(top / step) + 1 }, (_, index) => index * step), top };
}

function updated(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC', year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true, timeZoneName: 'short',
  }).format(date);
}

export function renderHistorySvg(history, rawOptions = {}) {
  const options = normalize(rawOptions);
  const colors = { bg: options.background, text: options.text, muted: options.muted, line: options.line };
  const width = options.width;
  const height = options.height;
  const box = { left: 78, top: 92, right: width - 30, bottom: height - 60 };
  const points = history.points?.length ? history.points : [{ date: new Date().toISOString().slice(0, 10), count: 0 }];
  const start = new Date(points[0].date).getTime();
  const end = Math.max(start + 86_400_000, new Date(points.at(-1).date).getTime());
  const scaleX = (date) => box.left + ((new Date(date).getTime() - start) / (end - start)) * (box.right - box.left);
  const yTicks = ticks(Math.max(...points.map((point) => point.count)));
  const scaleY = (count) => box.bottom - (count / yTicks.top) * (box.bottom - box.top);
  const mapped = points.map((point) => ({ ...point, x: scaleX(point.date), y: scaleY(point.count) }));
  const line = monotonePath(mapped);
  const dotStep = Math.max(1, Math.ceil(mapped.length / 70));
  const dots = mapped.filter((_, index) => index % dotStep === 0 || index === mapped.length - 1);
  const dateTicks = Array.from({ length: 5 }, (_, index) => {
    const value = start + ((end - start) * index) / 4;
    return { x: box.left + ((box.right - box.left) * index) / 4, label: new Intl.DateTimeFormat('en', { year: 'numeric', month: 'short', timeZone: 'UTC' }).format(value) };
  });
  const xkcd = options.style === 'xkcd';
  const minimal = options.style === 'minimal';
  const bold = options.style === 'bold';
  const neon = options.style === 'neon';
  const axisFilter = xkcd ? ' filter="url(#xkcdify)"' : '';
  const lineFilter = xkcd ? ' filter="url(#xkcdify)"' : neon ? ' filter="url(#neon-glow)"' : '';
  const fontFace = xkcd ? `@font-face{font-family:xkcd;src:url(data:font/woff;base64,${xkcdFont}) format('woff')}` : '';
  const fontFamily = xkcd ? 'xkcd,"Comic Sans MS",cursive' : 'Inter,Arial,sans-serif';
  const axisStroke = minimal ? colors.muted : colors.text;
  const axisWidth = bold ? 2 : minimal ? 0.8 : 1.3;
  const axisOpacity = minimal ? 0.55 : 1;
  const effectiveLineWidth = bold ? Math.max(5, options.lineWidth) : neon ? Math.max(3.5, options.lineWidth) : options.lineWidth;
  const effects = `${xkcd ? '<filter id="xkcdify" x="-2%" y="-2%" width="104%" height="104%"><feTurbulence type="fractalNoise" baseFrequency="0.012" numOctaves="1" seed="7" result="noise"/><feDisplacementMap in="SourceGraphic" in2="noise" scale="1.1" xChannelSelector="R" yChannelSelector="G"/></filter>' : ''}${neon ? '<filter id="neon-glow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="2.7" result="coloredBlur"/><feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>' : ''}`;
  const autoThemeStyles = options.theme === 'auto' ? '@media(prefers-color-scheme:dark){.chart-background{fill:#0d1117}text{fill:#fff}.chart-axes{stroke:#c9d1d9}.chart-series{stroke:#ff6b6b}.legend-dot{fill:#ff6b6b}.dots{fill:#0d1117;stroke:#ff6b6b}.chart-meta{fill:#c9d1d9}}' : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc" data-style="${options.style}" data-theme="${options.theme}">
  <title id="title">${escapeXml(history.fullName)} Star History</title><desc id="desc">${escapeXml(history.fullName)} currently has ${history.summary.current} stars.</desc>
  <defs>${effects}</defs><rect class="chart-background" width="100%" height="100%" fill="${colors.bg}"/>
  <style>${fontFace}text{font-family:${fontFamily};fill:${colors.text}}.axis{font-size:12px;opacity:${axisOpacity}}.label{font-size:15px;opacity:${axisOpacity}}.title{font-size:${bold ? 28 : minimal ? 22 : 25}px;font-weight:${bold ? 750 : minimal ? 500 : 600}}${autoThemeStyles}</style>
  ${options.showTitle ? '<text class="title" x="28" y="38">Star History</text>' : ''}
  ${options.showLegend ? `<g class="legend" transform="translate(32 62)"><circle class="legend-dot" r="5" fill="${colors.line}"/><text x="13" y="5" font-size="13">${escapeXml(history.fullName)}</text></g>` : ''}
  <text class="label" x="${(box.left + box.right) / 2}" y="${height - 14}" text-anchor="middle">Date</text><text class="label" transform="translate(20 ${(box.top + box.bottom) / 2}) rotate(-90)" text-anchor="middle">GitHub Stars</text>
  <g class="chart-axes" stroke="${axisStroke}" stroke-width="${axisWidth}" stroke-opacity="${axisOpacity}" fill="none"${axisFilter}><line x1="${box.left}" y1="${box.top}" x2="${box.left}" y2="${box.bottom}"/><line x1="${box.left}" y1="${box.bottom}" x2="${box.right}" y2="${box.bottom}"/>${yTicks.values.map((value) => `<line x1="${box.left - 6}" y1="${scaleY(value)}" x2="${box.left}" y2="${scaleY(value)}"/>`).join('')}${dateTicks.map((tick) => `<line x1="${tick.x}" y1="${box.bottom}" x2="${tick.x}" y2="${box.bottom + 6}"/>`).join('')}</g>
  ${yTicks.values.map((value) => `<text class="axis" x="${box.left - 12}" y="${scaleY(value) + 4}" text-anchor="end">${compact(value)}</text>`).join('')}${dateTicks.map((tick) => `<text class="axis" x="${tick.x}" y="${box.bottom + 24}" text-anchor="middle">${tick.label}</text>`).join('')}
  <path class="chart-series" d="${line}" fill="none" stroke="${colors.line}" stroke-width="${effectiveLineWidth}" stroke-linecap="round" stroke-linejoin="round"${lineFilter}/>
  ${options.showDots ? `<g class="dots" fill="${colors.bg}" stroke="${colors.line}" stroke-width="2"${lineFilter}>${dots.map((point) => `<circle cx="${point.x}" cy="${point.y}" r="4"/>`).join('')}</g>` : ''}
  <text class="chart-meta" x="${width - 24}" y="28" text-anchor="end" font-size="11" fill="${colors.muted}">Updated ${escapeXml(updated(history.fetchedAt))}</text><text class="chart-meta" x="${width - 24}" y="${height - 14}" text-anchor="end" font-size="12" fill="${colors.muted}">meteor-history.com</text>
  </svg>`;
}
