export class BackgroundSync {
  constructor({ cache, github, intervalMs, tokenConfigured }) {
    this.cache = cache;
    this.github = github;
    this.intervalMs = intervalMs;
    this.tokenConfigured = tokenConfigured;
    this.timer = null;
    this.state = {
      running: false,
      phase: 'idle',
      completed: 0,
      total: 0,
      lastStartedAt: null,
      lastCompletedAt: null,
      nextRunAt: null,
      error: null,
      profileStatsError: null,
    };
  }

  snapshot() {
    return { ...this.state };
  }

  start() {
    if (!this.tokenConfigured || this.timer) return;
    this.run().catch((error) => console.error('Initial background sync failed:', error));
    this.timer = setInterval(() => {
      this.run().catch((error) => console.error('Scheduled background sync failed:', error));
    }, this.intervalMs);
    this.timer.unref();
    this.state.nextRunAt = new Date(Date.now() + this.intervalMs).toISOString();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async run() {
    if (this.state.running || !this.tokenConfigured) return this.snapshot();
    this.state = {
      ...this.state,
      running: true,
      phase: 'repositories',
      completed: 0,
      total: 0,
      lastStartedAt: new Date().toISOString(),
      error: null,
      profileStatsError: null,
    };

    try {
      const [repositoryCandidates, profile] = await Promise.all([
        this.github.listRepositories(),
        this.github.fetchProfile(),
      ]);
      const previousIndex = await this.cache.getRepositories?.();
      let profileStats = previousIndex?.profileStats || null;
      try {
        profileStats = await this.github.fetchProfileStats(profile.login);
      } catch (error) {
        this.state.profileStatsError = error.message;
        console.warn(`Profile stats sync skipped: ${error.message}`);
      }
      const repositories = [];
      for (const repository of repositoryCandidates) {
        if (await this.github.canReadStarHistory(repository.owner, repository.repo)) repositories.push(repository);
      }
      await this.cache.setRepositories(repositories, profile, profileStats);
      this.state.total = repositories.length;
      this.state.phase = 'histories';

      for (const repository of repositories) {
        try {
          const cached = await this.cache.get(repository.owner, repository.repo, { allowStale: true });
          if (!cached || cached.stale) {
            const history = await this.github.fetchHistory(repository.owner, repository.repo);
            await this.cache.set(repository.owner, repository.repo, history);
          }
        } catch (error) {
          console.warn(`Background sync skipped ${repository.fullName}: ${error.message}`);
          if (error.details?.code === 'RATE_LIMITED') {
            this.state.error = error.message;
            break;
          }
        } finally {
          this.state.completed += 1;
        }
      }

      this.state.lastCompletedAt = new Date().toISOString();
      this.state.nextRunAt = new Date(Date.now() + this.intervalMs).toISOString();
    } catch (error) {
      this.state.error = error.message;
      throw error;
    } finally {
      this.state.running = false;
      this.state.phase = 'idle';
    }
    return this.snapshot();
  }
}
