import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { FileCache } from '../server/cache.js';

test('file cache converts untrusted repository names to root-contained SHA-256 paths', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'meteor-history-cache-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const cache = new FileCache(directory, 60_000);
  await cache.init();

  const target = cache.file('../../outside', '..\\..\\secret');
  assert.equal(path.dirname(target), path.resolve(directory));
  assert.match(path.basename(target), /^[a-f0-9]{64}\.json$/);

  const value = {
    owner: '../../outside',
    repo: '..\\..\\secret',
    fetchedAt: new Date().toISOString(),
    points: [],
    summary: { current: 0 },
  };
  await cache.set(value.owner, value.repo, value);
  assert.equal((await cache.get(value.owner, value.repo)).repo, value.repo);
});
