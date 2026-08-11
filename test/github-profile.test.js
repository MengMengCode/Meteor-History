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

test('public star history retries without a fine-grained token that cannot access the repository', async () => {
  const requests = [];
  const client = new GitHubClient({
    token: 'restricted-token',
    apiVersion: '2022-11-28',
    fetchImpl: async (url, init) => {
      const authenticated = Boolean(init.headers.Authorization);
      requests.push({ url, authenticated });
      if (authenticated) {
        return new Response(JSON.stringify({ message: 'Resource not accessible by personal access token' }), {
          status: 403,
          headers: { 'content-type': 'application/json', 'x-ratelimit-remaining': '100' },
        });
      }
      if (url.endsWith('/repos/owner/repo')) {
        return Response.json({
          owner: { login: 'owner', avatar_url: 'https://example.com/avatar.png' },
          name: 'repo',
          full_name: 'owner/repo',
          description: null,
          html_url: 'https://github.com/owner/repo',
          private: false,
          stargazers_count: 1,
          created_at: '2026-08-01T00:00:00Z',
        });
      }
      return Response.json([{ starred_at: '2026-08-02T00:00:00Z' }], {
        headers: { 'x-ratelimit-remaining': '58', 'x-ratelimit-reset': '1786449600' },
      });
    },
  });

  const history = await client.fetchHistory('owner', 'repo');

  assert.equal(history.stars, 1);
  assert.equal(history.summary.current, 1);
  assert.deepEqual(requests.map(({ authenticated }) => authenticated), [true, false, true, false]);
});

test('public repository requests retry anonymously when GitHub rejects the token with 401', async () => {
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

  assert.equal(await client.canReadStarHistory('owner', 'repo'), true);
  assert.deepEqual(authenticated, [true, false]);
});
