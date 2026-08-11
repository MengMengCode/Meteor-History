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

test('file cache migrates validated legacy history files to SHA-256 paths', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'meteor-history-legacy-cache-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const cache = new FileCache(directory, 60_000);
  await cache.init();
  const history = {
    owner: 'Owner',
    repo: 'Repo',
    fetchedAt: new Date().toISOString(),
    points: [{ date: '2026-08-11', count: 2 }],
    summary: { current: 2 },
  };
  const legacyPath = path.join(directory, 'owner__repo.json');
  await fs.writeFile(legacyPath, JSON.stringify(history), 'utf8');

  const migrated = await cache.get('owner', 'repo');

  assert.equal(migrated.summary.current, 2);
  assert.equal(JSON.parse(await fs.readFile(cache.file('owner', 'repo'), 'utf8')).repo, 'Repo');
  assert.equal((await cache.entries()).length, 1);
});
