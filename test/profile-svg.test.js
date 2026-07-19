import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeProfileOptions, renderProfileSvg } from '../server/profile-svg.js';

const profile = {
  owner: 'owner/<unsafe>',
  updatedAtLabel: 'Jul 19, 2026, 03:05 AM GMT+8',
  stats: {
    name: 'owner/<unsafe>',
    totalStars: 15,
    totalCommits: 123,
    totalPRs: 4,
    totalIssues: 5,
    totalReviews: 7,
    contributedTo: 6,
    commitsYear: 2026,
    rank: { level: 'A+', percentile: 12.5 },
  },
};

test('profile SVG renders GitHub user stats and escapes profile data', () => {
  const svg = renderProfileSvg(profile);
  assert.match(svg, /15 stars, 123 commits, 4 pull requests, rank A\+/);
  assert.match(svg, /Total Stars Earned/);
  assert.match(svg, /Total Commits \(2026\)/);
  assert.match(svg, /Total PRs/);
  assert.match(svg, /Total Issues/);
  assert.match(svg, /Contributed to/);
  assert.match(svg, /class="rank-value"[^>]*>A\+<\/text>/);
  assert.match(svg, /class="watermark"[^>]*>meteor-history\.com<\/text>/);
  assert.doesNotMatch(svg, /Public Repositories|Top Repository|Repositories with Stars/);
  assert.match(svg, /owner\/&lt;unsafe&gt;/);
  assert.doesNotMatch(svg, /owner\/<unsafe>/);
});

test('profile SVG supports GitHub Readme Stats-style safe options', () => {
  const svg = renderProfileSvg(profile, {
    theme: 'radical',
    title_color: '00ff99',
    ring_color: 'ff00ff',
    bg_color: '112233',
    hide_border: 'true',
    border_radius: '18',
    card_width: '700',
    show_icons: 'false',
  });
  assert.match(svg, /width="700" height="195"/);
  assert.match(svg, /rx="18" fill="#112233" stroke="transparent"/);
  assert.match(svg, /fill:#00ff99/);
  assert.match(svg, /stroke:#ff00ff/);
  assert.doesNotMatch(svg, /<svg x=/);
});

test('profile SVG contextually escapes a hostile custom title', () => {
  const svg = renderProfileSvg(profile, { custom_title: '<script>alert("xss")</script>' });
  assert.doesNotMatch(svg, /<script>|<\/script>/);
  assert.match(svg, /&lt;script&gt;alert\(&quot;xss&quot;\)&lt;\/script&gt;/);
});

test('profile SVG supports stats-card layout controls', () => {
  const svg = renderProfileSvg(profile, {
    theme: 'dracula',
    hide_title: 'true',
    hide_rank: 'true',
    text_bold: 'false',
    line_height: '30',
    number_format: 'long',
    rank_icon: 'percentile',
    show: 'reviews',
    disable_animations: 'true',
  });
  assert.match(svg, /width="450" height="225"/);
  assert.match(svg, /data-theme="dracula"/);
  assert.match(svg, /font-weight:400/);
  assert.doesNotMatch(svg, /class="title"/);
  assert.doesNotMatch(svg, /class="rank"/);
  assert.doesNotMatch(svg, /@keyframes/);
  assert.match(svg, /Total Reviews/);
});

test('profile SVG auto theme follows the viewer color scheme', () => {
  const svg = renderProfileSvg(profile, { theme: 'auto' });
  assert.match(svg, /data-theme="auto"/);
  assert.match(svg, /@media\(prefers-color-scheme:dark\)/);
  assert.match(svg, /\.card-background\{fill:#151515;stroke:#30363d\}/);
  assert.match(svg, /\.stat-icon\{fill:#79ff97\}/);
});

test('profile option normalization rejects unsafe colors and limits sizes', () => {
  const options = normalizeProfileOptions({
    title_color: 'red" onload="alert(1)',
    bg_color: 'url(javascript:alert(1))',
    card_width: '9999',
    border_radius: '-5',
    line_height: '999',
    number_precision: '-1',
  });
  assert.equal(options.title, '#2f80ed');
  assert.equal(options.background, '#fffefe');
  assert.equal(options.width, 800);
  assert.equal(options.radius, 0);
  assert.equal(options.lineHeight, 35);
  assert.equal(options.numberPrecision, 0);
});
