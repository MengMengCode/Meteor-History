import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

function cacheName(owner, repo) {
  const key = JSON.stringify([String(owner).toLowerCase(), String(repo).toLowerCase()]);
  return `${createHash('sha256').update(key).digest('hex')}.json`;
}

function legacyCacheName(owner, repo) {
  return `${owner}__${repo}`.toLowerCase().replace(/[^a-z0-9_.-]/g, '_') + '.json';
}

export class FileCache {
  constructor(directory, ttlMs) {
    this.directory = path.resolve(directory);
    this.ttlMs = ttlMs;
  }

  async init() {
    await fs.mkdir(this.directory, { recursive: true });
  }

  file(owner, repo) {
    const fileName = path.basename(cacheName(owner, repo));
    const target = path.resolve(this.directory, fileName);
    if (path.dirname(target) !== this.directory) throw new Error('Invalid cache file path.');
    return target;
  }

  legacyFile(owner, repo) {
    const fileName = path.basename(legacyCacheName(owner, repo));
    const target = path.resolve(this.directory, fileName);
    if (path.dirname(target) !== this.directory) throw new Error('Invalid legacy cache file path.');
    return target;
  }

  repositoriesFile() {
    return path.join(this.directory, 'repositories.json');
  }

  async get(owner, repo, { allowStale = false } = {}) {
    let value;
    try {
      value = JSON.parse(await fs.readFile(this.file(owner, repo), 'utf8'));
    } catch (error) {
      if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error;
      try {
        const legacy = JSON.parse(await fs.readFile(this.legacyFile(owner, repo), 'utf8'));
        const matches = String(legacy.owner).toLowerCase() === String(owner).toLowerCase()
          && String(legacy.repo).toLowerCase() === String(repo).toLowerCase()
          && Array.isArray(legacy.points);
        if (!matches) return null;
        value = legacy;
        await this.writeJson(this.file(owner, repo), legacy);
      } catch (legacyError) {
        if (legacyError.code === 'ENOENT' || legacyError instanceof SyntaxError) return null;
        throw legacyError;
      }
    }
    const age = Date.now() - new Date(value.fetchedAt).getTime();
    return { ...value, stale: age > this.ttlMs, usable: allowStale || age <= this.ttlMs };
  }

  async set(owner, repo, value) {
    const target = this.file(owner, repo);
    await this.writeJson(target, value);
    return value;
  }

  async getRepositories() {
    try {
      return JSON.parse(await fs.readFile(this.repositoriesFile(), 'utf8'));
    } catch (error) {
      if (error.code === 'ENOENT' || error instanceof SyntaxError) return null;
      throw error;
    }
  }

  async setRepositories(repositories, profile = null, profileStats = null) {
    const value = { fetchedAt: new Date().toISOString(), profile, profileStats, repositories };
    await this.writeJson(this.repositoriesFile(), value);
    return value;
  }

  async writeJson(target, value) {
    const temporary = `${target}.${process.pid}.tmp`;
    await fs.writeFile(temporary, JSON.stringify(value), 'utf8');
    await fs.rename(temporary, target);
  }

  async entries() {
    const files = await fs.readdir(this.directory).catch(() => []);
    const values = await Promise.all(files.filter((file) => file.endsWith('.json')).map(async (file) => {
      try {
        return JSON.parse(await fs.readFile(path.join(this.directory, file), 'utf8'));
      } catch {
        return null;
      }
    }));
    const unique = new Map();
    for (const value of values) {
      if (!value?.owner || !value?.repo || !Array.isArray(value.points)) continue;
      unique.set(`${String(value.owner).toLowerCase()}/${String(value.repo).toLowerCase()}`, value);
    }
    return [...unique.values()];
  }
}
