import test from 'node:test';
import assert from 'node:assert/strict';
import { GitHubClient } from '../server/github.js';
import { calculateRank } from '../server/rank.js';

test('GitHub profile stats map GraphQL user activity data', async () => {
  const client = new GitHubClient({
    token: 'test-token',
    apiVersion: '2022-11-28',
    fetchImpl: async (url, init) => {
      assert.equal(url, 'https://api.github.com/graphql');
      assert.equal(init.method, 'POST');
      return new Response(JSON.stringify({ data: { user: {
        name: 'Owner Name',
        login: 'owner',
        contributionsCollection: { totalCommitContributions: 101, totalPullRequestReviewContributions: 7 },
        repositoriesContributedTo: { totalCount: 8 },
        pullRequests: { totalCount: 9 },
        openIssues: { totalCount: 4 },
        closedIssues: { totalCount: 6 },
        followers: { totalCount: 11 },
        repositories: {
          totalCount: 2,
          nodes: [{ name: 'one', stargazers: { totalCount: 12 } }, { name: 'two', stargazers: { totalCount: 3 } }],
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      } } }), { status: 200, headers: { 'content-type': 'application/json' } });
    },
  });

  const stats = await client.fetchProfileStats('owner');
  assert.equal(stats.name, 'Owner Name');
  assert.equal(stats.totalStars, 15);
  assert.equal(stats.totalCommits, 101);
  assert.equal(stats.totalPRs, 9);
  assert.equal(stats.totalIssues, 10);
  assert.equal(stats.totalReviews, 7);
  assert.equal(stats.contributedTo, 8);
  assert.match(stats.rank.level, /^(?:S|A\+?|A-|B\+?|B-|C\+?|C)$/);
});

test('rank grading keeps GitHub Readme Stats semantics', () => {
  assert.deepEqual(calculateRank({ commits: 0, prs: 0, issues: 0, reviews: 0, stars: 0, followers: 0 }), { level: 'C', percentile: 100 });
  assert.equal(calculateRank({ commits: 10000, prs: 1000, issues: 1000, reviews: 100, stars: 10000, followers: 10000 }).level, 'S');
});

test('star history uses GraphQL pagination after GitHub restricted the REST stargazers endpoint', async () => {
  const requests = [];
  const client = new GitHubClient({
    token: 'metadata-token',
    apiVersion: '2022-11-28',
    fetchImpl: async (url, init) => {
      requests.push({ url, body: init.body ? JSON.parse(init.body) : null });
      if (url.endsWith('/repos/owner/repo')) {
        return Response.json({
          owner: { login: 'owner', avatar_url: 'https://example.com/avatar.png' },
          name: 'repo',
          full_name: 'owner/repo',
          description: null,
          html_url: 'https://github.com/owner/repo',
          private: false,
          stargazers_count: 3,
          created_at: '2026-08-01T00:00:00Z',
        });
      }
      const after = JSON.parse(init.body).variables.after;
      return Response.json({ data: {
        rateLimit: { remaining: after ? 57 : 58, resetAt: '2026-08-11T16:00:00Z' },
        repository: { stargazers: after ? {
          totalCount: 3,
          edges: [{ starredAt: '2026-08-03T00:00:00Z' }],
          pageInfo: { hasNextPage: false, endCursor: null },
        } : {
          totalCount: 3,
          edges: [{ starredAt: '2026-08-02T00:00:00Z' }, { starredAt: '2026-08-02T12:00:00Z' }],
          pageInfo: { hasNextPage: true, endCursor: 'page-2' },
        } },
      } });
    },
  });

  const history = await client.fetchHistory('owner', 'repo');

  assert.equal(history.stars, 3);
  assert.equal(history.summary.current, 3);
  assert.equal(history.rateLimit.remaining, 57);
  assert.deepEqual(requests.map(({ url }) => url), [
    'https://api.github.com/repos/owner/repo',
    'https://api.github.com/graphql',
    'https://api.github.com/graphql',
  ]);
  assert.deepEqual(requests.slice(1).map(({ body }) => body.variables.after), [null, 'page-2']);
});

test('public repository metadata retries anonymously when GitHub rejects the token with 401', async () => {
  const authenticated = [];
  const client = new GitHubClient({
    token: 'partially-working-token',
    apiVersion: '2022-11-28',
    fetchImpl: async (_url, init) => {
      const hasToken = Boolean(init.headers.Authorization);
      authenticated.push(hasToken);
      return hasToken
        ? Response.json({ message: 'Bad credentials' }, { status: 401 })
        : Response.json([]);
    },
  });

  await client.publicRepositoryRequest('/repos/owner/repo');
  assert.deepEqual(authenticated, [true, false]);
});

test('private star-history probe uses GraphQL and reports forbidden repositories', async () => {
  const client = new GitHubClient({
    token: 'metadata-token',
    apiVersion: '2026-03-10',
    includePrivateRepositories: true,
    fetchImpl: async () => Response.json({
      data: null,
      errors: [{ type: 'FORBIDDEN', message: 'Resource not accessible by personal access token' }],
    }),
  });

  assert.equal(await client.canReadStarHistory('owner', 'private-repo'), false);
});
