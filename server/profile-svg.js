import escapeHtml from 'escape-html';

const escapeXml = (value) => escapeHtml(String(value ?? ''));

// Popular presets from anuraghazra/github-readme-stats, with a practical border
// color for themes that do not define one upstream.
const themes = {
  auto: { title: '#2f80ed', text: '#434d58', icon: '#4c71f2', ring: '#2f80ed', border: '#e4e2e2', background: '#fffefe' },
  default: { title: '#2f80ed', text: '#434d58', icon: '#4c71f2', ring: '#2f80ed', border: '#e4e2e2', background: '#fffefe' },
  dark: { title: '#ffffff', text: '#9f9f9f', icon: '#79ff97', ring: '#ffffff', border: '#30363d', background: '#151515' },
  radical: { title: '#fe428e', text: '#a9fef7', icon: '#f8d847', ring: '#fe428e', border: '#fe428e', background: '#141321' },
  merko: { title: '#abd200', text: '#68b587', icon: '#b7d364', ring: '#abd200', border: '#26372a', background: '#0a0f0b' },
  gruvbox: { title: '#fabd2f', text: '#8ec07c', icon: '#fe8019', ring: '#fabd2f', border: '#504945', background: '#282828' },
  tokyonight: { title: '#70a5fd', text: '#38bdae', icon: '#bf91f3', ring: '#70a5fd', border: '#343b58', background: '#1a1b27' },
  onedark: { title: '#e4bf7a', text: '#df6d74', icon: '#8eb573', ring: '#e4bf7a', border: '#4b5263', background: '#282c34' },
  cobalt: { title: '#e683d9', text: '#75eeb2', icon: '#0480ef', ring: '#e683d9', border: '#285f8f', background: '#193549' },
  synthwave: { title: '#e2e9ec', text: '#e5289e', icon: '#ef8539', ring: '#e2e9ec', border: '#6b3f75', background: '#2b213a' },
  highcontrast: { title: '#e7f216', text: '#ffffff', icon: '#00ffff', ring: '#e7f216', border: '#ffffff', background: '#000000' },
  dracula: { title: '#ff6e96', text: '#f8f8f2', icon: '#79dafa', ring: '#ff6e96', border: '#6272a4', background: '#282a36' },
  transparent: { title: '#006aff', text: '#417e87', icon: '#0579c3', ring: '#006aff', border: '#e4e2e2', background: '#ffffff00' },
};

function color(value, fallback) {
  if (typeof value !== 'string' || !value.trim()) return fallback;
  if (value === 'transparent' || value === '00000000') return 'transparent';
  const hex = value.trim().replace(/^#/, '');
  return /^(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(hex) ? `#${hex.toLowerCase()}` : fallback;
}

function number(value, fallback, min, max) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

function boolean(value, fallback) {
  if (value == null || value === '') return fallback;
  return !['0', 'false', 'no', 'off'].includes(String(value).toLowerCase());
}

function formatNumber(value, options) {
  if (options.numberFormat === 'long') return Number(value).toLocaleString('en-US');
  return Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: options.numberPrecision,
  }).format(value);
}

function list(value, allowed) {
  return new Set(String(value || '').split(',').map((item) => item.trim()).filter((item) => allowed.has(item)));
}

export function normalizeProfileOptions(raw = {}) {
  const theme = themes[raw.theme] ? raw.theme : 'default';
  const palette = themes[theme];
  return {
    theme,
    title: color(raw.title_color, palette.title),
    text: color(raw.text_color, palette.text),
    icon: color(raw.icon_color, palette.icon),
    ring: color(raw.ring_color, palette.ring),
    border: color(raw.border_color, palette.border),
    background: color(raw.bg_color, palette.background),
    hideBorder: boolean(raw.hide_border, false),
    hideTitle: boolean(raw.hide_title, false),
    hideRank: boolean(raw.hide_rank, false),
    showIcons: boolean(raw.show_icons, false),
    textBold: boolean(raw.text_bold, true),
    disableAnimations: boolean(raw.disable_animations, false),
    radius: number(raw.border_radius, 4.5, 0, 24),
    width: number(raw.card_width, 450, 420, 800),
    lineHeight: number(raw.line_height, 25, 20, 35),
    numberFormat: raw.number_format === 'long' ? 'long' : 'short',
    numberPrecision: number(raw.number_precision, 1, 0, 2),
    rankIcon: ['default', 'github', 'percentile'].includes(raw.rank_icon) ? raw.rank_icon : 'default',
    customTitle: typeof raw.custom_title === 'string' ? raw.custom_title.slice(0, 80) : '',
    hiddenStats: list(raw.hide, new Set(['stars', 'commits', 'prs', 'issues', 'contribs'])),
    shownStats: list(raw.show, new Set(['reviews'])),
  };
}

