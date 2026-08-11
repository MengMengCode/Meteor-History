import { buildDailyHistory, summarize } from './history.js';
import { calculateRank } from './rank.js';

export class GitHubError extends Error {
  constructor(message, status = 500, details = {}) {
    super(message);
    this.name = 'GitHubError';
    this.status = status;
    this.details = details;
  }
}

export class GitHubClient {
  constructor({ token, apiVersion, includePrivateRepositories = false, fetchImpl = fetch }) {
    this.token = token;
    this.apiVersion = apiVersion;
    this.fetch = fetchImpl;
    this.includePrivateRepositories = includePrivateRepositories;
  }

  headers(accept = 'application/vnd.github+json', authenticated = true) {
    return {
      Accept: accept,
      'User-Agent': 'meteor-history/1.0',
      'X-GitHub-Api-Version': this.apiVersion,
      ...(authenticated && this.token ? { Authorization: `Bearer ${this.token}` } : {}),
    };
  }

  async request(path, { accept, signal, anonymous = false } = {}) {
    if (!this.token && !anonymous) {
      throw new GitHubError('GitHub token is not configured. Set GITHUB_TOKEN in .env and restart the server.', 503, { code: 'TOKEN_MISSING' });
    }
    const response = await this.fetch(`https://api.github.com${path}`, {
      headers: this.headers(accept, !anonymous),
      signal,
    });
    const remaining = Number(response.headers.get('x-ratelimit-remaining'));
    const resetAt = Number(response.headers.get('x-ratelimit-reset')) * 1000;
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      if ((response.status === 403 || response.status === 429) && remaining === 0) {
        throw new GitHubError('GitHub API rate limit reached. Try again after the limit resets.', 429, { code: 'RATE_LIMITED', resetAt });
      }
      if (response.status === 401) {
        throw new GitHubError('GitHub token is invalid or expired. Update GITHUB_TOKEN.', 401, { code: 'BAD_TOKEN' });
      }
      if (response.status === 403 || response.status === 404) {
        throw new GitHubError('Star history is unavailable for this repository. Confirm that the token has Metadata read access.', response.status, { code: 'REPO_FORBIDDEN' });
      }
      throw new GitHubError(body.message || 'GitHub API request failed.', response.status, { code: 'GITHUB_ERROR' });
    }
    return { data: await response.json(), remaining, resetAt };
  }

  async publicRepositoryRequest(path, options = {}) {
    try {
      return await this.request(path, options);
    } catch (error) {
      const publicFallback = error instanceof GitHubError && ['BAD_TOKEN', 'REPO_FORBIDDEN'].includes(error.details?.code);
      if (this.includePrivateRepositories || !publicFallback) throw error;
      return this.request(path, { ...options, anonymous: true });
    }
  }

  async graphql(query, variables, signal) {
    const response = await this.fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: { ...this.headers(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables }),
      signal,
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body.errors?.length) {
      const message = body.errors?.[0]?.message || body.message || 'GitHub GraphQL request failed.';
      throw new GitHubError(message, response.ok ? 502 : response.status, { code: 'GITHUB_GRAPHQL_ERROR' });
    }
    return body.data;
  }

  async listRepositories(signal) {
    const repositories = [];
    for (let page = 1; page <= 10; page += 1) {
      const { data } = await this.request(`/user/repos?affiliation=owner,collaborator&sort=updated&per_page=100&page=${page}`, { signal });
      repositories.push(...data.filter((repo) => this.includePrivateRepositories || !repo.private).map((repo) => ({
        fullName: repo.full_name,
        owner: repo.owner.login,
        name: repo.name,
        repo: repo.name,
        description: repo.description,
        stars: repo.stargazers_count,
        forks: repo.forks_count,
        private: repo.private,
        avatarUrl: repo.owner.avatar_url,
        updatedAt: repo.updated_at,
      })));
      if (data.length < 100) break;
    }
    return repositories;
  }

  async fetchProfile(signal) {
    const { data } = await this.request('/user', { signal });
    return {
      login: data.login,
      name: data.name,
      bio: data.bio,
      avatarUrl: data.avatar_url,
      htmlUrl: data.html_url,
    };
  }

  async fetchProfileStats(login, signal) {
    const year = new Date().getUTCFullYear();
    const query = `
      query ProfileStats($login: String!, $after: String, $startTime: DateTime!) {
        user(login: $login) {
          name
          login
          contributionsCollection(from: $startTime) {
            totalCommitContributions
            totalPullRequestReviewContributions
          }
          repositoriesContributedTo(first: 1, contributionTypes: [COMMIT, ISSUE, PULL_REQUEST, REPOSITORY]) { totalCount }
          pullRequests(first: 1) { totalCount }
          openIssues: issues(states: OPEN) { totalCount }
          closedIssues: issues(states: CLOSED) { totalCount }
          followers { totalCount }
          repositories(first: 100, ownerAffiliations: OWNER, orderBy: { direction: DESC, field: STARGAZERS }, after: $after) {
            totalCount
            nodes { name stargazers { totalCount } }
            pageInfo { hasNextPage endCursor }
          }
        }
      }
    `;
    let after = null;
    let user = null;
    let totalStars = 0;
    do {
      const data = await this.graphql(query, {
        login,
        after,
        startTime: `${year}-01-01T00:00:00Z`,
      }, signal);
      if (!data.user) throw new GitHubError('GitHub user was not found.', 404, { code: 'USER_NOT_FOUND' });
      user = data.user;
      totalStars += user.repositories.nodes.reduce((sum, repository) => sum + repository.stargazers.totalCount, 0);
      after = user.repositories.pageInfo.hasNextPage ? user.repositories.pageInfo.endCursor : null;
    } while (after);

    const stats = {
      name: user.name || user.login,
      totalStars,
      totalCommits: user.contributionsCollection.totalCommitContributions,
      totalPRs: user.pullRequests.totalCount,
      totalIssues: user.openIssues.totalCount + user.closedIssues.totalCount,
      totalReviews: user.contributionsCollection.totalPullRequestReviewContributions,
      contributedTo: user.repositoriesContributedTo.totalCount,
      followers: user.followers.totalCount,
      totalRepositories: user.repositories.totalCount,
      commitsYear: year,
    };
    return { ...stats, rank: calculateRank({
      commits: stats.totalCommits,
      prs: stats.totalPRs,
      issues: stats.totalIssues,
      reviews: stats.totalReviews,
      stars: stats.totalStars,
      followers: stats.followers,
    }) };
  }

  async canReadStarHistory(owner, repo, signal) {
    try {
      await this.publicRepositoryRequest(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/stargazers?per_page=1`, {
        accept: 'application/vnd.github.star+json',
        signal,
      });
      return true;
    } catch (error) {
      if (error instanceof GitHubError && error.details?.code === 'REPO_FORBIDDEN') return false;
      throw error;
    }
  }

  async fetchHistory(owner, repo, signal) {
    const { data: metadata } = await this.publicRepositoryRequest(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`, { signal });
    const stars = [];
    let remaining = null;
    let resetAt = null;
    const pageCount = Math.ceil(metadata.stargazers_count / 100);
    for (let page = 1; page <= Math.max(1, pageCount); page += 1) {
      const result = await this.publicRepositoryRequest(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/stargazers?per_page=100&page=${page}`, {
        accept: 'application/vnd.github.star+json',
        signal,
      });
      stars.push(...result.data);
      remaining = result.remaining;
      resetAt = result.resetAt;
      if (result.data.length < 100) break;
    }
    const points = buildDailyHistory(stars, metadata.created_at, metadata.stargazers_count);
    return {
      owner: metadata.owner.login,
      repo: metadata.name,
      fullName: metadata.full_name,
      description: metadata.description,
      htmlUrl: metadata.html_url,
      avatarUrl: metadata.owner.avatar_url,
      private: metadata.private,
      stars: metadata.stargazers_count,
      fetchedAt: new Date().toISOString(),
      rateLimit: { remaining, resetAt },
      points,
      summary: summarize(points),
    };
  }
}
