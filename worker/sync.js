import { GitHubClient } from '../server/github.js';
import { KvCache } from './kv-cache.js';
import { workerConfig } from './config.js';

function nextRun(intervalMs) {
  return new Date(Date.now() + intervalMs).toISOString();
}

export async function runScheduledSync(env, { force = false } = {}) {
  const config = await workerConfig(env);
  const cache = new KvCache(env.METEOR_HISTORY_DATA, config.cacheTtlMs);
  const previous = await cache.getSyncState();
  const lastCompleted = new Date(previous?.lastCompletedAt || 0).getTime();
  if (!force && Number.isFinite(lastCompleted) && Date.now() - lastCompleted < config.refreshIntervalMs) {
    return previous;
  }
  if (!config.token) throw new Error('GITHUB_TOKEN is not configured.');

  const state = {
    running: true,
    phase: 'repositories',
    completed: 0,
    total: 0,
    lastStartedAt: new Date().toISOString(),
    lastCompletedAt: previous?.lastCompletedAt || null,
    nextRunAt: nextRun(config.refreshIntervalMs),
    error: null,
  };
  await cache.setSyncState(state);
  const github = new GitHubClient({ ...config, fetchImpl: (...args) => fetch(...args) });

  try {
    const [repositoryCandidates, profile] = await Promise.all([
      github.listRepositories(),
      github.fetchProfile(),
    ]);
    const profileStats = await github.fetchProfileStats(profile.login);
    const repositories = [];
    for (const repository of repositoryCandidates) {
      if (await github.canReadStarHistory(repository.owner, repository.repo)) repositories.push(repository);
    }
    await cache.setRepositories(repositories, profile, profileStats);
    state.phase = 'histories';
    state.total = repositories.length;
    await cache.setSyncState(state);

    for (const repository of repositories) {
      try {
        const cached = await cache.get(repository.owner, repository.repo, { allowStale: true });
        if (!cached || cached.stale) {
          const history = await github.fetchHistory(repository.owner, repository.repo);
          await cache.set(repository.owner, repository.repo, history);
        }
      } catch (error) {
        console.warn(`Scheduled sync skipped ${repository.fullName}: ${error.message}`);
        if (error.details?.code === 'RATE_LIMITED') {
          state.error = error.message;
          break;
        }
      } finally {
        state.completed += 1;
        await cache.setSyncState(state);
      }
    }

    state.lastCompletedAt = new Date().toISOString();
    state.nextRunAt = nextRun(config.refreshIntervalMs);
  } catch (error) {
    state.error = error.message;
    throw error;
  } finally {
    state.running = false;
    state.phase = 'idle';
    await cache.setSyncState(state);
  }
  return state;
}