export function renderProfileSvg(profile, rawOptions = {}) {
  const options = normalizeProfileOptions(rawOptions);
  const profileStats = profile.stats || {};
  const rank = profileStats.rank || { level: 'C', percentile: 100 };
  const width = options.width;
  const iconX = 25;
  const textX = options.showIcons ? 48 : 25;
  const icons = {
    stars: 'M8 .25a.75.75 0 01.673.418l1.882 3.815 4.21.612a.75.75 0 01.416 1.279l-3.046 2.97.719 4.192a.75.75 0 01-1.088.791L8 12.347l-3.766 1.98a.75.75 0 01-1.088-.79l.72-4.194L.818 6.374a.75.75 0 01.416-1.28l4.21-.611L7.327.668A.75.75 0 018 .25z',
    commits: 'M1.643 3.143L.427 1.927A.25.25 0 000 2.104V5.75c0 .138.112.25.25.25h3.646a.25.25 0 00.177-.427L2.715 4.215a6.5 6.5 0 11-1.18 4.458.75.75 0 10-1.493.154 8.001 8.001 0 101.6-5.684zM7.75 4a.75.75 0 01.75.75v2.992l2.028.812a.75.75 0 01-.557 1.392l-2.5-1A.75.75 0 017 8.25v-3.5A.75.75 0 017.75 4z',
    prs: 'M7.177 3.073L9.573.677A.25.25 0 0110 .854v4.792a.25.25 0 01-.427.177L7.177 3.427a.25.25 0 010-.354zM3.75 2.5a.75.75 0 100 1.5.75.75 0 000-1.5zm-2.25.75a2.25 2.25 0 113 2.122v5.256a2.251 2.251 0 11-1.5 0V5.372A2.25 2.25 0 011.5 3.25zM11 2.5h-1V4h1a1 1 0 011 1v5.628a2.251 2.251 0 101.5 0V5A2.5 2.5 0 0011 2.5zm1 10.25a.75.75 0 111.5 0 .75.75 0 01-1.5 0zM3.75 12a.75.75 0 100 1.5.75.75 0 000-1.5z',
    issues: 'M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM0 8a8 8 0 1116 0A8 8 0 010 8zm9 3a1 1 0 11-2 0 1 1 0 012 0zm-.25-6.25a.75.75 0 00-1.5 0v3.5a.75.75 0 001.5 0v-3.5z',
    contribs: 'M2 2.5A2.5 2.5 0 014.5 0h8.75a.75.75 0 01.75.75v12.5a.75.75 0 01-.75.75h-2.5a.75.75 0 110-1.5h1.75v-2h-8a1 1 0 00-.714 1.7.75.75 0 01-1.072 1.05A2.495 2.495 0 012 11.5v-9zm10.5-1V9h-8c-.356 0-.694.074-1 .208V2.5a1 1 0 011-1h8z',
    reviews: 'M8 2c1.981 0 3.671.992 4.933 2.078 1.27 1.091 2.187 2.345 2.637 3.023a1.62 1.62 0 010 1.798c-.45.678-1.367 1.932-2.637 3.023C11.67 13.008 9.981 14 8 14c-1.981 0-3.671-.992-4.933-2.078C1.797 10.83.88 9.576.43 8.898a1.62 1.62 0 010-1.798c.45-.677 1.367-1.931 2.637-3.022C4.33 2.992 6.019 2 8 2z',
  };
  const commitsLabel = `Total Commits (${profileStats.commitsYear || new Date().getUTCFullYear()})`;
  const stats = [
    { id: 'stars', label: 'Total Stars Earned', value: profileStats.totalStars || 0 },
    { id: 'commits', label: commitsLabel, value: profileStats.totalCommits || 0 },
    { id: 'prs', label: 'Total PRs', value: profileStats.totalPRs || 0 },
    { id: 'issues', label: 'Total Issues', value: profileStats.totalIssues || 0 },
    { id: 'contribs', label: 'Contributed to', value: profileStats.contributedTo || 0 },
    ...(options.shownStats.has('reviews') ? [{ id: 'reviews', label: 'Total Reviews', value: profileStats.totalReviews || 0 }] : []),
  ].filter((stat) => !options.hiddenStats.has(stat.id));
  const baseHeight = Math.max(45 + (stats.length + 1) * options.lineHeight, options.hideRank ? 0 : stats.length ? 150 : 180);
  const height = Math.max(120, baseHeight - (options.hideTitle ? 30 : 0));
  const bodyStart = options.hideTitle ? 37 : 67;
  const rankX = width - 70;
  const rankY = height / 2 + (options.hideTitle ? 0 : 3);
  const statRows = stats.map((stat, index) => {
    const y = bodyStart + index * options.lineHeight;
    const icon = options.showIcons
      ? `<svg class="stat-icon" x="${iconX}" y="${y - 12}" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path fill-rule="evenodd" d="${icons[stat.id]}"/></svg>`
      : '';
    return `<g class="stat-row" style="animation-delay:${(index + 3) * 150}ms">${icon}<text class="stat" x="${textX}" y="${y}"><tspan>${stat.label}: </tspan><tspan class="stat-value">${escapeXml(formatNumber(stat.value, options))}</tspan></text></g>`;
  }).join('');
  const circumference = 251.33;
  const rankDashOffset = circumference * (Math.max(0, Math.min(100, rank.percentile)) / 100);
  const animationStyles = options.disableAnimations ? '' : `
    @keyframes fadeIn{from{opacity:0;transform:translateX(-4px)}to{opacity:1;transform:translateX(0)}}
    @keyframes ringIn{from{stroke-dashoffset:${circumference}}to{stroke-dashoffset:${rankDashOffset}}}
    .stat-row{opacity:0;animation:fadeIn .35s ease forwards}.rank-ring{animation:ringIn .8s ease forwards}`;
  const rankContent = options.rankIcon === 'percentile'
    ? `<text class="rank-top" y="-8" text-anchor="middle">Top</text><text class="rank-percent" y="14" text-anchor="middle">${Number(rank.percentile).toFixed(1)}%</text>`
    : options.rankIcon === 'github'
      ? '<path class="rank-github" transform="translate(-30 -30) scale(3.75)" d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 01-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 010 8c0-4.42 3.58-8 8-8Z"/>'
      : `<text class="rank-value" y="6" text-anchor="middle">${escapeXml(rank.level)}</text>`;
  const title = options.customTitle || `${profileStats.name || profile.owner}'s GitHub Stats`;
  const backgroundIsTransparent = options.background === 'transparent' || /^#[0-9a-f]{6}00$/i.test(options.background);
  const autoThemeStyles = options.theme === 'auto' ? `@media(prefers-color-scheme:dark){.card-background{fill:#151515;stroke:#30363d}.title{fill:#fff}.stat,.rank-value,.rank-top,.rank-percent,.watermark{fill:#9f9f9f}.stat-icon{fill:#79ff97}.rank-rim,.rank-ring{stroke:#fff}.rank-github{fill:#9f9f9f}}` : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="profile-title profile-desc" data-theme="${options.theme}">
  <title id="profile-title">${escapeXml(title)}</title>
  <desc id="profile-desc">${profileStats.totalStars || 0} stars, ${profileStats.totalCommits || 0} commits, ${profileStats.totalPRs || 0} pull requests, rank ${escapeXml(rank.level)}.</desc>
  <rect class="card-background${options.hideBorder ? ' no-border' : ''}${backgroundIsTransparent ? ' transparent' : ''}" x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="${options.radius}" fill="${options.background}" stroke="${options.hideBorder ? 'transparent' : options.border}"/>
  <style>text{font-family:"Segoe UI",Ubuntu,"Helvetica Neue",Arial,sans-serif}.title{font-size:18px;font-weight:600;fill:${options.title}}.stat{font-size:14px;font-weight:${options.textBold ? 600 : 400};fill:${options.text}}.stat-value{font-weight:700}.stat-icon{fill:${options.icon}}.rank-rim{fill:none;stroke:${options.ring};stroke-width:6;opacity:.2}.rank-ring{fill:none;stroke:${options.ring};stroke-width:6;stroke-linecap:round;stroke-dasharray:${circumference};stroke-dashoffset:${rankDashOffset};opacity:.8}.rank-value{font-size:24px;font-weight:800;fill:${options.text}}.rank-top{font-size:14px;fill:${options.text}}.rank-percent{font-size:16px;font-weight:800;fill:${options.text}}.rank-github{fill:${options.text}}.watermark{font-size:9px;fill:${options.text};opacity:.45}${animationStyles}${autoThemeStyles}.card-background.no-border{stroke:transparent}.card-background.transparent{fill:transparent}</style>
  ${options.hideTitle ? '' : `<text class="title" x="25" y="35">${escapeXml(title)}</text>`}
  ${statRows}
  ${options.hideRank ? '' : `<g class="rank" transform="translate(${rankX} ${rankY})"><circle class="rank-rim" r="40"/><circle class="rank-ring" r="40" transform="rotate(-90)"/>${rankContent}</g>`}
  <text class="watermark" x="${width - 12}" y="${height - 9}" text-anchor="end">meteor-history.com</text>
  </svg>`;
}
