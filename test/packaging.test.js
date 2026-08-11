import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Docker runtime includes the shared chart modules required by the server', async () => {
  const dockerfile = await readFile(new URL('../Dockerfile', import.meta.url), 'utf8');
  assert.match(dockerfile, /COPY --chown=node:node src\/monotonePath\.js src\/dateTicks\.js \.\/src\//);
});

test('portable runtime includes the shared chart modules required by the server', async () => {
  const workflow = await readFile(new URL('../.github/workflows/build-release.yml', import.meta.url), 'utf8');
  assert.match(workflow, /cp src\/monotonePath\.js src\/dateTicks\.js "\$package_root\/app\/src\/"/);
});
