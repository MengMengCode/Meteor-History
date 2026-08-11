import test from 'node:test';
import assert from 'node:assert/strict';
import { BackgroundSync } from '../server/sync.js';

test('background sync writes repository index and histories without a user request', async () => {
  const writes = [];
  const repositories = [
    { owner: 'owner', repo: 'one', fullName: 'owner/one' },
    { owner: 'owner', repo: 'two', fullName: 'owner/two' },
  ];
  const cache = {
    setRepositories: async (value, profile, profileStats) => writes.push(['repositories', { value, profile, profileStats }]),
    get: async () => null,
    set: async (owner, repo, value) => writes.push([`${owner}/${repo}`, value]),
  };
  const github = {
    listRepositories: async () => repositories,
    fetchProfile: async () => ({ login: 'owner', bio: 'Actual GitHub bio' }),
    fetchProfileStats: async () => ({ totalStars: 15, rank: { level: 'A', percentile: 20 } }),
    canReadStarHistory: async () => true,
    fetchHistory: async (owner, repo) => ({ owner, repo, points: [] }),
  };
  const sync = new BackgroundSync({ cache, github, intervalMs: 60_000, tokenConfigured: true });

  const state = await sync.run();

  assert.equal(state.running, false);
  assert.equal(state.completed, 2);
  assert.deepEqual(writes.map(([name]) => name), ['repositories', 'owner/one', 'owner/two']);
  assert.equal(writes[0][1].profileStats.totalStars, 15);
});

test('background sync skips fresh JSON histories', async () => {
  let historyRequests = 0;
  const sync = new BackgroundSync({
    cache: {
      setRepositories: async () => {},
      get: async () => ({ stale: false }),
      set: async () => {},
    },
    github: {
      listRepositories: async () => [{ owner: 'owner', repo: 'repo', fullName: 'owner/repo' }],
      fetchProfile: async () => ({ login: 'owner', bio: 'Actual GitHub bio' }),
      fetchProfileStats: async () => ({ totalStars: 1, rank: { level: 'C', percentile: 100 } }),
      canReadStarHistory: async () => true,
      fetchHistory: async () => { historyRequests += 1; },
    },
    intervalMs: 60_000,
    tokenConfigured: true,
  });

  await sync.run();
  assert.equal(historyRequests, 0);
});

test('background sync excludes repositories without star-history token access', async () => {
  let indexedRepositories = [];
  const historyRequests = [];
  const sync = new BackgroundSync({
    cache: {
      setRepositories: async (repositories) => { indexedRepositories = repositories; },
      get: async () => null,
      set: async () => {},
    },
    github: {
      listRepositories: async () => [
        { owner: 'owner', repo: 'allowed', fullName: 'owner/allowed' },
        { owner: 'owner', repo: 'not-selected', fullName: 'owner/not-selected' },
      ],
      fetchProfile: async () => ({ login: 'owner' }),
      fetchProfileStats: async () => ({ totalStars: 1, rank: { level: 'C', percentile: 100 } }),
      canReadStarHistory: async (_owner, repo) => repo === 'allowed',
      fetchHistory: async (_owner, repo) => { historyRequests.push(repo); return { owner: 'owner', repo, points: [] }; },
    },
    intervalMs: 60_000,
    tokenConfigured: true,
  });

  const state = await sync.run();
  assert.deepEqual(indexedRepositories.map((repository) => repository.repo), ['allowed']);
  assert.deepEqual(historyRequests, ['allowed']);
  assert.equal(state.total, 1);
});

test('background sync keeps star histories updating when optional profile stats fail', async () => {
  const writes = [];
  const previousProfileStats = { totalStars: 7, rank: { level: 'B', percentile: 50 } };
  const sync = new BackgroundSync({
    cache: {
      getRepositories: async () => ({ profileStats: previousProfileStats }),
      setRepositories: async (_repositories, _profile, profileStats) => writes.push(['repositories', profileStats]),
      get: async () => null,
      set: async (_owner, _repo, history) => writes.push(['history', history]),
    },
    github: {
      listRepositories: async () => [{ owner: 'owner', repo: 'repo', fullName: 'owner/repo' }],
      fetchProfile: async () => ({ login: 'owner' }),
      fetchProfileStats: async () => { throw new Error('Resource not accessible by personal access token'); },
      canReadStarHistory: async () => true,
      fetchHistory: async () => ({ owner: 'owner', repo: 'repo', points: [] }),
    },
    intervalMs: 60_000,
    tokenConfigured: true,
  });

  const state = await sync.run();

  assert.equal(state.error, null);
  assert.match(state.profileStatsError, /personal access token/);
  assert.equal(state.completed, 1);
  assert.equal(writes[0][1], previousProfileStats);
  assert.equal(writes[1][0], 'history');
});

test('background sync preserves the repository index when every history access check fails', async () => {
  let repositoryIndexWrites = 0;
  const sync = new BackgroundSync({
    cache: {
      getRepositories: async () => ({ repositories: [{ owner: 'owner', repo: 'existing' }] }),
      setRepositories: async () => { repositoryIndexWrites += 1; },
    },
    github: {
      listRepositories: async () => [{ owner: 'owner', repo: 'repo', fullName: 'owner/repo' }],
      fetchProfile: async () => ({ login: 'owner' }),
      fetchProfileStats: async () => null,
      canReadStarHistory: async () => false,
    },
    intervalMs: 60_000,
    tokenConfigured: true,
  });

  await assert.rejects(sync.run(), /existing repository index was preserved/);
  assert.equal(repositoryIndexWrites, 0);
});
