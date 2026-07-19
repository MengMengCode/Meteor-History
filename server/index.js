import 'dotenv/config';
import { config, validateConfig } from './config.js';
import { FileCache } from './cache.js';
import { GitHubClient } from './github.js';
import { createApp } from './app.js';
import { BackgroundSync } from './sync.js';

validateConfig();
const cache = new FileCache(config.cacheDir, config.cacheTtlMs);
await cache.init();
const github = new GitHubClient(config);
const sync = new BackgroundSync({
  cache,
  github,
  intervalMs: config.refreshIntervalMs,
  tokenConfigured: Boolean(config.token),
});
const { app } = createApp({ config, cache, sync });

const server = app.listen(config.port, config.host, () => {
  console.log(`Meteor History is running at http://${config.host}:${config.port}`);
  if (!config.token) console.warn('GITHUB_TOKEN is not configured. Copy .env.example to .env and add a fine-grained token.');
});
sync.start();

function shutdown() {
  sync.stop();
  server.close(() => process.exit(0));
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
