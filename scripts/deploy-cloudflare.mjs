import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const wranglerCli = path.join(projectRoot, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const wranglerArguments = ['deploy', ...process.argv.slice(2)];
const dryRun = wranglerArguments.includes('--dry-run');

function stripAnsi(value) {
  return value.replace(/[\u001B\u009B][[\]()#;?]*(?:(?:(?:[a-zA-Z\d]*(?:;[-a-zA-Z\d\/#&.:=?%@~_]+)*)?\u0007)|(?:(?:\d{1,4}(?:[;:]\d{0,4})*)?[\dA-PR-TZcf-nq-uy=><~]))/g, '');
}

function deploymentUrl(output) {
  const urls = stripAnsi(output).match(/https:\/\/[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev/gi);
  if (urls?.length) return urls.at(-1).replace(/\/$/, '');
  const configured = String(process.env.PUBLIC_BASE_URL || '').trim().replace(/\/$/, '');
  return configured.startsWith('https://') ? configured : '';
}

function runWrangler() {
  return new Promise((resolve, reject) => {
    let output = '';
    const child = spawn(process.execPath, [wranglerCli, ...wranglerArguments], {
      cwd: projectRoot,
      env: process.env,
      stdio: ['inherit', 'pipe', 'pipe'],
    });
    for (const stream of [child.stdout, child.stderr]) {
      stream.on('data', (chunk) => {
        const text = chunk.toString();
        output += text;
        (stream === child.stdout ? process.stdout : process.stderr).write(text);
      });
    }
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve(output);
      else reject(new Error(`Wrangler deploy failed with exit code ${code}.`));
    });
  });
}

async function requestJson(url) {
  const response = await fetch(url, {
    headers: { accept: 'application/json', 'user-agent': 'meteor-history-deploy' },
  });
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}.`);
  return response.json();
}

async function bootstrap(url) {
  console.log(`Starting initial repository synchronization through ${url}`);
  await requestJson(`${url}/api/repositories`);
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 2_000));
    const health = await requestJson(`${url}/api/health`);
    if (health.sync?.error) {
      console.warn(`Initial synchronization reported an error: ${health.sync.error}`);
      return;
    }
    if (health.sync?.lastCompletedAt) {
      console.log(`Initial synchronization completed with ${health.cachedRepositories} repositories.`);
      return;
    }
  }
  console.warn('Initial synchronization is still running. The Worker will continue it in the background.');
}

try {
  const output = await runWrangler();
  if (!dryRun) {
    const url = deploymentUrl(output);
    if (url) {
      try {
        await bootstrap(url);
      } catch (error) {
        console.warn(`Deployment succeeded, but the initial synchronization probe could not reach the Worker: ${error.message}`);
        console.warn('The first public request or the one-minute Cron Trigger will start synchronization instead.');
      }
    } else {
      console.warn('Deployment succeeded, but no public Worker URL was found. The one-minute Cron Trigger will start synchronization.');
    }
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
