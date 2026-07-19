import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server/app.js';
import { createEmbedSigner } from '../server/security.js';
import { validateConfig } from '../server/config.js';

const history = {
  owner: 'owner',
  repo: 'repo',
  fullName: 'owner/repo',
  fetchedAt: '2026-07-19T00:00:00Z',
  points: [{ date: '2026-07-19', count: 1 }],
  summary: { current: 1 },
};

function fixtures(overrides = {}) {
  return {
    config: {
      token: 'configured',
      cacheTtlMs: 60_000,
      refreshIntervalMs: 60_000,
      publicBaseUrl: '',
      distDir: 'missing',
      embedSigningKey: 'a-secure-test-key-with-at-least-32-characters',
      embedRateLimitPerMinute: 20,
      apiRateLimitPerMinute: 20,
      embedAllowedHosts: ['github.com'],
      ...overrides,
    },
    cache: {
      entries: async () => [history],
      getRepositories: async () => ({
        profile: { login: 'owner', bio: 'Actual GitHub bio' },
        profileStats: { name: 'Owner', totalStars: 1, totalCommits: 2, totalPRs: 3, totalIssues: 4, totalReviews: 1, contributedTo: 5, commitsYear: 2026, rank: { level: 'B', percentile: 55 } },
        repositories: [history],
      }),
      get: async () => ({ ...history, stale: false }),
    },
    sync: { snapshot: () => ({ running: false }) },
  };
}

async function listen(app, t) {
  const server = app.listen(0);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  await new Promise((resolve) => server.once('listening', resolve));
  return `http://127.0.0.1:${server.address().port}`;
}

test('embed signatures are stable and reject tampering', () => {
  const signer = createEmbedSigner('a-secure-test-key-with-at-least-32-characters');
  const signature = signer.sign('Owner', 'Repo');
  assert.equal(signer.verify('owner', 'repo', signature), true);
  assert.equal(signer.verify('owner', 'other', signature), false);
  assert.equal(signer.verify('owner', 'repo', `${signature}x`), false);
});

test('signed image URL works without exposing the signing key', async (t) => {
  const values = fixtures();
  const { app } = createApp(values);
  const baseUrl = await listen(app, t);
  const response = await fetch(`${baseUrl}/api/history/owner/repo`);
  const body = await response.json();

  assert.match(body.embedUrl, /[?&]sig=/);
  assert.doesNotMatch(JSON.stringify(body), new RegExp(values.config.embedSigningKey));
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.match(response.headers.get('content-security-policy'), /default-src 'self'/);
  assert.equal(response.headers.get('x-powered-by'), null);
  assert.equal((await fetch(body.embedUrl)).status, 200);
  assert.equal((await fetch(`${baseUrl}/api/embed/owner/repo.svg`)).status, 403);

  const repositories = await fetch(`${baseUrl}/api/repositories`).then((value) => value.json());
  assert.match(repositories.profileCard.embedUrl, /[?&]sig=/);
  assert.equal((await fetch(repositories.profileCard.embedUrl)).status, 200);
  const hostileTitleUrl = `${repositories.profileCard.embedUrl}&custom_title=${encodeURIComponent('<script>alert("xss")</script>')}`;
  const hostileTitleResponse = await fetch(hostileTitleUrl);
  const hostileTitleSvg = await hostileTitleResponse.text();
  assert.equal(hostileTitleResponse.status, 200);
  assert.match(hostileTitleResponse.headers.get('content-security-policy'), /sandbox/);
  assert.doesNotMatch(hostileTitleSvg, /<script>|<\/script>/);
});

test('image endpoint blocks unapproved Referer hosts and rate-limit abuse', async (t) => {
  const values = fixtures({ embedRateLimitPerMinute: 3 });
  const { app } = createApp(values);
  const baseUrl = await listen(app, t);
  const signature = createEmbedSigner(values.config.embedSigningKey).sign('owner', 'repo');
  const url = `${baseUrl}/api/embed/owner/repo.svg?sig=${signature}`;

  assert.equal((await fetch(url, { headers: { referer: 'https://evil.example/page' } })).status, 403);
  assert.equal((await fetch(url, { headers: { referer: 'https://github.com/owner/repo' } })).status, 200);
  assert.equal((await fetch(url)).status, 200);
  const limited = await fetch(url);
  assert.equal(limited.status, 429);
  assert.ok(limited.headers.get('retry-after'));
});

test('all HTTP routes are protected by the global request limiter', async (t) => {
  const values = fixtures({ apiRateLimitPerMinute: 1 });
  const { app } = createApp(values);
  const baseUrl = await listen(app, t);

  assert.equal((await fetch(`${baseUrl}/api/health`)).status, 200);
  const limited = await fetch(`${baseUrl}/api/health`);
  assert.equal(limited.status, 429);
  assert.ok(limited.headers.get('retry-after'));
});

test('image hotlink protection can be disabled explicitly', async (t) => {
  const values = fixtures({ embedHotlinkProtection: false });
  const { app } = createApp(values);
  const baseUrl = await listen(app, t);
  const signature = createEmbedSigner(values.config.embedSigningKey).sign('owner', 'repo');
  const response = await fetch(`${baseUrl}/api/embed/owner/repo.svg?sig=${signature}`, {
    headers: { referer: 'https://external.example/page' },
  });

  assert.equal(response.status, 200);
});

test('production configuration requires independent secrets and HTTPS', () => {
  assert.throws(() => validateConfig({ nodeEnv: 'production', token: '', embedSigningKey: '', publicBaseUrl: '' }), /GITHUB_TOKEN/);
  assert.throws(() => validateConfig({ nodeEnv: 'production', token: 'token', embedSigningKey: '', publicBaseUrl: '' }), /EMBED_SIGNING_KEY/);
  assert.throws(() => validateConfig({ nodeEnv: 'production', token: 'token', embedSigningKey: 'x'.repeat(32), publicBaseUrl: 'http:\/\/example.com' }), /HTTPS/);
  assert.doesNotThrow(() => validateConfig({ nodeEnv: 'production', token: 'token', embedSigningKey: 'x'.repeat(32), publicBaseUrl: 'https:\/\/example.com' }));
});

test('unexpected server errors are redacted from API responses', async (t) => {
  const values = fixtures({ embedSigningKey: '' });
  values.cache.get = async () => { throw new Error('secret filesystem path C:\\private\\cache'); };
  const originalError = console.error;
  console.error = () => {};
  t.after(() => { console.error = originalError; });
  const { app } = createApp(values);
  const baseUrl = await listen(app, t);
  const response = await fetch(`${baseUrl}/api/history/owner/repo`);
  const body = await response.json();

  assert.equal(response.status, 500);
  assert.equal(body.error, 'The server encountered an unexpected error.');
  assert.doesNotMatch(JSON.stringify(body), /secret filesystem|private|cache/);
});

test('private repository metadata and charts are hidden by default', async (t) => {
  const values = fixtures({ embedSigningKey: '', includePrivateRepositories: false });
  const privateHistory = { ...history, private: true };
  values.cache.getRepositories = async () => ({ repositories: [privateHistory] });
  values.cache.get = async () => privateHistory;
  const { app } = createApp(values);
  const baseUrl = await listen(app, t);

  const repositories = await fetch(`${baseUrl}/api/repositories`).then((response) => response.json());
  assert.deepEqual(repositories.repositories, []);
  const response = await fetch(`${baseUrl}/api/history/owner/repo`);
  assert.equal(response.status, 404);
  assert.equal((await response.json()).code, 'REPOSITORY_HIDDEN');
});
