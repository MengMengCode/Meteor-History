function historyKey(owner, repo) {
  return `history:${String(owner).toLowerCase()}/${String(repo).toLowerCase()}`;
}

export class KvCache {
  constructor(namespace, ttlMs) {
    this.namespace = namespace;
    this.ttlMs = ttlMs;
  }

  async init() {}

  async get(owner, repo, { allowStale = false } = {}) {
    const value = await this.namespace.get(historyKey(owner, repo), 'json');
    if (!value) return null;
    const age = Date.now() - new Date(value.fetchedAt).getTime();
    return { ...value, stale: age > this.ttlMs, usable: allowStale || age <= this.ttlMs };
  }

  async set(owner, repo, value) {
    await this.namespace.put(historyKey(owner, repo), JSON.stringify(value));
    return value;
  }

  async getRepositories() {
    return this.namespace.get('repositories', 'json');
  }

  async setRepositories(repositories, profile = null, profileStats = null) {
    const value = { fetchedAt: new Date().toISOString(), profile, profileStats, repositories };
    await this.namespace.put('repositories', JSON.stringify(value));
    return value;
  }

  async getSyncState() {
    return this.namespace.get('sync:state', 'json');
  }

  async setSyncState(value) {
    await this.namespace.put('sync:state', JSON.stringify(value));
    return value;
  }

  async entries() {
    const repositories = await this.getRepositories();
    const values = await Promise.all((repositories?.repositories || []).map((repository) => (
      this.get(repository.owner, repository.repo || repository.name, { allowStale: true })
    )));
    return values.filter(Boolean);
  }
}
