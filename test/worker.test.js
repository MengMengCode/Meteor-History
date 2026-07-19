import test from 'node:test';
import assert from 'node:assert/strict';
import { workerConfig } from '../worker/config.js';
import { KvCache } from '../worker/kv-cache.js';
import { createWorkerSigner, hotlinkAllowed } from '../worker/security.js';

class MemoryKv {
  constructor() {
    this.values = new Map();
  }

  async get(key, type) {
    const value = this.values.get(key);
    if (value == null) return null;
    return type === 'json' ? JSON.parse(value) : value;
  }

  async put(key, value) {
    this.values.set(key, value);
  }
}

test('Cloudflare KV cache persists repository indexes and history JSON', async () => {
  const namespace = new MemoryKv();
  const cache = new KvCache(namespace, 60_000);
  const history = { owner: 'owner', repo: 'repo', fetchedAt: new Date().toISOString(), points: [], summary: { current: 0 } };

  await cache.setRepositories([{ owner: 'owner', repo: 'repo' }], { login: 'owner' });
  await cache.set('owner', 'repo', history);

  assert.equal((await cache.getRepositories()).profile.login, 'owner');
  assert.equal((await cache.get('OWNER', 'REPO')).source, undefined);
  assert.equal((await cache.entries()).length, 1);
});

test('Cloudflare configuration disables hotlink protection without a public URL', async () => {
  const config = await workerConfig({
    GITHUB_TOKEN: 'token',
    EMBED_SIGNING_KEY: 'x'.repeat(32),
    PUBLIC_BASE_URL: '',
    EMBED_HOTLINK_PROTECTION: 'true',
  });

  assert.equal(config.publicBaseUrl, '');
  assert.equal(config.embedHotlinkProtection, false);
});

test('Cloudflare signer and Referer protection match Worker embed URLs', async () => {
  const signer = createWorkerSigner('x'.repeat(32));
  const signature = await signer.sign('Owner', 'Repo');
  assert.equal(await signer.verify('owner', 'repo', signature), true);
  assert.equal(await signer.verify('owner', 'other', signature), false);

  const request = new Request('https://cards.example.com/api/embed/owner/repo.svg', {
    headers: { referer: 'https://github.com/owner/repo' },
  });
  assert.equal(hotlinkAllowed(request, ['github.com'], true), true);
  assert.equal(hotlinkAllowed(new Request(request.url, { headers: { referer: 'https://evil.example/page' } }), ['github.com'], true), false);
});
